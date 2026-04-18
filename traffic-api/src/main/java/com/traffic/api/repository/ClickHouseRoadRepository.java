package com.traffic.api.repository;

import com.traffic.api.model.AlertEvent;
import com.traffic.api.model.RoadHistory;
import lombok.RequiredArgsConstructor;
import org.jooq.DSLContext;
import org.jooq.Field;
import org.jooq.Record;
import org.jooq.Table;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;

import static org.jooq.impl.DSL.*;

/**
 * Queries ClickHouse for historical and analytical traffic data using JOOQ DSL.
 *
 * <p>JOOQ replaces raw {@code JdbcTemplate} SQL strings with a type-safe fluent
 * API. Parameters are always bound via prepared statements — never interpolated
 * into the SQL string. For ClickHouse-specific extensions that have no standard
 * SQL equivalent (e.g. {@code toStartOfHour}, {@code LIMIT 1 BY}), JOOQ's
 * {@code DSL.function()} and targeted {@code sql()} escapes are used.
 *
 * <p>All calls are synchronous (ClickHouse has no R2DBC driver); handlers wrap
 * them in {@code Mono.fromCallable(...).subscribeOn(Schedulers.boundedElastic())}
 * so they never block Netty's event loop.
 */
@Repository
@RequiredArgsConstructor
public class ClickHouseRoadRepository {

    private final DSLContext ctx;

    // ── Table references ──────────────────────────────────────────────────────

    private static final Table<?> TRAFFIC_ANALYZED = table(name("traffic_analyzed"));
    private static final Table<?> TRAFFIC_ALERTS   = table(name("traffic_alerts"));

    // ── Typed field references ────────────────────────────────────────────────

    private static final Field<String>        F_ROAD_ID      = field(name("road_id"),        String.class);
    private static final Field<String>        F_ROAD_NAME    = field(name("road_name"),       String.class);
    private static final Field<LocalDateTime> F_WINDOW_START = field(name("window_start"),    LocalDateTime.class);
    private static final Field<LocalDateTime> F_WINDOW_END   = field(name("window_end"),      LocalDateTime.class);
    private static final Field<Integer>       F_TOTAL_VEH    = field(name("total_vehicles"),  Integer.class);
    private static final Field<Double>        F_AVG_SPEED    = field(name("avg_speed"),       Double.class);
    private static final Field<Boolean>       F_CONGESTED    = field(name("congested"),       Boolean.class);
    private static final Field<String>        F_MESSAGE      = field(name("message"),         String.class);
    private static final Field<LocalDateTime> F_TRIGGERED_AT = field(name("triggered_at"),   LocalDateTime.class);

    // ── Public query methods ──────────────────────────────────────────────────

    /**
     * Returns windowed traffic records for a road within the given time range.
     * The {@code BETWEEN} clause is expressed entirely through JOOQ typed fields —
     * no SQL string formatting is needed.
     */
    public List<RoadHistory> findHistory(String roadId, Instant from, Instant to) {
        return ctx
                .select(F_ROAD_ID, F_ROAD_NAME, F_WINDOW_START, F_WINDOW_END,
                        F_TOTAL_VEH, F_AVG_SPEED, F_CONGESTED)
                .from(TRAFFIC_ANALYZED)
                .where(F_ROAD_ID.eq(roadId))
                .and(F_WINDOW_START.between(
                        LocalDateTime.ofInstant(from, ZoneOffset.UTC),
                        LocalDateTime.ofInstant(to,   ZoneOffset.UTC)))
                .orderBy(F_WINDOW_START)
                .fetch(this::toRoadHistory);
    }

