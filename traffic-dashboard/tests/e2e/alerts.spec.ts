import { test, expect } from '@playwright/test';
import { mockApiRoutes, mockAlerts } from './fixtures';

/**
 * Alerts page E2E tests.
 *
 * Verifies:
 *  - Alerts list renders mocked data
 *  - Severity filter buttons work (ALL / HIGH / MEDIUM / LOW)
 *  - Timeline view toggle is available
 */

test.describe('Alerts page', () => {
  test.beforeEach(async ({ page }) => {
    await mockApiRoutes(page);
    await page.goto('/alerts');
    // Wait for at least one alert to appear (search innerHTML — cards may be below fold)
    await page.waitForFunction(
      () => document.body.innerHTML.includes('Le Loi') || document.body.innerHTML.includes('Nguyen Hue'),
      { timeout: 30_000 }
    );
  });

  test('renders page heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /alert feed/i })).toBeVisible();
  });

  test('renders alert road names from mock data', async ({ page }) => {
    for (const alert of mockAlerts) {
      await page.getByText(alert.roadName).first().scrollIntoViewIfNeeded();
      await expect(page.getByText(alert.roadName).first()).toBeVisible();
    }
  });

  test('HIGH severity alert is displayed', async ({ page }) => {
    await expect(page.getByText('HIGH').first()).toBeVisible();
  });

  test('filter by HIGH shows only high-severity alerts', async ({ page }) => {
    // Button text includes the count badge (e.g. "HIGH 1"), so use partial match
    await page.getByRole('button', { name: /HIGH/i }).first().click();
    // Le Loi has HIGH, Nguyen Hue has MEDIUM
    await expect(page.getByText('Le Loi').first()).toBeVisible();
    await expect(page.getByText('Nguyen Hue').first()).not.toBeVisible();
  });

  test('filter by MEDIUM shows only medium-severity alerts', async ({ page }) => {
    await page.getByRole('button', { name: /MEDIUM/i }).first().click();
    await expect(page.getByText('Nguyen Hue').first()).toBeVisible();
    await expect(page.getByText('Le Loi').first()).not.toBeVisible();
  });

  test('filter ALL restores full list', async ({ page }) => {
    await page.getByRole('button', { name: /HIGH/i }).first().click();
    await page.getByRole('button', { name: /^ALL$/i }).click();
    for (const alert of mockAlerts) {
      await page.getByText(alert.roadName).first().scrollIntoViewIfNeeded();
      await expect(page.getByText(alert.roadName).first()).toBeVisible();
    }
  });

  test('timeline view button is present', async ({ page }) => {
    const timelineBtn = page.getByRole('button', { name: /timeline/i });
    await expect(timelineBtn).toBeVisible();
    await timelineBtn.click();
    // Should still show road names in timeline view
    await page.getByText('Le Loi').first().scrollIntoViewIfNeeded();
    await expect(page.getByText('Le Loi').first()).toBeVisible();
  });

  test('export CSV button is present', async ({ page }) => {
    // Button text is "Export CSV" (with a Download icon)
    await expect(page.getByRole('button', { name: /export csv/i })).toBeVisible();
  });
});
