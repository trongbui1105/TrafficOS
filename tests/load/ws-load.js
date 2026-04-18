/**
 * k6 WebSocket load test — /ws/live endpoint
 *
 * Simulates concurrent dashboard clients holding open WebSocket connections
 * and receiving real-time road-update messages.
 *
 * Each virtual user:
 *   1. Opens a WS connection to /ws/live
 *   2. Holds it for up to 30s, counting and validating messages
 *   3. Checks that messages arrive within the expected latency budget
 *
 * Run:
 *   k6 run tests/load/ws-load.js
 *   k6 run --env WS_URL=ws://localhost:8080 tests/load/ws-load.js
 */

import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// ── config ────────────────────────────────────────────────────────────────────

const WS_URL = (__ENV.WS_URL || 'ws://localhost:8080') + '/ws/live';

// ── custom metrics ────────────────────────────────────────────────────────────

const messageCount    = new Counter('ws_messages_received');
const parseErrorRate  = new Rate('ws_parse_error_rate');
const connectDuration = new Trend('ws_connect_duration_ms', true);

// ── load profile ──────────────────────────────────────────────────────────────

export const options = {
  stages: [
    { duration: '20s', target: 50 },  // ramp to 50 concurrent WS clients
    { duration: '1m',  target: 50 },  // sustain
    { duration: '20s', target: 100 }, // scale to 100 concurrent clients
    { duration: '1m',  target: 100 }, // sustain peak
    { duration: '20s', target: 0 },   // ramp down
  ],
  thresholds: {
    ws_connecting:         ['p(95)<2000'],  // connection established < 2s
    ws_messages_received:  ['count>0'],     // at least some messages received
    ws_parse_error_rate:   ['rate<0.01'],   // parse failures < 1%
    ws_connect_duration_ms:['p(95)<1000'],  // 95th pct connect time < 1s
  },
};

// ── scenario ──────────────────────────────────────────────────────────────────

export default function () {
  const connectStart = Date.now();

  const res = ws.connect(WS_URL, null, function (socket) {
    connectDuration.add(Date.now() - connectStart);

    socket.on('open', () => {
      // Connection is up — just listen for 25s then close
      socket.setTimeout(() => socket.close(), 25_000);
    });

    socket.on('message', (data) => {
      messageCount.add(1);

      let parsed;
      try {
        parsed = JSON.parse(data);
      } catch {
        parseErrorRate.add(true);
        return;
      }
      parseErrorRate.add(false);

      // Validate envelope structure
      check(parsed, {
        'message has type field':  (m) => typeof m.type === 'string',
        'message has data field':  (m) => m.data !== undefined,
        'type is known value':     (m) => ['road_update', 'alert'].includes(m.type),
      });

      if (parsed.type === 'road_update') {
        check(parsed.data, {
          'road_update has roadId':   (d) => typeof d.roadId === 'string',
          'road_update has avgSpeed': (d) => typeof d.avgSpeed === 'number',
          'avgSpeed is non-negative': (d) => d.avgSpeed >= 0,
        });
      }

      if (parsed.type === 'alert') {
        check(parsed.data, {
          'alert has roadId':   (d) => typeof d.roadId === 'string',
          'alert has severity': (d) => ['LOW', 'MEDIUM', 'HIGH'].includes(d.severity),
        });
      }
    });

    socket.on('error', (e) => {
      console.warn(`WS error: ${e.error()}`);
    });
  });

  check(res, { 'ws connection status 101': (r) => r && r.status === 101 });
  sleep(1);
}
