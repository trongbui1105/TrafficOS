package com.traffic.api.repository;

import com.traffic.api.model.CityPulse;
import lombok.RequiredArgsConstructor;
import org.jooq.DSLContext;
import org.jooq.Field;
import org.jooq.Record;
import org.jooq.Table;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.jooq.impl.DSL.*;

/**
 * Reads enrichment datasets (weather, incidents, environment, vehicle mix,
 * road metadata) from ClickHouse and assembles a {@link CityPulse} snapshot.
 *
 * <p>All queries use the JOOQ DSL instead of raw {@code JdbcTemplate} SQL
 * strings. Parameters are always bound — never interpolated. For ClickHouse
 * extensions without a standard SQL equivalent:
 * <ul>
 *   <li>{@code FINAL} (MergeTree deduplication) → {@code table(sql("… FINAL"))}
 *   <li>{@code LIMIT 1 BY road_id} (latest-per-key) → derived table via
 *       {@link #latestPerRoad(Table, int)}
 *   <li>{@code toFloat64}, {@code toUInt64}, {@code isNaN}, {@code if}
 *       → {@link org.jooq.impl.DSL#function(String, Class, org.jooq.QueryPart...)}
 * </ul>
 */
@Repository
@RequiredArgsConstructor
public class CityPulseRepository {

    private final DSLContext ctx;

    // ── Table references ──────────────────────────────────────────────────────

    // FINAL keyword (ClickHouse MergeTree deduplication) — not standard SQL
    private static final Table<?> INCIDENTS_FINAL  = table(sql("traffic_incidents FINAL"));
    private static final Table<?> ROAD_META_FINAL  = table(sql("road_metadata FINAL"));

    private static final Table<?> WEATHER_OBS      = table(name("weather_observations"));
    private static final Table<?> ENV_METRICS      = table(name("environment_metrics"));
    private static final Table<?> VEHICLE_CLASS    = table(name("vehicle_classification"));
    private static final Table<?> TRAFFIC_ANALYZED = table(name("traffic_analyzed"));

    // ── Assembly entry point ──────────────────────────────────────────────────

    public CityPulse buildSnapshot() {
        return CityPulse.builder()
                .generatedAt(Instant.now())
                .activeIncidents(findActiveIncidents(25))
                .activeIncidentsByType(countActiveIncidentsByType())
                .weatherMix(countWeatherMix())
                .weather(summarizeWeather())
                .environment(summarizeEnvironment())
                .vehicles(summarizeVehicleMix())
                .districts(findDistrictSnapshots())
                .build();
    }

    // ── Incidents ─────────────────────────────────────────────────────────────

    public List<CityPulse.IncidentRecord> findActiveIncidents(int limit) {
        return ctx
                .select(
                        field(name("incident_id"),                       String.class),
                        field(name("road_id"),                           String.class),
                        field(name("road_name"),                         String.class),
                        function("toString", String.class, field("type"    )).as("type"),
                        function("toString", String.class, field("severity")).as("severity"),
                        function("toString", String.class, field("status"  )).as("status"),
                        field(name("lanes_blocked"),                     Integer.class),
                        field(name("description"),                       String.class),
                        field(name("started_at"),                        LocalDateTime.class))
                .from(INCIDENTS_FINAL)
                .where(field("status").eq(inline("active")))
                .orderBy(field("severity").desc(), field("started_at").desc())
                .limit(limit)
                .fetch(r -> CityPulse.IncidentRecord.builder()
                        .incidentId(r.get("incident_id",    String.class))
                        .roadId(r.get("road_id",            String.class))
                        .roadName(r.get("road_name",        String.class))
                        .type(r.get("type",                 String.class))
                        .severity(r.get("severity",         String.class))
                        .status(r.get("status",             String.class))
                        .lanesBlocked(r.get("lanes_blocked", Integer.class))
                        .description(r.get("description",   String.class))
                        .startedAt(toInstant(r.get("started_at", LocalDateTime.class)))
                        .build());
    }

    private Map<String, Long> countActiveIncidentsByType() {
        return ctx
                .select(
                        function("toString", String.class, field("type")).as("type"),
                        count().as("n"))
                .from(INCIDENTS_FINAL)
                .where(field("status").eq(inline("active")))
                .groupBy(field("type"))
                .orderBy(field("n").desc())
                .fetchMap(r -> r.get("type", String.class), r -> r.get("n", Long.class));
    }

