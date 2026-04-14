# Data Models

## Avro Schemas (Kafka)

### TrafficEvent — `traffic.raw`
```json
{
  "type": "record",
  "name": "TrafficEvent",
  "namespace": "com.traffic",
  "fields": [
    { "name": "eventType",    "type": "string" },
    { "name": "roadId",       "type": "string" },
    { "name": "roadName",     "type": "string" },
    { "name": "vehicleCount", "type": "int" },
    { "name": "avgSpeed",     "type": "double" },
    { "name": "timestamp",    "type": "long", "logicalType": "timestamp-millis" }
  ]
}
```

### TrafficAnalyzedEvent — `traffic.analyzed`
```json
{
  "type": "record",
  "name": "TrafficAnalyzedEvent",
  "namespace": "com.traffic",
  "fields": [
    { "name": "roadId",        "type": "string" },
    { "name": "roadName",      "type": "string" },
    { "name": "windowStart",   "type": "long" },
    { "name": "windowEnd",     "type": "long" },
    { "name": "totalVehicles", "type": "int" },
    { "name": "avgSpeed",      "type": "double" },
    { "name": "congested",     "type": "boolean" }
  ]
}
```

---

## ClickHouse Tables

### `traffic_analyzed`
| Column | Type | Description |
|---|---|---|
| `road_id` | String | Road identifier (R001–R572) |
| `road_name` | String | Full road name |
| `window_start` | DateTime | Start of 30s aggregation window |
| `window_end` | DateTime | End of 30s aggregation window |
| `total_vehicles` | UInt32 | Sum of vehicle counts in window |
| `avg_speed` | Float32 | Average speed in km/h |
| `congested` | Bool | True if avg_speed < 20 km/h |

Engine: `MergeTree()`, partition by month, TTL 90 days, order by `(road_id, window_start)`

---

### `traffic_alerts`
| Column | Type | Description |
|---|---|---|
| `road_id` | String | |
| `road_name` | String | |
| `severity` | Enum8 | `LOW`=1, `MEDIUM`=2, `HIGH`=3 |
| `message` | String | Human-readable alert text |
| `triggered_at` | DateTime | When the alert fired |

Engine: `MergeTree()`, TTL 30 days, order by `(road_id, triggered_at)`

---

### `road_metadata`
| Column | Type | Description |
|---|---|---|
| `road_id` | String | Primary key |
| `road_name` | String | |
| `district` | String | HCMC administrative district |
| `road_type` | Enum8 | `highway`=1, `arterial`=2, `collector`=3, `local`=4 |
| `lanes` | UInt8 | Number of lanes (2–6) |
| `speed_limit` | UInt16 | Posted speed limit km/h |
| `length_km` | Float32 | Physical road length |
| `lat` | Float64 | Latitude (WGS-84) |
| `lon` | Float64 | Longitude (WGS-84) |
| `updated_at` | DateTime | Upsert timestamp |

Engine: `ReplacingMergeTree(updated_at)`, order by `road_id`

---

### `weather_observations`
| Column | Type | Description |
|---|---|---|
| `road_id` | String | |
| `observed_at` | DateTime | Observation timestamp |
| `condition` | Enum8 | `clear`=1 .. `haze`=7 |
| `temperature_c` | Float32 | °C (range 20–38) |
| `humidity_pct` | UInt8 | % (range 40–98) |
| `wind_kph` | Float32 | Wind speed in km/h |
| `visibility_km` | Float32 | Visibility in km |
| `rain_mm` | Float32 | Rainfall in mm (0 when dry) |

Engine: `MergeTree()`, partition by month, TTL 30 days, order by `(road_id, observed_at)`

---

