package com.traffic.alert.webhook;

import com.traffic.alert.model.AlertEvent;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.lang.reflect.Method;
import java.time.Instant;

import static org.junit.jupiter.api.Assertions.*;

class WebhookNotifierTest {

    private WebhookNotifier notifier;

    @BeforeEach
    void setUp() {
        notifier = new WebhookNotifier();
        ReflectionTestUtils.setField(notifier, "webhookUrl", "");
        ReflectionTestUtils.setField(notifier, "webhookSeverity", "HIGH");
    }

    private AlertEvent alert(AlertEvent.Severity sev) {
        return AlertEvent.builder()
                .roadId("R001")
                .roadName("Nguyen Hue")
                .severity(sev)
                .message("test message")
                .triggeredAt(Instant.parse("2026-01-01T12:00:00Z"))
                .build();
    }

    @Test
    void noWebhookUrlReturnsEarly() {
        // Shouldn't throw even with no URL — silently no-ops
        ReflectionTestUtils.setField(notifier, "webhookUrl", "");
        assertDoesNotThrow(() -> notifier.notifyIfEligible(alert(AlertEvent.Severity.HIGH)));
    }

    @Test
    void meetsThresholdHighSeverity() throws Exception {
        ReflectionTestUtils.setField(notifier, "webhookSeverity", "HIGH");
        assertTrue(invokeMeetsThreshold(AlertEvent.Severity.HIGH));
        assertFalse(invokeMeetsThreshold(AlertEvent.Severity.MEDIUM));
        assertFalse(invokeMeetsThreshold(AlertEvent.Severity.LOW));
    }

    @Test
    void meetsThresholdMediumSeverity() throws Exception {
        ReflectionTestUtils.setField(notifier, "webhookSeverity", "MEDIUM");
        assertTrue(invokeMeetsThreshold(AlertEvent.Severity.HIGH));
        assertTrue(invokeMeetsThreshold(AlertEvent.Severity.MEDIUM));
        assertFalse(invokeMeetsThreshold(AlertEvent.Severity.LOW));
    }

    @Test
    void meetsThresholdLowSeverity() throws Exception {
        ReflectionTestUtils.setField(notifier, "webhookSeverity", "LOW");
        assertTrue(invokeMeetsThreshold(AlertEvent.Severity.HIGH));
        assertTrue(invokeMeetsThreshold(AlertEvent.Severity.MEDIUM));
        assertTrue(invokeMeetsThreshold(AlertEvent.Severity.LOW));
    }

    @Test
    void meetsThresholdDefaultsToHighOnInvalidConfig() throws Exception {
        ReflectionTestUtils.setField(notifier, "webhookSeverity", "bogus");
        // Should default to HIGH
        assertTrue(invokeMeetsThreshold(AlertEvent.Severity.HIGH));
        assertFalse(invokeMeetsThreshold(AlertEvent.Severity.MEDIUM));
    }

    @Test
    void buildPayloadIncludesAlertFields() throws Exception {
        String payload = invokeBuildPayload(alert(AlertEvent.Severity.HIGH));
        assertTrue(payload.contains("HIGH"));
        assertTrue(payload.contains("R001"));
        assertTrue(payload.contains("test message"));
        assertTrue(payload.contains("Traffic Alert"));
    }

    @Test
    void buildPayloadEscapesQuotesAndBackslashes() throws Exception {
        AlertEvent a = AlertEvent.builder()
                .roadId("R001")
                .roadName("Road")
                .severity(AlertEvent.Severity.HIGH)
                .message("he said \"hi\" and \\ escaped")
                .triggeredAt(Instant.now())
                .build();
        String payload = invokeBuildPayload(a);
        assertTrue(payload.contains("\\\""));
        assertTrue(payload.contains("\\\\"));
    }

    // ── reflection helpers for private methods ──────────────────────────────

    private boolean invokeMeetsThreshold(AlertEvent.Severity s) throws Exception {
        Method m = WebhookNotifier.class.getDeclaredMethod("meetsThreshold", AlertEvent.Severity.class);
        m.setAccessible(true);
        return (boolean) m.invoke(notifier, s);
    }

    private String invokeBuildPayload(AlertEvent a) throws Exception {
        Method m = WebhookNotifier.class.getDeclaredMethod("buildPayload", AlertEvent.class);
        m.setAccessible(true);
        return (String) m.invoke(notifier, a);
    }
}
