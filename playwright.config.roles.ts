import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  timeout: 60000,
  retries: 2,
  reporter: [['list'], ['junit', { outputFile: 'test-results/junit-roles.xml' }], ['html', { outputFolder: 'playwright-report-roles' }]],
  use: {
    trace: 'on-first-retry',
    video: 'off',
    screenshot: 'only-on-failure',
    baseURL: 'http://localhost:5173',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
})
