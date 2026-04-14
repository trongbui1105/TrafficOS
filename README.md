# TrafficOS — Real-Time Traffic Analysis System

A full-stack, production-grade traffic monitoring platform simulating 572 Ho Chi Minh City roads with real-time stream processing, ML forecasting, and anomaly detection.

---

## Architecture

```
[traffic-simulator (Go)]
        │ Avro via Schema Registry        HTTP INSERT (JSONEachRow)
        ▼                                 ┌─────────────────────────┐
[Kafka: traffic.raw]                      │ road_metadata           │
        │                                 │ weather_observations    │
[traffic-stream-processor]                │ traffic_incidents       │
        ├──► [Kafka: traffic.analyzed]    │ environment_metrics     │
        │         │                       │ vehicle_classification  │
        │    [traffic-api]                └─────────────────────────┘
        │         │ WebSocket                        ↑ ClickHouse
        │    [traffic-dashboard]
        │
        ├──► [ClickHouse: traffic_analyzed]
        │
[traffic-alert-engine]
        ├──► [Kafka: traffic.alerts]
        └──► [ClickHouse: traffic_alerts]

[traffic-predictor] ──► [ClickHouse: traffic_predictions, traffic_anomalies]
[traffic-api] ──► Redis (current road state, TTL 60s)
[All services] ──► OTel Collector ──► Prometheus / Jaeger / Grafana
```

## Services

| Service | Stack | Role |
|---|---|---|
| `traffic-simulator` | Go 1.23 | Generates synthetic traffic events for 572 roads; Avro + Schema Registry; writes 5 enrichment datasets to ClickHouse |
| `traffic-stream-processor` | Java 21 + Spring Boot + Kafka Streams | 30s tumbling window aggregations → `traffic.analyzed` + ClickHouse |
| `traffic-api` | Java 21 + Spring WebFlux | Reactive REST + WebSocket; Redis (current state) + ClickHouse (history); ML proxy |
| `traffic-alert-engine` | Java 21 + Spring Boot + Spring Kafka | Severity alerts → `traffic.alerts` + ClickHouse; Slack/Discord webhook support |
| `traffic-predictor` | Python 3.12 + FastAPI | ML speed forecasting (α=0.65 baseline + β=0.35 trend); z-score anomaly detection |
| `traffic-dashboard` | Next.js 16 + TypeScript | Real-time dashboard; WebSocket live updates; SWR polling |

---

## Quick Start

### Prerequisites
- Docker Desktop with **≥ 6 GB memory** allocated (Settings → Resources → Memory)

### Run the full stack
```bash
docker compose -f deployment/docker-compose.yml up --build
```

### Rebuild a single service
```bash
docker compose -f deployment/docker-compose.yml up -d --build traffic-api
```

---

## Dashboard Pages

| Route | Description |
|---|---|
| `/` | Home — CityScore gauge, stat cards, top alerts, worst roads |
| `/pulse` | City Pulse — AQI, weather mix, vehicle class donut, incident feed |
| `/map` | Live Leaflet map — roads colour-coded by congestion |
| `/analytics` | Charts — 25 slowest roads, alert frequency by hour, severity breakdown |
| `/leaderboard` | Best/worst roads with sparklines |
| `/alerts` | Alert feed — severity filters, CSV export, unread badge |
| `/anomalies` | ML anomaly detection — z-score ≥ 2σ from baseline, grouped by severity |
| `/predictions` | City-wide ML forecast — speed gauges (now/+30min/+1h), peak/improving roads |
| `/roads/[id]` | Road detail — ML forecast chart, confidence bands, speed history |

---

## API Endpoints

```
GET  /api/v1/roads                        → all roads current state (Redis)
GET  /api/v1/roads/{id}/history           → windowed history (ClickHouse)
GET  /api/v1/roads/{id}/analytics         → hourly aggregates last 24h (ClickHouse)
GET  /api/v1/roads/{id}/forecast          → ML speed forecast (traffic-predictor)
GET  /api/v1/alerts                       → recent congestion alerts
GET  /api/v1/city/pulse                   → city-wide enrichment snapshot
GET  /api/v1/predict/city                 → city-wide ML congestion forecast
GET  /api/v1/anomalies                    → ML anomaly detection results
WS   /ws/live                             → real-time road + alert events
```

---

## Infrastructure Ports

| Service | Port |
|---|---|
| traffic-dashboard | http://localhost:3000 |
| traffic-api | http://localhost:8080 |
| traffic-predictor (Swagger) | http://localhost:8000/docs |
| Kafka UI | http://localhost:8081 |
| Grafana | http://localhost:3001 |
| Prometheus | http://localhost:9090 |
| Jaeger | http://localhost:16686 |
| ClickHouse HTTP | http://localhost:8123 |

---

## Alert Severity Rules

| Avg Speed | Severity |
|---|---|
| < 10 km/h | HIGH |
| < 20 km/h | MEDIUM |
| < 30 km/h | LOW |

---

## Webhook Notifications

Set environment variables to receive alerts in Slack, Discord, or Teams:

```bash
ALERT_WEBHOOK_URL=https://hooks.slack.com/...
ALERT_WEBHOOK_SEVERITY=HIGH   # HIGH | MEDIUM | LOW
```

---

## ML Predictor

Model per road: `predicted_speed = 0.65 × historical_baseline + 0.35 × trend`

- Trains on `traffic_analyzed` (last 7 days) every 5 minutes
- Anomaly detection: flags roads with `|z-score| ≥ 2σ` from hourly baseline
- Forecasts horizons: 5, 10, 15, 20, 25, 30, 40, 50, 60 minutes
- Persists predictions + anomalies to ClickHouse every 60 seconds