    // ── Weather ───────────────────────────────────────────────────────────────

    private Map<String, Long> countWeatherMix() {
        // latestPerRoad() emits "LIMIT 1 BY road_id" for the ClickHouse-specific
        // latest-per-key pattern; only the SELECT list changes per caller.
        Table<?> latest = latestPerRoad(WEATHER_OBS, 10, "condition");

        return ctx
                .select(
                        function("toString", String.class, field("condition")).as("cond"),
                        count().as("n"))
                .from(latest)
                .groupBy(field("cond"))
                .orderBy(field("n").desc())
                .fetchMap(r -> r.get("cond", String.class), r -> r.get("n", Long.class));
    }

    private CityPulse.WeatherSummary summarizeWeather() {
        Table<?> latest = latestPerRoad(WEATHER_OBS, 10, "*");

        return ctx
                .select(
                        nanSafeAvg("temperature_c", 25.0).as("t"),
                        nanSafeAvg("humidity_pct",  70.0).as("h"),
                        nanSafeAvg("wind_kph",        0.0).as("w"),
                        nanSafeAvg("visibility_km", 10.0).as("v"),
                        nanSafeSum("rain_mm",          0.0).as("r"))
                .from(latest)
                .fetchOne(r -> CityPulse.WeatherSummary.builder()
                        .avgTemperatureC(r.get("t", Double.class))
                        .avgHumidityPct(r.get("h",  Double.class))
                        .avgWindKph(r.get("w",       Double.class))
                        .avgVisibilityKm(r.get("v",  Double.class))
                        .totalRainMm(r.get("r",      Double.class))
                        .build());
    }

    // ── Environment ───────────────────────────────────────────────────────────

    private CityPulse.EnvironmentSummary summarizeEnvironment() {
        Table<?> latest = latestPerRoad(ENV_METRICS, 5, "*");

        return ctx
                .select(
                        nanSafeAvg("pm25",      0.0).as("pm25"),
                        nanSafeAvg("pm10",      0.0).as("pm10"),
                        nanSafeAvg("no2",       0.0).as("no2"),
                        nanSafeAvg("co_ppm",    0.0).as("co"),
                        nanSafeAvg("aqi",       0.0).as("aqi"),
                        nanSafeAvg("noise_db",  0.0).as("n"))
                .from(latest)
                .fetchOne(r -> {
                    int aqi = (int) Math.round(r.get("aqi", Double.class));
                    return CityPulse.EnvironmentSummary.builder()
                            .avgPm25(r.get("pm25",     Double.class))
                            .avgPm10(r.get("pm10",     Double.class))
                            .avgNo2(r.get("no2",       Double.class))
                            .avgCoPpm(r.get("co",      Double.class))
                            .avgAqi(aqi)
                            .avgNoiseDb(r.get("n",     Double.class))
                            .airQualityLabel(aqiLabel(aqi))
                            .build();
                });
    }

    // ── Vehicle mix ───────────────────────────────────────────────────────────

    private CityPulse.VehicleMixSummary summarizeVehicleMix() {
        Table<?> latest = latestPerRoad(VEHICLE_CLASS, 5, "*");

        return ctx
                .select(
                        nanSafeLongSum("cars").as("cars"),
                        nanSafeLongSum("trucks").as("trucks"),
                        nanSafeLongSum("buses").as("buses"),
                        nanSafeLongSum("motorcycles").as("motorcycles"),
                        nanSafeLongSum("bicycles").as("bicycles"),
                        nanSafeLongSum("emergency").as("emergency"),
                        nanSafeLongSum("pedestrians").as("pedestrians"))
                .from(latest)
                .fetchOne(r -> CityPulse.VehicleMixSummary.builder()
                        .cars(r.get("cars",               Long.class))
                        .trucks(r.get("trucks",           Long.class))
                        .buses(r.get("buses",             Long.class))
                        .motorcycles(r.get("motorcycles", Long.class))
                        .bicycles(r.get("bicycles",       Long.class))
                        .emergency(r.get("emergency",     Long.class))
                        .pedestrians(r.get("pedestrians", Long.class))
                        .build());
    }

