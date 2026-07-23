import express from 'express'
import cors from 'cors'
import { createHmac, timingSafeEqual } from 'crypto'
import { sign, verifyToken } from './auth.js'
import multer from 'multer'
import fs from 'fs'
import path from 'path'
import db from './db.js'
import { saveUpload, localUploadDir, usingSupabaseStorage } from './storage.js'
import { sendMail, mailEnabled, APP_URL } from './mailer.js'
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
function queueNotification(email, subject, message, opts = {}) {
  try {
    const e = String(email || '').trim().toLowerCase()
    if (!e) return
    const id = crypto.randomUUID()
    db.run(
      'INSERT INTO notifications (id, email, subject, message, readAt, createdAt) VALUES (?, ?, ?, ?, NULL, ?)',
      [id, e, String(subject || ''), String(message || ''), Date.now()]
    )
    console.log(`[notify] ${e}: ${subject}`)
    // Mirror in-app notifications to real email when SMTP is configured
    // (pass { emailCopy: false } when a dedicated email already covers it)
    if (opts.emailCopy !== false) sendMail(e, subject, message)
  } catch {}
}

// Sent when a superior creates an account down the hierarchy — the new user
// learns their account exists and how to get in (password comes from their
// administrator; "Forgot password?" lets them set their own).
// ---------------------------------------------------------------------------
// Email verification. Tokens are stateless HMAC signatures over the email
// address (no table, no expiry — proving ownership of an inbox is harmless at
// any time), so both data layers work unchanged. Verification never blocks
// sign-in; it just flips data.emailVerified on every record with that email.
// ---------------------------------------------------------------------------
const EMAIL_VERIFY_SECRET = process.env.JWT_SECRET || 'ephsru_dev_secret'

function emailVerifyToken(email) {
  const e = String(email || '').trim().toLowerCase()
  const sig = createHmac('sha256', EMAIL_VERIFY_SECRET).update(`verify-email:${e}`).digest('base64url')
  return `${Buffer.from(e).toString('base64url')}.${sig}`
}

function parseEmailVerifyToken(token) {
  const [payload, sig] = String(token || '').split('.')
  if (!payload || !sig) return ''
  let e = ''
  try { e = Buffer.from(payload, 'base64url').toString('utf8').trim().toLowerCase() } catch { return '' }
  const expect = createHmac('sha256', EMAIL_VERIFY_SECRET).update(`verify-email:${e}`).digest('base64url')
  const a = Buffer.from(String(sig)); const b = Buffer.from(expect)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return ''
  return e
}

function emailVerifyLink(email) {
  return `${APP_URL || 'http://localhost:5173'}/?verifyEmail=${encodeURIComponent(emailVerifyToken(email))}`
}

// Flip emailVerified on every record carrying this email (a person can be a
// player in one table and an admin in another — one inbox, one verification).
function markEmailVerified(email, cb) {
  const e = String(email || '').trim().toLowerCase()
  if (!e) return cb(null, 0)
  const tables = ['players', 'coaches', 'referees', 'admins']
  let done = 0
  let updated = 0
  for (const t of tables) {
    db.all(`SELECT id, data FROM ${t} WHERE lower(email) = ?`, [e], (err, rows) => {
      const list = err ? [] : rows || []
      let pending = list.length
      const finishTable = () => { done++; if (done === tables.length) cb(null, updated) }
      if (pending === 0) return finishTable()
      for (const row of list) {
        let d = {}
        try { d = JSON.parse(row.data || '{}') } catch {}
        d.emailVerified = true
        d.emailVerifiedAt = d.emailVerifiedAt || Date.now()
        db.run(`UPDATE ${t} SET data = ? WHERE id = ?`, [JSON.stringify(d), row.id], () => {
          updated++
          pending--
          if (pending === 0) finishTable()
        })
      }
    })
  }
}

function welcomeNotification(email, roleLabel) {
  const e = String(email || '').trim().toLowerCase()
  if (!e) return
  queueNotification(
    e,
    'Your EPHSRU Rugby Portal account is ready',
    `An account has been created for you as ${roleLabel}. Sign in with this email address${APP_URL ? ` at ${APP_URL}` : ''} using the password your administrator gave you — you can change it any time via "Forgot password?" on the sign-in page.\n\nPlease confirm this email address belongs to you by opening this link:\n${emailVerifyLink(e)}`
  )
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

// Emails are unique per table (partial unique index). Answer a duplicate with
// a clear conflict instead of a raw SQL error. Works for both engines: SQLite
// says "UNIQUE constraint failed: players.email", Postgres "duplicate key
// value violates unique constraint \"ux_players_email\"".
function insertError(res, err) {
  const m = String(err?.message || '')
  if (/unique/i.test(m) && /email/i.test(m)) {
    return res.status(409).json({ error: 'email_already_registered' })
  }
  return res.status(500).json({ error: m })
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
        if (err3) return insertError(res, err3)
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
        if (err) return insertError(res, err)
        writeAudit(req.user?.role, 'players', 'create', null, { id, ...body })
        welcomeNotification(body.email, 'a Player')
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
      if (err) return insertError(res, err)
      writeAudit(req.user?.role, 'coaches', 'create', null, { id, ...req.body })
      welcomeNotification(req.body.email, 'a Coach')
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
      if (err) return insertError(res, err)
      writeAudit(req.user?.role, 'referees', 'create', null, { id, ...req.body })
      welcomeNotification(req.body.email, 'a Referee')
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

// ---------------------------------------------------------------------------
// Match-day QR verification (consumed by the Rugby Assistant app)
//
// The QR on a printed ID card carries a signed token: `v1.<t>.<id>.<sig>`
// where <t> is p/c/r (players/coaches/referees) and <sig> is an HMAC over
// `<t>.<id>`. Anyone holding a valid card can look the person up; nobody can
// enumerate the database, and the endpoint exposes no write path — the
// Assistant app can look but never touch.
// ---------------------------------------------------------------------------
const QR_VERIFY_SECRET = process.env.QR_VERIFY_SECRET || process.env.JWT_SECRET || 'ephsru_dev_secret'
const QR_TYPES = { p: 'players', c: 'coaches', r: 'referees' }

function qrSig(t, id) {
  return createHmac('sha256', QR_VERIFY_SECRET).update(`${t}.${id}`).digest('base64url').slice(0, 24)
}

function makeVerifyToken(entity, id) {
  const t = Object.keys(QR_TYPES).find((k) => QR_TYPES[k] === entity)
  if (!t || !id) return null
  return `v1.${t}.${id}.${qrSig(t, id)}`
}

function verifyBaseUrl(req) {
  if (APP_URL) return APP_URL
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http'
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost'
  return `${proto}://${host}`
}

// Batch token minting for card printing — signed-in portal users only.
app.post('/api/verify-tokens', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'unauthorized' })
  const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 500) : []
  const base = verifyBaseUrl(req)
  const tokens = items.map((it) => {
    const entity = String(it?.type || 'players')
    const id = String(it?.id || '')
    const token = makeVerifyToken(entity, id)
    return token ? { type: entity, id, token, url: `${base}/api/verify/${token}` } : { type: entity, id, token: null, url: null }
  })
  res.json({ tokens })
})

