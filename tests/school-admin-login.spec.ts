import { test, expect } from '@playwright/test'

test('SchoolAdmin can sign in and see dashboard', async ({ page, request }) => {
  const email = `schooladmin.${Date.now()}@test.local`
  const password = '830908'

  // Obtain EPHSRUAdmin token
  const tokenRes = await request.post('http://localhost:4000/api/login', {
    data: { role: 'EPHSRUAdmin' },
    headers: { 'Content-Type': 'application/json' },
  })
  expect(tokenRes.ok()).toBeTruthy()
  const { token } = await tokenRes.json()

  // Create SchoolAdmin if not present (idempotent insert; duplicates allowed for email)
  const createAdminRes = await request.post('http://localhost:4000/api/admins', {
    data: {
      name: 'School',
      surname: 'Admin',
      email,
      role: 'SchoolAdmin',
      zoneId: 'Z1',
      schoolId: 'S1',
    },
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  })
  expect(createAdminRes.ok()).toBeTruthy()

  // Navigate to app and perform login via UI
  await page.goto('http://localhost:5173/')
  await page.evaluate(() => { try { localStorage.clear() } catch {} })
  await page.evaluate(() => { try { localStorage.removeItem('nav:target') } catch {} })
  await page.evaluate(() => { try { localStorage.removeItem('nav:target') } catch {} })
  await page.waitForLoadState('domcontentloaded')
  const loginHeading = page.getByRole('heading', { name: 'Sign In' })
  if (!(await loginHeading.isVisible().catch(() => false))) {
    const btnLogin = page.getByTestId('btn-login')
    if (await btnLogin.isVisible().catch(() => false)) await btnLogin.click()
  }
  await expect(loginHeading).toBeVisible()
  const loginForm = page.locator('form:has(button:has-text("Sign In"))')
  await loginForm.getByLabel('Email').fill(email)
  await loginForm.getByLabel('Password').fill(password)
  await loginForm.getByRole('button', { name: 'Sign In' }).click()

  // Wait for dashboard heading
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()

  // Verify auth state stored
  const role = await page.waitForFunction(() => localStorage.getItem('auth:role'), null, { timeout: 10000 }).then(r => r.jsonValue())
  const zoneId = await page.waitForFunction(() => localStorage.getItem('auth:zoneId'), null, { timeout: 10000 }).then(r => r.jsonValue())
  const schoolId = await page.waitForFunction(() => localStorage.getItem('auth:schoolId'), null, { timeout: 10000 }).then(r => r.jsonValue())
  expect(role).toBe('SchoolAdmin')
  expect(zoneId).not.toBeNull()
  expect(schoolId).not.toBeNull()

  // Screenshot dashboard
  await page.screenshot({ path: 'test-results/school-admin-dashboard.png', fullPage: true })
})
