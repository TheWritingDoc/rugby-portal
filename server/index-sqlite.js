import express from 'express'
import cors from 'cors'
import { sign, verifyToken } from './auth.js'
import multer from 'multer'
import fs from 'fs'
import path from 'path'
import db from './db.js'
import { saveUpload, localUploadDir, usingSupabaseStorage } from './storage.js'
import bcrypt from 'bcryptjs'

const app = express()
// In production, restrict cross-origin access to the deployed frontend (comma-separated env list)
const allowedOrigins = String(process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean)
app.use(cors(allowedOrigins.length ? { origin: allowedOrigins } : undefined))
app.use(express.json({ limit: '2mb' }))
app.use(verifyToken)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  if ((process.env.NODE_ENV || 'development') === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }
  next()
})

// Sliding-window rate limiter for credential endpoints (in-memory; per-IP)
const rateBuckets = new Map()
function rateLimit(maxHits, windowMs) {
  return (req, res, next) => {
    const key = `${req.path}:${req.ip || req.socket?.remoteAddress || 'unknown'}`
    const now = Date.now()
    const hits = (rateBuckets.get(key) || []).filter((t) => now - t < windowMs)
    if (hits.length >= maxHits) {
      return res.status(429).json({ error: 'too_many_requests', retryAfterMs: windowMs - (now - hits[0]) })
    }
    hits.push(now)
    rateBuckets.set(key, hits)
    if (rateBuckets.size > 10000) rateBuckets.clear()
    next()
  }
}
const isProd = (process.env.NODE_ENV || 'development') === 'production'
app.use('/api/auth/', rateLimit(isProd ? 20 : 500, 60_000))
app.use('/api/login', rateLimit(isProd ? 60 : 1000, 60_000))

// Enrich req.user with scope from DB if missing
app.use((req, _res, next) => {
  const u = req.user
  if (!u) return next()
  const role = u.role
  const email = String(u.email || '')
  if (role === 'Coach' && email && (!u.schoolId || !u.zoneId)) {
    db.get('SELECT zoneId, schoolId FROM coaches WHERE email = ?', [email], (err, row) => {
      if (!err && row) {
        req.user.zoneId = row.zoneId
        req.user.schoolId = row.schoolId
      }
      next()
    })
    return
  }
  if (role === 'SchoolAdmin' && email && (!u.schoolId || !u.zoneId)) {
    db.get('SELECT zoneId, schoolId FROM admins WHERE email = ? AND role = ?', [email, 'SchoolAdmin'], (err, row) => {
      if (!err && row) {
        req.user.zoneId = row.zoneId
        req.user.schoolId = row.schoolId
      }
      next()
    })
    return
  }
  next()
})
function writeAudit(userRole, entity, action, beforeObj, afterObj) {
  try {
    const id = crypto.randomUUID()
    const ts = Date.now()
    const before = beforeObj ? JSON.stringify(beforeObj) : null
    const after = afterObj ? JSON.stringify(afterObj) : null
    db.run('INSERT INTO audits (id, userRole, entity, action, before, after, ts) VALUES (?, ?, ?, ?, ?, ?, ?)', [id, String(userRole || ''), String(entity), String(action), before, after, ts])
  } catch {}
}

// Notification outbox: every workflow outcome lands here per recipient email and is
// shown in-app. EMAIL INTEGRATION POINT: hook a mail/SMS provider here to also
// deliver externally — the table already holds everything a sender needs.
function queueNotification(email, subject, message) {
  try {
    const e = String(email || '').trim().toLowerCase()
    if (!e) return
    const id = crypto.randomUUID()
    db.run(
      'INSERT INTO notifications (id, email, subject, message, readAt, createdAt) VALUES (?, ?, ?, ?, NULL, ?)',
      [id, e, String(subject || ''), String(message || ''), Date.now()]
    )
    console.log(`[notify] ${e}: ${subject}`)
  } catch {}
}

function resolveUserDisplay(email) {
  const e = String(email || '').trim().toLowerCase()
  if (!e) return Promise.resolve(null)
  return new Promise((resolve) => {
    db.get('SELECT name, surname FROM coaches WHERE LOWER(email) = ? LIMIT 1', [e], (err, c) => {
      if (!err && c) return resolve({ role: 'Coach', email: e, name: `${c.name} ${c.surname}`.trim() })
      db.get('SELECT name, surname, role FROM admins WHERE LOWER(email) = ? LIMIT 1', [e], (err2, a) => {
        if (!err2 && a) return resolve({ role: a.role || 'Admin', email: e, name: `${a.name} ${a.surname}`.trim() })
        db.get('SELECT name, surname FROM players WHERE LOWER(email) = ? LIMIT 1', [e], (err3, p) => {
          if (!err3 && p) return resolve({ role: 'Player', email: e, name: `${p.name} ${p.surname}`.trim() })
          return resolve({ role: '', email: e, name: e })
        })
      })
    })
  })
}

function sanitizeApprovalChanges(entityType, changes) {
  const allowedPlayerFields = new Set([
    'name','surname','idNumber','dob','gender','ageGroup','phone','email','address',
    'emergencyContactName','emergencyContactNumber',
    'parentName','parentSurname','relationship','parentContact','parentEmail','consentSignature',
    'position','jerseyNumber','team','previousSchool',
    'medicalAidName','medicalAidNumber','allergies','chronicConditions','medicalNotes',
    'zoneId','schoolId'
  ])
  const allowed = entityType === 'players' ? allowedPlayerFields : new Set()
  const list = Array.isArray(changes) ? changes : []
  const out = []
  for (const c of list) {
    const field = String(c?.field || c?.key || '').trim()
    if (!field || !allowed.has(field)) continue
    const prev = c?.previous
    const updated = c?.updated !== undefined ? c.updated : c?.value
    if (updated === undefined) continue
    out.push({ field, previous: prev, updated })
  }
  return out
}

function applyPlayerApprovedChanges(playerRow, changesList, done) {
  const existingData = (() => { try { return JSON.parse(playerRow.data || '{}') } catch { return {} } })()
  const updates = {}
  for (const c of changesList) {
    updates[c.field] = c.updated
  }
  const merged = { ...existingData, ...updates }
  const now = Date.now()
  const columnMap = {
    name: 'name',
    surname: 'surname',
    idNumber: 'idNumber',
    contactNumber: 'phone',
    email: 'email',
    dateOfBirth: 'dob',
    gender: 'gender',
    ageGroup: 'ageGroup',
    zoneId: 'zoneId',
    schoolId: 'schoolId'
  }
  const next = {
    zoneId: updates.zoneId !== undefined ? String(updates.zoneId || '') : String(playerRow.zoneId || ''),
    schoolId: updates.schoolId !== undefined ? String(updates.schoolId || '') : String(playerRow.schoolId || ''),
    name: updates.name !== undefined ? String(updates.name || '') : String(playerRow.name || ''),
    surname: updates.surname !== undefined ? String(updates.surname || '') : String(playerRow.surname || ''),
    idNumber: updates.idNumber !== undefined ? String(updates.idNumber || '') : String(playerRow.idNumber || ''),
    dateOfBirth: updates.dob !== undefined ? String(updates.dob || '') : String(playerRow.dateOfBirth || ''),
    gender: updates.gender !== undefined ? String(updates.gender || '') : String(playerRow.gender || ''),
    ageGroup: updates.ageGroup !== undefined ? String(updates.ageGroup || '') : String(playerRow.ageGroup || ''),
    contactNumber: updates.phone !== undefined ? String(updates.phone || '') : String(playerRow.contactNumber || ''),
    email: updates.email !== undefined ? String(updates.email || '') : String(playerRow.email || ''),
    parentContact: updates.parentContact !== undefined ? String(updates.parentContact || '') : String(playerRow.parentContact || ''),
    parentEmail: updates.parentEmail !== undefined ? String(updates.parentEmail || '') : String(playerRow.parentEmail || '')
  }

  db.run(
    'UPDATE players SET zoneId = ?, schoolId = ?, name = ?, surname = ?, idNumber = ?, dateOfBirth = ?, gender = ?, ageGroup = ?, contactNumber = ?, email = ?, parentContact = ?, parentEmail = ?, data = ?, ts = ? WHERE id = ?',
    [next.zoneId, next.schoolId, next.name, next.surname,
     next.idNumber || null, next.dateOfBirth || null, next.gender || null, next.ageGroup || null,
     next.contactNumber || null, next.email || null, next.parentContact || null, next.parentEmail || null,
     JSON.stringify(merged), now, playerRow.id],
    (err) => {
      if (err) return done(err)
      db.get('SELECT * FROM players WHERE id = ?', [playerRow.id], (gerr, updatedPlayer) => {
        if (gerr) return done(gerr)
        done(null, updatedPlayer)
      })
    }
  )
}

function allowPost(type, role) {
  const env = process.env.NODE_ENV || 'development'
  if (!role) {
    // In development/test, allow unauthenticated self-registration for coaches to enable workflows
    if (env !== 'production' && type === 'coaches') return true
    return false
  }
  if (role === 'EPHSRUAdmin') return true
  if (type === 'players' && (role === 'Coach' || role === 'SchoolAdmin' || role === 'Player')) return true
  if (type === 'coaches' && (role === 'SchoolAdmin' || (env !== 'production' && role === 'Coach'))) return true
  // School admins onboard referees (matches the delegation UI); zone coordinators manage the zone panel
  if (type === 'referees' && (role === 'EPHSRUAdmin' || role === 'Referee' || role === 'ZoneCoordinator' || role === 'SchoolAdmin')) return true
  if (type === 'schools' && (role === 'SchoolAdmin' || role === 'ZoneCoordinator')) return true
  if (type === 'admins' && (role === 'EPHSRUAdmin' || role === 'ZoneCoordinator')) return true
  return false
}

function allowUpdate(type, role, user, entity) {
  if (!role) {
    const env = process.env.NODE_ENV || 'development'
    return env === 'development' || env === 'test'
  }
  if (role === 'EPHSRUAdmin') return true
  if (type === 'players' && (role === 'Coach' || role === 'SchoolAdmin')) {
    // Coaches and school admins may only update players of their own school
    return String(entity.schoolId ?? '') === String(user.schoolId ?? '')
  }
  if (type === 'referees' && role === 'ZoneCoordinator') {
    return String(entity.zoneId ?? '') === String(user.zoneId ?? '')
  }
  if (type === 'players' && role === 'ZoneCoordinator') {
    return String(entity.zoneId ?? '') === String(user.zoneId ?? '')
  }
  if (type === 'coaches' && role === 'SchoolAdmin') {
    return String(entity.zoneId ?? '') === String(user.zoneId ?? '') && 
           String(entity.schoolId ?? '') === String(user.schoolId ?? '')
  }
  if (type === 'schools' && role === 'SchoolAdmin') {
    return String(entity.schoolId ?? '') === String(user.schoolId ?? '')
  }
  if (type === 'schools' && role === 'ZoneCoordinator') {
    return String(entity.zoneId ?? '') === String(user.zoneId ?? '')
  }
  if (type === 'admins' && role === 'SchoolAdmin') {
    return String(entity.schoolId ?? '') === String(user.schoolId ?? '') &&
           String(entity.zoneId ?? '') === String(user.zoneId ?? '') &&
           String(entity.email ?? '') === String(user.email ?? '')
  }
  return false
}

function withinScope(type, user, data) {
  if (!user) return false
  const role = user.role
  if (role === 'EPHSRUAdmin') return true
  if (role === 'SchoolAdmin') {
    if (type === 'players' || type === 'coaches' || type === 'schools' || type === 'admins') {
      return String(data.schoolId ?? '') === String(user.schoolId ?? '')
    }
    // Referees are zone-scoped rows; a school admin may register officials for their own zone
    if (type === 'referees') return String(data.zoneId ?? '') === String(user.zoneId ?? '')
  }
  if (role === 'Coach') {
    if (type === 'players') return String(data.schoolId ?? '') === String(user.schoolId ?? '')
    if (type === 'coaches') return String(data.schoolId ?? '') === String(user.schoolId ?? '')
    return false
  }
  if (role === 'Player') {
    if (type === 'players') return true
  }
  if (role === 'Referee') {
    if (type === 'referees') return true
  }
  if (role === 'ZoneCoordinator') {
    if (type === 'referees') return String(data.zoneId ?? '') === String(user.zoneId ?? '')
    if (type === 'players') return String(data.zoneId ?? '') === String(user.zoneId ?? '')
    if (type === 'schools') return String(data.zoneId ?? '') === String(user.zoneId ?? '')
    if (type === 'admins') {
      // Can only create SchoolAdmin in their zone
      if (data.role && data.role !== 'SchoolAdmin') return false
      return String(data.zoneId ?? '') === String(user.zoneId ?? '')
    }
  }
  return false
}

function filterByRole(type, list, user) {
  const role = user?.role
  if (!role) return []
  if (role === 'EPHSRUAdmin') return list
  if (role === 'ZoneCoordinator') return list.filter((x) => String(x.zoneId ?? '') === String(user.zoneId ?? ''))
  if (role === 'SchoolAdmin') {
    if (type === 'referees') return list.filter((x) => String(x.zoneId ?? '') === String(user.zoneId ?? ''))
    return list.filter((x) => String(x.schoolId ?? '') === String(user.schoolId ?? ''))
  }
  if (role === 'Coach') return list.filter((x) => String(x.schoolId ?? '') === String(user.schoolId ?? ''))
  if (role === 'Player') {
    if (type === 'players') return list.filter((x) => String(x.email ?? '') === String(user.email ?? ''))
    return []
  }
  if (role === 'Referee') {
    if (type === 'referees') return list.filter((x) => String(x.zoneId ?? '') === String(user.zoneId ?? ''))
    return []
  }
  return []
}

