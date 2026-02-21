import { test, expect } from '@playwright/test'

const API = 'http://localhost:4000/api'
const APP = 'http://localhost:5173/'

async function apiLogin(request: any, role: string, zoneId?: string, schoolId?: string, email?: string) {
  const res = await request.post(`${API}/login`, {
    data: { role, zoneId, schoolId, email },
    headers: { 'Content-Type': 'application/json' },
  })
  expect(res.ok()).toBeTruthy()
  const { token } = await res.json()
  return token as string
}

async function apiPost(request: any, token: string, path: string, data: any) {
  const res = await request.post(`${API}${path.startsWith('/') ? '' : '/'}${path}`, {
    data,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  })
  return res
}

async function ensureCoach(request: any, email: string, zoneId: string, schoolId: string) {
  const token = await apiLogin(request, 'SchoolAdmin', zoneId, schoolId)
  const res = await apiPost(request, token, '/coaches', { name: 'Test', surname: 'Coach', zoneId, schoolId, email })
  expect(res.ok()).toBeTruthy()
}

async function uiLogin(page: any, email: string, password: string) {
  await page.goto(APP)
  await page.evaluate(() => { try { localStorage.clear() } catch {} })
  await page.evaluate(() => { try { localStorage.removeItem('nav:target') } catch {} })
  await page.reload()
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
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()
}

