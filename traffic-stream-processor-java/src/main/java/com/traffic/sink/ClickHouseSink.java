package com.traffic.sink;

import com.traffic.TrafficAnalyzedEvent;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.sql.Timestamp;

/**
 * Writes analyzed traffic windows to ClickHouse using Spring JdbcTemplate.
 *
 * <p>ClickHouse is optimized for bulk inserts — in a production system you'd
 * batch multiple rows before flushing. For simplicity here we insert row-by-row
 * (acceptable for low-volume learning scenarios).
 *
 * <p>The target table must exist before the application starts.
 * See deployment/clickhouse/init.sql for the DDL.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ClickHouseSink {

    private static final String INSERT_SQL = """
            INSERT INTO traffic_analyzed
                (road_id, road_name, window_start, window_end, total_vehicles, avg_speed, congested)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """;

    private final JdbcTemplate jdbc;

    public void insert(TrafficAnalyzedEvent event) {
        try {
            jdbc.update(INSERT_SQL,
                    event.getRoadId().toString(),
                    event.getRoadName().toString(),
                    Timestamp.from(event.getWindowStart()),
                    Timestamp.from(event.getWindowEnd()),
                    event.getTotalVehicles(),
                    event.getAvgSpeed(),
                    event.getCongested()
            );
        } catch (Exception e) {
            // Log and continue — a failed ClickHouse write must not crash the Kafka Streams job
            log.error("Failed to insert analyzed event for road {}: {}", event.getRoadId(), e.getMessage());
        }
    }
}