    /**
     * Returns hourly average speed for a road over the last 24 hours.
     *
     * <p>{@code toStartOfHour} is ClickHouse-specific and is expressed via
     * {@link org.jooq.impl.DSL#function}. The interval expression
     * {@code now() - INTERVAL 24 HOUR} has no JOOQ equivalent for ClickHouse
     * and is inlined as a plain field reference — still safe because no
     * user-supplied data is concatenated.
     */
    public List<RoadHistory> findHourlyAnalytics(String roadId) {
        Field<LocalDateTime> hourBucket =
                function("toStartOfHour", LocalDateTime.class, F_WINDOW_START).as("hour_bucket");

        // ClickHouse interval literal — not user input, safe to inline
        Field<LocalDateTime> since24h =
                field("now() - INTERVAL 24 HOUR", LocalDateTime.class);

        // Inner aggregation — grouped by road + hour
        Table<?> inner = ctx
                .select(
                        F_ROAD_ID,
                        function("any", String.class, F_ROAD_NAME).as("road_name"),
                        hourBucket,
                        function("sum", Integer.class, F_TOTAL_VEH).as("total_vehicles"),
                        function("avg", Double.class,  F_AVG_SPEED).as("avg_speed"))
                .from(TRAFFIC_ANALYZED)
                .where(F_ROAD_ID.eq(roadId))
                .and(F_WINDOW_START.greaterOrEqual(since24h))
                .groupBy(F_ROAD_ID, hourBucket)
                .asTable("h");

        return ctx
                .select(
                        field(name("h", "road_id"),       String.class),
                        field(name("h", "road_name"),      String.class),
                        field(name("h", "hour_bucket"),    LocalDateTime.class).as("window_start"),
                        field("h.hour_bucket + INTERVAL 1 HOUR", LocalDateTime.class).as("window_end"),
                        field(name("h", "total_vehicles"), Integer.class),
                        field(name("h", "avg_speed"),      Double.class),
                        field("h.avg_speed < 20.0",        Boolean.class).as("congested"))
                .from(inner)
                .orderBy(field(name("h", "hour_bucket")))
                .fetch(r -> RoadHistory.builder()
                        .roadId(r.get("road_id",       String.class))
                        .roadName(r.get("road_name",   String.class))
                        .windowStart(toInstant(r.get("window_start",   LocalDateTime.class)))
                        .windowEnd(toInstant(r.get("window_end",       LocalDateTime.class)))
                        .totalVehicles(r.get("total_vehicles",         Integer.class))
                        .avgSpeed(r.get("avg_speed",                   Double.class))
                        .congested(Boolean.TRUE.equals(r.get("congested", Boolean.class)))
                        .build());
    }

    /**
     * Returns the most recent {@code limit} alerts from ClickHouse, newest first.
     *
     * <p>JOOQ's {@code .limit(int)} emits a bound parameter — not a string-formatted
     * {@code LIMIT %d}. {@code toString(severity)} casts the ClickHouse {@code Enum8}
     * column to String to avoid the clickhouse-jdbc 0.6.3 LZ4 binary-row bug.
     */
    public List<AlertEvent> findAlerts(int limit) {
        Field<String> severity =
                function("toString", String.class, field(name("severity"))).as("severity");

        return ctx
                .select(F_ROAD_ID, F_ROAD_NAME, severity, F_MESSAGE, F_TRIGGERED_AT)
                .from(TRAFFIC_ALERTS)
                .orderBy(F_TRIGGERED_AT.desc())
                .limit(limit)       // bound parameter — not inlined into SQL text
                .fetch(this::toAlertEvent);
    }

    // ── Row mappers ───────────────────────────────────────────────────────────

    private RoadHistory toRoadHistory(Record r) {
        return RoadHistory.builder()
                .roadId(r.get(F_ROAD_ID))
                .roadName(r.get(F_ROAD_NAME))
                .windowStart(toInstant(r.get(F_WINDOW_START)))
                .windowEnd(toInstant(r.get(F_WINDOW_END)))
                .totalVehicles(r.get(F_TOTAL_VEH))
                .avgSpeed(r.get(F_AVG_SPEED))
                .congested(Boolean.TRUE.equals(r.get(F_CONGESTED)))
                .build();
    }

    private AlertEvent toAlertEvent(Record r) {
        return AlertEvent.builder()
                .roadId(r.get(F_ROAD_ID))
                .roadName(r.get(F_ROAD_NAME))
                .severity(r.get("severity", String.class))
                .message(r.get(F_MESSAGE))
                .triggeredAt(toInstant(r.get(F_TRIGGERED_AT)))
                .build();
    }

    private static Instant toInstant(LocalDateTime ldt) {
        return ldt == null ? Instant.EPOCH : ldt.toInstant(ZoneOffset.UTC);
    }
}
