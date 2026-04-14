# Tech Stack

## Backend

### traffic-simulator — Go 1.25

| Library / Tool | Purpose |
|---|---|
| `github.com/segmentio/kafka-go` | Kafka producer (low-level, no Confluent dependency) |
| `github.com/linkedin/goavro/v2` | Avro encoding for `TrafficEvent` |
| `github.com/riferrei/srclient` | Schema Registry client (register + fetch schemas) |
| `net/http` (stdlib) | HTTP client for direct ClickHouse inserts (JSONEachRow) |
| `encoding/json` (stdlib) | Marshal enrichment structs to newline-delimited JSON |
| `math/rand` (stdlib) | Simulation RNG — weather drift, incident spawning, vehicle mix |
| `sync.RWMutex` (stdlib) | Thread-safe shared state between ticker goroutines |

**Key patterns:**
- Multiple goroutines tick independently (Kafka 5s, weather 30s, incidents 20s)
- Shared `enrich.State` protected by RWMutex
- `enrich.Sink` wraps all ClickHouse HTTP writes in a single reusable client
- Weather state machines drift temperature/humidity per road, flip conditions probabilistically
- Incident lifecycle: spawn → active → resolved via timed probability

---

### traffic-stream-processor — Java 21 + Spring Boot 3.x

| Library / Tool | Purpose |
|---|---|
| `spring-kafka-streams` | Kafka Streams DSL integration with Spring lifecycle |
| `kafka-streams` | 30s tumbling window aggregation with `Suppressed.untilWindowCloses()` |
| `io.confluent:kafka-streams-avro-serde` | Avro deserialization with Schema Registry |
| `clickhouse-jdbc 0.6.3` | JDBC sink to write `traffic_analyzed` rows |
| `Spring Boot Actuator` | `/actuator/health`, `/actuator/metrics` |
| `RocksDB` (transitive) | Local state store for Kafka Streams windowed KTable |
| `OpenTelemetry SDK` | Traces for Kafka consume + ClickHouse write spans |

**Key patterns:**
- `KStream<String, TrafficEvent>` → `KTable<Windowed<String>, TrafficAnalyzedEvent>` via `windowedBy(TimeWindows.ofSizeWithNoGrace(Duration.ofSeconds(30)))`
- `Suppressed.untilWindowCloses(...)` ensures only closed windows are emitted
- `ClickHouseSink` implements `ForeachAction<>` — writes each record as a JDBC batch insert
- `TopicConfig.java` pre-creates Kafka topics via `KafkaAdmin` to avoid `MissingSourceTopicException`

---

### traffic-api — Java 21 + Spring Boot 3.x + Spring WebFlux

| Library / Tool | Purpose |
|---|---|
| `spring-webflux` | Reactive HTTP + WebSocket server (Netty event loop) |
| `spring-data-redis-reactive` | Reactive Redis reads for current road state |
| `clickhouse-jdbc 0.6.3` | Blocking JDBC queries (offloaded to `boundedElastic` scheduler) |
| `reactor-core` | `Mono`, `Flux`, `Sinks.Many` for reactive pipeline |
| `Spring Functional Router` | Route DSL without `@RestController` annotations |
| `Jackson` | JSON serialization of response bodies |
| `Lombok` | `@Data`, `@Builder`, `@RequiredArgsConstructor` |

**Key patterns:**
- `Sinks.many().multicast().onBackpressureBuffer(N, false)` — `autoCancel=false` keeps sink alive when last subscriber disconnects
- `Mono.zip(input, output).then()` — keeps WebSocket session alive bidirectionally
- Blocking ClickHouse calls wrapped in `Mono.fromCallable(...).subscribeOn(Schedulers.boundedElastic())`
- CORS via `WebFluxConfigurer.addCorsMappings()` (not `@CrossOrigin`)
- ClickHouse timestamp binding: `toDateTime('yyyy-MM-dd HH:mm:ss')` inlined to avoid clickhouse-jdbc Timestamp precision bug
- Enum8 columns always cast with `toString(column)` in SQL to bypass LZ4 binary-row parsing bug

