/**
 * Playwright global setup — pre-warms Next.js dev-mode page compilation.
 *
 * In development mode Next.js lazily compiles each page on first request.
 * That first compile can take 5-20 seconds, which causes the per-test
 * `waitForFunction` (timeout: 10 000 ms) to expire before the page content
 * appears. Running a quick "cold visit" for every route here means all pages
 * are compiled before any test starts, so subsequent visits are near-instant.
 */
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:3001';
const PAGES = ['/', '/alerts', '/anomalies', '/predictions', '/map', '/analytics', '/leaderboard'];

export default async function globalSetup() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  for (const path of PAGES) {
    try {
      await page.goto(`${BASE}${path}`, {
        timeout: 60_000,
        waitUntil: 'domcontentloaded',
      });
    } catch {
      // Ignore individual page errors — we just need the compiler to run
    }
  }

  await browser.close();
}
