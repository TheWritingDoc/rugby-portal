import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import { sign, verifyToken } from './auth.js'
import multer from 'multer'

const app = express()
app.use(cors())
app.use(express.json({ limit: '2mb' }))
app.use(verifyToken)

const dbPath = path.join(process.cwd(), 'server', 'data', 'db.json')
function ensureDb() {
  if (!fs.existsSync(path.dirname(dbPath))) fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  if (!fs.existsSync(dbPath)) fs.writeFileSync(dbPath, JSON.stringify({ schools: [], players: [], coaches: [], referees: [], admins: [], audits: [], documents: [] }))
}
function readDb() {
  ensureDb()
  const raw = fs.readFileSync(dbPath, 'utf-8')
  return JSON.parse(raw)
}
function writeDb(db) {
  fs.writeFileSync(dbPath, JSON.stringify(db))
}

function addEntity(type, data) {
  const db = readDb()
  const id = crypto.randomUUID()
  const ts = Date.now()
  db[type].push({ id, type, data, ts })
  writeDb(db)
  return { id, ts }
}

function updateEntity(type, id, data, user) {
  const db = readDb()
  const index = db[type].findIndex((x) => x.id === id)
  if (index === -1) return null
  const before = db[type][index].data
  db[type][index] = { ...db[type][index], data: { ...before, ...data }, ts: Date.now() }
  writeDb(db)
  addAuditLog(type.slice(0, -1).charAt(0).toUpperCase() + type.slice(0, -1).slice(1), user, before, data)
  return db[type][index]
}

function listEntity(type, query) {
  const db = readDb()
  let list = db[type] || []
  if (query.zoneId) list = list.filter((x) => String(x.data.zoneId ?? '') === String(query.zoneId))
  if (query.schoolId) list = list.filter((x) => String(x.data.schoolId ?? '') === String(query.schoolId))
  return list
}

function allowPost(type, role) {
  if (!role) return false
  if (role === 'EPHSRUAdmin') return true
  if (type === 'players' && (role === 'Coach' || role === 'SchoolAdmin')) return true
  if (type === 'coaches' && role === 'SchoolAdmin') return true
  if (type === 'referees' && role === 'EPHSRUAdmin') return true
  if (type === 'schools' && role === 'SchoolAdmin') return true
  if (type === 'admins' && role === 'EPHSRUAdmin') return true
  return false
}

function allowUpdate(type, role, user, entity) {
  if (!role) return false
  if (role === 'EPHSRUAdmin') return true
  if (type === 'players' && (role === 'Coach' || role === 'SchoolAdmin')) {
    return String(entity.data.schoolId ?? '') === String(user.schoolId ?? '')
  }
  if (type === 'coaches' && role === 'SchoolAdmin') {
    return String(entity.data.schoolId ?? '') === String(user.schoolId ?? '')
  }
  if (type === 'schools' && role === 'SchoolAdmin') {
    return String(entity.data.id ?? '') === String(user.schoolId ?? '')
  }
  return false
}

function withinScope(type, user, data) {
  if (!user) return false
  const role = user.role
  if (role === 'EPHSRUAdmin') return true
  if (role === 'SchoolAdmin') {
    if (type === 'players' || type === 'coaches' || type === 'schools') {
      return String(data.schoolId ?? '') === String(user.schoolId ?? '')
    }
  }
  if (role === 'Coach') {
    if (type === 'players') return String(data.schoolId ?? '') === String(user.schoolId ?? '')
    return false
  }
  return false
}

function filterByRole(type, list, user) {
  const role = user?.role
  if (!role) return []
  if (role === 'EPHSRUAdmin') return list
  if (role === 'ZoneCoordinator') return list.filter((x) => String(x.data.zoneId ?? '') === String(user.zoneId ?? ''))
  if (role === 'SchoolAdmin' || role === 'Coach') return list.filter((x) => String(x.data.schoolId ?? '') === String(user.schoolId ?? ''))
  return []
}

function addAuditLog(entity, user, before, after) {
  const db = readDb()
  db.audits.push({ id: crypto.randomUUID(), userRole: user?.role ?? 'Unknown', entity, action: before ? 'update' : 'create', before, after, ts: Date.now() })
  writeDb(db)
}

