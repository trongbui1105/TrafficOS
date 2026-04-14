package com.traffic.api.repository;

import com.traffic.api.model.CityPulse;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Reads the enrichment datasets (weather, incidents, environment,
 * vehicle mix, road metadata) from ClickHouse and assembles a
 * {@link CityPulse} snapshot. Each query uses the latest row per road so
 * the result reflects "right now" rather than a historical average.
 *
 * <p>Every query casts ClickHouse Enum8 columns to String with
 * {@code toString()} to avoid the clickhouse-jdbc 0.6.3 LZ4 binary-row bug.
 */
@Repository
@RequiredArgsConstructor
public class CityPulseRepository {

    private final JdbcTemplate jdbc;

    // ---------------------------------------------------------------
    // Assembly entry point
    // ---------------------------------------------------------------
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

    // ---------------------------------------------------------------
    // Incidents
    // ---------------------------------------------------------------
    public List<CityPulse.IncidentRecord> findActiveIncidents(int limit) {
        String sql = String.format("""
                SELECT incident_id,
                       road_id,
                       road_name,
                       toString(type)     AS type,
                       toString(severity) AS severity,
                       toString(status)   AS status,
                       lanes_blocked,
                       description,
                       started_at
                FROM traffic_incidents FINAL
                WHERE status = 'active'
                ORDER BY severity DESC, started_at DESC
                LIMIT %d
                """, limit);
        return jdbc.query(sql, (rs, i) -> CityPulse.IncidentRecord.builder()
                .incidentId(rs.getString("incident_id"))
                .roadId(rs.getString("road_id"))
                .roadName(rs.getString("road_name"))
                .type(rs.getString("type"))
                .severity(rs.getString("severity"))
                .status(rs.getString("status"))
                .lanesBlocked(rs.getInt("lanes_blocked"))
                .description(rs.getString("description"))
                .startedAt(rs.getTimestamp("started_at").toInstant())
                .build());
    }

    private Map<String, Long> countActiveIncidentsByType() {
        String sql = """
                SELECT toString(type) AS type, count() AS n
                FROM traffic_incidents FINAL
                WHERE status = 'active'
                GROUP BY type
                ORDER BY n DESC
                """;
        List<Map.Entry<String, Long>> rows = jdbc.query(sql,
                (rs, i) -> Map.entry(rs.getString("type"), rs.getLong("n")));
        Map<String, Long> out = new LinkedHashMap<>();
        rows.forEach(e -> out.put(e.getKey(), e.getValue()));
        return out;
    }

    // ---------------------------------------------------------------
    // Weather
    // ---------------------------------------------------------------
    private Map<String, Long> countWeatherMix() {
        String sql = """
                SELECT toString(condition) AS cond, count() AS n
                FROM (
                    SELECT condition
                    FROM weather_observations
                    WHERE observed_at >= now() - INTERVAL 10 MINUTE
                    ORDER BY road_id, observed_at DESC
                    LIMIT 1 BY road_id
                )
                GROUP BY cond
                ORDER BY n DESC
                """;
        List<Map.Entry<String, Long>> rows = jdbc.query(sql,
                (rs, i) -> Map.entry(rs.getString("cond"), rs.getLong("n")));
        Map<String, Long> out = new LinkedHashMap<>();
        rows.forEach(e -> out.put(e.getKey(), e.getValue()));
        return out;
    }

