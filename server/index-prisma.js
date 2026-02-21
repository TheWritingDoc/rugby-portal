import express from 'express'
import cors from 'cors'
import { sign, verifyToken } from './auth.js'
import multer from 'multer'
import fs from 'fs'
import path from 'path'
import prisma from './prisma.js'

const app = express()
app.use(cors())
app.use(express.json({ limit: '2mb' }))
app.use(verifyToken)

// Helper function to parse JSON data from database
function parseJsonData(data) {
  try {
    return data ? JSON.parse(data) : {}
  } catch {
    return {}
  }
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

// Schools endpoints
app.post('/api/schools', async (req, res) => {
  if (!allowPost('schools', req.user?.role)) return res.status(403).json({ error: 'forbidden' })
  if (!withinScope('schools', req.user, req.body)) return res.status(403).json({ error: 'scope' })
  
  const school = await prisma.school.create({
    data: {
      zoneId: req.body.zoneId || '',
      schoolId: req.body.schoolId || '',
      address: req.body.address || null,
      contactNumber: req.body.contactNumber || null,
      email: req.body.email || null,
      data: JSON.stringify(req.body)
    }
  })
  
  res.json({ id: school.id, ts: school.ts.getTime() })
})

app.get('/api/schools', async (req, res) => {
  const filters: any = {}
  if (req.query.zoneId) filters.zoneId = req.query.zoneId
  if (req.query.schoolId) filters.schoolId = req.query.schoolId
  
  const schools = await prisma.school.findMany({ where: filters })
  res.json(filterByRole('schools', schools, req.user))
})

app.put('/api/schools/:id', async (req, res) => {
  const school = await prisma.school.findUnique({ where: { id: req.params.id } })
  if (!school) return res.status(404).json({ error: 'not_found' })
  if (!allowUpdate('schools', req.user?.role, req.user, school)) return res.status(403).json({ error: 'forbidden' })
  if (!withinScope('schools', req.user, req.body)) return res.status(403).json({ error: 'scope' })
  
  const updatedData = { ...parseJsonData(school.data), ...req.body }
  const updated = await prisma.school.update({
    where: { id: req.params.id },
    data: {
      zoneId: req.body.zoneId || school.zoneId,
      schoolId: req.body.schoolId || school.schoolId,
      address: req.body.address !== undefined ? req.body.address : school.address,
      contactNumber: req.body.contactNumber !== undefined ? req.body.contactNumber : school.contactNumber,
      email: req.body.email !== undefined ? req.body.email : school.email,
      data: JSON.stringify(updatedData)
    }
  })
  
  res.json(updated)
})

// Players endpoints
app.post('/api/players', async (req, res) => {
  if (!allowPost('players', req.user?.role)) return res.status(403).json({ error: 'forbidden' })
  if (!withinScope('players', req.user, req.body)) return res.status(403).json({ error: 'scope' })
  
  const player = await prisma.player.create({
    data: {
      zoneId: req.body.zoneId || '',
      schoolId: req.body.schoolId || '',
      name: req.body.name || '',
      surname: req.body.surname || '',
      idNumber: req.body.idNumber || null,
      dateOfBirth: req.body.dateOfBirth || null,
      gender: req.body.gender || null,
      ageGroup: req.body.ageGroup || null,
      contactNumber: req.body.contactNumber || null,
      email: req.body.email || null,
      parentContact: req.body.parentContact || null,
      parentEmail: req.body.parentEmail || null,
      data: JSON.stringify(req.body)
    }
  })
  
  res.json({ id: player.id, ts: player.ts.getTime() })
})

app.get('/api/players', async (req, res) => {
  const filters: any = {}
  if (req.query.zoneId) filters.zoneId = req.query.zoneId
  if (req.query.schoolId) filters.schoolId = req.query.schoolId
  
  const players = await prisma.player.findMany({ where: filters })
  res.json(filterByRole('players', players, req.user))
})

app.put('/api/players/:id', async (req, res) => {
  const player = await prisma.player.findUnique({ where: { id: req.params.id } })
  if (!player) return res.status(404).json({ error: 'not_found' })
  if (!allowUpdate('players', req.user?.role, req.user, player)) return res.status(403).json({ error: 'forbidden' })
  if (!withinScope('players', req.user, req.body)) return res.status(403).json({ error: 'scope' })
  
  const updatedData = { ...parseJsonData(player.data), ...req.body }
  const updated = await prisma.player.update({
    where: { id: req.params.id },
    data: {
      zoneId: req.body.zoneId !== undefined ? req.body.zoneId : player.zoneId,
      schoolId: req.body.schoolId !== undefined ? req.body.schoolId : player.schoolId,
      name: req.body.name !== undefined ? req.body.name : player.name,
      surname: req.body.surname !== undefined ? req.body.surname : player.surname,
      idNumber: req.body.idNumber !== undefined ? req.body.idNumber : player.idNumber,
      dateOfBirth: req.body.dateOfBirth !== undefined ? req.body.dateOfBirth : player.dateOfBirth,
      gender: req.body.gender !== undefined ? req.body.gender : player.gender,
      ageGroup: req.body.ageGroup !== undefined ? req.body.ageGroup : player.ageGroup,
      contactNumber: req.body.contactNumber !== undefined ? req.body.contactNumber : player.contactNumber,
      email: req.body.email !== undefined ? req.body.email : player.email,
      parentContact: req.body.parentContact !== undefined ? req.body.parentContact : player.parentContact,
      parentEmail: req.body.parentEmail !== undefined ? req.body.parentEmail : player.parentEmail,
      data: JSON.stringify(updatedData)
    }
  })
  
  res.json(updated)
})

// Coaches endpoints
app.post('/api/coaches', async (req, res) => {
  if (!allowPost('coaches', req.user?.role)) return res.status(403).json({ error: 'forbidden' })
  if (!withinScope('coaches', req.user, req.body)) return res.status(403).json({ error: 'scope' })
  
  const coach = await prisma.coach.create({
    data: {
      zoneId: req.body.zoneId || '',
      schoolId: req.body.schoolId || '',
      name: req.body.name || '',
      surname: req.body.surname || '',
      idNumber: req.body.idNumber || null,
      contactNumber: req.body.contactNumber || null,
      email: req.body.email || null,
      qualifications: req.body.qualifications || null,
      experience: req.body.experience || null,
      data: JSON.stringify(req.body)
    }
  })
  
  res.json({ id: coach.id, ts: coach.ts.getTime() })
})

app.get('/api/coaches', async (req, res) => {
  const filters: any = {}
  if (req.query.zoneId) filters.zoneId = req.query.zoneId
  if (req.query.schoolId) filters.schoolId = req.query.schoolId
  
  const coaches = await prisma.coach.findMany({ where: filters })
  res.json(filterByRole('coaches', coaches, req.user))
})

app.put('/api/coaches/:id', async (req, res) => {
  const coach = await prisma.coach.findUnique({ where: { id: req.params.id } })
  if (!coach) return res.status(404).json({ error: 'not_found' })
  if (!allowUpdate('coaches', req.user?.role, req.user, coach)) return res.status(403).json({ error: 'forbidden' })
  if (!withinScope('coaches', req.user, req.body)) return res.status(403).json({ error: 'scope' })
  
  const updatedData = { ...parseJsonData(coach.data), ...req.body }
  const updated = await prisma.coach.update({
    where: { id: req.params.id },
    data: {
      zoneId: req.body.zoneId !== undefined ? req.body.zoneId : coach.zoneId,
      schoolId: req.body.schoolId !== undefined ? req.body.schoolId : coach.schoolId,
      name: req.body.name !== undefined ? req.body.name : coach.name,
      surname: req.body.surname !== undefined ? req.body.surname : coach.surname,
      idNumber: req.body.idNumber !== undefined ? req.body.idNumber : coach.idNumber,
      contactNumber: req.body.contactNumber !== undefined ? req.body.contactNumber : coach.contactNumber,
      email: req.body.email !== undefined ? req.body.email : coach.email,
      qualifications: req.body.qualifications !== undefined ? req.body.qualifications : coach.qualifications,
      experience: req.body.experience !== undefined ? req.body.experience : coach.experience,
      data: JSON.stringify(updatedData)
    }
  })
  
  res.json(updated)
})

// Referees endpoints
app.post('/api/referees', async (req, res) => {
  if (!allowPost('referees', req.user?.role)) return res.status(403).json({ error: 'forbidden' })
  
  const referee = await prisma.referee.create({
    data: {
      name: req.body.name || '',
      surname: req.body.surname || '',
      idNumber: req.body.idNumber || null,
      contactNumber: req.body.contactNumber || null,
      email: req.body.email || null,
      qualifications: req.body.qualifications || null,
      experience: req.body.experience || null,
      data: JSON.stringify(req.body)
    }
  })
  
  res.json({ id: referee.id, ts: referee.ts.getTime() })
})

app.get('/api/referees', async (req, res) => {
  const referees = await prisma.referee.findMany()
  res.json(filterByRole('referees', referees, req.user))
})

app.put('/api/referees/:id', async (req, res) => {
  const referee = await prisma.referee.findUnique({ where: { id: req.params.id } })
  if (!referee) return res.status(404).json({ error: 'not_found' })
  if (!allowUpdate('referees', req.user?.role, req.user, referee)) return res.status(403).json({ error: 'forbidden' })
  if (!withinScope('referees', req.user, req.body)) return res.status(403).json({ error: 'scope' })
  
  const updatedData = { ...parseJsonData(referee.data), ...req.body }
  const updated = await prisma.referee.update({
    where: { id: req.params.id },
    data: {
      name: req.body.name !== undefined ? req.body.name : referee.name,
      surname: req.body.surname !== undefined ? req.body.surname : referee.surname,
      idNumber: req.body.idNumber !== undefined ? req.body.idNumber : referee.idNumber,
      contactNumber: req.body.contactNumber !== undefined ? req.body.contactNumber : referee.contactNumber,
      email: req.body.email !== undefined ? req.body.email : referee.email,
      qualifications: req.body.qualifications !== undefined ? req.body.qualifications : referee.qualifications,
      experience: req.body.experience !== undefined ? req.body.experience : referee.experience,
      data: JSON.stringify(updatedData)
    }
  })
  
  res.json(updated)
})

// Admins endpoints
app.post('/api/admins', async (req, res) => {
  if (!allowPost('admins', req.user?.role)) return res.status(403).json({ error: 'forbidden' })
  
  const admin = await prisma.admin.create({
    data: {
      name: req.body.name || '',
      surname: req.body.surname || '',
      idNumber: req.body.idNumber || null,
      contactNumber: req.body.contactNumber || null,
      email: req.body.email || null,
      role: req.body.role || null,
      zoneId: req.body.zoneId || null,
      schoolId: req.body.schoolId || null,
      data: JSON.stringify(req.body)
    }
  })
  
  res.json({ id: admin.id, ts: admin.ts.getTime() })
})

app.get('/api/admins', async (req, res) => {
  const admins = await prisma.admin.findMany()
  res.json(filterByRole('admins', admins, req.user))
})

app.put('/api/admins/:id', async (req, res) => {
  const admin = await prisma.admin.findUnique({ where: { id: req.params.id } })
  if (!admin) return res.status(404).json({ error: 'not_found' })
  if (!allowUpdate('admins', req.user?.role, req.user, admin)) return res.status(403).json({ error: 'forbidden' })
  if (!withinScope('admins', req.user, req.body)) return res.status(403).json({ error: 'scope' })
  
  const updatedData = { ...parseJsonData(admin.data), ...req.body }
  const updated = await prisma.admin.update({
    where: { id: req.params.id },
    data: {
      name: req.body.name !== undefined ? req.body.name : admin.name,
      surname: req.body.surname !== undefined ? req.body.surname : admin.surname,
      idNumber: req.body.idNumber !== undefined ? req.body.idNumber : admin.idNumber,
      contactNumber: req.body.contactNumber !== undefined ? req.body.contactNumber : admin.contactNumber,
      email: req.body.email !== undefined ? req.body.email : admin.email,
      role: req.body.role !== undefined ? req.body.role : admin.role,
      zoneId: req.body.zoneId !== undefined ? req.body.zoneId : admin.zoneId,
      schoolId: req.body.schoolId !== undefined ? req.body.schoolId : admin.schoolId,
      data: JSON.stringify(updatedData)
    }
  })
  
  res.json(updated)
})

// Audits endpoint
app.get('/api/audits', async (req, res) => {
  if (req.user?.role !== 'EPHSRUAdmin') return res.status(403).json({ error: 'forbidden' })
  
  const filters: any = {}
  if (req.query.entity) filters.entity = req.query.entity
  
  let audits = await prisma.audit.findMany({ where: filters })
  
  // Apply additional filters that need JSON parsing
  if (req.query.zoneId || req.query.schoolId) {
    audits = audits.filter(audit => {
      const after = parseJsonData(audit.after)
      if (req.query.zoneId && String(after.zoneId ?? '') !== String(req.query.zoneId)) return false
      if (req.query.schoolId && String(after.schoolId ?? '') !== String(req.query.schoolId)) return false
      return true
    })
  }
  
  res.json(audits)
})

// Login endpoint
app.post('/api/login', (req, res) => {
  const { role, zoneId, schoolId } = req.body || {}
  if (!role) return res.status(400).json({ error: 'role required' })
  const token = sign({ role, zoneId, schoolId })
  res.json({ token })
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

// Documents endpoints
app.post('/api/documents', async (req, res) => {
  const role = req.user?.role
  if (!role) return res.status(403).json({ error: 'forbidden' })
  
  const document = await prisma.document.create({
    data: {
      ownerType: req.body.ownerType || '',
      ownerId: req.body.ownerId || '',
      fileName: req.body.fileName || '',
      fileUrl: req.body.fileUrl || '',
      status: 'pending'
    }
  })
  
  res.json(document)
})

app.get('/api/documents', async (req, res) => {
  const filters: any = {}
  if (req.query.ownerType) filters.ownerType = req.query.ownerType
  if (req.query.ownerId) filters.ownerId = req.query.ownerId
  if (req.query.status) filters.status = req.query.status
  
  const documents = await prisma.document.findMany({ where: filters })
  res.json(documents)
})

app.post('/api/documents/:id/approve', async (req, res) => {
  const role = req.user?.role
  if (!(role === 'SchoolAdmin' || role === 'EPHSRUAdmin')) return res.status(403).json({ error: 'forbidden' })
  
  try {
    const updated = await prisma.document.update({
      where: { id: req.params.id },
      data: { status: 'approved' }
    })
    res.json(updated)
  } catch (error) {
    res.status(404).json({ error: 'not_found' })
  }
})

app.post('/api/documents/:id/reject', async (req, res) => {
  const role = req.user?.role
  if (!(role === 'SchoolAdmin' || role === 'EPHSRUAdmin')) return res.status(403).json({ error: 'forbidden' })
  
  try {
    const updated = await prisma.document.update({
      where: { id: req.params.id },
      data: { status: 'rejected' }
    })
    res.json(updated)
  } catch (error) {
    res.status(404).json({ error: 'not_found' })
  }
})

const port = process.env.PORT || 4000
app.listen(port, () => {})

export default app