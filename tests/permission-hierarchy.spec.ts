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

test.describe('Permission Hierarchy and Scope Enforcement', () => {
  test.setTimeout(60000)

  test('Coach can only view players from their own school', async ({ page, request }) => {
    const ts = Date.now()
    const zoneId = `Z-${ts}`
    const schoolA = `SA-${ts}`
    const schoolB = `SB-${ts}`
    const coachEmail = `coach_scope_${ts}@test.local`

    const adminToken = await apiLogin(request, 'EPHSRUAdmin')
    await apiPost(request, adminToken, 'schools', { name: 'School A', zoneId, schoolId: schoolA, address: 'A', contactNumber: '1', email: `sa_${ts}@test.local` })
    await apiPost(request, adminToken, 'schools', { name: 'School B', zoneId, schoolId: schoolB, address: 'B', contactNumber: '2', email: `sb_${ts}@test.local` })
    await apiPost(request, adminToken, 'coaches', { name: 'Scope', surname: 'Coach', contactNumber: '+2712345', email: coachEmail, zoneId, schoolId: schoolA })
    await apiPost(request, adminToken, 'players', { name: 'InSchool', surname: 'A', contactNumber: '+2700001', email: `pa_${ts}@test.local`, zoneId, schoolId: schoolA, ageGroup: 'U16' })
    await apiPost(request, adminToken, 'players', { name: 'OtherSchool', surname: 'B', contactNumber: '+2700002', email: `pb_${ts}@test.local`, zoneId, schoolId: schoolB, ageGroup: 'U16' })

    await page.goto('http://localhost:5173/')
    await page.evaluate(() => { try { localStorage.removeItem('nav:target') } catch {} })

    const loginForm = page.locator('form:has(button:has-text("Sign In"))')
    await loginForm.getByLabel('Email').fill(coachEmail)
    await loginForm.getByLabel('Password').fill('pw')
    await loginForm.getByRole('button', { name: 'Sign In' }).click()

    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()

    // Search view to see player list
    await page.getByRole('button', { name: 'Search' }).click()
    await page.waitForTimeout(600)

    // Should see the player from their school
    await expect(page.getByText('InSchool A')).toBeVisible()
    // Should NOT see the player from other school
    await expect(page.getByText('OtherSchool B')).toHaveCount(0)
  })

  test('SchoolAdmin can only view data from their own school', async ({ page, request }) => {
    const ts = Date.now()
    const zoneId = `Z-${ts}`
    const schoolA = `SA2-${ts}`
    const schoolB = `SB2-${ts}`
    const adminEmail = `sa_scope_${ts}@test.local`

    const adminToken = await apiLogin(request, 'EPHSRUAdmin')
    await apiPost(request, adminToken, 'schools', { zoneId, schoolId: schoolA, address: 'A', contactNumber: '1', email: `sa2_${ts}@test.local` })
    await apiPost(request, adminToken, 'schools', { zoneId, schoolId: schoolB, address: 'B', contactNumber: '2', email: `sb2_${ts}@test.local` })
    await apiPost(request, adminToken, 'admins', { name: 'Scope', surname: 'SA', contactNumber: '+2712345', email: adminEmail, role: 'SchoolAdmin', zoneId, schoolId: schoolA })
    await apiPost(request, adminToken, 'players', { name: 'InSchool', surname: 'A', contactNumber: '+2700001', email: `pa2_${ts}@test.local`, zoneId, schoolId: schoolA, ageGroup: 'U16' })
    await apiPost(request, adminToken, 'players', { name: 'OtherSchool', surname: 'B', contactNumber: '+2700002', email: `pb2_${ts}@test.local`, zoneId, schoolId: schoolB, ageGroup: 'U16' })

    await page.goto('http://localhost:5173/')
    await page.evaluate(() => { try { localStorage.removeItem('nav:target') } catch {} })

    const loginForm = page.locator('form:has(button:has-text("Sign In"))')
    await loginForm.getByLabel('Email').fill(adminEmail)
    await loginForm.getByLabel('Password').fill('pw')
    await loginForm.getByRole('button', { name: 'Sign In' }).click()

    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()

    // SchoolAdmin overview tab shows player stats
    await expect(page.getByText('InSchool A')).toBeVisible()
    await expect(page.getByText('OtherSchool B')).toHaveCount(0)
  })

  test('ZoneCoordinator can only view schools in their zone', async ({ page, request }) => {
    const ts = Date.now()
    const zoneA = `ZA-${ts}`
    const zoneB = `ZB-${ts}`
    const zcEmail = `zc_scope_${ts}@test.local`

    const adminToken = await apiLogin(request, 'EPHSRUAdmin')
    await apiPost(request, adminToken, 'schools', { zoneId: zoneA, schoolId: `S-${ts}-A`, address: 'A', contactNumber: '1', email: `sza_${ts}@test.local` })
    await apiPost(request, adminToken, 'schools', { zoneId: zoneB, schoolId: `S-${ts}-B`, address: 'B', contactNumber: '2', email: `szb_${ts}@test.local` })
    await apiPost(request, adminToken, 'admins', { name: 'Scope', surname: 'ZC', contactNumber: '+2712345', email: zcEmail, role: 'ZoneCoordinator', zoneId: zoneA })

    await page.goto('http://localhost:5173/')
    await page.evaluate(() => { try { localStorage.removeItem('nav:target') } catch {} })

    const loginForm = page.locator('form:has(button:has-text("Sign In"))')
    await loginForm.getByLabel('Email').fill(zcEmail)
    await loginForm.getByLabel('Password').fill('pw')
    await loginForm.getByRole('button', { name: 'Sign In' }).click()

    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()

    // Navigate to Schools tab
    // ZoneCoordinator overview shows school count scoped to their zone
    await expect(page.getByText(/Managing 1 Schools/i)).toBeVisible()
  })

  test('Player can only view their own profile', async ({ page, request }) => {
    const ts = Date.now()
    const zoneId = `Z-${ts}`
    const schoolId = `S-${ts}`
    const playerEmail = `player_scope_${ts}@test.local`

    const adminToken = await apiLogin(request, 'EPHSRUAdmin')
    await apiPost(request, adminToken, 'schools', { zoneId, schoolId, address: 'A', contactNumber: '1', email: `sch_${ts}@test.local` })
    await apiPost(request, adminToken, 'players', { name: 'Me', surname: 'Only', contactNumber: '+2700001', email: playerEmail, zoneId, schoolId, ageGroup: 'U16' })
    await apiPost(request, adminToken, 'players', { name: 'Other', surname: 'Player', contactNumber: '+2700002', email: `other_${ts}@test.local`, zoneId, schoolId, ageGroup: 'U16' })

    await page.goto('http://localhost:5173/')
    await page.evaluate(() => { try { localStorage.removeItem('nav:target') } catch {} })

    const loginForm = page.locator('form:has(button:has-text("Sign In"))')
    await loginForm.getByLabel('Email').fill(playerEmail)
    await loginForm.getByLabel('Password').fill('pw')
    await loginForm.getByRole('button', { name: 'Sign In' }).click()

    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()

    // Should see their own name
    await expect(page.getByText('Me Only')).toBeVisible()
    // Should NOT see other player
    await expect(page.getByText('Other Player')).toHaveCount(0)
  })

  test('EPHSRUAdmin can view all zones and schools', async ({ page, request }) => {
    const ts = Date.now()
    const zoneA = `ZA3-${ts}`
    const zoneB = `ZB3-${ts}`
    const epEmail = `ep_scope_${ts}@test.local`

    const adminToken = await apiLogin(request, 'EPHSRUAdmin')
    await apiPost(request, adminToken, 'schools', { name: 'School A3', zoneId: zoneA, schoolId: `S-${ts}-A3`, address: 'A', contactNumber: '1', email: `sza3_${ts}@test.local` })
    await apiPost(request, adminToken, 'schools', { name: 'School B3', zoneId: zoneB, schoolId: `S-${ts}-B3`, address: 'B', contactNumber: '2', email: `szb3_${ts}@test.local` })
    await apiPost(request, adminToken, 'admins', { name: 'Super', surname: 'Admin', contactNumber: '+2712345', email: epEmail, role: 'EPHSRUAdmin' })

    await page.goto('http://localhost:5173/')
    await page.evaluate(() => { try { localStorage.removeItem('nav:target') } catch {} })

    const loginForm = page.locator('form:has(button:has-text("Sign In"))')
    await loginForm.getByLabel('Email').fill(epEmail)
    await loginForm.getByLabel('Password').fill('pw')
    await loginForm.getByRole('button', { name: 'Sign In' }).click()

    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()

    // Navigate to Schools tab
    // EPHSRUAdmin overview shows all schools across zones
    await expect(page.getByText(/Registered Schools/i)).toBeVisible()
  })

  test('API scope enforcement: Coach cannot create player in another school', async ({ request }) => {
    const ts = Date.now()
    const zoneId = `Z-${ts}`
    const schoolA = `SA4-${ts}`
    const schoolB = `SB4-${ts}`
    const coachEmail = `coach_api_${ts}@test.local`

    const adminToken = await apiLogin(request, 'EPHSRUAdmin')
    await apiPost(request, adminToken, 'schools', { zoneId, schoolId: schoolA, address: 'A', contactNumber: '1', email: `sa4_${ts}@test.local` })
    await apiPost(request, adminToken, 'schools', { zoneId, schoolId: schoolB, address: 'B', contactNumber: '2', email: `sb4_${ts}@test.local` })
    await apiPost(request, adminToken, 'coaches', { name: 'Api', surname: 'Coach', contactNumber: '+2712345', email: coachEmail, zoneId, schoolId: schoolA })

    const coachToken = await apiLogin(request, 'Coach', zoneId, schoolA, coachEmail)
    const res = await apiPost(request, coachToken, 'players', { name: 'Hacker', surname: 'Try', contactNumber: '+2700001', email: `hack_${ts}@test.local`, zoneId, schoolId: schoolB, ageGroup: 'U16' })

    // Coach is allowed to create players, but scope blocks different school
    expect(res.status()).toBe(403)
    const body = await res.json()
    expect(body.error).toBe('scope')
  })

  test('API scope enforcement: SchoolAdmin cannot create admin in another school', async ({ request }) => {
    const ts = Date.now()
    const zoneId = `Z-${ts}`
    const schoolA = `SA5-${ts}`
    const schoolB = `SB5-${ts}`
    const adminEmail = `sa_api_${ts}@test.local`

    const adminToken = await apiLogin(request, 'EPHSRUAdmin')
    await apiPost(request, adminToken, 'schools', { zoneId, schoolId: schoolA, address: 'A', contactNumber: '1', email: `sa5_${ts}@test.local` })
    await apiPost(request, adminToken, 'schools', { zoneId, schoolId: schoolB, address: 'B', contactNumber: '2', email: `sb5_${ts}@test.local` })
    await apiPost(request, adminToken, 'admins', { name: 'Api', surname: 'SA', contactNumber: '+2712345', email: adminEmail, role: 'SchoolAdmin', zoneId, schoolId: schoolA })

    const saToken = await apiLogin(request, 'SchoolAdmin', zoneId, schoolA, adminEmail)
    const res = await apiPost(request, saToken, 'admins', { name: 'Hacker', surname: 'Try', contactNumber: '+2700001', email: `hack_sa_${ts}@test.local`, role: 'SchoolAdmin', zoneId, schoolId: schoolB })

    // SchoolAdmin is not allowed to create admins at all
    expect(res.status()).toBe(403)
    const body = await res.json()
    expect(body.error).toBe('forbidden')
  })

  test('API scope enforcement: ZoneCoordinator cannot create school in another zone', async ({ request }) => {
    const ts = Date.now()
    const zoneA = `ZA6-${ts}`
    const zoneB = `ZB6-${ts}`
    const zcEmail = `zc_api_${ts}@test.local`

    const adminToken = await apiLogin(request, 'EPHSRUAdmin')
    await apiPost(request, adminToken, 'admins', { name: 'Api', surname: 'ZC', contactNumber: '+2712345', email: zcEmail, role: 'ZoneCoordinator', zoneId: zoneA })

    const zcToken = await apiLogin(request, 'ZoneCoordinator', zoneA, undefined, zcEmail)
    const res = await apiPost(request, zcToken, 'schools', { zoneId: zoneB, schoolId: `S-${ts}-HACK`, address: 'X', contactNumber: '9', email: `hack_zc_${ts}@test.local` })

    expect(res.status()).toBe(403)
    const body = await res.json()
    expect(body.error).toBe('scope')
  })
})
