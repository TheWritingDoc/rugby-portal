import express from 'express'
import cors from 'cors'
import { sign, verifyToken } from './auth.js'
import multer from 'multer'
import fs from 'fs'
import path from 'path'
import db from './db-sqlite.js'
import https from 'https'

const app = express()

// Production CORS configuration
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://your-domain.vercel.app', 'https://your-custom-domain.com']
    : ['http://localhost:4173', 'http://localhost:5173'],
  credentials: true,
  optionsSuccessStatus: 200
}

app.use(cors(corsOptions))
app.use(express.json({ limit: '2mb' }))
app.use(verifyToken)

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Security middleware
app.use((req, res, next) => {
  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('X-XSS-Protection', '1; mode=block')
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  
  // Rate limiting for production
  if (process.env.NODE_ENV === 'production') {
    const clientIP = req.ip || req.connection.remoteAddress
    // Implement rate limiting logic here if needed
  }
  
  next()
})

// All the existing endpoint implementations from index-sqlite.js
// [Previous endpoint implementations would go here]

// For now, let's copy the existing implementation
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
    return String(entity.zoneId ?? '') === String(user.zoneId ?? '') && 
           String(entity.schoolId ?? '') === String(user.schoolId ?? '')
  }
  if (type === 'coaches' && role === 'SchoolAdmin') {
    return String(entity.zoneId ?? '') === String(user.zoneId ?? '') && 
           String(entity.schoolId ?? '') === String(user.schoolId ?? '')
  }
  if (type === 'schools' && role === 'SchoolAdmin') {
    return String(entity.schoolId ?? '') === String(user.schoolId ?? '')
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
  if (role === 'ZoneCoordinator') return list.filter((x) => String(x.zoneId ?? '') === String(user.zoneId ?? ''))
  if (role === 'SchoolAdmin' || role === 'Coach') return list.filter((x) => String(x.schoolId ?? '') === String(user.schoolId ?? ''))
  return []
}

// Copy all endpoints from index-sqlite.js
// Schools endpoints
app.post('/api/schools', (req, res) => {
  if (!allowPost('schools', req.user?.role)) return res.status(403).json({ error: 'forbidden' })
  if (!withinScope('schools', req.user, req.body)) return res.status(403).json({ error: 'scope' })
  
  const id = crypto.randomUUID()
  const ts = Date.now()
  const data = JSON.stringify(req.body)
  
  db.run(
    'INSERT INTO schools (id, zoneId, schoolId, address, contactNumber, email, data, ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [id, req.body.zoneId || '', req.body.schoolId || '', req.body.address || null, req.body.contactNumber || null, req.body.email || null, data, ts],
    function(err) {
      if (err) return res.status(500).json({ error: err.message })
      res.json({ id, ts })
    }
  )
})

app.get('/api/schools', (req, res) => {
  let query = 'SELECT * FROM schools'
  const params = []
  const conditions = []
  
  if (req.query.zoneId) {
    conditions.push('zoneId = ?')
    params.push(req.query.zoneId)
  }
  if (req.query.schoolId) {
    conditions.push('schoolId = ?')
    params.push(req.query.schoolId)
  }
  
  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ')
  }
  
  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message })
    res.json(filterByRole('schools', rows, req.user))
  })
})

app.put('/api/schools/:id', (req, res) => {
  db.get('SELECT * FROM schools WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message })
    if (!row) return res.status(404).json({ error: 'not_found' })
    if (!allowUpdate('schools', req.user?.role, req.user, row)) return res.status(403).json({ error: 'forbidden' })
    if (!withinScope('schools', req.user, req.body)) return res.status(403).json({ error: 'scope' })
    
    const existingData = JSON.parse(row.data || '{}')
    const updatedData = { ...existingData, ...req.body }
    const ts = Date.now()
    
    db.run(
      'UPDATE schools SET zoneId = ?, schoolId = ?, address = ?, contactNumber = ?, email = ?, data = ?, ts = ? WHERE id = ?',
      [req.body.zoneId !== undefined ? req.body.zoneId : row.zoneId,
       req.body.schoolId !== undefined ? req.body.schoolId : row.schoolId,
       req.body.address !== undefined ? req.body.address : row.address,
       req.body.contactNumber !== undefined ? req.body.contactNumber : row.contactNumber,
       req.body.email !== undefined ? req.body.email : row.email,
       JSON.stringify(updatedData),
       ts,
       req.params.id],
      function(err) {
        if (err) return res.status(500).json({ error: err.message })
        res.json({ ...row, ...req.body, ts })
      }
    )
  })
})

