import { test, expect, request } from '@playwright/test'

const API = 'http://localhost:4000/api'

async function apiLogin(req: request.APIRequestContext, role: string, zoneId?: string, schoolId?: string, email?: string) {
  const res = await req.post(`${API}/login`, { data: { role, zoneId, schoolId, email } })
  expect(res.ok()).toBeTruthy()
  return (await res.json()).token as string
}

async function authPost(req: request.APIRequestContext, token: string, path: string, body: any) {
  return req.post(`${API}/${path}`, { data: body, headers: { Authorization: `Bearer ${token}` } })
}

async function authPut(req: request.APIRequestContext, token: string, path: string, body: any) {
  return req.put(`${API}/${path}`, { data: body, headers: { Authorization: `Bearer ${token}` } })
}

async function authGet(req: request.APIRequestContext, token: string, path: string) {
  return req.get(`${API}/${path}`, { headers: { Authorization: `Bearer ${token}` } })
}

test.describe.configure({ mode: 'serial' })

test.describe('Full system lifecycle', () => {
  test.setTimeout(120000)

  const ts = Date.now()
  const zoneId = `FSZ-${ts}`
  const schoolA = `FSA-${ts}`
  const schoolB = `FSB-${ts}`
  const saEmail = `fs.sa.${ts}@test.local`
  const coachAEmail = `fs.coach.a.${ts}@test.local`
  const coachBEmail = `fs.coach.b.${ts}@test.local`
  const refEmail = `fs.ref.${ts}@test.local`
  const playerEmail = `fs.player.${ts}@test.local`
  let adminToken = ''
  let playerId = ''
  let coachAId = ''
  let coachBId = ''

  test('1. EPHSRU admin creates schools and every user type', async ({ request }) => {
    adminToken = await apiLogin(request, 'EPHSRUAdmin')

    for (const [sid, name] of [[schoolA, 'Full System A'], [schoolB, 'Full System B']] as const) {
      const r = await authPost(request, adminToken, 'schools', { name, zoneId, schoolId: sid, address: 'Test Rd', contactNumber: '+27000000', email: `${sid}@test.local` })
      expect(r.ok()).toBeTruthy()
    }

    const sa = await authPost(request, adminToken, 'admins', { name: 'Sys', surname: 'Admin', email: saEmail, role: 'SchoolAdmin', zoneId, schoolId: schoolA, contactNumber: '+27000001' })
    expect(sa.ok()).toBeTruthy()

    const ca = await authPost(request, adminToken, 'coaches', { name: 'Coach', surname: 'Alpha', email: coachAEmail, zoneId, schoolId: schoolA, contactNumber: '+27000002', team: 'U16' })
    expect(ca.ok()).toBeTruthy()
    coachAId = (await ca.json()).id

    const cb = await authPost(request, adminToken, 'coaches', { name: 'Coach', surname: 'Beta', email: coachBEmail, zoneId, schoolId: schoolA, contactNumber: '+27000003', team: 'U15' })
    expect(cb.ok()).toBeTruthy()
    coachBId = (await cb.json()).id

    const rf = await authPost(request, adminToken, 'referees', { name: 'Sys', surname: 'Referee', email: refEmail, zoneId, contactNumber: '+27000004' })
    expect(rf.ok()).toBeTruthy()

    const pl = await authPost(request, adminToken, 'players', { name: 'Sys', surname: 'Player', email: playerEmail, zoneId, schoolId: schoolA, ageGroup: 'U16', contactNumber: '+27000005', idNumber: `90010150${String(ts).slice(-5)}` })
    expect(pl.ok()).toBeTruthy()
    playerId = (await pl.json()).id
  })

  test('2. Each role logs in and sees only its scope', async ({ request }) => {
    const saToken = await apiLogin(request, 'SchoolAdmin', zoneId, schoolA, saEmail)
    const saPlayers = await (await authGet(request, saToken, 'players')).json()
    expect(saPlayers.some((p: any) => p.id === playerId)).toBeTruthy()
    expect(saPlayers.every((p: any) => String(p.schoolId) === schoolA)).toBeTruthy()

    const coachToken = await apiLogin(request, 'Coach', zoneId, schoolA, coachAEmail)
    const coachPlayers = await (await authGet(request, coachToken, 'players')).json()
    expect(coachPlayers.some((p: any) => p.id === playerId)).toBeTruthy()

    const playerToken = await apiLogin(request, 'Player', zoneId, schoolA, playerEmail)
    const own = await (await authGet(request, playerToken, 'players')).json()
    expect(own.length).toBe(1)
    expect(own[0].id).toBe(playerId)
  })

  test('3. Editing user details (own scope allowed, foreign scope denied)', async ({ request }) => {
    const saToken = await apiLogin(request, 'SchoolAdmin', zoneId, schoolA, saEmail)
    const upd = await authPut(request, saToken, `players/${playerId}`, { position: 'Flyhalf', contactNumber: '+27999999', schoolId: schoolA, zoneId })
    expect(upd.ok()).toBeTruthy()
    const after = await (await authGet(request, saToken, `players/${playerId}`)).json()
    const afterData = typeof after.data === 'string' ? JSON.parse(after.data || '{}') : (after.data || {})
    expect(String(afterData.position || '')).toBe('Flyhalf')
    expect(String(after.contactNumber || '')).toBe('+27999999')

    // A school admin of school B must not be able to edit school A's player
    const sbEmail = `fs.sb.${ts}@test.local`
    await authPost(request, adminToken || (adminToken = await apiLogin(request, 'EPHSRUAdmin')), 'admins', { name: 'Other', surname: 'Admin', email: sbEmail, role: 'SchoolAdmin', zoneId, schoolId: schoolB, contactNumber: '+27000006' })
    const sbToken = await apiLogin(request, 'SchoolAdmin', zoneId, schoolB, sbEmail)
    const denied = await authPut(request, sbToken, `players/${playerId}`, { position: 'Hooker' })
    expect(denied.status()).toBe(403)
  })

  test('4. Player changes schools via migration request + approval', async ({ request }) => {
    const coachToken = await apiLogin(request, 'Coach', zoneId, schoolA, coachAEmail)
    const reqRes = await authPost(request, coachToken, `players/${playerId}/migrate`, { toSchoolId: schoolB, reason: 'Family moved' })
    expect(reqRes.ok()).toBeTruthy()
    const { requestId } = await reqRes.json()

    // Receiving school's admin accepts the transfer
    const sbEmail = `fs.sb.${ts}@test.local`
    const sbToken = await apiLogin(request, 'SchoolAdmin', zoneId, schoolB, sbEmail)
    const dec = await authPost(request, sbToken, `migration-requests/${requestId}/decision`, { status: 'accepted', reason: 'Welcome' })
    expect(dec.ok()).toBeTruthy()

    adminToken = adminToken || await apiLogin(request, 'EPHSRUAdmin')
    const moved = await (await authGet(request, adminToken, `players/${playerId}`)).json()
    expect(String(moved.schoolId)).toBe(schoolB)
  })

  test('5. Swapping coaches between teams', async ({ request }) => {
    const saToken = await apiLogin(request, 'SchoolAdmin', zoneId, schoolA, saEmail)
    const r1 = await authPut(request, saToken, `coaches/${coachAId}`, { team: 'U15', schoolId: schoolA, zoneId })
    expect(r1.ok()).toBeTruthy()
    const r2 = await authPut(request, saToken, `coaches/${coachBId}`, { team: 'U16', schoolId: schoolA, zoneId })
    expect(r2.ok()).toBeTruthy()

    const coaches = await (await authGet(request, saToken, 'coaches')).json()
    const teamOf = (c: any) => {
      const d = typeof c?.data === 'string' ? JSON.parse(c.data || '{}') : (c?.data || {})
      return String(d.team || '')
    }
    const a = coaches.find((c: any) => c.id === coachAId)
    const b = coaches.find((c: any) => c.id === coachBId)
    expect(teamOf(a)).toBe('U15')
    expect(teamOf(b)).toBe('U16')
  })

  test('6. Replacing a school admin', async ({ request }) => {
    adminToken = adminToken || await apiLogin(request, 'EPHSRUAdmin')
    const newSaEmail = `fs.sa.new.${ts}@test.local`
    const created = await authPost(request, adminToken, 'admins', { name: 'New', surname: 'Admin', email: newSaEmail, role: 'SchoolAdmin', zoneId, schoolId: schoolA, contactNumber: '+27000007' })
    expect(created.ok()).toBeTruthy()

    // New admin can immediately work in their school
    const newToken = await apiLogin(request, 'SchoolAdmin', zoneId, schoolA, newSaEmail)
    const list = await (await authGet(request, newToken, 'coaches')).json()
    expect(Array.isArray(list)).toBeTruthy()
    expect(list.every((c: any) => String(c.schoolId) === schoolA)).toBeTruthy()
  })
})