app.post('/api/schools', (req, res) => {
  if (!allowPost('schools', req.user?.role)) return res.status(403).json({ error: 'forbidden' })
  if (!withinScope('schools', req.user, req.body)) return res.status(403).json({ error: 'scope' })
  const result = addEntity('schools', req.body)
  addAuditLog('School', req.user, null, req.body)
  res.json(result)
})
app.get('/api/schools', (req, res) => {
  const list = listEntity('schools', req.query)
  res.json(filterByRole('schools', list, req.user))
})
app.put('/api/schools/:id', (req, res) => {
  const db = readDb()
  const entity = db.schools.find((x) => x.id === req.params.id)
  if (!entity) return res.status(404).json({ error: 'not_found' })
  if (!allowUpdate('schools', req.user?.role, req.user, entity)) return res.status(403).json({ error: 'forbidden' })
  if (!withinScope('schools', req.user, req.body)) return res.status(403).json({ error: 'scope' })
  const updated = updateEntity('schools', req.params.id, req.body, req.user)
  res.json(updated)
})

app.post('/api/players', (req, res) => {
  if (!allowPost('players', req.user?.role)) return res.status(403).json({ error: 'forbidden' })
  if (!withinScope('players', req.user, req.body)) return res.status(403).json({ error: 'scope' })
  const result = addEntity('players', req.body)
  addAuditLog('Player', req.user, null, req.body)
  res.json(result)
})
app.get('/api/players', (req, res) => {
  const list = listEntity('players', req.query)
  res.json(filterByRole('players', list, req.user))
})
app.put('/api/players/:id', (req, res) => {
  const db = readDb()
  const entity = db.players.find((x) => x.id === req.params.id)
  if (!entity) return res.status(404).json({ error: 'not_found' })
  if (!allowUpdate('players', req.user?.role, req.user, entity)) return res.status(403).json({ error: 'forbidden' })
  if (!withinScope('players', req.user, req.body)) return res.status(403).json({ error: 'scope' })
  const updated = updateEntity('players', req.params.id, req.body, req.user)
  res.json(updated)
})

app.post('/api/coaches', (req, res) => {
  if (!allowPost('coaches', req.user?.role)) return res.status(403).json({ error: 'forbidden' })
  if (!withinScope('coaches', req.user, req.body)) return res.status(403).json({ error: 'scope' })
  const result = addEntity('coaches', req.body)
  addAuditLog('Coach', req.user, null, req.body)
  res.json(result)
})
app.get('/api/coaches', (req, res) => {
  const list = listEntity('coaches', req.query)
  res.json(filterByRole('coaches', list, req.user))
})
app.put('/api/coaches/:id', (req, res) => {
  const db = readDb()
  const entity = db.coaches.find((x) => x.id === req.params.id)
  if (!entity) return res.status(404).json({ error: 'not_found' })
  if (!allowUpdate('coaches', req.user?.role, req.user, entity)) return res.status(403).json({ error: 'forbidden' })
  if (!withinScope('coaches', req.user, req.body)) return res.status(403).json({ error: 'scope' })
  const updated = updateEntity('coaches', req.params.id, req.body, req.user)
  res.json(updated)
})

app.post('/api/referees', (req, res) => {
  if (!allowPost('referees', req.user?.role)) return res.status(403).json({ error: 'forbidden' })
  const result = addEntity('referees', req.body)
  addAuditLog('Referee', req.user, null, req.body)
  res.json(result)
})
app.get('/api/referees', (req, res) => {
  const list = listEntity('referees', req.query)
  res.json(filterByRole('referees', list, req.user))
})
app.put('/api/referees/:id', (req, res) => {
  const db = readDb()
  const entity = db.referees.find((x) => x.id === req.params.id)
  if (!entity) return res.status(404).json({ error: 'not_found' })
  if (!allowUpdate('referees', req.user?.role, req.user, entity)) return res.status(403).json({ error: 'forbidden' })
  if (!withinScope('referees', req.user, req.body)) return res.status(403).json({ error: 'scope' })
  const updated = updateEntity('referees', req.params.id, req.body, req.user)
  res.json(updated)
})

