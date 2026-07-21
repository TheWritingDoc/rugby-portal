import Database from 'sqlite3'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'

const dbPath = path.join(process.cwd(), 'server', 'data', 'database.sqlite')

// Ensure directory exists
const dbDir = path.dirname(dbPath)
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true })
}

const db = new Database.Database(dbPath)
// WAL allows concurrent readers during writes; busy_timeout retries instead of failing with SQLITE_BUSY
db.serialize(() => {
  db.run('PRAGMA journal_mode = WAL')
  db.run('PRAGMA busy_timeout = 5000')
})

function parseSchoolsFromMd(md) {
  const lines = String(md || '').split(/\r?\n/)
  const schools = []
  let zoneId = 0
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    const m = l.match(/<summary><strong>Zone\s*(\d+):\s*([^<]+)\s*\(/)
    if (m) {
      zoneId = parseInt(m[1], 10)
      const zoneName = m[2].trim()
      let j = i + 1
      while (j < lines.length && !lines[j].includes('</details>')) {
        const sm = lines[j].match(/^\s*\d+\.\s*(.+?)\s*$/)
        if (sm) {
          const schoolName = sm[1].trim()
          const slug = `${zoneName.toLowerCase().replace(/\s+/g, '-')}-${schoolName.toLowerCase().replace(/\s+/g, '-')}`
          schools.push({ id: slug, zoneId: String(zoneId), schoolId: slug, name: schoolName, zoneName, quintileCategory: 'Q1-3' })
        }
        j++
      }
      i = j
    }
    if (l.includes('Quintile 4 & 5 Schools')) {
      let j = i
      while (j < lines.length && !lines[j].includes('## Competition Structure')) {
        const fm = lines[j].match(/^\s*-\s*(.+)$/)
        if (fm) {
          const schoolName = fm[1].trim()
          const slug = `festival-${schoolName.toLowerCase().replace(/\s+/g, '-')}`
          schools.push({ id: slug, zoneId: '0', schoolId: slug, name: schoolName, zoneName: 'Festival', quintileCategory: 'Q4-5 festival' })
        }
        j++
      }
      i = j
    }
  }
  return schools
}