// Public read-only lookup. CORS is deliberately open on this route (the
// Assistant app lives on a different origin); the signed token is the gate.
app.use('/api/verify/', rateLimit(isProd ? 120 : 1000, 60_000))
app.get('/api/verify/:token', cors(), (req, res) => {
  const parts = String(req.params.token || '').split('.')
  const [ver, t, id, sig] = parts
  const entity = QR_TYPES[t]
  if (parts.length !== 4 || ver !== 'v1' || !entity || !id || !sig) {
    return res.status(404).json({ registered: false, error: 'invalid_token' })
  }
  const expected = Buffer.from(qrSig(t, id))
  const given = Buffer.from(String(sig))
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return res.status(404).json({ registered: false, error: 'invalid_token' })
  }
  db.get(`SELECT * FROM ${entity} WHERE id = ?`, [id], (err, row) => {
    if (err) return res.status(500).json({ error: 'lookup_failed' })
    if (!row) return res.status(404).json({ registered: false, error: 'not_registered' })
    let d = {}
    try { d = JSON.parse(row.data || '{}') } catch {}
    const role = entity === 'players' ? 'Player' : entity === 'coaches' ? 'Coach' : 'Referee'
    const age = (() => {
      const dob = String(row.dateOfBirth || d.dateOfBirth || '')
      const born = dob ? new Date(dob) : null
      if (!born || isNaN(born.getTime())) return null
      const now = new Date()
      let a = now.getFullYear() - born.getFullYear()
      if (now.getMonth() < born.getMonth() || (now.getMonth() === born.getMonth() && now.getDate() < born.getDate())) a--
      return a >= 0 && a < 120 ? a : null
    })()
    const result = {
      registered: true,
      role,
      name: row.name || '',
      surname: row.surname || '',
      age,
      ageGroup: row.ageGroup || d.ageGroup || null,
      gender: row.gender || null,
      position: d.position || null,
      jerseyNumber: d.jerseyNumber || null,
      photoUrl: d.photoUrl ? (String(d.photoUrl).startsWith('/') ? `${verifyBaseUrl(req)}${d.photoUrl}` : d.photoUrl) : null,
      registrationYear: d.registrationYear || null,
      schoolId: row.schoolId || null,
      school: null,
    }
    if (!row.schoolId) return res.json(result)
    db.get('SELECT data FROM schools WHERE schoolId = ?', [row.schoolId], (_serr, srow) => {
      try { result.school = JSON.parse(srow?.data || '{}').name || null } catch {}
      res.json(result)
    })
  })
})

// ---------------------------------------------------------------------------
// Rugby Assistant match-archive delivery (assistant app → portal).
//
// The Assistant's process-portal-queue Edge Function POSTs completed-game
// archives here with a shared Bearer key (ASSISTANT_API_KEY — same value as
// PORTAL_API_KEY on the Assistant's Supabase project). Idempotent on the
// Assistant's job id, so its at-least-once retry loop can replay safely.
// Write-only inbox: nothing here reads back into portal entities.
// ---------------------------------------------------------------------------
const ASSISTANT_API_KEY = process.env.ASSISTANT_API_KEY || ''
app.use('/api/assistant/', rateLimit(isProd ? 60 : 1000, 60_000))

function assistantAuthorized(req, res) {
  if (!ASSISTANT_API_KEY) {
    res.status(503).json({ error: 'not_configured' })
    return false
  }
  const auth = String(req.headers.authorization || '')
  const given = Buffer.from(auth.startsWith('Bearer ') ? auth.slice(7) : '')
  const expected = Buffer.from(ASSISTANT_API_KEY)
  if (!given.length || given.length !== expected.length || !timingSafeEqual(expected, given)) {
    res.status(401).json({ error: 'unauthorized' })
    return false
  }
  return true
}

// Referee's fixture assignments, keyed by email (identity rule shared with
// messaging/matchday). Consumed by the Assistant's portal-fixtures Edge
// Function so the referee can spin up a linked live game from an appointment.
// A fixture's submitted team sheets with player names resolved — the shape the
// Assistant needs to build real (named) squads instead of numbered placeholders.
async function fixtureTeamSheets(fixtureId) {
  const sheets = await dbAllP('SELECT * FROM team_sheets WHERE fixtureId = ?', [String(fixtureId)])
  const out = {}
  for (const s of sheets) {
    let entries = []
    try { entries = JSON.parse(s.data || '{}').players || [] } catch {}
    const ids = entries.map((p) => String(p?.playerId || '')).filter(Boolean)
    const nameById = new Map()
    if (ids.length > 0) {
      const rows = await dbAllP(`SELECT id, name, surname FROM players WHERE id IN (${ids.map(() => '?').join(',')})`, ids)
      for (const r of rows) nameById.set(String(r.id), `${r.name || ''} ${r.surname || ''}`.trim())
    }
    out[String(s.schoolId)] = {
      submittedAt: s.submittedAt ? Number(s.submittedAt) : null,
      players: entries.map((p) => ({
        playerId: String(p.playerId || ''),
        jersey: String(p.jersey ?? ''),
        position: String(p.position || ''),
        captain: p.captain === true,
        fullName: nameById.get(String(p.playerId || '')) || null,
      })),
    }
  }
  return out
}

app.get('/api/assistant/fixtures', async (req, res) => {
  if (!assistantAuthorized(req, res)) return
  const email = String(req.query.refereeEmail || '').trim().toLowerCase()
  if (!email) return res.status(400).json({ error: 'referee_email_required' })
  const onlyFixtureId = String(req.query.fixtureId || '')
  try {
    const rows = await dbAllP(
      `SELECT * FROM fixtures WHERE LOWER(COALESCE(refereeEmail, '')) = ? AND status != 'cancelled'
       ORDER BY kickoffAt ASC LIMIT 50`,
      [email]
    )
    // Sheet status per school in one sweep — powers the assistant's
    // "sheet submitted ✓" chips without shipping full sheets on the list.
    const submitted = new Set()
    if (rows.length > 0) {
      const ids = rows.map((f) => String(f.id))
      const sheetRows = await dbAllP(
        `SELECT fixtureId, schoolId FROM team_sheets WHERE fixtureId IN (${ids.map(() => '?').join(',')})`,
        ids
      )
      for (const s of sheetRows) submitted.add(`${s.fixtureId}|${s.schoolId}`)
    }
    const fixtures = []
    for (const f of rows) {
      if (onlyFixtureId && String(f.id) !== onlyFixtureId) continue
      const [homeSchool, awaySchool] = await Promise.all([
        schoolDisplay(f.homeSchoolId),
        schoolDisplay(f.awaySchoolId),
      ])
      const fixture = {
        id: f.id,
        ageGroup: f.ageGroup,
        kickoffAt: Number(f.kickoffAt),
        venue: f.venue || null,
        status: f.status,
        homeSchoolId: f.homeSchoolId,
        awaySchoolId: f.awaySchoolId,
        homeSchool,
        awaySchool,
        homeScore: f.homeScore ?? null,
        awayScore: f.awayScore ?? null,
        sheetSubmitted: {
          home: submitted.has(`${f.id}|${f.homeSchoolId}`),
          away: submitted.has(`${f.id}|${f.awaySchoolId}`),
        },
      }
      // Sheets are only attached on the single-fixture fetch (the link flow) —
      // the list view doesn't need the extra queries.
      if (onlyFixtureId) fixture.teamSheets = await fixtureTeamSheets(f.id)
      fixtures.push(fixture)
    }
    res.json({ fixtures })
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) })
  }
})

app.post('/api/assistant/archive', async (req, res) => {
  if (!assistantAuthorized(req, res)) return
  const body = req.body || {}
  const jobId = String(body.jobId || '')
  const gameId = String(body.gameId || '')
  if (!jobId || !gameId) return res.status(400).json({ error: 'job_and_game_required' })
  const ts = Date.now()
  try {
    const linkedFixtureId = String(body.payload?.game?.portalGameId || '') || null
    await dbRunP(
      `INSERT INTO assistant_archives (id, gameId, fixtureId, jobType, data, ts) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET fixtureId = excluded.fixtureId, data = excluded.data, ts = excluded.ts`,
      [jobId, gameId, linkedFixtureId, String(body.jobType || 'PORTAL_ARCHIVE'), JSON.stringify(body.payload ?? {}), ts]
    )
    writeAudit('AssistantApp', 'assistant_archives', 'ingest', null, { jobId, gameId, jobType: body.jobType })

    // Linked fixture? Auto-file the result (one-shot like the referee form —
    // an already-completed fixture is never overwritten; ZC override stands).
    let fixtureFiled = false
    const payload = body.payload || {}
    const fixtureId = String(payload?.game?.portalGameId || '')
    const finalScore = payload?.finalScore
    if (fixtureId && finalScore && Number.isFinite(Number(finalScore.home)) && Number.isFinite(Number(finalScore.away))) {
      const f = await dbGetP('SELECT * FROM fixtures WHERE id = ? LIMIT 1', [fixtureId])
      if (f && f.status !== 'completed') {
        let d = {}
        try { d = JSON.parse(f.data || '{}') } catch {}
        d.report = {
          filedBy: 'AssistantApp',
          filedAt: ts,
          assistantGameId: gameId,
          notes: 'Result filed automatically from the Rugby Assistant match archive.',
        }
        await dbRunP(
          `UPDATE fixtures SET homeScore = ?, awayScore = ?, status = 'completed', data = ?, ts = ? WHERE id = ?`,
          [Number(finalScore.home), Number(finalScore.away), JSON.stringify(d), ts, fixtureId]
        )
        writeAudit('AssistantApp', 'fixtures', 'result', null, {
          id: fixtureId, homeScore: Number(finalScore.home), awayScore: Number(finalScore.away), source: 'assistant_archive', jobId,
        })
        const [homeName, awayName] = await Promise.all([
          schoolDisplay(f.homeSchoolId),
          schoolDisplay(f.awaySchoolId),
        ])
        notifyFixtureParties(
          f,
          'Match result filed',
          `${f.ageGroup}: ${homeName} ${Number(finalScore.home)}–${Number(finalScore.away)} ${awayName} (filed from the match-day app).`
        )
        fixtureFiled = true
      }
    }
    res.json({ ok: true, fixtureFiled })
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) })
  }
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
      if (err) return insertError(res, err)
      welcomeNotification(req.body.email, req.body.role === 'ZoneCoordinator' ? 'a Zone Coordinator' : req.body.role === 'EPHSRUAdmin' ? 'an EPHSRU Admin' : 'a School Admin')
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

