package com.traffic.api.model;

import lombok.Builder;
import lombok.Data;

import java.time.Instant;

/**
 * Current status of a road — cached in Redis with a 60-second TTL.
 * Populated by the Kafka consumer whenever a new analyzed event arrives.
 */
@Data
@Builder
public class RoadStatus {
    private String  roadId;
    private String  roadName;
    private int     totalVehicles;
    private double  avgSpeed;
    private boolean congested;
    private Instant updatedAt;
}