    private CityPulse.WeatherSummary summarizeWeather() {
        // ClickHouse avg() returns the IEEE float NaN (not SQL NULL) when aggregating
        // zero rows.  ifNull() does NOT catch NaN — only isNaN() does.
        // Jackson then serialises Double.NaN as the JSON string "NaN", breaking
        // frontend .toFixed().  Use if(isNaN(x), fallback, x) to guarantee a real number.
        String sql = """
                SELECT if(isNaN(avg(temperature_c)), toFloat64(25), avg(temperature_c)) AS t,
                       if(isNaN(avg(humidity_pct)),  toFloat64(70), avg(humidity_pct))  AS h,
                       if(isNaN(avg(wind_kph)),       toFloat64(0),  avg(wind_kph))     AS w,
                       if(isNaN(avg(visibility_km)), toFloat64(10), avg(visibility_km)) AS v,
                       if(isNaN(sum(rain_mm)),        toFloat64(0),  sum(rain_mm))      AS r
                FROM (
                    SELECT *
                    FROM weather_observations
                    WHERE observed_at >= now() - INTERVAL 10 MINUTE
                    ORDER BY road_id, observed_at DESC
                    LIMIT 1 BY road_id
                )
                """;
        return jdbc.queryForObject(sql, (rs, i) -> CityPulse.WeatherSummary.builder()
                .avgTemperatureC(rs.getDouble("t"))
                .avgHumidityPct(rs.getDouble("h"))
                .avgWindKph(rs.getDouble("w"))
                .avgVisibilityKm(rs.getDouble("v"))
                .totalRainMm(rs.getDouble("r"))
                .build());
    }

    // ---------------------------------------------------------------
    // Environment (air quality + noise)
    // ---------------------------------------------------------------
    private CityPulse.EnvironmentSummary summarizeEnvironment() {
        // ClickHouse avg() returns IEEE NaN (not SQL NULL) for 0 rows.
        // isNaN() is the correct guard — ifNull() does not intercept NaN.
        String sql = """
                SELECT if(isNaN(avg(pm25)),     toFloat64(0),  avg(pm25))     AS pm25,
                       if(isNaN(avg(pm10)),     toFloat64(0),  avg(pm10))     AS pm10,
                       if(isNaN(avg(no2)),      toFloat64(0),  avg(no2))      AS no2,
                       if(isNaN(avg(co_ppm)),   toFloat64(0),  avg(co_ppm))   AS co,
                       if(isNaN(avg(aqi)),      toFloat64(0),  avg(aqi))      AS aqi,
                       if(isNaN(avg(noise_db)), toFloat64(0),  avg(noise_db)) AS n
                FROM (
                    SELECT *
                    FROM environment_metrics
                    WHERE observed_at >= now() - INTERVAL 5 MINUTE
                    ORDER BY road_id, observed_at DESC
                    LIMIT 1 BY road_id
                )
                """;
        return jdbc.queryForObject(sql, (rs, i) -> {
            int aqi = (int) Math.round(rs.getDouble("aqi"));
            return CityPulse.EnvironmentSummary.builder()
                    .avgPm25(rs.getDouble("pm25"))
                    .avgPm10(rs.getDouble("pm10"))
                    .avgNo2(rs.getDouble("no2"))
                    .avgCoPpm(rs.getDouble("co"))
                    .avgAqi(aqi)
                    .avgNoiseDb(rs.getDouble("n"))
                    .airQualityLabel(aqiLabel(aqi))
                    .build();
        });
    }

    private static String aqiLabel(int aqi) {
        if (aqi <= 50)  return "Good";
        if (aqi <= 100) return "Moderate";
        if (aqi <= 150) return "Unhealthy for Sensitive Groups";
        if (aqi <= 200) return "Unhealthy";
        if (aqi <= 300) return "Very Unhealthy";
        return "Hazardous";
    }

