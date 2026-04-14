# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run Commands

### Docker Compose (full stack)
```bash
# Start all infrastructure + services
docker compose -f deployment/docker-compose.yml up --build

# Rebuild a single service (e.g. traffic-api)
docker compose -f deployment/docker-compose.yml up -d --build traffic-api

# Start only infrastructure
docker compose -f deployment/docker-compose.yml up kafka schema-registry clickhouse redis kafka-ui
```

### traffic-simulator (Go)
```bash
cd traffic-simulator
go run ./cmd/simulator        # run
go build -o bin/simulator ./cmd/simulator  # build
go test ./...                 # test
go vet ./...                  # lint
```

### Java Spring Boot services (traffic-stream-processor-java, traffic-api, traffic-alert-engine)
```bash
cd <service-dir>
./mvnw spring-boot:run        # run
./mvnw package -DskipTests    # build jar
./mvnw test                   # test
./mvnw verify                 # test + integration tests
```

### traffic-dashboard (Next.js 16)
```bash
cd traffic-dashboard
npm install
npm run dev      # dev server
npm run build    # production build
npm test         # unit tests
npm run lint     # lint
```

### traffic-predictor (Python / FastAPI)
```bash
cd traffic-predictor
pip install -r requirements.txt
uvicorn main:app --reload --port 8000   # dev server
# Swagger UI: http://localhost:8000/docs
```

---

## Architecture

### Data Flow
```
[traffic-simulator (Go)]
        │ Avro via Schema Registry              HTTP INSERT (JSONEachRow)
        ▼                                       ┌─────────────────────────────────┐
[Kafka: traffic.raw]                            │ road_metadata (startup, once)   │
        │                                       │ weather_observations (every 30s)│
[traffic-stream-processor (Spring Boot + Kafka Streams)]                          │
        ├──► [Kafka: traffic.analyzed] ──► [traffic-api (Spring WebFlux)]         │ traffic_incidents (every 20s)   │
        │                                         │ WebSocket                      │ environment_metrics (every 5s)  │
        ├──► [ClickHouse: traffic_analyzed]        └──► [traffic-dashboard (Next.js)]│ vehicle_classification (every 5s)│
        │                                                                          └─────────────────────────────────┘
[Kafka: traffic.analyzed]                                    ↑ ClickHouse
        │
[traffic-alert-engine (Spring Boot + Spring Kafka)]
        ├──► [Kafka: traffic.alerts]
        └──► [ClickHouse: traffic_alerts]

[traffic-api] ──► Redis (current road state, TTL 60s)
              ──► ClickHouse (historical + enrichment queries)

[All services] ──► [OTel Collector] ──► Prometheus / Jaeger / Grafana
```

### Services

| Service | Language / Framework | Role |
|---|---|---|
| `traffic-simulator` | Go 1.25 | Generates synthetic traffic events (572 roads); publishes to `traffic.raw` via Kafka (Avro + Schema Registry); writes 5 enrichment datasets directly to ClickHouse |
| `traffic-stream-processor-java` | Java 21 + Spring Boot 3 + Kafka Streams | Stateful windowed aggregation (30s tumbling windows); outputs to `traffic.analyzed` topic and ClickHouse |
| `traffic-api` | Java 21 + Spring Boot 3 + Spring WebFlux | Reactive REST API + WebSocket; serves current state from Redis, history + enrichment from ClickHouse; proxies ML forecasts from `traffic-predictor` |
| `traffic-alert-engine` | Java 21 + Spring Boot 3 + Spring Kafka | Consumes `traffic.analyzed`; fires severity alerts to `traffic.alerts` and ClickHouse; sends webhook notifications (Slack/Discord/Teams) for HIGH alerts |
| `traffic-predictor` | Python 3.12 + FastAPI + scikit-learn | ML speed forecasting (α=0.65 historical baseline + β=0.35 trend); anomaly detection (z-score ≥ 2σ); exposes `/predict/{road}`, `/predict/city`, `/anomalies`; persists to ClickHouse; Prometheus metrics |
| `traffic-dashboard` | Next.js 16 + TypeScript | Real-time map + time-series charts + City Pulse + ML forecast + anomaly pages; WebSocket for live updates, SWR for REST polling |

