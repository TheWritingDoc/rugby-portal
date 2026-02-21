
import { test, expect } from '@playwright/test';

test.describe('EPHSRU Admin Zone Details', () => {
  test.beforeEach(async ({ page }) => {
    // 1. Navigate to the application
    await page.goto('/');

    // 2. Login as EPHSRU Admin
    await page.fill('input[type="email"]', 'admin@ephsru.co.za');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button:has-text("Sign In")');

    // 3. Verify successful login
    // Wait for ANY heading to be visible, then check text
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 20000 });
    
    // Take screenshot of Dashboard
    await page.screenshot({ path: 'test-results/screenshots/dashboard.png', fullPage: true });
  });

  test('should navigate to Zone Details and verify schools', async ({ page }) => {
    // 1. Navigate to "Zones" tab
    // Try a more generic text match that is clickable
    await page.click('text="Zones"');
    
    // Wait for animation/transition
    await page.waitForTimeout(1000);
    
    // Take screenshot of Zones Tab
    await page.screenshot({ path: 'test-results/screenshots/zones-tab.png', fullPage: true });
    
    // 2. Click on the "Uitenhage" zone card
    // Use a more specific locator strategy
    const uitenhageCard = page.locator('div.rounded-xl').filter({ hasText: 'Uitenhage' }).first();
    await expect(uitenhageCard).toBeVisible();
    await uitenhageCard.click();

    // 3. Verify Zone Details Header
    await expect(page.locator('h1').filter({ hasText: 'Uitenhage' })).toBeVisible();
    await expect(page.getByText('Zone Detail', { exact: true })).toBeVisible();

    // Take screenshot of Zone Details
    await page.screenshot({ path: 'test-results/screenshots/zone-details.png', fullPage: true });

    // 4. Verify Coordinator Info
    await expect(page.getByText('Coordinator')).toBeVisible();
    
    // 5. Verify Schools List
    // Check for Gammel Street (Active)
    const activeSchool = page.locator('div.rounded-xl').filter({ hasText: 'Gammel Street' });
    await expect(activeSchool).toBeVisible();
    
    // Check for McCarthy (Inactive)
    const inactiveSchool = page.locator('div.rounded-xl').filter({ hasText: 'McCarthy' });
    await expect(inactiveSchool).toBeVisible();
  });
});