// Similar endpoints for players, coaches, referees, admins, audits, documents...
// [Copy all other endpoints from index-sqlite.js]

// Copy all other endpoints from index-sqlite.js
// Players endpoints
app.post('/api/players', (req, res) => {
  if (!allowPost('players', req.user?.role)) return res.status(403).json({ error: 'forbidden' })
  if (!withinScope('players', req.user, req.body)) return res.status(403).json({ error: 'scope' })
  
  const id = crypto.randomUUID()
  const ts = Date.now()
  const data = JSON.stringify(req.body)
  
  db.run(
    'INSERT INTO players (id, zoneId, schoolId, name, surname, idNumber, dateOfBirth, gender, ageGroup, contactNumber, email, parentContact, parentEmail, data, ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, req.body.zoneId || '', req.body.schoolId || '', req.body.name || '', req.body.surname || '', 
     req.body.idNumber || null, req.body.dateOfBirth || null, req.body.gender || null, req.body.ageGroup || null,
     req.body.contactNumber || null, req.body.email || null, req.body.parentContact || null, req.body.parentEmail || null, data, ts],
    function(err) {
      if (err) return res.status(500).json({ error: err.message })
      res.json({ id, ts })
    }
  )
})

app.get('/api/players', (req, res) => {
  let query = 'SELECT * FROM players'
  const params = []
  const conditions = []
  
  if (req.query.zoneId) {
    conditions.push('zoneId = ?')
    params.push(req.query.zoneId)
  }
  if (req.query.schoolId) {
    conditions.push('schoolId = ?')
    params.push(req.query.schoolId)
  }
  
  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ')
  }
  
  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message })
    res.json(filterByRole('players', rows, req.user))
  })
})

app.put('/api/players/:id', (req, res) => {
  db.get('SELECT * FROM players WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message })
    if (!row) return res.status(404).json({ error: 'not_found' })
    if (!allowUpdate('players', req.user?.role, req.user, row)) return res.status(403).json({ error: 'forbidden' })
    if (!withinScope('players', req.user, req.body)) return res.status(403).json({ error: 'scope' })
    
    const existingData = JSON.parse(row.data || '{}')
    const updatedData = { ...existingData, ...req.body }
    const ts = Date.now()
    
    db.run(
      'UPDATE players SET zoneId = ?, schoolId = ?, name = ?, surname = ?, idNumber = ?, dateOfBirth = ?, gender = ?, ageGroup = ?, contactNumber = ?, email = ?, parentContact = ?, parentEmail = ?, data = ?, ts = ? WHERE id = ?',
      [req.body.zoneId !== undefined ? req.body.zoneId : row.zoneId,
       req.body.schoolId !== undefined ? req.body.schoolId : row.schoolId,
       req.body.name !== undefined ? req.body.name : row.name,
       req.body.surname !== undefined ? req.body.surname : row.surname,
       req.body.idNumber !== undefined ? req.body.idNumber : row.idNumber,
       req.body.dateOfBirth !== undefined ? req.body.dateOfBirth : row.dateOfBirth,
       req.body.gender !== undefined ? req.body.gender : row.gender,
       req.body.ageGroup !== undefined ? req.body.ageGroup : row.ageGroup,
       req.body.contactNumber !== undefined ? req.body.contactNumber : row.contactNumber,
       req.body.email !== undefined ? req.body.email : row.email,
       req.body.parentContact !== undefined ? req.body.parentContact : row.parentContact,
       req.body.parentEmail !== undefined ? req.body.parentEmail : row.parentEmail,
       JSON.stringify(updatedData),
       ts,
       req.params.id],
      function(err) {
        if (err) return res.status(500).json({ error: err.message })
        res.json({ ...row, ...req.body, ts })
      }
    )
  })
})

// File uploads
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

// Login endpoint
app.post('/api/login', (req, res) => {
  const { role, zoneId, schoolId } = req.body || {}
  if (!role) return res.status(400).json({ error: 'role required' })
  const token = sign({ role, zoneId, schoolId })
  res.json({ token })
})

const port = process.env.PORT || 4000

if (process.env.NODE_ENV === 'production' && process.env.SSL_CERT && process.env.SSL_KEY) {
  // HTTPS configuration for production
  const httpsOptions = {
    cert: fs.readFileSync(process.env.SSL_CERT),
    key: fs.readFileSync(process.env.SSL_KEY)
  }
  
  https.createServer(httpsOptions, app).listen(port, () => {
    console.log(`HTTPS Server running on port ${port}`)
  })
} else {
  // HTTP for development
  app.listen(port, () => {
    console.log(`HTTP Server running on port ${port}`)
  })
}

export default app