### Kafka Topics

| Topic | Schema | Producer | Consumers |
|---|---|---|---|
| `traffic.raw` | Avro (`TrafficEvent`) | traffic-simulator | traffic-stream-processor-java |
| `traffic.analyzed` | Avro (`TrafficAnalyzedEvent`) | traffic-stream-processor-java | traffic-api, traffic-alert-engine |
| `traffic.alerts` | JSON (`AlertEvent`) | traffic-alert-engine | traffic-api |

### Key Data Models
```java
// Raw event — traffic.raw
TrafficEvent { eventType, roadId, roadName, vehicleCount (int), avgSpeed (double), timestamp (long ms) }

// Analyzed event — traffic.analyzed
TrafficAnalyzedEvent { roadId, roadName, windowStart, windowEnd, totalVehicles (int), avgSpeed (double), congested (boolean) }

// Alert event — traffic.alerts
AlertEvent { roadId, roadName, severity (LOW|MEDIUM|HIGH), message, triggeredAt }
```

### Alert Severity Rules
| avg_speed | Severity |
|---|---|
| < 10 km/h | HIGH |
| < 20 km/h | MEDIUM |
| < 30 km/h | LOW |

### traffic-api Endpoints
```
GET  /api/v1/roads                          → all roads, current state (Redis)
GET  /api/v1/roads/meta                     → road metadata: district, type, lanes, coords (ClickHouse)
GET  /api/v1/roads/{id}                     → single road current state (Redis)
GET  /api/v1/roads/{id}/history?from=&to=   → historical windowed data (ClickHouse)
GET  /api/v1/roads/{id}/analytics           → hourly aggregates last 24h (ClickHouse)
GET  /api/v1/roads/{id}/weather             → latest weather for road (ClickHouse)
GET  /api/v1/roads/{id}/vehicle-mix?limit=  → vehicle class breakdown history (ClickHouse)
GET  /api/v1/roads/{id}/environment?limit=  → air quality + noise history (ClickHouse)
GET  /api/v1/roads/{id}/forecast            → ML speed forecast (proxied to traffic-predictor)
GET  /api/v1/alerts?limit=                  → recent congestion alerts (ClickHouse)
GET  /api/v1/city/pulse                     → aggregated city-wide snapshot (ClickHouse, all enrichment tables)
GET  /api/v1/incidents/active?limit=        → currently active incidents (ClickHouse)
GET  /api/v1/weather                        → latest weather per road (ClickHouse)
GET  /api/v1/predict/city                   → city-wide ML congestion forecast (proxied to traffic-predictor)
GET  /api/v1/anomalies                      → ML anomaly detection results (proxied to traffic-predictor)
GET  /api/v1/predictor/health               → traffic-predictor service health + model stats
WS   /ws/live                               → real-time road updates + alert events
```

### WebSocket Message Format
```json
{ "type": "road_update", "data": { "roadId": "...", "avgSpeed": 15.2, "congested": true, "timestamp": "..." } }
{ "type": "alert",       "data": { "roadId": "...", "severity": "HIGH", "message": "..." } }
```

---

## ClickHouse Schema

