
import { test, expect } from '@playwright/test';

test('simple dashboard visibility check', async ({ page }) => {
  // 1. Navigate and Login
  await page.goto('/');
  await page.fill('input[type="email"]', 'admin@ephsru.co.za');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button:has-text("Sign In")');

  // 2. Wait for ANY content to load
  await page.waitForTimeout(5000);

  // 3. Take Screenshot
  await page.screenshot({ path: 'test-results/debug/simple-dashboard.png', fullPage: true });
});
