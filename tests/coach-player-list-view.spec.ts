import { test, expect } from '@playwright/test'

async function ensureCoach(request: any, email: string, zoneId: string, schoolId: string) {
  const tokenRes = await request.post('http://localhost:4000/api/login', { data: { role: 'SchoolAdmin', zoneId, schoolId }, headers: { 'Content-Type': 'application/json' } })
  const { token } = await tokenRes.json()
  await request.post('http://localhost:4000/api/coaches', { data: { name: 'List', surname: 'Coach', zoneId, schoolId, email }, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } })
}

test('Coach Players search supports list view and row click opens player', async ({ page, request }) => {
  const zoneId = '1'
  const schoolId = 'uitenhage-gammel-street'
  const coachEmail = `coach.list.${Date.now()}@example.com`

  await ensureCoach(request, coachEmail, zoneId, schoolId)

  const coachTokenRes = await request.post('http://localhost:4000/api/login', {
    data: { role: 'Coach', zoneId, schoolId, email: coachEmail },
    headers: { 'Content-Type': 'application/json' }
  })
  expect(coachTokenRes.ok()).toBeTruthy()
  const { token } = await coachTokenRes.json()

  const playerEmail = `coach.list.player.${Date.now()}@example.com`
  const createPlayerRes = await request.post('http://localhost:4000/api/players', {
    data: {
      name: 'ListView',
      surname: 'Player',
      idNumber: '',
      contactNumber: `08240000${Math.floor(Math.random() * 900 + 100)}`,
      email: playerEmail,
      schoolId,
      zoneId,
      ageGroup: 'U16',
      gender: 'Male',
      position: 'Wing',
      team: 'U16',
      dataOrigin: 'test-coach-list-view',
      status: 'approved'
    },
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
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
  await loginForm.getByLabel('Email').fill(coachEmail)
  await loginForm.getByLabel('Password').fill('pw')
  await loginForm.getByRole('button', { name: 'Sign In' }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Search' }).click()
  // aria-label match: plain "List" would also hit player cards whose names contain "ListView"
  await page.getByRole('button', { name: 'List view', exact: true }).click()
  await expect(page.locator('table')).toBeVisible()

  const row = page.locator('tbody').getByRole('row', { name: /U16\s+ListView\s+Player/i }).first()
  await expect(row).toBeVisible()
  await row.click()

  await expect(page.getByText('ListView Player').first()).toBeVisible()
})

