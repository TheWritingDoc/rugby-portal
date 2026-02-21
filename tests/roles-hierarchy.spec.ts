import { test, expect, request } from '@playwright/test'

async function apiLogin(req: request.APIRequestContext, role: string, zoneId?: string, schoolId?: string, email?: string) {
  const res = await req.post('http://localhost:4000/api/login', { data: { role, zoneId, schoolId, email } })
  expect(res.ok()).toBeTruthy()
  const data = await res.json()
  return data.token as string
}

async function apiPost(req: request.APIRequestContext, token: string, path: string, body: any) {
  const res = await req.post(`http://localhost:4000/api/${path}`, { data: body, headers: { Authorization: `Bearer ${token}` } })
  return res
}

test.describe('Roles Hierarchy and UX Flows', () => {
  test.setTimeout(120000)

  test('SchoolAdmin and Coach hierarchy with permissions and flows', async ({ page, request }) => {
    const ts = Date.now()
    const zoneId = `Z-${ts}`
    const schoolId = `School-${ts}`
    const adminEmail = `admin_${ts}@test.local`
    const coachEmail = `coach_${ts}@test.local`
    const playerEmail = `player_${ts}@test.local`

    const adminToken = await apiLogin(request, 'EPHSRUAdmin')
    const schoolRes = await apiPost(request, adminToken, 'schools', { zoneId, schoolId, address: 'A', contactNumber: '1', email: `school_${ts}@test.local` })
    expect(schoolRes.ok()).toBeTruthy()
    const adminRes = await apiPost(request, adminToken, 'admins', { name: 'SA', surname: 'One', contactNumber: '+2712345', email: adminEmail, role: 'SchoolAdmin', zoneId, schoolId })
    expect(adminRes.ok()).toBeTruthy()
    const adminTokenScoped = await apiLogin(request, 'SchoolAdmin', zoneId, schoolId, adminEmail)
    const coachRes = await apiPost(request, adminTokenScoped, 'coaches', { name: 'C', surname: 'One', contactNumber: '+2767890', email: coachEmail, zoneId, schoolId })
    expect(coachRes.ok()).toBeTruthy()
    const playerRes = await apiPost(request, adminTokenScoped, 'players', { name: 'P', surname: 'One', contactNumber: '+2700000', email: playerEmail, zoneId, schoolId, ageGroup: 'U16' })
    expect(playerRes.ok()).toBeTruthy()
    const playerData = await playerRes.json()
    const playerId = playerData.id as string
    const dupCoach = await apiPost(request, adminTokenScoped, 'coaches', { name: 'C', surname: 'Dup', contactNumber: '+2767891', email: coachEmail, zoneId, schoolId })
    expect(dupCoach.status()).toBe(409)
    const badCoach = await apiPost(request, adminTokenScoped, 'admins', { name: 'X', surname: 'Y', email: 'x@test.local', role: 'SchoolAdmin', zoneId, schoolId })
    expect(badCoach.status()).toBe(403)

    await page.goto('http://localhost:5173/')
    await page.evaluate(() => { try { localStorage.removeItem('nav:target') } catch {} })
    const loginForm = page.locator('form:has(button:has-text("Sign In"))')
    await loginForm.getByLabel('Email').fill(adminEmail)
    await loginForm.getByLabel('Password').fill('pw')
    await loginForm.getByRole('button', { name: 'Sign In' }).click()
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()
    await page.waitForLoadState('networkidle')
    await page.evaluate(() => { try { localStorage.setItem('auth:role', 'Coach'); localStorage.setItem('nav:target', 'dashboard') } catch {} })
    const viewSelect = page.getByLabel('View')
    await expect(viewSelect).toBeVisible()
    await viewSelect.selectOption('coaches')
    await expect(page.locator('div.text-base.font-semibold').filter({ hasText: 'Coaches' }).first()).toBeVisible()
    await viewSelect.selectOption('teams')
    await expect(page.getByText('Players by Team')).toBeVisible()
    await expect(page.locator('div.mb-1.text-sm.font-semibold').filter({ hasText: 'U16' }).first()).toBeVisible()

    await page.goto('http://localhost:5173/')
    await page.evaluate(() => { try { localStorage.removeItem('nav:target') } catch {} })
    const coachLogin = page.locator('form:has(button:has-text("Sign In"))')
    await page.evaluate(() => { try { window.dispatchEvent(new CustomEvent('app:navigate', { detail: 'login' })) } catch {} })
    await page.locator('section:has(h1:has-text("Sign In"))').waitFor({ timeout: 10000 })
    await coachLogin.getByLabel('Email').fill(coachEmail)
    await coachLogin.getByLabel('Password').fill('pw')
    await coachLogin.getByRole('button', { name: 'Sign In' }).click()
    await page.evaluate(() => new Promise<void>((resolve) => {
      const h = () => { window.removeEventListener('app:dashboard:mounted', h as any); resolve() }
      window.addEventListener('app:dashboard:mounted', h as any)
      setTimeout(() => resolve(), 2000)
    }))
    await page.waitForLoadState('networkidle')
    const firstCard = page.locator('div.rounded-md.border').first()
    await expect(page.locator('[data-player-id]')).toHaveCount(1, { timeout: 30000 })
    await expect(firstCard).toBeVisible({ timeout: 15000 })
    await firstCard.getByRole('button', { name: 'Edit' }).click()
    const editor = page.locator('fieldset').filter({ hasText: 'Personal Information' }).first()
    const nameField = editor.locator('[data-field-key="name"] input')
    const newName = `P-${ts}`
    await nameField.fill(newName)
    await editor.locator('[data-field-key="name"] button:has-text("Save")').click()
    await page.waitForTimeout(800)
    for (let i = 0; i < 5; i++) {
      const res = await request.get(`http://localhost:4000/api/players/${playerId}`, { headers: { Authorization: `Bearer ${adminTokenScoped}` } })
      if (res.ok()) {
        const row = await res.json()
        const currentName = row.name || (row.data?.name ?? '')
        if (currentName === newName) break
      }
      await page.waitForTimeout(400)
    }
  })
})
