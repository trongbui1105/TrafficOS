package com.traffic.alert.sink;

import com.traffic.alert.model.AlertEvent;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.sql.Timestamp;

/** Persists alert events to ClickHouse {@code traffic_alerts} table. */
@Slf4j
@Component
@RequiredArgsConstructor
public class ClickHouseAlertSink {

    private static final String INSERT_SQL = """
            INSERT INTO traffic_alerts (road_id, road_name, severity, message, triggered_at)
            VALUES (?, ?, ?, ?, ?)
            """;

    private final JdbcTemplate jdbc;

    public void insert(AlertEvent alert) {
        try {
            jdbc.update(INSERT_SQL,
                    alert.getRoadId(),
                    alert.getRoadName(),
                    alert.getSeverity().name(),
                    alert.getMessage(),
                    Timestamp.from(alert.getTriggeredAt())
            );
        } catch (Exception e) {
            log.error("Failed to persist alert for road {}: {}", alert.getRoadId(), e.getMessage());
        }
    }
}