### `traffic_incidents`
| Column | Type | Description |
|---|---|---|
| `incident_id` | String | `INC-{unix}-{seq}` — globally unique |
| `road_id` | String | |
| `road_name` | String | |
| `type` | Enum8 | `accident`=1 .. `debris`=7 |
| `severity` | Enum8 | `LOW`=1, `MEDIUM`=2, `HIGH`=3 |
| `status` | Enum8 | `active`=1, `resolved`=2 |
| `lanes_blocked` | UInt8 | 1–3 |
| `description` | String | Human-readable description |
| `started_at` | DateTime | When incident began |
| `ended_at` | Nullable(DateTime) | When resolved (null if still active) |
| `updated_at` | DateTime | Upsert key for deduplication |

Engine: `ReplacingMergeTree(updated_at)`, partition by month, order by `(road_id, incident_id)`

> Query with `FINAL` to force deduplication: `SELECT * FROM traffic_incidents FINAL WHERE status = 'active'`

---

### `environment_metrics`
| Column | Type | Description |
|---|---|---|
| `road_id` | String | |
| `observed_at` | DateTime | |
| `pm25` | Float32 | Fine particulate matter µg/m³ |
| `pm10` | Float32 | Coarse particulate matter µg/m³ |
| `no2` | Float32 | Nitrogen dioxide ppb |
| `co_ppm` | Float32 | Carbon monoxide ppm |
| `aqi` | UInt16 | Air Quality Index (10–500) |
| `noise_db` | Float32 | Noise level in dB |

Engine: `MergeTree()`, partition by month, TTL 30 days, order by `(road_id, observed_at)`

---

### `vehicle_classification`
| Column | Type | Description |
|---|---|---|
| `road_id` | String | |
| `observed_at` | DateTime | |
| `cars` | UInt32 | |
| `trucks` | UInt32 | |
| `buses` | UInt32 | |
| `motorcycles` | UInt32 | HCMC-dominant vehicle class |
| `bicycles` | UInt32 | |
| `emergency` | UInt32 | Rare (ambulances, police, fire) |
| `pedestrians` | UInt32 | Near-road pedestrian estimate |

Engine: `MergeTree()`, partition by month, TTL 30 days, order by `(road_id, observed_at)`

---

## Go Structs (simulator enrichment)

```go
type RoadMeta     struct { RoadID, RoadName, District, RoadType string; Lanes, SpeedLimit int; LengthKm, Lat, Lon float64; UpdatedAt string }
type Weather      struct { RoadID, ObservedAt, Condition string; TemperatureC float32; HumidityPct int; WindKph, VisibilityKm, RainMm float32 }
type Incident     struct { IncidentID, RoadID, RoadName, Type, Severity, Status string; LanesBlocked int; Description, StartedAt string; EndedAt *string; UpdatedAt string }
type Environment  struct { RoadID, ObservedAt string; PM25, PM10, NO2, COPpm float32; AQI int; NoiseDb float32 }
type VehicleMix   struct { RoadID, ObservedAt string; Cars, Trucks, Buses, Motorcycles, Bicycles, Emergency, Pedestrians int }
```

---

## Java Models (traffic-api)

```java
// Current road state — served from Redis
record RoadStatus(String roadId, String roadName, int totalVehicles, double avgSpeed, boolean congested, Instant updatedAt) {}

// Historical windowed data — from ClickHouse traffic_analyzed
record RoadHistory(String roadId, String roadName, Instant windowStart, Instant windowEnd, int totalVehicles, double avgSpeed, boolean congested) {}

// Congestion alert — from ClickHouse traffic_alerts
record AlertEvent(String roadId, String roadName, String severity, String message, Instant triggeredAt) {}

// Aggregated city snapshot — assembled from all enrichment tables
class CityPulse {
    Instant generatedAt;
    Map<String, Long>           activeIncidentsByType;
    List<IncidentRecord>        activeIncidents;
    Map<String, Long>           weatherMix;
    WeatherSummary              weather;
    EnvironmentSummary          environment;
    VehicleMixSummary           vehicles;
    List<DistrictSnapshot>      districts;
}
```