// One person, several hats: every row (across tables) carrying an email is a
// role that email may sign in as. The admins table can hold multiple rows per
// email (unique per email+role), so a zone coordinator can also be a school
// admin — and separately hold coach/referee/player records.
const ROLE_ORDER = ['EPHSRUAdmin', 'ZoneCoordinator', 'SchoolAdmin', 'Coach', 'Referee', 'Player']

function lookupAllRolesByEmail(email) {
  const e = String(email || '').trim().toLowerCase()
  if (!e) return Promise.resolve([])
  const parseHash = (row) => { try { return JSON.parse(row.data || '{}').passwordHash || '' } catch { return '' } }
  return new Promise((resolve) => {
    const out = []
    db.all('SELECT role, zoneId, schoolId, name, surname, data FROM admins WHERE LOWER(email) = ?', [e], (err, admins) => {
      for (const a of (err ? [] : admins || [])) {
        out.push({ role: a.role || 'EPHSRUAdmin', zoneId: a.zoneId || '', schoolId: a.schoolId || '', name: a.name || '', surname: a.surname || '', passwordHash: parseHash(a) })
      }
      db.get('SELECT zoneId, schoolId, name, surname, data FROM coaches WHERE LOWER(email) = ? LIMIT 1', [e], (err2, c) => {
        if (!err2 && c) out.push({ role: 'Coach', zoneId: c.zoneId || '', schoolId: c.schoolId || '', name: c.name || '', surname: c.surname || '', passwordHash: parseHash(c) })
        db.get('SELECT zoneId, name, surname, data FROM referees WHERE LOWER(email) = ? LIMIT 1', [e], (err3, r) => {
          if (!err3 && r) out.push({ role: 'Referee', zoneId: r.zoneId || '', schoolId: '', name: r.name || '', surname: r.surname || '', passwordHash: parseHash(r) })
          db.get('SELECT zoneId, schoolId, name, surname, data FROM players WHERE LOWER(email) = ? LIMIT 1', [e], (err4, p) => {
            if (!err4 && p) out.push({ role: 'Player', zoneId: p.zoneId || '', schoolId: p.schoolId || '', name: p.name || '', surname: p.surname || '', passwordHash: parseHash(p) })
            out.sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role))
            resolve(out)
          })
        })
      })
    })
  })
}

const roleListOut = (roles) => roles.map((r) => ({ role: r.role, zoneId: r.zoneId, schoolId: r.schoolId, name: r.name, surname: r.surname }))

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
  lookupAllRolesByEmail(e).then((roles) => {
    // A known email may claim any of ITS OWN roles (multi-role people pick a
    // hat); claiming a role it doesn't hold stays a mismatch.
    const match = roles.find((r) => r.role === role)
    if (roles.length > 0 && !match) {
      return res.status(403).json({ error: 'role_mismatch', role: roles[0].role })
    }
    const z = match && match.zoneId ? match.zoneId : zoneId
    const s = match && match.schoolId ? match.schoolId : schoolId
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
  const roles = await lookupAllRolesByEmail(email)
  if (roles.length === 0) return res.status(404).json({ error: 'not_found' })
  // One password per person: accept a match against any of their records'
  // hashes (roles created at different times may carry different hashes).
  const hashes = roles.map((r) => r.passwordHash).filter(Boolean)
  if (hashes.length > 0) {
    if (!hashes.some((h) => bcrypt.compareSync(password, h))) {
      return res.status(401).json({ error: 'invalid_credentials' })
    }
  } else if (env === 'production') {
    // Accounts created without a password cannot sign in to a public deployment
    return res.status(403).json({ error: 'password_setup_required' })
  }
  const requested = String(req.body?.role || '')
  let user = roles[0]
  if (requested) {
    user = roles.find((r) => r.role === requested)
    if (!user) return res.status(400).json({ error: 'role_not_available' })
  } else if (roles.length > 1) {
    // Several hats and no choice made: hand back the list, no token yet.
    return res.json({ multi: true, email, roles: roleListOut(roles) })
  }
  const token = sign({ role: user.role, zoneId: user.zoneId, schoolId: user.schoolId, email })
  res.json({ token, role: user.role, zoneId: user.zoneId, schoolId: user.schoolId, name: user.name, surname: user.surname, roles: roleListOut(roles) })
})

// In-app role switching: a signed-in user swaps to another of THEIR OWN roles
// without re-entering the password (the valid token is the proof of session).
app.post('/api/auth/switch-role', async (req, res) => {
  const email = String(req.user?.email || '').trim().toLowerCase()
  if (!req.user?.role || !email) return res.status(403).json({ error: 'forbidden' })
  const target = String(req.body?.role || '')
  const roles = await lookupAllRolesByEmail(email)
  const user = roles.find((r) => r.role === target)
  if (!user) return res.status(400).json({ error: 'role_not_available' })
  writeAudit(req.user.role, 'auth', 'role_switch', { role: req.user.role }, { role: target, email })
  const token = sign({ role: user.role, zoneId: user.zoneId, schoolId: user.schoolId, email })
  res.json({ token, role: user.role, zoneId: user.zoneId, schoolId: user.schoolId, name: user.name, surname: user.surname, roles: roleListOut(roles) })
})

// --- Add a role to an existing user (hierarchy-scoped) -----------------------
// Which roles a granter may hand out, and the scope forced onto the grant.
// EPHSRU admin grants anything anywhere; a zone coordinator grants within the
// zone the same posts they can create (school admins, referees); a school
// admin grants within their school (coaches, players) plus zone referees.
function grantableRolesFor(user) {
  if (!user) return []
  if (user.role === 'EPHSRUAdmin') return ROLE_ORDER.slice()
  if (user.role === 'ZoneCoordinator') return ['SchoolAdmin', 'Referee']
  if (user.role === 'SchoolAdmin') return ['Coach', 'Referee', 'Player']
  return []
}

// Admins may look up which hats an email already wears before granting a new
// one (never exposes password hashes).
app.get('/api/users/roles', (req, res) => {
  if (grantableRolesFor(req.user).length === 0) return res.status(403).json({ error: 'forbidden' })
  const email = String(req.query.email || '').trim().toLowerCase()
  if (!email) return res.status(400).json({ error: 'email_required' })
  lookupAllRolesByEmail(email).then((roles) => {
    if (roles.length === 0) return res.status(404).json({ error: 'not_found' })
    res.json({ email, roles: roleListOut(roles) })
  })
})