// Schools endpoints
app.post('/api/schools', (req, res) => {
  if (!allowPost('schools', req.user?.role)) return res.status(403).json({ error: 'forbidden' })
  if (!withinScope('schools', req.user, req.body)) return res.status(403).json({ error: 'scope' })
  const schoolId = String(req.body.schoolId || '').trim()
  if (schoolId) {
    return db.get('SELECT id FROM schools WHERE schoolId = ? LIMIT 1', [schoolId], (err2, row2) => {
      if (err2) return res.status(500).json({ error: err2.message })
      if (row2) return res.status(409).json({ error: 'duplicate_schoolId', id: row2.id })
      createSchool()
    })
  }
  return createSchool()
  
  function createSchool() {
    const id = crypto.randomUUID()
    const ts = Date.now()
    const data = JSON.stringify(req.body)
    db.run(
      'INSERT INTO schools (id, zoneId, schoolId, address, contactNumber, email, data, ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, req.body.zoneId || '', req.body.schoolId || '', req.body.address || null, req.body.contactNumber || null, req.body.email || null, data, ts],
      function(err) {
        if (err) return res.status(500).json({ error: err.message })
        writeAudit(req.user?.role, 'schools', 'create', null, { id, ...req.body })
        res.json({ id, ts })
      }
    )
  }
})

// Approval requests (player profile updates)
app.post('/api/approvals', async (req, res) => {
  const role = req.user?.role
  if (!(role === 'Player' || role === 'Coach' || role === 'SchoolAdmin' || role === 'EPHSRUAdmin')) {
    return res.status(403).json({ error: 'forbidden' })
  }
  const entityType = String(req.body.entityType || '').trim()
  const entityId = String(req.body.entityId || '').trim()
  if (entityType !== 'players') return res.status(400).json({ error: 'unsupported_entityType' })
  if (!entityId) return res.status(400).json({ error: 'entityId_required' })

  db.get('SELECT * FROM players WHERE id = ?', [entityId], async (err, player) => {
    if (err) return res.status(500).json({ error: err.message })
    if (!player) return res.status(404).json({ error: 'not_found' })

    const requesterEmail = String(req.user?.email || '').trim().toLowerCase()
    if (role === 'Player') {
      const rowEmail = String(player.email || '').trim().toLowerCase()
      if (!requesterEmail || !rowEmail || requesterEmail !== rowEmail) return res.status(403).json({ error: 'forbidden' })
    }
    if (role === 'Coach' || role === 'SchoolAdmin') {
      if (String(player.schoolId || '') !== String(req.user?.schoolId || '')) return res.status(403).json({ error: 'forbidden' })
    }

    const changes = sanitizeApprovalChanges(entityType, req.body.requestedChanges)
    if (!changes.length) return res.status(400).json({ error: 'no_changes' })
    const id = crypto.randomUUID()
    const createdAt = Date.now()
    const requesterId = requesterEmail || String(req.user?.role || '')
    const requestedChanges = JSON.stringify({ changes })
    db.run(
      'INSERT INTO approvals (id, entityType, entityId, requesterId, approverId, status, requestedChanges, approverNotes, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, entityType, entityId, requesterId, null, 'pending', requestedChanges, null, createdAt, null],
      async (ierr) => {
        if (ierr) return res.status(500).json({ error: ierr.message })
        writeAudit(role, 'approvals', 'create', null, { id, entityType, entityId, requesterId, status: 'pending', requestedChanges, createdAt })
        const requester = await resolveUserDisplay(requesterId).catch(() => null)
        res.json({ id, entityType, entityId, status: 'pending', requester, createdAt })
      }
    )
  })
})

app.get('/api/approvals', async (req, res) => {
  const role = req.user?.role
  if (!(role === 'Player' || role === 'Coach' || role === 'SchoolAdmin' || role === 'ZoneCoordinator' || role === 'EPHSRUAdmin')) {
    return res.status(403).json({ error: 'forbidden' })
  }

  const entityType = String(req.query.entityType || 'players')
  const status = String(req.query.status || '')
  const entityId = String(req.query.entityId || '')
  const requesterRole = String(req.query.requesterRole || '')
  const approverRole = String(req.query.approverRole || '')
  const fromTs = Number(req.query.fromTs || 0)
  const toTs = Number(req.query.toTs || 0)
  const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1)
  const pageSize = Math.min(100, Math.max(5, parseInt(String(req.query.pageSize || '20'), 10) || 20))
  const offset = (page - 1) * pageSize

  const conditions = ['a.entityType = ?']
  const params = [entityType]
  if (status) { conditions.push('a.status = ?'); params.push(status) }
  if (entityId) { conditions.push('a.entityId = ?'); params.push(entityId) }
  if (Number.isFinite(fromTs) && fromTs > 0) { conditions.push('a.createdAt >= ?'); params.push(fromTs) }
  if (Number.isFinite(toTs) && toTs > 0) { conditions.push('a.createdAt <= ?'); params.push(toTs) }

  if (entityType === 'players' && requesterRole) {
    if (requesterRole === 'Player') conditions.push('LOWER(p.email) = LOWER(a.requesterId)')
    if (requesterRole === 'Coach') conditions.push('EXISTS (SELECT 1 FROM coaches cx WHERE LOWER(cx.email) = LOWER(a.requesterId))')
    if (requesterRole === 'SchoolAdmin') conditions.push("EXISTS (SELECT 1 FROM admins ax WHERE LOWER(ax.email) = LOWER(a.requesterId) AND ax.role = 'SchoolAdmin')")
  }
  if (entityType === 'players' && approverRole) {
    if (approverRole === 'Coach') conditions.push('EXISTS (SELECT 1 FROM coaches cy WHERE LOWER(cy.email) = LOWER(a.approverId))')
    if (approverRole === 'SchoolAdmin') conditions.push("EXISTS (SELECT 1 FROM admins ay WHERE LOWER(ay.email) = LOWER(a.approverId) AND ay.role = 'SchoolAdmin')")
    if (approverRole === 'EPHSRUAdmin') conditions.push("EXISTS (SELECT 1 FROM admins az WHERE LOWER(az.email) = LOWER(a.approverId) AND az.role = 'EPHSRUAdmin')")
  }

  if (entityType === 'players') {
    if (role === 'Coach' || role === 'SchoolAdmin') {
      conditions.push('p.schoolId = ?')
      params.push(String(req.user?.schoolId || ''))
    }
    if (role === 'ZoneCoordinator') {
      conditions.push('p.zoneId = ?')
      params.push(String(req.user?.zoneId || ''))
    }
    if (role === 'Player') {
      const email = String(req.user?.email || '').trim().toLowerCase()
      conditions.push('LOWER(p.email) = ?')
      params.push(email)
    }
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const baseFrom = entityType === 'players'
    ? "FROM approvals a LEFT JOIN players p ON p.id = a.entityId"
    : 'FROM approvals a'

  db.get(`SELECT COUNT(1) as c ${baseFrom} ${where}`, params, (cerr, crow) => {
    if (cerr) return res.status(500).json({ error: cerr.message })
    const total = Number(crow?.c || 0)
    const sql = entityType === 'players'
      ? `SELECT a.*, p.name as playerName, p.surname as playerSurname, p.idNumber as playerIdNumber, p.email as playerEmail, p.schoolId as playerSchoolId, p.zoneId as playerZoneId ${baseFrom} ${where} ORDER BY a.createdAt DESC LIMIT ? OFFSET ?`
      : `SELECT a.* ${baseFrom} ${where} ORDER BY a.createdAt DESC LIMIT ? OFFSET ?`

    const p2 = [...params, pageSize, offset]
    db.all(sql, p2, async (err, rows) => {
      if (err) return res.status(500).json({ error: err.message })
      const out = []
      for (const r of rows || []) {
        let requested = null
        try { requested = JSON.parse(r.requestedChanges || '{}') } catch { requested = null }
        const requester = await resolveUserDisplay(r.requesterId).catch(() => null)
        const approver = await resolveUserDisplay(r.approverId).catch(() => null)
        out.push({
          id: r.id,
          entityType: r.entityType,
          entityId: r.entityId,
          status: r.status,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
          requester,
          approver,
          approverNotes: r.approverNotes || '',
          requestedChanges: requested?.changes || [],
          player: r.entityType === 'players' ? {
            id: r.entityId,
            name: r.playerName || '',
            surname: r.playerSurname || '',
            idNumber: r.playerIdNumber || '',
            email: r.playerEmail || '',
            schoolId: r.playerSchoolId || '',
            zoneId: r.playerZoneId || ''
          } : null
        })
      }
      res.json({ page, pageSize, total, rows: out })
    })
  })
})

