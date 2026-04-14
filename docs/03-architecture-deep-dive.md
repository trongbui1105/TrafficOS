# Architecture Deep Dive

## 1. Simulation Engine

### Road Dataset
572 HCMC road names loaded from `traffic-simulator/data/road-names.txt`. On startup, `config.LoadConfig()` assigns each road a deterministic:
- `RoadID`: `R001`–`R572`
- `BaseCapacity`: 150–350 vehicles (varies by index mod 5)
- `SpeedLimit`: 30–60 km/h (varies by index mod 4)

Road metadata (district, type, lanes, lat/lon) is computed in `enrich.BuildMeta()`:
- **Road type** from name keywords: "Boulevard/Avenue" → arterial, "Parkway/Highway" → highway, "Street" → collector, otherwise local
- **District** from `index % 12` against an ordered HCMC district list
- **Coordinates** deterministically spread in concentric rings around HCMC center (10.7769°N, 106.7009°E)

### Traffic Generation — `engine.Generator`
Every 5 seconds per road:
```
vehicleCount = BaseCapacity × timeMultiplier(now) × rand[0,1]
speed        = SpeedLimit × (1 - vehicleCount/BaseCapacity)
speed       *= weatherSpeedFactor(road)       // 0.5–1.0
speed       *= 0.85^activeIncidentCount(road) // −15% per incident
speed        = clamp(speed, 5, SpeedLimit)
```

`timeMultiplier`:
- 06:00–09:00 → 1.6 (morning rush)
- 11:00–13:00 → 1.3 (lunch)
- 17:00–20:00 → 1.8 (evening rush)
- 22:00–05:00 → 0.4 (night)
- otherwise → 1.0

### Weather State Machine — `enrich.State.TickWeather()`
One `WeatherState` per road. Each 30s tick:
- 8% chance to flip condition to a random one
- Temperature drifts ±0.4°C per tick (clamped 20–38°C)
- Humidity drifts ±3% (clamped 40–98%)
- Wind / visibility / rain derived from the current condition

Speed factors by condition:
| Condition | Factor |
|---|---|
| clear | 1.00 |
| cloudy | 0.95 |
| haze | 0.90 |
| rain | 0.82 |
| fog | 0.75 |
| heavy_rain | 0.65 |
| storm | 0.50 |

### Incident Lifecycle — `enrich.State.TickIncidents()`
Every 20s:
- Each active incident has a 25% chance of resolving (status → `resolved`, `ended_at` set)
- Spawn probability: 55% → 0 new, 30% → 1, 12% → 2, 3% → 3
- Incident types: `accident`, `roadwork`, `breakdown`, `protest`, `flood`, `event`, `debris`
- Incident ID: `INC-{unix_timestamp}-{seq:06d}` (globally unique)
- Upserted via `ReplacingMergeTree(updated_at)` — same ID can appear multiple times; ClickHouse keeps latest

### Vehicle Classification — `enrich.State.VehicleMixFor()`
Vehicle mix ratios by road type (HCMC is motorcycle-dominant):

| Class | Highway | Arterial | Collector | Local |
|---|---|---|---|---|
| Motorcycles | 40% | 65% | 72% | 75% |
| Cars | 35% | 22% | 18% | 15% |
| Trucks | 15% | 5% | 3% | 2% |
| Buses | 8% | 6% | 4% | 3% |
| Bicycles | 1% | 1.5% | 2.5% | 4% |
| Emergency | rare | rare | rare | rare |

Each share is jittered ±10% per tick. Pedestrians scaled at 15–35% of vehicle count.

### Environment Metrics — `enrich.State.EnvironmentFor()`
Derived from traffic intensity (0–1) and current weather:
```
condModifier = 1.0 (clear) | 1.6 (haze/fog) | 0.6 (rain/storm — washes particulates)
PM2.5  = (18 + intensity × 45) × condModifier
PM10   = PM2.5 × 1.6 + rand[0,5]
NO₂    = 20 + intensity × 60 + rand[0,5]
CO     = 0.3 + intensity × 1.8 + rand[0,0.2]
AQI    = PM2.5 × 2.1 (capped 10–500)
noise  = 50 + intensity × 30 + rand[0,4] dB
```

---

## 2. Kafka + Schema Registry

### Topic configuration
Topics are pre-created via `TopicConfig.java` (Spring `@Bean NewTopic`) before Kafka Streams subscribes. Without this, Streams throws `MissingSourceTopicException` during the first rebalance.

### Avro schemas — `traffic-simulator/schemas/`
- `TrafficEvent.avsc` — published to `traffic.raw`
- `TrafficAnalyzedEvent.avsc` — published to `traffic.analyzed`

Schema IDs are encoded as 4-byte big-endian magic prefix on every Avro payload (Confluent wire format).

### Kafka Streams pipeline — `traffic-stream-processor-java`
```java
KStream<String, TrafficEvent> raw = builder.stream("traffic.raw");

KStream<String, TrafficAnalyzedEvent> analyzed = raw
    .groupByKey()
    .windowedBy(TimeWindows.ofSizeWithNoGrace(Duration.ofSeconds(30)))
    .aggregate(...)
    .suppress(Suppressed.untilWindowCloses(BufferConfig.unbounded()))
    .toStream()
    .map((windowedKey, value) -> KeyValue.pair(windowedKey.key(), value));

analyzed.to("traffic.analyzed");
analyzed.foreach((k, v) -> clickHouseSink.write(v));
```

`Suppressed.untilWindowCloses()` ensures exactly one output record per road per 30s window (not one per input event).

