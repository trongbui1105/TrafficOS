# Engineering Skills & Patterns Demonstrated

This document catalogues the engineering patterns, skills, and best practices implemented across the codebase. Useful as a reference for interviews, portfolio review, or onboarding.

---

## Distributed Systems

### Event Streaming — Apache Kafka
- **Topic-per-domain** design: `traffic.raw`, `traffic.analyzed`, `traffic.alerts`
- **Exactly-once semantics** via Kafka Streams `Suppressed.untilWindowCloses()` — each 30s window emits exactly one aggregated output regardless of input event count
- **Schema evolution safety** via Confluent Schema Registry + Avro — producers register schemas; consumers validate on consume
- **Kafka admin pattern** — pre-create topics via `KafkaAdmin` + `NewTopic` beans to avoid `MissingSourceTopicException` race on service startup
- **Dead letter awareness** — log-and-continue error handling in producers; no silent drops

### Stream Processing — Kafka Streams
- **Stateful windowed aggregation**: `KStream → groupByKey → windowedBy(TimeWindows) → aggregate → suppress`
- **Local state store**: RocksDB-backed KTable for in-flight window state
- **Tumbling windows** (not sliding): 30s non-overlapping windows for clean ClickHouse rows
- **Alpine compatibility**: RocksDB requires `libstdc++.so.6` — added `apk add libstdc++` to Dockerfile

### Reactive Programming — Project Reactor + Spring WebFlux
- **Non-blocking WebSocket**: `Sinks.Many<T>` multicast bus with `autoCancel=false`
- **Bidirectional session**: `Mono.zip(input, output).then()` keeps session alive while both read and write sides are active
- **Scheduler discipline**: Blocking JDBC calls offloaded to `Schedulers.boundedElastic()` — Netty event loop never blocks
- **Reactive Redis**: `ReactiveRedisTemplate` for non-blocking road state reads
- **Functional router DSL**: `RouterFunctions.route()` instead of `@RequestMapping`

---

## Data Engineering

### ClickHouse Patterns
- **MergeTree TTL**: automatic partition expiry (`TTL column + INTERVAL N DAY`)
- **ReplacingMergeTree**: upsert-style deduplication for `road_metadata` and `traffic_incidents` using `updated_at` version column
- **LIMIT 1 BY**: latest-row-per-group without a subquery join
- **toStartOfHour()**: time-bucketing for hourly analytics
- **FINAL modifier**: force dedup on `ReplacingMergeTree` in queries
- **Subquery to avoid ILLEGAL_AGGREGATION**: ClickHouse can't reference an aggregate alias in a HAVING-like expression in the same SELECT; wrap in subquery
- **JSONEachRow HTTP insert**: simulator writes enrichment data via HTTP POST with newline-delimited JSON — no JDBC, no Kafka, maximally simple

### Redis Patterns
- **Cache-aside**: traffic-api writes analyzed road state to Redis; dashboard reads Redis for current state
- **TTL-based expiry**: 60s TTL ensures stale roads auto-expire if simulator stops

### Schema Design
- **Enum8 encoding**: severity/condition/type/status columns use Enum8 with explicit int codes — saves storage vs. String, enables ORDER BY
- **Nullable(DateTime)**: `ended_at` on incidents is null while active, set on resolution
- **Partition by month**: `PARTITION BY toYYYYMM(...)` on all time-series tables for efficient range pruning

---

## Backend Engineering

### Go
- **Struct-based dependency injection** — `engine.Generator` receives `*enrich.State` via `WithState()`
- **Goroutine-per-ticker** pattern — three independent goroutines (Kafka 5s, weather 30s, incidents 20s) sharing state via RWMutex
- **Minimal stdlib HTTP client** — custom `enrich.Sink` wraps `net/http` for ClickHouse inserts; no third-party HTTP library needed
- **Deterministic simulation** — coordinates, district, road type computed from index; reproducible between restarts
- **State machine** — weather conditions transition probabilistically (8% flip chance per tick); temperature/humidity drift bounded by min/max

### Java / Spring Boot
- **Lombok** — `@Data @Builder @RequiredArgsConstructor` eliminates boilerplate
- **Constructor injection** — `@RequiredArgsConstructor` generates constructor from `final` fields
- **Clean layering**: Config → Handler → Repository (no `@Service` layer for simplicity)
- **SQL injection prevention**: LIMIT uses `String.format("%d", n)` with int, never string concatenation from user input; road ID uses JDBC `?` parameter
- **Workaround documentation**: every non-obvious workaround (timestamp format, LIMIT, Enum8, autoCancel) is explained in Javadoc

