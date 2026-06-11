import { test, expect, request as pwRequest, Page } from '@playwright/test'

/**
 * Real-world user journeys, driven through the browser the way actual users work:
 *
 *  1. A player self-registers (with profile photo upload), is reviewed by the coach.
 *  2. The player logs in, completes missing info (approval request) and requests a
 *     transfer to another school.
 *  3. Coach A works the review queue: approves the registration and the profile update;
 *     cannot see players from other zones; has no admin navigation.
 *  4. Coach B (destination school) accepts the migration; the player moves schools.
 *     Coach B also adds a walk-in player with a photo via the quick-add form.
 *  5. The school admin manages coaches (add with qualifications) and opens player profiles.
 *  6. The zone coordinator sees only their zone.
 *  7. A referee sees the officials dashboard.
 *  8. The EPHSRU admin sees the whole province plus audit logs.
 */

const APP = 'http://localhost:5173'
const API = 'http://localhost:4000/api'

const ts = Date.now()
const ZONE = '1' // Uitenhage
const SCHOOL_A = 'uitenhage-gammel-street' // "Gammel Street"
const SCHOOL_B = 'uitenhage-mccarthy' // "McCarthy"
const ZONE2 = '2' // Kwadwezi
const SCHOOL_Z2 = 'kwadwezi-gqebera'
const PASSWORD = 'Journey!234'

const player = {
  name: 'Thando',
  surname: `Journey${ts}`,
  email: `player.journey.${ts}@test.local`,
  idNumber: `90010${String(ts).slice(-8)}`,
}
const coachA = { name: 'Anele', surname: `CoachA${ts}`, email: `coacha.${ts}@test.local` }
const coachB = { name: 'Bongani', surname: `CoachB${ts}`, email: `coachb.${ts}@test.local` }
const schoolAdmin = { name: 'Sindi', surname: `Admin${ts}`, email: `sa.journey.${ts}@test.local` }
const zoneCoord = { name: 'Zola', surname: `Coord${ts}`, email: `zc.journey.${ts}@test.local` }
const epAdmin = { name: 'Eli', surname: `Union${ts}`, email: `ep.journey.${ts}@test.local` }
const refereeU = { name: 'Rito', surname: `Whistle${ts}`, email: `ref.journey.${ts}@test.local` }
const isoPlayer = { name: 'Other', surname: `ZoneTwo${ts}`, email: `iso.${ts}@test.local` }

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)

