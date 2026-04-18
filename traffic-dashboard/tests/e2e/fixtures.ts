/**
 * Shared mock API data for Playwright E2E tests.
 *
 * All tests intercept `http://localhost:8080/**` with page.route() so the
 * backend does not need to be running.
 */

import type { Page } from '@playwright/test';

// ── mock data ─────────────────────────────────────────────────────────────────

export const mockRoads = [
  {
    roadId: 'R001',
    roadName: 'Nguyen Hue',
    totalVehicles: 120,
    avgSpeed: 22.5,
    congested: false,
    updatedAt: '2026-01-01T08:00:00Z',
  },
  {
    roadId: 'R002',
    roadName: 'Le Loi',
    totalVehicles: 200,
    avgSpeed: 8.0,
    congested: true,
    updatedAt: '2026-01-01T08:00:00Z',
  },
  {
    roadId: 'R003',
    roadName: 'Hai Ba Trung',
    totalVehicles: 80,
    avgSpeed: 35.0,
    congested: false,
    updatedAt: '2026-01-01T08:00:00Z',
  },
];

export const mockAlerts = [
  {
    roadId: 'R002',
    roadName: 'Le Loi',
    severity: 'HIGH',
    message: 'Severe congestion — avg speed below 10 km/h',
    triggeredAt: '2026-01-01T07:55:00Z',
  },
  {
    roadId: 'R001',
    roadName: 'Nguyen Hue',
    severity: 'MEDIUM',
    message: 'Heavy traffic — avg speed below 20 km/h',
    triggeredAt: '2026-01-01T07:45:00Z',
  },
];

export const mockAnomalies = [
  {
    roadId: 'R002',
    roadName: 'Le Loi',
    currentSpeed: 8.0,
    expectedSpeed: 35.0,
    deviationPct: 77.1,
    severity: 'HIGH',
  },
];

export const mockPulse = {
  avgSpeed: 21.8,
  congestionRate: 33,
  totalVehicles: 400,
  activeCongestionCount: 1,
  activeIncidentCount: 0,
};

// ── route helper ──────────────────────────────────────────────────────────────

/**
 * Register all standard API mocks on the page.
 * Call this inside `test.beforeEach` or at the top of each test.
 */
export async function mockApiRoutes(page: Page) {
  const API = 'http://localhost:8080';

  /**
   * Playwright uses LIFO (last-in first-out) route matching — the most
   * recently registered handler wins. Register the broad fallback FIRST so
   * the specific handlers added afterwards take priority.
   */

  // Fallback: any unmatched /api/v1/* → empty array (registered first = lowest priority)
  await page.route(`${API}/api/v1/**`, (route) =>
    route.fulfill({ json: [] })
  );

  // Specific routes (registered last = highest priority in LIFO order).
  // Use function predicates for reliable query-string matching (glob `?` is
  // ambiguous in Playwright and may not match `?limit=200`).

  await page.route(
    (url) => url.toString() === `${API}/api/v1/roads`,
    (route) => route.fulfill({ json: mockRoads })
  );

  await page.route(
    (url) => url.toString().includes('/api/v1/alerts'),
    (route) => route.fulfill({ json: mockAlerts })
  );

  await page.route(
    (url) => url.toString().includes('/api/v1/anomalies'),
    (route) => route.fulfill({ json: mockAnomalies })
  );

  await page.route(
    (url) => url.toString().includes('/api/v1/city/pulse'),
    (route) => route.fulfill({ json: mockPulse })
  );

  // Abort WebSocket — useLiveTraffic reconnects gracefully after failure
  await page.routeWebSocket(`ws://localhost:8080/ws/live`, (ws) => {
    ws.close();
  });
}
