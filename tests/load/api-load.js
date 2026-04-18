/**
 * k6 REST API load test — traffic-api
 *
 * Simulates realistic mixed read traffic against the traffic-api service.
 *
 * Stages:
 *   0→50 VUs over 30s  — ramp-up
 *   50 VUs  for 1m     — steady load
 *   50→100 VUs over 30s — peak
 *   100 VUs for 1m     — sustained peak
 *   100→0 VUs over 30s — ramp-down
 *
 * Run:
 *   k6 run tests/load/api-load.js
 *   k6 run --env API_BASE=http://localhost:8080 tests/load/api-load.js
 *
 * With output to Prometheus (if k6 is configured with the remote write
 * extension matching Grafana's k6 datasource):
 *   k6 run -o experimental-prometheus-rw tests/load/api-load.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// ── config ────────────────────────────────────────────────────────────────────

const API_BASE = __ENV.API_BASE || 'http://localhost:8080';

const ROAD_IDS = ['R001', 'R002', 'R003', 'R004', 'R005',
                  'R006', 'R007', 'R008', 'R009', 'R010'];

// ── custom metrics ────────────────────────────────────────────────────────────

const errorRate   = new Rate('api_error_rate');
const roadsLatency = new Trend('roads_list_latency', true);

// ── load profile ──────────────────────────────────────────────────────────────

export const options = {
  stages: [
    { duration: '30s', target: 50  },  // ramp up
    { duration: '1m',  target: 50  },  // steady
    { duration: '30s', target: 100 },  // scale to peak
    { duration: '1m',  target: 100 },  // sustained peak
    { duration: '30s', target: 0   },  // ramp down
  ],
  thresholds: {
    http_req_duration:  ['p(95)<500'],  // 95th pct < 500ms
    http_req_failed:    ['rate<0.01'],  // error rate < 1%
    api_error_rate:     ['rate<0.01'],
    roads_list_latency: ['p(95)<300'],
  },
};

// ── helpers ───────────────────────────────────────────────────────────────────

function randomRoad() {
  return ROAD_IDS[Math.floor(Math.random() * ROAD_IDS.length)];
}

function hoursAgo(n) {
  return new Date(Date.now() - n * 3600 * 1000).toISOString();
}

// ── scenario ──────────────────────────────────────────────────────────────────

export default function () {
  const headers = { 'Accept': 'application/json' };
  const road = randomRoad();
  const roll = Math.random();

  if (roll < 0.40) {
    // 40% — list all roads (most common: dashboard refresh)
    const t0 = Date.now();
    const res = http.get(`${API_BASE}/api/v1/roads`, { headers });
    roadsLatency.add(Date.now() - t0);
    const ok = check(res, {
      'roads status 200':          (r) => r.status === 200,
      'roads returns array':       (r) => Array.isArray(JSON.parse(r.body)),
    });
    errorRate.add(!ok);

  } else if (roll < 0.60) {
    // 20% — single road lookup
    const res = http.get(`${API_BASE}/api/v1/roads/${road}`, { headers });
    const ok = check(res, {
      'road status 200 or 404': (r) => r.status === 200 || r.status === 404,
    });
    errorRate.add(!ok);

  } else if (roll < 0.75) {
    // 15% — road history (last 2h)
    const url = `${API_BASE}/api/v1/roads/${road}/history?from=${hoursAgo(2)}&to=${hoursAgo(0)}`;
    const res  = http.get(url, { headers });
    const ok   = check(res, { 'history status 200': (r) => r.status === 200 });
    errorRate.add(!ok);

  } else if (roll < 0.85) {
    // 10% — alerts feed
    const res = http.get(`${API_BASE}/api/v1/alerts?limit=50`, { headers });
    const ok  = check(res, { 'alerts status 200': (r) => r.status === 200 });
    errorRate.add(!ok);

  } else if (roll < 0.92) {
    // 7% — road analytics
    const res = http.get(`${API_BASE}/api/v1/roads/${road}/analytics`, { headers });
    const ok  = check(res, { 'analytics status 200': (r) => r.status === 200 });
    errorRate.add(!ok);

  } else {
    // 8% — actuator health (simulates load-balancer probes)
    const res = http.get(`${API_BASE}/actuator/health`, { headers });
    check(res, { 'health status 200': (r) => r.status === 200 });
  }

  sleep(Math.random() * 0.5 + 0.1); // 100–600ms think time
}