test('Coach dashboard: add player, pending review, approvals, and migration visibility', async ({ page, request }) => {
  test.setTimeout(120000)
  const schoolA = 'uitenhage-gammel-street'
  const schoolB = 'northern-areas-hillside'

  const coachEmailA = `coach.a.${Date.now()}@test.local`
  const coachEmailB = `coach.b.${Date.now()}@test.local`
  const adminToken = await apiLogin(request, 'EPHSRUAdmin')

  const catalogRes = await request.get(`${API}/schools/catalog`, { headers: { Authorization: `Bearer ${adminToken}` } })
  expect(catalogRes.ok()).toBeTruthy()
  const catalog = await catalogRes.json()
  const zoneA = String((catalog.find((s: any) => String(s.schoolId || '') === schoolA) || {}).zoneId || '')
  const zoneB = String((catalog.find((s: any) => String(s.schoolId || '') === schoolB) || {}).zoneId || '')
  expect(zoneA).toBeTruthy()
  expect(zoneB).toBeTruthy()

  await ensureCoach(request, coachEmailA, zoneA, schoolA)
  await ensureCoach(request, coachEmailB, zoneB, schoolB)

  const coachTokenA = await apiLogin(request, 'Coach', zoneA, schoolA, coachEmailA)
  const coachTokenB = await apiLogin(request, 'Coach', zoneB, schoolB, coachEmailB)

  const now = Date.now()
  const oldRegYear = new Date().getFullYear() - 1
  const oldRegisteredAt = new Date(`${oldRegYear}-05-01T00:00:00.000Z`).getTime()

  const migratedName = 'Wayde'
  const migratedSurname = `Kettledas${now}`
  const migratedId = `MIG${now}${Math.floor(Math.random() * 1000)}`
  const createMigrated = await apiPost(request, coachTokenA, '/players', {
    name: migratedName,
    surname: migratedSurname,
    idNumber: migratedId,
    contactNumber: `0821${Math.floor(Math.random() * 900000)}`,
    email: `migrated.${now}@example.com`,
    zoneId: zoneA,
    schoolId: schoolA,
    gender: 'Male',
    ageGroup: 'U17',
    team: 'U17',
    position: 'Wing',
    registeredAt: oldRegisteredAt,
    registrationYear: oldRegYear,
    dataOrigin: 'test-migration',
    status: 'approved'
  })
  expect(createMigrated.ok()).toBeTruthy()
  const migratedPlayer = await createMigrated.json()
  const migratedPlayerId = String(migratedPlayer.id || '')
  expect(migratedPlayerId).toBeTruthy()

  const pendingName = 'Pending'
  const pendingSurname = `Player${now}`
  const pendingId = `PEND${now}${Math.floor(Math.random() * 1000)}`
  const createPending = await apiPost(request, coachTokenA, '/players', {
    name: pendingName,
    surname: pendingSurname,
    idNumber: pendingId,
    contactNumber: `0822${Math.floor(Math.random() * 900000)}`,
    email: `pending.${now}@example.com`,
    zoneId: zoneA,
    schoolId: schoolA,
    gender: 'Male',
    ageGroup: 'U15',
    team: 'U15',
    status: 'pending',
    needsReview: true,
    dataOrigin: 'test-pending'
  })
  expect(createPending.ok()).toBeTruthy()
  const pendingPlayer = await createPending.json()
  const pendingPlayerId = String(pendingPlayer.id || '')
  expect(pendingPlayerId).toBeTruthy()

  const profileName = 'Profile'
  const profileSurname = `Update${now}`
  const profileId = `PROF${now}${Math.floor(Math.random() * 1000)}`
  const createProfile = await apiPost(request, coachTokenA, '/players', {
    name: profileName,
    surname: profileSurname,
    idNumber: profileId,
    contactNumber: `0823${Math.floor(Math.random() * 900000)}`,
    email: `profile.${now}@example.com`,
    zoneId: zoneA,
    schoolId: schoolA,
    gender: 'Male',
    ageGroup: 'U15',
    team: 'U15',
    status: 'approved',
    dataOrigin: 'test-approval'
  })
  expect(createProfile.ok()).toBeTruthy()
  const profilePlayer = await createProfile.json()
  const profilePlayerId = String(profilePlayer.id || '')

  const approvalReq = await apiPost(request, coachTokenA, '/approvals', {
    entityType: 'players',
    entityId: profilePlayerId,
    requestedChanges: [{ field: 'position', previous: '', updated: 'Number 8' }]
  })
  expect(approvalReq.ok()).toBeTruthy()

  await page.addInitScript(() => {
    try {
      localStorage.setItem('ui:coach:players:view', 'cards')
      localStorage.setItem('ui:schooladmin:teams:view', 'cards')
    } catch {}
  })

  await uiLogin(page, coachEmailA, 'pw')

  await page.getByRole('button', { name: /Pending \(/ }).click()
  await expect(page.getByText(/Registrations \(/)).toBeVisible()
  const pendingCard = page.locator('div.rounded-lg.border.bg-white.p-3.shadow-sm').filter({ hasText: `${pendingName} ${pendingSurname}` }).first()
  await expect(pendingCard).toBeVisible()
  await Promise.all([
    page.waitForResponse((r: any) => r.url().includes(`/api/players/${pendingPlayerId}/approve`) && r.request().method() === 'POST'),
    pendingCard.locator('button').filter({ hasText: /^Approve$/ }).first().click(),
  ])

  const approvedRes = await request.get(`${API}/players/${encodeURIComponent(pendingPlayerId)}`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  })
  expect(approvedRes.ok()).toBeTruthy()
  const approvedRow = await approvedRes.json()
  const approvedData = (() => { try { return JSON.parse(String(approvedRow.data || '{}')) } catch { return {} } })()
  expect(String(approvedData.status || '')).toBe('approved')
  expect(Boolean(approvedData.needsReview)).toBeFalsy()
  expect(String(approvedRow.data || '')).not.toContain('"status":"pending"')
  expect(String(approvedRow.data || '')).not.toContain('"needsReview":true')

  const pendingAfterRes = await request.get(`${API}/pending`, { headers: { Authorization: `Bearer ${coachTokenA}` } })
  expect(pendingAfterRes.ok()).toBeTruthy()
  const pendingAfter = await pendingAfterRes.json()
  const regAfter = Array.isArray(pendingAfter?.registrations) ? pendingAfter.registrations : []
  expect(regAfter.some((r: any) => String(r?.id || '') === pendingPlayerId)).toBeFalsy()

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()
  await page.getByRole('button', { name: /Pending \(/ }).click()
  await expect(page.getByText(/Registrations \(/)).toBeVisible()

  const approvalRow = page.locator('div.rounded-lg.border.bg-white').filter({ hasText: 'Profile Updates' }).locator('div.flex').filter({ hasText: `${profileName} ${profileSurname}` }).first()
  await expect(approvalRow).toBeVisible()
  await Promise.all([
    page.waitForResponse((r: any) => r.url().includes('/api/approvals/') && r.url().includes('/decision') && r.request().method() === 'POST'),
    approvalRow.getByRole('button', { name: 'Approve' }).click(),
  ])

  await page.getByRole('button', { name: /Players \(/ }).click()
  await page.getByRole('button', { name: 'Search' }).first().click()
  await page.getByRole('group', { name: 'Player view' }).getByRole('button', { name: 'List view' }).click()
  const searchInput = page.getByPlaceholder(/Search players by name/i)
  await searchInput.fill(profileSurname)
  await searchInput.press('Enter')
  await expect(page.locator('table').locator('tbody').getByRole('row', { name: new RegExp(profileSurname, 'i') }).first()).toBeVisible()

  await page.getByRole('button', { name: 'Add Player' }).click()
  await page.getByLabel('Name', { exact: true }).fill('Added')
  const addedSurname = `Player${Math.floor(Math.random() * 1000)}`
  await page.getByLabel('Surname', { exact: true }).fill(addedSurname)
  await page.getByLabel('Mobile', { exact: true }).fill('0824000000')
  await page.getByLabel('Email', { exact: true }).fill(`added.${Date.now()}@example.com`)
  await Promise.all([
    page.waitForResponse((r: any) => r.url().includes('/api/players') && r.request().method() === 'POST'),
    page.getByRole('button', { name: 'Save Player' }).click(),
  ])
  await page.waitForResponse((r: any) => r.url().includes('/api/players') && r.request().method() === 'GET')

  const recentRaw = await page.evaluate(() => localStorage.getItem('recent:player'))
  expect(String(recentRaw || '')).toContain(addedSurname)

  const verifyAddedRes = await request.get(`${API}/players?zoneId=${encodeURIComponent(zoneA)}&schoolId=${encodeURIComponent(schoolA)}`, {
    headers: { Authorization: `Bearer ${coachTokenA}` }
  })
  expect(verifyAddedRes.ok()).toBeTruthy()
  const verifyAddedRows = await verifyAddedRes.json()
  expect(Array.isArray(verifyAddedRows)).toBeTruthy()
  expect(verifyAddedRows.some((r: any) => String(r?.surname || r?.data?.surname || '').includes(addedSurname))).toBeTruthy()

  const migrateRes = await apiPost(request, coachTokenA, `/players/${migratedPlayerId}/migrate`, { toSchoolId: schoolB, reason: 'Test migration' })
  expect(migrateRes.ok()).toBeTruthy()
  const migrateReq = await migrateRes.json()
  const requestId = String(migrateReq.requestId || '')
  expect(requestId).toBeTruthy()

  const detailRes = await request.get(`${API}/migration-requests/${encodeURIComponent(requestId)}`, {
    headers: { Authorization: `Bearer ${coachTokenB}` }
  })
  expect(detailRes.ok()).toBeTruthy()
  const detail = await detailRes.json()
  expect(String(detail.reason || '')).toBe('Test migration')
  expect(String(detail.player?.id || '')).toBe(migratedPlayerId)
  expect(String(detail.player?.name || '')).toBe(migratedName)
  expect(String(detail.player?.surname || '')).toBe(migratedSurname)

  const acceptRes = await apiPost(request, coachTokenB, `/migration-requests/${encodeURIComponent(requestId)}/decision`, { status: 'accepted' })
  expect(acceptRes.ok()).toBeTruthy()

  const movedRes = await request.get(`${API}/players/${encodeURIComponent(migratedPlayerId)}`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  })
  expect(movedRes.ok()).toBeTruthy()
  const movedRow = await movedRes.json()
  expect(String(movedRow.schoolId || '')).toBe(schoolB)
  expect(String(movedRow.zoneId || '')).toBe(zoneB)
  const movedData = (() => { try { return JSON.parse(String(movedRow.data || '{}')) } catch { return {} } })()
  expect(String(movedData.schoolId || '')).toBe(schoolB)
  expect(String(movedData.gender || '')).toMatch(/male/i)

  const coachAListRes = await request.get(`${API}/players?zoneId=${encodeURIComponent(zoneA)}&schoolId=${encodeURIComponent(schoolA)}`, {
    headers: { Authorization: `Bearer ${coachTokenA}` }
  })
  expect(coachAListRes.ok()).toBeTruthy()
  const coachAList = await coachAListRes.json()
  expect(coachAList.some((r: any) => String(r?.id || '') === migratedPlayerId)).toBeFalsy()

  const coachBListResAfterMove = await request.get(`${API}/players?zoneId=${encodeURIComponent(zoneB)}&schoolId=${encodeURIComponent(schoolB)}`, {
    headers: { Authorization: `Bearer ${coachTokenB}` }
  })
  expect(coachBListResAfterMove.ok()).toBeTruthy()
  const coachBListAfterMove = await coachBListResAfterMove.json()
  expect(coachBListAfterMove.some((r: any) => String(r?.id || '') === migratedPlayerId)).toBeTruthy()

  await uiLogin(page, coachEmailB, 'pw')
  await expect.poll(async () => page.evaluate(() => localStorage.getItem('auth:schoolId') || ''), { timeout: 5000 }).toBe(schoolB)
  await page.getByRole('button', { name: /Players \(/ }).click()
  const browseToggleB = page.locator('div.inline-flex.overflow-hidden.rounded-md.border').filter({ has: page.getByRole('button', { name: 'Browse' }) }).first()
  await browseToggleB.getByRole('button', { name: 'Browse' }).click()
  await expect(page.locator('[data-folder-level="gender"]')).toBeVisible()
  {
    const genderBox = page.locator('[data-folder-level="gender"]')
    const genderBtns = genderBox.getByRole('button')
    const n = await genderBtns.count()
    expect(n).toBeGreaterThan(0)
    let found = false
    for (let i = 0; i < n; i++) {
      await genderBtns.nth(i).click()
      const teamBox = page.locator('[data-folder-level="team"]')
      const u17Btn = teamBox.getByRole('button', { name: /^U17\s+Items:/i })
      if (!(await u17Btn.count())) {
        await page.locator('div.text-sm.font-semibold').getByText('Teams', { exact: true }).click()
        continue
      }
      await u17Btn.first().click()
      const playerCard = page.locator(`[data-player-name="${migratedName} ${migratedSurname}"]`)
      if (await playerCard.count()) {
        await expect(playerCard).toBeVisible()
        found = true
        break
      }
      await page.locator('div.text-sm.font-semibold').getByText('Teams', { exact: true }).click()
    }
    expect(found).toBeTruthy()
  }

  const migrateBack = await apiPost(request, coachTokenB, `/players/${migratedPlayerId}/migrate`, { toSchoolId: schoolA, reason: 'Test migration back' })
  expect(migrateBack.ok()).toBeTruthy()
  const migrateBackReq = await migrateBack.json()
  const requestBackId = String(migrateBackReq.requestId || '')
  expect(requestBackId).toBeTruthy()

  const acceptBackRes = await apiPost(request, coachTokenA, `/migration-requests/${encodeURIComponent(requestBackId)}/decision`, { status: 'accepted' })
  expect(acceptBackRes.ok()).toBeTruthy()

  const coachBListRes = await request.get(`${API}/players?zoneId=${encodeURIComponent(zoneB)}&schoolId=${encodeURIComponent(schoolB)}`, {
    headers: { Authorization: `Bearer ${coachTokenB}` }
  })
  expect(coachBListRes.ok()).toBeTruthy()
  const coachBList = await coachBListRes.json()
  expect(coachBList.some((r: any) => String(r?.id || '') === migratedPlayerId)).toBeFalsy()
})