app.post('/api/approvals/:id/decision', async (req, res) => {
  const role = req.user?.role
  if (!(role === 'Coach' || role === 'SchoolAdmin' || role === 'EPHSRUAdmin' || role === 'ZoneCoordinator')) {
    return res.status(403).json({ error: 'forbidden' })
  }
  const id = String(req.params.id || '').trim()
  const status = String(req.body.status || '').trim()
  const notes = String(req.body.notes || '').trim()
  if (!(status === 'approved' || status === 'rejected')) return res.status(400).json({ error: 'bad_status' })

  db.get('SELECT * FROM approvals WHERE id = ?', [id], (err, approval) => {
    if (err) return res.status(500).json({ error: err.message })
    if (!approval) return res.status(404).json({ error: 'not_found' })
    
    // Check if user has permission to override
    const isOverride = approval.status !== 'pending'
    if (isOverride) {
      if (role === 'EPHSRUAdmin') {
        // Allowed
      } else if (role === 'ZoneCoordinator') {
        // Can override Coach/SchoolAdmin but not EPHSRUAdmin
        if (approval.deciderRole === 'EPHSRUAdmin') return res.status(403).json({ error: 'forbidden_override' })
      } else if (role === 'SchoolAdmin') {
        // Can override Coach but not ZoneCoordinator/EPHSRUAdmin
        if (approval.deciderRole === 'ZoneCoordinator' || approval.deciderRole === 'EPHSRUAdmin') return res.status(403).json({ error: 'forbidden_override' })
        // SchoolAdmin can only override requests for their school
        // (Will be checked later by player school check, but ensure we don't leak permissions here)
      } else {
        // Coach or Player cannot override
        return res.status(400).json({ error: 'not_pending' })
      }
    }

    if (String(approval.entityType || '') !== 'players') return res.status(400).json({ error: 'unsupported_entityType' })

    db.get('SELECT * FROM players WHERE id = ?', [approval.entityId], (perr, player) => {
      if (perr) return res.status(500).json({ error: perr.message })
      if (!player) return res.status(404).json({ error: 'not_found' })
      if ((role === 'Coach' || role === 'SchoolAdmin') && String(player.schoolId || '') !== String(req.user?.schoolId || '')) {
        return res.status(403).json({ error: 'forbidden' })
      }

      let parsed = null
      try { parsed = JSON.parse(approval.requestedChanges || '{}') } catch { parsed = null }
      const changes = sanitizeApprovalChanges('players', parsed?.changes || [])
      const now = Date.now()
      const approverId = String(req.user?.email || '').trim().toLowerCase() || String(req.user?.role || '')
      const prevStatus = approval.status

      const finalize = (updatedPlayer) => {
        db.run(
          'UPDATE approvals SET status = ?, approverId = ?, approverNotes = ?, updatedAt = ?, deciderRole = ? WHERE id = ?',
          [status, approverId || null, notes || null, now, role, id],
          async (uerr) => {
            if (uerr) return res.status(500).json({ error: uerr.message })
            writeAudit(role, 'approvals', 'decision', { id, status: prevStatus }, { id, status, approverId, notes, updatedAt: now, deciderRole: role })
            const requester = await resolveUserDisplay(approval.requesterId).catch(() => null)
            const approver = await resolveUserDisplay(approverId).catch(() => null)
            const fieldList = changes.map((c) => c.field).join(', ') || 'profile details'
            queueNotification(
              approval.requesterId,
              status === 'approved' ? 'Profile update approved' : 'Profile update rejected',
              status === 'approved'
                ? `Your requested change to ${fieldList} has been approved and applied.`
                : `Your requested change to ${fieldList} was not approved.${notes ? ` Note: ${notes}` : ''}`
            )
            res.json({ id, prevStatus, status, requester, approver, updatedAt: now, player: updatedPlayer || null })
          }
        )
      }

      if (status === 'approved') {
        const beforeObj = { id: player.id, ...(() => { try { return JSON.parse(player.data || '{}') } catch { return {} } })() }
        applyPlayerApprovedChanges(player, changes, (aerr, updatedPlayer) => {
          if (aerr) return res.status(500).json({ error: aerr.message })
          const afterObj = { id: updatedPlayer.id, ...(() => { try { return JSON.parse(updatedPlayer.data || '{}') } catch { return {} } })() }
          writeAudit(role, 'players', 'approval_apply', beforeObj, afterObj)
          finalize(updatedPlayer)
        })
      } else {
        finalize(null)
      }
    })
  })
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

// Public school catalog (limited fields) for migration destination selection
app.get('/api/schools/catalog', (req, res) => {
  const role = req.user?.role
  // Players need the directory to pick a transfer destination; it exposes school names only
  if (!(role === 'Coach' || role === 'SchoolAdmin' || role === 'ZoneCoordinator' || role === 'EPHSRUAdmin' || role === 'Player')) {
    return res.status(403).json({ error: 'forbidden' })
  }
  db.all('SELECT schoolId, zoneId, data, ts FROM schools ORDER BY ts DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message })
    const seen = new Set()
    const out = []
    for (const r of rows || []) {
      const sid = String(r.schoolId || '')
      if (!sid || seen.has(sid)) continue
      seen.add(sid)
      let d = {}
      try { d = JSON.parse(r.data || '{}') } catch { d = {} }
      out.push({ schoolId: sid, zoneId: String(r.zoneId || ''), name: String(d.name || ''), quintileCategory: String(d.quintileCategory || '') })
    }
    res.json(out)
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

// Players endpoints
function normalizeIdNumber(v) {
  const s = String(v || '').trim()
  if (!s) return ''
  return s.replace(/\s+/g, '').toUpperCase()
}

function parseDataField(v) {
  if (!v) return {}
  if (typeof v === 'string') {
    try { return JSON.parse(v || '{}') } catch { return {} }
  }
  if (typeof v === 'object') return v
  return {}
}

function mergePlayerData(row, body) {
  const existing = parseDataField(row?.data)
  return { ...existing, ...body }
}

function scopeMigrationRequestsWhere(user) {
  const role = user?.role
  const where = []
  const params = []
  if (role === 'Coach' || role === 'SchoolAdmin') {
    where.push('mr.toSchoolId = ?')
    params.push(String(user?.schoolId || ''))
  }
  if (role === 'Coach') {
    where.push('mr.toZoneId = ?')
    params.push(String(user?.zoneId || ''))
  }
  if (role === 'ZoneCoordinator') {
    where.push('mr.toZoneId = ?')
    params.push(String(user?.zoneId || ''))
  }
  if (role === 'Player') {
    where.push('LOWER(p.email) = ?')
    params.push(String(user?.email || '').trim().toLowerCase())
  }
  return { where, params }
}

function applyMigrationToPlayerRow(playerRow, toZoneId, toSchoolId, now) {
  const fromZoneId = String(playerRow.zoneId || '')
  const fromSchoolId = String(playerRow.schoolId || '')
  const updatedData = mergePlayerData(playerRow, {
    zoneId: toZoneId,
    schoolId: toSchoolId,
    currentZoneId: toZoneId,
    currentSchoolId: toSchoolId,
    lastMigrationAt: now
  })

  if (!updatedData.initialSchoolId) updatedData.initialSchoolId = fromSchoolId
  if (!updatedData.initialZoneId) updatedData.initialZoneId = fromZoneId

  if (!updatedData.originalRegisteredAt && updatedData.registeredAt) updatedData.originalRegisteredAt = updatedData.registeredAt
  if (!updatedData.originalRegistrationYear && updatedData.registrationYear) updatedData.originalRegistrationYear = updatedData.registrationYear
  updatedData.registeredAt = now
  updatedData.registrationYear = new Date(now).getFullYear()
  return updatedData
}

// Unique registration endpoint (idNumber is the primary key)
app.post('/api/players/register', (req, res) => {
  if (!allowPost('players', req.user?.role)) return res.status(403).json({ error: 'forbidden' })
  if (!withinScope('players', req.user, req.body)) return res.status(403).json({ error: 'scope' })
  const idNumber = normalizeIdNumber(req.body.idNumber)
  if (!idNumber) return res.status(400).json({ error: 'idNumber_required' })

  const email = String(req.body.email || '').trim().toLowerCase()
  const q = 'SELECT id, zoneId, schoolId, data, ts FROM players WHERE UPPER(REPLACE(idNumber, " ", "")) = ?'
  db.get(q, [idNumber], (err, existing) => {
    if (err) return res.status(500).json({ error: err.message })
    if (existing) {
      const d = parseDataField(existing.data)
      return res.status(409).json({
        error: 'duplicate_idNumber',
        playerId: existing.id,
        currentSchoolId: existing.schoolId,
        currentZoneId: existing.zoneId,
        registrationYear: d.registrationYear,
        registeredAt: d.registeredAt
      })
    }
    if (email) {
      return db.get('SELECT id FROM players WHERE email = ?', [email], (err2, row) => {
        if (err2) return res.status(500).json({ error: err2.message })
        if (row) return res.status(409).json({ error: 'duplicate_email', playerId: row.id })
        createNew()
      })
    }
    createNew()
  })

  function createNew() {
    const id = crypto.randomUUID()
    const ts = Date.now()
    const regYear = new Date().getFullYear()
    const body = { ...req.body }
    body.idNumber = normalizeIdNumber(body.idNumber)
    if (body.registrationYear === undefined || body.registrationYear === null || body.registrationYear === '') body.registrationYear = regYear
    if (body.registeredAt === undefined || body.registeredAt === null || body.registeredAt === '') body.registeredAt = ts
    if (!body.initialSchoolId) body.initialSchoolId = body.schoolId || ''
    if (!body.initialZoneId) body.initialZoneId = body.zoneId || ''
    body.currentSchoolId = body.schoolId || ''
    body.currentZoneId = body.zoneId || ''
    // Self-registrations enter the coach's review queue; staff-created players are trusted
    if (!body.status && (!req.user?.role || req.user.role === 'Player')) body.status = 'pending'

    const data = JSON.stringify(body)
    db.run(
      'INSERT INTO players (id, zoneId, schoolId, name, surname, idNumber, dateOfBirth, gender, ageGroup, contactNumber, email, parentContact, parentEmail, data, ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, body.zoneId || '', body.schoolId || '', body.name || '', body.surname || '',
       body.idNumber || null, body.dateOfBirth || null, body.gender || null, body.ageGroup || null,
       body.contactNumber || null, body.email || null, body.parentContact || null, body.parentEmail || null, data, ts],
      function(err3) {
        if (err3) return res.status(500).json({ error: err3.message })
        writeAudit(req.user?.role, 'players', 'register', null, { id, ...body })
        res.json({ id, ts })
      }
    )
  }
})

app.post('/api/players', (req, res) => {
  if (!allowPost('players', req.user?.role)) return res.status(403).json({ error: 'forbidden' })
  if (!withinScope('players', req.user, req.body)) return res.status(403).json({ error: 'scope' })
  const email = String(req.body.email || '').trim().toLowerCase()
  const idNumber = normalizeIdNumber(req.body.idNumber)
  if (idNumber) {
    return db.get('SELECT id FROM players WHERE UPPER(REPLACE(idNumber, " ", "")) = ?', [idNumber], (errId, rowId) => {
      if (errId) return res.status(500).json({ error: errId.message })
      if (rowId) return res.status(409).json({ error: 'duplicate_idNumber', playerId: rowId.id })
      createLegacy()
    })
  }
  if (email) {
    return db.get('SELECT id FROM players WHERE email = ?', [email], (err, row) => {
      if (err) return res.status(500).json({ error: err.message })
      if (row) return res.status(409).json({ error: 'duplicate_email' })
      createLegacy()
    })
  }
  createLegacy()
  function createLegacy() {
    const id = crypto.randomUUID()
    const ts = Date.now()
    const regYear = new Date().getFullYear()
    const body = { ...req.body }
    if (body.idNumber) body.idNumber = normalizeIdNumber(body.idNumber)
    if (body.registrationYear === undefined || body.registrationYear === null || body.registrationYear === '') body.registrationYear = regYear
    if (body.registeredAt === undefined || body.registeredAt === null || body.registeredAt === '') body.registeredAt = ts
    if (!body.initialSchoolId) body.initialSchoolId = body.schoolId || ''
    if (!body.initialZoneId) body.initialZoneId = body.zoneId || ''
    if (!body.currentSchoolId) body.currentSchoolId = body.schoolId || ''
    if (!body.currentZoneId) body.currentZoneId = body.zoneId || ''
    const data = JSON.stringify(body)
    db.run(
      'INSERT INTO players (id, zoneId, schoolId, name, surname, idNumber, dateOfBirth, gender, ageGroup, contactNumber, email, parentContact, parentEmail, data, ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, body.zoneId || '', body.schoolId || '', body.name || '', body.surname || '',
       body.idNumber || null, body.dateOfBirth || null, body.gender || null, body.ageGroup || null,
       body.contactNumber || null, body.email || null, body.parentContact || null, body.parentEmail || null, data, ts],
      function(err) {
        if (err) return res.status(500).json({ error: err.message })
        writeAudit(req.user?.role, 'players', 'create', null, { id, ...body })
        res.json({ id, ts })
      }
    )
  }
})

// Player lookup by idNumber/email for migration/search
app.get('/api/players/lookup', (req, res) => {
  const role = req.user?.role
  if (!(role === 'Coach' || role === 'SchoolAdmin' || role === 'ZoneCoordinator' || role === 'EPHSRUAdmin')) {
    return res.status(403).json({ error: 'forbidden' })
  }
  const idNumber = normalizeIdNumber(req.query.idNumber)
  const email = String(req.query.email || '').trim().toLowerCase()
  if (!idNumber && !email) return res.status(400).json({ error: 'query_required' })

  const where = idNumber ? 'UPPER(REPLACE(idNumber, " ", "")) = ?' : 'LOWER(email) = ?'
  const param = idNumber ? idNumber : email
  db.get(`SELECT * FROM players WHERE ${where} LIMIT 1`, [param], (err, row) => {
    if (err) return res.status(500).json({ error: err.message })
    if (!row) return res.status(404).json({ error: 'not_found' })
    if (!allowUpdate('players', role, req.user, row) && role !== 'ZoneCoordinator') {
      return res.status(403).json({ error: 'forbidden' })
    }
    if (role === 'ZoneCoordinator' && String(row.zoneId || '') !== String(req.user?.zoneId || '')) {
      return res.status(403).json({ error: 'forbidden' })
    }
    db.all('SELECT * FROM migrations WHERE playerId = ? ORDER BY migrationDate DESC', [row.id], (merr, migrations) => {
      if (merr) return res.status(500).json({ error: merr.message })
      res.json({ player: row, migrations: migrations || [] })
    })
  })
})

// Player history: registration + migrations + audits timeline
app.get('/api/players/:id/history', (req, res) => {
  const role = req.user?.role
  if (!role) return res.status(403).json({ error: 'forbidden' })
  db.get('SELECT * FROM players WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message })
    if (!row) return res.status(404).json({ error: 'not_found' })

    const emailL = String(req.user?.email || '').trim().toLowerCase()
    if (role === 'Player') {
      const rowEmail = String(row.email || '').trim().toLowerCase()
      if (!rowEmail || rowEmail !== emailL) return res.status(403).json({ error: 'forbidden' })
    }
    if (role === 'Coach' || role === 'SchoolAdmin') {
      if (String(row.schoolId || '') !== String(req.user?.schoolId || '')) return res.status(403).json({ error: 'forbidden' })
    }
    if (role === 'ZoneCoordinator') {
      if (String(row.zoneId || '') !== String(req.user?.zoneId || '')) return res.status(403).json({ error: 'forbidden' })
    }

    const data = (() => { try { return JSON.parse(row.data || '{}') } catch { return {} } })()
    const migrationsSql = 'SELECT * FROM migrations WHERE playerId = ? ORDER BY migrationDate DESC'
    db.all(migrationsSql, [row.id], (merr, migrations) => {
      if (merr) return res.status(500).json({ error: merr.message })
      const migrationsAsc = (Array.isArray(migrations) ? migrations : []).slice().sort((a, b) => Number(a?.migrationDate || 0) - Number(b?.migrationDate || 0))
      const token = `\"id\":\"${String(row.id).replace(/"/g, '')}\"`
      const like = `%${token}%`
      const auditsSql = "SELECT id, userRole, entity, action, before, after, ts FROM audits WHERE entity = 'players' AND (before LIKE ? OR after LIKE ?) ORDER BY ts DESC LIMIT 200"
      db.all(auditsSql, [like, like], (aerr, audits) => {
        if (aerr) return res.status(500).json({ error: aerr.message })
        db.all('SELECT * FROM migration_requests WHERE playerId = ? ORDER BY requestedAt DESC LIMIT 50', [row.id], (rerr, reqs) => {
          if (rerr) return res.status(500).json({ error: rerr.message })

          const startTs = (() => {
            const v = Number(data.registeredAt || 0)
            if (Number.isFinite(v) && v > 0) return v
            const t = Number(row.ts || 0)
            return Number.isFinite(t) && t > 0 ? t : 0
          })()
          const initialSchool = String(
            (migrationsAsc[0]?.fromSchoolId || '') ||
            (data.initialSchoolId || '') ||
            (data.currentSchoolId || '') ||
            (row.schoolId || '')
          )
          const timeline = []
          let segStart = startTs
          let segSchool = initialSchool
          for (const m of migrationsAsc) {
            const end = Number(m?.migrationDate || 0)
            if (segSchool && segStart && end && end >= segStart) {
              timeline.push({ schoolId: segSchool, fromTs: segStart, toTs: end })
            }
            segStart = end || segStart
            segSchool = String(m?.toSchoolId || segSchool)
          }
          const currentSchoolId = String(data.currentSchoolId || row.schoolId || segSchool || '')
          if (currentSchoolId && segStart) {
            timeline.push({ schoolId: currentSchoolId, fromTs: segStart, toTs: null })
          }

          res.json({
            player: row,
            registration: {
              registrationYear: data.registrationYear || null,
              registeredAt: data.registeredAt || null,
              initialSchoolId: data.initialSchoolId || null,
              initialZoneId: data.initialZoneId || null,
              currentSchoolId: data.currentSchoolId || row.schoolId || null,
              currentZoneId: data.currentZoneId || row.zoneId || null
            },
            attendanceTimeline: timeline,
            migrations: migrations || [],
            migrationRequests: reqs || [],
            audits: audits || []
          })
        })
      })
    })
  })
})

// Player migration endpoint
app.post('/api/players/:id/migrate', (req, res) => {
  const role = req.user?.role
  if (!(role === 'Coach' || role === 'SchoolAdmin' || role === 'EPHSRUAdmin' || role === 'Player')) {
    return res.status(403).json({ error: 'forbidden' })
  }
  const toSchoolId = String(req.body.toSchoolId || '').trim()
  if (!toSchoolId) return res.status(400).json({ error: 'toSchoolId_required' })
  db.get('SELECT * FROM players WHERE id = ?', [req.params.id], (err, player) => {
    if (err) return res.status(500).json({ error: err.message })
    if (!player) return res.status(404).json({ error: 'not_found' })
    if (role !== 'Player') {
      if (!allowUpdate('players', role, req.user, player)) return res.status(403).json({ error: 'forbidden' })
    }
    if ((role === 'Coach' || role === 'SchoolAdmin') && String(player.schoolId || '') !== String(req.user?.schoolId || '')) {
      return res.status(403).json({ error: 'forbidden' })
    }
    if (role === 'Player') {
      const userEmail = String(req.user?.email || '').trim().toLowerCase()
      const rowEmail = String(player.email || '').trim().toLowerCase()
      if (!userEmail || !rowEmail || userEmail !== rowEmail) return res.status(403).json({ error: 'forbidden' })
    }

    db.get('SELECT id, zoneId, schoolId, data FROM schools WHERE schoolId = ? LIMIT 1', [toSchoolId], (serr, school) => {
      if (serr) return res.status(500).json({ error: serr.message })
      if (!school) return res.status(400).json({ error: 'unknown_school' })

      const fromZoneId = String(player.zoneId || '')
      const fromSchoolId = String(player.schoolId || '')
      const toZoneId = String(school.zoneId || '')
      const now = Date.now()
      if (fromSchoolId === toSchoolId) return res.status(400).json({ error: 'already_at_school' })

      const requesterEmail = String(req.user?.email || '').trim().toLowerCase()
      const requestId = crypto.randomUUID()
      const reason = String(req.body.reason || '').trim()
      const data = JSON.stringify({ byRole: role, requesterEmail, reason })
      db.run(
        'INSERT INTO migration_requests (id, playerId, fromZoneId, fromSchoolId, toZoneId, toSchoolId, status, reason, requesterRole, requesterEmail, requestedAt, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [requestId, player.id, fromZoneId, fromSchoolId, toZoneId, toSchoolId, 'pending', reason, role, requesterEmail, now, data],
        function(rerr) {
          if (rerr) return res.status(500).json({ error: rerr.message })
          writeAudit(role, 'migration_requests', 'create', null, { id: requestId, playerId: player.id, fromSchoolId, toSchoolId, ts: now })
          return res.json({ requestId, status: 'pending', playerId: player.id, fromSchoolId, toSchoolId, toZoneId })
        }
      )
    })
  })
})

app.get('/api/migration-requests', (req, res) => {
  const role = req.user?.role
  if (!(role === 'Coach' || role === 'SchoolAdmin' || role === 'ZoneCoordinator' || role === 'EPHSRUAdmin' || role === 'Player')) {
    return res.status(403).json({ error: 'forbidden' })
  }
  const status = String(req.query.status || '').trim().toLowerCase()
  const { where, params } = scopeMigrationRequestsWhere(req.user)
  const conditions = [...where]
  const qParams = [...params]
  if (status) {
    conditions.push('mr.status = ?')
    qParams.push(status)
  }
  let sql = `SELECT mr.*, p.name as playerName, p.surname as playerSurname, p.idNumber as playerIdNumber, p.email as playerEmail FROM migration_requests mr LEFT JOIN players p ON p.id = mr.playerId`
  if (conditions.length) sql += ` WHERE ${conditions.join(' AND ')}`
  sql += ' ORDER BY mr.requestedAt DESC LIMIT 200'
  db.all(sql, qParams, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message })
    const out = (rows || []).map((r) => ({
      id: r.id,
      playerId: r.playerId,
      fromZoneId: r.fromZoneId,
      fromSchoolId: r.fromSchoolId,
      toZoneId: r.toZoneId,
      toSchoolId: r.toSchoolId,
      status: r.status,
      reason: r.reason || '',
      requesterRole: r.requesterRole || '',
      requesterEmail: r.requesterEmail || '',
      requestedAt: r.requestedAt,
      deciderRole: r.deciderRole || '',
      deciderEmail: r.deciderEmail || '',
      decidedAt: r.decidedAt || null,
      decisionReason: r.decisionReason || '',
      player: {
        id: r.playerId,
        name: r.playerName || '',
        surname: r.playerSurname || '',
        idNumber: r.playerIdNumber || '',
        email: r.playerEmail || ''
      }
    }))
    res.json(out)
  })
})