async function uiLogin(page: Page, email: string, password = PASSWORD) {
  await page.goto(APP)
  await page.evaluate(() => {
    try { localStorage.clear() } catch {}
  })
  await page.reload()
  const form = page.locator('form:has(button:has-text("Sign In"))')
  await form.getByLabel('Email').fill(email)
  await form.getByLabel('Password').fill(password)
  await form.getByRole('button', { name: 'Sign In' }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible({ timeout: 15000 })
}

test.describe.configure({ mode: 'serial' })
test.describe('Real-world journeys across all roles', () => {
  test.setTimeout(120000)

  test.beforeAll(async () => {
    const ctx = await pwRequest.newContext()
    const loginRes = await ctx.post(`${API}/login`, { data: { role: 'EPHSRUAdmin' } })
    expect(loginRes.ok()).toBeTruthy()
    const epToken = (await loginRes.json()).token as string
    const h = { Authorization: `Bearer ${epToken}` }

    // Zone-2 school for cross-zone isolation checks (ignore duplicate errors on reruns)
    await ctx.post(`${API}/schools`, {
      headers: h,
      data: { name: 'Gqebera', zoneId: ZONE2, schoolId: SCHOOL_Z2, address: 'Kwadwezi', contactNumber: '+27410000000', email: `gqebera.${ts}@test.local` },
    })

    const seed = async (path: string, data: any) => {
      const r = await ctx.post(`${API}/${path}`, { headers: h, data })
      expect(r.ok(), `seed ${path} ${JSON.stringify(data.email)}`).toBeTruthy()
    }
    // Coaches deliberately have no fixed team so they see the whole school roster
    await seed('coaches', { ...coachA, zoneId: ZONE, schoolId: SCHOOL_A, contactNumber: '+27820000101', qualifications: 'Level 2', experience: '6', position: 'Head Coach' })
    await seed('coaches', { ...coachB, zoneId: ZONE, schoolId: SCHOOL_B, contactNumber: '+27820000102', qualifications: 'Level 1', experience: '3', position: 'Head Coach' })
    await seed('admins', { ...schoolAdmin, role: 'SchoolAdmin', zoneId: ZONE, schoolId: SCHOOL_A, contactNumber: '+27820000103' })
    await seed('admins', { ...zoneCoord, role: 'ZoneCoordinator', zoneId: ZONE, contactNumber: '+27820000104' })
    await seed('admins', { ...epAdmin, role: 'EPHSRUAdmin', contactNumber: '+27820000105' })
    await seed('referees', { ...refereeU, zoneId: ZONE, contactNumber: '+27820000106', qualifications: 'Provincial Panel' })
    await seed('players', { ...isoPlayer, zoneId: ZONE2, schoolId: SCHOOL_Z2, ageGroup: 'U16', gender: 'Male', contactNumber: '+27820000107' })
    await ctx.dispose()
  })

  test('1. Player self-registers through the public form with a profile photo', async ({ page }) => {
    await page.goto(APP)
    await page.evaluate(() => { try { localStorage.clear() } catch {} })
    await page.reload()

    // Register panel (right of the sign-in form)
    await page.getByLabel('Email', { exact: true }).last().fill(player.email)
    await page.getByLabel('Create Password').fill(PASSWORD)
    await page.getByLabel('Verify Password').fill(PASSWORD)
    await page.getByLabel('Select registration form').selectOption('player')
    await page.getByTestId('btn-player').click()

    // Player registration form
    await page.getByTestId('zone-select').selectOption(ZONE)
    await page.getByTestId('school-select').selectOption(SCHOOL_A)
    await page.getByLabel('Name', { exact: true }).fill(player.name)
    await page.getByLabel('Surname', { exact: true }).fill(player.surname)
    await page.getByLabel('Date of Birth').fill('2010-04-12')
    await page.getByLabel('ID/Passport Number').fill(player.idNumber)
    await page.getByLabel('Gender').selectOption('Male')
    await page.getByLabel('Mobile Number').fill('0821230001')
    await expect(page.getByLabel('Email Address', { exact: true })).toHaveValue(player.email)

    // Photo upload during registration
    const [uploadRes] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/upload') && r.request().method() === 'POST'),
      page.locator('label:has-text("Profile Photo") input[type="file"]').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: PNG }),
    ])
    expect(uploadRes.ok()).toBeTruthy()
    await expect(page.locator('img[alt="Profile"]')).toBeVisible()

    const [regRes] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/players/register') && r.request().method() === 'POST'),
      page.getByRole('button', { name: 'Submit Player Registration' }).click(),
    ])
    expect(regRes.ok()).toBeTruthy()
    await expect(page.getByText('Congratulations! Your player registration has been submitted.')).toBeVisible()
  })

  test('2. Player signs in, completes missing info and requests a school transfer', async ({ page }) => {
    await uiLogin(page, player.email)
    await expect(page.getByTestId('player-self-panel')).toBeVisible()
    await expect(page.getByRole('heading', { name: `${player.name} ${player.surname}` })).toBeVisible({ timeout: 20000 })
    // Human-readable school name, not the slug
    await expect(page.getByTestId('player-self-panel').getByText('Gammel Street').first()).toBeVisible()

    // Complete missing info -> creates an approval request for the school to review
    await page.getByRole('button', { name: 'Actions' }).click()
    await page.getByRole('button', { name: 'Complete My Profile' }).click()
    await expect(page.getByText('Fill Missing Information')).toBeVisible()
    const medAid = page.locator('label:has-text("Medical Aid Name") input')
    await medAid.fill('Discovery Health')
    const [approvalRes] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/approvals') && r.request().method() === 'POST'),
      medAid.press('Enter'),
    ])
    expect(approvalRes.ok()).toBeTruthy()

    // Request a transfer to McCarthy
    await page.getByRole('button', { name: 'Actions' }).click()
    await page.getByRole('button', { name: 'Request School Transfer' }).click()
    await expect(page.getByText('Player Migration')).toBeVisible()
    await expect(page.getByText('Select Destination')).toBeVisible({ timeout: 15000 })
    const dest = page.getByLabel('Destination School')
    await expect(dest.locator(`option[value="${SCHOOL_B}"]`)).toBeAttached({ timeout: 15000 })
    // Re-select until React state catches up (the catalog re-render can race the first change event)
    await expect(async () => {
      await dest.selectOption(SCHOOL_B)
      await expect(page.getByRole('button', { name: 'Confirm Transfer' })).toBeEnabled({ timeout: 2000 })
    }).toPass({ timeout: 30000 })
    await page.getByLabel('Migration reason (optional)').fill('Family moved across town')
    await page.getByRole('button', { name: 'Confirm Transfer' }).click() // -> review step
    await page.getByRole('button', { name: 'Confirm Transfer' }).click() // -> confirm dialog
    const dialog = page.getByRole('dialog', { name: 'Confirm migration' })
    const [migRes] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/migrate') && r.request().method() === 'POST'),
      dialog.getByRole('button', { name: 'Confirm Transfer' }).click(),
    ])
    expect(migRes.ok()).toBeTruthy()
    await expect(page.getByText('Migration request sent. Waiting for destination school approval.')).toBeVisible()
  })

  test('3. Coach A reviews the queue: approves registration and profile update; scoped to own school', async ({ page }) => {
    await uiLogin(page, coachA.email, 'pw')
    // Coaches have no admin navigation
    await expect(page.getByTestId('btn-approvals')).toHaveCount(0)
    await expect(page.getByTestId('btn-reports')).toHaveCount(0)
    // Coach banner shows photo block + details
    await expect(page.getByText(`Welcome, ${coachA.name} ${coachA.surname}`)).toBeVisible()

    await page.getByRole('button', { name: /Pending \(/ }).click()

    // Approve the self-registered player (registration card has its own green Approve)
    const regCard = page.locator('div.rounded-lg.border.bg-white.p-3.shadow-sm').filter({ hasText: player.surname }).first()
    await expect(regCard).toBeVisible({ timeout: 15000 })
    const [approveRes] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/approve') && r.request().method() === 'POST'),
      regCard.locator('button.bg-green-600', { hasText: 'Approve' }).first().click(),
    ])
    expect(approveRes.ok()).toBeTruthy()

    // Approve the player's own profile-update request (medical aid)
    const updateRow = page.locator('div.flex.flex-wrap').filter({ hasText: 'medicalAidName' }).first()
    await expect(updateRow).toBeVisible({ timeout: 15000 })
    const [decisionRes] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/approvals/') && r.url().includes('/decision') && r.request().method() === 'POST'),
      updateRow.getByRole('button', { name: 'Approve', exact: true }).click(),
    ])
    expect(decisionRes.ok()).toBeTruthy()

    // Scope: coach A cannot find the zone-2 player
    await page.getByRole('button', { name: /Players \(/ }).click()
    await page.getByRole('button', { name: 'Search' }).first().click()
    const searchInput = page.getByPlaceholder(/Search players by name/i)
    await searchInput.fill(isoPlayer.surname)
    await searchInput.press('Enter')
    await expect(page.getByText('No matches')).toBeVisible()

    // ...but can find their own school's new player
    await searchInput.fill(player.surname)
    await searchInput.press('Enter')
    await expect(page.getByText(`${player.name} ${player.surname}`).first()).toBeVisible()
  })

  test('4. Coach B accepts the migration and the player changes schools; quick-adds a player with photo', async ({ page }) => {
    await uiLogin(page, coachB.email, 'pw')
    await page.getByRole('button', { name: /Pending \(/ }).click()

    // Migration request shows human-readable school names
    const migRow = page.locator('div.flex.flex-wrap').filter({ hasText: player.surname }).filter({ has: page.getByRole('button', { name: 'Accept' }) }).first()
    await expect(migRow).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('Gammel Street → McCarthy').first()).toBeVisible()
    const [acceptRes] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/migration-requests/') && r.url().includes('/decision') && r.request().method() === 'POST'),
      migRow.getByRole('button', { name: 'Accept', exact: true }).click(),
    ])
    expect(acceptRes.ok()).toBeTruthy()

    // The player now belongs to McCarthy
    await page.getByRole('button', { name: /Players \(/ }).click()
    await page.getByRole('button', { name: 'Search' }).first().click()
    const searchInput = page.getByPlaceholder(/Search players by name/i)
    await searchInput.fill(player.surname)
    await searchInput.press('Enter')
    await expect(page.getByText(`${player.name} ${player.surname}`).first()).toBeVisible({ timeout: 15000 })

    // Quick-add a walk-in player with a photo
    await page.getByRole('button', { name: 'Add Player' }).click()
    const form = page.locator('div.rounded-md.border.p-3').filter({ hasText: 'Save Player' }).first()
    await form.getByLabel('Name', { exact: true }).fill('Walkin')
    await form.getByLabel('Surname', { exact: true }).fill(`Recruit${ts}`)
    await form.getByLabel('Mobile', { exact: true }).fill('0821230002')
    await form.getByLabel('Email', { exact: true }).fill(`walkin.${ts}@test.local`)
    await form.getByLabel('Age Group').selectOption('U16')
    await form.getByLabel('Position').selectOption({ index: 1 })
    const [uploadRes] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/upload') && r.request().method() === 'POST'),
      form.locator('input[type="file"]').setInputFiles({ name: 'walkin.png', mimeType: 'image/png', buffer: PNG }),
    ])
    expect(uploadRes.ok()).toBeTruthy()
    await expect(form.locator('img[alt="Player"]')).toBeVisible()
    const [createRes] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/players') && r.request().method() === 'POST'),
      form.getByRole('button', { name: 'Save Player' }).click(),
    ])
    expect(createRes.ok()).toBeTruthy()
    await expect(page.getByText(`Walkin Recruit${ts} added to your squad`)).toBeVisible()
  })

  test('5. School admin manages coaches and opens player profiles; sees no internal IDs', async ({ page }) => {
    await uiLogin(page, schoolAdmin.email, 'pw')
    await expect(page.getByText('School Administration')).toBeVisible()
    // Zone shown by name; no raw "School ID:" developer info
    await expect(page.getByText('Uitenhage Zone').first()).toBeVisible()
    await expect(page.getByText('School ID:')).toHaveCount(0)
    // Season filter defaults to the current year
    await expect(page.getByTestId('season-filter')).toBeVisible()
    await expect(page.getByTestId('season-filter').getByText(`Season ${new Date().getFullYear()}`)).toBeVisible()
    // School admins approve but do not see union reports
    await expect(page.getByTestId('btn-approvals')).toBeVisible()
    await expect(page.getByTestId('btn-reports')).toHaveCount(0)

    // Add a coach with qualification details
    await page.getByRole('button', { name: 'Coaches' }).click()
    await page.getByRole('button', { name: 'Add Coach' }).click()
    const coachFormEl = page.locator('div.rounded-xl').filter({ hasText: 'Add New Coach' })
    await coachFormEl.getByPlaceholder('Name', { exact: true }).fill('Lwazi')
    await coachFormEl.getByPlaceholder('Surname').fill(`NewCoach${ts}`)
    await coachFormEl.getByPlaceholder('Email', { exact: true }).fill(`newcoach.${ts}@test.local`)
    await coachFormEl.getByPlaceholder('Phone').fill('0821230003')
    await coachFormEl.locator('select').selectOption('U15')
    await coachFormEl.getByPlaceholder('Qualification (e.g. Level 1)').fill('Level 1')
    await coachFormEl.getByPlaceholder('Years of experience').fill('4')
    const [coachRes] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/coaches') && r.request().method() === 'POST'),
      page.getByRole('button', { name: 'Save Coach' }).click(),
    ])
    expect(coachRes.ok()).toBeTruthy()
    const newCoachCard = page.locator('[data-coach-name]').filter({ hasText: `NewCoach${ts}` })
    await expect(newCoachCard).toBeVisible({ timeout: 15000 })
    await expect(newCoachCard.getByText('Level 1')).toBeVisible()
    await expect(newCoachCard.getByText('4 yrs experience')).toBeVisible()

    // Open a player profile from the overview cards and close it again
    await page.getByRole('button', { name: 'Overview' }).click()
    await page.locator('button[data-player-name]').first().click()
    await expect(page.getByText('Player Profile')).toBeVisible()
    await page.locator('button:has(svg.lucide-x)').first().click()
    await expect(page.getByText('Player Profile')).not.toBeVisible()
  })

  test('6. Zone coordinator sees only their zone', async ({ page }) => {
    await uiLogin(page, zoneCoord.email, 'pw')
    await expect(page.getByText('Zone Administration')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Uitenhage Zone' })).toBeVisible()
    await expect(page.getByText(`Coordinator: ${zoneCoord.name} ${zoneCoord.surname}`)).toBeVisible()
    // In the approval chain: sees both Reports and Approvals
    await expect(page.getByTestId('btn-approvals')).toBeVisible()
    await expect(page.getByTestId('btn-reports')).toBeVisible()
    // Zone-2 data is invisible to a zone-1 coordinator
    await expect(page.getByText(isoPlayer.surname)).toHaveCount(0)
  })

  test('7. Referee sees the officials dashboard', async ({ page }) => {
    await uiLogin(page, refereeU.email, 'pw')
    await expect(page.getByText('Referee Dashboard')).toBeVisible()
    await expect(page.getByText(`${refereeU.name} ${refereeU.surname}`).first()).toBeVisible()
    await expect(page.getByTestId('btn-approvals')).toHaveCount(0)
    await expect(page.getByTestId('btn-reports')).toHaveCount(0)
  })

  test('8. EPHSRU admin oversees the whole province with audit logs', async ({ page }) => {
    await uiLogin(page, epAdmin.email, 'pw')
    await expect(page.getByText('System Administration')).toBeVisible()
    await expect(page.getByText('EPHSRU Dashboard')).toBeVisible()
    await expect(page.getByText('Audit Logs')).toBeVisible()
    await expect(page.getByTestId('btn-approvals')).toBeVisible()
    await expect(page.getByTestId('btn-reports')).toBeVisible()
    // Season filter is present for the union admin too
    await expect(page.getByTestId('season-filter')).toBeVisible()
  })
})
