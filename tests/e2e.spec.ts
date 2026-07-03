import { test, expect } from '@playwright/test'
import { validSaId } from './helpers/said'
import { uiLogin, startCreateUser } from './helpers/delegation'

/**
 * Core UI flows under the hierarchical-delegation model: public self-signup is
 * gone, so accounts are created by a superior via the Create User screen.
 */

async function ensureAdmin(request: any, email: string, role: string, zoneId?: string, schoolId?: string) {
  const tokenRes = await request.post('http://localhost:4000/api/login', { data: { role: 'EPHSRUAdmin' }, headers: { 'Content-Type': 'application/json' } })
  const { token } = await tokenRes.json()
  await request.post('http://localhost:4000/api/admins', { data: { name: 'E2E', surname: 'Admin', email, role, zoneId, schoolId }, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } })
}
async function ensureCoach(request: any, email: string, zoneId: string, schoolId: string) {
  const tokenRes = await request.post('http://localhost:4000/api/login', { data: { role: 'SchoolAdmin', zoneId, schoolId }, headers: { 'Content-Type': 'application/json' } })
  const { token } = await tokenRes.json()
  await request.post('http://localhost:4000/api/coaches', { data: { name: 'E2E', surname: 'Coach', zoneId, schoolId, email }, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } })
}

test('Home shows sign-in plus delegated-access guidance (no public signup)', async ({ page }) => {
  await page.goto('http://localhost:5173/')
  await page.evaluate(() => { try { localStorage.clear() } catch {} })
  await page.reload()
  await expect(page.getByText('EPHSRU Rugby Portal')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible()
  await expect(page.getByText('User creation is managed by administrators')).toBeVisible()
})

test('Zone coordinator opens the school registration form via Create User', async ({ page, request }) => {
  const email = `e2e.zc.${Date.now()}@example.com`
  await ensureAdmin(request, email, 'ZoneCoordinator', '1')
  await uiLogin(page, email)
  await startCreateUser(page, { email: `e2e.school.${Date.now()}@example.com`, type: 'school' })
  await page.getByTestId('zone-select').waitFor()
  await page.getByTestId('zone-select').selectOption({ index: 1 })
  await page.getByTestId('school-select').waitFor()
  await page.getByTestId('school-select').selectOption({ index: 1 })
  await expect(page.getByText('Pool')).toBeVisible()
})

test('Coach creates a player: age suggestions, SA ID check, POPIA consent', async ({ page, request }) => {
  const email = `e2e.coach.${Date.now()}@example.com`
  await ensureCoach(request, email, '1', 'S1')
  await uiLogin(page, email)
  await startCreateUser(page, { email: `e2e.player.${Date.now()}@example.com`, type: 'player' })
  await page.getByTestId('zone-select').waitFor()
  await page.getByTestId('zone-select').selectOption({ index: 1 })
  await page.getByTestId('school-select').waitFor()
  await page.getByTestId('school-select').selectOption({ index: 1 })
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Test')
  await page.getByRole('textbox', { name: 'Surname', exact: true }).fill('Player')
  await page.getByLabel('Date of Birth').fill('2010-05-10')
  await page.getByLabel('Gender').selectOption({ label: 'Female' })
  await page.getByLabel('ID/Passport').fill(validSaId(Date.now(), '2010-05-10', 'Female'))
  await expect(page.getByText(/Valid SA ID/)).toBeVisible()
  await expect(page.getByText('Eligible Age Groups')).toBeVisible()
  await expect(page.getByLabel('Age Group (auto-suggested)')).toBeVisible()
  await page.getByLabel('POPIA consent').check()
  await page.getByRole('button', { name: 'Submit Player Registration' }).click()
  await expect(page.getByText(/Congratulations! Your player registration has been submitted/i)).toBeVisible()
  await page.getByRole('button', { name: 'View Player Dashboard' }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()
})

test('SchoolAdmin lands on the dashboard after sign-in', async ({ page, request }) => {
  const email = `e2e.admin.${Date.now()}@example.com`
  await ensureAdmin(request, email, 'SchoolAdmin', '1', 'S1')
  await uiLogin(page, email)
})

test('EPHSRUAdmin sees audit logs', async ({ page, request }) => {
  const email = `e2e.super.${Date.now()}@example.com`
  await ensureAdmin(request, email, 'EPHSRUAdmin')
  await uiLogin(page, email)
  await expect(page.getByText('Audit Logs')).toBeVisible()
})

test('Create User type list is scoped by role', async ({ page, request }) => {
  // Coach: players only
  const coachEmail = `e2e.coach.${Date.now()}@example.com`
  await ensureCoach(request, coachEmail, '1', 'S1')
  await uiLogin(page, coachEmail)
  await page.getByTestId('btn-create-user').click()
  const coachOptions = page.getByLabel('Select user type to create').locator('option')
  await expect(coachOptions).toHaveCount(1)
  await expect(coachOptions.first()).toHaveText('Player Registration')

  // SchoolAdmin: coaches, referees and players — but no admins
  const saEmail = `e2e.sa.${Date.now()}@example.com`
  await ensureAdmin(request, saEmail, 'SchoolAdmin', '1', 'S1')
  await uiLogin(page, saEmail)
  await page.getByTestId('btn-create-user').click()
  const saSelect = page.getByLabel('Select user type to create')
  await expect(saSelect.locator('option')).toHaveCount(3)
  await expect(saSelect.locator('option[value="admin"]')).toHaveCount(0)
})

test('Server blocks privilege escalation: SchoolAdmin cannot create admins', async ({ request }) => {
  const tokenRes = await request.post('http://localhost:4000/api/login', { data: { role: 'SchoolAdmin', zoneId: '1', schoolId: 'S1' }, headers: { 'Content-Type': 'application/json' } })
  const { token } = await tokenRes.json()
  const res = await request.post('http://localhost:4000/api/admins', {
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    data: { name: 'No', surname: 'Escalation', role: 'SchoolAdmin', zoneId: '1', schoolId: 'S1', email: `e2e.escalate.${Date.now()}@example.com` },
  })
  expect(res.status()).toBe(403)
  expect((await res.json()).error).toBe('forbidden')
})
