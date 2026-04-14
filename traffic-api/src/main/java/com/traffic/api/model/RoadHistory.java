package com.traffic.api.model;

import lombok.Builder;
import lombok.Data;

import java.time.Instant;

/** A single analyzed window row returned from ClickHouse for historical queries. */
@Data
@Builder
public class RoadHistory {
    private String  roadId;
    private String  roadName;
    private Instant windowStart;
    private Instant windowEnd;
    private int     totalVehicles;
    private double  avgSpeed;
    private boolean congested;
}
