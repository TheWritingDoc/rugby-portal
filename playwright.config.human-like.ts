import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Comprehensive Playwright configuration for human-like player management testing
 * Includes visual regression, performance metrics, and detailed reporting
 */
export default defineConfig({
  testDir: './tests',
  
  // Test timeout for human-like interactions (60 seconds)
  timeout: 60000,
  
  // Global setup and teardown
  globalSetup: join(__dirname, 'global-setup.ts'),
  globalTeardown: join(__dirname, 'global-teardown.ts'),
  
  // Retry failed tests for reliability
  retries: 2,
  
  // Number of workers - reduce for human-like tests to avoid interference
  workers: 1,
  
  // Reporter configuration for comprehensive reporting
  reporter: [
    ['html', {
      outputFolder: 'playwright-report-human',
      open: 'never',
      attachmentsBaseURL: 'attachments/'
    }],
    ['json', {
      outputFile: 'test-results/test-results.json'
    }],
    ['junit', {
      outputFile: 'test-results/junit-results.xml'
    }],
    ['list', { printSteps: true }],
    [join(__dirname, 'custom-reporter.ts')],
    ['allure-playwright', {
      detail: true,
      outputFolder: 'test-results/allure-results',
      suiteTitle: false,
      categories: [
        {
          name: 'Human-like Interaction Issues',
          messageRegex: '.*human.*interaction.*',
          matchedStatuses: ['failed', 'broken']
        },
        {
          name: 'Visual Regression Issues',
          messageRegex: '.*visual.*regression.*',
          matchedStatuses: ['failed', 'broken']
        },
        {
          name: 'Performance Issues',
          messageRegex: '.*performance.*',
          matchedStatuses: ['failed', 'broken']
        }
      ]
    }]
  ],
  
  // Use configuration for detailed test artifacts
  use: {
    // Base URL for the application
    baseURL: 'http://localhost:5173',
    
    // Screenshot configuration
    screenshot: {
      mode: 'only-on-failure',
      fullPage: true
    },
    
    // Video recording configuration
    video: {
      mode: 'retain-on-failure',
      size: { width: 1366, height: 768 }
    },
    
    // Trace collection for debugging
    trace: {
      mode: 'on-first-retry',
      screenshots: true,
      snapshots: true,
      sources: true
    },
    
    // Test artifacts configuration
    testIdAttribute: 'data-testid',
    
    // Locale and timezone for consistency
    locale: 'en-US',
    timezoneId: 'America/New_York',
    
    // Color scheme and viewport
    colorScheme: 'light',
    viewport: { width: 1366, height: 768 },
    
    // User agent for realistic testing
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    
    // Ignore HTTPS errors for local testing
    ignoreHTTPSErrors: true,
    
    // Action timeout for human-like interactions
    actionTimeout: 30000,
    
    // Navigation timeout
    navigationTimeout: 30000
  },
  
  // Projects configuration for different test scenarios
  projects: [
    {
      name: 'chromium-human-like',
      use: { 
        ...devices['Desktop Chrome'],
        // Custom viewport for human-like testing
        viewport: { width: 1366, height: 768 },
        // Enable JavaScript for realistic interactions
        javaScriptEnabled: true,
        // Accept downloads for file upload testing
        acceptDownloads: true
      },
      testMatch: /player-management-human-like\.spec\.ts/
    },
    {
      name: 'chromium-responsive',
      use: { 
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 }
      },
      testMatch: /.*responsive\.spec\.ts/
    },
    {
      name: 'mobile-chrome',
      use: { 
        ...devices['Pixel 5'],
        viewport: { width: 375, height: 667 }
      },
      testMatch: /.*mobile\.spec\.ts/
    },
    {
      name: 'tablet-chrome',
      use: { 
        ...devices['iPad (gen 7)'],
        viewport: { width: 768, height: 1024 }
      },
      testMatch: /.*tablet\.spec\.ts/
    }
  ],
  
  // WebServer configuration for local development
  webServer: [
    {
      command: 'npm run dev',
      port: 5173,
      reuseExistingServer: true,
      timeout: 120000
    },
    {
      command: 'npm run server',
      port: 4000,
      reuseExistingServer: true,
      timeout: 120000
    }
  ],
  
  // Expect configuration for better assertions
  expect: {
    timeout: 10000,
    toHaveScreenshot: {
      threshold: 0.2,
      maxDiffPixels: 100,
      maxDiffPixelRatio: 0.1
    },
    toMatchSnapshot: {
      threshold: 0.2,
      maxDiffPixels: 100
    }
  }
});