### ML tables (traffic-predictor)
```sql
-- Per-road speed forecasts (all horizons, written every minute)
CREATE TABLE traffic_predictions (
    road_id String, predicted_at DateTime, horizon_minutes UInt8,
    predicted_avg_speed Float32, lower_bound Float32, upper_bound Float32,
    congestion_probability Float32
) ENGINE = MergeTree() PARTITION BY toYYYYMM(predicted_at)
ORDER BY (road_id, predicted_at, horizon_minutes)
TTL predicted_at + INTERVAL 7 DAY;

-- Anomalies detected by z-score ML engine
CREATE TABLE traffic_anomalies (
    road_id String, road_name String, detected_at DateTime,
    current_speed Float32, expected_speed Float32, deviation_sigma Float32,
    anomaly_type Enum8('slow_anomaly'=1,'fast_anomaly'=2),
    severity Enum8('LOW'=1,'MEDIUM'=2,'HIGH'=3)
) ENGINE = MergeTree() PARTITION BY toYYYYMM(detected_at)
ORDER BY (road_id, detected_at)
TTL detected_at + INTERVAL 14 DAY;
```

### Core tables (stream-processor / alert-engine)
```sql
-- 30s tumbling-window aggregations
CREATE TABLE traffic_analyzed (
    road_id String, road_name String,
    window_start DateTime, window_end DateTime,
    total_vehicles UInt32, avg_speed Float32, congested Bool
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(window_start)
ORDER BY (road_id, window_start)
TTL window_start + INTERVAL 90 DAY;

-- Congestion alerts
CREATE TABLE traffic_alerts (
    road_id String, road_name String,
    severity Enum8('LOW'=1,'MEDIUM'=2,'HIGH'=3),
    message String, triggered_at DateTime
) ENGINE = MergeTree()
ORDER BY (road_id, triggered_at)
TTL triggered_at + INTERVAL 30 DAY;
```

### Enrichment tables (simulator direct insert)
```sql
-- Static road metadata, upserted on startup
CREATE TABLE road_metadata (
    road_id String, road_name String, district String,
    road_type Enum8('highway'=1,'arterial'=2,'collector'=3,'local'=4),
    lanes UInt8, speed_limit UInt16, length_km Float32, lat Float64, lon Float64,
    updated_at DateTime
) ENGINE = ReplacingMergeTree(updated_at) ORDER BY road_id;

-- Per-road weather every 30s
CREATE TABLE weather_observations (
    road_id String, observed_at DateTime,
    condition Enum8('clear'=1,'cloudy'=2,'rain'=3,'heavy_rain'=4,'fog'=5,'storm'=6,'haze'=7),
    temperature_c Float32, humidity_pct UInt8, wind_kph Float32,
    visibility_km Float32, rain_mm Float32
) ENGINE = MergeTree() PARTITION BY toYYYYMM(observed_at) ORDER BY (road_id, observed_at)
TTL observed_at + INTERVAL 30 DAY;

-- Traffic incidents with active/resolved lifecycle
CREATE TABLE traffic_incidents (
    incident_id String, road_id String, road_name String,
    type Enum8('accident'=1,'roadwork'=2,'breakdown'=3,'protest'=4,'flood'=5,'event'=6,'debris'=7),
    severity Enum8('LOW'=1,'MEDIUM'=2,'HIGH'=3),
    status Enum8('active'=1,'resolved'=2),
    lanes_blocked UInt8, description String,
    started_at DateTime, ended_at Nullable(DateTime), updated_at DateTime
) ENGINE = ReplacingMergeTree(updated_at)
PARTITION BY toYYYYMM(started_at) ORDER BY (road_id, incident_id);

-- Air quality + noise every 5s
CREATE TABLE environment_metrics (
    road_id String, observed_at DateTime,
    pm25 Float32, pm10 Float32, no2 Float32, co_ppm Float32, aqi UInt16, noise_db Float32
) ENGINE = MergeTree() PARTITION BY toYYYYMM(observed_at) ORDER BY (road_id, observed_at)
TTL observed_at + INTERVAL 30 DAY;

-- Vehicle class breakdown every 5s
CREATE TABLE vehicle_classification (
    road_id String, observed_at DateTime,
    cars UInt32, trucks UInt32, buses UInt32,
    motorcycles UInt32, bicycles UInt32, emergency UInt32, pedestrians UInt32
) ENGINE = MergeTree() PARTITION BY toYYYYMM(observed_at) ORDER BY (road_id, observed_at)
TTL observed_at + INTERVAL 30 DAY;
```