    // ── District snapshots ────────────────────────────────────────────────────

    private List<CityPulse.DistrictSnapshot> findDistrictSnapshots() {
        // LIMIT 1 BY subqueries for latest-per-road lookups
        Table<?> latestEnv = latestPerRoad(ENV_METRICS,      10, "road_id, aqi")
                .as("le");
        Table<?> latestSpeed = latestPerRoad(TRAFFIC_ANALYZED, 30, "road_id, avg_speed",
                "window_start")
                .as("ls");
        Table<?> activeCounts = ctx
                .select(field("road_id"), count().as("n"))
                .from(INCIDENTS_FINAL)
                .where(field("status").eq(inline("active")))
                .groupBy(field("road_id"))
                .asTable("ac");

        Table<?> m = ROAD_META_FINAL.as("m");

        return ctx
                .select(
                        field("m.district",    String.class),
                        countDistinct(field("m.road_id")).as("road_count"),
                        nanSafeAvgField(field("ls.avg_speed", Double.class), 0.0).as("avg_speed"),
                        nanSafeAvgField(field("le.aqi",       Double.class), 0.0).as("avg_aqi"),
                        coalesce(sum(field("ac.n", Long.class)), inline(0L)).as("active_incidents"))
                .from(m)
                .leftJoin(latestEnv).on(
                        field("le.road_id").eq(field("m.road_id")))
                .leftJoin(latestSpeed).on(
                        field("ls.road_id").eq(field("m.road_id")))
                .leftJoin(activeCounts).on(
                        field("ac.road_id").eq(field("m.road_id")))
                .groupBy(field("m.district"))
                .orderBy(field("m.district"))
                .fetch(r -> CityPulse.DistrictSnapshot.builder()
                        .district(r.get("district",           String.class))
                        .roadCount(r.get("road_count",        Integer.class))
                        .avgSpeed(r.get("avg_speed",          Double.class))
                        .avgAqi((int) Math.round(r.get("avg_aqi", Double.class)))
                        .activeIncidents(r.get("active_incidents", Integer.class))
                        .build());
    }

    // ── Road metadata ─────────────────────────────────────────────────────────

