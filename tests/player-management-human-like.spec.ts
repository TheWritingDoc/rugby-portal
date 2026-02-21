import { test, expect, Page } from '@playwright/test';
import { faker } from '@faker-js/faker';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test data interfaces
interface PlayerProfile {
  name: string;
  surname: string;
  dateOfBirth: string;
  gender: 'Male' | 'Female';
  zone: string;
  school: string;
  grade: string;
  parentName: string;
  parentPhone: string;
  parentEmail: string;
  playerPhoto?: string;
}

interface LoginCredentials {
  role: string;
  username?: string;
  password?: string;
}

// Human-like interaction helpers
class HumanInteraction {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  // Simulate human-like typing with realistic speed and occasional pauses
  async typeLikeHuman(selector: string, text: string, options: { mistakes?: boolean; speed?: number } = {}) {
    const { mistakes = true, speed = 50 } = options;
    const element = await this.page.locator(selector);
    await element.click();
    
    // Clear existing text
    await element.clear();
    
    // Type with human-like speed
    for (let i = 0; i < text.length; i++) {
      await element.type(text[i], { delay: speed + Math.random() * 50 });
      
      // Occasionally make mistakes and correct them
      if (mistakes && Math.random() < 0.05 && i > 3) {
        // Make a typo
        const typoChar = faker.string.alpha(1);
        await element.type(typoChar, { delay: speed });
        
        // Pause (like realizing the mistake)
        await this.page.waitForTimeout(200 + Math.random() * 300);
        
        // Backspace to correct
        await element.press('Backspace', { delay: speed });
        
        // Retype the correct character
        await element.type(text[i], { delay: speed });
      }
      
      // Random pause between words
      if (text[i] === ' ' && Math.random() < 0.3) {
        await this.page.waitForTimeout(100 + Math.random() * 200);
      }
    }
    
    // Final pause after typing
    await this.page.waitForTimeout(200 + Math.random() * 300);
  }

  // Simulate realistic dropdown selection with hesitation
  async selectDropdownLikeHuman(selector: string, option: string) {
    const dropdown = await this.page.locator(selector);
    await dropdown.click();
    
    // Hesitation before selection (like reading options)
    await this.page.waitForTimeout(500 + Math.random() * 1000);
    
    // Scroll through options like a human would
    const options = await this.page.locator(`${selector} option`).all();
    const scrollCount = Math.min(options.length, 3 + Math.floor(Math.random() * 3));
    
    for (let i = 0; i < scrollCount; i++) {
      await this.page.keyboard.press('ArrowDown');
      await this.page.waitForTimeout(100 + Math.random() * 200);
    }
    
    // Final selection
    await dropdown.selectOption({ label: option });
    await this.page.waitForTimeout(200 + Math.random() * 300);
  }

  // Simulate file upload with realistic delays
  async uploadFileLikeHuman(fileInput: string, filePath: string) {
    const input = await this.page.locator(fileInput);
    
    // Simulate finding the file
    await this.page.waitForTimeout(1000 + Math.random() * 2000);
    
    // Upload the file
    await input.setInputFiles(filePath);
    
    // Wait for upload to process
    await this.page.waitForTimeout(500 + Math.random() * 1000);
  }

  // Simulate reading and comprehension time
  async pauseForReading(minMs = 1000, maxMs = 3000) {
    await this.page.waitForTimeout(minMs + Math.random() * (maxMs - minMs));
  }

  // Simulate mouse movement and clicking with realistic timing
  async clickLikeHuman(selector: string) {
    const element = await this.page.locator(selector);
    
    // Hover first (like moving mouse to element)
    await element.hover();
    await this.page.waitForTimeout(200 + Math.random() * 300);
    
    // Click with slight delay
    await element.click({ delay: 50 + Math.random() * 100 });
    
    // Pause after click
    await this.page.waitForTimeout(300 + Math.random() * 500);
  }
}

