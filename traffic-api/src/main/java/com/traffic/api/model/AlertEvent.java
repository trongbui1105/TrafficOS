package com.traffic.api.model;

import lombok.Builder;
import lombok.Data;

import java.time.Instant;

/**
 * Represents a congestion alert stored in ClickHouse's {@code traffic_alerts} table.
 * Severity mirrors the alert-engine rule:  HIGH < 10 km/h · MEDIUM < 20 · LOW < 30.
 */
@Data
@Builder
public class AlertEvent {

    private String roadId;
    private String roadName;
    private String severity;      // LOW | MEDIUM | HIGH
    private String message;
    private Instant triggeredAt;
}
