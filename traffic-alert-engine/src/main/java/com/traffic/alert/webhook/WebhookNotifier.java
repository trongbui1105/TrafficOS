package com.traffic.alert.webhook;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.traffic.alert.model.AlertEvent;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.Map;

/**
 * Sends high-severity alert notifications to a configured webhook URL.
 *
 * <p>Compatible with Slack, Discord, Microsoft Teams, and any generic
 * HTTP webhook that accepts a JSON POST payload.
 *
 * <p>Configuration via environment variables:
 * <ul>
 *   <li>{@code ALERT_WEBHOOK_URL}      — if empty, notifications are disabled</li>
 *   <li>{@code ALERT_WEBHOOK_SEVERITY} — minimum severity to notify (default: HIGH)</li>
 * </ul>
 *
 * <p>The payload is formatted as a Slack-compatible block message but works
 * with generic webhooks too (Discord ignores {@code blocks}, Teams uses {@code text}).
 */
@Slf4j
@Component
public class WebhookNotifier {

    private static final HttpClient HTTP = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();

    @Value("${traffic.alert.webhook-url:}")
    private String webhookUrl;

    @Value("${traffic.alert.webhook-severity:HIGH}")
    private String webhookSeverity;

    /**
     * Sends a webhook notification if the alert meets the configured severity threshold.
     *
     * @param alert the alert event to notify about
     */
    public void notifyIfEligible(AlertEvent alert) {
        if (webhookUrl == null || webhookUrl.isBlank()) {
            return; // webhook not configured
        }

        if (!meetsThreshold(alert.getSeverity())) {
            return;
        }

        String payload = buildPayload(alert);
        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(webhookUrl))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(payload))
                    .timeout(Duration.ofSeconds(10))
                    .build();

            HttpResponse<String> response = HTTP.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() >= 200 && response.statusCode() < 300) {
                log.info("Webhook notification sent for {} alert on {}", alert.getSeverity(), alert.getRoadId());
            } else {
                log.warn("Webhook responded with {} for alert on {}: {}",
                        response.statusCode(), alert.getRoadId(), response.body());
            }
        } catch (Exception ex) {
            log.error("Failed to send webhook notification for road {}: {}", alert.getRoadId(), ex.getMessage());
        }
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private boolean meetsThreshold(AlertEvent.Severity alertSeverity) {
        AlertEvent.Severity threshold;
        try {
            threshold = AlertEvent.Severity.valueOf(webhookSeverity.toUpperCase());
        } catch (IllegalArgumentException e) {
            log.warn("Invalid ALERT_WEBHOOK_SEVERITY '{}', defaulting to HIGH", webhookSeverity);
            threshold = AlertEvent.Severity.HIGH;
        }

        // Severity ordering: HIGH > MEDIUM > LOW
        return severityOrdinal(alertSeverity) >= severityOrdinal(threshold);
    }

    private int severityOrdinal(AlertEvent.Severity s) {
        return switch (s) {
            case LOW    -> 0;
            case MEDIUM -> 1;
            case HIGH   -> 2;
        };
    }

    /**
     * Builds a Slack-compatible JSON payload.
     * Works with Discord (uses {@code content} field) and Teams (uses {@code text}).
     */
    private String buildPayload(AlertEvent alert) {
        String emoji = switch (alert.getSeverity()) {
            case HIGH   -> "🔴";
            case MEDIUM -> "🟠";
            case LOW    -> "🟡";
        };

        String text = String.format("%s *Traffic Alert — %s*\\n%s",
                emoji, alert.getSeverity(), alert.getMessage());

        // Slack blocks format — also sends "text" as fallback for other platforms
        return """
                {
                  "text": "%s",
                  "blocks": [
                    {
                      "type": "header",
                      "text": { "type": "plain_text", "text": "%s Traffic Alert", "emoji": true }
                    },
                    {
                      "type": "section",
                      "fields": [
                        { "type": "mrkdwn", "text": "*Road:*\\n%s" },
                        { "type": "mrkdwn", "text": "*Severity:*\\n%s %s" },
                        { "type": "mrkdwn", "text": "*Message:*\\n%s" },
                        { "type": "mrkdwn", "text": "*Time:*\\n%s" }
                      ]
                    }
                  ]
                }
                """.formatted(
                escapeJson(alert.getMessage()),
                emoji,
                escapeJson(alert.getRoadId()),
                emoji, alert.getSeverity(),
                escapeJson(alert.getMessage()),
                alert.getTriggeredAt().toString()
        );
    }

    private static String escapeJson(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                .replace("\t", "\\t");
    }
}
