import { test, expect } from '@playwright/test';

test.describe('Zone Coordinator Features', () => {
  let zoneToken;
  let zoneId = 'Z_ZC_TEST_' + Date.now();
  let schoolId = 'S_ZC_TEST_' + Date.now();
  let zoneEmail = `zc.${Date.now()}@test.local`;
  let playerEmail = `p.${Date.now()}@test.local`;
  let refereeEmail = `r.${Date.now()}@test.local`;

  test.beforeAll(async ({ request }) => {
    // 1. Create EPHSRU Token
    const loginRes = await request.post('http://localhost:4000/api/login', {
      data: { role: 'EPHSRUAdmin' }
    });
    const ephToken = (await loginRes.json()).token;

    // 2. Create Zone Coordinator
    const zcRes = await request.post('http://localhost:4000/api/admins', {
      data: { name: 'Zone', surname: 'Coord', email: zoneEmail, role: 'ZoneCoordinator', zoneId },
      headers: { Authorization: `Bearer ${ephToken}` }
    });
    expect(zcRes.ok()).toBeTruthy();

    // 3. Create School
    const sCreateRes = await request.post('http://localhost:4000/api/schools', {
      data: { schoolId: schoolId, zoneId, name: 'Test School ZC', address: '456 Ave', contactNumber: '111', email: 's.zc@test.local' },
      headers: { Authorization: `Bearer ${ephToken}` }
    });
    if (!sCreateRes.ok()) {
      console.log('School Create Failed:', sCreateRes.status(), await sCreateRes.text());
    }
    expect(sCreateRes.ok()).toBeTruthy();
    const sData = await sCreateRes.json();
    const schoolUuid = sData.id;

    // 4. Login as Zone Coordinator
    const zcLoginRes = await request.post('http://localhost:4000/api/login', {
      data: { role: 'ZoneCoordinator', email: zoneEmail, zoneId }
    });
    zoneToken = (await zcLoginRes.json()).token;

    // 5. Create a Player (Rejected status)
    const pRes = await request.post('http://localhost:4000/api/players', {
      data: { 
        name: 'Rejected', surname: 'ZonePlayer', email: playerEmail, 
        zoneId, schoolId: schoolUuid, team: 'U16', status: 'rejected', rejectionReason: 'Zone Test Reject' 
      },
      headers: { Authorization: `Bearer ${ephToken}` }
    });
    const pData = await pRes.json();
    
    // Ensure rejected status if POST defaults to pending
    await request.put(`http://localhost:4000/api/players/${pData.id}`, {
      data: { status: 'rejected', rejectionReason: 'Zone Test Reject', schoolId: schoolUuid, zoneId },
      headers: { Authorization: `Bearer ${ephToken}` }
    });

    // 6. Create a Referee
    await request.post('http://localhost:4000/api/referees', {
      data: { 
        name: 'Ref', surname: 'Eree', email: refereeEmail, 
        zoneId, qualifications: 'Level 1' 
      },
      headers: { Authorization: `Bearer ${zoneToken}` }
    });

    // Verify data exists
     const sCheck = await request.get(`http://localhost:4000/api/schools?zoneId=${zoneId}`, {
       headers: { Authorization: `Bearer ${ephToken}` }
     });
     const sList = await sCheck.json();
     if (sList.length === 0) throw new Error('Setup failed: School not found by zoneId');
   });

   test('Zone Coordinator Dashboard Features', async ({ page }) => {
    await page.goto('http://localhost:5173/login');
    await page.locator('input[type="email"]').first().fill(zoneEmail);
    await page.locator('input[type="password"]').first().fill('any');
    await page.click('button:has-text("Sign In")');

    // 1. Verify Dashboard Loads & Stats
    await expect(page.getByText('Zone Administration')).toBeVisible();
    await expect(page.getByText('Managing 1 Schools')).toBeVisible();
    
    // Check specific stats cards
    // We look for the stat card that contains the label and the number
    await expect(page.locator('.rounded-xl', { hasText: 'Schools' }).locator('.text-2xl')).toHaveText('1');
    await expect(page.locator('.rounded-xl', { hasText: 'Referees' }).locator('.text-2xl')).toHaveText('1');
    await expect(page.locator('.rounded-xl', { hasText: 'Rejected Requests' }).locator('.text-2xl')).toHaveText('1');

    // 2. Schools Tab & Drill Down
    await page.click('button:has-text("Schools")');
    const schoolCard = page.locator('button').filter({ hasText: 'Test School ZC' }).first();
    await expect(schoolCard).toBeVisible();
    
    // Click School Card
    await schoolCard.click();
    await expect(page.getByText('Back to Dashboard')).toBeVisible();
    // Header should be visible (specific H1)
    await expect(page.locator('h1.text-2xl', { hasText: 'Test School ZC' })).toBeVisible();
    await expect(page.getByText('Rejected ZonePlayer')).toBeVisible(); // Player should be listed
    
    // Go back
    await page.click('button:has-text("Back to Dashboard")');

    // 3. Referees Tab & Assignment
    await page.click('button:has-text("Referees")');
    await expect(page.getByText('Ref Eree')).toBeVisible();
    
    // Assign Referee
    // Hover over referee card container (div.relative.group)
    const refContainer = page.locator('div.relative.group', { hasText: 'Ref Eree' });
    await refContainer.hover();
    await refContainer.getByText('Assign to School').click();
    
    // Modal appears
    await expect(page.getByText('Assign Referee to School')).toBeVisible();
    await page.click('button:has-text("Test School ZC")');
    
    // Verify assignment badge
    await expect(page.getByText('Assigned to: Test School ZC')).toBeVisible();

    // 4. Requests Tab & Override
    await page.click('button:has-text("Requests")');
    await expect(page.getByText('Rejected ZonePlayer')).toBeVisible();
    await expect(page.getByText('Reason: Zone Test Reject')).toBeVisible();
    
    // Handle Confirm Dialog
    page.on('dialog', dialog => dialog.accept());
    
    await page.click('button:has-text("Override")');
    
    // Verify it disappears
    await expect(page.getByText('Rejected ZonePlayer')).not.toBeVisible();
    
    // 5. Verify Override in Stats/Overview
    await page.click('button:has-text("Overview")');
    // Stats should update: Rejected should be 0
    await expect(page.locator('.text-2xl', { hasText: '0' }).last()).toBeVisible(); // Assuming rejected is the last stat card or specific one
  });
});
