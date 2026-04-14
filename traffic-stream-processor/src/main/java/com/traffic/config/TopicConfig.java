package com.traffic.config;

import lombok.extern.slf4j.Slf4j;
import org.apache.kafka.clients.admin.NewTopic;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.config.TopicBuilder;

/**
 * Ensures required Kafka topics exist before the Streams application starts.
 *
 * <p>Spring's {@link org.springframework.kafka.core.KafkaAdmin} picks up every
 * {@link NewTopic} bean and creates the topic (or verifies it already exists)
 * during application startup — <em>before</em> {@code @EnableKafkaStreams} initialises
 * the Streams client.  This prevents the {@code MissingSourceTopicException} that
 * occurs when the stream processor starts before the traffic-simulator has had a
 * chance to create {@code traffic.raw}.
 */
@Slf4j
@Configuration
public class TopicConfig {

    @Value("${traffic.topics.input:traffic.raw}")
    private String inputTopic;

    @Value("${traffic.topics.output:traffic.analyzed}")
    private String outputTopic;

    /** Source topic — consumed by this processor, produced by traffic-simulator. */
    @Bean
    public NewTopic trafficRawTopic() {
        log.info("Ensuring topic exists: {}", inputTopic);
        return TopicBuilder.name(inputTopic)
                .partitions(1)
                .replicas(1)
                .build();
    }

    /** Output topic — produced by this processor, consumed by traffic-api + alert-engine. */
    @Bean
    public NewTopic trafficAnalyzedTopic() {
        log.info("Ensuring topic exists: {}", outputTopic);
        return TopicBuilder.name(outputTopic)
                .partitions(1)
                .replicas(1)
                .build();
    }
}
