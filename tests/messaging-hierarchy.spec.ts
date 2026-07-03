import { test, expect } from '@playwright/test'

/**
 * Scoped messaging: users may only message their direct superiors/reports.
 * API-level (no UI) so it runs fast and pins the security boundary:
 *   EPHSRUAdmin <-> ZC | ZC <-> SchoolAdmin (zone) | SchoolAdmin <-> Coach/Referee (school)
 *   Coach <-> Player (school) | replies to a prior sender always allowed.
 */

const API = 'http://localhost:4000/api'
const SCHOOL = 'uitenhage-gammel-street'
const ZONE = '1'

async function tok(request: any, role: string, zoneId?: string, schoolId?: string, email?: string) {
  const res = await request.post(`${API}/login`, { data: { role, zoneId, schoolId, email }, headers: { 'Content-Type': 'application/json' } })
  expect(res.ok()).toBeTruthy()
  return (await res.json()).token as string
}
const H = (t: string) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' })

test('messaging is scoped to the reporting hierarchy', async ({ request }) => {
  const ts = Date.now()
  const emails = {
    ep: `ep.msg${ts}@t.local`,
    zc: `zc.msg${ts}@t.local`,
    sa: `sa.msg${ts}@t.local`,
    co: `co.msg${ts}@t.local`,
    pl: `pl.msg${ts}@t.local`,
  }
  // Seed the chain top-down so scope lookups resolve from real rows
  const ep = await tok(request, 'EPHSRUAdmin', undefined, undefined, emails.ep)
  await request.post(`${API}/admins`, { headers: H(ep), data: { name: 'Z', surname: `C${ts}`, role: 'ZoneCoordinator', zoneId: ZONE, email: emails.zc } })
  const zc = await tok(request, 'ZoneCoordinator', ZONE, undefined, emails.zc)
  await request.post(`${API}/admins`, { headers: H(zc), data: { name: 'S', surname: `A${ts}`, role: 'SchoolAdmin', zoneId: ZONE, schoolId: SCHOOL, email: emails.sa } })
  const sa = await tok(request, 'SchoolAdmin', ZONE, SCHOOL, emails.sa)
  await request.post(`${API}/coaches`, { headers: H(sa), data: { name: 'C', surname: `O${ts}`, zoneId: ZONE, schoolId: SCHOOL, email: emails.co } })
  const co = await tok(request, 'Coach', ZONE, SCHOOL, emails.co)
  await request.post(`${API}/players`, { headers: H(co), data: { name: 'P', surname: `L${ts}`, zoneId: ZONE, schoolId: SCHOOL, email: emails.pl } })
  const pl = await tok(request, 'Player', ZONE, SCHOOL, emails.pl)

  const send = (t: string, toEmail: string, body: string) =>
    request.post(`${API}/messages`, { headers: H(t), data: { toEmail, subject: 'spec', body } })

  // Allowed links
  expect((await send(co, emails.sa, 'coach->sa')).status()).toBe(200)
  expect((await send(co, emails.pl, 'coach->player')).status()).toBe(200)
  expect((await send(pl, emails.co, 'player->coach')).status()).toBe(200)
  expect((await send(zc, emails.sa, 'zc->sa')).status()).toBe(200)
  expect((await send(ep, emails.zc, 'ep->zc')).status()).toBe(200)
  expect((await send(sa, emails.co, 'sa->coach')).status()).toBe(200)

  // Blocked links (outside the reporting line)
  expect((await send(co, emails.ep, 'coach->ep')).status()).toBe(403)
  expect((await send(pl, emails.zc, 'player->zc')).status()).toBe(403)
  expect((await send(ep, emails.pl, 'ep->player')).status()).toBe(403)
  expect((await send(pl, emails.sa, 'player->sa')).status()).toBe(403)

  // Recipient directory is scoped
  const plRec = await (await request.get(`${API}/messages/recipients`, { headers: H(pl) })).json()
  expect(Array.isArray(plRec)).toBeTruthy()
  expect(new Set(plRec.map((r: any) => r.role))).toEqual(new Set(['Coach']))
  const coRec = await (await request.get(`${API}/messages/recipients`, { headers: H(co) })).json()
  expect(new Set(coRec.map((r: any) => r.role))).toEqual(new Set(['SchoolAdmin', 'Player']))

  // Inbox shows delivered mail; reply marks read via read-all
  const coBox = await (await request.get(`${API}/messages`, { headers: H(co) })).json()
  expect(coBox.inbox.some((m: any) => m.fromEmail === emails.pl)).toBeTruthy()
  expect(coBox.sent.length).toBeGreaterThanOrEqual(2)
  const marked = await (await request.post(`${API}/messages/read-all`, { headers: H(co), data: {} })).json()
  expect(marked.ok).toBeTruthy()

  // A message send also queues an in-app notification for the recipient
  const saNotifs = await (await request.get(`${API}/notifications`, { headers: H(sa) })).json()
  expect(saNotifs.some((n: any) => String(n.subject || '').startsWith('New message from'))).toBeTruthy()
})

test('messages panel works in the dashboard UI', async ({ page, request }) => {
  const ts = Date.now()
  const saEmail = `sa.ui${ts}@t.local`
  const coEmail = `co.ui${ts}@t.local`
  // Seed a school admin + coach (no password hash -> any password works in dev)
  const sa = await tok(request, 'SchoolAdmin', ZONE, SCHOOL, saEmail)
  await request.post(`${API}/admins`, {
    headers: H(await tok(request, 'ZoneCoordinator', ZONE, undefined, `zc.ui${ts}@t.local`)),
    data: { name: 'Sindi', surname: `UI${ts}`, role: 'SchoolAdmin', zoneId: ZONE, schoolId: SCHOOL, email: saEmail },
  })
  await request.post(`${API}/coaches`, { headers: H(sa), data: { name: 'Anele', surname: `UI${ts}`, zoneId: ZONE, schoolId: SCHOOL, email: coEmail } })

  // Sign in as the coach through the UI
  await page.goto('http://localhost:5173/')
  const loginForm = page.locator('form:has(button:has-text("Sign In"))')
  await loginForm.getByLabel('Email').fill(coEmail)
  await loginForm.getByLabel('Password').fill('anything1')
  await loginForm.getByRole('button', { name: 'Sign In' }).click()
  await expect(page.getByTestId('messages-panel')).toBeVisible()

  // Compose to the school admin (must be offered as a recipient)
  await page.getByTestId('messages-toggle').click()
  const recipient = page.getByLabel('Message recipient')
  await expect(recipient.locator(`option[value="${saEmail}"]`)).toHaveCount(1)
  await recipient.selectOption(saEmail)
  await page.getByLabel('Message subject').fill('Match day')
  await page.getByLabel('Message body').fill('Please confirm the bus for Saturday.')
  await page.getByRole('button', { name: 'Send message' }).click()
  await expect(page.getByText('Message sent')).toBeVisible()
  await expect(page.getByText('Please confirm the bus for Saturday.')).toBeVisible() // sent tab

  // The school admin sees it in their inbox via the API
  const saBox = await (await request.get(`${API}/messages`, { headers: H(sa) })).json()
  expect(saBox.inbox.some((m: any) => m.fromEmail === coEmail && m.subject === 'Match day')).toBeTruthy()
})
