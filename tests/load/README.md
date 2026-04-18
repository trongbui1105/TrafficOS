# Load Tests — k6

Stress-tests for the `traffic-api` service using [k6](https://k6.io).

## Prerequisites

```bash
# macOS
brew install k6

# Docker (no install needed)
docker run --rm -i grafana/k6 run - < tests/load/api-load.js
```

## Scripts

| Script | What it tests |
|---|---|
| `api-load.js` | Mixed REST API traffic — roads list, single road, history, alerts, analytics |
| `ws-load.js` | WebSocket `/ws/live` — concurrent connections, message validation |

## Run

> The full stack must be running: `docker compose -f deployment/docker-compose.yml up`

```bash
# REST load test (default: localhost:8080)
k6 run tests/load/api-load.js

# Point to a different host
k6 run --env API_BASE=http://my-server:8080 tests/load/api-load.js

# WebSocket load test
k6 run tests/load/ws-load.js
k6 run --env WS_URL=ws://my-server:8080 tests/load/ws-load.js
```

## Thresholds

| Metric | Threshold |
|---|---|
| `http_req_duration` p95 | < 500 ms |
| `http_req_failed` rate | < 1% |
| `roads_list_latency` p95 | < 300 ms |
| `ws_connect_duration_ms` p95 | < 1000 ms |
| `ws_parse_error_rate` | < 1% |

## Integration with Grafana

k6 can write metrics directly to Prometheus via the remote-write extension.
Once Prometheus is scraping, the included Grafana stack (port 3001) can
visualise live load-test results:

```bash
k6 run -o experimental-prometheus-rw \
   --env K6_PROMETHEUS_RW_SERVER_URL=http://localhost:9090/api/v1/write \
   tests/load/api-load.js
```