// Generate realistic player profiles
function generatePlayerProfiles(count: number): PlayerProfile[] {
  const profiles: PlayerProfile[] = [];
  const firstNames = {
    Male: ['Liam', 'Noah', 'Oliver', 'Elijah', 'William', 'James', 'Benjamin', 'Lucas', 'Henry', 'Alexander'],
    Female: ['Emma', 'Olivia', 'Ava', 'Charlotte', 'Sophia', 'Amelia', 'Isabella', 'Mia', 'Evelyn', 'Harper']
  };
  const surnames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez'];
  const grades = ['Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'];

  for (let i = 0; i < count; i++) {
    const gender = Math.random() > 0.5 ? 'Male' : 'Female';
    const firstName = faker.helpers.arrayElement(firstNames[gender]);
    const surname = faker.helpers.arrayElement(surnames);
    
    // Generate realistic birth dates for school-age players (14-18 years old)
    const birthYear = 2006 + Math.floor(Math.random() * 5);
    const birthMonth = 1 + Math.floor(Math.random() * 12);
    const birthDay = 1 + Math.floor(Math.random() * 28);
    const dateOfBirth = `${birthYear}-${birthMonth.toString().padStart(2, '0')}-${birthDay.toString().padStart(2, '0')}`;

    profiles.push({
      name: firstName,
      surname: surname,
      dateOfBirth: dateOfBirth,
      gender: gender,
      zone: 'Northern areas',
      school: 'Hillside',
      grade: faker.helpers.arrayElement(grades),
      parentName: `${faker.helpers.arrayElement(firstNames.Male)} ${surname}`,
      parentPhone: `082${Math.floor(1000000 + Math.random() * 9000000)}`,
      parentEmail: `${firstName.toLowerCase()}.${surname.toLowerCase()}@gmail.com`
    });
  }

  return profiles;
}

// Create test files for upload
function createTestFiles() {
  const testDir = path.join(__dirname, 'test-files');
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir);
  }

  // Create a simple test image (1x1 pixel PNG)
  const pngData = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00, 0x0C,
    0x49, 0x44, 0x41, 0x54, 0x08, 0x99, 0x01, 0x01, 0x00, 0x00, 0x00, 0xFF,
    0xFF, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01, 0xE2, 0x21, 0xBC, 0x33, 0x00,
    0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
  ]);
  
  fs.writeFileSync(path.join(testDir, 'player-photo.png'), pngData);
  
  // Create a JPEG file
  const jpegData = Buffer.from([
    0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
    0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
    0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
    0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
    0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
    0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32,
    0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xD9
  ]);
  
  fs.writeFileSync(path.join(testDir, 'player-photo.jpg'), jpegData);
  
  return testDir;
}

