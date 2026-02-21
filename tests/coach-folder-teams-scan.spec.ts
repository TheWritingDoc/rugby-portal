import { test, expect } from '@playwright/test'

async function ensureCoach(request: any, email: string, zoneId: string, schoolId: string) {
  const tokenRes = await request.post('http://localhost:4000/api/login', { data: { role: 'SchoolAdmin', zoneId, schoolId }, headers: { 'Content-Type': 'application/json' } })
  const { token } = await tokenRes.json()
  await request.post('http://localhost:4000/api/coaches', { data: { name: 'Scan', surname: 'Coach', zoneId, schoolId, email }, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } })
}

async function createSeedPlayers(request: any, token: string, zoneId: string, schoolId: string) {
  const seeds = Array.from({ length: 5 }).map((_, i) => ({
    name: `Scan${i}`,
    surname: `Team${i}`,
    idNumber: '',
    contactNumber: `08220000${i}${Math.floor(Math.random() * 10)}`,
    email: `scan.team.${Date.now()}.${i}@example.com`,
    schoolId,
    zoneId,
    ageGroup: i % 2 === 0 ? 'U19' : 'U16',
    gender: i % 2 === 0 ? 'Male' : 'Female',
    position: ['Wing', 'Centre', 'Prop'][i % 3],
    team: i % 2 === 0 ? 'U19' : 'U16',
    dataOrigin: 'test-scan',
    status: 'approved',
    ts: Date.now()
  }))
  for (const s of seeds) {
    await request.post('http://localhost:4000/api/players', {
      data: s,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    })
  }
}

