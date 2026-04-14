package com.traffic.api.model;

import lombok.Builder;
import lombok.Data;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * Aggregated city-wide snapshot exposed at {@code GET /api/v1/city/pulse}.
 * Pulls together the latest readings from every enrichment dataset
 * (weather, incidents, environment, vehicle mix, road metadata) so the
 * dashboard can render a single "City Pulse" page in one round-trip.
 */
@Data
@Builder
public class CityPulse {

    /** Time the snapshot was assembled. */
    private Instant generatedAt;

    /** Count of currently-active incidents, grouped by type. */
    private Map<String, Long> activeIncidentsByType;

    /** Currently-active incidents (ordered by severity desc, then newest). */
    private List<IncidentRecord> activeIncidents;

    /** City-wide weather mix: how many roads are in each condition right now. */
    private Map<String, Long> weatherMix;

    /** Average temperature, humidity, rain and visibility across all roads. */
    private WeatherSummary weather;

    /** Average air-quality and noise across all roads. */
    private EnvironmentSummary environment;

    /** Vehicle class totals (sum of the latest mix row per road). */
    private VehicleMixSummary vehicles;

    /** Per-district aggregates: road count, avg AQI, avg speed, incident count. */
    private List<DistrictSnapshot> districts;

    // --- nested records -------------------------------------------------

    @Data
    @Builder
    public static class WeatherSummary {
        private double avgTemperatureC;
        private double avgHumidityPct;
        private double avgWindKph;
        private double avgVisibilityKm;
        private double totalRainMm;
    }

    @Data
    @Builder
    public static class EnvironmentSummary {
        private double avgPm25;
        private double avgPm10;
        private double avgNo2;
        private double avgCoPpm;
        private int    avgAqi;
        private double avgNoiseDb;
        private String airQualityLabel;   // Good | Moderate | Unhealthy | Hazardous
    }

    @Data
    @Builder
    public static class VehicleMixSummary {
        private long cars;
        private long trucks;
        private long buses;
        private long motorcycles;
        private long bicycles;
        private long emergency;
        private long pedestrians;
    }

    @Data
    @Builder
    public static class DistrictSnapshot {
        private String district;
        private int    roadCount;
        private double avgSpeed;
        private int    avgAqi;
        private int    activeIncidents;
    }

    @Data
    @Builder
    public static class IncidentRecord {
        private String  incidentId;
        private String  roadId;
        private String  roadName;
        private String  type;
        private String  severity;
        private String  status;
        private int     lanesBlocked;
        private String  description;
        private Instant startedAt;
    }
}
