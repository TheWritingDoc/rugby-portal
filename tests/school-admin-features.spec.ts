import { test, expect } from '@playwright/test';

test.describe('School Admin Features', () => {
  let adminToken;
  let zoneId = 'Z_SA_TEST_' + Date.now();
  let schoolId = 'S_SA_TEST_' + Date.now();
  let adminEmail = `sa.${Date.now()}@test.local`;
  let playerEmail = `p.${Date.now()}@test.local`;
  let coachEmail = `c.${Date.now()}@test.local`;

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
      data: { schoolId, zoneId, name: 'Test School SA', address: '123 St', contactNumber: '000', email: 's.sa@test.local' },
      headers: { Authorization: `Bearer ${ephToken}` }
    });

    // 4. Login as School Admin
    const saLoginRes = await request.post('http://localhost:4000/api/login', {
      data: { role: 'SchoolAdmin', email: adminEmail, zoneId, schoolId }
    });
    adminToken = (await saLoginRes.json()).token;

    // 5. Create a Player (Rejected status)
    // We create directly via API or DB. Let's use API as Coach then Reject? 
    // Or just create as pending then reject.
    // For simplicity, let's create a player via POST /api/players (as if self-registered or coach added)
    // Then reject it using a direct DB update or API call if available.
    // Actually, let's just create a player. Default is pending.
    const pRes = await request.post('http://localhost:4000/api/players', {
      data: { 
        name: 'Rejected', surname: 'Player', email: playerEmail, 
        zoneId, schoolId, team: 'U19', status: 'rejected', rejectionReason: 'Initial Reject' 
      },
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    // Note: Standard POST might ignore status override depending on backend. 
    // If it ignores, we might need to reject it.
    // Let's check if we can reject it.
    const pData = await pRes.json();
    
    // Force reject via backend if needed, but let's assume we can set it via direct DB access or just use the UI to reject first then override?
    // Let's try to update it to rejected via PUT as SchoolAdmin
    await request.put(`http://localhost:4000/api/players/${pData.id}`, {
      data: { status: 'rejected', rejectionReason: 'Test Reject', schoolId, zoneId },
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    // 6. Create a Coach
    await request.post('http://localhost:4000/api/coaches', {
      data: { name: 'Coach', surname: 'One', email: coachEmail, zoneId, schoolId, team: 'U15' },
      headers: { Authorization: `Bearer ${adminToken}` }
    });
  });

  test('School Admin Dashboard Features', async ({ page }) => {
    await page.goto('http://localhost:5173/login');
    await page.locator('input[type="email"]').first().fill(adminEmail);
    await page.locator('input[type="password"]').first().fill('any');
    await page.click('button:has-text("Sign In")');

    // 1. Verify Dashboard Loads
    await expect(page.getByText('School Administration')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Requests' })).toBeVisible();

    // 2. Check Requests Tab & Override
    await page.getByRole('button', { name: 'Requests' }).click();
    await expect(page.getByText('Rejected Player')).toBeVisible();
    await expect(page.getByText('Reason: Test Reject')).toBeVisible();
    
    // Handle Confirm Dialog
    page.on('dialog', dialog => dialog.accept());
    
    await page.click('button:has-text("Override Rejection")');
    
    // Verify it disappears from Rejected list (or status changes)
    await expect(page.getByText('Rejected Player')).not.toBeVisible(); // Should move to approved or pending? 
    // Logic sets it to 'approved'. So it should disappear from "Requests" tab which shows Pending/Rejected.
    // Let's verify in Overview stats
    await page.click('button:has-text("Overview")');
    await expect(page.getByText('1 approved')).toBeVisible();

    // 3. Teams View & Coach List
    await page.click('button:has-text("Teams & Players")');
    // Check if Coach One is listed under U15
    await expect(page.getByText('Coach One')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'U15' })).toBeVisible();

    // 4. Coach Reassignment
    await page.getByRole('button', { name: 'Coaches' }).click();
    await expect(page.getByText('Coach One')).toBeVisible();
    
    // Find the coach card and click edit
    // The card contains "Coach One" and has buttons
    await page.locator('.rounded-xl', { hasText: 'Coach One' })
        .locator('button')
        .first() // The first button in the card should be Edit (based on order in JSX: Edit, Trash)
        .click();
    
    // Change Team to U19
    await page.locator('div.rounded-xl', { hasText: 'Edit Coach' })
        .locator('select')
        .selectOption('U19');
        
    await page.click('button:has-text("Update Coach")');
    
    // Verify Change
    await expect(page.getByText('U19').first()).toBeVisible();
    
    // Check in Teams tab again
    await page.click('button:has-text("Teams & Players")');
    await expect(page.getByText('Coach One')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'U19' })).toBeVisible();

    // 5. View Player Profile
    await page.click('button:has-text("Overview")');
    // Click on the player card
    await page.getByText('Rejected Player').first().click();
    
    // Verify Modal
    await expect(page.getByText('Player Profile')).toBeVisible();
    // Use locator with value selector as fallback for getByDisplayValue
    await expect(page.locator('input[value="Rejected"]')).toBeVisible();
    await expect(page.locator('input[value="Player"]')).toBeVisible();
    
    // Close Modal
    await page.locator('button:has(svg.lucide-x)').first().click();
    await expect(page.getByText('Player Profile')).not.toBeVisible();
  });
});