app.get('/api/migration-requests/:id', (req, res) => {
  const role = req.user?.role
  if (!(role === 'Coach' || role === 'SchoolAdmin' || role === 'ZoneCoordinator' || role === 'EPHSRUAdmin' || role === 'Player')) {
    return res.status(403).json({ error: 'forbidden' })
  }
  db.get('SELECT * FROM migration_requests WHERE id = ?', [req.params.id], (err, mr) => {
    if (err) return res.status(500).json({ error: err.message })
    if (!mr) return res.status(404).json({ error: 'not_found' })

    if (role === 'Coach' || role === 'SchoolAdmin') {
      const schoolId = String(req.user?.schoolId || '')
      if (String(mr.toSchoolId || '') !== schoolId && String(mr.fromSchoolId || '') !== schoolId) {
        return res.status(403).json({ error: 'forbidden' })
      }
    }
    if (role === 'Coach') {
      const zoneId = String(req.user?.zoneId || '')
      if (String(mr.toZoneId || '') !== zoneId && String(mr.fromZoneId || '') !== zoneId) {
        return res.status(403).json({ error: 'forbidden' })
      }
    }
    if (role === 'ZoneCoordinator') {
      const zoneId = String(req.user?.zoneId || '')
      if (String(mr.toZoneId || '') !== zoneId && String(mr.fromZoneId || '') !== zoneId) {
        return res.status(403).json({ error: 'forbidden' })
      }
    }

    db.get('SELECT * FROM players WHERE id = ?', [mr.playerId], (perr, player) => {
      if (perr) return res.status(500).json({ error: perr.message })
      if (!player) return res.status(404).json({ error: 'player_not_found' })

      if (role === 'Player') {
        const userEmail = String(req.user?.email || '').trim().toLowerCase()
        const rowEmail = String(player.email || '').trim().toLowerCase()
        if (!userEmail || !rowEmail || userEmail !== rowEmail) return res.status(403).json({ error: 'forbidden' })
      }

      let pdata = {}
      try { pdata = typeof player.data === 'string' ? JSON.parse(player.data || '{}') : (player.data || {}) } catch { pdata = {} }

      const out = {
        id: mr.id,
        status: mr.status,
        reason: mr.reason || '',
        requestedAt: mr.requestedAt,
        requesterRole: mr.requesterRole || '',
        requesterEmail: mr.requesterEmail || '',
        decidedAt: mr.decidedAt || null,
        deciderRole: mr.deciderRole || '',
        deciderEmail: mr.deciderEmail || '',
        decisionReason: mr.decisionReason || '',
        fromZoneId: mr.fromZoneId,
        fromSchoolId: mr.fromSchoolId,
        toZoneId: mr.toZoneId,
        toSchoolId: mr.toSchoolId,
        player: {
          id: player.id,
          zoneId: player.zoneId,
          schoolId: player.schoolId,
          name: player.name,
          surname: player.surname,
          idNumber: player.idNumber,
          dateOfBirth: player.dateOfBirth,
          gender: player.gender,
          ageGroup: player.ageGroup,
          email: player.email,
          contactNumber: player.contactNumber,
          parentContact: player.parentContact,
          parentEmail: player.parentEmail,
          data: pdata,
          ts: player.ts
        }
      }

      return res.json(out)
    })
  })
})

app.post('/api/migration-requests/:id/decision', (req, res) => {
  const role = req.user?.role
  if (!(role === 'Coach' || role === 'SchoolAdmin' || role === 'EPHSRUAdmin')) {
    return res.status(403).json({ error: 'forbidden' })
  }
  const decision = String(req.body.status || req.body.decision || '').trim().toLowerCase()
  if (!(decision === 'accepted' || decision === 'rejected')) return res.status(400).json({ error: 'invalid_status' })
  const decisionReason = String(req.body.reason || req.body.decisionReason || '').trim()

  db.get('SELECT * FROM migration_requests WHERE id = ?', [req.params.id], (err, mr) => {
    if (err) return res.status(500).json({ error: err.message })
    if (!mr) return res.status(404).json({ error: 'not_found' })
    if (String(mr.status || '') !== 'pending') return res.status(400).json({ error: 'not_pending' })

    if (role === 'Coach' || role === 'SchoolAdmin') {
      if (String(mr.toSchoolId || '') !== String(req.user?.schoolId || '')) return res.status(403).json({ error: 'forbidden' })
    }
    if (role === 'Coach') {
      if (String(mr.toZoneId || '') !== String(req.user?.zoneId || '')) return res.status(403).json({ error: 'forbidden' })
    }

    const now = Date.now()
    const deciderEmail = String(req.user?.email || '').trim().toLowerCase()

    const finalizeDecision = (extra = {}) => {
      db.run(
        'UPDATE migration_requests SET status = ?, decidedAt = ?, deciderRole = ?, deciderEmail = ?, decisionReason = ? WHERE id = ?',
        [decision, now, role, deciderEmail, decisionReason, mr.id],
        function(uerr) {
          if (uerr) return res.status(500).json({ error: uerr.message })
          writeAudit(role, 'migration_requests', 'decision', { id: mr.id, status: 'pending' }, { id: mr.id, status: decision, decidedAt: now })
          const transferMsg = decision === 'accepted'
            ? `The transfer request to ${mr.toSchoolId} has been accepted. The player record has moved to the new school.`
            : `The transfer request to ${mr.toSchoolId} was rejected.${decisionReason ? ` Reason: ${decisionReason}` : ''}`
          if (mr.requesterEmail) queueNotification(mr.requesterEmail, `School transfer ${decision}`, transferMsg)
          db.get('SELECT email FROM players WHERE id = ?', [mr.playerId], (nerr, p) => {
            if (!nerr && p?.email && String(p.email).toLowerCase() !== String(mr.requesterEmail || '').toLowerCase()) {
              queueNotification(p.email, `School transfer ${decision}`, transferMsg)
            }
          })
          res.json({ ok: true, id: mr.id, status: decision, ...extra })
        }
      )
    }

    if (decision === 'rejected') return finalizeDecision()

    db.get('SELECT * FROM players WHERE id = ?', [mr.playerId], (perr, player) => {
      if (perr) return res.status(500).json({ error: perr.message })
      if (!player) return res.status(404).json({ error: 'player_not_found' })
      if (String(player.schoolId || '') !== String(mr.fromSchoolId || '') || String(player.zoneId || '') !== String(mr.fromZoneId || '')) {
        return res.status(409).json({ error: 'player_moved', currentSchoolId: player.schoolId, currentZoneId: player.zoneId })
      }
      db.get('SELECT id, zoneId, schoolId, data FROM schools WHERE schoolId = ? LIMIT 1', [mr.toSchoolId], (serr, school) => {
        if (serr) return res.status(500).json({ error: serr.message })
        if (!school) return res.status(400).json({ error: 'unknown_school' })

        const toZoneId = String(school.zoneId || '')
        const toSchoolId = String(school.schoolId || '')

        const migrationId = crypto.randomUUID()
        const migrationData = JSON.stringify({ reason: mr.reason || '', byRole: mr.requesterRole || '', requestId: mr.id })
        db.run(
          'INSERT INTO migrations (id, playerId, fromZoneId, fromSchoolId, toZoneId, toSchoolId, migrationDate, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [migrationId, player.id, mr.fromZoneId, mr.fromSchoolId, toZoneId, toSchoolId, now, migrationData],
          function(merr) {
            if (merr) return res.status(500).json({ error: merr.message })
            const updatedData = applyMigrationToPlayerRow(player, toZoneId, toSchoolId, now)
            db.run(
              'UPDATE players SET zoneId = ?, schoolId = ?, data = ?, ts = ? WHERE id = ?',
              [toZoneId, toSchoolId, JSON.stringify(updatedData), now, player.id],
              function(uerr2) {
                if (uerr2) return res.status(500).json({ error: uerr2.message })
                writeAudit(role, 'migrations', 'create', null, { id: migrationId, playerId: player.id, fromSchoolId: mr.fromSchoolId, toSchoolId, migrationDate: now })
                db.get('SELECT * FROM players WHERE id = ?', [player.id], (gerr, updatedPlayer) => {
                  if (gerr || !updatedPlayer) return finalizeDecision({ migrationId, playerId: player.id })
                  return finalizeDecision({ migrationId, player: updatedPlayer })
                })
              }
            )
          }
        )
      })
    })
  })
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
    const out = filterByRole('players', rows, req.user)
    const missing = out.filter((r) => {
      try {
        const d = typeof r.data === 'string' ? JSON.parse(r.data || '{}') : (r.data || {})
        return !d || (!d.registeredAt && !d.registrationYear)
      } catch {
        return true
      }
    })
    if (!missing.length) {
      return res.json(out)
    }

    db.all("SELECT ts, after FROM audits WHERE entity = 'players' AND action = 'create'", [], (aerr, arows) => {
      if (aerr) {
        return res.json(out)
      }
      const createdTsById = new Map()
      for (const ar of arows || []) {
        try {
          const afterObj = JSON.parse(ar.after || '{}')
          const pid = String(afterObj.id || '')
          const pts = Number(ar.ts || 0)
          if (pid && pts) createdTsById.set(pid, pts)
        } catch {}
      }

      const nowYear = new Date().getFullYear()
      for (const r of out) {
        let parsed
        try { parsed = typeof r.data === 'string' ? JSON.parse(r.data || '{}') : (r.data || {}) } catch { parsed = {} }
        if (parsed && (parsed.registeredAt || parsed.registrationYear)) continue
        const createdTs = Number(createdTsById.get(String(r.id)) || 0)
        const regTs = createdTs || Number(r.ts || 0) || Date.now()
        const regYear = (() => { try { return new Date(regTs).getFullYear() } catch { return nowYear } })()
        const nextData = { ...parsed, registeredAt: regTs, registrationYear: regYear }
        r.data = JSON.stringify(nextData)
        try {
          db.run('UPDATE players SET data = ? WHERE id = ?', [JSON.stringify(nextData), r.id])
        } catch {}
      }
      res.json(out)
    })
  })
})

