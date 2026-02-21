import { test, expect } from '@playwright/test'

test('SchoolAdmin Teams view supports list view and player modal', async ({ page, request }) => {
  const zoneId = '1'
  const schoolId = 'uitenhage-gammel-street'
  const adminEmail = `schooladmin.teams.${Date.now()}@test.local`
  const password = '830908'

  const adminTokenRes = await request.post('http://localhost:4000/api/login', {
    data: { role: 'EPHSRUAdmin' },
    headers: { 'Content-Type': 'application/json' }
  })
  expect(adminTokenRes.ok()).toBeTruthy()
  const { token: adminToken } = await adminTokenRes.json()

  const createAdminRes = await request.post('http://localhost:4000/api/admins', {
    data: { name: 'School', surname: 'Admin', email: adminEmail, role: 'SchoolAdmin', zoneId, schoolId },
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` }
  })
  expect(createAdminRes.ok()).toBeTruthy()

  const scopedTokenRes = await request.post('http://localhost:4000/api/login', {
    data: { role: 'SchoolAdmin', zoneId, schoolId, email: adminEmail },
    headers: { 'Content-Type': 'application/json' }
  })
  expect(scopedTokenRes.ok()).toBeTruthy()
  const { token: scopedToken } = await scopedTokenRes.json()

  const playerEmail = `team.list.${Date.now()}@example.com`
  const createPlayerRes = await request.post('http://localhost:4000/api/players', {
    data: {
      name: 'TeamList',
      surname: 'Player',
      idNumber: '',
      contactNumber: `08230000${Math.floor(Math.random() * 900 + 100)}`,
      email: playerEmail,
      schoolId,
      zoneId,
      ageGroup: 'U15',
      gender: 'Male',
      position: 'Wing',
      team: 'U15',
      dataOrigin: 'test-team-list',
      status: 'approved'
    },
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${scopedToken}` }
  })
  expect(createPlayerRes.ok()).toBeTruthy()

  await page.goto('http://localhost:5173/')
  await page.evaluate(() => { try { localStorage.clear() } catch {} })
  await page.evaluate(() => { try { localStorage.removeItem('nav:target') } catch {} })
  await page.waitForLoadState('domcontentloaded')

  const loginHeading = page.getByRole('heading', { name: 'Sign In' })
  if (!(await loginHeading.isVisible().catch(() => false))) {
    const btnLogin = page.getByTestId('btn-login')
    if (await btnLogin.isVisible().catch(() => false)) await btnLogin.click()
  }
  await expect(loginHeading).toBeVisible()
  const loginForm = page.locator('form:has(button:has-text("Sign In"))')
  await loginForm.getByLabel('Email').fill(adminEmail)
  await loginForm.getByLabel('Password').fill(password)
  await loginForm.getByRole('button', { name: 'Sign In' }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()

  await expect(page.getByText('Players by Team', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'List' }).click()
  await expect(page.locator('table')).toBeVisible()

  const row = page.locator('tbody').getByRole('row', { name: /U15\s+TeamList\s+Player/i }).first()
  await expect(row).toBeVisible()
  await row.click()

  await expect(page.getByText('TeamList Player')).toBeVisible()
  const modal = page.locator('div.fixed.inset-0.z-50')
  await expect(modal).toBeVisible()
  const teamLine = modal.getByText('Team', { exact: true }).locator('..')
  await expect(teamLine.getByText('U15', { exact: true })).toBeVisible()
})
