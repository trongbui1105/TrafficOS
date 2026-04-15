package com.traffic.processor;

import com.traffic.TrafficEvent;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.junit.jupiter.api.Assertions.*;

class TrafficAggregationTest {

    private static TrafficEvent event(String roadName, int count, double speed) {
        return TrafficEvent.newBuilder()
                .setEventType("TRAFFIC_DENSITY")
                .setRoadId("R001")
                .setRoadName(roadName)
                .setVehicleCount(count)
                .setAvgSpeed(speed)
                .setTimestamp(Instant.now())
                .build();
    }

    @Test
    void emptyAggregationHasZeroCounters() {
        TrafficAggregation agg = new TrafficAggregation();
        assertEquals(0, agg.getVehicleSum());
        assertEquals(0.0, agg.getSpeedSum());
        assertEquals(0, agg.getCount());
        assertEquals("", agg.getRoadName());
    }

    @Test
    void addAccumulatesVehiclesAndSpeed() {
        TrafficAggregation agg = new TrafficAggregation();
        agg.add(event("Nguyen Hue", 10, 30.0));
        agg.add(event("Nguyen Hue", 15, 40.0));
        agg.add(event("Nguyen Hue", 5, 20.0));

        assertEquals(30, agg.getVehicleSum());
        assertEquals(90.0, agg.getSpeedSum(), 1e-9);
        assertEquals(3, agg.getCount());
        assertEquals("Nguyen Hue", agg.getRoadName());
    }

    @Test
    void addReturnsSelfForFluentChaining() {
        TrafficAggregation agg = new TrafficAggregation();
        assertSame(agg, agg.add(event("Le Loi", 1, 10.0)));
    }

    @Test
    void averageSpeedComputableFromSums() {
        TrafficAggregation agg = new TrafficAggregation();
        agg.add(event("R", 10, 20.0));
        agg.add(event("R", 10, 60.0));
        double avg = agg.getSpeedSum() / agg.getCount();
        assertEquals(40.0, avg, 1e-9);
    }
}
