# TrafficOS — System Overview

## What Is This?

TrafficOS is a **real-time traffic analysis platform** that simulates, streams, processes, and visualises urban traffic data for Ho Chi Minh City. It is designed as a showcase of modern streaming architecture and reactive UI patterns.

The system generates synthetic data for **572 real HCMC road segments**, covering 12 administrative districts. Every 5 seconds, traffic conditions are computed, influenced by live weather simulation and randomly-spawning incidents (accidents, roadworks, floods, protests, etc.).

---

## Business Domain

| Domain | What the system tracks |
|---|---|
| **Traffic flow** | Vehicle count and average speed per 30-second window, congestion flag |
| **Congestion alerts** | Severity-graded alerts (HIGH/MEDIUM/LOW) fired when speed drops below threshold |
| **Weather** | Per-road weather condition, temperature, humidity, wind, visibility, rainfall |
| **Incidents** | Active incidents on roads: type, severity, lanes blocked, lifecycle (active→resolved) |
| **Air quality** | PM2.5, PM10, NO₂, CO, AQI, and noise level per road |
| **Vehicle mix** | Breakdown into motorcycles, cars, buses, trucks, bicycles, emergency, pedestrians |
| **Road metadata** | District, road type, lanes, speed limit, physical length, GPS coordinates |

---

## Key Numbers

| Metric | Value |
|---|---|
| Roads simulated | 572 (all named HCMC streets) |
| Districts covered | 12 |
| Kafka events/second | ~114 (572 roads × every 5s) |
| ClickHouse enrichment rows/min | ~7,000+ (environment + vehicle mix + weather) |
| WebSocket push rate | Every new analyzed window (~30s) |
| Alert latency | < 2s (Kafka Streams → alert-engine → WebSocket) |

---

## High-Level Component Map

```
┌─────────────────────────────────────────────────────────────────────┐
│                        traffic-simulator (Go)                        │
│  572 roads · time-of-day patterns · weather state · incident engine  │
└───────────────────┬────────────────────────────┬───────────────────┘
                    │ Avro / Kafka               │ HTTP JSONEachRow
                    ▼                            ▼
         ┌──────────────────┐         ┌──────────────────────┐
         │  traffic.raw     │         │      ClickHouse       │
         │  (Kafka topic)   │         │  road_metadata        │
         └────────┬─────────┘         │  weather_observations │
                  │                   │  traffic_incidents    │
                  ▼                   │  environment_metrics  │
  ┌───────────────────────────┐       │  vehicle_classification│
  │ traffic-stream-processor  │       └────────┬─────────────┘
  │ (Kafka Streams, 30s window)│               │
  └────────┬──────────────────┘               │
           │ traffic.analyzed                 │
    ┌──────┴──────┐                           │
    ▼             ▼                           │
┌───────┐  ┌──────────────┐                  │
│Kafka  │  │  ClickHouse  │                  │
│topic  │  │traffic_analyzed│                │
└───┬───┘  └──────────────┘                  │
    │                                         │
    ├──► traffic-alert-engine ──► traffic_alerts (ClickHouse)
    │
    └──► traffic-api (Spring WebFlux)
              ├── Redis (current road state)
              ├── ClickHouse (history + all enrichment)
              └── WebSocket ──► traffic-dashboard (Next.js)
```

---

## Why This Architecture?

| Decision | Rationale |
|---|---|
| Kafka as event backbone | Decouples simulator from consumers; durable replay; multiple independent consumers |
| Avro + Schema Registry | Schema evolution safety; compact binary format |
| Kafka Streams for windowing | Stateful 30s tumbling windows without custom aggregation code |
| Spring WebFlux (reactive) | Non-blocking I/O for WebSocket + REST; handles many concurrent subscribers |
| ClickHouse for analytics | Column-store purpose-built for time-series; toStartOfHour, LIMIT 1 BY, MergeTree TTL |
| Redis for current state | O(1) read per road ID; 60s TTL auto-expiry; no ClickHouse round-trip for live dashboard |
| Direct HTTP insert for enrichment | Simulator writes enrichment data synchronously over HTTP; avoids extra Kafka topics and consumers for low-frequency, high-variety data |
| Next.js App Router + SWR | React Server Components for layout; SWR for polling with revalidation; WebSocket hook for push |