app.get('/api/players/:id', (req, res) => {
  db.get('SELECT * FROM players WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message })
    if (!row) return res.status(404).json({ error: 'not_found' })
    const list = filterByRole('players', [row], req.user)
    if (!list.length) return res.status(403).json({ error: 'forbidden' })
    return res.json(list[0])
  })
})

app.put('/api/players/:id', (req, res) => {
  db.get('SELECT * FROM players WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message })
    if (!row) return res.status(404).json({ error: 'not_found' })
    if (!allowUpdate('players', req.user?.role, req.user, row)) return res.status(403).json({ error: 'forbidden' })
    const r = req.user?.role
    if (r === 'Coach' || r === 'SchoolAdmin') {
      if (String(row.schoolId || '') !== String(req.user?.schoolId || '')) return res.status(403).json({ error: 'scope' })
      if (req.body.schoolId !== undefined && String(req.body.schoolId || '') !== String(row.schoolId || '')) return res.status(403).json({ error: 'scope' })
      if (req.body.zoneId !== undefined && String(req.body.zoneId || '') !== String(row.zoneId || '')) return res.status(403).json({ error: 'scope' })
      const existingData = JSON.parse(row.data || '{}')
      const denyIfChanged = (k) => {
        if (req.body[k] === undefined) return false
        return String(req.body[k] || '') !== String(existingData[k] || '')
      }
      if (denyIfChanged('initialSchoolId') || denyIfChanged('initialZoneId') || denyIfChanged('currentSchoolId') || denyIfChanged('currentZoneId')) {
        return res.status(403).json({ error: 'forbidden' })
      }
    } else {
      if (!withinScope('players', req.user, req.body)) return res.status(403).json({ error: 'scope' })
    }
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
        db.get('SELECT * FROM players WHERE id = ?', [req.params.id], (err2, updated) => {
          if (err2 || !updated) return res.json({ ...row, ...req.body, ts })
          writeAudit(req.user?.role, 'players', 'update', row, updated)
          res.json(updated)
        })
      }
    )
  })
})

// Coaches endpoints
app.post('/api/coaches', (req, res) => {
  if (!allowPost('coaches', req.user?.role)) return res.status(403).json({ error: 'forbidden' })
  if (!withinScope('coaches', req.user, req.body)) return res.status(403).json({ error: 'scope' })
  const email = String(req.body.email || '').trim().toLowerCase()
  if (email) {
    return db.get('SELECT id FROM coaches WHERE email = ?', [email], (err, row) => {
      if (err) return res.status(500).json({ error: err.message })
      if (row) return res.status(409).json({ error: 'duplicate_email' })
      createCoach()
    })
  }
  function createCoach() {
  const id = crypto.randomUUID()
  const ts = Date.now()
  const data = JSON.stringify(req.body)
  
  db.run(
    'INSERT INTO coaches (id, zoneId, schoolId, name, surname, idNumber, contactNumber, email, qualifications, experience, data, ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, req.body.zoneId || '', req.body.schoolId || '', req.body.name || '', req.body.surname || '', 
     req.body.idNumber || null, req.body.contactNumber || null, req.body.email || null, 
     req.body.qualifications || null, req.body.experience || null, data, ts],
    function(err) {
      if (err) return res.status(500).json({ error: err.message })
      writeAudit(req.user?.role, 'coaches', 'create', null, { id, ...req.body })
      res.json({ id, ts })
    }
  )
  }
})

app.delete('/api/coaches/:id', (req, res) => {
  db.get('SELECT * FROM coaches WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message })
    if (!row) return res.status(404).json({ error: 'not_found' })
    if (!allowUpdate('coaches', req.user?.role, req.user, row)) return res.status(403).json({ error: 'forbidden' })
    db.run('DELETE FROM coaches WHERE id = ?', [req.params.id], function(derr) {
      if (derr) return res.status(500).json({ error: derr.message })
      writeAudit(req.user?.role, 'coaches', 'delete', row, null)
      res.json({ ok: true, id: req.params.id })
    })
  })
})

app.get('/api/coaches', (req, res) => {
  let query = 'SELECT * FROM coaches'
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
    res.json(filterByRole('coaches', rows, req.user))
  })
})

app.put('/api/coaches/:id', (req, res) => {
  db.get('SELECT * FROM coaches WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message })
    if (!row) return res.status(404).json({ error: 'not_found' })
    if (!allowUpdate('coaches', req.user?.role, req.user, row)) return res.status(403).json({ error: 'forbidden' })
    // Scope-check the merged result so partial updates (no schoolId in body)
    // pass, while attempts to MOVE the coach out of scope still fail.
    if (!withinScope('coaches', req.user, { ...row, ...req.body })) return res.status(403).json({ error: 'scope' })

    const existingData = JSON.parse(row.data || '{}')
    const updatedData = { ...existingData, ...req.body }
    const ts = Date.now()
    
    db.run(
      'UPDATE coaches SET zoneId = ?, schoolId = ?, name = ?, surname = ?, idNumber = ?, contactNumber = ?, email = ?, qualifications = ?, experience = ?, data = ?, ts = ? WHERE id = ?',
      [req.body.zoneId !== undefined ? req.body.zoneId : row.zoneId,
       req.body.schoolId !== undefined ? req.body.schoolId : row.schoolId,
       req.body.name !== undefined ? req.body.name : row.name,
       req.body.surname !== undefined ? req.body.surname : row.surname,
       req.body.idNumber !== undefined ? req.body.idNumber : row.idNumber,
       req.body.contactNumber !== undefined ? req.body.contactNumber : row.contactNumber,
       req.body.email !== undefined ? req.body.email : row.email,
       req.body.qualifications !== undefined ? req.body.qualifications : row.qualifications,
       req.body.experience !== undefined ? req.body.experience : row.experience,
       JSON.stringify(updatedData),
       ts,
       req.params.id],
      function(err) {
        if (err) return res.status(500).json({ error: err.message })
        db.get('SELECT * FROM coaches WHERE id = ?', [req.params.id], (err2, updated) => {
          if (err2 || !updated) return res.json({ ...row, ...req.body, ts })
          writeAudit(req.user?.role, 'coaches', 'update', row, updated)
          res.json(updated)
        })
      }
    )
  })
})

// Referees endpoints
app.post('/api/referees', (req, res) => {
  if (!allowPost('referees', req.user?.role)) return res.status(403).json({ error: 'forbidden' })
  if (!withinScope('referees', req.user, req.body)) return res.status(403).json({ error: 'scope' })

  const id = crypto.randomUUID()
  const ts = Date.now()
  const data = JSON.stringify(req.body)
  
  db.run(
    'INSERT INTO referees (id, name, surname, idNumber, contactNumber, email, qualifications, experience, data, ts, zoneId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, req.body.name || '', req.body.surname || '', req.body.idNumber || null, req.body.contactNumber || null, 
     req.body.email || null, req.body.qualifications || null, req.body.experience || null, data, ts, req.body.zoneId || null],
    function(err) {
      if (err) return res.status(500).json({ error: err.message })
      res.json({ id, ts })
    }
  )
})

app.get('/api/referees', (req, res) => {
  db.all('SELECT * FROM referees', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message })
    res.json(filterByRole('referees', rows, req.user))
  })
})

app.put('/api/referees/:id', (req, res) => {
  db.get('SELECT * FROM referees WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message })
    if (!row) return res.status(404).json({ error: 'not_found' })
    if (!allowUpdate('referees', req.user?.role, req.user, row)) return res.status(403).json({ error: 'forbidden' })
    if (!withinScope('referees', req.user, req.body)) return res.status(403).json({ error: 'scope' })
    
    const existingData = JSON.parse(row.data || '{}')
    const updatedData = { ...existingData, ...req.body }
    const ts = Date.now()
    
    db.run(
      'UPDATE referees SET name = ?, surname = ?, idNumber = ?, contactNumber = ?, email = ?, qualifications = ?, experience = ?, data = ?, ts = ?, zoneId = ? WHERE id = ?',
      [req.body.name !== undefined ? req.body.name : row.name,
       req.body.surname !== undefined ? req.body.surname : row.surname,
       req.body.idNumber !== undefined ? req.body.idNumber : row.idNumber,
       req.body.contactNumber !== undefined ? req.body.contactNumber : row.contactNumber,
       req.body.email !== undefined ? req.body.email : row.email,
       req.body.qualifications !== undefined ? req.body.qualifications : row.qualifications,
       req.body.experience !== undefined ? req.body.experience : row.experience,
       JSON.stringify(updatedData),
       ts,
       req.body.zoneId !== undefined ? req.body.zoneId : row.zoneId,
       req.params.id],
      function(err) {
        if (err) return res.status(500).json({ error: err.message })
        res.json({ ...row, ...req.body, ts })
      }
    )
  })
})

// Admins endpoints
app.post('/api/admins', (req, res) => {
  if (!allowPost('admins', req.user?.role)) return res.status(403).json({ error: 'forbidden' })
  if (req.user?.role === 'ZoneCoordinator' && !withinScope('admins', req.user, req.body)) return res.status(403).json({ error: 'scope' })

  const id = crypto.randomUUID()
  const ts = Date.now()
  const data = JSON.stringify(req.body)
  
  db.run(
    'INSERT INTO admins (id, name, surname, idNumber, contactNumber, email, role, zoneId, schoolId, data, ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, req.body.name || '', req.body.surname || '', req.body.idNumber || null, req.body.contactNumber || null, 
     req.body.email || null, req.body.role || null, req.body.zoneId || null, req.body.schoolId || null, data, ts],
    function(err) {
      if (err) return res.status(500).json({ error: err.message })
      res.json({ id, ts })
    }
  )
})

app.get('/api/admins', (req, res) => {
  db.all('SELECT * FROM admins', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message })
    res.json(filterByRole('admins', rows, req.user))
  })
})

app.put('/api/admins/:id', (req, res) => {
  db.get('SELECT * FROM admins WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message })
    if (!row) return res.status(404).json({ error: 'not_found' })
    if (!allowUpdate('admins', req.user?.role, req.user, row)) return res.status(403).json({ error: 'forbidden' })
    if (!withinScope('admins', req.user, req.body)) return res.status(403).json({ error: 'scope' })
    
    const existingData = JSON.parse(row.data || '{}')
    const updatedData = { ...existingData, ...req.body }
    const ts = Date.now()
    
    db.run(
      'UPDATE admins SET name = ?, surname = ?, idNumber = ?, contactNumber = ?, email = ?, role = ?, zoneId = ?, schoolId = ?, data = ?, ts = ? WHERE id = ?',
      [req.body.name !== undefined ? req.body.name : row.name,
       req.body.surname !== undefined ? req.body.surname : row.surname,
       req.body.idNumber !== undefined ? req.body.idNumber : row.idNumber,
       req.body.contactNumber !== undefined ? req.body.contactNumber : row.contactNumber,
       req.body.email !== undefined ? req.body.email : row.email,
       req.body.role !== undefined ? req.body.role : row.role,
       req.body.zoneId !== undefined ? req.body.zoneId : row.zoneId,
       req.body.schoolId !== undefined ? req.body.schoolId : row.schoolId,
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

// Audits endpoint
app.get('/api/audits', (req, res) => {
  if (req.user?.role !== 'EPHSRUAdmin') return res.status(403).json({ error: 'forbidden' })
  
  let query = 'SELECT * FROM audits'
  const params = []
  const conditions = []
  
  if (req.query.entity) {
    conditions.push('entity = ?')
    params.push(req.query.entity)
  }
  
  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ')
  }
  
  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message })
    
    // Apply additional filters that need JSON parsing
    let filtered = rows
    if (req.query.zoneId || req.query.schoolId) {
      filtered = rows.filter(audit => {
        const after = JSON.parse(audit.after || '{}')
        if (req.query.zoneId && String(after.zoneId ?? '') !== String(req.query.zoneId)) return false
        if (req.query.schoolId && String(after.schoolId ?? '') !== String(req.query.schoolId)) return false
        return true
      })
    }
    
    res.json(filtered)
  })
})

