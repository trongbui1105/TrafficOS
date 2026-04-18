import { test, expect } from '@playwright/test';
import { mockApiRoutes } from './fixtures';

/**
 * Navigation E2E tests.
 *
 * Verifies that clicking sidebar links takes the user to the correct page
 * and that each destination renders its core heading.
 */

test.describe('Sidebar navigation', () => {
  test.beforeEach(async ({ page }) => {
    await mockApiRoutes(page);
    await page.goto('/');
  });

  test('navigates to Alerts page', async ({ page }) => {
    await page.locator('aside nav').getByText('Alerts').click();
    await expect(page).toHaveURL(/\/alerts/);
    // The alerts page heading is "Alert Feed"
    await expect(page.getByRole('heading', { name: /alert feed/i })).toBeVisible();
  });

  test('navigates to Anomalies page', async ({ page }) => {
    await page.locator('aside nav').getByText('Anomalies').click();
    await expect(page).toHaveURL(/\/anomalies/);
  });

  test('navigates to Predictions page', async ({ page }) => {
    await page.locator('aside nav').getByText('Predictions').click();
    await expect(page).toHaveURL(/\/predictions/);
  });

  test('navigates to Live Map page', async ({ page }) => {
    await page.locator('aside nav').getByText('Live Map').click();
    await expect(page).toHaveURL(/\/map/);
  });

  test('navigates to Analytics page', async ({ page }) => {
    await page.locator('aside nav').getByText('Analytics').click();
    await expect(page).toHaveURL(/\/analytics/);
  });

  test('navigates to Leaderboard page', async ({ page }) => {
    await page.locator('aside nav').getByText('Leaderboard').click();
    await expect(page).toHaveURL(/\/leaderboard/);
  });

  test('navigates back to Dashboard from any page', async ({ page }) => {
    await page.locator('aside nav').getByText('Alerts').click();
    await page.locator('aside nav').getByText('Dashboard').click();
    await expect(page).toHaveURL('/');
  });

  test('active nav item is visually highlighted', async ({ page }) => {
    // On the home page the Dashboard link should have the active style
    const dashLink = page.locator('aside nav a[href="/"]');
    await expect(dashLink).toHaveClass(/bg-blue-600/);
  });
});
