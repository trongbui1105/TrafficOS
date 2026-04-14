package com.traffic.processor;

import com.traffic.TrafficEvent;
import lombok.Data;

/**
 * Mutable accumulator for a single (roadId, time-window) pair.
 *
 * <p>Kafka Streams calls {@link #add(TrafficEvent)} for every event that falls
 * inside the window, then serializes this object to the state store between
 * processing iterations (hence it must be serializable via {@link TrafficAggregationSerde}).
 */
@Data
public class TrafficAggregation {

    private String roadName = "";
    private int    vehicleSum = 0;
    private double speedSum   = 0.0;
    private int    count      = 0;

    public TrafficAggregation add(TrafficEvent event) {
        this.roadName    = event.getRoadName().toString();
        this.vehicleSum += event.getVehicleCount();
        this.speedSum   += event.getAvgSpeed();
        this.count++;
        return this;
    }
}