---

## Frontend Engineering

### Next.js / React Patterns
- **App Router** with Server Components for layout, Client Components for interactive pages
- **`use(params)`** — Next.js 16 async params unwrapping in Client Components
- **Dynamic import with SSR disabled** — Leaflet map loaded client-side only: `dynamic(() => import('../TrafficMap'), { ssr: false })`
- **SWR** — polling + stale-while-revalidate; `refreshInterval` per endpoint based on data volatility
- **Custom WebSocket hook** (`useLiveTraffic`) — reconnection, state merge, toast integration
- **State hydration strategy**: REST seed on mount → WebSocket deltas → map merge by road ID

### UI / UX Patterns
- **Framer Motion**: `AnimatePresence`, `layout`, staggered list entrance, `initial/animate/exit`
- **Tailwind dark theme**: `slate-*` palette, glass morphism (`backdrop-blur`), gradient borders
- **Recharts**: `ResponsiveContainer`, `ComposedChart`, `PieChart` with `Cell` for per-slice colours
- **Leaflet**: `CircleMarker` per road, colour + radius encoding congestion level, `Popup` on click
- **react-hot-toast**: WebSocket alert push → toast notification with severity colour
- **react-countup**: animated stat card value transitions
- **Sticky right panel**: `lg:sticky lg:top-4` incident feed alongside scrollable main content

---

## DevOps / Infrastructure

### Docker Compose
- **Health-check dependencies**: `condition: service_healthy` on Kafka before simulator/stream-processor start
- **Minimal Docker images**: Go binary in `scratch`; Java uses Spring Boot layered jars
- **Environment-variable driven**: every service is 12-factor (no hardcoded config)
- **Named containers**: `container_name:` for predictable `docker logs traffic-api` access

### Observability
- **OpenTelemetry SDK** instrumentation in all Java services (zero-code agent + manual spans)
- **Prometheus scraping** via Spring Boot Actuator `/actuator/prometheus`
- **Distributed tracing** with Jaeger — full trace from Kafka consume → ClickHouse write → HTTP response
- **Health endpoints** — `/actuator/health` on all Java services, checked by Docker Compose

### Kubernetes / Helm
- **Helm chart per service** under `helm/templates/<service>/`
- **Values override** — `helm/values-dev.yaml` for local kind cluster
- **Community charts** for Kafka, ClickHouse, Redis (no reinventing the wheel)

---

## Testing & Quality

| Layer | Approach |
|---|---|
| Go unit tests | `go test ./...` — table-driven tests for generator, state |
| Spring Boot tests | `./mvnw test` — `@SpringBootTest` integration, `@DataJpaTest` for repository |
| Next.js unit tests | `jest` + `@testing-library/react` — component rendering, hook behaviour |
| Type safety | TypeScript strict mode throughout dashboard |
| Linting | `go vet` (Go), `next lint` (TypeScript/React) |

---

## Notable Bug Fixes & Lessons Learned

| Bug | Root Cause | Fix | Lesson |
|---|---|---|---|
| WebSocket disconnect loop | `Sinks.many().multicast()` default `autoCancel=true` cancels when last subscriber drops | `autoCancel=false` + `Mono.zip` | Reactive multicast semantics are subtle |
| LZ4 `magic mismatch` in JDBC | clickhouse-jdbc 0.6.3 binary row format + LZ4 + Enum8 | `?compress=0` in URL + `toString()` in SQL | Always test with compression disabled when debugging JDBC drivers |
| `LIMIT ?` syntax error | ClickHouse JDBC doesn't support `?` for LIMIT | Inline with `String.format` | JDBC parameter binding is vendor-specific |
| Next.js params `undefined` | params became async Promise in Next.js 15+ | `use(params)` hook | Framework major versions break idioms silently |
| RocksDB missing `libstdc++` | Alpine Linux doesn't ship libstdc++ | `apk add libstdc++` | Native JNI libraries need non-JVM dependencies |
| `MissingSourceTopicException` | Kafka Streams subscribes before topics exist | Pre-create with `KafkaAdmin` | Kafka Streams is topic-existence strict |
| Nested aggregate `ILLEGAL_AGGREGATION` | ClickHouse resolves alias in same SELECT | Subquery | ClickHouse alias resolution is eager |