// Initialize database schema
db.serialize(() => {
  // Schools table
  db.run(`
    CREATE TABLE IF NOT EXISTS schools (
      id TEXT PRIMARY KEY,
      zoneId TEXT NOT NULL,
      schoolId TEXT NOT NULL,
      address TEXT,
      contactNumber TEXT,
      email TEXT,
      data TEXT,
      ts INTEGER
    )
  `)

  try {
    db.all('SELECT schoolId, COUNT(1) as c FROM schools GROUP BY schoolId HAVING COUNT(1) > 1', [], (_derr, drows) => {
      const list = Array.isArray(drows) ? drows : []
      let i = 0
      const next = () => {
        const item = list[i++]
        if (!item) {
          try { db.run('CREATE UNIQUE INDEX IF NOT EXISTS ux_schools_schoolId ON schools(schoolId)') } catch {}
          return
        }
        const sid = String(item.schoolId || '')
        if (!sid) return next()
        db.all('SELECT id, ts FROM schools WHERE schoolId = ? ORDER BY ts DESC', [sid], (_err2, rows2) => {
          const rows = Array.isArray(rows2) ? rows2 : []
          const keep = rows[0]?.id
          if (!keep) return next()
          db.run('DELETE FROM schools WHERE schoolId = ? AND id <> ?', [sid, keep], () => next())
        })
      }
      next()
    })
  } catch {
    try { db.run('CREATE UNIQUE INDEX IF NOT EXISTS ux_schools_schoolId ON schools(schoolId)') } catch {}
  }

  try {
    const mdPath = path.join(process.cwd(), 'ep_schools_rugby_zones.md')
    if (fs.existsSync(mdPath)) {
      const md = fs.readFileSync(mdPath, 'utf8')
      const list = parseSchoolsFromMd(md)
      const ts = Date.now()
      const stmt = db.prepare('INSERT OR IGNORE INTO schools (id, zoneId, schoolId, address, contactNumber, email, data, ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      for (const s of list) {
        const data = JSON.stringify({ name: s.name, zoneName: s.zoneName, quintileCategory: s.quintileCategory, seeded: true, seedId: crypto.randomUUID() })
        stmt.run([s.id, s.zoneId, s.schoolId, null, null, null, data, ts])
      }
      stmt.finalize()
    }
  } catch {}
  
  // Players table
  db.run(`
    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      zoneId TEXT NOT NULL,
      schoolId TEXT NOT NULL,
      name TEXT NOT NULL,
      surname TEXT NOT NULL,
      idNumber TEXT,
      dateOfBirth TEXT,
      gender TEXT,
      ageGroup TEXT,
      contactNumber TEXT,
      email TEXT,
      parentContact TEXT,
      parentEmail TEXT,
      data TEXT,
      ts INTEGER
    )
  `)

  // Player migrations table
  db.run(`
    CREATE TABLE IF NOT EXISTS migrations (
      id TEXT PRIMARY KEY,
      playerId TEXT NOT NULL,
      fromZoneId TEXT,
      fromSchoolId TEXT,
      toZoneId TEXT NOT NULL,
      toSchoolId TEXT NOT NULL,
      migrationDate INTEGER NOT NULL,
      data TEXT,
      FOREIGN KEY (playerId) REFERENCES players(id) ON DELETE CASCADE
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS migration_requests (
      id TEXT PRIMARY KEY,
      playerId TEXT NOT NULL,
      fromZoneId TEXT,
      fromSchoolId TEXT,
      toZoneId TEXT NOT NULL,
      toSchoolId TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      reason TEXT,
      requesterRole TEXT,
      requesterEmail TEXT,
      requestedAt INTEGER NOT NULL,
      deciderRole TEXT,
      deciderEmail TEXT,
      decidedAt INTEGER,
      decisionReason TEXT,
      data TEXT,
      FOREIGN KEY (playerId) REFERENCES players(id) ON DELETE CASCADE
    )
  `)

  try { db.run('CREATE INDEX IF NOT EXISTS ix_migration_requests_status ON migration_requests(status)') } catch {}
  try { db.run('CREATE INDEX IF NOT EXISTS ix_migration_requests_toSchoolId_status ON migration_requests(toSchoolId, status)') } catch {}
  try { db.run('CREATE INDEX IF NOT EXISTS ix_migration_requests_playerId ON migration_requests(playerId)') } catch {}
  
  // Coaches table
  db.run(`
    CREATE TABLE IF NOT EXISTS coaches (
      id TEXT PRIMARY KEY,
      zoneId TEXT NOT NULL,
      schoolId TEXT NOT NULL,
      name TEXT NOT NULL,
      surname TEXT NOT NULL,
      idNumber TEXT,
      contactNumber TEXT,
      email TEXT,
      qualifications TEXT,
      experience TEXT,
      data TEXT,
      ts INTEGER
    )
  `)
  
  // Referees table
  db.run(`
    CREATE TABLE IF NOT EXISTS referees (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      surname TEXT NOT NULL,
      idNumber TEXT,
      contactNumber TEXT,
      email TEXT,
      qualifications TEXT,
      experience TEXT,
      data TEXT,
      ts INTEGER,
      zoneId TEXT
    )
  `)
  try { db.run('ALTER TABLE referees ADD COLUMN zoneId TEXT', () => {}) } catch {}
  
  // Admins table
  db.run(`
    CREATE TABLE IF NOT EXISTS admins (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      surname TEXT NOT NULL,
      idNumber TEXT,
      contactNumber TEXT,
      email TEXT,
      role TEXT,
      zoneId TEXT,
      schoolId TEXT,
      data TEXT,
      ts INTEGER
    )
  `)
  
  // An email identifies exactly one account per table (logins resolve by
  // email). Dedupe legacy rows first (keep the newest), then enforce with a
  // partial unique index — rows without an email are unaffected.
  for (const t of ['coaches', 'referees', 'players']) {
    db.run(
      `DELETE FROM ${t} WHERE email IS NOT NULL AND email <> ''
         AND rowid NOT IN (SELECT MAX(rowid) FROM ${t} WHERE email IS NOT NULL AND email <> '' GROUP BY lower(email))`,
      () => {
        db.run(
          `CREATE UNIQUE INDEX IF NOT EXISTS ux_${t}_email ON ${t}(lower(email)) WHERE email IS NOT NULL AND email <> ''`,
          (err) => { if (err) console.error(`[db] unique email index on ${t} skipped:`, err.message) }
        )
      }
    )
  }
  // Admins are unique per (email, role): the same person may hold several
  // admin-tier posts (multi-role accounts) but never the same post twice.
  db.run(
    `DELETE FROM admins WHERE email IS NOT NULL AND email <> ''
       AND rowid NOT IN (SELECT MAX(rowid) FROM admins WHERE email IS NOT NULL AND email <> '' GROUP BY lower(email), role)`,
    () => {
      db.run('DROP INDEX IF EXISTS ux_admins_email', () => {
        db.run(
          `CREATE UNIQUE INDEX IF NOT EXISTS ux_admins_email_role ON admins(lower(email), role) WHERE email IS NOT NULL AND email <> ''`,
          (err) => { if (err) console.error('[db] unique email+role index on admins skipped:', err.message) }
        )
      })
    }
  )

  // Audits table
  db.run(`
    CREATE TABLE IF NOT EXISTS audits (
      id TEXT PRIMARY KEY,
      userRole TEXT NOT NULL,
      entity TEXT NOT NULL,
      action TEXT NOT NULL,
      before TEXT,
      after TEXT,
      ts INTEGER
    )
  `)
  
  // Documents table
  db.run(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      ownerType TEXT NOT NULL,
      ownerId TEXT NOT NULL,
      fileName TEXT NOT NULL,
      fileUrl TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      ts INTEGER
    )
  `)
  
  // Match-day: fixtures (with folded-in referee report) and team sheets
  db.run(`
    CREATE TABLE IF NOT EXISTS fixtures (
      id TEXT PRIMARY KEY,
      zoneId TEXT NOT NULL,
      homeSchoolId TEXT NOT NULL,
      awaySchoolId TEXT NOT NULL,
      ageGroup TEXT NOT NULL,
      kickoffAt INTEGER NOT NULL,
      venue TEXT,
      refereeEmail TEXT,
      status TEXT DEFAULT 'scheduled',
      homeScore INTEGER,
      awayScore INTEGER,
      data TEXT,
      ts INTEGER
    )
  `)
  try { db.run('CREATE INDEX IF NOT EXISTS ix_fixtures_zone_kick ON fixtures(zoneId, kickoffAt)') } catch {}
  try { db.run('CREATE INDEX IF NOT EXISTS ix_fixtures_ref ON fixtures(refereeEmail, kickoffAt)') } catch {}
  db.run(`
    CREATE TABLE IF NOT EXISTS team_sheets (
      id TEXT PRIMARY KEY,
      fixtureId TEXT NOT NULL,
      schoolId TEXT NOT NULL,
      submittedBy TEXT,
      submittedAt INTEGER,
      data TEXT
    )
  `)
  try { db.run('CREATE UNIQUE INDEX IF NOT EXISTS ux_team_sheets_fixture_school ON team_sheets(fixtureId, schoolId)') } catch {}

  // Match-archive inbox pushed by the Rugby Assistant app (id = assistant job id)
  db.run(`
    CREATE TABLE IF NOT EXISTS assistant_archives (
      id TEXT PRIMARY KEY,
      gameId TEXT NOT NULL,
      jobType TEXT,
      data TEXT,
      ts INTEGER
    )
  `)
  try { db.run('CREATE INDEX IF NOT EXISTS ix_assistant_archives_game ON assistant_archives(gameId)') } catch {}

  // Approvals table for player/coach profile updates
  db.run(`
    CREATE TABLE IF NOT EXISTS approvals (
      id TEXT PRIMARY KEY,
      entityType TEXT NOT NULL, -- 'players' or 'coaches'
      entityId TEXT NOT NULL,
      requesterId TEXT NOT NULL,
      approverId TEXT,
      status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
      requestedChanges TEXT,
      approverNotes TEXT,
      deciderRole TEXT, -- role that made the last decision (for override hierarchy)
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER,
      FOREIGN KEY (entityId) REFERENCES players(id) ON DELETE CASCADE,
      FOREIGN KEY (entityId) REFERENCES coaches(id) ON DELETE CASCADE
    )
  `)
  // Migration for databases created before deciderRole existed
  try { db.run('ALTER TABLE approvals ADD COLUMN deciderRole TEXT', () => {}) } catch {}
  
  // Password reset tokens (consumed on use, expire after 1 hour)
  db.run(`
    CREATE TABLE IF NOT EXISTS password_resets (
      token TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      expiresAt INTEGER NOT NULL
    )
  `)

  // Notification outbox: stored per recipient email and shown in-app; an email/SMS
  // provider can drain the same table later without schema changes
  db.run(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      subject TEXT NOT NULL,
      message TEXT,
      readAt INTEGER,
      createdAt INTEGER NOT NULL
    )
  `)
  db.run(`CREATE INDEX IF NOT EXISTS idx_notifications_email ON notifications(email, createdAt)`)

  // In-app messages between users. Who may message whom is enforced by the
  // hierarchy rules in the API layer (see /api/messages in index-sqlite.js).
  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      fromEmail TEXT NOT NULL,
      fromRole TEXT,
      fromName TEXT,
      toEmail TEXT NOT NULL,
      subject TEXT,
      body TEXT NOT NULL,
      readAt INTEGER,
      createdAt INTEGER NOT NULL
    )
  `)
  db.run(`CREATE INDEX IF NOT EXISTS idx_messages_to ON messages(toEmail, createdAt)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_messages_from ON messages(fromEmail, createdAt)`)

  // Create indexes for performance
  db.run(`CREATE INDEX IF NOT EXISTS idx_approvals_entity ON approvals(entityType, entityId)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_migrations_player ON migrations(playerId, migrationDate)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_players_idNumber ON players(idNumber)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_players_email ON players(email)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_approvals_school ON approvals(entityId) WHERE entityType = 'players'`)
})

export default db
