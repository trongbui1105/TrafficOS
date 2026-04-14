package com.traffic.alert.rule;

import com.traffic.alert.model.AlertEvent;
import com.traffic.TrafficAnalyzedEvent;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.Optional;

/**
 * Evaluates speed-based alerting rules against each analyzed event.
 *
 * <p>Rules (configurable via application.yml / env vars):
 * <ul>
 *   <li>avg_speed &lt; high_threshold  → HIGH severity</li>
 *   <li>avg_speed &lt; medium_threshold → MEDIUM severity</li>
 *   <li>avg_speed &lt; low_threshold    → LOW severity</li>
 *   <li>Otherwise → no alert</li>
 * </ul>
 *
 * <p>Returning {@code Optional.empty()} means the event doesn't trigger an alert.
 * This clean separation of rule logic from Kafka I/O makes the engine easy to test.
 */
@Component
public class AlertRuleEngine {

    @Value("${traffic.alert.high-threshold-kmh:10.0}")
    private double highThreshold;

    @Value("${traffic.alert.medium-threshold-kmh:20.0}")
    private double mediumThreshold;

    @Value("${traffic.alert.low-threshold-kmh:30.0}")
    private double lowThreshold;

    public Optional<AlertEvent> evaluate(TrafficAnalyzedEvent event) {
        double speed = event.getAvgSpeed();
        String roadId = event.getRoadId().toString();
        String roadName = event.getRoadName().toString();

        AlertEvent.Severity severity;
        String message;

        if (speed < highThreshold) {
            severity = AlertEvent.Severity.HIGH;
            message = String.format("Severe congestion on %s — avg speed %.1f km/h", roadName, speed);
        } else if (speed < mediumThreshold) {
            severity = AlertEvent.Severity.MEDIUM;
            message = String.format("Moderate congestion on %s — avg speed %.1f km/h", roadName, speed);
        } else if (speed < lowThreshold) {
            severity = AlertEvent.Severity.LOW;
            message = String.format("Slow traffic on %s — avg speed %.1f km/h", roadName, speed);
        } else {
            return Optional.empty(); // traffic is flowing normally
        }

        return Optional.of(AlertEvent.builder()
                .roadId(roadId)
                .roadName(roadName)
                .severity(severity)
                .message(message)
                .triggeredAt(Instant.now())
                .build());
    }
}