app.post('/api/users/add-role', async (req, res) => {
  const granter = req.user
  const grantable = grantableRolesFor(granter)
  if (grantable.length === 0) return res.status(403).json({ error: 'forbidden' })
  const email = String(req.body?.email || '').trim().toLowerCase()
  const role = String(req.body?.role || '')
  if (!email) return res.status(400).json({ error: 'email_required' })
  if (!grantable.includes(role)) return res.status(403).json({ error: 'role_not_grantable' })

  // Scope: sub-union granters can only grant inside their own patch.
  let zoneId = String(req.body?.zoneId || '')
  let schoolId = String(req.body?.schoolId || '')
  if (granter.role === 'ZoneCoordinator') {
    zoneId = String(granter.zoneId || '')
    if (role !== 'Referee') schoolId = schoolId || ''
    if (role === 'SchoolAdmin' && !schoolId) return res.status(400).json({ error: 'school_required' })
  } else if (granter.role === 'SchoolAdmin') {
    zoneId = String(granter.zoneId || '')
    schoolId = role === 'Referee' ? '' : String(granter.schoolId || '')
  } else {
    // EPHSRU admin must still say where the new hat lives (unless union-wide)
    if (['ZoneCoordinator', 'SchoolAdmin', 'Coach', 'Player'].includes(role) && !zoneId) {
      return res.status(400).json({ error: 'zone_required' })
    }
    if (['SchoolAdmin', 'Coach', 'Player'].includes(role) && !schoolId) {
      return res.status(400).json({ error: 'school_required' })
    }
    if (role === 'EPHSRUAdmin') { zoneId = ''; schoolId = '' }
  }
  // A zone coordinator granting SchoolAdmin must pick a school in their zone;
  // scope check reuses the same rule the create-admin endpoint enforces.
  if (granter.role === 'ZoneCoordinator' && role === 'SchoolAdmin' &&
      !withinScope('admins', granter, { role, zoneId, schoolId })) {
    return res.status(403).json({ error: 'scope' })
  }

  const existing = await lookupAllRolesByEmail(email)
  if (existing.length === 0) return res.status(404).json({ error: 'user_not_found' })
  if (existing.some((r) => r.role === role)) return res.status(409).json({ error: 'role_already_held' })

  // The new hat inherits identity + the one password the person already has.
  const source = existing.find((r) => r.passwordHash) || existing[0]
  const id = crypto.randomUUID()
  const ts = Date.now()
  const body = {
    name: source.name, surname: source.surname, email,
    zoneId, schoolId,
    passwordHash: source.passwordHash || undefined,
    grantedBy: granter.email || granter.role, grantedByRole: granter.role, grantedAt: ts,
  }
  const data = JSON.stringify(body)
  const done = (err) => {
    if (err) return insertError(res, err)
    writeAudit(granter.role, 'users', 'role_granted', { email, roles: existing.map((r) => r.role) }, { email, role, zoneId, schoolId })
    queueNotification(email, 'New role added to your account',
      `You can now also sign in as ${role === 'EPHSRUAdmin' ? 'an EPHSRU Admin' : `a ${role.replace(/([A-Z])/g, ' $1').trim()}`}. Use the role menu in the header to switch.`)
    lookupAllRolesByEmail(email).then((roles) => res.json({ id, ts, email, role, roles: roleListOut(roles) }))
  }
  if (role === 'Coach') {
    db.run('INSERT INTO coaches (id, zoneId, schoolId, name, surname, email, data, ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, zoneId, schoolId, body.name, body.surname, email, data, ts], done)
  } else if (role === 'Referee') {
    db.run('INSERT INTO referees (id, name, surname, email, data, ts, zoneId) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, body.name, body.surname, email, data, ts, zoneId || null], done)
  } else if (role === 'Player') {
    db.run('INSERT INTO players (id, zoneId, schoolId, name, surname, email, data, ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, zoneId, schoolId, body.name, body.surname, email, data, ts], done)
  } else {
    db.run('INSERT INTO admins (id, name, surname, email, role, zoneId, schoolId, data, ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, body.name, body.surname, email, role, zoneId || null, schoolId || null, data, ts], done)
  }
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
// Clicking the link in a verification email lands the SPA with ?verifyEmail=
// which posts the token here. Public: the signed token itself is the proof.
app.post('/api/auth/verify-email', (req, res) => {
  const email = parseEmailVerifyToken(req.body?.token)
  if (!email) return res.status(400).json({ error: 'invalid_token' })
  markEmailVerified(email, (err, updated) => {
    if (err) return res.status(500).json({ error: err.message })
    if (!updated) return res.status(404).json({ error: 'no_account_for_email' })
    writeAudit('', 'auth', 'email_verified', null, { email })
    res.json({ ok: true, email, updated })
  })
})

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
    console.log(`[password-reset] token for ${email}: ${token} (expires ${new Date(expiresAt).toISOString()})`)
    // The reset code goes DIRECTLY by email (never into the in-app inbox —
    // a locked-out user can't read that). The in-app note is just a heads-up.
    sendMail(
      email,
      'Your password reset code',
      `You (or your administrator) requested a password reset for the EPHSRU Rugby Portal.\n\nYour reset code is:\n\n${token}\n\nOn the sign-in page choose "Forgot password?", paste this code and pick a new password. The code expires in 1 hour.\n\nIf you did not request this, you can safely ignore this email.`
    )
    queueNotification(email, 'Password reset requested', 'A password reset was requested for your account. If this was not you, contact your school administrator.', { emailCopy: false })
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

// ===========================================================================
// PrecisionCode owner panel — platform-wide aggregates for the product owner.
// One shared database; every number here is a single GROUP BY away. Gated to
// the union admin role (the owner account).
// ===========================================================================
function dbAllPf(sql, params) {
  return new Promise((resolve, reject) => db.all(sql, params, (e, r) => (e ? reject(e) : resolve(r || []))))
}

// The business dashboard belongs to the product owner (PrecisionCode), not to
// every union admin. Override/extend via PLATFORM_OWNERS="a@x.com,b@y.com".
const PLATFORM_OWNERS = String(process.env.PLATFORM_OWNERS || 'precisioncode.sa@gmail.com')
  .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)

app.get('/api/platform/overview', async (req, res) => {
  const email = String(req.user?.email || '').trim().toLowerCase()
  if (req.user?.role !== 'EPHSRUAdmin' || !PLATFORM_OWNERS.includes(email)) {
    return res.status(403).json({ error: 'owner_only' })
  }
  try {
    const seasonStart = new Date(`${new Date().getFullYear()}-01-01T00:00:00Z`).getTime()
    const since14 = Date.now() - 14 * 86_400_000

    // Portable SQL only — this endpoint must run identically on SQLite (dev)
    // and Postgres (prod), so no json_extract/strftime; day grouping is in JS.
    const [schoolsByZone, playersByZone, pendingPlayers, seasonPlayers, coachesByZone, referees, adminsByRole, auditTs, actionRows, latestAudit] = await Promise.all([
      dbAllPf('SELECT zoneId, COUNT(1) n FROM schools GROUP BY zoneId', []),
      dbAllPf('SELECT zoneId, COUNT(1) n FROM players GROUP BY zoneId', []),
      dbAllPf(`SELECT COUNT(1) n FROM players WHERE data LIKE '%"status":"pending"%'`, []),
      dbAllPf('SELECT COUNT(1) n FROM players WHERE ts >= ?', [seasonStart]),
      dbAllPf('SELECT zoneId, COUNT(1) n FROM coaches GROUP BY zoneId', []),
      dbAllPf('SELECT COUNT(1) n FROM referees', []),
      dbAllPf('SELECT role, COUNT(1) n FROM admins GROUP BY role', []),
      dbAllPf('SELECT ts FROM audits WHERE ts >= ?', [since14]),
      dbAllPf('SELECT action, COUNT(1) n FROM audits WHERE ts >= ? GROUP BY action ORDER BY n DESC LIMIT 6', [since14]),
      dbAllPf('SELECT MAX(ts) t FROM audits', []),
    ])

    // Group audit events into calendar days (local server time)
    const dayCounts = new Map()
    for (const r of auditTs) {
      const d = new Date(Number(r.ts) || 0)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      dayCounts.set(key, (dayCounts.get(key) || 0) + 1)
    }
    const activityRows = [...dayCounts.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([day, n]) => ({ day, n }))

    const sum = (rows) => rows.reduce((a, r) => a + Number(r.n || 0), 0)
    const byRole = Object.fromEntries(adminsByRole.map((r) => [String(r.role || ''), Number(r.n || 0)]))

    // Per-zone breakdown for the drill table (zone names resolve client-side)
    const zoneIds = [...new Set([...schoolsByZone, ...playersByZone, ...coachesByZone].map((r) => String(r.zoneId || '')))]
      .filter((z) => z !== '')
    const pick = (rows, z) => Number((rows.find((r) => String(r.zoneId || '') === z) || {}).n || 0)
    const zonesOut = zoneIds.map((z) => ({
      zoneId: z,
      schools: pick(schoolsByZone, z),
      players: pick(playersByZone, z),
      coaches: pick(coachesByZone, z),
    })).sort((a, b) => b.players - a.players)

    res.json({
      company: 'PrecisionCode PTY LTD',
      generatedAt: Date.now(),
      products: [
        {
          id: 'ephsru-schools-rugby',
          name: 'EPHSRU Schools Rugby Portal',
          sport: 'Rugby',
          level: 'school',
          status: 'live',
          orgs: sum(schoolsByZone),
          players: sum(playersByZone),
          coaches: sum(coachesByZone),
          referees: sum(referees),
          zoneCoordinators: byRole.ZoneCoordinator || 0,
          schoolAdmins: byRole.SchoolAdmin || 0,
          unionAdmins: byRole.EPHSRUAdmin || 0,
          registrationsThisSeason: sum(seasonPlayers),
          pendingPlayers: sum(pendingPlayers),
          lastActivityAt: Number((latestAudit[0] || {}).t || 0),
        },
      ],
      zones: zonesOut,
      activity: activityRows.map((r) => ({ day: String(r.day), events: Number(r.n || 0) })),
      topActions: actionRows.map((r) => ({ action: String(r.action || ''), n: Number(r.n || 0) })),
    })
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) })
  }
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
// Own profile: every signed-in user can read their row and set their photo.
// ===========================================================================
const ME_TABLES = { Player: 'players', Coach: 'coaches', Referee: 'referees', SchoolAdmin: 'admins', ZoneCoordinator: 'admins', EPHSRUAdmin: 'admins' }

function findOwnRow(user, cb) {
  const table = ME_TABLES[user?.role]
  const email = String(user?.email || '').trim().toLowerCase()
  if (!table || !email) return cb(null, null)
  // The admins table can hold several of a person's hats — pick the row for
  // the role they are currently signed in as.
  const roleFilter = table === 'admins' ? ' AND role = ?' : ''
  const params = table === 'admins' ? [email, String(user.role)] : [email]
  db.get(`SELECT * FROM ${table} WHERE lower(email) = ?${roleFilter}`, params, (err, row) => cb(err, row ? { table, row } : null))
}

// Shape the own-profile payload consistently for GET and PUT. Extra role
// fields (qualifications, availability, …) live in the JSON `data` blob so the
// same response works for players, coaches, referees and admins alike.
function profileFromRow(user, found) {
  if (!found) return { role: user.role, email: user.email }
  const d = (() => { try { return JSON.parse(found.row.data || '{}') } catch { return {} } })()
  return {
    role: user.role,
    email: user.email,
    id: found.row.id,
    name: found.row.name || d.name || '',
    surname: found.row.surname || d.surname || '',
    contactNumber: found.row.contactNumber || d.contactNumber || d.phone || '',
    photoUrl: d.photoUrl || '',
    emailVerified: d.emailVerified === true,
    qualifications: d.qualifications || found.row.qualifications || '',
    experience: d.experience || found.row.experience || '',
    position: d.position || '',
    availability: d.availability || '',
    address: d.address || '',
    bio: d.bio || '',
    title: d.title || '',
    zoneId: found.row.zoneId || d.zoneId || '',
    schoolId: found.row.schoolId || d.schoolId || '',
  }
}

app.get('/api/me', (req, res) => {
  if (!req.user?.role || !req.user?.email) return res.status(403).json({ error: 'forbidden' })
  findOwnRow(req.user, async (err, found) => {
    if (err) return res.status(500).json({ error: err.message })
    const roles = await lookupAllRolesByEmail(req.user.email).catch(() => [])
    res.json({ ...profileFromRow(req.user, found), roles: roleListOut(roles) })
  })
})

// Fields a user may change on their own record. Identity and scope
// (email, role, id, zone/school) stay fixed by whoever created the account.
const ME_EDITABLE = ['qualifications', 'experience', 'position', 'availability', 'address', 'bio', 'title']

app.put('/api/me', (req, res) => {
  if (!req.user?.role || !req.user?.email) return res.status(403).json({ error: 'forbidden' })
  findOwnRow(req.user, (err, found) => {
    if (err) return res.status(500).json({ error: err.message })
    if (!found) return res.status(404).json({ error: 'no_profile_record' })
    let d = {}
    try { d = JSON.parse(found.row.data || '{}') } catch {}
    const body = req.body || {}
    for (const k of ME_EDITABLE) {
      if (Object.prototype.hasOwnProperty.call(body, k)) d[k] = typeof body[k] === 'string' ? body[k].trim() : body[k]
    }
    const name = String((body.name ?? found.row.name) || '').trim()
    const surname = String((body.surname ?? found.row.surname) || '').trim()
    const contactNumber = String((body.contactNumber ?? body.phone ?? found.row.contactNumber) || '').trim()
    if (!name || !surname) return res.status(400).json({ error: 'name_and_surname_required' })
    d.name = name; d.surname = surname; d.contactNumber = contactNumber; d.phone = contactNumber
    const before = { name: found.row.name, surname: found.row.surname }
    db.run(
      `UPDATE ${found.table} SET name = ?, surname = ?, contactNumber = ?, data = ? WHERE id = ?`,
      [name, surname, contactNumber, JSON.stringify(d), found.row.id],
      function (uerr) {
        if (uerr) return res.status(500).json({ error: uerr.message })
        writeAudit(req.user.role, found.table, 'update', before, { id: found.row.id, name, surname })
        res.json(profileFromRow(req.user, { table: found.table, row: { ...found.row, name, surname, contactNumber, data: JSON.stringify(d) } }))
      }
    )
  })
})

// Signed-in users can (re)send their own verification email from My Profile.
app.post('/api/me/verify-email', (req, res) => {
  const email = String(req.user?.email || '').trim().toLowerCase()
  if (!req.user?.role || !email) return res.status(403).json({ error: 'forbidden' })
  queueNotification(
    email,
    'Verify your email address',
    `Please confirm this email address belongs to you by opening this link:\n${emailVerifyLink(email)}\n\nIf you did not request this, you can ignore it.`
  )
  // Outside production the token is returned so the flow is testable without SMTP
  if ((process.env.NODE_ENV || 'development') !== 'production') {
    return res.json({ ok: true, sent: mailEnabled, token: emailVerifyToken(email) })
  }
  res.json({ ok: true, sent: mailEnabled })
})

// Personal document locker — every signed-in user can list, upload and remove
// their own documents (certificates, IDs, clearances). Stored in the shared
// `documents` table keyed to the user's own record so the existing reviewer
// scoping still surfaces them to the relevant school/zone admins.
const ME_DOC_TYPE = { Player: 'player', Coach: 'coach', Referee: 'referee', SchoolAdmin: 'admin', ZoneCoordinator: 'admin', EPHSRUAdmin: 'admin' }

app.get('/api/me/documents', (req, res) => {
  if (!req.user?.role || !req.user?.email) return res.status(403).json({ error: 'forbidden' })
  findOwnRow(req.user, (err, found) => {
    if (err) return res.status(500).json({ error: err.message })
    if (!found) return res.json([])
    const ownerType = ME_DOC_TYPE[req.user.role] || 'user'
    db.all('SELECT * FROM documents WHERE ownerType = ? AND ownerId = ? ORDER BY ts DESC', [ownerType, found.row.id], (e, rows) => {
      if (e) return res.status(500).json({ error: e.message })
      res.json(rows || [])
    })
  })
})

app.post('/api/me/documents', (req, res) => {
  if (!req.user?.role || !req.user?.email) return res.status(403).json({ error: 'forbidden' })
  const fileName = String(req.body?.fileName || '').trim()
  const fileUrl = String(req.body?.fileUrl || '').trim()
  if (!fileName || !fileUrl) return res.status(400).json({ error: 'file_required' })
  findOwnRow(req.user, (err, found) => {
    if (err) return res.status(500).json({ error: err.message })
    if (!found) return res.status(404).json({ error: 'no_profile_record' })
    const ownerType = ME_DOC_TYPE[req.user.role] || 'user'
    const id = crypto.randomUUID()
    const ts = Date.now()
    db.run(
      'INSERT INTO documents (id, ownerType, ownerId, fileName, fileUrl, status, ts) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, ownerType, found.row.id, fileName, fileUrl, 'approved', ts],
      function (ierr) {
        if (ierr) return res.status(500).json({ error: ierr.message })
        writeAudit(req.user.role, 'documents', 'create', null, { id, ownerType, ownerId: found.row.id, fileName })
        res.json({ id, ownerType, ownerId: found.row.id, fileName, fileUrl, status: 'approved', ts })
      }
    )
  })
})

app.delete('/api/me/documents/:id', (req, res) => {
  if (!req.user?.role || !req.user?.email) return res.status(403).json({ error: 'forbidden' })
  findOwnRow(req.user, (err, found) => {
    if (err) return res.status(500).json({ error: err.message })
    if (!found) return res.status(404).json({ error: 'no_profile_record' })
    const ownerType = ME_DOC_TYPE[req.user.role] || 'user'
    db.get('SELECT * FROM documents WHERE id = ?', [req.params.id], (gerr, doc) => {
      if (gerr) return res.status(500).json({ error: gerr.message })
      if (!doc || String(doc.ownerId) !== String(found.row.id) || String(doc.ownerType) !== ownerType) return res.status(404).json({ error: 'not_found' })
      db.run('DELETE FROM documents WHERE id = ?', [req.params.id], function (derr) {
        if (derr) return res.status(500).json({ error: derr.message })
        writeAudit(req.user.role, 'documents', 'delete', doc, null)
        res.json({ ok: true, id: req.params.id })
      })
    })
  })
})

app.post('/api/me/photo', (req, res) => {
  if (!req.user?.role || !req.user?.email) return res.status(403).json({ error: 'forbidden' })
  const photoUrl = String(req.body?.photoUrl || '').trim()
  if (!photoUrl) return res.status(400).json({ error: 'photoUrl_required' })
  findOwnRow(req.user, (err, found) => {
    if (err) return res.status(500).json({ error: err.message })
    if (!found) return res.status(404).json({ error: 'no_profile_record' })
    let d = {}
    try { d = JSON.parse(found.row.data || '{}') } catch {}
    d.photoUrl = photoUrl
    db.run(`UPDATE ${found.table} SET data = ? WHERE id = ?`, [JSON.stringify(d), found.row.id], function (uerr) {
      if (uerr) return res.status(500).json({ error: uerr.message })
      writeAudit(req.user.role, found.table, 'photo_update', null, { id: found.row.id })
      res.json({ ok: true, photoUrl })
    })
  })
})

// ===========================================================================
// Match-day (Phase 1): fixtures + referee assignment.
// A fixture belongs to the organising zone; visibility follows the same
// hierarchy as everything else. The referee's report will fold into
// fixtures.data.report in Phase 3.
// ===========================================================================
const FIXTURE_AGE_GROUPS = new Set(['U15', 'U16', 'U17', 'U19'])
const FIXTURE_EDIT_STATUSES = new Set(['scheduled', 'cancelled', 'postponed'])

function dbGetP(sql, params) {
  return new Promise((resolve, reject) => db.get(sql, params, (e, r) => (e ? reject(e) : resolve(r || null))))
}
function dbRunP(sql, params) {
  return new Promise((resolve, reject) => db.run(sql, params, function (e) { e ? reject(e) : resolve(this) }))
}

// Full match archive for a fixture (pushed by the Assistant at full-time).
// Visible to whoever can see the fixture; latest archive wins if replayed.
app.get('/api/fixtures/:id/archive', async (req, res) => {
  const user = req.user || {}
  if (!user.role) return res.status(403).json({ error: 'forbidden' })
  try {
    const f = await dbGetP('SELECT * FROM fixtures WHERE id = ?', [String(req.params.id)])
    if (!f || !canSeeFixture(user, f)) return res.status(404).json({ error: 'not_found' })
    const row = await dbGetP(
      'SELECT * FROM assistant_archives WHERE fixtureId = ? ORDER BY ts DESC LIMIT 1',
      [String(f.id)]
    )
    if (!row) return res.status(404).json({ error: 'no_archive' })
    let payload = {}
    try { payload = JSON.parse(row.data || '{}') } catch {}
    res.json({ receivedAt: Number(row.ts), archive: payload })
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) })
  }
})

function fixtureOut(row) {
  if (!row) return row
  let d = {}
  try { d = JSON.parse(row.data || '{}') } catch {}
  const { data, ...rest } = row
  return { ...rest, notes: d.notes || '', report: d.report || null }
}

// Union manages everything; a zone coordinator only their own zone's fixtures
function canManageFixtures(user, zoneId) {
  if (user?.role === 'EPHSRUAdmin') return true
  return user?.role === 'ZoneCoordinator' && String(user.zoneId || '') !== '' && String(user.zoneId) === String(zoneId)
}

// Can this user see this fixture at all?
function canSeeFixture(user, f) {
  const role = user?.role
  if (!role) return false
  if (role === 'EPHSRUAdmin') return true
  if (role === 'ZoneCoordinator') return String(f.zoneId) === String(user.zoneId || '')
  if (role === 'Referee') {
    const me = String(user.email || '').trim().toLowerCase()
    return (me && String(f.refereeEmail || '').toLowerCase() === me) || String(f.zoneId) === String(user.zoneId || '')
  }
  const sid = String(user.schoolId || '')
  return !!sid && (String(f.homeSchoolId) === sid || String(f.awaySchoolId) === sid)
}

async function schoolDisplay(schoolId) {
  try {
    const r = await dbGetP('SELECT data FROM schools WHERE schoolId = ? LIMIT 1', [String(schoolId || '')])
    const d = r ? JSON.parse(r.data || '{}') : {}
    return String(d.name || schoolId || '')
  } catch { return String(schoolId || '') }
}

async function notifyFixtureParties(f, subject, message, { includeReferee = true } = {}) {
  try {
    const admins = await dbAllP(
      `SELECT email FROM admins WHERE role = 'SchoolAdmin' AND (schoolId = ? OR schoolId = ?)`,
      [String(f.homeSchoolId), String(f.awaySchoolId)]
    )
    for (const a of admins) queueNotification(a.email, subject, message)
    if (includeReferee && f.refereeEmail) queueNotification(f.refereeEmail, subject, message)
  } catch {}
}

app.post('/api/fixtures', async (req, res) => {
  const user = req.user || {}
  const body = req.body || {}
  const zoneId = user.role === 'ZoneCoordinator' ? String(user.zoneId || '') : String(body.zoneId || user.zoneId || '')
  if (!canManageFixtures(user, zoneId)) return res.status(403).json({ error: 'forbidden' })
  const homeSchoolId = String(body.homeSchoolId || '')
  const awaySchoolId = String(body.awaySchoolId || '')
  const ageGroup = String(body.ageGroup || '')
  const kickoffAt = Number(body.kickoffAt || 0)
  if (!zoneId || !homeSchoolId || !awaySchoolId) return res.status(400).json({ error: 'zone_and_schools_required' })
  if (homeSchoolId === awaySchoolId) return res.status(400).json({ error: 'schools_must_differ' })
  if (!FIXTURE_AGE_GROUPS.has(ageGroup)) return res.status(400).json({ error: 'invalid_age_group' })
  if (!Number.isFinite(kickoffAt) || kickoffAt <= 0) return res.status(400).json({ error: 'kickoff_required' })
  const refereeEmail = String(body.refereeEmail || '').trim().toLowerCase() || null
  const id = crypto.randomUUID()
  const ts = Date.now()
  const data = JSON.stringify({ createdBy: String(user.email || ''), notes: String(body.notes || '') })
  try {
    await dbRunP(
      `INSERT INTO fixtures (id, zoneId, homeSchoolId, awaySchoolId, ageGroup, kickoffAt, venue, refereeEmail, status, data, ts)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?)`,
      [id, zoneId, homeSchoolId, awaySchoolId, ageGroup, kickoffAt, String(body.venue || ''), refereeEmail, data, ts]
    )
    writeAudit(user.role, 'fixtures', 'create', null, { id, zoneId, homeSchoolId, awaySchoolId, ageGroup, kickoffAt })
    const [homeName, awayName] = await Promise.all([schoolDisplay(homeSchoolId), schoolDisplay(awaySchoolId)])
    const when = new Date(kickoffAt).toLocaleString()
    const f = { homeSchoolId, awaySchoolId, refereeEmail }
    notifyFixtureParties(f, 'New fixture scheduled', `${ageGroup}: ${homeName} vs ${awayName} on ${when}${body.venue ? ` at ${body.venue}` : ''}.`)
    if (refereeEmail) queueNotification(refereeEmail, 'Referee appointment', `You have been appointed to referee ${homeName} vs ${awayName} (${ageGroup}) on ${when}${body.venue ? ` at ${body.venue}` : ''}.`)
    res.json({ id, zoneId, homeSchoolId, awaySchoolId, ageGroup, kickoffAt, venue: String(body.venue || ''), refereeEmail, status: 'scheduled', ts })
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) })
  }
})

