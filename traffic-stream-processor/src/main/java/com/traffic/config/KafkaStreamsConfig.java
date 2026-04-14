package com.traffic.config;

import com.traffic.TrafficAnalyzedEvent;
import com.traffic.TrafficEvent;
import com.traffic.processor.TrafficAggregation;
import com.traffic.processor.TrafficAggregationSerde;
import com.traffic.sink.ClickHouseSink;
import io.confluent.kafka.streams.serdes.avro.SpecificAvroSerde;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.kafka.common.serialization.Serdes;
import org.apache.kafka.streams.KeyValue;
import org.apache.kafka.streams.StreamsBuilder;
import org.apache.kafka.streams.kstream.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.annotation.EnableKafkaStreams;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;

/**
 * Defines the Kafka Streams topology as a Spring @Bean.
 *
 * <p>Key Kafka Streams concepts demonstrated here:
 * <ul>
 *   <li><b>KStream</b> — unbounded stream of records read from a topic</li>
 *   <li><b>KeyedStream / groupByKey</b> — groups records with the same key (roadId)</li>
 *   <li><b>TimeWindows</b> — fixed-size tumbling windows; each window closes after `windowSize`
 *       plus a grace period that accepts slightly late events</li>
 *   <li><b>Windowed aggregation</b> — accumulates vehicle counts and speed sums per window</li>
 *   <li><b>Suppress</b> — emits only the final result when the window closes (not on every update)</li>
 *   <li><b>SpecificAvroSerde</b> — deserializes/serializes Avro records using Schema Registry</li>
 * </ul>
 */
@Slf4j
@Configuration
@RequiredArgsConstructor
public class KafkaStreamsConfig {

    private final ClickHouseSink clickHouseSink;

    @Value("${traffic.topics.input}")
    private String inputTopic;

    @Value("${traffic.topics.output}")
    private String outputTopic;

    @Value("${traffic.window.size-seconds}")
    private int windowSizeSeconds;

    @Value("${traffic.congestion.speed-threshold-kmh}")
    private double congestionThreshold;

    @Value("${spring.kafka.streams.properties.schema.registry.url}")
    private String schemaRegistryUrl;

    @Bean
    public KStream<String, TrafficEvent> trafficStream(StreamsBuilder builder) {
        // Avro SerDes that auto-register/resolve schemas via Schema Registry
        Map<String, String> serdeConfig = Map.of("schema.registry.url", schemaRegistryUrl);

        SpecificAvroSerde<TrafficEvent> eventSerde = new SpecificAvroSerde<>();
        eventSerde.configure(serdeConfig, false);

        SpecificAvroSerde<TrafficAnalyzedEvent> analyzedSerde = new SpecificAvroSerde<>();
        analyzedSerde.configure(serdeConfig, false);

        Duration windowSize = Duration.ofSeconds(windowSizeSeconds);
        // Grace period: accept events up to 5s late before closing the window
        Duration gracePeriod = Duration.ofSeconds(5);

        // 1. Read raw events from Kafka
        KStream<String, TrafficEvent> stream = builder.stream(
                inputTopic,
                Consumed.with(Serdes.String(), eventSerde)
        );

        // 2. Group by roadId (key), then aggregate into tumbling windows
        stream
            .groupByKey(Grouped.with(Serdes.String(), eventSerde))
            .windowedBy(TimeWindows.ofSizeAndGrace(windowSize, gracePeriod))
            .aggregate(
                TrafficAggregation::new,                          // initializer
                (roadId, event, agg) -> agg.add(event),          // aggregator
                Materialized.with(Serdes.String(), new TrafficAggregationSerde())
            )
            // 3. Suppress intermediate results — emit once when window closes
            .suppress(Suppressed.untilWindowCloses(Suppressed.BufferConfig.unbounded()))
            // 4. Convert windowed KTable back to a stream
            .toStream()
            // 5. Map each window to a TrafficAnalyzedEvent
            .map((windowedKey, agg) -> {
                String roadId = windowedKey.key();
                long windowStart = windowedKey.window().start();
                long windowEnd = windowedKey.window().end();

                double avgSpeed = agg.getCount() > 0
                        ? agg.getSpeedSum() / agg.getCount()
                        : 0.0;
                boolean congested = avgSpeed < congestionThreshold;

                TrafficAnalyzedEvent analyzed = TrafficAnalyzedEvent.newBuilder()
                        .setRoadId(roadId)
                        .setRoadName(agg.getRoadName())
                        .setWindowStart(Instant.ofEpochMilli(windowStart))
                        .setWindowEnd(Instant.ofEpochMilli(windowEnd))
                        .setTotalVehicles(agg.getVehicleSum())
                        .setAvgSpeed(avgSpeed)
                        .setCongested(congested)
                        .build();

                log.info("Window closed — road={} vehicles={} avgSpeed={} congested={}",
                        roadId, agg.getVehicleSum(), String.format("%.1f", avgSpeed), congested);

                // 6. Side-effect: persist to ClickHouse
                clickHouseSink.insert(analyzed);

                return KeyValue.pair(roadId, analyzed);
            })
            // 7. Publish to output topic
            .to(outputTopic, Produced.with(Serdes.String(), analyzedSerde));

        return stream;
    }
}
