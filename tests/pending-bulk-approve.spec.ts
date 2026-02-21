import { test, expect } from '@playwright/test'

async function ensureCoach(request: any, email: string, zoneId: string, schoolId: string) {
  const tokenRes = await request.post('http://localhost:4000/api/login', { data: { role: 'SchoolAdmin', zoneId, schoolId }, headers: { 'Content-Type': 'application/json' } })
  const { token } = await tokenRes.json()
  await request.post('http://localhost:4000/api/coaches', { data: { name: 'Bulk', surname: 'Coach', zoneId, schoolId, email }, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } })
}

async function createPendingPlayer(request: any, zoneId: string, schoolId: string, token: string, nameSeed: string) {
  const email = `pending.${nameSeed}@example.com`
  const payload = {
    zoneId,
    schoolId,
    name: `Pending${nameSeed}`,
    surname: `Review${nameSeed}`,
    email,
    ageGroup: 'U19',
    gender: 'Male',
    contactNumber: '0821234567',
    dataOrigin: 'e2e',
    status: 'pending',
    needsReview: true
  }
  const res = await request.post('http://localhost:4000/api/players', {
    data: payload,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
  })
  const json = await res.json()
  return json.id as string
}

test('Coach Pending tab supports batch approval of selected players', async ({ page, request }) => {
  const zoneId = '1'
  const schoolId = 'S1'
  const coachEmail = `bulkcoach.${Date.now()}@example.com`

  await ensureCoach(request, coachEmail, zoneId, schoolId)

  const coachTokenRes = await request.post('http://localhost:4000/api/login', {
    data: { role: 'Coach', zoneId, schoolId, email: coachEmail },
    headers: { 'Content-Type': 'application/json' }
  })
  const { token: coachToken } = await coachTokenRes.json()

  const p1 = await createPendingPlayer(request, zoneId, schoolId, coachToken, `${Date.now()}a`)
  const p2 = await createPendingPlayer(request, zoneId, schoolId, coachToken, `${Date.now()}b`)

  await page.goto('http://localhost:5173/')
  await page.evaluate(() => { try { localStorage.removeItem('nav:target') } catch {} })

  const loginForm = page.locator('form:has(button:has-text("Sign In"))')
  await loginForm.getByLabel('Email').fill(coachEmail)
  await loginForm.getByLabel('Password').fill('pw')
  await loginForm.getByRole('button', { name: 'Sign In' }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()

  const btnPending = page.getByRole('button', { name: /Pending Reviews/ })
  await btnPending.click()

  await expect(page.getByText('Loading pending players...')).toBeHidden({ timeout: 15000 }).catch(() => {})

  const listGrid = page.locator('div.grid.grid-cols-1.gap-3.sm\\:grid-cols-2')
  await Promise.race([
    listGrid.waitFor({ timeout: 15000 }),
    page.getByText('No pending player reviews').waitFor({ timeout: 15000 }).catch(() => {})
  ])
  await expect(page.getByText('No pending player reviews')).toBeHidden().catch(() => {})

  const selectAllLabel = page.locator('label').filter({ hasText: 'Select All' }).first()
  const selectAllInput = selectAllLabel.locator('input[type="checkbox"]')
  await expect(selectAllInput).toBeVisible({ timeout: 15000 })
  await selectAllInput.check()

  const approveSelected = page.getByRole('button', { name: /Approve Selected/ })
  await expect(approveSelected).toBeEnabled()
  await approveSelected.click()

  const verify1 = await request.get(`http://localhost:4000/api/players/${p1}`, { headers: { Authorization: `Bearer ${coachToken}` } })
  const row1 = await verify1.json()
  const d1 = typeof row1.data === 'string' ? JSON.parse(row1.data) : row1.data || {}
  expect(d1.status).toBe('approved')
  expect(d1.needsReview).toBeFalsy()

  const verify2 = await request.get(`http://localhost:4000/api/players/${p2}`, { headers: { Authorization: `Bearer ${coachToken}` } })
  const row2 = await verify2.json()
  const d2 = typeof row2.data === 'string' ? JSON.parse(row2.data) : row2.data || {}
  expect(d2.status).toBe('approved')
  expect(d2.needsReview).toBeFalsy()
})
