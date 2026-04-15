package com.traffic.processor;

import org.apache.kafka.common.serialization.Deserializer;
import org.apache.kafka.common.serialization.Serializer;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class TrafficAggregationSerdeTest {

    @Test
    void roundTripsAggregationThroughJson() {
        TrafficAggregation original = new TrafficAggregation();
        original.setRoadName("Nguyen Hue");
        original.setVehicleSum(42);
        original.setSpeedSum(123.45);
        original.setCount(5);

        TrafficAggregationSerde serde = new TrafficAggregationSerde();
        Serializer<TrafficAggregation> ser = serde.serializer();
        Deserializer<TrafficAggregation> de = serde.deserializer();

        byte[] bytes = ser.serialize("topic", original);
        assertNotNull(bytes);
        assertTrue(bytes.length > 0);

        TrafficAggregation decoded = de.deserialize("topic", bytes);
        assertEquals(original.getRoadName(), decoded.getRoadName());
        assertEquals(original.getVehicleSum(), decoded.getVehicleSum());
        assertEquals(original.getSpeedSum(), decoded.getSpeedSum(), 1e-9);
        assertEquals(original.getCount(), decoded.getCount());
    }

    @Test
    void deserializerRejectsMalformedBytes() {
        TrafficAggregationSerde serde = new TrafficAggregationSerde();
        assertThrows(RuntimeException.class,
                () -> serde.deserializer().deserialize("topic", new byte[]{1, 2, 3}));
    }
}