app.get('/api/fixtures', async (req, res) => {
  const user = req.user || {}
  if (!user.role) return res.status(403).json({ error: 'forbidden' })
  const params = []
  let where = '1=1'
  if (user.role === 'EPHSRUAdmin') {
    where = '1=1'
  } else if (user.role === 'ZoneCoordinator') {
    where = 'zoneId = ?'; params.push(String(user.zoneId || ''))
  } else if (user.role === 'Referee') {
    where = '(LOWER(COALESCE(refereeEmail, \'\')) = ? OR zoneId = ?)'
    params.push(String(user.email || '').trim().toLowerCase(), String(user.zoneId || ''))
  } else {
    const sid = String(user.schoolId || '')
    if (!sid) return res.json([])
    where = '(homeSchoolId = ? OR awaySchoolId = ?)'; params.push(sid, sid)
  }
  if (String(req.query.upcoming || '') === '1') {
    where += ' AND kickoffAt >= ?'
    params.push(Date.now() - 3 * 3600_000) // a match stays "upcoming" through its own afternoon
  }
  try {
    const rows = await dbAllP(`SELECT * FROM fixtures WHERE ${where} ORDER BY kickoffAt ASC LIMIT 500`, params)
    res.json(rows.map(fixtureOut))
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) })
  }
})