    // ---------------------------------------------------------------
    // Vehicle mix
    // ---------------------------------------------------------------
    private CityPulse.VehicleMixSummary summarizeVehicleMix() {
        // sum() of 0 rows also returns NaN for UInt32 columns in some ClickHouse versions.
        String sql = """
                SELECT if(isNaN(toFloat64(sum(cars))),         toUInt64(0), sum(cars))         AS cars,
                       if(isNaN(toFloat64(sum(trucks))),       toUInt64(0), sum(trucks))       AS trucks,
                       if(isNaN(toFloat64(sum(buses))),        toUInt64(0), sum(buses))        AS buses,
                       if(isNaN(toFloat64(sum(motorcycles))),  toUInt64(0), sum(motorcycles))  AS motorcycles,
                       if(isNaN(toFloat64(sum(bicycles))),     toUInt64(0), sum(bicycles))     AS bicycles,
                       if(isNaN(toFloat64(sum(emergency))),    toUInt64(0), sum(emergency))    AS emergency,
                       if(isNaN(toFloat64(sum(pedestrians))),  toUInt64(0), sum(pedestrians))  AS pedestrians
                FROM (
                    SELECT *
                    FROM vehicle_classification
                    WHERE observed_at >= now() - INTERVAL 5 MINUTE
                    ORDER BY road_id, observed_at DESC
                    LIMIT 1 BY road_id
                )
                """;
        return jdbc.queryForObject(sql, (rs, i) -> CityPulse.VehicleMixSummary.builder()
                .cars(rs.getLong("cars"))
                .trucks(rs.getLong("trucks"))
                .buses(rs.getLong("buses"))
                .motorcycles(rs.getLong("motorcycles"))
                .bicycles(rs.getLong("bicycles"))
                .emergency(rs.getLong("emergency"))
                .pedestrians(rs.getLong("pedestrians"))
                .build());
    }

    // ---------------------------------------------------------------
    // Per-district aggregates
    // ---------------------------------------------------------------
    private List<CityPulse.DistrictSnapshot> findDistrictSnapshots() {
        String sql = """
                WITH
                  latest_env AS (
                      SELECT road_id, aqi
                      FROM environment_metrics
                      WHERE observed_at >= now() - INTERVAL 10 MINUTE
                      ORDER BY road_id, observed_at DESC
                      LIMIT 1 BY road_id
                  ),
                  latest_speed AS (
                      SELECT road_id, avg_speed
                      FROM traffic_analyzed
                      WHERE window_start >= now() - INTERVAL 30 MINUTE
                      ORDER BY road_id, window_start DESC
                      LIMIT 1 BY road_id
                  ),
                  active_counts AS (
                      SELECT road_id, count() AS n
                      FROM traffic_incidents FINAL
                      WHERE status = 'active'
                      GROUP BY road_id
                  )
                SELECT m.district                                                      AS district,
                       count(DISTINCT m.road_id)                                       AS road_count,
                       if(isNaN(avg(ls.avg_speed)), toFloat64(0), avg(ls.avg_speed))   AS avg_speed,
                       if(isNaN(avg(le.aqi)),        toFloat64(0), avg(le.aqi))        AS avg_aqi,
                       coalesce(sum(ac.n), 0)                                          AS active_incidents
                FROM   road_metadata m FINAL
                LEFT JOIN latest_env    le ON le.road_id = m.road_id
                LEFT JOIN latest_speed  ls ON ls.road_id = m.road_id
                LEFT JOIN active_counts ac ON ac.road_id = m.road_id
                GROUP BY m.district
                ORDER BY m.district
                """;
        return jdbc.query(sql, (rs, i) -> CityPulse.DistrictSnapshot.builder()
                .district(rs.getString("district"))
                .roadCount(rs.getInt("road_count"))
                .avgSpeed(rs.getDouble("avg_speed"))
                .avgAqi((int) Math.round(rs.getDouble("avg_aqi")))
                .activeIncidents(rs.getInt("active_incidents"))
                .build());
    }