---

## Infrastructure Ports

| Service | Port | UI |
|---|---|---|
| **Traefik** (API gateway) | 80 | http://localhost (routes all traffic) |
| Traefik Dashboard | 8888 | http://localhost:8888/dashboard/ |
| Kafka | 9092 | — |
| Kafka UI | 8081 | http://localhost:8081 (also at http://localhost/kafka via Traefik) |
| Schema Registry | 8082 | http://localhost:8082 |
| ClickHouse HTTP | 8123 | DBeaver / curl |
| ClickHouse native | 9000 | clickhouse-driver |
| Redis | 6379 | — |
| **MinIO** S3 API | 9002 | `aws s3 --endpoint http://localhost:9002` |
| **MinIO** Console UI | 9001 | http://localhost:9001 (admin: trafficadmin / trafficadmin123) |
| traffic-stream-processor-java | 8090 | http://localhost:8090/actuator/health |
| traffic-api | 8080 | http://localhost:8080 (also at http://localhost/api and /ws) |
| traffic-alert-engine | 8091 | http://localhost:8091/actuator/health |
| **traffic-predictor** | 8000 | http://localhost:8000/docs (FastAPI Swagger) |
| traffic-dashboard | 3000 | http://localhost:3000 (also at http://localhost/) |
| Prometheus | 9090 | http://localhost:9090 |
| Grafana | 3001 | http://localhost:3001 |
| Jaeger | 16686 | http://localhost:16686 |
| **Loki** | 3100 | internal (accessed via Grafana datasource) |
| **Apache Superset** | 8088 | http://localhost:8088 (admin/admin) |
| OTel Collector gRPC | 4317 | — |
| OTel Collector HTTP | 4318 | — |

---

## Environment Variables

### traffic-simulator (Go)
| Var | Default | Description |
|---|---|---|
| `KAFKA_BROKER` | `kafka:9092` | Kafka bootstrap server |
| `KAFKA_TOPIC` | `traffic.raw` | Kafka output topic |
| `SCHEMA_REGISTRY_URL` | `http://schema-registry:8082` | Schema Registry URL |
| `CLICKHOUSE_URL` | `http://clickhouse:8123` | ClickHouse HTTP endpoint for direct enrichment inserts |
| `GENERATOR_INTERVAL` | `5s` | How often traffic events are published per road |
| `WEATHER_INTERVAL` | `30s` | How often weather observations are written |
| `INCIDENT_INTERVAL` | `20s` | How often incident lifecycle is ticked |
| `MINIO_ENDPOINT` | `http://minio:9000` | MinIO S3-compatible endpoint |
| `MINIO_ACCESS_KEY` | `trafficadmin` | MinIO access key |
| `MINIO_SECRET_KEY` | `trafficadmin123` | MinIO secret key |

### traffic-predictor (Python / FastAPI)
| Var | Default | Description |
|---|---|---|
| `CLICKHOUSE_HOST` | `clickhouse` | ClickHouse host |
| `CLICKHOUSE_PORT` | `9000` | ClickHouse native port |
| `REDIS_HOST` | `redis` | Redis host |
| `REDIS_PORT` | `6379` | Redis port |
| `RETRAIN_INTERVAL` | `300` | Model retrain interval (seconds) |
| `REFRESH_INTERVAL` | `10` | Current speed refresh from ClickHouse (seconds) |
| `PERSIST_INTERVAL` | `60` | Write predictions + anomalies to ClickHouse (seconds) |
| `PRED_ALPHA` | `0.65` | Historical baseline weight in forecast blend |
| `PRED_ANOMALY_SIGMA` | `2.0` | Z-score threshold for anomaly detection |
| `PRED_TREND_WINDOWS` | `8` | Number of recent windows for trend extrapolation |
| `PRED_CONGESTED_KMH` | `20.0` | Speed threshold for congestion classification |