// Login endpoint
function lookupUserByEmail(email) {
  const e = String(email || '').trim().toLowerCase()
  if (!e) return Promise.resolve(null)
  const parseHash = (row) => { try { return JSON.parse(row.data || '{}').passwordHash || '' } catch { return '' } }
  return new Promise((resolve) => {
    db.get('SELECT role, zoneId, schoolId, name, surname, data FROM admins WHERE LOWER(email) = ? LIMIT 1', [e], (err, a) => {
      if (!err && a) return resolve({ role: a.role || 'EPHSRUAdmin', zoneId: a.zoneId || '', schoolId: a.schoolId || '', name: a.name || '', surname: a.surname || '', passwordHash: parseHash(a) })
      db.get('SELECT zoneId, schoolId, name, surname, data FROM coaches WHERE LOWER(email) = ? LIMIT 1', [e], (err2, c) => {
        if (!err2 && c) return resolve({ role: 'Coach', zoneId: c.zoneId || '', schoolId: c.schoolId || '', name: c.name || '', surname: c.surname || '', passwordHash: parseHash(c) })
        db.get('SELECT zoneId, schoolId, name, surname, data FROM players WHERE LOWER(email) = ? LIMIT 1', [e], (err3, p) => {
          if (!err3 && p) return resolve({ role: 'Player', zoneId: p.zoneId || '', schoolId: p.schoolId || '', name: p.name || '', surname: p.surname || '', passwordHash: parseHash(p) })
          db.get('SELECT zoneId, name, surname, data FROM referees WHERE LOWER(email) = ? LIMIT 1', [e], (err4, r) => {
            if (!err4 && r) return resolve({ role: 'Referee', zoneId: r.zoneId || '', schoolId: '', name: r.name || '', surname: r.surname || '', passwordHash: parseHash(r) })
            resolve(null)
          })
        })
      })
    })
  })
}

const SELF_REGISTRATION_ROLES = new Set(['Player', 'Coach', 'Referee', 'SchoolAdmin'])

// Legacy role-claim endpoint. In production it only issues anonymous registration-grade
// tokens for self-registration roles; any identified login must go through
// /api/auth/login (password) or /api/auth/oauth — never an unverified role claim.
app.post('/api/login', (req, res) => {
  const env = process.env.NODE_ENV || 'development'
  const { role, zoneId, schoolId, email } = req.body || {}
  if (!role) return res.status(400).json({ error: 'role required' })
  const e = String(email || '').trim().toLowerCase()
  if (!e) {
    if (env === 'production' && !SELF_REGISTRATION_ROLES.has(String(role))) {
      return res.status(403).json({ error: 'credentials_required' })
    }
    return res.json({ token: sign({ role, zoneId, schoolId }) })
  }
  if (env === 'production') {
    // Knowing an email must never be enough to mint that user's token
    return res.status(403).json({ error: 'use_auth_login' })
  }
  lookupUserByEmail(e).then((found) => {
    if (found && found.role && found.role !== role) {
      return res.status(403).json({ error: 'role_mismatch', role: found.role })
    }
    const z = found && found.zoneId ? found.zoneId : zoneId
    const s = found && found.schoolId ? found.schoolId : schoolId
    res.json({ token: sign({ role, zoneId: z, schoolId: s, email: e }) })
  })
})

// Credential login: verifies the password server-side and issues the token in one step,
// so the browser never has to claim a role and passwords never appear in URLs.
app.post('/api/auth/login', async (req, res) => {
  const env = process.env.NODE_ENV || 'development'
  const email = String(req.body?.email || '').trim().toLowerCase()
  const password = String(req.body?.password || '')
  if (!email || !password) return res.status(400).json({ error: 'email_and_password_required' })
  const user = await lookupUserByEmail(email)
  if (!user) return res.status(404).json({ error: 'not_found' })
  if (user.passwordHash) {
    if (!bcrypt.compareSync(password, user.passwordHash)) {
      return res.status(401).json({ error: 'invalid_credentials' })
    }
  } else if (env === 'production') {
    // Accounts created without a password cannot sign in to a public deployment
    return res.status(403).json({ error: 'password_setup_required' })
  }
  const token = sign({ role: user.role, zoneId: user.zoneId, schoolId: user.schoolId, email })
  res.json({ token, role: user.role, zoneId: user.zoneId, schoolId: user.schoolId, name: user.name, surname: user.surname })
})

// Social sign-in: the provider proves the user owns the email, then the email must match an
// already-registered portal account (role and scope always come from our own records).
app.post('/api/auth/oauth', async (req, res) => {
  const provider = String(req.body?.provider || '')
  try {
    let email = ''
    let displayName = ''
    if (provider === 'google') {
      const credential = String(req.body?.credential || '')
      if (!credential) return res.status(400).json({ error: 'credential_required' })
      const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`)
      if (!r.ok) return res.status(401).json({ error: 'invalid_google_token' })
      const info = await r.json()
      const expectedAud = process.env.GOOGLE_CLIENT_ID || ''
      if (expectedAud && info.aud !== expectedAud) return res.status(401).json({ error: 'audience_mismatch' })
      if (String(info.email_verified) !== 'true') return res.status(401).json({ error: 'email_not_verified' })
      email = String(info.email || '').trim().toLowerCase()
      displayName = String(info.name || '')
    } else if (provider === 'facebook') {
      const accessToken = String(req.body?.accessToken || '')
      if (!accessToken) return res.status(400).json({ error: 'access_token_required' })
      const appId = process.env.FACEBOOK_APP_ID || ''
      const appSecret = process.env.FACEBOOK_APP_SECRET || ''
      if (appId && appSecret) {
        const dbg = await fetch(`https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(`${appId}|${appSecret}`)}`)
        const dbgBody = dbg.ok ? await dbg.json() : null
        if (!dbgBody?.data?.is_valid || String(dbgBody?.data?.app_id) !== appId) {
          return res.status(401).json({ error: 'invalid_facebook_token' })
        }
      }
      const r = await fetch(`https://graph.facebook.com/me?fields=id,name,email&access_token=${encodeURIComponent(accessToken)}`)
      if (!r.ok) return res.status(401).json({ error: 'invalid_facebook_token' })
      const info = await r.json()
      email = String(info.email || '').trim().toLowerCase()
      displayName = String(info.name || '')
    } else {
      return res.status(400).json({ error: 'unsupported_provider' })
    }
    if (!email) return res.status(401).json({ error: 'no_email_from_provider' })
    const user = await lookupUserByEmail(email)
    if (!user) return res.status(404).json({ error: 'not_registered', email })
    const token = sign({ role: user.role, zoneId: user.zoneId, schoolId: user.schoolId, email })
    writeAudit(user.role, 'auth', 'oauth_login', null, { email, provider })
    res.json({ token, role: user.role, zoneId: user.zoneId, schoolId: user.schoolId, name: user.name || displayName, surname: user.surname })
  } catch (err) {
    res.status(502).json({ error: 'oauth_verification_failed' })
  }
})

function updatePasswordHash(email, passwordHash) {
  const e = String(email || '').trim().toLowerCase()
  const tables = ['admins', 'coaches', 'players', 'referees']
  return new Promise((resolve) => {
    const tryTable = (i) => {
      if (i >= tables.length) return resolve(false)
      const t = tables[i]
      db.get(`SELECT id, data FROM ${t} WHERE LOWER(email) = ? LIMIT 1`, [e], (err, row) => {
        if (err || !row) return tryTable(i + 1)
        let data = {}
        try { data = JSON.parse(row.data || '{}') } catch {}
        data.passwordHash = passwordHash
        db.run(`UPDATE ${t} SET data = ? WHERE id = ?`, [JSON.stringify(data), row.id], (uerr) => resolve(!uerr))
      })
    }
    tryTable(0)
  })
}

// Step 1 of password reset: issue a one-hour token. The response is identical whether or
// not the email exists, so the endpoint can't be used to probe registrations. Hook an
// email service where the token is logged; outside production the token is returned
// directly so the flow works without SMTP.
app.post('/api/auth/forgot', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase()
  if (!email) return res.status(400).json({ error: 'email_required' })
  const user = await lookupUserByEmail(email)
  const generic = { ok: true, message: 'If this email is registered, a reset link has been sent.' }
  if (!user) return res.json(generic)
  const token = crypto.randomUUID()
  const expiresAt = Date.now() + 60 * 60 * 1000
  db.run('INSERT INTO password_resets (token, email, expiresAt) VALUES (?, ?, ?)', [token, email, expiresAt], (err) => {
    if (err) return res.status(500).json({ error: 'reset_failed' })
    // EMAIL INTEGRATION POINT: send `token` to `email` via your mail provider here
    console.log(`[password-reset] token for ${email}: ${token} (expires ${new Date(expiresAt).toISOString()})`)
    queueNotification(email, 'Password reset requested', 'A password reset was requested for your account. If this was not you, contact your school administrator.')
    if ((process.env.NODE_ENV || 'development') !== 'production') {
      return res.json({ ...generic, token })
    }
    res.json(generic)
  })
})

// Step 2: exchange the token for a new password
app.post('/api/auth/reset', (req, res) => {
  const token = String(req.body?.token || '').trim()
  const password = String(req.body?.password || '')
  if (!token || !password) return res.status(400).json({ error: 'token_and_password_required' })
  if (password.length < 8) return res.status(400).json({ error: 'password_too_short' })
  db.get('SELECT email, expiresAt FROM password_resets WHERE token = ?', [token], async (err, row) => {
    if (err) return res.status(500).json({ error: err.message })
    if (!row || Number(row.expiresAt) < Date.now()) {
      return res.status(400).json({ error: 'invalid_or_expired_token' })
    }
    const hash = bcrypt.hashSync(password, 10)
    const ok = await updatePasswordHash(row.email, hash)
    db.run('DELETE FROM password_resets WHERE token = ?', [token])
    if (!ok) return res.status(500).json({ error: 'reset_failed' })
    writeAudit('', 'auth', 'password_reset', null, { email: row.email })
    res.json({ ok: true })
  })
})

app.get('/api/identify', async (req, res) => {
  const email = String(req.query.email || '').trim()
  const password = String(req.query.password || '')
  if (!email) return res.status(400).json({ error: 'email required' })
  // Passwords must never travel in query strings on a public deployment — use POST /api/auth/login
  if (password && (process.env.NODE_ENV || 'development') === 'production') {
    return res.status(400).json({ error: 'use_auth_login' })
  }
  const user = await lookupUserByEmail(email)
  if (!user) return res.status(404).json({ error: 'not_found' })
  if (user.passwordHash && password && !bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(404).json({ error: 'not_found' })
  }
  res.json({ role: user.role, zoneId: user.zoneId, schoolId: user.schoolId, name: user.name, surname: user.surname })
})

// File uploads. Buffer in memory, then hand off to the storage layer (Supabase
// Storage in production, local disk in dev) — the serverless filesystem is
// read-only so we can't stream straight to disk there.
const ALLOWED_UPLOAD_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, ALLOWED_UPLOAD_TYPES.has(file.mimetype)),
})

app.post('/api/upload', (req, res, next) => {
  // Uploads require a session — an open upload endpoint is a free file host
  if (!req.user?.role) return res.status(403).json({ error: 'forbidden' })
  next()
}, upload.single('file'), async (req, res) => {
  if (!req.file?.buffer) return res.status(400).json({ error: 'no file or unsupported type' })
  try {
    const url = await saveUpload(req.file.buffer, req.file.originalname, req.file.mimetype)
    res.json({ url })
  } catch (err) {
    console.error('[upload]', err?.message || err)
    res.status(500).json({ error: 'upload_failed' })
  }
})
// Serve locally-stored uploads in dev. In production files live on Supabase's
// CDN, so this route is a harmless no-op (the directory stays empty).
if (!usingSupabaseStorage) app.use('/uploads', express.static(localUploadDir))