app.get('/api/fixtures/:id', async (req, res) => {
  const user = req.user || {}
  if (!user.role) return res.status(403).json({ error: 'forbidden' })
  try {
    const row = await dbGetP('SELECT * FROM fixtures WHERE id = ?', [String(req.params.id)])
    if (!row) return res.status(404).json({ error: 'not_found' })
    if (!canSeeFixture(user, row)) return res.status(403).json({ error: 'forbidden' })
    const sheets = await dbAllP('SELECT * FROM team_sheets WHERE fixtureId = ?', [row.id])
    const kicked = Date.now() >= Number(row.kickoffAt || 0)
    const privileged = user.role === 'EPHSRUAdmin' || user.role === 'ZoneCoordinator' ||
      (user.role === 'Referee' && String(row.refereeEmail || '').toLowerCase() === String(user.email || '').toLowerCase())
    const visible = sheets.filter((s) => {
      if (privileged || kicked) return true
      // Before kickoff a school only sees its own sheet — no early scouting
      return String(s.schoolId) === String(user.schoolId || '')
    }).map((s) => {
      let d = {}
      try { d = JSON.parse(s.data || '{}') } catch {}
      return { ...s, data: undefined, players: Array.isArray(d.players) ? d.players : [] }
    })
    // Resolve player names so the referee's sheet view / result form can show
    // people, not ids
    const allIds = [...new Set(visible.flatMap((s) => s.players.map((p) => String(p.playerId || ''))))].filter(Boolean)
    if (allIds.length) {
      const nameRows = await dbAllP(`SELECT id, name, surname FROM players WHERE id IN (${allIds.map(() => '?').join(',')})`, allIds)
      const nameById = new Map(nameRows.map((r) => [String(r.id), `${r.name || ''} ${r.surname || ''}`.trim()]))
      for (const s of visible) {
        s.players = s.players.map((p) => ({ ...p, playerName: nameById.get(String(p.playerId)) || '' }))
      }
    }
    res.json({ ...fixtureOut(row), teamSheets: visible })
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) })
  }
})