### traffic-alert-engine (Spring Boot)
| Var | Default | Description |
|---|---|---|
| `ALERT_WEBHOOK_URL` | _(empty)_ | Webhook URL — if set, HIGH alerts are POSTed here |
| `ALERT_WEBHOOK_SEVERITY` | `HIGH` | Minimum severity to trigger webhook (`HIGH`, `MEDIUM`, `LOW`) |

### Spring Boot services (application.yml)
All three Spring Boot services use Spring's environment binding. Key properties:
```yaml
spring.kafka.bootstrap-servers: kafka:9092
schema.registry.url: http://schema-registry:8082
clickhouse.url: jdbc:ch://clickhouse:8123/default?compress=0   # compress=0 workaround for clickhouse-jdbc 0.6.3 LZ4 bug
spring.data.redis.host: redis
```

> **Note:** `?compress=0` is required for `clickhouse-jdbc 0.6.3`. That version has a bug where LZ4-compressed binary row responses mis-parse Enum8 columns. Disabling compression forces plain text rows.

---

## Simulator Enrichment Pipeline

The `traffic-simulator` writes five enrichment datasets **directly to ClickHouse** over HTTP (JSONEachRow format), bypassing Kafka for operational simplicity:

| Dataset | Table | Interval | Content |
|---|---|---|---|
| Road metadata | `road_metadata` | Once at startup | District, road type, lanes, speed limit, lat/lon |
| Weather | `weather_observations` | 30s | Condition, temperature, humidity, wind, rain, visibility |
| Incidents | `traffic_incidents` | 20s | Type, severity, active/resolved lifecycle, lane count |
| Environment | `environment_metrics` | 5s | PM2.5, PM10, NO₂, CO, AQI, noise dB |
| Vehicles | `vehicle_classification` | 5s | Cars, trucks, buses, motorcycles, bicycles, emergency, pedestrians |

Weather and incidents influence the Kafka-bound `TrafficEvent`:
- Rainy/stormy weather applies a speed multiplier (0.5–1.0)
- Each active incident on a road reduces speed by a further 15%

---

## Dashboard Pages

| Route | Description |
|---|---|
| `/` | Dashboard home — animated CityScore gauge, stat cards, top alerts, worst roads |
| `/pulse` | City Pulse — AQI, weather mix, vehicle class donut, incident feed, district table |
| `/map` | Live Leaflet map — CircleMarker per road, colour-coded by congestion |
| `/analytics` | Bar/pie charts — 25 slowest roads (dynamic height so all Y-axis labels fit), peak hours, congestion breakdown |
| `/leaderboard` | Best/worst roads ranking with sparklines |
| `/alerts` | Alert feed with CSV export, severity filters |
| `/anomalies` | ML anomaly detection — roads with z-score deviation ≥ 2σ from baseline, grouped by severity |
| `/predictions` | City-wide ML forecast — speed gauges (now/+30min/+1h), congestion % trajectory, peak/improving roads (shows road name, links to road detail) |
| `/roads/[id]` | Road detail — ML forecast chart with confidence bands + congestion probability, last-hour speed, 24h analytics |

### Sidebar Notification Badges
The `Sidebar` component polls `/api/v1/alerts` and `/api/v1/anomalies` and shows red badges:
- **Alerts badge** — count of alerts newer than the last time the user visited `/alerts`; cleared immediately on navigation (not waiting for SWR revalidation). Last-seen timestamp stored in `localStorage` key `nav_alerts_seen_at`.
- **Anomalies badge** — total count of current anomalies; clears to 0 while on `/anomalies`.
- Mobile: small red dot on icon. Desktop: numbered pill next to label. Capped at `99+`.

---

## ML Predictor Notes