app.post('/api/admins', (req, res) => {
  if (!allowPost('admins', req.user?.role)) return res.status(403).json({ error: 'forbidden' })
  const result = addEntity('admins', req.body)
  addAuditLog('Admin', req.user, null, req.body)
  res.json(result)
})
app.get('/api/admins', (req, res) => {
  const list = listEntity('admins', req.query)
  res.json(filterByRole('admins', list, req.user))
})
app.put('/api/admins/:id', (req, res) => {
  const db = readDb()
  const entity = db.admins.find((x) => x.id === req.params.id)
  if (!entity) return res.status(404).json({ error: 'not_found' })
  if (!allowUpdate('admins', req.user?.role, req.user, entity)) return res.status(403).json({ error: 'forbidden' })
  if (!withinScope('admins', req.user, req.body)) return res.status(403).json({ error: 'scope' })
  const updated = updateEntity('admins', req.params.id, req.body, req.user)
  res.json(updated)
})

app.get('/api/audits', (req, res) => {
  if (req.user?.role !== 'EPHSRUAdmin') return res.status(403).json({ error: 'forbidden' })
  const db = readDb()
  let list = db.audits || []
  const { zoneId, schoolId, entity } = req.query || {}
  if (entity) list = list.filter((x) => x.entity === entity)
  if (zoneId) list = list.filter((x) => String(x.after?.zoneId ?? '') === String(zoneId))
  if (schoolId) list = list.filter((x) => String(x.after?.schoolId ?? '') === String(schoolId))
  res.json(list)
})

const port = process.env.PORT || 4000
app.listen(port, () => {})
app.post('/api/login', (req, res) => {
  const { role, zoneId, schoolId } = req.body || {}
  if (!role) return res.status(400).json({ error: 'role required' })
  const token = sign({ role, zoneId, schoolId })
  res.json({ token })
})
// uploads
const uploadDir = path.join(process.cwd(), 'server', 'uploads')
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9_.-]/g, '_')),
})
const upload = multer({ storage })

app.post('/api/upload', upload.single('file'), (req, res) => {
  const filename = req.file?.filename
  if (!filename) return res.status(400).json({ error: 'no file' })
  const url = `/uploads/${filename}`
  res.json({ url })
})
app.use('/uploads', express.static(uploadDir))
function addDocument(doc) {
  const db = readDb()
  const id = crypto.randomUUID()
  const ts = Date.now()
  const record = { id, ...doc, ts, status: 'pending' }
  db.documents.push(record)
  writeDb(db)
  return record
}

function updateDocument(id, status) {
  const db = readDb()
  const item = (db.documents || []).find((d) => d.id === id)
  if (!item) return null
  item.status = status
  writeDb(db)
  return item
}
app.post('/api/documents', (req, res) => {
  const role = req.user?.role
  if (!role) return res.status(403).json({ error: 'forbidden' })
  const doc = addDocument(req.body)
  res.json(doc)
})
app.get('/api/documents', (req, res) => {
  const db = readDb()
  let list = db.documents || []
  const { ownerType, ownerId, status } = req.query || {}
  if (ownerType) list = list.filter((d) => d.ownerType === ownerType)
  if (ownerId) list = list.filter((d) => String(d.ownerId) === String(ownerId))
  if (status) list = list.filter((d) => d.status === status)
  res.json(list)
})
app.post('/api/documents/:id/approve', (req, res) => {
  const role = req.user?.role
  if (!(role === 'SchoolAdmin' || role === 'EPHSRUAdmin')) return res.status(403).json({ error: 'forbidden' })
  const updated = updateDocument(req.params.id, 'approved')
  if (!updated) return res.status(404).json({ error: 'not_found' })
  addAuditLog('Document', req.user, { id: req.params.id }, { id: req.params.id, status: 'approved' })
  res.json(updated)
})
app.post('/api/documents/:id/reject', (req, res) => {
  const role = req.user?.role
  if (!(role === 'SchoolAdmin' || role === 'EPHSRUAdmin')) return res.status(403).json({ error: 'forbidden' })
  const updated = updateDocument(req.params.id, 'rejected')
  if (!updated) return res.status(404).json({ error: 'not_found' })
  addAuditLog('Document', req.user, { id: req.params.id }, { id: req.params.id, status: 'rejected' })
  res.json(updated)
})