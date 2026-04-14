package com.traffic.alert.consumer;

import com.traffic.alert.model.AlertEvent;
import com.traffic.alert.rule.AlertRuleEngine;
import com.traffic.alert.sink.ClickHouseAlertSink;
import com.traffic.alert.webhook.WebhookNotifier;
import com.traffic.TrafficAnalyzedEvent;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

/**
 * Consumes each analyzed event, applies the rule engine, and:
 * <ul>
 *   <li>Publishes an {@link AlertEvent} to {@code traffic.alerts} (JSON)</li>
 *   <li>Persists the alert to ClickHouse via {@link ClickHouseAlertSink}</li>
 *   <li>Optionally sends a webhook notification via {@link WebhookNotifier}</li>
 * </ul>
 *
 * <p>{@link KafkaTemplate} is Spring Kafka's high-level producer — it handles
 * serialization, async send with callbacks, and metrics automatically.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class AnalyzedEventConsumer {

    private final AlertRuleEngine ruleEngine;
    private final KafkaTemplate<String, AlertEvent> kafkaTemplate;
    private final ClickHouseAlertSink clickHouseSink;
    private final WebhookNotifier webhookNotifier;

    @Value("${traffic.topics.output}")
    private String alertsTopic;

    @KafkaListener(topics = "${traffic.topics.input}", groupId = "traffic-alert-engine")
    public void consume(ConsumerRecord<String, TrafficAnalyzedEvent> record) {
        TrafficAnalyzedEvent event = record.value();

        ruleEngine.evaluate(event).ifPresent(alert -> {
            log.info("[{}] {} — {}", alert.getSeverity(), alert.getRoadId(), alert.getMessage());

            // Publish alert to Kafka (fire-and-forget with async callback)
            kafkaTemplate.send(alertsTopic, alert.getRoadId(), alert)
                    .whenComplete((result, ex) -> {
                        if (ex != null) {
                            log.error("Failed to publish alert for road {}: {}", alert.getRoadId(), ex.getMessage());
                        }
                    });

            // Persist to ClickHouse
            clickHouseSink.insert(alert);

            // Send webhook notification (Slack/Discord/Teams) if configured
            webhookNotifier.notifyIfEligible(alert);
        });
    }
}
