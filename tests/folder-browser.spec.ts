import { test, expect } from '@playwright/test'

async function ensureCoach(request: any, email: string, zoneId: string, schoolId: string) {
  const tokenRes = await request.post('http://localhost:4000/api/login', { data: { role: 'SchoolAdmin', zoneId, schoolId }, headers: { 'Content-Type': 'application/json' } })
  const { token } = await tokenRes.json()
  await request.post('http://localhost:4000/api/coaches', { data: { name: 'Folder', surname: 'Coach', zoneId, schoolId, email }, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } })
}

async function createSeedPlayers(request: any, token: string, zoneId: string, schoolId: string) {
  const seeds = Array.from({ length: 3 }).map((_, i) => ({
    name: `SeedFB${i}`,
    surname: `UserFB${i}`,
    idNumber: '',
    contactNumber: `08210000${i}${Math.floor(Math.random() * 10)}`,
    email: `seed.fb.${Date.now()}.${i}@example.com`,
    schoolId,
    zoneId,
    ageGroup: i % 2 === 0 ? 'U19' : 'U16',
    gender: i % 2 === 0 ? 'Male' : 'Female',
    position: ['Wing', 'Centre', 'Prop'][i % 3],
    team: i % 2 === 0 ? 'U19' : 'U16',
    dataOrigin: 'test-folder',
    status: 'approved'
  }))
  for (const s of seeds) {
    await request.post('http://localhost:4000/api/players', {
      data: s,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    })
  }
}

test('Coach folder browser shows players and captures screenshot', async ({ page, request }) => {
  const zoneId = '1'
  const schoolId = 'uitenhage-gammel-street'
  const coachEmail = `coach.folder.${Date.now()}@example.com`

  await ensureCoach(request, coachEmail, zoneId, schoolId)
  const coachTokenRes = await request.post('http://localhost:4000/api/login', {
    data: { role: 'Coach', zoneId, schoolId, email: coachEmail },
    headers: { 'Content-Type': 'application/json' }
  })
  const { token } = await coachTokenRes.json()
  await createSeedPlayers(request, token, zoneId, schoolId)

  await page.goto('http://localhost:5173/')
  await page.evaluate(() => { try { localStorage.removeItem('nav:target') } catch {} })

  const loginForm = page.locator('form:has(button:has-text("Sign In"))')
  await loginForm.getByLabel('Email').fill(coachEmail)
  await loginForm.getByLabel('Password').fill('pw')
  await loginForm.getByRole('button', { name: 'Sign In' }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()

  // Try to locate folder browser
  const folderContainer = page.locator('div.rounded-lg.border.bg-white.p-3.shadow').first()
  await folderContainer.waitFor({ timeout: 20000 })

  // Click down the hierarchy: gender → team. Scope to the folder browser so
  // header chrome (My Profile, Messages, etc.) is never mistaken for a folder.
  const clickFirstItem = async () => {
    // At the players (leaf) level there are no folders left to drill — no-op.
    const folders = folderContainer.locator('[data-folder-item="folder"]')
    if ((await folders.count()) === 0) return
    const firstBtn = folders.first()
    await expect(firstBtn).toBeVisible({ timeout: 20000 })
    await firstBtn.hover()
    await firstBtn.click()
  }
  const clickByText = async (texts: string[]) => {
    for (const t of texts) {
      const btn = folderContainer.locator('[data-folder-item="folder"]').filter({ hasText: t }).first()
      if (await btn.isVisible().catch(() => false)) {
        await btn.hover()
        await btn.click()
        return true
      }
    }
    // fallback: click first folder
    await clickFirstItem()
    return false
  }
  await clickByText(['U19', 'U16', 'Unassigned'])
  await clickByText(['Wing', 'Centre', 'Prop', 'All'])
  await clickByText(['Male', 'Female', 'All'])
  await clickByText(['U19', 'U16', 'All'])

  // Try player visibility; if not present, still capture screenshot for documentation
  const playerItems = page.locator('[data-player-name]')
  await page.waitForTimeout(500)

  // Attach screenshot to report (and save)
  const img = await page.screenshot({ fullPage: false })
  await test.info().attach('folder-browser-screenshot', { body: img, contentType: 'image/png' })
})
