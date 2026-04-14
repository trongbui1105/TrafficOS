"""ClickHouse client using the native Python driver (no JDBC)."""
from __future__ import annotations
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any

from clickhouse_driver import Client

logger = logging.getLogger(__name__)

CH_HOST = os.getenv("CLICKHOUSE_HOST", "clickhouse")
CH_PORT = int(os.getenv("CLICKHOUSE_PORT", "9000"))
CH_DB   = os.getenv("CLICKHOUSE_DB", "default")


def get_client() -> Client:
    return Client(host=CH_HOST, port=CH_PORT, database=CH_DB)


# ---------------------------------------------------------------------------
# Training data
# ---------------------------------------------------------------------------

def fetch_training_data(days: int = 7) -> list[dict]:
    """
    Return traffic_analyzed rows for the last `days` days.
    Used to build per-road historical profiles.
    """
    since = datetime.now(tz=timezone.utc) - timedelta(days=days)
    since_str = since.strftime("%Y-%m-%d %H:%M:%S")
    sql = f"""
        SELECT road_id, road_name,
               toHour(window_start)             AS hour_of_day,
               toDayOfWeek(window_start)         AS day_of_week,
               toStartOfFiveMinutes(window_start) AS bucket,
               avg(avg_speed)                   AS avg_speed,
               sum(total_vehicles)              AS total_vehicles,
               countIf(congested)               AS congested_windows,
               count()                          AS window_count
        FROM traffic_analyzed
        WHERE window_start >= toDateTime('{since_str}')
        GROUP BY road_id, road_name, hour_of_day, day_of_week, bucket
        ORDER BY road_id, bucket
    """
    client = get_client()
    rows, columns = client.execute(sql, with_column_types=True)
    col_names = [c[0] for c in columns]
    return [dict(zip(col_names, row)) for row in rows]


def fetch_current_speeds() -> list[dict]:
    """Latest analyzed window per road (last 5 min)."""
    sql = """
        SELECT road_id, road_name, avg_speed, total_vehicles, congested, window_start
        FROM traffic_analyzed
        WHERE window_start >= now() - INTERVAL 5 MINUTE
        ORDER BY road_id, window_start DESC
        LIMIT 1 BY road_id
    """
    client = get_client()
    rows, columns = client.execute(sql, with_column_types=True)
    col_names = [c[0] for c in columns]
    return [dict(zip(col_names, row)) for row in rows]


def fetch_recent_windows(road_id: str, n: int = 10) -> list[dict]:
    """Last `n` 30-second windows for a specific road."""
    sql = f"""
        SELECT avg_speed, total_vehicles, congested, window_start
        FROM traffic_analyzed
        WHERE road_id = '{road_id}'
        ORDER BY window_start DESC
        LIMIT {n}
    """
    client = get_client()
    rows, columns = client.execute(sql, with_column_types=True)
    col_names = [c[0] for c in columns]
    return [dict(zip(col_names, row)) for row in rows]


# ---------------------------------------------------------------------------
# Write predictions + anomalies
# ---------------------------------------------------------------------------

def insert_predictions(rows: list[dict[str, Any]]) -> None:
    if not rows:
        return
    client = get_client()
    client.execute(
        """
        INSERT INTO traffic_predictions
            (road_id, predicted_at, horizon_minutes,
             predicted_avg_speed, lower_bound, upper_bound, congestion_probability)
        VALUES
        """,
        [
            (
                r["road_id"],
                r["predicted_at"],
                r["horizon_minutes"],
                r["predicted_avg_speed"],
                r["lower_bound"],
                r["upper_bound"],
                r["congestion_probability"],
            )
            for r in rows
        ],
    )


def insert_anomalies(rows: list[dict[str, Any]]) -> None:
    if not rows:
        return
    client = get_client()
    client.execute(
        """
        INSERT INTO traffic_anomalies
            (road_id, road_name, detected_at, current_speed,
             expected_speed, deviation_sigma, anomaly_type, severity)
        VALUES
        """,
        [
            (
                r["road_id"],
                r["road_name"],
                r["detected_at"],
                r["current_speed"],
                r["expected_speed"],
                r["deviation_sigma"],
                r["anomaly_type"],
                r["severity"],
            )
            for r in rows
        ],
    )
