
import { test, expect } from '@playwright/test';

test('analyze zones visibility', async ({ page }) => {
  // 1. Listen for console errors
  const consoleErrors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
      console.log(`PAGE ERROR: ${msg.text()}`);
    }
  });

  // 2. Navigate and Login
  await page.goto('/');
  await page.fill('input[type="email"]', 'admin@ephsru.co.za');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button:has-text("Sign In")');

  // 3. Wait for Dashboard to Load
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 20000 });
  await page.waitForTimeout(2000); // Allow layout to settle

  // 4. Capture Navigation State
  const navContainer = page.locator('nav').first();
  const navBox = await navContainer.boundingBox();
  console.log('Navigation Bar Bounding Box:', navBox);

  // 5. Check "Zones" Tab specifically
  const zonesTab = page.locator('button', { hasText: 'Zones' });
  const isZonesVisible = await zonesTab.isVisible();
  console.log('Is Zones Tab Visible?', isZonesVisible);
  
  if (isZonesVisible) {
      const box = await zonesTab.boundingBox();
      console.log('Zones Tab Bounding Box:', box);
  }

  // 6. Take Detailed Screenshots
  await page.screenshot({ path: 'test-results/debug/full-dashboard.png', fullPage: true });
  if (navBox) {
      // Screenshot just the navigation area
      await page.screenshot({ 
          path: 'test-results/debug/nav-bar.png',
          clip: { x: 0, y: navBox.y - 10, width: 1920, height: navBox.height + 20 }
      });
  }

  // 7. Check for Overflow
  const navScrollWidth = await navContainer.evaluate(el => el.scrollWidth);
  const navClientWidth = await navContainer.evaluate(el => el.clientWidth);
  console.log(`Nav ScrollWidth: ${navScrollWidth}, ClientWidth: ${navClientWidth}`);
  
  // 8. Fail if console errors found
  if (consoleErrors.length > 0) {
      throw new Error(`Found ${consoleErrors.length} console errors`);
  }
});