app.put('/api/fixtures/:id', async (req, res) => {
  const user = req.user || {}
  try {
    const row = await dbGetP('SELECT * FROM fixtures WHERE id = ?', [String(req.params.id)])
    if (!row) return res.status(404).json({ error: 'not_found' })
    if (!canManageFixtures(user, row.zoneId)) return res.status(403).json({ error: 'forbidden' })
    const body = req.body || {}
    const next = { ...row }
    if (body.kickoffAt !== undefined) {
      const k = Number(body.kickoffAt)
      if (!Number.isFinite(k) || k <= 0) return res.status(400).json({ error: 'invalid_kickoff' })
      next.kickoffAt = k
    }
    if (body.venue !== undefined) next.venue = String(body.venue || '')
    if (body.ageGroup !== undefined) {
      if (!FIXTURE_AGE_GROUPS.has(String(body.ageGroup))) return res.status(400).json({ error: 'invalid_age_group' })
      next.ageGroup = String(body.ageGroup)
    }
    if (body.status !== undefined) {
      // Completion happens through the result flow (Phase 3), never a bare status edit
      if (!FIXTURE_EDIT_STATUSES.has(String(body.status))) return res.status(400).json({ error: 'invalid_status' })
      next.status = String(body.status)
    }
    let refereeChanged = false
    if (body.refereeEmail !== undefined) {
      const nextRef = String(body.refereeEmail || '').trim().toLowerCase() || null
      refereeChanged = nextRef !== (row.refereeEmail ? String(row.refereeEmail).toLowerCase() : null)
      next.refereeEmail = nextRef
    }
    let d = {}
    try { d = JSON.parse(row.data || '{}') } catch {}
    if (body.notes !== undefined) d.notes = String(body.notes || '')
    await dbRunP(
      'UPDATE fixtures SET kickoffAt = ?, venue = ?, ageGroup = ?, status = ?, refereeEmail = ?, data = ? WHERE id = ?',
      [next.kickoffAt, next.venue, next.ageGroup, next.status, next.refereeEmail, JSON.stringify(d), row.id]
    )
    writeAudit(user.role, 'fixtures', 'update', { id: row.id, status: row.status, refereeEmail: row.refereeEmail }, { id: row.id, status: next.status, refereeEmail: next.refereeEmail })
    const [homeName, awayName] = await Promise.all([schoolDisplay(row.homeSchoolId), schoolDisplay(row.awaySchoolId)])
    const when = new Date(next.kickoffAt).toLocaleString()
    if (refereeChanged && next.refereeEmail) {
      queueNotification(next.refereeEmail, 'Referee appointment', `You have been appointed to referee ${homeName} vs ${awayName} (${next.ageGroup}) on ${when}${next.venue ? ` at ${next.venue}` : ''}.`)
    }
    if (next.status !== row.status && (next.status === 'cancelled' || next.status === 'postponed')) {
      notifyFixtureParties(next, `Fixture ${next.status}`, `${next.ageGroup}: ${homeName} vs ${awayName} (${when}) has been ${next.status}.`)
    }
    res.json(fixtureOut({ ...next, data: JSON.stringify(d) }))
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) })
  }
})