    public List<Map<String, Object>> findAllRoadMeta() {
        return ctx
                .select(
                        field(name("road_id"),     String.class),
                        field(name("road_name"),   String.class),
                        field(name("district"),    String.class),
                        function("toString", String.class, field("road_type")).as("road_type"),
                        field(name("lanes"),       Integer.class),
                        field(name("speed_limit"), Integer.class),
                        field(name("length_km"),   Double.class),
                        field(name("lat"),         Double.class),
                        field(name("lon"),         Double.class))
                .from(ROAD_META_FINAL)
                .orderBy(field(name("road_id")))
                .fetch(r -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("roadId",     r.get("road_id",     String.class));
                    row.put("roadName",   r.get("road_name",   String.class));
                    row.put("district",   r.get("district",    String.class));
                    row.put("roadType",   r.get("road_type",   String.class));
                    row.put("lanes",      r.get("lanes",       Integer.class));
                    row.put("speedLimit", r.get("speed_limit", Integer.class));
                    row.put("lengthKm",   r.get("length_km",   Double.class));
                    row.put("lat",        r.get("lat",         Double.class));
                    row.put("lon",        r.get("lon",         Double.class));
                    return row;
                });
    }

    // ── Per-road drill-down ───────────────────────────────────────────────────

    public Map<String, Object> findLatestWeather(String roadId) {
        return ctx
                .select(
                        field(name("road_id"),        String.class),
                        field(name("observed_at"),    LocalDateTime.class),
                        function("toString", String.class, field("condition")).as("condition"),
                        field(name("temperature_c"),  Float.class),
                        field(name("humidity_pct"),   Integer.class),
                        field(name("wind_kph"),       Float.class),
                        field(name("visibility_km"),  Float.class),
                        field(name("rain_mm"),        Float.class))
                .from(WEATHER_OBS)
                .where(field(name("road_id"), String.class).eq(roadId))
                .orderBy(field(name("observed_at")).desc())
                .limit(1)
                .fetchOne(this::toWeatherMap);
    }

    public List<Map<String, Object>> findVehicleMixHistory(String roadId, int limit) {
        return ctx
                .select(
                        field(name("road_id"),      String.class),
                        field(name("observed_at"),  LocalDateTime.class),
                        field(name("cars"),         Integer.class),
                        field(name("trucks"),       Integer.class),
                        field(name("buses"),        Integer.class),
                        field(name("motorcycles"),  Integer.class),
                        field(name("bicycles"),     Integer.class),
                        field(name("emergency"),    Integer.class),
                        field(name("pedestrians"),  Integer.class))
                .from(VEHICLE_CLASS)
                .where(field(name("road_id"), String.class).eq(roadId))
                .orderBy(field(name("observed_at")).desc())
                .limit(limit)
                .fetch(r -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("roadId",      r.get("road_id",      String.class));
                    row.put("observedAt",  toInstant(r.get("observed_at", LocalDateTime.class)));
                    row.put("cars",        r.get("cars",         Integer.class));
                    row.put("trucks",      r.get("trucks",       Integer.class));
                    row.put("buses",       r.get("buses",        Integer.class));
                    row.put("motorcycles", r.get("motorcycles",  Integer.class));
                    row.put("bicycles",    r.get("bicycles",     Integer.class));
                    row.put("emergency",   r.get("emergency",    Integer.class));
                    row.put("pedestrians", r.get("pedestrians",  Integer.class));
                    return row;
                });
    }

    public List<Map<String, Object>> findEnvironmentHistory(String roadId, int limit) {
        return ctx
                .select(
                        field(name("road_id"),     String.class),
                        field(name("observed_at"), LocalDateTime.class),
                        field(name("pm25"),        Float.class),
                        field(name("pm10"),        Float.class),
                        field(name("no2"),         Float.class),
                        field(name("co_ppm"),      Float.class),
                        field(name("aqi"),         Integer.class),
                        field(name("noise_db"),    Float.class))
                .from(ENV_METRICS)
                .where(field(name("road_id"), String.class).eq(roadId))
                .orderBy(field(name("observed_at")).desc())
                .limit(limit)
                .fetch(r -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("roadId",     r.get("road_id",    String.class));
                    row.put("observedAt", toInstant(r.get("observed_at", LocalDateTime.class)));
                    row.put("pm25",       r.get("pm25",       Float.class));
                    row.put("pm10",       r.get("pm10",       Float.class));
                    row.put("no2",        r.get("no2",        Float.class));
                    row.put("coPpm",      r.get("co_ppm",     Float.class));
                    row.put("aqi",        r.get("aqi",        Integer.class));
                    row.put("noiseDb",    r.get("noise_db",   Float.class));
                    return row;
                });
    }

    public List<Map<String, Object>> findAllLatestWeather() {
        return ctx
                .select(
                        field(name("road_id"),        String.class),
                        field(name("observed_at"),    LocalDateTime.class),
                        function("toString", String.class, field("condition")).as("condition"),
                        field(name("temperature_c"),  Float.class),
                        field(name("humidity_pct"),   Integer.class),
                        field(name("wind_kph"),       Float.class),
                        field(name("visibility_km"),  Float.class),
                        field(name("rain_mm"),        Float.class))
                .from(WEATHER_OBS)
                .where(field("observed_at", LocalDateTime.class)
                        .greaterOrEqual(field("now() - INTERVAL 10 MINUTE", LocalDateTime.class)))
                .orderBy(field("road_id"), field("observed_at").desc())
                // ClickHouse LIMIT 1 BY — no JOOQ standard equivalent;
                // isolated here as the only remaining plain-SQL clause
                .limit(sql("1 BY road_id"))
                .fetch(this::toWeatherMap);
    }

    // ── ClickHouse-specific DSL helpers ───────────────────────────────────────

    /**
     * Builds a derived table that selects the most recent row per road within
     * the last {@code minutesBack} minutes using ClickHouse's
     * {@code LIMIT 1 BY road_id}.
     *
     * <p>This is the only place where a plain-SQL fragment appears; it exists
     * because {@code LIMIT … BY} is a ClickHouse extension not representable in
     * standard SQL or JOOQ's typed DSL. The fragment contains no user data.
     *
     * @param source      source table
     * @param minutesBack look-back window in minutes (compile-time constant)
     * @param columns     column list for the SELECT (no user input; compile-time)
     */
    private Table<?> latestPerRoad(Table<?> source, int minutesBack, String... columns) {
        String cols   = columns.length == 0 ? "*" : String.join(", ", columns);
        String tName  = source.getName();
        String tsCol  = tName.equals("traffic_analyzed") ? "window_start" : "observed_at";
        return table(sql(
                "(SELECT " + cols + " FROM " + tName +
                " WHERE " + tsCol + " >= now() - INTERVAL " + minutesBack + " MINUTE" +
                " ORDER BY road_id, " + tsCol + " DESC" +
                " LIMIT 1 BY road_id)"
        )).as("lpr_" + tName);
    }

    /** Overload that lets the caller specify a custom timestamp column name. */
    private Table<?> latestPerRoad(Table<?> source, int minutesBack,
                                   String columns, String tsColumn) {
        String tName = source.getName();
        return table(sql(
                "(SELECT " + columns + " FROM " + tName +
                " WHERE " + tsColumn + " >= now() - INTERVAL " + minutesBack + " MINUTE" +
                " ORDER BY road_id, " + tsColumn + " DESC" +
                " LIMIT 1 BY road_id)"
        )).as("lpr_" + tName);
    }

    /**
     * {@code if(isNaN(avg(col)), fallback, avg(col))}
     * Guards against the IEEE NaN that ClickHouse's {@code avg()} returns when
     * aggregating zero rows (unlike standard SQL which returns NULL).
     */
    private static Field<Double> nanSafeAvg(String col, double fallback) {
        Field<Double> avg = function("avg", Double.class, field(name(col)));
        return function("if", Double.class,
                function("isNaN", Boolean.class, avg),
                val(fallback),
                avg);
    }

    private static Field<Double> nanSafeAvgField(Field<Double> f, double fallback) {
        Field<Double> avg = function("avg", Double.class, f);
        return function("if", Double.class,
                function("isNaN", Boolean.class, avg),
                val(fallback),
                avg);
    }

    /** {@code if(isNaN(sum(col)), fallback, sum(col))} — for Double sums. */
    private static Field<Double> nanSafeSum(String col, double fallback) {
        Field<Double> sum = function("sum", Double.class, field(name(col)));
        return function("if", Double.class,
                function("isNaN", Boolean.class, sum),
                val(fallback),
                sum);
    }

    /**
     * {@code if(isNaN(toFloat64(sum(col))), 0, sum(col))}
     * Guards against NaN from summing UInt32 columns over empty result sets
     * in some ClickHouse versions.
     */
    private static Field<Long> nanSafeLongSum(String col) {
        Field<Long> sum = function("sum", Long.class, field(name(col)));
        return function("if", Long.class,
                function("isNaN", Boolean.class,
                        function("toFloat64", Double.class, sum)),
                inline(0L),
                sum);
    }

    // ── Shared row mappers ────────────────────────────────────────────────────

    private Map<String, Object> toWeatherMap(Record r) {
        if (r == null) return null;
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("roadId",       r.get("road_id",       String.class));
        row.put("observedAt",   toInstant(r.get("observed_at", LocalDateTime.class)));
        row.put("condition",    r.get("condition",      String.class));
        row.put("temperatureC", r.get("temperature_c", Float.class));
        row.put("humidityPct",  r.get("humidity_pct",  Integer.class));
        row.put("windKph",      r.get("wind_kph",      Float.class));
        row.put("visibilityKm", r.get("visibility_km", Float.class));
        row.put("rainMm",       r.get("rain_mm",       Float.class));
        return row;
    }

    private static Instant toInstant(LocalDateTime ldt) {
        return ldt == null ? Instant.EPOCH : ldt.toInstant(ZoneOffset.UTC);
    }

    private static String aqiLabel(int aqi) {
        if (aqi <= 50)  return "Good";
        if (aqi <= 100) return "Moderate";
        if (aqi <= 150) return "Unhealthy for Sensitive Groups";
        if (aqi <= 200) return "Unhealthy";
        if (aqi <= 300) return "Very Unhealthy";
        return "Hazardous";
    }
}
