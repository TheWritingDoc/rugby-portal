import { test, expect } from '@playwright/test';

test.describe('Coach Team Filter', () => {
  let adminToken;
  let zoneId = 'Z_COACH_' + Date.now();
  let schoolId = 'S_COACH_' + Date.now();
  let adminEmail = `sa.c.${Date.now()}@test.local`;
  
  let coachU15Email = `c15.${Date.now()}@test.local`;
  let coachU16Email = `c16.${Date.now()}@test.local`;
  
  let playerU15Name = 'Player U15';
  let playerU16Name = 'Player U16';

  test.beforeAll(async ({ request }) => {
    // 1. Create EPHSRU Token
    const loginRes = await request.post('http://localhost:4000/api/login', {
      data: { role: 'EPHSRUAdmin' }
    });
    const ephToken = (await loginRes.json()).token;

    // 2. Create School Admin
    await request.post('http://localhost:4000/api/admins', {
      data: { name: 'School', surname: 'Admin', email: adminEmail, role: 'SchoolAdmin', zoneId, schoolId },
      headers: { Authorization: `Bearer ${ephToken}` }
    });

    // 3. Create School
    await request.post('http://localhost:4000/api/schools', {
      data: { schoolId, zoneId, name: 'Coach Test School', address: '123 St', contactNumber: '000', email: 's.coach@test.local' },
      headers: { Authorization: `Bearer ${ephToken}` }
    });

    // 4. Login as School Admin to create Coaches and Players
    const saLoginRes = await request.post('http://localhost:4000/api/login', {
      data: { role: 'SchoolAdmin', email: adminEmail, zoneId, schoolId }
    });
    adminToken = (await saLoginRes.json()).token;

    // 5. Create Coaches
    await request.post('http://localhost:4000/api/coaches', {
      data: { name: 'Coach', surname: 'U15', email: coachU15Email, zoneId, schoolId, team: 'U15' },
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    
    await request.post('http://localhost:4000/api/coaches', {
      data: { name: 'Coach', surname: 'U16', email: coachU16Email, zoneId, schoolId, team: 'U16' },
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    // 6. Create Players
    await request.post('http://localhost:4000/api/players', {
      data: { 
        name: 'Player', surname: 'U15', email: `p15.${Date.now()}@test.local`, 
        zoneId, schoolId, team: 'U15', status: 'approved'
      },
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    
    await request.post('http://localhost:4000/api/players', {
      data: { 
        name: 'Player', surname: 'U16', email: `p16.${Date.now()}@test.local`, 
        zoneId, schoolId, team: 'U16', status: 'approved'
      },
      headers: { Authorization: `Bearer ${adminToken}` }
    });
  });

  test('Coach only sees assigned team players', async ({ page }) => {
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    
    // Login as U15 Coach
    await page.goto('http://localhost:5173/login');
    await page.locator('input[type="email"]').first().fill(coachU15Email);
    await page.locator('input[type="password"]').first().fill('any');
    await page.click('button:has-text("Sign In")');

    // Verify Dashboard Header
    await expect(page.getByRole('heading', { name: /Welcome, Coach/ })).toBeVisible();
    await expect(page.getByText(/Team Management/)).toBeVisible();
    await expect(page.getByText('• U15')).toBeVisible();

    // Switch to Search view (flat list) to see players
    await page.getByRole('button', { name: 'Search' }).click();

    // Verify Players
    await expect(page.getByText('Player U15')).toBeVisible();
    await expect(page.getByText('Player U16')).not.toBeVisible();
    
    // Logout
    await page.evaluate(() => localStorage.clear());
    await page.goto('http://localhost:5173/login');

    // Login as U16 Coach
    await page.locator('input[type="email"]').first().fill(coachU16Email);
    await page.locator('input[type="password"]').first().fill('any');
    await page.click('button:has-text("Sign In")');
    
    // Verify Dashboard Header
    await expect(page.getByRole('heading', { name: /Welcome, Coach/ })).toBeVisible();
    await expect(page.getByText('• U16')).toBeVisible();

    // Switch to Search view (flat list) to see players
    await page.getByRole('button', { name: 'Search' }).click();

    // Verify Players
    await expect(page.getByText('Player U16')).toBeVisible();
    await expect(page.getByText('Player U15')).not.toBeVisible();
  });
});
