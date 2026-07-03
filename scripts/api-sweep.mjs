// Full API route sweep: exercises every endpoint with realistic role tokens
// and asserts the expected status. Run with both servers up:
//   node scripts/api-sweep.mjs
// Exits non-zero if any check fails.
const API = 'http://localhost:4000/api'
const ts = Date.now()
const ZONE = '1'
const SCHOOL = 'uitenhage-gammel-street'
const SCHOOL_B = 'uitenhage-mccarthy'

const results = []
let tokens = {}

async function req(method, path, { token, body, form } = {}) {
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  let payload
  if (form) {
    payload = form
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }
  const res = await fetch(`${API}${path}`, { method, headers, body: payload })
  let data = null
  try { data = await res.json() } catch {}
  return { status: res.status, data }
}

function check(name, actual, expected) {
  const ok = Array.isArray(expected) ? expected.includes(actual) : actual === expected
  results.push({ name, actual, expected, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${String(actual).padEnd(4)} (want ${expected})  ${name}`)
  return ok
}

async function tok(role, zoneId, schoolId, email) {
  const r = await req('POST', '/login', { body: { role, zoneId, schoolId, email } })
  return r.data?.token || ''
}

const emails = {
  ep: `sweep.ep.${ts}@t.local`,
  zc: `sweep.zc.${ts}@t.local`,
  sa: `sweep.sa.${ts}@t.local`,
  coach: `sweep.co.${ts}@t.local`,
  ref: `sweep.ref.${ts}@t.local`,
  player: `sweep.pl.${ts}@t.local`,
  selfreg: `sweep.self.${ts}@t.local`,
}

// ---------------------------------------------------------------- auth
tokens.ep = await tok('EPHSRUAdmin', undefined, undefined, emails.ep)
check('POST /login (dev role token)', tokens.ep ? 200 : 0, 200)

let r = await req('POST', '/auth/login', { body: { email: 'precisioncode.sa@gmail.com', password: 'PASSword@123' } })
check('POST /auth/login (bcrypt)', r.status, 200)
r = await req('POST', '/auth/login', { body: { email: 'precisioncode.sa@gmail.com', password: 'nope' } })
check('POST /auth/login wrong pw', r.status, 401)
r = await req('POST', '/auth/oauth', { body: { provider: 'google' } })
check('POST /auth/oauth no credential', r.status, 400)
r = await req('GET', '/identify?email=' + encodeURIComponent('precisioncode.sa@gmail.com'))
check('GET /identify', r.status, [200, 404])

// ------------------------------------------------- hierarchy seed chain
r = await req('POST', '/admins', { token: tokens.ep, body: { name: 'Zee', surname: `Sweep${ts}`, role: 'ZoneCoordinator', zoneId: ZONE, email: emails.zc } })
check('POST /admins (EP→ZC)', r.status, 200)
tokens.zc = await tok('ZoneCoordinator', ZONE, undefined, emails.zc)

r = await req('POST', '/schools', { token: tokens.zc, body: { zoneId: ZONE, schoolId: `sweep-school-${ts}`, address: '1 Sweep St', contactNumber: '+27410000001', email: `school.${ts}@t.local` } })
check('POST /schools (ZC)', r.status, 200)

r = await req('POST', '/admins', { token: tokens.zc, body: { name: 'Sam', surname: `Sweep${ts}`, role: 'SchoolAdmin', zoneId: ZONE, schoolId: SCHOOL, email: emails.sa } })
check('POST /admins (ZC→SA)', r.status, 200)
tokens.sa = await tok('SchoolAdmin', ZONE, SCHOOL, emails.sa)

r = await req('POST', '/coaches', { token: tokens.sa, body: { name: 'Cee', surname: `Sweep${ts}`, zoneId: ZONE, schoolId: SCHOOL, email: emails.coach, qualifications: 'Level 2' } })
check('POST /coaches (SA)', r.status, 200)
tokens.coach = await tok('Coach', ZONE, SCHOOL, emails.coach)

r = await req('POST', '/referees', { token: tokens.sa, body: { name: 'Ref', surname: `Sweep${ts}`, zoneId: ZONE, schoolId: SCHOOL, email: emails.ref, qualifications: 'Provincial' } })
check('POST /referees (SA)', r.status, 200)
tokens.ref = await tok('Referee', ZONE, SCHOOL, emails.ref)

r = await req('POST', '/players', { token: tokens.coach, body: { name: 'Pee', surname: `Sweep${ts}`, zoneId: ZONE, schoolId: SCHOOL, email: emails.player, ageGroup: 'U16', gender: 'Male', dateOfBirth: '2010-01-01' } })
check('POST /players (coach, trusted)', r.status, 200)
const playerId = r.data?.id
tokens.player = await tok('Player', ZONE, SCHOOL, emails.player)

// Registration always happens with a Player session (the form logs in first) and requires an ID number
tokens.selfreg = await tok('Player', ZONE, SCHOOL, emails.selfreg)
r = await req('POST', '/players/register', { token: tokens.selfreg, body: { name: 'Self', surname: `Sweep${ts}`, idNumber: `SW${ts}`, zoneId: ZONE, schoolId: SCHOOL, email: emails.selfreg, ageGroup: 'U16', gender: 'Male' } })
check('POST /players/register (pending)', r.status, 200)
const selfId = r.data?.id

// ----------------------------------------------------------- reads
for (const [name, path, token] of [
  ['GET /schools (EP)', '/schools', tokens.ep],
  ['GET /schools/catalog (player)', '/schools/catalog', tokens.player],
  ['GET /players (coach)', '/players', tokens.coach],
  ['GET /coaches (SA)', '/coaches', tokens.sa],
  ['GET /referees (ZC)', '/referees', tokens.zc],
  ['GET /admins (EP)', '/admins', tokens.ep],
  ['GET /audits (EP)', '/audits', tokens.ep],
  ['GET /pending (coach)', '/pending', tokens.coach],
]) {
  r = await req('GET', path, { token })
  check(name, r.status, 200)
}

r = await req('GET', `/players/${playerId}`, { token: tokens.coach })
check('GET /players/:id', r.status, 200)
r = await req('GET', `/players/lookup?idNumber=none-${ts}`, { token: tokens.coach })
check('GET /players/lookup', r.status, [200, 404])
r = await req('GET', `/players/${playerId}/history`, { token: tokens.coach })
check('GET /players/:id/history', r.status, 200)

// ----------------------------------------------------------- updates
r = await req('PUT', `/players/${playerId}`, { token: tokens.coach, body: { position: 'Wing', jerseyNumber: '11' } })
check('PUT /players/:id (coach)', r.status, 200)
r = await req('PUT', `/schools/${SCHOOL}`, { token: tokens.sa, body: { schoolId: SCHOOL, zoneId: ZONE, address: '2 Sweep Ave' } })
check('PUT /schools/:id (SA)', r.status, [200, 404])

// coach update/delete on a throwaway coach
r = await req('POST', '/coaches', { token: tokens.sa, body: { name: 'Tmp', surname: `Del${ts}`, zoneId: ZONE, schoolId: SCHOOL, email: `sweep.del.${ts}@t.local` } })
const tmpCoachId = r.data?.id
r = await req('PUT', `/coaches/${tmpCoachId}`, { token: tokens.sa, body: { qualifications: 'Level 1' } })
check('PUT /coaches/:id (SA)', r.status, 200)
r = await req('DELETE', `/coaches/${tmpCoachId}`, { token: tokens.sa })
check('DELETE /coaches/:id (SA)', r.status, 200)

// referee + admin updates
r = await req('GET', '/referees', { token: tokens.ep })
const refRow = (r.data || []).find((x) => (x.email || '') === emails.ref)
r = await req('PUT', `/referees/${refRow?.id}`, { token: tokens.ep, body: { qualifications: 'National Panel' } })
check('PUT /referees/:id (EP)', r.status, 200)
r = await req('GET', '/admins', { token: tokens.ep })
const saRow = (r.data || []).find((x) => (x.email || '') === emails.sa)
r = await req('PUT', `/admins/${saRow?.id}`, { token: tokens.ep, body: { contactNumber: '+27820009999' } })
check('PUT /admins/:id (EP)', r.status, 200)

// ------------------------------------------------- review + decisions
r = await req('POST', `/players/${selfId}/approve`, { token: tokens.coach })
check('POST /players/:id/approve', r.status, 200)
const regAs = async (label) => {
  const em = `sweep.${label}.${ts}@t.local`
  const t = await tok('Player', ZONE, SCHOOL, em)
  const rr = await req('POST', '/players/register', { token: t, body: { name: label, surname: `Sweep${ts}`, idNumber: `SW${label}${ts}`, zoneId: ZONE, schoolId: SCHOOL, email: em } })
  return rr.data?.id
}
const rejId = await regAs('rej')
r = await req('POST', `/players/${rejId}/reject`, { token: tokens.coach, body: { reason: 'sweep test' } })
check('POST /players/:id/reject', r.status, 200)
const bulkId = await regAs('bulk')
r = await req('POST', '/players/bulk-approve', { token: tokens.sa, body: { playerIds: [bulkId] } })
check('POST /players/bulk-approve', r.status, 200)

// approvals (profile-change request + decision)
r = await req('POST', '/approvals', { token: tokens.player, body: { entityType: 'players', entityId: playerId, requestedChanges: [{ field: 'phone', previous: '', updated: '0845550000' }] } })
check('POST /approvals (player)', r.status, 200)
const approvalId = r.data?.id
r = await req('GET', '/approvals', { token: tokens.coach })
check('GET /approvals (coach)', r.status, 200)
r = await req('POST', `/approvals/${approvalId}/decision`, { token: tokens.coach, body: { status: 'approved', notes: 'sweep' } })
check('POST /approvals/:id/decision', r.status, 200)

// migration request + decision
r = await req('POST', `/players/${playerId}/migrate`, { token: tokens.player, body: { toSchoolId: SCHOOL_B, reason: 'sweep transfer' } })
check('POST /players/:id/migrate', r.status, 200)
const requestId = r.data?.requestId
r = await req('GET', '/migration-requests', { token: tokens.ep })
check('GET /migration-requests', r.status, 200)
r = await req('GET', `/migration-requests/${requestId}`, { token: tokens.ep })
check('GET /migration-requests/:id', r.status, 200)
r = await req('POST', `/migration-requests/${requestId}/decision`, { token: tokens.ep, body: { status: 'accepted', reason: 'sweep ok' } })
check('POST /migration-requests/:id/decision', r.status, 200)

// season rollover (needs a past-season player)
r = await req('POST', '/players', { token: tokens.coach, body: { name: 'Old', surname: `Sweep${ts}`, zoneId: ZONE, schoolId: SCHOOL, email: `sweep.old.${ts}@t.local`, ageGroup: 'U15', registrationYear: new Date().getFullYear() - 1 } })
const oldId = r.data?.id
r = await req('POST', '/players/bulk-reregister', { token: tokens.coach, body: { playerIds: [oldId] } })
check('POST /players/bulk-reregister', r.status, 200)

// ------------------------------------------------------ uploads + docs
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
const form = new FormData()
form.append('file', new Blob([png], { type: 'image/png' }), 'sweep.png')
r = await req('POST', '/upload', { token: tokens.coach, form })
check('POST /upload', r.status, 200)
const fileUrl = r.data?.url || '/uploads/sweep.png'

// Use the self-registered player (still at SCHOOL — playerId migrated to SCHOOL_B
// above, so the Gammel Street admin is rightly out of scope for their docs)
r = await req('POST', '/documents', { token: tokens.selfreg, body: { ownerType: 'players', ownerId: selfId, fileName: 'sweep.png', fileUrl } })
check('POST /documents', r.status, 200)
const docId = r.data?.id
r = await req('GET', '/documents', { token: tokens.selfreg })
check('GET /documents (owner)', r.status, 200)
r = await req('POST', `/documents/${docId}/approve`, { token: tokens.sa })
check('POST /documents/:id/approve', r.status, 200)
r = await req('POST', '/documents', { token: tokens.selfreg, body: { ownerType: 'players', ownerId: selfId, fileName: 'sweep2.png', fileUrl } })
r = await req('POST', `/documents/${r.data?.id}/reject`, { token: tokens.sa })
check('POST /documents/:id/reject', r.status, 200)
// Cross-school admin must NOT be able to decide this school's documents
r = await req('POST', '/documents', { token: tokens.selfreg, body: { ownerType: 'players', ownerId: selfId, fileName: 'sweep3.png', fileUrl } })
const docId3 = r.data?.id
tokens.saB = await tok('SchoolAdmin', ZONE, SCHOOL_B, `sweep.sab.${ts}@t.local`)
r = await req('POST', `/documents/${docId3}/approve`, { token: tokens.saB })
check('POST /documents/:id/approve cross-school (403)', r.status, 403)

// -------------------------------------------- notifications + messages
r = await req('GET', '/notifications', { token: tokens.player })
check('GET /notifications', r.status, 200)
r = await req('POST', '/notifications/read-all', { token: tokens.player })
check('POST /notifications/read-all', r.status, 200)
r = await req('GET', '/messages/recipients', { token: tokens.coach })
check('GET /messages/recipients', r.status, 200)
r = await req('POST', '/messages', { token: tokens.coach, body: { toEmail: emails.sa, subject: 'sweep', body: 'hello chain' } })
check('POST /messages (in scope)', r.status, 200)
r = await req('POST', '/messages', { token: tokens.player, body: { toEmail: emails.ep, subject: 'x', body: 'skip chain' } })
check('POST /messages (out of scope)', r.status, 403)
r = await req('GET', '/messages', { token: tokens.sa })
check('GET /messages', r.status, 200)
r = await req('POST', '/messages/read-all', { token: tokens.sa })
check('POST /messages/read-all', r.status, 200)

// -------------------------------------------- password reset round trip
r = await req('POST', '/auth/forgot', { body: { email: emails.sa } })
check('POST /auth/forgot', r.status, 200)
const resetToken = r.data?.token
if (resetToken) {
  r = await req('POST', '/auth/reset', { body: { token: resetToken, password: 'NewSweep!234' } })
  check('POST /auth/reset', r.status, 200)
  r = await req('POST', '/auth/login', { body: { email: emails.sa, password: 'NewSweep!234' } })
  check('POST /auth/login after reset', r.status, 200)
} else {
  check('POST /auth/reset (no dev token returned)', 0, 200)
}

// ------------------------------------------------ negative permission spot-checks
r = await req('POST', '/admins', { token: tokens.sa, body: { name: 'No', surname: 'Esc', role: 'SchoolAdmin', zoneId: ZONE, schoolId: SCHOOL, email: `sweep.esc.${ts}@t.local` } })
check('POST /admins (SA blocked)', r.status, 403)
r = await req('GET', '/players', { token: '' })
check('GET /players unauthenticated returns nothing', Array.isArray(r.data) && r.data.length === 0 ? 200 : 999, 200)
r = await req('DELETE', `/coaches/nonexistent-${ts}`, { token: tokens.sa })
check('DELETE /coaches/:id missing', r.status, 404)

// ---------------------------------------------------------------- report
const failed = results.filter((x) => !x.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length) {
  console.log('FAILURES:')
  for (const f of failed) console.log(`  ${f.name}: got ${f.actual}, want ${f.expected}`)
  process.exit(1)
}
