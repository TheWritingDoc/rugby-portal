import { test, expect } from '@playwright/test'

test('School registration via UI and dashboard visibility', async ({ page, request }) => {
  const adminEmail = 'school@admin.com'
  const adminPassword = '830908'

  const tokenRes = await request.post('http://localhost:4000/api/login', {
    data: { role: 'EPHSRUAdmin' },
    headers: { 'Content-Type': 'application/json' },
  })
  const { token } = await tokenRes.json()
  await request.post('http://localhost:4000/api/admins', {
    data: { name: 'School', surname: 'Admin', email: adminEmail, role: 'SchoolAdmin', zoneId: '1', schoolId: 'S1' },
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  })

  await page.goto('http://localhost:5173/')
  await page.evaluate(() => { try { localStorage.removeItem('nav:target') } catch {} })
  await page.waitForLoadState('domcontentloaded')
  await expect(page.getByText('EPHSRU Rugby Portal')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Register' })).toBeVisible()

  const registerSection = page.locator('section:has(h1:has-text("Register"))')
  await registerSection.getByLabel('Email').fill(adminEmail)
  await registerSection.getByLabel('Create Password').fill(adminPassword)
  await registerSection.getByLabel('Verify Password').fill(adminPassword)
  await registerSection.getByLabel('Select registration form').selectOption({ label: 'School Registration' })
  await registerSection.getByRole('button', { name: 'Continue' }).click()

  await page.getByTestId('zone-select').selectOption({ index: 1 })
  await page.getByTestId('school-select').selectOption({ index: 1 })
  await page.getByLabel('School Physical Address').fill('123 Test St')
  await page.getByLabel('School Contact Number').fill('+27123456789')
  await page.getByLabel('School Email Address').fill(adminEmail)
  await page.getByRole('button', { name: 'Submit School Registration' }).click()
  await expect(page.getByText(/CONGRATULATIONS !!!/i)).toBeVisible()

  await page.reload()
  const loginForm = page.locator('form:has(button:has-text("Sign In"))')
  await loginForm.getByLabel('Email').fill(adminEmail)
  await loginForm.getByLabel('Password').fill(adminPassword)
  await loginForm.getByRole('button', { name: 'Sign In' }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()

  await page.screenshot({ path: 'test-results/school-registration-dashboard.png', fullPage: true })
})
