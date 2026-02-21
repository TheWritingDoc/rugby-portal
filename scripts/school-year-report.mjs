const base = process.env.API_BASE || 'http://localhost:4000'
const schoolId = process.argv[2]
const yearA = Number(process.argv[3] || 2025)
const yearB = Number(process.argv[4] || 2026)

if (!schoolId) {
  console.error('Usage: node scripts/school-year-report.mjs <schoolId> [yearA] [yearB]')
  process.exit(2)
}

function inferYearFromTs(rawTs) {
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

function registrationYearOf(row, data, systemYear) {
  const direct = Number(data.registrationYear ?? data.registration_year ?? data.regYear ?? data.reg_year)
  if (Number.isFinite(direct) && direct > 2000) return direct
  const y1 = inferYearFromTs(data.registeredAt)
  if (y1) return y1
  const y2 = inferYearFromTs(row.createdAt ?? data.createdAt)
  if (y2) return y2
  const y3 = inferYearFromTs(row.ts ?? row.updatedAt ?? data.ts)
  if (y3) return y3
  return systemYear
}

function registeredAtOf(row, data) {
  const t = typeof data.registeredAt === 'number' ? data.registeredAt : Number(data.registeredAt || 0)
  if (Number.isFinite(t) && t > 0) return t
  const createdSource = (row.createdAt !== undefined && row.createdAt !== null)
    ? row.createdAt
    : data.createdAt
  const c = typeof createdSource === 'number' ? createdSource : Number(createdSource || 0)
  if (Number.isFinite(c) && c > 0) return c
  const tsSource = (row.ts !== undefined && row.ts !== null)
    ? row.ts
    : (row.updatedAt !== undefined && row.updatedAt !== null)
      ? row.updatedAt
      : data.ts
  const u = typeof tsSource === 'number' ? tsSource : Number(tsSource || 0)
  return Number.isFinite(u) && u > 0 ? u : 0
}

function identityKey(row, data) {
  const email = String(data.email ?? row.email ?? '').trim().toLowerCase()
  if (email) return `email:${email}`
  const idNumber = String(data.idNumber ?? row.idNumber ?? '').trim().toLowerCase()
  if (idNumber) return `id:${idNumber}`
  const serverId = String(data.serverId ?? '').trim().toLowerCase()
  if (serverId) return `sid:${serverId}`
  const name = String(data.name ?? row.name ?? '').trim().toLowerCase()
  const surname = String(data.surname ?? row.surname ?? '').trim().toLowerCase()
  const dob = String(data.dateOfBirth ?? row.dateOfBirth ?? data.dob ?? '').trim().toLowerCase()
  const composite = [name, surname, dob].filter(Boolean).join('|')
  return composite ? `n:${composite}` : `rid:${String(row.id || '')}`
}

async function main() {
  const loginRes = await fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'EPHSRUAdmin' })
  })
  const { token } = await loginRes.json()

  const playersRes = await fetch(`${base}/api/players`, { headers: { Authorization: `Bearer ${token}` } })
  const rows = await playersRes.json()

  const systemYear = new Date().getFullYear()
  const anchors = new Map()

  for (const row of Array.isArray(rows) ? rows : []) {
    let data = {}
    try { data = typeof row.data === 'string' ? JSON.parse(row.data || '{}') : (row.data || {}) } catch { data = {} }
    const rowSchool = String(data.schoolId ?? row.schoolId ?? '')
    if (rowSchool !== schoolId) continue
    const k = identityKey(row, data)
    const ry = registrationYearOf(row, data, systemYear)
    const rt = registeredAtOf(row, data)

    const prev = anchors.get(k)
    if (!prev || ry < prev.ry || (ry === prev.ry && rt && prev.rt && rt < prev.rt)) {
      anchors.set(k, { k, ry, rt })
    }
  }

  const asOf = (y) => {
    const set = new Set()
    for (const a of anchors.values()) {
      if (a.ry <= y) set.add(a.k)
    }
    return set
  }

  const setA = asOf(yearA)
  const setB = asOf(yearB)
  const newInB = [...setB].filter((k) => !setA.has(k)).length

  const out = {
    schoolId,
    yearA,
    yearB,
    uniqueAsOfYearA: setA.size,
    uniqueAsOfYearB: setB.size,
    newRegistrationsInYearB: newInB
  }
  console.log(JSON.stringify(out, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

