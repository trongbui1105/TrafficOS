package com.traffic.alert.rule;

import com.traffic.TrafficAnalyzedEvent;
import com.traffic.alert.model.AlertEvent;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Instant;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;

class AlertRuleEngineTest {

    private AlertRuleEngine engine;

    @BeforeEach
    void setUp() {
        engine = new AlertRuleEngine();
        // @Value fields aren't injected in plain unit tests — set defaults via reflection.
        ReflectionTestUtils.setField(engine, "highThreshold", 10.0);
        ReflectionTestUtils.setField(engine, "mediumThreshold", 20.0);
        ReflectionTestUtils.setField(engine, "lowThreshold", 30.0);
    }

    private static TrafficAnalyzedEvent evt(double speed) {
        Instant now = Instant.now();
        return TrafficAnalyzedEvent.newBuilder()
                .setRoadId("R001")
                .setRoadName("Nguyen Hue")
                .setWindowStart(now.minusSeconds(30))
                .setWindowEnd(now)
                .setTotalVehicles(100)
                .setAvgSpeed(speed)
                .setCongested(speed < 30)
                .build();
    }

    @Test
    void highSeverityBelowHighThreshold() {
        Optional<AlertEvent> result = engine.evaluate(evt(8.0));
        assertTrue(result.isPresent());
        assertEquals(AlertEvent.Severity.HIGH, result.get().getSeverity());
        assertTrue(result.get().getMessage().contains("Severe"));
        assertEquals("R001", result.get().getRoadId());
        assertEquals("Nguyen Hue", result.get().getRoadName());
        assertNotNull(result.get().getTriggeredAt());
    }

    @Test
    void mediumSeverityBetweenHighAndMedium() {
        Optional<AlertEvent> result = engine.evaluate(evt(15.0));
        assertTrue(result.isPresent());
        assertEquals(AlertEvent.Severity.MEDIUM, result.get().getSeverity());
        assertTrue(result.get().getMessage().contains("Moderate"));
    }

    @Test
    void lowSeverityBetweenMediumAndLow() {
        Optional<AlertEvent> result = engine.evaluate(evt(25.0));
        assertTrue(result.isPresent());
        assertEquals(AlertEvent.Severity.LOW, result.get().getSeverity());
        assertTrue(result.get().getMessage().contains("Slow"));
    }

    @Test
    void noAlertAboveLowThreshold() {
        assertTrue(engine.evaluate(evt(45.0)).isEmpty());
        assertTrue(engine.evaluate(evt(30.0)).isEmpty(), "30 km/h is at threshold — no alert");
    }

    @Test
    void boundaryAtHighThreshold() {
        // speed == highThreshold → NOT high (strict <), goes to MEDIUM
        Optional<AlertEvent> result = engine.evaluate(evt(10.0));
        assertTrue(result.isPresent());
        assertEquals(AlertEvent.Severity.MEDIUM, result.get().getSeverity());
    }

    @Test
    void messageContainsRoadNameAndSpeed() {
        AlertEvent alert = engine.evaluate(evt(7.5)).orElseThrow();
        assertTrue(alert.getMessage().contains("Nguyen Hue"));
        assertTrue(alert.getMessage().contains("7.5"));
    }
}