// Player Approvals endpoints.
// NOTE: a former GET /api/players/pending route lived here, but it was defined
// after GET /api/players/:id and therefore unreachable (":id" swallowed
// "pending" → 404). Nothing referenced it; the working queue is /api/pending.
app.get('/api/pending', (req, res) => {
  const role = req.user?.role
  if (!(role === 'Coach' || role === 'SchoolAdmin' || role === 'EPHSRUAdmin')) {
    return res.status(403).json({ error: 'forbidden' })
  }

  let regQuery = `
    SELECT p.*, 
           CASE 
             WHEN p.data LIKE '%"status":"pending"%' THEN 'pending'
             WHEN p.data LIKE '%"status":"rejected"%' THEN 'rejected'
             ELSE 'approved'
           END as approval_status
    FROM players p
  `
  const regParams = []
  const regConditions = []

  if (role === 'Coach' || role === 'SchoolAdmin') {
    regConditions.push('p.schoolId = ?')
    regParams.push(req.user.schoolId)
  }
  if (role === 'Coach') {
    regConditions.push('p.zoneId = ?')
    regParams.push(req.user.zoneId)
  }
  regConditions.push("(p.data LIKE '%\"status\":\"pending\"%' OR p.data LIKE '%\"needsReview\":true%')")
  if (regConditions.length > 0) regQuery += ' WHERE ' + regConditions.join(' AND ')
  regQuery += ' ORDER BY p.ts DESC'

  db.all(regQuery, regParams, async (rerr, rrows) => {
    if (rerr) return res.status(500).json({ error: rerr.message })
    const registrations = (rrows || []).map(row => {
      try {
        const data = JSON.parse(row.data || '{}')
        return {
          ...row,
          data: {
            ...data,
            approvalStatus: row.approval_status
          }
        }
      } catch {
        return row
      }
    })

    const registrationsOut = filterByRole('players', registrations, req.user)

    const aConditions = ['a.entityType = ?', 'a.status = ?']
    const aParams = ['players', 'pending']
    if (role === 'Coach' || role === 'SchoolAdmin') {
      aConditions.push('p.schoolId = ?')
      aParams.push(String(req.user?.schoolId || ''))
    }
    if (role === 'Coach') {
      aConditions.push('p.zoneId = ?')
      aParams.push(String(req.user?.zoneId || ''))
    }
    const aWhere = aConditions.length ? `WHERE ${aConditions.join(' AND ')}` : ''
    const aSql = `SELECT a.*, p.name as playerName, p.surname as playerSurname, p.idNumber as playerIdNumber, p.email as playerEmail, p.schoolId as playerSchoolId, p.zoneId as playerZoneId FROM approvals a LEFT JOIN players p ON p.id = a.entityId ${aWhere} ORDER BY a.createdAt DESC LIMIT 100`

    db.all(aSql, aParams, async (aerr, arows) => {
      if (aerr) return res.status(500).json({ error: aerr.message })
      const out = []
      for (const r of arows || []) {
        let requested = null
        try { requested = JSON.parse(r.requestedChanges || '{}') } catch { requested = null }
        const requester = await resolveUserDisplay(r.requesterId).catch(() => null)
        const approver = await resolveUserDisplay(r.approverId).catch(() => null)
        out.push({
          id: r.id,
          entityType: r.entityType,
          entityId: r.entityId,
          status: r.status,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
          requester,
          approver,
          approverNotes: r.approverNotes || '',
          requestedChanges: requested?.changes || [],
          player: r.entityType === 'players' ? {
            id: r.entityId,
            name: r.playerName || '',
            surname: r.playerSurname || '',
            idNumber: r.playerIdNumber || '',
            email: r.playerEmail || '',
            schoolId: r.playerSchoolId || '',
            zoneId: r.playerZoneId || ''
          } : null
        })
      }

      const mConditions = ['mr.status = ?']
      const mParams = ['pending']
      if (role === 'Coach' || role === 'SchoolAdmin') {
        mConditions.push('mr.toSchoolId = ?')
        mParams.push(String(req.user?.schoolId || ''))
      }
      if (role === 'Coach') {
        mConditions.push('mr.toZoneId = ?')
        mParams.push(String(req.user?.zoneId || ''))
      }
      const mWhere = mConditions.length ? `WHERE ${mConditions.join(' AND ')}` : ''
      const mSql = `SELECT mr.*, p.name as playerName, p.surname as playerSurname, p.idNumber as playerIdNumber, p.email as playerEmail FROM migration_requests mr LEFT JOIN players p ON p.id = mr.playerId ${mWhere} ORDER BY mr.requestedAt DESC LIMIT 200`
      db.all(mSql, mParams, (merr2, mrows) => {
        if (merr2) return res.status(500).json({ error: merr2.message })
        const migrationRequests = (mrows || []).map((r) => ({
          id: r.id,
          playerId: r.playerId,
          fromZoneId: r.fromZoneId,
          fromSchoolId: r.fromSchoolId,
          toZoneId: r.toZoneId,
          toSchoolId: r.toSchoolId,
          status: r.status,
          reason: r.reason || '',
          requesterRole: r.requesterRole || '',
          requesterEmail: r.requesterEmail || '',
          requestedAt: r.requestedAt,
          player: {
            id: r.playerId,
            name: r.playerName || '',
            surname: r.playerSurname || '',
            idNumber: r.playerIdNumber || '',
            email: r.playerEmail || ''
          }
        }))

        const oConditions = ["mr.status IN ('accepted','rejected')"]
        const oParams = []
        if (role === 'Coach' || role === 'SchoolAdmin') {
          oConditions.push('mr.fromSchoolId = ?')
          oParams.push(String(req.user?.schoolId || ''))
        }
        if (role === 'Coach') {
          oConditions.push('mr.fromZoneId = ?')
          oParams.push(String(req.user?.zoneId || ''))
        }
        const oWhere = oConditions.length ? `WHERE ${oConditions.join(' AND ')}` : ''
        const oSql = `SELECT mr.*, p.name as playerName, p.surname as playerSurname, p.idNumber as playerIdNumber, p.email as playerEmail FROM migration_requests mr LEFT JOIN players p ON p.id = mr.playerId ${oWhere} ORDER BY mr.decidedAt DESC LIMIT 200`
        db.all(oSql, oParams, (oerr, orows) => {
          if (oerr) return res.status(500).json({ error: oerr.message })
          const migrationOutcomes = (orows || []).map((r) => ({
            id: r.id,
            playerId: r.playerId,
            fromZoneId: r.fromZoneId,
            fromSchoolId: r.fromSchoolId,
            toZoneId: r.toZoneId,
            toSchoolId: r.toSchoolId,
            status: r.status,
            reason: r.reason || '',
            decisionReason: r.decisionReason || '',
            requestedAt: r.requestedAt,
            decidedAt: r.decidedAt,
            player: {
              id: r.playerId,
              name: r.playerName || '',
              surname: r.playerSurname || '',
              idNumber: r.playerIdNumber || '',
              email: r.playerEmail || ''
            }
          }))
          res.json({ registrations: registrationsOut, profileUpdates: out, migrationRequests, migrationOutcomes })
        })
      })
    })
  })
})

app.post('/api/players/:id/approve', (req, res) => {
  const role = req.user?.role
  if (!(role === 'Coach' || role === 'SchoolAdmin' || role === 'EPHSRUAdmin')) {
    return res.status(403).json({ error: 'forbidden' })
  }

  db.get('SELECT * FROM players WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message })
    if (!row) return res.status(404).json({ error: 'not_found' })
    
    // Check scope
    if (!withinScope('players', req.user, row)) {
      return res.status(403).json({ error: 'scope' })
    }

    try {
      const data = JSON.parse(row.data || '{}')
      const updatedData = { ...data, status: 'approved', needsReview: false }
      const ts = Date.now()

      db.run(
        'UPDATE players SET data = ?, ts = ? WHERE id = ?',
        [JSON.stringify(updatedData), ts, req.params.id],
        function(err) {
          if (err) return res.status(500).json({ error: err.message })
          if (this.changes === 0) return res.status(404).json({ error: 'not_found' })
          
          writeAudit(req.user?.role, 'players', 'approve', row, { ...row, data: updatedData, ts })
          queueNotification(row.email, 'Registration approved', `Welcome to the squad, ${row.name}! Your player registration has been approved.`)
          if (row.parentEmail) queueNotification(row.parentEmail, 'Registration approved', `${row.name} ${row.surname}'s player registration has been approved.`)
          res.json({ id: req.params.id, status: 'approved', ts })
        }
      )
    } catch {
      return res.status(500).json({ error: 'invalid_data' })
    }
  })
})

app.post('/api/players/:id/reject', (req, res) => {
  const role = req.user?.role
  if (!(role === 'Coach' || role === 'SchoolAdmin' || role === 'EPHSRUAdmin')) {
    return res.status(403).json({ error: 'forbidden' })
  }

  db.get('SELECT * FROM players WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message })
    if (!row) return res.status(404).json({ error: 'not_found' })
    
    // Check scope
    if (!withinScope('players', req.user, row)) {
      return res.status(403).json({ error: 'scope' })
    }

    try {
      const data = JSON.parse(row.data || '{}')
      const updatedData = { 
        ...data, 
        status: 'rejected', 
        needsReview: false,
        rejectionReason: req.body.reason || 'Rejected by coach'
      }
      const ts = Date.now()

      db.run(
        'UPDATE players SET data = ?, ts = ? WHERE id = ?',
        [JSON.stringify(updatedData), ts, req.params.id],
        function(err) {
          if (err) return res.status(500).json({ error: err.message })
          if (this.changes === 0) return res.status(404).json({ error: 'not_found' })
          
          writeAudit(req.user?.role, 'players', 'reject', row, { ...row, data: updatedData, ts })
          queueNotification(row.email, 'Registration not approved', `Your player registration was not approved. Reason: ${updatedData.rejectionReason}. Please contact your school for help.`)
          if (row.parentEmail) queueNotification(row.parentEmail, 'Registration not approved', `${row.name} ${row.surname}'s registration was not approved. Reason: ${updatedData.rejectionReason}.`)
          res.json({ id: req.params.id, status: 'rejected', reason: req.body.reason, ts })
        }
      )
    } catch {
      return res.status(500).json({ error: 'invalid_data' })
    }
  })
})

// Season rollover: re-register last season's squad into the current year, promoting
// age groups one step per season (U15 -> U16 -> U17 -> U19).
app.post('/api/players/bulk-reregister', (req, res) => {
  const role = req.user?.role
  if (!(role === 'Coach' || role === 'SchoolAdmin' || role === 'EPHSRUAdmin')) {
    return res.status(403).json({ error: 'forbidden' })
  }
  const { playerIds } = req.body
  if (!Array.isArray(playerIds) || playerIds.length === 0) {
    return res.status(400).json({ error: 'playerIds required' })
  }
  const currentYear = new Date().getFullYear()
  const promote = (v, steps) => {
    let out = String(v || '')
    for (let i = 0; i < steps; i++) {
      if (out === 'U15') out = 'U16'
      else if (out === 'U16') out = 'U17'
      else if (out === 'U17') out = 'U19'
    }
    return out
  }
  const results = []
  let completed = 0
  const finishOne = () => {
    completed++
    if (completed === playerIds.length) {
      res.json({ results, total: playerIds.length, successful: results.filter((r) => r.success).length, year: currentYear })
    }
  }
  playerIds.forEach((playerId) => {
    db.get('SELECT * FROM players WHERE id = ?', [playerId], (err, row) => {
      if (err || !row || !withinScope('players', req.user, row)) {
        results.push({ id: playerId, success: false, error: err ? err.message : 'not_found_or_forbidden' })
        return finishOne()
      }
      let data = {}
      try { data = JSON.parse(row.data || '{}') } catch {}
      const fromYear = Number(data.registrationYear) || currentYear
      if (fromYear >= currentYear) {
        results.push({ id: playerId, success: false, error: 'already_current_season' })
        return finishOne()
      }
      const steps = currentYear - fromYear
      if (data.originalRegistrationYear === undefined) data.originalRegistrationYear = data.registrationYear
      if (data.originalRegisteredAt === undefined) data.originalRegisteredAt = data.registeredAt
      const now = Date.now()
      data.registrationYear = currentYear
      data.registeredAt = now
      if (data.ageGroup) data.ageGroup = promote(data.ageGroup, steps)
      if (data.team) data.team = promote(data.team, steps)
      db.run(
        'UPDATE players SET ageGroup = ?, data = ?, ts = ? WHERE id = ?',
        [data.ageGroup || row.ageGroup, JSON.stringify(data), now, playerId],
        function(uerr) {
          if (uerr) {
            results.push({ id: playerId, success: false, error: uerr.message })
          } else {
            results.push({ id: playerId, success: true, year: currentYear, ageGroup: data.ageGroup || row.ageGroup })
            writeAudit(role, 'players', 'reregister', row, { id: playerId, registrationYear: currentYear, ageGroup: data.ageGroup })
          }
          finishOne()
        }
      )
    })
  })
})

app.post('/api/players/bulk-approve', (req, res) => {
  const role = req.user?.role
  if (!(role === 'Coach' || role === 'SchoolAdmin' || role === 'EPHSRUAdmin')) {
    return res.status(403).json({ error: 'forbidden' })
  }

  const { playerIds } = req.body
  if (!Array.isArray(playerIds) || playerIds.length === 0) {
    return res.status(400).json({ error: 'playerIds required' })
  }

  const results = []
  let completed = 0

  playerIds.forEach(playerId => {
    db.get('SELECT * FROM players WHERE id = ?', [playerId], (err, row) => {
      if (err || !row || !withinScope('players', req.user, row)) {
        results.push({ id: playerId, success: false, error: err ? err.message : 'not_found_or_forbidden' })
        completed++
        if (completed === playerIds.length) {
          res.json({ results, total: playerIds.length, successful: results.filter(r => r.success).length })
        }
        return
      }

      try {
        const data = JSON.parse(row.data || '{}')
        const updatedData = { ...data, status: 'approved', needsReview: false }
        const ts = Date.now()

        db.run(
          'UPDATE players SET data = ?, ts = ? WHERE id = ?',
          [JSON.stringify(updatedData), ts, playerId],
          function(err) {
            if (err) {
              results.push({ id: playerId, success: false, error: err.message })
            } else {
              results.push({ id: playerId, success: true, status: 'approved' })
              writeAudit(req.user?.role, 'players', 'bulk_approve', row, { ...row, data: updatedData, ts })
              queueNotification(row.email, 'Registration approved', `Welcome to the squad, ${row.name}! Your player registration has been approved.`)
            }
            completed++
            if (completed === playerIds.length) {
              res.json({ results, total: playerIds.length, successful: results.filter(r => r.success).length })
            }
          }
        )
      } catch {
        results.push({ id: playerId, success: false, error: 'invalid_data' })
        completed++
        if (completed === playerIds.length) {
          res.json({ results, total: playerIds.length, successful: results.filter(r => r.success).length })
        }
      }
    })
  })
})

// Documents endpoints
app.post('/api/documents', (req, res) => {
  const role = req.user?.role
  if (!role) return res.status(403).json({ error: 'forbidden' })
  
  const id = crypto.randomUUID()
  const ts = Date.now()
  
  db.run(
    'INSERT INTO documents (id, ownerType, ownerId, fileName, fileUrl, status, ts) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, req.body.ownerType || '', req.body.ownerId || '', req.body.fileName || '', req.body.fileUrl || '', 'pending', ts],
    function(err) {
      if (err) return res.status(500).json({ error: err.message })
      res.json({ id, ownerType: req.body.ownerType, ownerId: req.body.ownerId, fileName: req.body.fileName, fileUrl: req.body.fileUrl, status: 'pending', ts })
    }
  )
})

// Resolve which school/zone/person a document belongs to so access can be scoped.
// Legacy rows with unresolvable owners stay visible to EPHSRU admins only.
function resolveDocOwner(ownerType, ownerId, cb) {
  const t = String(ownerType || '').toLowerCase()
  const id = String(ownerId || '')
  if (!id) return cb(null)
  if (t.startsWith('school')) {
    return db.get('SELECT zoneId, schoolId FROM schools WHERE id = ? OR schoolId = ? LIMIT 1', [id, id], (err, r) => {
      cb(!err && r ? { zoneId: String(r.zoneId || ''), schoolId: String(r.schoolId || ''), email: '' } : null)
    })
  }
  const table = t.startsWith('player') ? 'players' : t.startsWith('coach') ? 'coaches' : t.startsWith('referee') ? 'referees' : null
  if (!table) return cb(null)
  const cols = table === 'referees' ? 'zoneId, email' : 'zoneId, schoolId, email'
  db.get(`SELECT ${cols} FROM ${table} WHERE id = ? LIMIT 1`, [id], (err, r) => {
    if (err || !r) return cb(null)
    cb({ zoneId: String(r.zoneId || ''), schoolId: String(r.schoolId || ''), email: String(r.email || '').toLowerCase() })
  })
}

