package com.traffic.alert.model;

import lombok.Builder;
import lombok.Data;

import java.time.Instant;

/** Alert event published to the {@code traffic.alerts} Kafka topic (JSON). */
@Data
@Builder
public class AlertEvent {
    private String   roadId;
    private String   roadName;
    private Severity severity;
    private String   message;
    private Instant  triggeredAt;

    public enum Severity { LOW, MEDIUM, HIGH }
}
