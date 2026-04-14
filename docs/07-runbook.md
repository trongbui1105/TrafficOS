# Runbook — Operations Guide

## Quick Start

```bash
# 1. Clone and enter repo
cd "Traffic Analysis System"

# 2. Start everything
docker compose -f deployment/docker-compose.yml up --build

# 3. Wait ~60s for all services to be healthy, then open:
open http://localhost:3000          # Dashboard
open http://localhost:8081          # Kafka UI
open http://localhost:3001          # Grafana
open http://localhost:16686         # Jaeger
```

---

## Service Rebuild Cheatsheet

```bash
# Rebuild only one service (no downtime for others)
docker compose -f deployment/docker-compose.yml up -d --build traffic-api
docker compose -f deployment/docker-compose.yml up -d --build traffic-dashboard
docker compose -f deployment/docker-compose.yml up -d --build traffic-simulator
docker compose -f deployment/docker-compose.yml up -d --build traffic-stream-processor
docker compose -f deployment/docker-compose.yml up -d --build traffic-alert-engine
```

---

## Health Checks

```bash
# API health
curl http://localhost:8080/actuator/health

# Stream processor health
curl http://localhost:8090/actuator/health

# Alert engine health
curl http://localhost:8091/actuator/health

# ClickHouse ping
curl http://localhost:8123/ping

# Kafka topics
docker exec kafka kafka-topics.sh --bootstrap-server localhost:9092 --list
```

---

## Data Inspection

### ClickHouse via curl
```bash
# Row counts for all tables
curl "http://localhost:8123/?query=SELECT+table,count()+FROM+system.parts+WHERE+active+GROUP+BY+table"

# Latest weather per road (sample 5)
curl "http://localhost:8123/?query=SELECT+road_id,toString(condition),temperature_c+FROM+weather_observations+ORDER+BY+observed_at+DESC+LIMIT+5"

# Active incidents
curl "http://localhost:8123/?query=SELECT+incident_id,road_id,toString(type),toString(severity)+FROM+traffic_incidents+FINAL+WHERE+status='active'+LIMIT+10"

# City AQI average
curl "http://localhost:8123/?query=SELECT+avg(aqi)+FROM+environment_metrics+WHERE+observed_at>=now()-INTERVAL+5+MINUTE"
```

### ClickHouse via DBeaver
- Driver: ClickHouse
- Host: `localhost`, Port: `8123`
- Username: `default`, Password: (empty)
- Database: `default`

### Redis
```bash
docker exec redis redis-cli KEYS "road:*" | head -10
docker exec redis redis-cli GET "road:R001"
docker exec redis redis-cli TTL "road:R001"
```

### Kafka UI
Open http://localhost:8081 → Topics → select topic → Messages

---

## API Smoke Tests

```bash
# All roads current state
curl http://localhost:8080/api/v1/roads | python3 -m json.tool | head -30

# Road history (last hour)
curl "http://localhost:8080/api/v1/roads/R001/history" | python3 -m json.tool | head -20

# City Pulse
curl http://localhost:8080/api/v1/city/pulse | python3 -m json.tool

# Active incidents
curl http://localhost:8080/api/v1/incidents/active | python3 -m json.tool

# Weather per road
curl http://localhost:8080/api/v1/weather | python3 -m json.tool | head -30

# Alerts (latest 10)
curl "http://localhost:8080/api/v1/alerts?limit=10" | python3 -m json.tool

# Road metadata
curl http://localhost:8080/api/v1/roads/meta | python3 -m json.tool | head -30
```

---

## Common Issues

### Dashboard shows empty data
1. Check WebSocket: `curl -i --http1.1 -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Key: $(echo -n AAAA | base64)" http://localhost:8080/ws/live` → should not 404
2. Check Redis has data: `docker exec redis redis-cli KEYS "road:*" | wc -l` → should be ~572
3. Check stream-processor processed windows: `curl http://localhost:8123/?query=SELECT+count()+FROM+traffic_analyzed`
4. Check simulator is running: `docker logs traffic-simulator --tail 20`

### ClickHouse 500 errors from API
```bash
docker logs traffic-api --tail 100 | grep "Caused by"
```
Common causes:
- Timestamp format error → check `CH_DT` formatter
- LIMIT `?` error → ensure `String.format("LIMIT %d", n)` is used
- Enum8 / LZ4 error → check `?compress=0` in JDBC URL (`application.yml`)

### Kafka Streams not processing
```bash
docker logs traffic-stream-processor --tail 50
```
- `MissingSourceTopicException` → restart stream-processor (topics will be created by `KafkaAdmin` on first healthy run)
- `ClassNotFoundException` for Avro → check Schema Registry is reachable at `http://schema-registry:8081`

### Simulator not sending data
```bash
docker logs traffic-simulator --tail 30
```
- Schema Registry not reachable → check compose healthcheck dependency
- ClickHouse enrichment failing → `http://clickhouse:8123` accessible from simulator container?

### Dashboard TypeScript errors in IDE
```bash
cd traffic-dashboard
npm install           # install missing packages on host
```
Then restart TS server: VS Code → Cmd+Shift+P → "TypeScript: Restart TS Server"

---

## Scaling Considerations

| Concern | Current | Production approach |
|---|---|---|
| Road count | 572 | Unlimited — config-driven |
| Kafka partitions | 1 per topic | Increase to `n` for `n`-way parallelism |
| Stream processor instances | 1 | Add instances; Kafka Streams re-balances state |
| ClickHouse | Single node | ClickHouse Keeper cluster; distributed tables |
| Redis | Single instance | Redis Cluster or Redis Sentinel |
| traffic-api | 1 instance | Stateless (Sinks.Many is in-process only) → use Redis Pub/Sub or Kafka for multi-instance WS fan-out |

---

## Data Retention

| Table | TTL | Approximate size per day (572 roads) |
|---|---|---|
| `traffic_analyzed` | 90 days | ~24 MB (1 row/road/30s = 172k rows) |
| `traffic_alerts` | 30 days | ~1 MB (sparse) |
| `weather_observations` | 30 days | ~18 MB (1 row/road/30s = 172k rows) |
| `traffic_incidents` | partition by month | ~0.5 MB (sparse, upserted) |
| `environment_metrics` | 30 days | ~110 MB (1 row/road/5s = 1M rows) |
| `vehicle_classification` | 30 days | ~110 MB (1 row/road/5s = 1M rows) |
| `road_metadata` | permanent | < 1 MB (572 rows, upserted) |