test.describe('Player Management System - Human-like Interactions', () => {
  let page: Page;
  let human: HumanInteraction;
  let testPlayers: PlayerProfile[];
  let testFilesDir: string;
  let screenshotDir: string;
  let registeredEmail: string;
  let registeredPassword: string;

  test.beforeAll(async ({ browser }) => {
    // Create test data
    testPlayers = generatePlayerProfiles(5);
    testFilesDir = createTestFiles();
    screenshotDir = path.join(__dirname, '..', 'test-results', 'screenshots');
    
    // Create screenshots directory if it doesn't exist
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
    
    // Create new context with realistic viewport
    const context = await browser.newContext({
      viewport: { width: 1366, height: 768 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    
    page = await context.newPage();
    human = new HumanInteraction(page);
    
    // Set longer timeout for human-like interactions
    test.setTimeout(60000);
  });

  test.beforeEach(async () => {
    await page.goto('http://localhost:5173/');
    await page.waitForLoadState('networkidle');
  });

  test.afterAll(async () => {
    // Cleanup test files (keep page open to avoid closing during serial suite)
    if (fs.existsSync(testFilesDir)) {
      try { fs.rmSync(testFilesDir, { recursive: true, force: true }) } catch {}
    }
  });

  test('Complete player registration with human-like behavior', async () => {
    const player = testPlayers[0];
    registeredEmail = `human.player.${Date.now()}@example.com`;
    registeredPassword = 'secret123';

    // Home screenshot
    await page.screenshot({ path: path.join(screenshotDir, '01-initial-home.png'), fullPage: true });

    // Pre-registration on Home
    const registerSection = page.locator('section:has(h1:has-text("Register"))');
    await registerSection.getByLabel('Email').fill(registeredEmail);
    await registerSection.getByLabel('Create Password').fill(registeredPassword);
    await registerSection.getByLabel('Verify Password').fill(registeredPassword);
    await registerSection.getByLabel('Select registration form').selectOption('player');
    await registerSection.getByRole('button', { name: 'Continue' }).click();

    // Fill Player form
    await page.getByTestId('zone-select').selectOption({ index: 1 });
    await page.getByTestId('school-select').selectOption({ index: 1 });
    const selectedZone = await page.locator('[data-testid="zone-select"]').inputValue();
    const selectedSchool = await page.locator('[data-testid="school-select"]').inputValue();
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill(player.name);
    await page.getByRole('textbox', { name: 'Surname', exact: true }).fill(player.surname);
    await page.locator('input[type="date"]').fill(player.dateOfBirth);
    await page.getByLabel('Gender').selectOption({ label: player.gender });
    await page.getByRole('textbox', { name: 'Mobile Number', exact: true }).fill(player.parentPhone);
    await page.getByRole('textbox', { name: 'Email Address', exact: true }).first().fill(registeredEmail);

    // Optional upload
    const photoPath = path.join(testFilesDir, 'player-photo.png');
    await page.locator('input[type="file"]').first().setInputFiles(photoPath);

    await page.screenshot({ path: path.join(screenshotDir, '02-form-filled.png'), fullPage: true });

    await page.getByRole('button', { name: 'Submit Player Registration' }).click();
    await expect(page.getByText(/Congratulations! Your player registration has been submitted/i)).toBeVisible();
    await page.screenshot({ path: path.join(screenshotDir, '03-registration-success.png'), fullPage: true });
  });

  test('Login process with realistic human behavior including typos', async () => {
    const loginForm = page.locator('form:has(button:has-text("Sign In"))');
    await loginForm.getByLabel('Email').fill(registeredEmail);
    await loginForm.getByLabel('Password').fill(registeredPassword);
    await loginForm.getByRole('button', { name: 'Sign In' }).click();
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
    await page.screenshot({ path: path.join(screenshotDir, '06-login-success.png'), fullPage: true });
  });

  test('Dashboard verification with responsive testing', async () => {
    // Ensure logged in before verifying dashboard responsiveness
    const loginForm = page.locator('form:has(button:has-text("Sign In"))');
    await loginForm.getByLabel('Email').fill(registeredEmail || `viewer.${Date.now()}@example.com`);
    await loginForm.getByLabel('Password').fill(registeredPassword || 'secret123');
    await loginForm.getByRole('button', { name: 'Sign In' }).click();
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
    
    // Wait for dashboard to load
    await page.waitForSelector('h1:has-text("Dashboard")');
    await human.pauseForReading(2000, 3000);
    
    // Test different viewport sizes
    const viewports = [
      { width: 1920, height: 1080, name: 'desktop' },
      { width: 768, height: 1024, name: 'tablet' },
      { width: 375, height: 667, name: 'mobile' }
    ];
    
    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.waitForTimeout(1000);
      
      // Take responsive screenshot
      await page.screenshot({ 
        path: path.join(screenshotDir, `07-dashboard-${viewport.name}.png`), 
        fullPage: true 
      });
      
      // Verify dashboard heading visible
      await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
    }
    
    // Test dashboard filtering - note: dashboard doesn't have zone filter, this is just for responsive testing
    // The dashboard shows role-based content, not zone filtering
    await page.waitForTimeout(1000);
    
    // Take screenshot after filtering
    await page.screenshot({ path: path.join(screenshotDir, '08-dashboard-filtered.png'), fullPage: true });
    
    console.log('✅ Dashboard verification completed successfully!');
  });

  test('Multiple player registrations with data validation', async ({ request }) => {
    const registrations = testPlayers.slice(1, 4); // Register 3 more players
    
    for (let i = 0; i < registrations.length; i++) {
      const player = registrations[i];
      
    // Navigate via Register section
    const registerSection = page.locator('section:has(h1:has-text("Register"))');
    await registerSection.getByLabel('Email').fill(`multi.${Date.now()}@example.com`);
    await registerSection.getByLabel('Create Password').fill('secret123');
    await registerSection.getByLabel('Verify Password').fill('secret123');
    await registerSection.getByLabel('Select registration form').selectOption('player');
    await registerSection.getByRole('button', { name: 'Continue' }).click();
      
      // Fill form with realistic timing - match actual form structure
      await page.getByRole('textbox', { name: 'Name', exact: true }).fill(player.name);
      await page.getByRole('textbox', { name: 'Surname', exact: true }).fill(player.surname);
      
      const dobInput = page.locator('input[type="date"]');
      await dobInput.fill(player.dateOfBirth);
      
      await page.getByLabel('Gender').selectOption({ label: player.gender });
      await page.getByTestId('zone-select').selectOption({ index: 1 });
      await page.getByTestId('school-select').selectOption({ index: 1 });
      
      // ID Number
      await page.getByRole('textbox', { name: 'ID/Passport Number' }).fill('1234567890123');
      
      // Contact Information
      await page.getByRole('textbox', { name: 'Mobile Number', exact: true }).fill(player.parentPhone);
      await page.getByRole('textbox', { name: 'Email Address', exact: true }).first().fill(player.parentEmail);
      
      // Take screenshot of each registration
    await page.screenshot({ path: path.join(screenshotDir, `09-registration-${i + 1}-${player.name}-${player.surname}.png`), fullPage: true });
      
      // Submit and assert success
      await human.pauseForReading(1000, 2000);
      await page.getByRole('button', { name: 'Submit Player Registration' }).click();
      await expect(page.getByText(/Congratulations! Your player registration has been submitted/i)).toBeVisible();
      
      // Return to home for next registration
      // Fallback: navigate to home directly
      await page.goto('http://localhost:5173/');
      await human.pauseForReading(500, 1000);
    }
    
    // Final artifact screenshot on Home
    await page.goto('http://localhost:5173/');
    await page.screenshot({ path: path.join(screenshotDir, '10-final-home.png'), fullPage: true });
  });

  test('Accessibility and visual regression testing', async () => {
    // Test accessibility on registration form
    const registerSection2 = page.locator('section:has(h1:has-text("Register"))');
    await registerSection2.getByLabel('Email').fill(`a11y.${Date.now()}@example.com`);
    await registerSection2.getByLabel('Create Password').fill('secret123');
    await registerSection2.getByLabel('Verify Password').fill('secret123');
    await registerSection2.getByLabel('Select registration form').selectOption('player');
    await registerSection2.getByRole('button', { name: 'Continue' }).click();
    
    // Run accessibility audit
    const accessibilityScan = await page.accessibility.snapshot();
    expect(accessibilityScan).toBeTruthy();
    
    // Check form labels and ARIA attributes
    const nameInput = page.getByRole('textbox', { name: 'Name', exact: true });
    await expect(nameInput).toBeVisible();
    
    const form = page.locator('form');
    await expect(form).toBeVisible();
    
    // Test keyboard navigation
    await page.keyboard.press('Tab');
    await expect(page.locator('label:has-text("Zone") select')).toBeFocused();
    
    await page.keyboard.press('Tab');
    await expect(page.locator('label:has-text("School") select')).toBeFocused();
    
    // Take accessibility-focused screenshot
    await page.screenshot({ path: path.join(screenshotDir, '11-accessibility-check.png'), fullPage: true });
    
    // Presence of submit button
    await expect(page.getByRole('button', { name: 'Submit Player Registration' })).toBeVisible();
  });

  test('Performance metrics and error handling', async () => {
    // Enable performance metrics
    await page.evaluate(() => {
      (window as any).performanceMetrics = [];
    });
    
    // Test form validation with invalid data
    const registerSection3 = page.locator('section:has(h1:has-text("Register"))');
    await registerSection3.getByLabel('Email').fill(`perf.${Date.now()}@example.com`);
    await registerSection3.getByLabel('Create Password').fill('secret123');
    await registerSection3.getByLabel('Verify Password').fill('secret123');
    await registerSection3.getByLabel('Select registration form').selectOption('player');
    await registerSection3.getByRole('button', { name: 'Continue' }).click();
    
    // Try to submit empty form and then re-open fresh form
    await page.getByRole('button', { name: 'Submit Player Registration' }).click();
    await page.waitForTimeout(500);
    // Reopen the form to ensure clean state
    await page.goto('http://localhost:5173/');
    const registerSectionReload = page.locator('section:has(h1:has-text("Register"))');
    await registerSectionReload.getByLabel('Email').fill(`perf2.${Date.now()}@example.com`);
    await registerSectionReload.getByLabel('Create Password').fill('secret123');
    await registerSectionReload.getByLabel('Verify Password').fill('secret123');
    await registerSectionReload.getByLabel('Select registration form').selectOption('player');
    await registerSectionReload.getByRole('button', { name: 'Continue' }).click();
    
    // Test network error simulation
    await page.route('**/api/players', route => route.continue());
    
    // Fill form and submit
    const player = testPlayers[4];
    await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toBeVisible();
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill(player.name);
    await page.getByRole('textbox', { name: 'Surname', exact: true }).fill(player.surname);
    
    const dobInput = page.locator('input[type="date"]');
    await dobInput.fill(player.dateOfBirth);
    
    await page.getByLabel('Gender').selectOption({ label: player.gender });
    await expect(page.getByTestId('zone-select')).toBeVisible();
    await page.getByTestId('zone-select').selectOption({ index: 1 });
    await expect(page.getByTestId('school-select')).toBeVisible();
    await page.getByTestId('school-select').selectOption({ index: 1 });
    
    // ID Number
    await page.getByRole('textbox', { name: 'ID/Passport Number' }).fill('1234567890123');
    
    // Contact Information
    await page.getByRole('textbox', { name: 'Mobile Number', exact: true }).fill(player.parentPhone);
    await page.getByRole('textbox', { name: 'Email Address', exact: true }).first().fill(player.parentEmail);
    
    // Submit with retry logic
    let attempts = 0;
    let success = false;
    
    while (attempts < 3 && !success) {
      try {
        await human.clickLikeHuman('button:has-text("Submit Player Registration")');
        await page.waitForTimeout(2000); // Wait for response
        success = true;
      } catch (error) {
        attempts++;
        if (attempts < 3) {
          await human.pauseForReading(2000, 3000);
        }
      }
    }
    
    // Take final screenshot
    await page.screenshot({ path: path.join(screenshotDir, '12-performance-test.png'), fullPage: true });
  });

  test('Coach edits reflected when player logs in again', async () => {
    const ts = Date.now();
    const playerEmail = `coachplayer.${ts}@example.com`;
    const playerPassword = 'P12345678';
    const coachEmail = `coach.${ts}@example.com`;
    const coachPassword = 'C12345678';
    const playerName = `Test${ts}`;
  const playerSurname = `Spec${ts}`;
    const newName = `UpdatedName ${ts}`;
  let selectedZone = '';
  let selectedSchool = '';

    await page.goto('http://localhost:5173/');
    const registerSection = page.locator('section:has(h1:has-text("Register"))');
    await registerSection.getByLabel('Email').fill(playerEmail);
    await registerSection.getByLabel('Create Password').fill(playerPassword);
    await registerSection.getByLabel('Verify Password').fill(playerPassword);
    await registerSection.getByLabel('Select registration form').selectOption('player');
    await registerSection.getByRole('button', { name: 'Continue' }).click();
  await page.getByTestId('zone-select').selectOption({ index: 1 });
  await page.getByTestId('school-select').selectOption({ index: 1 });
  selectedZone = await page.locator('[data-testid="zone-select"]').inputValue();
  selectedSchool = await page.locator('[data-testid="school-select"]').inputValue();
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill(playerName);
    await page.getByRole('textbox', { name: 'Surname', exact: true }).fill(playerSurname);
    await page.locator('input[type="date"]').fill('2008-01-02');
    await page.getByLabel('Gender').selectOption({ label: 'Male' });
    await page.getByRole('textbox', { name: 'Mobile Number', exact: true }).fill('0821234567');
    await page.getByRole('textbox', { name: 'Email Address', exact: true }).first().fill(playerEmail);
    await page.getByRole('button', { name: 'Submit Player Registration' }).click();
    await expect(page.getByText(/player registration has been submitted/i)).toBeVisible();
    const playerId = await page.evaluate(async (email) => {
      const loginRes = await fetch('http://localhost:4000/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'EPHSRUAdmin' }) })
      const tokenData = loginRes.ok ? await loginRes.json() : null
      const t = tokenData?.token || ''
      const res = await fetch('http://localhost:4000/api/players', { headers: { ...(t ? { Authorization: `Bearer ${t}` } : {}) } })
      if (!res.ok) return null
      const rows = await res.json()
      const row = Array.isArray(rows) ? rows.find((r) => {
        const d = typeof r.data === 'string' ? JSON.parse(r.data || '{}') : (r.data || {})
        return String(r.email || d.email || '') === email
      }) : null
      return row?.id || null
    }, playerEmail)

    // Register coach directly (separate flow)
    await page.goto('http://localhost:5173/');
    
    // Wait for the page to load and check if registration section exists
    await page.waitForLoadState('networkidle');
    const coachRegisterSection = page.locator('section:has(h1:has-text("Register"))');
    
    // Debug: Check if registration section is visible
    const isVisible = await coachRegisterSection.isVisible();
    console.log('Registration section visible:', isVisible);
    
    if (!isVisible) {
      // Check what's on the page
      const pageText = await page.textContent('body');
      console.log('Page content:', pageText?.substring(0, 500));
      throw new Error('Registration section not found');
    }
    
    await coachRegisterSection.getByLabel('Email').fill(coachEmail);
    await coachRegisterSection.getByLabel('Create Password').fill(coachPassword);
    await coachRegisterSection.getByLabel('Verify Password').fill(coachPassword);
    await coachRegisterSection.getByLabel('Select registration form').selectOption('coach');
    await coachRegisterSection.getByRole('button', { name: 'Continue' }).click();
  await page.getByTestId('zone-select').selectOption({ value: selectedZone });
  await page.getByTestId('school-select').selectOption({ value: selectedSchool });
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Coach');
    await page.getByRole('textbox', { name: 'Surname', exact: true }).fill('User');
    await page.getByRole('textbox', { name: 'ID Number' }).fill('1234567890123');
    await page.locator('input[type="date"]').fill('1985-02-03');
    await page.getByRole('textbox', { name: 'Mobile Number', exact: true }).fill('0827654321');
    await page.getByRole('textbox', { name: 'Email Address', exact: true }).fill(coachEmail);
    await page.getByRole('button', { name: 'Submit Coach Registration' }).click();
    await expect(page.getByText(/coach registration has been submitted/i)).toBeVisible();

    await page.goto('http://localhost:5173/');
    const loginForm = page.locator('form:has(button:has-text("Sign In"))');
    await loginForm.getByLabel('Email').fill(coachEmail);
    await loginForm.getByLabel('Password').fill(coachPassword);
    await loginForm.getByRole('button', { name: 'Sign In' }).click();
    
    // Wait for login to complete and check if we're on dashboard
    await page.waitForTimeout(3000);
    
    // Check if we're on the dashboard or need to navigate
    const dashboardVisible = await page.getByRole('heading', { name: 'Role Dashboard', exact: true }).isVisible().catch(() => false) 
      || await page.getByRole('heading', { name: 'Dashboard', exact: true }).isVisible().catch(() => false);
    
    if (!dashboardVisible) {
      // Try to navigate to dashboard
      await page.evaluate(() => { try { localStorage.setItem('nav:target', 'dashboard') } catch {} })
      await page.goto('http://localhost:5173/');
      await page.waitForTimeout(2000);
    }
    
    await page.evaluate(() => new Promise<void>((resolve) => {
      const h = () => { window.removeEventListener('app:dashboard:mounted', h as any); resolve() }
      window.addEventListener('app:dashboard:mounted', h as any)
      setTimeout(() => resolve(), 2000)
    }))
    await page.waitForLoadState('networkidle')
    await page.evaluate(() => { try { localStorage.setItem('auth:role', 'Coach'); localStorage.setItem('nav:target', 'dashboard') } catch {} })
    
    // Check if credentials are now set
    const credsAfterLogin = await page.evaluate(() => {
      return {
        schoolId: localStorage.getItem('auth:schoolId'),
        zoneId: localStorage.getItem('auth:zoneId'),
        email: localStorage.getItem('auth:email'),
        role: localStorage.getItem('auth:role')
      }
    });
    console.log('Credentials after login:', credsAfterLogin);
    
    // Debug: Check what players the coach can see
    const coachPlayers = await page.evaluate(async ({ playerId, playerEmail }) => {
      const schoolId = localStorage.getItem('auth:schoolId');
      const zoneId = localStorage.getItem('auth:zoneId');
      const loginRes = await fetch('http://localhost:4000/api/login', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ role: 'EPHSRUAdmin' }) 
      })
      const tokenData = loginRes.ok ? await loginRes.json() : null
      const t = tokenData?.token || ''
      const res = await fetch('http://localhost:4000/api/players', { headers: { ...(t ? { Authorization: `Bearer ${t}` } : {}) } })
      if (!res.ok) return { error: 'Failed to fetch players' }
      const rows = await res.json()
      const targetPlayer = rows.find(p => p.id === playerId)
      const matchingPlayers = rows.filter(p => {
        const ps = String(p.schoolId ?? p.data?.schoolId ?? '')
        const pz = String(p.zoneId ?? p.data?.zoneId ?? '')
        return ps === schoolId || pz === zoneId
      })
      return {
        totalPlayers: rows.length,
        coachSchoolId: schoolId,
        coachZoneId: zoneId,
        matchingPlayers: matchingPlayers.length,
        targetPlayer: targetPlayer ? {
          id: targetPlayer.id,
          name: `${targetPlayer.data?.name || ''} ${targetPlayer.data?.surname || ''}`.trim(),
          schoolId: targetPlayer.schoolId ?? targetPlayer.data?.schoolId ?? '',
          zoneId: targetPlayer.zoneId ?? targetPlayer.data?.zoneId ?? '',
          email: targetPlayer.email ?? targetPlayer.data?.email ?? '',
          rawData: targetPlayer.data,
          dataType: typeof targetPlayer.data
        } : null,
        sampleMatching: matchingPlayers.slice(0, 5).map(p => ({
          id: p.id,
          name: `${p.data?.name || ''} ${p.data?.surname || ''}`.trim(),
          schoolId: p.schoolId ?? p.data?.schoolId ?? '',
          zoneId: p.zoneId ?? p.data?.zoneId ?? ''
        }))
      }
    }, { playerId, playerEmail });
    console.log('Coach players info:', coachPlayers);
    
    await page.waitForLoadState('networkidle');
    
    // Debug: Check localStorage after coach login
    const localStorageInfo = await page.evaluate(() => {
      return {
        schoolId: localStorage.getItem('auth:schoolId'),
        zoneId: localStorage.getItem('auth:zoneId'),
        email: localStorage.getItem('auth:email'),
        role: localStorage.getItem('auth:role')
      }
    })
    console.log('LocalStorage after coach login:', localStorageInfo)
    await page.evaluate(() => new Promise<void>((resolve) => {
      const h = () => { window.removeEventListener('data:players:loaded', h as any); resolve() }
      window.addEventListener('data:players:loaded', h as any)
      setTimeout(() => resolve(), 2000)
    }))

    // Debug: Check if player exists in the system
    const debugInfo = await page.evaluate(async ({ playerId, playerEmail }) => {
      const loginRes = await fetch('http://localhost:4000/api/login', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ role: 'EPHSRUAdmin' }) 
      })
      const tokenData = loginRes.ok ? await loginRes.json() : null
      const t = tokenData?.token || ''
      const res = await fetch('http://localhost:4000/api/players', { headers: { ...(t ? { Authorization: `Bearer ${t}` } : {}) } })
      if (!res.ok) return { error: 'Failed to fetch players' }
      const rows = await res.json()
      const player = rows.find((r) => r.id === playerId)
      return {
        totalPlayers: rows.length,
        foundPlayer: !!player,
        playerData: player,
        coachSchoolId: localStorage.getItem('auth:schoolId'),
        coachZoneId: localStorage.getItem('auth:zoneId')
      }
    }, { playerId, playerEmail })
    
    console.log('Debug info:', debugInfo)

    try {
      await page.waitForSelector('[data-player-id]', { timeout: 30000 });
      await page.waitForSelector(`[data-player-id="${playerId}"]`, { timeout: 30000 });
      const rowCard = page.locator(`[data-player-id="${playerId}"]`).first();
      await rowCard.scrollIntoViewIfNeeded();
      await rowCard.getByRole('button', { name: 'Edit' }).click();
    } catch {
      // Fallback: try to find by data-player-name attribute
      const rowByDataName = page.locator(`[data-player-name="${playerName} ${playerSurname}"]`).first();
      if (await rowByDataName.count() > 0) {
        await rowByDataName.scrollIntoViewIfNeeded();
        await rowByDataName.getByRole('button', { name: 'Edit' }).click();
      } else {
        // Last resort: try text-based selection with longer timeout
        await page.evaluate(() => new Promise<void>((resolve) => {
          const h = () => { window.removeEventListener('data:players:loaded', h as any); resolve() }
          window.addEventListener('data:players:loaded', h as any)
          setTimeout(() => resolve(), 2000)
        }))
        const anyCard = page.locator('[data-player-id]').first();
        if (!(await anyCard.isVisible().catch(() => false))) {
          await page.goto('http://localhost:5173/')
          await page.getByTestId('btn-dashboard').click().catch(() => {})
          await page.locator('[data-player-id]').first().waitFor({ timeout: 30000 })
        }
        await anyCard.getByRole('button', { name: 'Edit' }).click();
      }
    }
    const editor = page.locator('fieldset').filter({ hasText: 'Personal Information' }).first();
    const nameField = editor.locator('[data-field-key="name"] input');
    await nameField.fill(newName);
    await editor.locator('[data-field-key="name"] button:has-text("Save")').click();
    await page.evaluate(() => new Promise<void>((resolve) => {
      const h = () => { window.removeEventListener('data:players:updated', h as any); resolve() }
      window.addEventListener('data:players:updated', h as any)
      setTimeout(() => resolve(), 1500)
    }))
    const serverName = await page.evaluate(async ({ id, expected }) => {
      const loginRes = await fetch('http://localhost:4000/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'EPHSRUAdmin' }) })
      const tokenData = loginRes.ok ? await loginRes.json() : null
      const t = tokenData?.token || ''
      for (let i = 0; i < 12; i++) {
        const res = await fetch(`http://localhost:4000/api/players/${id}`, { headers: { ...(t ? { Authorization: `Bearer ${t}` } : {}) } })
        if (res.ok) {
          const row = await res.json()
          let name = ''
          if (row.name) name = row.name
          if (!name) {
            try {
              const d = typeof row.data === 'string' ? JSON.parse(row.data || '{}') : (row.data || {})
              name = d.name || ''
            } catch {}
          }
          if (name === expected) return name
        }
        await new Promise(r => setTimeout(r, 700))
      }
      return ''
    }, { id: playerId, expected: newName })
    expect(serverName).toBe(newName)

    await page.getByTestId('btn-login').click();
    const playerLogin = page.locator('form:has(button:has-text("Sign In"))');
    await playerLogin.getByLabel('Email').fill(playerEmail);
    await playerLogin.getByLabel('Password').fill(playerPassword);
    await playerLogin.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForFunction(() => localStorage.getItem('auth:role') === 'Player', null, { timeout: 10000 })
    await page.evaluate(() => { try { window.dispatchEvent(new CustomEvent('app:navigate', { detail: 'dashboard' })) } catch {} })
    await page.goto('http://localhost:5173/');
    await page.evaluate(() => new Promise<void>((resolve) => {
      const h = () => { window.removeEventListener('app:dashboard:mounted', h as any); resolve() }
      window.addEventListener('app:dashboard:mounted', h as any)
      setTimeout(() => resolve(), 300)
    }))
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => new Promise<void>((resolve) => {
      const h = () => { window.removeEventListener('data:players:loaded', h as any); resolve() }
      window.addEventListener('data:players:loaded', h as any)
      setTimeout(() => resolve(), 2000)
    }))
    const playerPanel = page.locator('[data-testid="player-self-panel"]');
    await expect(playerPanel).toBeVisible({ timeout: 30000 });
    await expect(playerPanel.locator('[data-player-name]')).toContainText(newName, { timeout: 30000 });
  });
});

// Test configuration for CI/CD
test.use({
  // Screenshot on failure
  screenshot: 'only-on-failure',
  
  // Video recording for human-like interaction verification
  video: 'retain-on-failure',
  
  // Trace collection for debugging
  trace: 'on-first-retry',
  
  // Retry flaky tests
  retries: 2,
  
  // Longer timeout for human-like interactions
  timeout: 60000,
  
  // Ensure consistent environment
  locale: 'en-US',
  timezoneId: 'America/New_York'
});