### Model approach
`traffic-predictor` uses a lightweight two-component model per road (no heavy training):
```
predicted_speed(road, t+h) = α × historical_baseline(road, hour, weekday)
                            + β × trend_extrapolation(road, current_speed)
```
- `α = 0.65` (env `PRED_ALPHA`), `β = 0.35`
- **Historical baseline** — mean ± std from past data bucketed by `(hour_of_day, day_of_week)`
- **Trend** — mean-reversion: `clip(-delta × 0.05, -2.0, 2.0)` km/h per minute
- Trains on `traffic_analyzed` (last 7 days) on startup and every 5 minutes
- **Anomaly detection** — z-score against hourly baseline; flagged when `|z| ≥ 2.0σ`

### API response serialisation (camelCase)
All Pydantic models in `traffic-predictor/models.py` extend `_CamelModel` which applies a custom
alias generator `_to_camel`. It converts `snake_case` → `camelCase` but **does not capitalise the
first letter of a segment that starts with a digit**:

| Field (Python) | JSON key | TypeScript field |
|---|---|---|
| `next_30min` | `next30min` | `next30min` |
| `next_1h` | `next1h` | `next1h` |
| `next_30min_congestion_pct` | `next30minCongestionPct` | `next30minCongestionPct` |
| `city_avg_speed_30min` | `cityAvgSpeed30min` | `cityAvgSpeed30min` |

FastAPI routes use `response_model_by_alias=True`; Redis cache calls use `model_dump_json(by_alias=True)`.

### traffic-api proxy
`PredictorHandler.java` proxies predictor endpoints via reactive `WebClient`. On any upstream error
it returns 503. `GlobalExceptionHandler.java` also maps any ClickHouse `MEMORY_LIMIT_EXCEEDED`
exception to 503 (instead of 500) across all handlers.

---

## Observability

Every service exposes Spring Boot Actuator (`/actuator/health`, `/actuator/metrics`) or Python `/metrics` (Prometheus FastAPI Instrumentator).

OpenTelemetry SDK instruments:
- All Kafka produce/consume calls
- All HTTP/WebSocket handlers
- ClickHouse query spans

OTel Collector receives at port `4317` (gRPC) / `4318` (HTTP) and forwards to Prometheus + Jaeger.

### Log Aggregation (Loki + Promtail)
- **Promtail** reads all Docker container logs from `/var/lib/docker/containers/` and ships to **Loki**
- Grafana datasource for Loki is pre-configured at `deployment/observability/grafana-datasources.yml`
- In Grafana, use LogQL to query logs: `{container="traffic-api"}` or `{container=~"traffic-.*"}`
- Derived fields link `traceId` in log lines directly to Jaeger traces

### Object Storage (MinIO)
- MinIO provides S3-compatible storage at port `9002` (API) and `9001` (console UI)
- Credentials: `trafficadmin` / `trafficadmin123`
- Intended for raw event archival; connect with AWS CLI: `aws s3 --endpoint http://localhost:9002`

### BI Dashboards (Apache Superset)
- Apache Superset at http://localhost:8088 (admin/admin after first-run init)
- ClickHouse datasource registered automatically by `deployment/observability/superset-init.sh`
- Create charts directly over `traffic_analyzed`, `traffic_alerts`, `traffic_predictions` tables

### Alert Webhooks
- Set `ALERT_WEBHOOK_URL` env var in docker-compose or Kubernetes to enable Slack/Discord/Teams notifications
- `ALERT_WEBHOOK_SEVERITY` controls minimum severity (default: `HIGH`)
- Format is Slack Blocks — works with Discord (ignores `blocks`, uses `text`) and Teams

---

## Known Issues & Workarounds

