import { test, expect } from '@playwright/test'

function parseDataField(v: any) {
  if (!v) return {}
  if (typeof v === 'object') return v
  if (typeof v === 'string') {
    try { return JSON.parse(v || '{}') } catch { return {} }
  }
  return {}
}

async function login(request: any, role: string, zoneId?: string, schoolId?: string, email?: string) {
  const res = await request.post('http://localhost:4000/api/login', {
    data: { role, zoneId, schoolId, email },
    headers: { 'Content-Type': 'application/json' }
  })
  const body = await res.json()
  return body.token as string
}

test('Player migration preserves data and logs history (Gammel Street -> Hillside)', async ({ request }) => {
  test.setTimeout(120000)

  const sourceZoneId = '1'
  const sourceSchoolId = 'uitenhage-gammel-street'

  const adminToken = await login(request, 'EPHSRUAdmin')
  const coachTokenAtSource = await login(request, 'Coach', sourceZoneId, sourceSchoolId)

  const schoolsRes = await request.get('http://localhost:4000/api/schools', {
    headers: { Authorization: `Bearer ${adminToken}` }
  })
  const schools = await schoolsRes.json()
  const hillside = (Array.isArray(schools) ? schools : []).find((s: any) => {
    const sid = String(s.schoolId || '').toLowerCase()
    const d = parseDataField(s.data)
    const nm = String(d.name || '').toLowerCase()
    return sid.includes('hillside') || nm === 'hillside' || nm.includes('hillside')
  })
  expect(hillside, 'Hillside school must exist in schools list').toBeTruthy()

  const hillsideSchoolId = String(hillside.schoolId)
  const hillsideZoneId = String(hillside.zoneId)

  const uniq = Date.now()
  const idNumber = `9901015009${String(uniq).slice(-3)}`
  const payload = {
    name: 'Migration',
    surname: 'Test',
    idNumber,
    email: `migration.${uniq}@example.com`,
    contactNumber: '0820000000',
    zoneId: sourceZoneId,
    schoolId: sourceSchoolId,
    gender: 'Male',
    ageGroup: 'U15'
  }

  const registerRes = await request.post('http://localhost:4000/api/players/register', {
    headers: { Authorization: `Bearer ${coachTokenAtSource}`, 'Content-Type': 'application/json' },
    data: payload
  })
  expect(registerRes.status(), 'registration should succeed').toBe(200)
  const registered = await registerRes.json()
  const playerId = String(registered.id)
  expect(playerId).toBeTruthy()

  const playerBeforeRes = await request.get(`http://localhost:4000/api/players/${playerId}`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  })
  expect(playerBeforeRes.status()).toBe(200)
  const playerBefore = await playerBeforeRes.json()
  const beforeData = parseDataField(playerBefore.data)
  expect(String(playerBefore.schoolId)).toBe(sourceSchoolId)
  expect(String(beforeData.initialSchoolId)).toBe(sourceSchoolId)
  expect(String(beforeData.currentSchoolId)).toBe(sourceSchoolId)
  expect(String(beforeData.idNumber || '')).toBe(idNumber)

  const coachOtherToken = await login(request, 'Coach', hillsideZoneId, hillsideSchoolId)
  const forbiddenRes = await request.post(`http://localhost:4000/api/players/${playerId}/migrate`, {
    headers: { Authorization: `Bearer ${coachOtherToken}`, 'Content-Type': 'application/json' },
    data: { toSchoolId: hillsideSchoolId, reason: 'unauthorized attempt' }
  })
  expect(forbiddenRes.status(), 'coach at other school must be forbidden').toBe(403)

  const forbiddenPut = await request.put(`http://localhost:4000/api/players/${playerId}`, {
    headers: { Authorization: `Bearer ${coachOtherToken}`, 'Content-Type': 'application/json' },
    data: { team: 'U16' }
  })
  expect(forbiddenPut.status(), 'coach at other school must not update player').toBe(403)

  const playerToken = await login(request, 'Player', sourceZoneId, sourceSchoolId, payload.email)
  const migrateRes = await request.post(`http://localhost:4000/api/players/${playerId}/migrate`, {
    headers: { Authorization: `Bearer ${playerToken}`, 'Content-Type': 'application/json' },
    data: { toSchoolId: hillsideSchoolId, reason: 'self transfer' }
  })
  expect(migrateRes.status(), 'migration request should succeed for the player record owner').toBe(200)
  const migrated = await migrateRes.json()
  expect(String(migrated.requestId || '')).toBeTruthy()
  expect(String(migrated.status || '')).toBe('pending')

  // Migration is a request + approval flow: EPHSRU admin accepts the transfer
  const decisionRes = await request.post(`http://localhost:4000/api/migration-requests/${migrated.requestId}/decision`, {
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    data: { status: 'accepted', reason: 'approved by test' }
  })
  expect(decisionRes.status(), 'migration approval should succeed').toBe(200)
  const decided = await decisionRes.json()
  expect(String(decided.migrationId || '')).toBeTruthy()

  const playerAfterRes = await request.get(`http://localhost:4000/api/players/${playerId}`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  })
  expect(playerAfterRes.status()).toBe(200)
  const playerAfter = await playerAfterRes.json()
  const afterData = parseDataField(playerAfter.data)

  expect(String(playerAfter.schoolId)).toBe(hillsideSchoolId)
  expect(String(playerAfter.zoneId)).toBe(hillsideZoneId)
  expect(String(afterData.currentSchoolId)).toBe(hillsideSchoolId)
  expect(String(afterData.currentZoneId)).toBe(hillsideZoneId)

  expect(String(playerAfter.name)).toBe(payload.name)
  expect(String(playerAfter.surname)).toBe(payload.surname)
  expect(String(playerAfter.email)).toBe(payload.email)
  expect(String(playerAfter.idNumber)).toBe(idNumber)
  // Migration re-registers the player at the new school but preserves the original date
  expect(String(afterData.originalRegisteredAt)).toBe(String(beforeData.registeredAt))
  expect(Number(afterData.registeredAt)).toBeGreaterThanOrEqual(Number(beforeData.registeredAt))
  expect(String(afterData.initialSchoolId)).toBe(sourceSchoolId)
  expect(String(afterData.initialZoneId)).toBe(sourceZoneId)

  const lookupRes = await request.get(`http://localhost:4000/api/players/lookup?idNumber=${encodeURIComponent(idNumber)}`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  })
  expect(lookupRes.status()).toBe(200)
  const lookup = await lookupRes.json()
  expect(Array.isArray(lookup.migrations)).toBeTruthy()
  expect(lookup.migrations.length, 'migration history should contain at least 1 record').toBeGreaterThanOrEqual(1)
  const first = lookup.migrations[0]
  expect(String(first.fromSchoolId)).toBe(sourceSchoolId)
  expect(String(first.toSchoolId)).toBe(hillsideSchoolId)
  expect(Number(first.migrationDate)).toBeGreaterThan(0)
})
