package com.traffic.api.repository;

import com.traffic.api.model.AlertEvent;
import com.traffic.api.model.RoadHistory;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.List;

/**
 * Queries ClickHouse for historical and analytical traffic data.
 *
 * <p>JdbcTemplate is synchronous; calls are wrapped in
 * {@code Mono.fromCallable(...).subscribeOn(Schedulers.boundedElastic())}
 * in the handler layer so they don't block Netty's event loop.
 */
@Repository
@RequiredArgsConstructor
public class ClickHouseRoadRepository {

    private final JdbcTemplate jdbc;

    private static final DateTimeFormatter CH_DT =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss").withZone(ZoneOffset.UTC);

    public List<RoadHistory> findHistory(String roadId, Instant from, Instant to) {
        // clickhouse-jdbc 0.6.3 inlines java.sql.Timestamp without quotes and with
        // nanosecond precision, which produces a syntax error in ClickHouse. Inline
        // quoted DateTime literals instead. road_id stays parameterized.
        String sql = String.format("""
                SELECT road_id, road_name, window_start, window_end,
                       total_vehicles, avg_speed, congested
                FROM   traffic_analyzed
                WHERE  road_id = ?
                  AND  window_start BETWEEN toDateTime('%s') AND toDateTime('%s')
                ORDER BY window_start
                """, CH_DT.format(from), CH_DT.format(to));

        return jdbc.query(sql, new Object[]{roadId}, this::mapRow);
    }

    /**
     * Returns hourly average speed for a road over the last 24 hours.
     * Demonstrates ClickHouse's {@code toStartOfHour} time-bucketing function.
     */
    public List<RoadHistory> findHourlyAnalytics(String roadId) {
        // Wrap the aggregation in a subquery so the outer SELECT can reference
        // the avg_speed alias without ClickHouse nesting aggregates (ILLEGAL_AGGREGATION).
        String sql = """
                SELECT road_id,
                       road_name,
                       hour_bucket                       AS window_start,
                       hour_bucket + INTERVAL 1 HOUR     AS window_end,
                       total_vehicles,
                       avg_speed,
                       avg_speed < 20.0                  AS congested
                FROM (
                    SELECT road_id,
                           any(road_name)                AS road_name,
                           toStartOfHour(window_start)   AS hour_bucket,
                           sum(total_vehicles)           AS total_vehicles,
                           avg(avg_speed)                AS avg_speed
                    FROM   traffic_analyzed
                    WHERE  road_id = ?
                      AND  window_start >= now() - INTERVAL 24 HOUR
                    GROUP BY road_id, hour_bucket
                )
                ORDER BY hour_bucket
                """;

        return jdbc.query(sql, new Object[]{roadId}, this::mapRow);
    }

    /**
     * Returns the most recent alerts from ClickHouse, newest first.
     *
     * @param limit maximum number of rows to return (e.g. 100)
     */
    public List<AlertEvent> findAlerts(int limit) {
        // ClickHouse JDBC does not support '?' for LIMIT — inline the value directly.
        // Safe: limit is already parsed as int (no SQL injection risk).
        // Cast Enum8 → String explicitly: the ClickHouse JDBC binary-row reader
        // misparses Enum8 columns when LZ4 compression is active, causing an
        // "LZ4 magic mismatch" error. toString() forces a plain String in the result.
        String sql = String.format("""
                SELECT road_id, road_name, toString(severity) AS severity, message, triggered_at
                FROM   traffic_alerts
                ORDER BY triggered_at DESC
                LIMIT  %d
                """, limit);

        return jdbc.query(sql, this::mapAlertRow);
    }

    private AlertEvent mapAlertRow(ResultSet rs, int rowNum) throws SQLException {
        return AlertEvent.builder()
                .roadId(rs.getString("road_id"))
                .roadName(rs.getString("road_name"))
                .severity(rs.getString("severity"))
                .message(rs.getString("message"))
                .triggeredAt(rs.getTimestamp("triggered_at").toInstant())
                .build();
    }

    private RoadHistory mapRow(ResultSet rs, int rowNum) throws SQLException {
        return RoadHistory.builder()
                .roadId(rs.getString("road_id"))
                .roadName(rs.getString("road_name"))
                .windowStart(rs.getTimestamp("window_start").toInstant())
                .windowEnd(rs.getTimestamp("window_end").toInstant())
                .totalVehicles(rs.getInt("total_vehicles"))
                .avgSpeed(rs.getDouble("avg_speed"))
                .congested(rs.getBoolean("congested"))
                .build();
    }
}