| Issue | Cause | Fix |
|---|---|---|
| `LZ4 magic mismatch` in ClickHouse JDBC | clickhouse-jdbc 0.6.3 bug with Enum8 + LZ4 binary rows | Add `?compress=0` to JDBC URL |
| `LIMIT ?` syntax error in ClickHouse | clickhouse-jdbc doesn't support `?` for LIMIT | Use `String.format("LIMIT %d", n)` |
| `ILLEGAL_AGGREGATION` in analytics query | ClickHouse resolves alias in same SELECT | Wrap aggregation in subquery |
| `avg(avg_speed) AS avg_speed` alias shadowing | Self-referential alias in GROUP BY | Rename alias to `hour_bucket` |
| Next.js 15+ async params | `params` is now `Promise<{id: string}>` | Use `use(params)` hook in client components |
| WebSocket immediate disconnect | `Sinks.many().multicast()` auto-cancels | Set `autoCancel=false` + use `Mono.zip(input, output)` |
| RocksDB `libstdc++.so.6` missing in Alpine | Alpine doesn't ship libstdc++ | `RUN apk add --no-cache libstdc++` in Dockerfile |
| `MissingSourceTopicException` in Kafka Streams | Topics not pre-created before Streams subscribes | `@Bean NewTopic` declarations in `TopicConfig.java` |
| `avg()` of 0 rows returns IEEE NaN (not SQL NULL) | ClickHouse `avg()` on empty set → float NaN; `ifNull()` doesn't catch it | Use `if(isNaN(avg(...)), 0, avg(...))` in all ClickHouse aggregation queries |
| Jackson serialises `Double.NaN` as `"NaN"` string | Java default JSON serialization | Apply `if(isNaN(...))` on the ClickHouse side before the value reaches Java |
| `toFixed is not a function` in React | API returns JSON string `"NaN"` instead of a number | Use `num(v)` from `src/lib/fmt.ts` which coerces any value to a finite number |
| ClickHouse OOM / 500 errors under memory pressure | Docker VM too small; system log tables grow unbounded | Set Docker Desktop VM ≥ 6 GB; `deployment/clickhouse/config.d/system-logs.xml` caps all system log tables with 1-day TTL; `GlobalExceptionHandler.java` maps DB errors to 503 |
| ClickHouse `background_pool_size` sanity check (exit 36) | Setting `background_pool_size < 10` violates internal check | Do **not** set `background_pool_size` in config; leave it at default |
| ClickHouse `ASYNC_LOAD_FAILED` (exit 183) | Data volume written by a newer ClickHouse version than the pinned image | Delete the stale volume; always use `image: clickhouse/clickhouse-server:latest` |
| Predictor returns 404 for all roads after restart | Training failed due to ClickHouse being down; `roads_modelled: 0` | Restart `traffic-predictor` after ClickHouse recovers to trigger immediate retrain |
| `next30Min` camelCase mismatch (capital M) | Pydantic's `to_camel` capitalises the letter after a digit | `traffic-predictor/models.py` uses a custom `_to_camel` that skips capitalisation when a segment starts with a digit |

### ClickHouse Memory Configuration
ClickHouse requires careful memory tuning on a 6 GB Docker Desktop VM:

```
deployment/clickhouse/config.d/memory-limits.xml   — max_server_memory_usage=2.5 GB, smaller caches
deployment/clickhouse/config.d/system-logs.xml     — 1-day TTL + row caps on all system log tables
                                                      trace_log / processors_profile_log disabled
                                                      text_log limited to ERROR level only
deployment/docker-compose.yml                      — mem_limit: 3g, restart: unless-stopped
```

If ClickHouse crashes and needs system log tables cleared manually:
```bash
docker exec clickhouse clickhouse-client --query "
  TRUNCATE TABLE IF EXISTS system.text_log;
  TRUNCATE TABLE IF EXISTS system.query_log;
  TRUNCATE TABLE IF EXISTS system.part_log;
  TRUNCATE TABLE IF EXISTS system.metric_log;
"
```

---

## Kubernetes (Helm)

Local cluster: `kind create cluster --name traffic`

```bash
helm install traffic-system ./helm -f helm/values-dev.yaml
helm upgrade traffic-system ./helm -f helm/values-dev.yaml
```

Each application service has templates under `helm/templates/<service-name>/`.
Infrastructure (Kafka, ClickHouse, Redis) uses community Helm charts.