---

## 3. traffic-api — Reactive Patterns

### WebSocket lifecycle (LiveWebSocketHandler)
```java
// autoCancel=false: sink stays alive when 0 subscribers
Sinks.Many<WebSocketMessage> sink = Sinks.many().multicast()
    .onBackpressureBuffer(256, false);

Mono<Void> handle(WebSocketSession session) {
    Mono<Void> input  = session.receive().doOnNext(ping → ...).then();
    Flux<String> json = sink.asFlux().map(msg → serialize(msg));
    Mono<Void> output = session.send(json.map(session::textMessage));
    return Mono.zip(input, output).then();  // session alive while both directions active
}
```

The `Sinks.Many` is a shared multicast bus. The `traffic-alert-engine` pushes `AlertEvent`s to it; the stream-processor's analyzed events update Redis **and** push `road_update` events to the same sink.

### ClickHouse query patterns

**Timestamp binding workaround:**
clickhouse-jdbc 0.6.3 inlines `java.sql.Timestamp` as a nanosecond-precision unquoted literal, producing syntax errors. Fixed by formatting instants as `toDateTime('2026-04-10 09:38:53')` in inlined SQL:
```java
private static final DateTimeFormatter CH_DT =
    DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss").withZone(ZoneOffset.UTC);

String sql = String.format("... BETWEEN toDateTime('%s') AND toDateTime('%s')",
    CH_DT.format(from), CH_DT.format(to));
```

**LIMIT binding workaround:**
ClickHouse JDBC does not support `?` for LIMIT clauses. Use `String.format("LIMIT %d", limit)` (safe: `limit` is parsed as `int`).

**Enum8 workaround:**
LZ4-compressed binary row responses mis-parse Enum8 columns in clickhouse-jdbc 0.6.3. Two fixes applied:
1. `?compress=0` in the JDBC URL → forces plain text rows
2. `toString(column)` in every SQL selecting an Enum8 → belt-and-suspenders

---

## 4. Dashboard Architecture

### Data flow per page

```
Server start
    └── useLiveTraffic (hook)
            ├── fetch /api/v1/roads        (seed: current Redis state for all roads)
            ├── WebSocket /ws/live         (stream: road_update + alert events)
            └── state: Map<roadId, RoadStatus> + alerts[] + speedHistory[]

/ (homepage)
    ├── useLiveTraffic → stat cards, CityScore gauge, road cards
    └── useSWR /api/v1/alerts → alert feed

/pulse (City Pulse)
    └── useSWR /api/v1/city/pulse (10s) → AQI, weather mix, incidents, vehicles, districts

/map
    └── useLiveTraffic → LeafletMap (dynamic import, SSR disabled)

/analytics
    └── useSWR /api/v1/roads (30s) → recharts bar/pie

/leaderboard
    └── useLiveTraffic → sorted best/worst lists

/alerts
    └── merged: useLiveTraffic.alerts + useSWR /api/v1/alerts

/roads/[id]
    ├── useSWR /api/v1/roads/{id}/history (30s)
    ├── useSWR /api/v1/roads/{id}/analytics (60s)
    └── useSWR /api/v1/roads (60s) → network avg comparison
```

### useLiveTraffic hook
- Connects to `ws://localhost:8080/ws/live`
- Auto-reconnects every 3s on disconnect
- Seeds state from REST on mount (so page isn't empty before first WebSocket event)
- Maintains `speedHistory: Map<roadId, SpeedPoint[]>` (last 20 points per road)
- Computes `trafficScore` (0–100): normalised city-wide average speed vs. speed limits
- Fires `react-hot-toast` on HIGH-severity alerts from WebSocket

### Next.js 16 async params
In Next.js 15+/16, dynamic route `params` is a `Promise`. In client components:
```tsx
// WRONG (Next.js 14 pattern):
interface Props { params: { id: string } }
export default function Page({ params }: Props) {
  const roadId = params.id;  // undefined — params is a Promise!
}

// CORRECT (Next.js 16 pattern):
import { use } from 'react';
interface Props { params: Promise<{ id: string }> }
export default function Page({ params }: Props) {
  const { id: roadId } = use(params);  // correctly unwraps
}
```

---

## 5. ClickHouse Query Patterns Reference

```sql
-- Latest value per road (used everywhere)
SELECT * FROM some_table
WHERE observed_at >= now() - INTERVAL 10 MINUTE
ORDER BY road_id, observed_at DESC
LIMIT 1 BY road_id;

-- Hourly buckets (analytics endpoint)
SELECT toStartOfHour(window_start) AS hour_bucket,
       sum(total_vehicles), avg(avg_speed)
FROM traffic_analyzed
WHERE road_id = ? AND window_start >= now() - INTERVAL 24 HOUR
GROUP BY hour_bucket ORDER BY hour_bucket;

-- Dedup ReplacingMergeTree (incidents, road_metadata)
SELECT * FROM traffic_incidents FINAL WHERE status = 'active';

-- Enum8 cast (always use toString() with clickhouse-jdbc 0.6.3)
SELECT toString(severity) AS severity FROM traffic_alerts;

-- City-wide joins (City Pulse district snapshot)
SELECT m.district, avg(ls.avg_speed), avg(le.aqi), sum(ac.n)
FROM road_metadata m FINAL
LEFT JOIN latest_speed ls ON ls.road_id = m.road_id
LEFT JOIN latest_env   le ON le.road_id = m.road_id
LEFT JOIN active_count ac ON ac.road_id = m.road_id
GROUP BY m.district;
```