---

### traffic-alert-engine — Java 21 + Spring Boot 3.x + Spring Kafka

| Library / Tool | Purpose |
|---|---|
| `spring-kafka` | `@KafkaListener` consumer for `traffic.analyzed` |
| `io.confluent:kafka-avro-deserializer` | Avro deserialization |
| `clickhouse-jdbc 0.6.3` | Insert alerts to `traffic_alerts` |
| `KafkaTemplate` | Publish `AlertEvent` JSON to `traffic.alerts` |

**Severity rules:**
- `avgSpeed < 10` → HIGH
- `avgSpeed < 20` → MEDIUM
- `avgSpeed < 30` → LOW

---

## Messaging

| Component | Version | Role |
|---|---|---|
| Apache Kafka | 7.x (Confluent) | Durable event log, 3 topics |
| Confluent Schema Registry | 7.x | Avro schema management (register, evolve, fetch) |
| kafka-go | 0.4.50 | Go producer library |
| kafka-streams | 3.x | Stateful stream processing with windowed aggregation |

---

## Storage

| Component | Version | Role |
|---|---|---|
| ClickHouse | 26.3.3 | Column-store for all time-series analytics; 7 tables |
| Redis | 7.x | Current road state cache, TTL 60s |

**ClickHouse features used:**
- `MergeTree` / `ReplacingMergeTree` / `TTL`
- `PARTITION BY toYYYYMM(...)` — monthly partitions for efficient pruning
- `toStartOfHour(...)` — time-bucketing in analytics queries
- `LIMIT 1 BY column` — latest-per-group pattern
- `FINAL` modifier — force deduplication on `ReplacingMergeTree`
- `Nullable(DateTime)` — optional `ended_at` on incidents
- Enum8 columns with explicit int codes

---

## Frontend

### traffic-dashboard — Next.js 16 + TypeScript

| Library | Purpose |
|---|---|
| `next` 16.2.2 | App Router, Server Components, standalone output |
| `react` 18.3 | UI library |
| `swr` 2.x | Data fetching with polling (`refreshInterval`) + stale-while-revalidate |
| `recharts` 2.x | Bar, Pie, Line, Area charts |
| `framer-motion` 11.x | Page transitions, list animations, layout animations |
| `leaflet` + `react-leaflet` 4.x | Interactive map with CircleMarker per road |
| `lucide-react` | Icon set (sidebar, cards, badges) |
| `react-hot-toast` | Toast notifications for congestion alerts from WebSocket |
| `react-countup` | Animated number transitions on stat cards |
| `date-fns` | `formatDistanceToNowStrict` for incident age, alert timestamps |
| `clsx` | Conditional class string builder |
| `tailwindcss` 3.x | Utility-first styling |

**Key patterns:**
- `use(params)` hook in `[id]/page.tsx` — Next.js 15+/16 requires `params` to be unwrapped as a Promise
- `dynamic(() => import('../TrafficMap'), { ssr: false })` — Leaflet can't render server-side
- `useLiveTraffic` hook — manages WebSocket connection, merges REST seed + WebSocket deltas, computes traffic score
- `Sinks.Many` → WebSocket → `useLiveTraffic` → SWR cache invalidation chain

---

## Infrastructure & Observability

| Component | Purpose |
|---|---|
| Docker Compose | Local orchestration of all services |
| Helm (Kubernetes) | Production deployment charts |
| kind | Local Kubernetes cluster |
| OpenTelemetry SDK | Distributed tracing + metrics in all Java services |
| OTel Collector | Receives gRPC/HTTP traces, forwards to Prometheus + Jaeger |
| Prometheus | Metrics scraping + storage |
| Grafana | Dashboards over Prometheus metrics |
| Jaeger | Distributed trace visualisation |
| Kafka UI | Confluent-compatible topic browser |

---

## Language / Runtime Versions

| Runtime | Version |
|---|---|
| Go | 1.25 |
| Java | 21 (LTS) |
| Node.js | 20.x |
| TypeScript | 5.x |
| Python | N/A (not used in runtime) |
