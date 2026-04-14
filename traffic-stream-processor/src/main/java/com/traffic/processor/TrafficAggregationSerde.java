package com.traffic.processor;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.kafka.common.serialization.Deserializer;
import org.apache.kafka.common.serialization.Serde;
import org.apache.kafka.common.serialization.Serializer;

/**
 * Custom Serde for {@link TrafficAggregation} stored in Kafka Streams state stores.
 *
 * <p>Uses Jackson JSON — simple and human-readable for debugging via {@code kafka-console-consumer}.
 * In production you could switch to Avro or Protobuf for compactness.
 */
public class TrafficAggregationSerde implements Serde<TrafficAggregation> {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Override
    public Serializer<TrafficAggregation> serializer() {
        return (topic, data) -> {
            try {
                return MAPPER.writeValueAsBytes(data);
            } catch (Exception e) {
                throw new RuntimeException("Failed to serialize TrafficAggregation", e);
            }
        };
    }

    @Override
    public Deserializer<TrafficAggregation> deserializer() {
        return (topic, data) -> {
            try {
                return MAPPER.readValue(data, TrafficAggregation.class);
            } catch (Exception e) {
                throw new RuntimeException("Failed to deserialize TrafficAggregation", e);
            }
        };
    }
}