test('Coach folder browser scans every gender/team folder and verifies players load', async ({ page, request }) => {
  test.setTimeout(120000)
  const zoneId = '1'
  const schoolId = 'uitenhage-gammel-street'
  const coachEmail = `coach.scan.${Date.now()}@example.com`

  await ensureCoach(request, coachEmail, zoneId, schoolId)
  const coachTokenRes = await request.post('http://localhost:4000/api/login', {
    data: { role: 'Coach', zoneId, schoolId, email: coachEmail },
    headers: { 'Content-Type': 'application/json' }
  })
  const { token } = await coachTokenRes.json()
  await createSeedPlayers(request, token, zoneId, schoolId)

  // Year analysis: 2025 vs 2026 should match unless new registrations were added in 2026
  {
    const adminTokenRes = await request.post('http://localhost:4000/api/login', {
      data: { role: 'EPHSRUAdmin' },
      headers: { 'Content-Type': 'application/json' }
    })
    const { token: adminToken } = await adminTokenRes.json()
    const playersRes = await request.get('http://localhost:4000/api/players', {
      headers: { Authorization: `Bearer ${adminToken}` }
    })
    const allPlayers = await playersRes.json()

    const inferYearFromTs = (rawTs: any) => {
      if (rawTs === undefined || rawTs === null || rawTs === '') return null
      let n = typeof rawTs === 'number' ? rawTs : Number(rawTs)
      if (!Number.isFinite(n) || n <= 0) return null
      if (n < 1_000_000_000_000) n = n * 1000
      try {
        const y = new Date(n).getFullYear()
        return Number.isFinite(y) ? y : null
      } catch {
        return null
      }
    }

    const registrationYearOf = (r: any, d: any, systemYear: number) => {
      const direct = Number(d.registrationYear ?? d.registration_year ?? d.regYear ?? d.reg_year)
      if (Number.isFinite(direct) && direct > 2000) return direct
      const y1 = inferYearFromTs(d.registeredAt)
      if (y1) return y1
      const y2 = inferYearFromTs(r.createdAt ?? d.createdAt)
      if (y2) return y2
      const y3 = inferYearFromTs(r.ts ?? r.updatedAt ?? d.ts)
      if (y3) return y3
      return systemYear
    }

    const registeredAtOf = (r: any, d: any) => {
      const t = typeof d.registeredAt === 'number' ? d.registeredAt : Number(d.registeredAt || 0)
      if (Number.isFinite(t) && t > 0) return t

      const createdSource = (r.createdAt !== undefined && r.createdAt !== null)
        ? r.createdAt
        : d.createdAt
      const c = typeof createdSource === 'number' ? createdSource : Number(createdSource || 0)
      if (Number.isFinite(c) && c > 0) return c

      const tsSource = (r.ts !== undefined && r.ts !== null)
        ? r.ts
        : (r.updatedAt !== undefined && r.updatedAt !== null)
          ? r.updatedAt
          : d.ts
      const u = typeof tsSource === 'number' ? tsSource : Number(tsSource || 0)
      return Number.isFinite(u) && u > 0 ? u : 0
    }

    const identityKey = (r: any, d: any) => {
      const email = String(d.email ?? r.email ?? '').trim().toLowerCase()
      if (email) return `email:${email}`
      const idNumber = String(d.idNumber ?? r.idNumber ?? '').trim().toLowerCase()
      if (idNumber) return `id:${idNumber}`
      const name = String(d.name ?? r.name ?? '').trim().toLowerCase()
      const surname = String(d.surname ?? r.surname ?? '').trim().toLowerCase()
      const dob = String(d.dateOfBirth ?? r.dateOfBirth ?? d.dob ?? '').trim().toLowerCase()
      const composite = [name, surname, dob].filter(Boolean).join('|')
      return composite ? `n:${composite}` : `rid:${String(r.id || '')}`
    }

    const promoteGroup = (v: string, steps: number) => {
      if (!v || steps <= 0) return v
      let out = v
      for (let i = 0; i < steps; i++) {
        if (out === 'U15') out = 'U16'
        else if (out === 'U16') out = 'U17'
        else if (out === 'U17') out = 'U19'
        else if (out === 'U19') out = 'U19'
      }
      return out
    }

    const systemYear = new Date().getFullYear()
    const anchors = new Map<string, any>()
    for (const r of Array.isArray(allPlayers) ? allPlayers : []) {
      let d: any = {}
      try { d = typeof r.data === 'string' ? JSON.parse(r.data || '{}') : (r.data || {}) } catch { d = {} }
      const k = identityKey(r, d)
      const ry = registrationYearOf(r, d, systemYear)
      const rt = registeredAtOf(r, d)
      const prev = anchors.get(k)
      if (!prev || ry < prev.ry || (ry === prev.ry && rt && prev.rt && rt < prev.rt)) {
        anchors.set(k, {
          key: k,
          regYear: ry,
          regTs: rt,
          schoolId: String(d.schoolId ?? r.schoolId ?? ''),
          name: String(d.name ?? r.name ?? ''),
          surname: String(d.surname ?? r.surname ?? ''),
          email: String(d.email ?? r.email ?? ''),
          baseAgeGroup: String(d.ageGroup ?? r.ageGroup ?? ''),
          baseTeam: String(d.team ?? d.ageGroup ?? r.ageGroup ?? '')
        })
      }
    }

    const asOf = (year: number) => {
      const set = new Set<string>()
      for (const a of anchors.values()) {
        if (a.regYear <= year) set.add(a.key)
      }
      return set
    }
    const s2025 = asOf(2025)
    const s2026 = asOf(2026)
    const added2026 = [...s2026].filter((k) => !s2025.has(k))
    const missing2026 = [...s2025].filter((k) => !s2026.has(k))

    const transitions = new Map<string, number>()
    for (const a of anchors.values()) {
      if (a.regYear > 2025) continue
      const ag25 = promoteGroup(a.baseAgeGroup, 2025 - a.regYear)
      const ag26 = promoteGroup(a.baseAgeGroup, 2026 - a.regYear)
      const k = `${ag25} -> ${ag26}`
      transitions.set(k, (transitions.get(k) || 0) + 1)
    }

    const topTransitions = [...transitions.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)
    const report = {
      players2025: s2025.size,
      players2026: s2026.size,
      newIn2026: added2026.length,
      missingIn2026: missing2026.length,
      topAgeGroupTransitions2025to2026: topTransitions.map(([k, c]) => ({ transition: k, count: c })),
      addedSample: added2026.slice(0, 50).map((k) => anchors.get(k)).filter(Boolean)
    }

    console.log('[year-compare]', report)
    await test.info().attach('year-compare-2025-2026.json', {
      body: Buffer.from(JSON.stringify(report, null, 2)),
      contentType: 'application/json'
    })
  }

  await page.goto('http://localhost:5173/')
  await page.evaluate(() => { try { localStorage.removeItem('nav:target') } catch {} })

  const loginForm = page.locator('form:has(button:has-text("Sign In"))')
  await loginForm.getByLabel('Email').fill(coachEmail)
  await loginForm.getByLabel('Password').fill('pw')
  await loginForm.getByRole('button', { name: 'Sign In' }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()

  const folderContainer = page.locator('div.rounded-lg.border.bg-white.p-3.shadow').first()
  await folderContainer.waitFor({ timeout: 20000 })

  const results: { gender: string; team: string; players: number; screenshot: string }[] = []

  const filterInput = folderContainer.getByPlaceholder('Filter...')
  const breadcrumb = folderContainer.locator('div.text-sm.font-semibold')

  const currentYear = new Date().getFullYear()
  const yearRow = folderContainer.locator('[data-folder-level="year"]')
  await expect(yearRow.getByRole('button', { name: String(currentYear), exact: true })).toBeVisible()
  const yearTexts = (await yearRow.locator('button').allTextContents()).map((t) => Number(String(t).trim())).filter((n) => Number.isFinite(n))
  expect(Math.max(...yearTexts)).toBeLessThanOrEqual(currentYear)

  const genderButtons = () => folderContainer.locator('[data-folder-level="gender"] [data-folder-item="folder"]')
  await expect(genderButtons().first()).toBeVisible({ timeout: 20000 })
  const genderCount = await genderButtons().count()
  expect(genderCount).toBeGreaterThan(0)

  for (let gi = 0; gi < genderCount; gi++) {
    await filterInput.fill('')
    const genderButton = genderButtons().nth(gi)
    const genderName = (await genderButton.locator('div.text-sm.font-semibold').textContent())?.trim() || `gender-${gi}`
    await genderButton.click()
    await page.waitForTimeout(400)

    const teamButtons = () => folderContainer.locator('[data-folder-level="team"] [data-folder-item="folder"]')
    await expect(teamButtons().first()).toBeVisible({ timeout: 20000 })
    const teamCount = await teamButtons().count()
    expect(teamCount).toBeGreaterThan(0)

    for (let ti = 0; ti < teamCount; ti++) {
      await filterInput.fill('')
      const teamButton = teamButtons().nth(ti)
      const teamName = (await teamButton.locator('div.text-sm.font-semibold').textContent())?.trim() || `team-${ti}`
      await teamButton.click()
      await page.waitForTimeout(500)

      const playerItems = page.locator('[data-player-name]')
      const playerCount = await playerItems.count()

      const screenshot = await page.screenshot({ fullPage: false })
      const screenshotName = `team-${genderName.replace(/[^a-zA-Z0-9]/g, '-')}-${teamName.replace(/[^a-zA-Z0-9]/g, '-')}-${Date.now()}.png`

      results.push({ gender: genderName, team: teamName, players: playerCount, screenshot: screenshotName })
      await test.info().attach(screenshotName, { body: screenshot, contentType: 'image/png' })

      const genderCrumb = breadcrumb.locator('span').nth(2)
      await genderCrumb.click()
      await page.waitForTimeout(400)
    }

    const yearCrumb = breadcrumb.locator('span').nth(1)
    await yearCrumb.click()
    await page.waitForTimeout(400)
  }

  // Generate summary report
  const summary = {
    totalFolders: results.length,
    foldersWithPlayers: results.filter(r => r.players > 0).length,
    totalPlayersFound: results.reduce((sum, r) => sum + r.players, 0),
    folderDetails: results
  }

  await test.info().attach('team-scan-summary', {
    body: Buffer.from(JSON.stringify(summary, null, 2)),
    contentType: 'application/json'
  })

  // Assertions
  expect(results.length).toBeGreaterThan(0)
  expect(results.some(r => r.players > 0)).toBeTruthy()
})
