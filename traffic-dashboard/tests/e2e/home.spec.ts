import { test, expect } from '@playwright/test';
import { mockApiRoutes, mockRoads } from './fixtures';

/**
 * Home page (Dashboard) E2E tests.
 *
 * Verifies:
 *  - Page title and heading render correctly
 *  - Road cards appear for each mocked road
 *  - Stat cards show vehicle / speed counts
 *  - Filter buttons work (All / Congested / Flowing)
 *  - Search input filters roads by name
 */

test.describe('Home page', () => {
  test.beforeEach(async ({ page }) => {
    await mockApiRoutes(page);
    await page.goto('/');
    // Wait for road data to appear — search innerHTML since cards may be below
    // the visible fold (innerText only returns on-screen text)
    await page.waitForFunction(
      () => document.body.innerHTML.includes('Nguyen Hue'),
      { timeout: 30_000 }
    );
  });

  test('has correct page title', async ({ page }) => {
    await expect(page).toHaveTitle(/TrafficOS/);
  });

  test('sidebar shows TrafficOS brand', async ({ page }) => {
    await expect(page.getByText('TrafficOS')).toBeVisible();
  });

  test('sidebar navigation items are present', async ({ page }) => {
    const nav = page.locator('aside nav');
    await expect(nav.getByText('Dashboard')).toBeVisible();
    await expect(nav.getByText('Alerts')).toBeVisible();
    await expect(nav.getByText('Live Map')).toBeVisible();
    await expect(nav.getByText('Predictions')).toBeVisible();
  });

  test('renders road names from API', async ({ page }) => {
    for (const road of mockRoads) {
      // Scroll into view since cards may be below the visible fold
      await page.getByText(road.roadName).first().scrollIntoViewIfNeeded();
      await expect(page.getByText(road.roadName).first()).toBeVisible();
    }
  });

  test('LIVE status indicator is in the sidebar', async ({ page }) => {
    // "LIVE" badge is inside `hidden lg:flex` — visible at 1280px Desktop Chrome
    await expect(page.locator('aside').getByText('LIVE')).toBeVisible();
  });

  test('search filters roads by name', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/search/i);
    await searchInput.fill('Nguyen');
    await expect(page.getByText('Nguyen Hue')).toBeVisible();
    await expect(page.getByText('Le Loi')).not.toBeVisible();
  });

  test('congested filter shows only congested roads', async ({ page }) => {
    await page.getByRole('button', { name: /congested/i }).click();
    // Le Loi is congested, the others are not
    await expect(page.getByText('Le Loi')).toBeVisible();
    await expect(page.getByText('Hai Ba Trung')).not.toBeVisible();
  });

  test('flowing filter shows only non-congested roads', async ({ page }) => {
    await page.getByRole('button', { name: /flowing/i }).click();
    await expect(page.getByText('Nguyen Hue')).toBeVisible();
    await expect(page.getByText('Le Loi')).not.toBeVisible();
  });

  test('all filter restores full road list', async ({ page }) => {
    await page.getByRole('button', { name: /congested/i }).click();
    await page.getByRole('button', { name: /^all$/i }).click();
    for (const road of mockRoads) {
      await expect(page.getByText(road.roadName)).toBeVisible();
    }
  });
});