    // ---------------------------------------------------------------
    // Road metadata list (used by /api/v1/roads/meta)
    // ---------------------------------------------------------------
    public List<Map<String, Object>> findAllRoadMeta() {
        String sql = """
                SELECT road_id,
                       road_name,
                       district,
                       toString(road_type) AS road_type,
                       lanes,
                       speed_limit,
                       length_km,
                       lat,
                       lon
                FROM road_metadata FINAL
                ORDER BY road_id
                """;
        return jdbc.query(sql, (rs, i) -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("roadId",     rs.getString("road_id"));
            row.put("roadName",   rs.getString("road_name"));
            row.put("district",   rs.getString("district"));
            row.put("roadType",   rs.getString("road_type"));
            row.put("lanes",      rs.getInt("lanes"));
            row.put("speedLimit", rs.getInt("speed_limit"));
            row.put("lengthKm",   rs.getDouble("length_km"));
            row.put("lat",        rs.getDouble("lat"));
            row.put("lon",        rs.getDouble("lon"));
            return row;
        });
    }

    // ---------------------------------------------------------------
    // Per-road endpoints (drill-down)
    // ---------------------------------------------------------------
    public Map<String, Object> findLatestWeather(String roadId) {
        String sql = """
                SELECT road_id,
                       observed_at,
                       toString(condition) AS condition,
                       temperature_c,
                       humidity_pct,
                       wind_kph,
                       visibility_km,
                       rain_mm
                FROM weather_observations
                WHERE road_id = ?
                ORDER BY observed_at DESC
                LIMIT 1
                """;
        List<Map<String, Object>> out = jdbc.query(sql, new Object[]{roadId}, (rs, i) -> weatherRow(rs));
        return out.isEmpty() ? null : out.get(0);
    }

    public List<Map<String, Object>> findVehicleMixHistory(String roadId, int limit) {
        String sql = String.format("""
                SELECT road_id, observed_at, cars, trucks, buses,
                       motorcycles, bicycles, emergency, pedestrians
                FROM vehicle_classification
                WHERE road_id = ?
                ORDER BY observed_at DESC
                LIMIT %d
                """, limit);
        return jdbc.query(sql, new Object[]{roadId}, (rs, i) -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("roadId",      rs.getString("road_id"));
            row.put("observedAt",  rs.getTimestamp("observed_at").toInstant());
            row.put("cars",        rs.getInt("cars"));
            row.put("trucks",      rs.getInt("trucks"));
            row.put("buses",       rs.getInt("buses"));
            row.put("motorcycles", rs.getInt("motorcycles"));
            row.put("bicycles",    rs.getInt("bicycles"));
            row.put("emergency",   rs.getInt("emergency"));
            row.put("pedestrians", rs.getInt("pedestrians"));
            return row;
        });
    }

    public List<Map<String, Object>> findEnvironmentHistory(String roadId, int limit) {
        String sql = String.format("""
                SELECT road_id, observed_at, pm25, pm10, no2, co_ppm, aqi, noise_db
                FROM environment_metrics
                WHERE road_id = ?
                ORDER BY observed_at DESC
                LIMIT %d
                """, limit);
        return jdbc.query(sql, new Object[]{roadId}, (rs, i) -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("roadId",     rs.getString("road_id"));
            row.put("observedAt", rs.getTimestamp("observed_at").toInstant());
            row.put("pm25",       rs.getFloat("pm25"));
            row.put("pm10",       rs.getFloat("pm10"));
            row.put("no2",        rs.getFloat("no2"));
            row.put("coPpm",      rs.getFloat("co_ppm"));
            row.put("aqi",        rs.getInt("aqi"));
            row.put("noiseDb",    rs.getFloat("noise_db"));
            return row;
        });
    }

    private static Map<String, Object> weatherRow(ResultSet rs) throws SQLException {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("roadId",       rs.getString("road_id"));
        row.put("observedAt",   rs.getTimestamp("observed_at").toInstant());
        row.put("condition",    rs.getString("condition"));
        row.put("temperatureC", rs.getFloat("temperature_c"));
        row.put("humidityPct",  rs.getInt("humidity_pct"));
        row.put("windKph",      rs.getFloat("wind_kph"));
        row.put("visibilityKm", rs.getFloat("visibility_km"));
        row.put("rainMm",       rs.getFloat("rain_mm"));
        return row;
    }

    public List<Map<String, Object>> findAllLatestWeather() {
        // Use an explicit RowMapper rather than a RowCallbackHandler — the
        // clickhouse-jdbc 0.6.3 driver trips on some callback iteration paths.
        String sql = """
                SELECT road_id,
                       observed_at,
                       toString(condition) AS condition,
                       temperature_c,
                       humidity_pct,
                       wind_kph,
                       visibility_km,
                       rain_mm
                FROM weather_observations
                WHERE observed_at >= now() - INTERVAL 10 MINUTE
                ORDER BY road_id, observed_at DESC
                LIMIT 1 BY road_id
                """;
        return jdbc.query(sql, (rs, i) -> weatherRow(rs));
    }
}
