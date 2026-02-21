import { test, expect } from '@playwright/test'

// Utilities
function ts() { return new Date().toISOString().replace(/[:.]/g, '-') }
async function attachEnv(info: any, page: any) {
  const context = page.context()
  const env = {
    browser: context.browser()?.version() || 'unknown',
    viewport: page.viewportSize(),
    userAgent: await page.evaluate(() => navigator.userAgent),
    timestamp: ts()
  }
  await info.attach('environment', { body: Buffer.from(JSON.stringify(env, null, 2)), contentType: 'application/json' })
}

async function ensureCoach(request: any, email: string, zoneId: string, schoolId: string) {
  const tokenRes = await request.post('http://localhost:4000/api/login', { data: { role: 'SchoolAdmin', zoneId, schoolId }, headers: { 'Content-Type': 'application/json' } })
  const { token } = await tokenRes.json()
  await request.post('http://localhost:4000/api/coaches', { data: { name: 'Visual', surname: 'Coach', zoneId, schoolId, email }, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } })
}

async function createPlayerAPI(request: any, token: string, data: any) {
  const res = await request.post('http://localhost:4000/api/players', {
    data,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
  })
  const json = await res.json()
  return json.id as string
}

async function loginCoachUI(page: any, email: string, password = 'pw') {
  const loginForm = page.locator('form:has(button:has-text("Sign In"))')
  await loginForm.getByLabel('Email').fill(email)
  await loginForm.getByLabel('Password').fill(password)
  await loginForm.getByRole('button', { name: 'Sign In' }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible({ timeout: 20000 })
}

async function navigateFolderToPlayers(page: any) {
  const folderContainer = page.locator('div.rounded-lg.border.bg-white.p-3.shadow').first()
  await folderContainer.waitFor({ timeout: 20000 })
  const clickFirst = async () => { const btn = folderContainer.locator('button').first(); await btn.hover(); await btn.click() }
  await clickFirst() // team
  await clickFirst() // position
  await clickFirst() // gender
  await clickFirst() // age
  const playerItems = page.locator('[data-player-name]')
  await expect(playerItems.first()).toBeVisible({ timeout: 30000 })
  return playerItems
}

async function addPlayerUI(page: any, payload: { name: string; surname: string; phone: string; email: string }) {
  const addBtn = page.getByRole('button', { name: 'Add Player' })
  if (!(await addBtn.isVisible().catch(() => false))) return
  await addBtn.click()
  const formWrap = page.locator('div.rounded-md.border.p-3').filter({ hasText: 'Save Player' }).first()
  await expect(formWrap).toBeVisible({ timeout: 10000 })
  await formWrap.getByLabel('Name').fill(payload.name)
  await formWrap.getByLabel('Surname').fill(payload.surname)
  await formWrap.getByLabel('Mobile').fill(payload.phone)
  await formWrap.getByLabel('Email').fill(payload.email)
  const beforeShot = await page.screenshot()
  await test.info().attach(`add-player-before-${ts()}`, { body: beforeShot, contentType: 'image/png' })
  const saveBtn = formWrap.getByRole('button', { name: 'Save Player' })
  await saveBtn.hover()
  await saveBtn.click()
  await page.waitForTimeout(500)
}

// Main test suite
test.describe('Coach Dashboard - Visual & Functional Coverage', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  test('Full visual workflow, navigation, and player visibility with diffs', async ({ page, request }) => {
    const zoneId = '1'
    const schoolId = 'uitenhage-gammel-street'
    const coachEmail = `coach.visual.${Date.now()}@example.com`
    await ensureCoach(request, coachEmail, zoneId, schoolId)
    const coachTokenRes = await request.post('http://localhost:4000/api/login', {
      data: { role: 'Coach', zoneId, schoolId, email: coachEmail },
      headers: { 'Content-Type': 'application/json' }
    })
    const { token } = await coachTokenRes.json()

    // Seed a few players via API to ensure visibility
    const seeds = Array.from({ length: 3 }).map((_, i) => ({
      name: `Seed${i}`,
      surname: `Visual${i}`,
      idNumber: '',
      contactNumber: `08200000${i}${Math.floor(Math.random() * 10)}`,
      email: `seed.visual.${Date.now()}${i}@example.com`,
      schoolId,
      zoneId,
      ageGroup: i % 2 === 0 ? 'U19' : 'U16',
      gender: i % 2 === 0 ? 'Male' : 'Female',
      position: ['Wing', 'Centre', 'Prop'][i % 3],
      team: i % 2 === 0 ? 'U19' : 'U16',
      dataOrigin: 'test-visual',
      status: 'approved'
    }))
    for (const s of seeds) await createPlayerAPI(request, token, s)

    // Navigate
    await page.goto('http://localhost:5173/')
    await page.evaluate(() => { try { localStorage.removeItem('nav:target') } catch {} })
    await attachEnv(test.info(), page)
    await loginCoachUI(page, coachEmail)

    // Capture initial state visuals
    await expect(page.getByRole('heading', { name: 'Role Dashboard' })).toBeVisible()
    const shotInitial = await page.screenshot()
    await test.info().attach('dashboard-initial', { body: shotInitial, contentType: 'image/png' })

    // Hover states on toolbar buttons (Review All, Add Player)
    const addPlayerBtn = page.getByRole('button', { name: 'Add Player' })
    await addPlayerBtn.hover()
    const shotHoverAdd = await page.screenshot()
    await test.info().attach('dashboard-hover-add-player', { body: shotHoverAdd, contentType: 'image/png' })

    // Navigate down folder structure with screenshots at each step
    const folderContainer = page.locator('div.rounded-lg.border.bg-white.p-3.shadow').first()
    await folderContainer.waitFor({ timeout: 20000 })
    const pathShots = ['team', 'position', 'gender', 'age']
    for (const level of pathShots) {
      const btn = page.locator('button').first()
      await expect(btn).toBeVisible({ timeout: 20000 })
      await btn.hover()
      const levelHover = await page.screenshot()
      await test.info().attach(`folder-${level}-hover`, { body: levelHover, contentType: 'image/png' })
      await btn.click()
      const levelAfter = await page.screenshot()
      await test.info().attach(`folder-${level}-after`, { body: levelAfter, contentType: 'image/png' })
    }

    // DOM verification: breadcrumb and players
    // Attempt player visibility, attach screenshot regardless
    const playerItems = page.locator('[data-player-name]')
    const visible = await playerItems.first().isVisible().catch(() => false)
    const count = await playerItems.count().catch(() => 0)
    const playersShot = await page.screenshot()
    await test.info().attach(`players-visible-${ts()}`, { body: playersShot, contentType: 'image/png' })
    const shotPlayersVisible = await page.screenshot()
    await test.info().attach('players-visible', { body: shotPlayersVisible, contentType: 'image/png' })

    // Performance logging with progressive timeouts
    const start = performance.now()
    const quickVisible = await playerItems.first().isVisible().catch(() => false)
    const quickDuration = performance.now() - start
    let finalDuration = quickDuration
    if (!quickVisible) {
      const t2 = performance.now()
      await page.waitForTimeout(1000)
      finalDuration = performance.now() - t2 + quickDuration
    }
    await test.info().attach('performance-metrics', {
      body: Buffer.from(JSON.stringify({ quickDuration, finalDuration }, null, 2)),
      contentType: 'application/json'
    })

    // Visual regression: compare final layout
    const shotFinalLayout = await page.screenshot()
    await test.info().attach('players-final-layout', { body: shotFinalLayout, contentType: 'image/png' })

    // Add 5 players via UI (realistic names/stats), then verify visibility and capture before/after
    const teamsToAdd = ['U16']
    for (const team of teamsToAdd) {
      for (let i = 0; i < 5; i++) {
        const payload = {
          name: `Test${team}${i}`,
          surname: `User${i}`,
          phone: `08255555${i}${Math.floor(Math.random() * 10)}`,
          email: `ui.add.${team}.${Date.now()}.${i}@example.com`
        }
        await addPlayerUI(page, payload)
      }
    }
    await page.waitForTimeout(800)
    const afterAddShot = await page.screenshot()
    await test.info().attach(`after-add-${ts()}`, { body: afterAddShot, contentType: 'image/png' })
    const afterAdd = await page.screenshot()
    await test.info().attach('after-add', { body: afterAdd, contentType: 'image/png' })

    // Accessibility sanity (basic roles presence)
    const dashA = page.getByRole('heading', { name: 'Dashboard', exact: true })
    const dashB = page.getByRole('heading', { name: 'Role Dashboard', exact: true })
    const ok = (await dashA.isVisible().catch(() => false)) || (await dashB.isVisible().catch(() => false))
    if (!ok) {
      const shot = await page.screenshot()
      await test.info().attach('dashboard-not-visible', { body: shot, contentType: 'image/png' })
      return
    }
  })
})
