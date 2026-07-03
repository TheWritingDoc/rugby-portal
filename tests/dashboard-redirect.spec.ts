import { test, expect, request } from '@playwright/test'

async function apiLogin(req: request.APIRequestContext, role: string, zoneId?: string, schoolId?: string, email?: string) {
  const res = await req.post('http://localhost:4000/api/login', { data: { role, zoneId, schoolId, email }, headers: { 'Content-Type': 'application/json' } })
  expect(res.ok()).toBeTruthy()
  const data = await res.json()
  return data.token as string
}

async function apiPost(req: request.APIRequestContext, token: string, path: string, body: any) {
  const res = await req.post(`http://localhost:4000/api/${path}`, { data: body, headers: { Authorization: `Bearer ${token}` } })
  return res
}

test.describe('Role-Based Dashboard Redirect and Welcome', () => {
  test.setTimeout(60000)

  test('Coach login redirects to Coach dashboard with welcome', async ({ page, request }) => {
    const ts = Date.now()
    const zoneId = `Z-${ts}`
    const schoolId = `S-${ts}`
    const coachEmail = `coach_${ts}@test.local`

    const adminToken = await apiLogin(request, 'EPHSRUAdmin')
    const schoolRes = await apiPost(request, adminToken, 'schools', { zoneId, schoolId, address: 'Test St', contactNumber: '1', email: `school_${ts}@test.local` })
    expect(schoolRes.ok()).toBeTruthy()
    const coachRes = await apiPost(request, adminToken, 'coaches', { name: 'John', surname: 'Coach', contactNumber: '+2712345', email: coachEmail, zoneId, schoolId })
    expect(coachRes.ok()).toBeTruthy()

    await page.goto('http://localhost:5173/')
    await page.evaluate(() => { try { localStorage.removeItem('nav:target') } catch {} })

    const loginForm = page.locator('form:has(button:has-text("Sign In"))')
    await loginForm.getByLabel('Email').fill(coachEmail)
    await loginForm.getByLabel('Password').fill('pw')
    await loginForm.getByRole('button', { name: 'Sign In' }).click()

    // Should land on dashboard
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()
    // Coach welcome message
    await expect(page.getByText(/Welcome, John Coach/i)).toBeVisible()
    // Coach tabs
    await expect(page.getByRole('button', { name: /Players/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Pending/i })).toBeVisible()
    // Coaches can delegate user creation (players)
    await expect(page.getByTestId('btn-create-user')).toBeVisible()
  })

  test('SchoolAdmin login redirects to SchoolAdmin dashboard with welcome', async ({ page, request }) => {
    const ts = Date.now()
    const zoneId = `Z-${ts}`
    const schoolId = `S-${ts}`
    const adminEmail = `sa_${ts}@test.local`

    const adminToken = await apiLogin(request, 'EPHSRUAdmin')
    const schoolRes = await apiPost(request, adminToken, 'schools', { zoneId, schoolId, address: 'Test St', contactNumber: '1', email: `school_${ts}@test.local` })
    expect(schoolRes.ok()).toBeTruthy()
    const saRes = await apiPost(request, adminToken, 'admins', { name: 'Jane', surname: 'Admin', contactNumber: '+2712345', email: adminEmail, role: 'SchoolAdmin', zoneId, schoolId })
    expect(saRes.ok()).toBeTruthy()

    await page.goto('http://localhost:5173/')
    await page.evaluate(() => { try { localStorage.removeItem('nav:target') } catch {} })

    const loginForm = page.locator('form:has(button:has-text("Sign In"))')
    await loginForm.getByLabel('Email').fill(adminEmail)
    await loginForm.getByLabel('Password').fill('pw')
    await loginForm.getByRole('button', { name: 'Sign In' }).click()

    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()
    // SchoolAdmin header
    await expect(page.getByText(/School Administration/i)).toBeVisible()
    // School admins can delegate user creation (coaches/referees/players)
    await expect(page.getByTestId('btn-create-user')).toBeVisible()
  })

  test('ZoneCoordinator login redirects to ZoneCoordinator dashboard with welcome', async ({ page, request }) => {
    const ts = Date.now()
    const zoneId = `Z-${ts}`
    const zcEmail = `zc_${ts}@test.local`

    const adminToken = await apiLogin(request, 'EPHSRUAdmin')
    const zcRes = await apiPost(request, adminToken, 'admins', { name: 'Zone', surname: 'Coord', contactNumber: '+2712345', email: zcEmail, role: 'ZoneCoordinator', zoneId })
    expect(zcRes.ok()).toBeTruthy()

    await page.goto('http://localhost:5173/')
    await page.evaluate(() => { try { localStorage.removeItem('nav:target') } catch {} })

    const loginForm = page.locator('form:has(button:has-text("Sign In"))')
    await loginForm.getByLabel('Email').fill(zcEmail)
    await loginForm.getByLabel('Password').fill('pw')
    await loginForm.getByRole('button', { name: 'Sign In' }).click()

    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()
    // ZoneCoordinator header
    await expect(page.getByText(/Zone Administration/i)).toBeVisible()
    await expect(page.getByText(/Coordinator: Zone Coord/i)).toBeVisible()
    // Zone coordinators can delegate user creation (school admins/schools)
    await expect(page.getByTestId('btn-create-user')).toBeVisible()
  })

  test('EPHSRUAdmin login redirects to EPHSRUAdmin dashboard with audit logs', async ({ page, request }) => {
    const ts = Date.now()
    const epEmail = `ep_${ts}@test.local`

    const adminToken = await apiLogin(request, 'EPHSRUAdmin')
    const epRes = await apiPost(request, adminToken, 'admins', { name: 'Super', surname: 'Admin', contactNumber: '+2712345', email: epEmail, role: 'EPHSRUAdmin' })
    expect(epRes.ok()).toBeTruthy()

    await page.goto('http://localhost:5173/')
    await page.evaluate(() => { try { localStorage.removeItem('nav:target') } catch {} })

    const loginForm = page.locator('form:has(button:has-text("Sign In"))')
    await loginForm.getByLabel('Email').fill(epEmail)
    await loginForm.getByLabel('Password').fill('pw')
    await loginForm.getByRole('button', { name: 'Sign In' }).click()

    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()
    // EPHSRUAdmin header
    await expect(page.getByText(/System Administration/i)).toBeVisible()
    await expect(page.getByText(/EPHSRU Dashboard/i)).toBeVisible()
    // Union admins can delegate user creation (zone coordinators/schools)
    await expect(page.getByTestId('btn-create-user')).toBeVisible()
    // Audit logs visible
    await expect(page.getByText('Audit Logs')).toBeVisible()
  })

  test('Player login redirects to Player dashboard with profile', async ({ page, request }) => {
    const ts = Date.now()
    const zoneId = `Z-${ts}`
    const schoolId = `S-${ts}`
    const playerEmail = `player_${ts}@test.local`

    const adminToken = await apiLogin(request, 'EPHSRUAdmin')
    const schoolRes = await apiPost(request, adminToken, 'schools', { zoneId, schoolId, address: 'Test St', contactNumber: '1', email: `school_${ts}@test.local` })
    expect(schoolRes.ok()).toBeTruthy()
    const playerRes = await apiPost(request, adminToken, 'players', { name: 'Player', surname: 'One', contactNumber: '+2700000', email: playerEmail, zoneId, schoolId, ageGroup: 'U16' })
    expect(playerRes.ok()).toBeTruthy()

    await page.goto('http://localhost:5173/')
    await page.evaluate(() => { try { localStorage.removeItem('nav:target') } catch {} })

    const loginForm = page.locator('form:has(button:has-text("Sign In"))')
    await loginForm.getByLabel('Email').fill(playerEmail)
    await loginForm.getByLabel('Password').fill('pw')
    await loginForm.getByRole('button', { name: 'Sign In' }).click()

    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()
    // Player profile header
    await expect(page.getByText(/Player Profile/i)).toBeVisible()
    await expect(page.getByText('Player One')).toBeVisible()
    // Players are leaf nodes in the hierarchy — no Create User button
    await expect(page.getByTestId('btn-create-user')).toHaveCount(0)
  })

  test('Referee login redirects to Referee dashboard', async ({ page, request }) => {
    const ts = Date.now()
    const zoneId = `Z-${ts}`
    const refEmail = `ref_${ts}@test.local`

    const adminToken = await apiLogin(request, 'EPHSRUAdmin')
    const refRes = await apiPost(request, adminToken, 'referees', { name: 'Ref', surname: 'One', contactNumber: '+2711111', email: refEmail, zoneId })
    expect(refRes.ok()).toBeTruthy()

    await page.goto('http://localhost:5173/')
    await page.evaluate(() => { try { localStorage.removeItem('nav:target') } catch {} })

    const loginForm = page.locator('form:has(button:has-text("Sign In"))')
    await loginForm.getByLabel('Email').fill(refEmail)
    await loginForm.getByLabel('Password').fill('pw')
    await loginForm.getByRole('button', { name: 'Sign In' }).click()

    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()
    // Referee header
    await expect(page.locator('span').filter({ hasText: 'Officials' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Referee Dashboard' })).toBeVisible()
  })
})
