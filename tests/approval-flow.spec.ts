import { test, expect } from '@playwright/test'

async function login(request: any, role: string, zoneId?: string, schoolId?: string, email?: string) {
  const res = await request.post('http://localhost:4000/api/login', {
    data: { role, zoneId, schoolId, email },
    headers: { 'Content-Type': 'application/json' }
  })
  const body = await res.json()
  return body.token as string
}

test('Approval request stores previous/new and coach decision applies update', async ({ request }) => {
  test.setTimeout(120000)

  const sourceZoneId = '1'
  const sourceSchoolId = 'uitenhage-gammel-street'
  const uniq = Date.now()
  const email = `approval.${uniq}@example.com`
  const idNumber = `9901015019${String(uniq).slice(-3)}`

  const coachToken = await login(request, 'Coach', sourceZoneId, sourceSchoolId)
  const regRes = await request.post('http://localhost:4000/api/players/register', {
    headers: { Authorization: `Bearer ${coachToken}`, 'Content-Type': 'application/json' },
    data: { name: 'Approval', surname: 'Flow', idNumber, email, zoneId: sourceZoneId, schoolId: sourceSchoolId, contactNumber: '0641523562' }
  })
  expect(regRes.status()).toBe(200)
  const playerId = String((await regRes.json()).id)

  const playerToken = await login(request, 'Player', sourceZoneId, sourceSchoolId, email)
  const approvalRes = await request.post('http://localhost:4000/api/approvals', {
    headers: { Authorization: `Bearer ${playerToken}`, 'Content-Type': 'application/json' },
    data: {
      entityType: 'players',
      entityId: playerId,
      requestedChanges: [{ field: 'phone', previous: '0641523562', updated: '0845552000' }]
    }
  })
  expect(approvalRes.status()).toBe(200)
  const approvalId = String((await approvalRes.json()).id)

  const listRes = await request.get(`http://localhost:4000/api/approvals?entityType=players&entityId=${encodeURIComponent(playerId)}&status=pending&page=1&pageSize=10`, {
    headers: { Authorization: `Bearer ${coachToken}` }
  })
  expect(listRes.status()).toBe(200)
  const list = await listRes.json()
  expect(Array.isArray(list.rows)).toBeTruthy()
  const row = list.rows.find((r: any) => r.id === approvalId)
  expect(row).toBeTruthy()
  expect(row.requestedChanges[0].field).toBe('phone')
  expect(String(row.requestedChanges[0].previous)).toBe('0641523562')
  expect(String(row.requestedChanges[0].updated)).toBe('0845552000')

  const decisionRes = await request.post(`http://localhost:4000/api/approvals/${approvalId}/decision`, {
    headers: { Authorization: `Bearer ${coachToken}`, 'Content-Type': 'application/json' },
    data: { status: 'approved', notes: 'Verified via test' }
  })
  expect(decisionRes.status()).toBe(200)

  const playerAfter = await request.get(`http://localhost:4000/api/players/${playerId}`, {
    headers: { Authorization: `Bearer ${coachToken}` }
  })
  expect(playerAfter.status()).toBe(200)
  const p = await playerAfter.json()
  expect(String(p.contactNumber || '')).toBe('0845552000')

  const histRes = await request.get(`http://localhost:4000/api/players/${playerId}/history`, {
    headers: { Authorization: `Bearer ${coachToken}` }
  })
  expect(histRes.status()).toBe(200)
  const hist = await histRes.json()
  expect(Array.isArray(hist.audits)).toBeTruthy()
})