function canAccessDoc(user, owner) {
  const role = user?.role
  if (role === 'EPHSRUAdmin') return true
  if (!owner) return false
  if (role === 'ZoneCoordinator') return owner.zoneId === String(user.zoneId || '')
  if (role === 'SchoolAdmin' || role === 'Coach') return owner.schoolId === String(user.schoolId || '')
  if (role === 'Player' || role === 'Referee') return !!owner.email && owner.email === String(user.email || '').toLowerCase()
  return false
}

app.get('/api/documents', (req, res) => {
  if (!req.user?.role) return res.status(403).json({ error: 'forbidden' })
  let query = 'SELECT * FROM documents'
  const params = []
  const conditions = []

  if (req.query.ownerType) {
    conditions.push('ownerType = ?')
    params.push(req.query.ownerType)
  }
  if (req.query.ownerId) {
    conditions.push('ownerId = ?')
    params.push(req.query.ownerId)
  }
  if (req.query.status) {
    conditions.push('status = ?')
    params.push(req.query.status)
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ')
  }

  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message })
    const list = rows || []
    if (req.user.role === 'EPHSRUAdmin' || list.length === 0) return res.json(list)
    const out = []
    let done = 0
    list.forEach((doc) => {
      resolveDocOwner(doc.ownerType, doc.ownerId, (owner) => {
        if (canAccessDoc(req.user, owner)) out.push(doc)
        done++
        if (done === list.length) {
          out.sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0))
          res.json(out)
        }
      })
    })
  })
})

function decideDocument(req, res, status) {
  const role = req.user?.role
  if (!(role === 'SchoolAdmin' || role === 'ZoneCoordinator' || role === 'EPHSRUAdmin')) return res.status(403).json({ error: 'forbidden' })
  db.get('SELECT * FROM documents WHERE id = ?', [req.params.id], (gerr, doc) => {
    if (gerr) return res.status(500).json({ error: gerr.message })
    if (!doc) return res.status(404).json({ error: 'not_found' })
    resolveDocOwner(doc.ownerType, doc.ownerId, (owner) => {
      if (!canAccessDoc(req.user, owner)) return res.status(403).json({ error: 'scope' })
      db.run('UPDATE documents SET status = ? WHERE id = ?', [status, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message })
        if (this.changes === 0) return res.status(404).json({ error: 'not_found' })
        writeAudit(role, 'documents', status, doc, { ...doc, status })
        if (owner?.email) queueNotification(owner.email, `Document ${status}`, `Your document "${doc.fileName || doc.id}" has been ${status}.`)
        res.json({ id: req.params.id, status })
      })
    })
  })
}

app.post('/api/documents/:id/approve', (req, res) => decideDocument(req, res, 'approved'))

app.post('/api/documents/:id/reject', (req, res) => decideDocument(req, res, 'rejected'))

// In-app notification inbox (own email only)
app.get('/api/notifications', (req, res) => {
  const email = String(req.user?.email || '').trim().toLowerCase()
  if (!req.user?.role || !email) return res.status(403).json({ error: 'forbidden' })
  db.all('SELECT * FROM notifications WHERE email = ? ORDER BY createdAt DESC LIMIT 50', [email], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message })
    res.json(rows || [])
  })
})

app.post('/api/notifications/read-all', (req, res) => {
  const email = String(req.user?.email || '').trim().toLowerCase()
  if (!req.user?.role || !email) return res.status(403).json({ error: 'forbidden' })
  db.run('UPDATE notifications SET readAt = ? WHERE email = ? AND readAt IS NULL', [Date.now(), email], function(err) {
    if (err) return res.status(500).json({ error: err.message })
    res.json({ ok: true, marked: this.changes })
  })
})

// ===========================================================================
// Scoped messaging — communication follows the reporting hierarchy. Each role
// may only message its direct superior(s) and direct report(s):
//   EPHSRUAdmin     <-> ZoneCoordinators (all zones)
//   ZoneCoordinator <-> EPHSRUAdmins; SchoolAdmins in own zone
//   SchoolAdmin     <-> ZoneCoordinators of own zone; Coaches & Referees of own school
//   Coach           <-> SchoolAdmins of own school; Players of own school
//   Player          <-> Coaches of own school
//   Referee         <-> SchoolAdmins of own school (or own zone's coordinators)
// Replying to someone who already messaged you is always allowed, so a
// conversation started from above can be answered from below.
// ===========================================================================
function dbAllP(sql, params) {
  return new Promise((resolve, reject) => db.all(sql, params, (e, r) => (e ? reject(e) : resolve(r || []))))
}
function safeParse(s) { try { return JSON.parse(s || '{}') } catch { return {} } }

// Tokens issued by the legacy dev login may lack zone/school scope — fall back
// to the user's own row (matched by email) so messaging scope is always real.
async function resolveMsgScope(user) {
  let zoneId = user.zoneId
  let schoolId = user.schoolId
  const role = user.role
  const email = String(user.email || '').trim().toLowerCase()
  const needsSchool = role === 'Coach' || role === 'Player' || role === 'SchoolAdmin' || role === 'Referee'
  if ((needsSchool && schoolId) || (!needsSchool && zoneId) || role === 'EPHSRUAdmin') {
    if (zoneId || schoolId || role === 'EPHSRUAdmin') return { role, zoneId, schoolId }
  }
  const table = role === 'Coach' ? 'coaches' : role === 'Player' ? 'players' : role === 'Referee' ? 'referees' : 'admins'
  const rows = email ? await dbAllP(`SELECT * FROM ${table} WHERE lower(email) = ?`, [email]) : []
  const r = rows[0]
  if (r) {
    const d = safeParse(r.data)
    zoneId = zoneId || r.zoneId || d.zoneId
    schoolId = schoolId || r.schoolId || d.schoolId
  }
  return { role, zoneId, schoolId }
}

async function allowedRecipients(user) {
  const scope = await resolveMsgScope(user)
  const me = String(user.email || '').trim().toLowerCase()
  const out = []
  const push = (rows, fixedRole) => {
    for (const r of rows) {
      const d = safeParse(r.data)
      const email = String(r.email || d.email || '').trim().toLowerCase()
      if (!email || email === me) continue
      out.push({
        email,
        name: `${r.name || d.name || ''} ${r.surname || d.surname || ''}`.trim() || email,
        role: fixedRole || r.role || 'User',
        schoolId: r.schoolId || d.schoolId || '',
        zoneId: r.zoneId || d.zoneId || '',
      })
    }
  }
  if (scope.role === 'EPHSRUAdmin') {
    push(await dbAllP(`SELECT * FROM admins WHERE role = 'ZoneCoordinator'`, []))
  } else if (scope.role === 'ZoneCoordinator') {
    push(await dbAllP(`SELECT * FROM admins WHERE role = 'EPHSRUAdmin'`, []))
    if (scope.zoneId) push(await dbAllP(`SELECT * FROM admins WHERE role = 'SchoolAdmin' AND zoneId = ?`, [String(scope.zoneId)]))
  } else if (scope.role === 'SchoolAdmin') {
    if (scope.zoneId) push(await dbAllP(`SELECT * FROM admins WHERE role = 'ZoneCoordinator' AND zoneId = ?`, [String(scope.zoneId)]))
    if (scope.schoolId) {
      push(await dbAllP('SELECT * FROM coaches WHERE schoolId = ?', [String(scope.schoolId)]), 'Coach')
      const refs = await dbAllP('SELECT * FROM referees', [])
      push(refs.filter((r) => String(safeParse(r.data).schoolId || '') === String(scope.schoolId)), 'Referee')
    }
  } else if (scope.role === 'Coach') {
    if (scope.schoolId) {
      push(await dbAllP(`SELECT * FROM admins WHERE role = 'SchoolAdmin' AND schoolId = ?`, [String(scope.schoolId)]))
      push(await dbAllP('SELECT * FROM players WHERE schoolId = ? LIMIT 1000', [String(scope.schoolId)]), 'Player')
    }
  } else if (scope.role === 'Player') {
    if (scope.schoolId) push(await dbAllP('SELECT * FROM coaches WHERE schoolId = ?', [String(scope.schoolId)]), 'Coach')
  } else if (scope.role === 'Referee') {
    if (scope.schoolId) push(await dbAllP(`SELECT * FROM admins WHERE role = 'SchoolAdmin' AND schoolId = ?`, [String(scope.schoolId)]))
    else if (scope.zoneId) push(await dbAllP(`SELECT * FROM admins WHERE role = 'ZoneCoordinator' AND zoneId = ?`, [String(scope.zoneId)]))
  }
  // Dedupe by email (a person can appear in several tables)
  const seen = new Set()
  return out.filter((r) => (seen.has(r.email) ? false : (seen.add(r.email), true)))
}

// Directory of people the current user is allowed to message
app.get('/api/messages/recipients', async (req, res) => {
  if (!req.user?.role || !req.user?.email) return res.status(403).json({ error: 'forbidden' })
  try {
    res.json(await allowedRecipients(req.user))
  } catch (e) {
    res.status(500).json({ error: e?.message || 'internal_error' })
  }
})

// Own conversations: inbox + sent
app.get('/api/messages', (req, res) => {
  const email = String(req.user?.email || '').trim().toLowerCase()
  if (!req.user?.role || !email) return res.status(403).json({ error: 'forbidden' })
  db.all('SELECT * FROM messages WHERE toEmail = ? ORDER BY createdAt DESC LIMIT 100', [email], (e1, inbox) => {
    if (e1) return res.status(500).json({ error: e1.message })
    db.all('SELECT * FROM messages WHERE fromEmail = ? ORDER BY createdAt DESC LIMIT 100', [email], (e2, sent) => {
      if (e2) return res.status(500).json({ error: e2.message })
      res.json({ inbox: inbox || [], sent: sent || [] })
    })
  })
})

app.post('/api/messages', async (req, res) => {
  const email = String(req.user?.email || '').trim().toLowerCase()
  if (!req.user?.role || !email) return res.status(403).json({ error: 'forbidden' })
  const toEmail = String(req.body?.toEmail || '').trim().toLowerCase()
  const subject = String(req.body?.subject || '').slice(0, 200)
  const body = String(req.body?.body || '').trim().slice(0, 4000)
  if (!toEmail || !body) return res.status(400).json({ error: 'recipient_and_body_required' })
  try {
    const allowed = await allowedRecipients(req.user)
    let ok = allowed.some((r) => r.email === toEmail)
    if (!ok) {
      // Replies are always allowed: if they messaged me before, I may answer.
      const prior = await dbAllP('SELECT id FROM messages WHERE fromEmail = ? AND toEmail = ? LIMIT 1', [toEmail, email])
      ok = prior.length > 0
    }
    if (!ok) return res.status(403).json({ error: 'recipient_out_of_scope' })
    const id = crypto.randomUUID()
    const fromName = String(req.body?.fromName || '').slice(0, 120)
    db.run(
      'INSERT INTO messages (id, fromEmail, fromRole, fromName, toEmail, subject, body, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, email, req.user.role, fromName, toEmail, subject, body, Date.now()],
      function (err) {
        if (err) return res.status(500).json({ error: err.message })
        queueNotification(toEmail, `New message from ${fromName || email}`, subject || body.slice(0, 140))
        writeAudit(req.user?.role, 'messages', 'send', null, { id, toEmail })
        res.json({ ok: true, id })
      }
    )
  } catch (e) {
    res.status(500).json({ error: e?.message || 'internal_error' })
  }
})

app.post('/api/messages/read-all', (req, res) => {
  const email = String(req.user?.email || '').trim().toLowerCase()
  if (!req.user?.role || !email) return res.status(403).json({ error: 'forbidden' })
  db.run('UPDATE messages SET readAt = ? WHERE toEmail = ? AND readAt IS NULL', [Date.now(), email], function (err) {
    if (err) return res.status(500).json({ error: err.message })
    res.json({ ok: true, marked: this.changes })
  })
})

// In production the API server also serves the built frontend (single deployable unit)
const distDir = path.join(process.cwd(), 'dist')
if ((process.env.NODE_ENV || 'development') === 'production' && fs.existsSync(distDir)) {
  app.use(express.static(distDir))
  app.get(/^(?!\/(api|uploads)\/).*/, (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'))
  })
}

// Global error handler: malformed JSON, multer limits, and unexpected throws
// answer with JSON instead of an HTML stack trace
app.use((err, _req, res, _next) => {
  if (err?.type === 'entity.parse.failed' || err?.type === 'entity.too.large') {
    return res.status(400).json({ error: 'bad_request' })
  }
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'file_too_large', maxBytes: 5 * 1024 * 1024 })
  }
  console.error('[unhandled]', err?.message || err)
  res.status(500).json({ error: 'internal_error' })
})

// Bind a port for local dev / self-hosting, but NOT in a serverless runtime,
// where the app is imported by api/index.js and invoked per-request (Vercel and
// AWS Lambda both set these env vars).
const isServerless = Boolean(
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NOW_REGION
)
if (!isServerless) {
  const port = process.env.PORT || 4000
  app.listen(port, () => {
    console.log(`🚀 Server running on port ${port}`)
  })
}

export default app