// Phase 2: a school's team sheet for a fixture. Coaches/school admins of the
// competing schools upsert their own sheet until kickoff; every listed player
// must belong to that school, be approved, and match the fixture's age group.
app.post('/api/fixtures/:id/team-sheet', async (req, res) => {
  const user = req.user || {}
  if (!(user.role === 'Coach' || user.role === 'SchoolAdmin')) return res.status(403).json({ error: 'forbidden' })
  const sid = String(user.schoolId || '')
  if (!sid) return res.status(403).json({ error: 'forbidden' })
  try {
    const f = await dbGetP('SELECT * FROM fixtures WHERE id = ?', [String(req.params.id)])
    if (!f) return res.status(404).json({ error: 'not_found' })
    if (String(f.homeSchoolId) !== sid && String(f.awaySchoolId) !== sid) return res.status(403).json({ error: 'not_your_fixture' })
    if (String(f.status) !== 'scheduled') return res.status(400).json({ error: 'fixture_not_open' })
    if (Date.now() >= Number(f.kickoffAt || 0)) return res.status(400).json({ error: 'sheet_locked' })

    const players = Array.isArray(req.body?.players) ? req.body.players : []
    if (players.length === 0 || players.length > 30) return res.status(400).json({ error: 'players_1_to_30' })
    const ids = players.map((p) => String(p?.playerId || '')).filter(Boolean)
    if (new Set(ids).size !== players.length) return res.status(400).json({ error: 'duplicate_players' })
    if (players.filter((p) => p?.captain === true).length > 1) return res.status(400).json({ error: 'one_captain_only' })

    const rows = await dbAllP(`SELECT id, schoolId, data FROM players WHERE id IN (${ids.map(() => '?').join(',')})`, ids)
    const byId = new Map(rows.map((r) => [String(r.id), r]))
    for (const id of ids) {
      const r = byId.get(id)
      if (!r || String(r.schoolId) !== sid) return res.status(400).json({ error: 'player_not_in_school', playerId: id })
      let d = {}
      try { d = JSON.parse(r.data || '{}') } catch {}
      const st = String(d.status || 'approved')
      if (st === 'pending' || st === 'rejected') return res.status(400).json({ error: 'player_not_approved', playerId: id })
      if (String(d.ageGroup || '') !== String(f.ageGroup) && String(d.team || '') !== String(f.ageGroup)) {
        return res.status(400).json({ error: 'player_wrong_age_group', playerId: id })
      }
    }

    const clean = players.map((p) => ({
      playerId: String(p.playerId),
      jersey: String(p.jersey ?? '').slice(0, 3),
      position: String(p.position || '').slice(0, 40),
      captain: p.captain === true,
    }))
    const data = JSON.stringify({ players: clean })
    const now = Date.now()
    const upd = await dbRunP(
      'UPDATE team_sheets SET data = ?, submittedBy = ?, submittedAt = ? WHERE fixtureId = ? AND schoolId = ?',
      [data, String(user.email || ''), now, f.id, sid]
    )
    if (!upd.changes) {
      await dbRunP(
        'INSERT INTO team_sheets (id, fixtureId, schoolId, submittedBy, submittedAt, data) VALUES (?, ?, ?, ?, ?, ?)',
        [crypto.randomUUID(), f.id, sid, String(user.email || ''), now, data]
      )
    }
    writeAudit(user.role, 'team_sheets', upd.changes ? 'update' : 'create', null, { fixtureId: f.id, schoolId: sid, players: clean.length })
    if (f.refereeEmail) {
      const name = await schoolDisplay(sid)
      queueNotification(
        f.refereeEmail,
        'Team sheet submitted',
        `${name} submitted their ${f.ageGroup} team sheet (${clean.length} players) for the fixture on ${new Date(Number(f.kickoffAt)).toLocaleString()}.`
      )
    }
    res.json({ ok: true, fixtureId: f.id, schoolId: sid, players: clean.length })
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) })
  }
})

// Phase 3: the referee files the result after kickoff — scores, cards, notes.
// One-shot for the referee (disputes go to the coordinator, whose amendments
// are audited); the coordinator/union can file or amend at any time.
app.post('/api/fixtures/:id/result', async (req, res) => {
  const user = req.user || {}
  if (!user.role) return res.status(403).json({ error: 'forbidden' })
  try {
    const f = await dbGetP('SELECT * FROM fixtures WHERE id = ?', [String(req.params.id)])
    if (!f) return res.status(404).json({ error: 'not_found' })
    const isOverride = canManageFixtures(user, f.zoneId)
    const isAssignedRef = user.role === 'Referee' &&
      String(f.refereeEmail || '').toLowerCase() === String(user.email || '').trim().toLowerCase()
    if (!isOverride && !isAssignedRef) return res.status(403).json({ error: 'forbidden' })
    if (String(f.status) === 'cancelled') return res.status(400).json({ error: 'fixture_cancelled' })
    if (Date.now() < Number(f.kickoffAt || 0)) return res.status(400).json({ error: 'match_not_started' })
    if (String(f.status) === 'completed' && !isOverride) return res.status(409).json({ error: 'result_already_filed' })

    const homeScore = Number(req.body?.homeScore)
    const awayScore = Number(req.body?.awayScore)
    if (!Number.isInteger(homeScore) || homeScore < 0 || !Number.isInteger(awayScore) || awayScore < 0) {
      return res.status(400).json({ error: 'scores_required' })
    }
    const cards = Array.isArray(req.body?.cards) ? req.body.cards : []
    if (cards.length > 30) return res.status(400).json({ error: 'too_many_cards' })

    // A carded player must be on that side's team sheet (or, if no sheet was
    // submitted, at least belong to that school)
    const sheets = await dbAllP('SELECT schoolId, data FROM team_sheets WHERE fixtureId = ?', [f.id])
    const sheetIds = new Map() // schoolId -> Set(playerIds)
    for (const s of sheets) {
      let d = {}
      try { d = JSON.parse(s.data || '{}') } catch {}
      sheetIds.set(String(s.schoolId), new Set((d.players || []).map((p) => String(p.playerId))))
    }
    const cleanCards = []
    for (const c of cards) {
      const team = c?.team === 'away' ? 'away' : 'home'
      const schoolId = team === 'home' ? String(f.homeSchoolId) : String(f.awaySchoolId)
      const playerId = String(c?.playerId || '')
      const type = c?.type === 'red' ? 'red' : 'yellow'
      const minute = Math.max(0, Math.min(120, Number(c?.minute) || 0))
      if (!playerId) return res.status(400).json({ error: 'card_player_required' })
      const onSheet = sheetIds.get(schoolId)
      if (onSheet && onSheet.size > 0) {
        if (!onSheet.has(playerId)) return res.status(400).json({ error: 'card_player_not_on_sheet', playerId })
      } else {
        const p = await dbGetP('SELECT schoolId FROM players WHERE id = ?', [playerId])
        if (!p || String(p.schoolId) !== schoolId) return res.status(400).json({ error: 'card_player_not_in_school', playerId })
      }
      cleanCards.push({ playerId, team, type, minute })
    }

    let d = {}
    try { d = JSON.parse(f.data || '{}') } catch {}
    const previous = d.report || null
    d.report = {
      cards: cleanCards,
      notes: String(req.body?.notes || '').slice(0, 2000),
      filedBy: String(user.email || ''),
      filedByRole: user.role,
      filedAt: Date.now(),
      ...(previous ? { amendedFrom: { filedBy: previous.filedBy, filedAt: previous.filedAt } } : {}),
    }
    await dbRunP('UPDATE fixtures SET status = ?, homeScore = ?, awayScore = ?, data = ? WHERE id = ?',
      ['completed', homeScore, awayScore, JSON.stringify(d), f.id])
    writeAudit(user.role, 'fixtures', previous ? 'result_amended' : 'result', { id: f.id, status: f.status }, { id: f.id, homeScore, awayScore, cards: cleanCards.length })

    const [homeName, awayName] = await Promise.all([schoolDisplay(f.homeSchoolId), schoolDisplay(f.awaySchoolId)])
    const summary = `${homeName} ${homeScore} — ${awayScore} ${awayName} (${f.ageGroup})${cleanCards.length ? ` · ${cleanCards.length} card${cleanCards.length === 1 ? '' : 's'}` : ''}`
    notifyFixtureParties(f, previous ? 'Result amended' : 'Final result', summary, { includeReferee: !isAssignedRef })
    try {
      const coaches = await dbAllP('SELECT email FROM coaches WHERE schoolId IN (?, ?)', [String(f.homeSchoolId), String(f.awaySchoolId)])
      for (const c of coaches) queueNotification(c.email, previous ? 'Result amended' : 'Final result', summary)
    } catch {}
    res.json({ ok: true, id: f.id, homeScore, awayScore, cards: cleanCards.length, status: 'completed' })
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) })
  }
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
