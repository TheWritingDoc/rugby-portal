// Postgres (Supabase) data layer.
//
// The app's ~2400-line server was written against the sqlite3 callback API
// (db.get/db.all/db.run with `?` placeholders and `this.changes`). Rather than
// rewrite every query, this module exposes the SAME interface backed by a pg
// Pool, translating dialect differences at the boundary:
//
//  * `?`  ->  `$1, $2, ...`  positional placeholders
//  * INTEGER epoch-ms columns are BIGINT; pg returns int8 as a string by
//    default, so we register a parser to hand them back as JS numbers (all our
//    timestamps are < 2^53, well within safe-integer range).
//  * Postgres folds unquoted identifiers to lower-case, so the seeded tables use
//    lower-case columns and we remap result keys back to the camelCase the
//    application code reads (row.zoneId, row.parentEmail, ...).
//
// Selected automatically by server/db.js when DATABASE_URL is set.
import pg from 'pg'
import fs from 'fs'
import path from 'path'
import { parseSchoolsFromMd, seedSchoolData } from './seed-schools.js'

// Return BIGINT (oid 20) as a Number instead of a string. Safe for ms epochs.
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)))

const connectionString = process.env.DATABASE_URL
const pool = new pg.Pool({
  connectionString,
  // Supabase requires TLS; its pooler cert chain isn't in the default store.
  ssl: { rejectUnauthorized: false },
  max: Number(process.env.PG_POOL_MAX || 5),
  idleTimeoutMillis: 30_000,
})

pool.on('error', (err) => console.error('[pg] idle client error:', err?.message || err))

// lower-case (as Postgres returns it) -> camelCase (as the app expects).
// Only keys that actually differ need an entry; everything else passes through.
const KEY_MAP = {
  zoneid: 'zoneId',
  schoolid: 'schoolId',
  contactnumber: 'contactNumber',
  idnumber: 'idNumber',
  dateofbirth: 'dateOfBirth',
  agegroup: 'ageGroup',
  parentcontact: 'parentContact',
  parentemail: 'parentEmail',
  playerid: 'playerId',
  fromzoneid: 'fromZoneId',
  fromschoolid: 'fromSchoolId',
  tozoneid: 'toZoneId',
  toschoolid: 'toSchoolId',
  migrationdate: 'migrationDate',
  requesterrole: 'requesterRole',
  requesteremail: 'requesterEmail',
  requestedat: 'requestedAt',
  deciderrole: 'deciderRole',
  decideremail: 'deciderEmail',
  decidedat: 'decidedAt',
  decisionreason: 'decisionReason',
  userrole: 'userRole',
  ownertype: 'ownerType',
  ownerid: 'ownerId',
  filename: 'fileName',
  fileurl: 'fileUrl',
  entitytype: 'entityType',
  entityid: 'entityId',
  requesterid: 'requesterId',
  approverid: 'approverId',
  requestedchanges: 'requestedChanges',
  approvernotes: 'approverNotes',
  createdat: 'createdAt',
  updatedat: 'updatedAt',
  expiresat: 'expiresAt',
  readat: 'readAt',
  fromemail: 'fromEmail',
  fromrole: 'fromRole',
  fromname: 'fromName',
  toemail: 'toEmail',
}

function remapRow(row) {
  if (!row) return row
  const out = {}
  for (const k of Object.keys(row)) out[KEY_MAP[k] || k] = row[k]
  return out
}

// `?` -> `$n`. Our queries never contain literal `?` inside string literals, so
// a straight replace is safe.
function toPg(sql) {
  let i = 0
  return sql.replace(/\?/g, () => `$${++i}`)
}

// SQLite's LIKE is case-insensitive for ASCII; Postgres's is case-sensitive.
// Use ILIKE so search behaviour matches across both backends. (\bLIKE\b never
// matches inside the word ILIKE, so this won't double-translate.)
function translate(sql) {
  return sql.replace(/\bLIKE\b/g, 'ILIKE')
}

let schemaReady = null
async function ensureSchema() {
  if (!schemaReady) schemaReady = initSchema().catch((e) => { schemaReady = null; throw e })
  return schemaReady
}

async function rawQuery(sql, params = []) {
  await ensureSchema()
  return pool.query(toPg(translate(sql)), params)
}

// --- sqlite3-compatible surface --------------------------------------------
function normalizeArgs(params, cb) {
  if (typeof params === 'function') return [[], params]
  return [params || [], cb]
}

const db = {
  get(sql, params, cb) {
    const [p, done] = normalizeArgs(params, cb)
    rawQuery(sql, p)
      .then((r) => done && done.call({}, null, remapRow(r.rows[0])))
      .catch((err) => done && done.call({}, err))
  },
  all(sql, params, cb) {
    const [p, done] = normalizeArgs(params, cb)
    rawQuery(sql, p)
      .then((r) => done && done.call({}, null, r.rows.map(remapRow)))
      .catch((err) => done && done.call({}, err))
  },
  run(sql, params, cb) {
    const [p, done] = normalizeArgs(params, cb)
    rawQuery(sql, p)
      .then((r) => done && done.call({ changes: r.rowCount, lastID: undefined }, null))
      .catch((err) => done && done.call({}, err))
  },
  // index-sqlite.js never uses prepare()/serialize(), but db-sqlite.js's surface
  // includes them; provide minimal stand-ins for safety.
  serialize(fn) { if (fn) fn() },
  prepare(sql) {
    return {
      run: (params, cb) => db.run(sql, params, cb),
      finalize: (cb) => cb && cb(null),
    }
  },
  _pool: pool,
}

async function initSchema() {
  // Tables. `data` stays TEXT (app stores JSON strings); epoch-ms columns are
  // BIGINT. Identifiers are lower-case; the KEY_MAP restores camelCase on read.
  const stmts = [
    `CREATE TABLE IF NOT EXISTS schools (
      id TEXT PRIMARY KEY, zoneId TEXT NOT NULL, schoolId TEXT NOT NULL,
      address TEXT, contactNumber TEXT, email TEXT, data TEXT, ts BIGINT)`,
    `CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY, zoneId TEXT NOT NULL, schoolId TEXT NOT NULL,
      name TEXT NOT NULL, surname TEXT NOT NULL, idNumber TEXT, dateOfBirth TEXT,
      gender TEXT, ageGroup TEXT, contactNumber TEXT, email TEXT,
      parentContact TEXT, parentEmail TEXT, data TEXT, ts BIGINT)`,
    `CREATE TABLE IF NOT EXISTS migrations (
      id TEXT PRIMARY KEY, playerId TEXT NOT NULL, fromZoneId TEXT, fromSchoolId TEXT,
      toZoneId TEXT NOT NULL, toSchoolId TEXT NOT NULL, migrationDate BIGINT NOT NULL, data TEXT)`,
    `CREATE TABLE IF NOT EXISTS migration_requests (
      id TEXT PRIMARY KEY, playerId TEXT NOT NULL, fromZoneId TEXT, fromSchoolId TEXT,
      toZoneId TEXT NOT NULL, toSchoolId TEXT NOT NULL, status TEXT DEFAULT 'pending',
      reason TEXT, requesterRole TEXT, requesterEmail TEXT, requestedAt BIGINT NOT NULL,
      deciderRole TEXT, deciderEmail TEXT, decidedAt BIGINT, decisionReason TEXT, data TEXT)`,
    `CREATE TABLE IF NOT EXISTS coaches (
      id TEXT PRIMARY KEY, zoneId TEXT NOT NULL, schoolId TEXT NOT NULL,
      name TEXT NOT NULL, surname TEXT NOT NULL, idNumber TEXT, contactNumber TEXT,
      email TEXT, qualifications TEXT, experience TEXT, data TEXT, ts BIGINT)`,
    `CREATE TABLE IF NOT EXISTS referees (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, surname TEXT NOT NULL, idNumber TEXT,
      contactNumber TEXT, email TEXT, qualifications TEXT, experience TEXT,
      data TEXT, ts BIGINT, zoneId TEXT)`,
    `CREATE TABLE IF NOT EXISTS admins (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, surname TEXT NOT NULL, idNumber TEXT,
      contactNumber TEXT, email TEXT, role TEXT, zoneId TEXT, schoolId TEXT, data TEXT, ts BIGINT)`,
    `CREATE TABLE IF NOT EXISTS audits (
      id TEXT PRIMARY KEY, userRole TEXT NOT NULL, entity TEXT NOT NULL, action TEXT NOT NULL,
      before TEXT, after TEXT, ts BIGINT)`,
    `CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY, ownerType TEXT NOT NULL, ownerId TEXT NOT NULL,
      fileName TEXT NOT NULL, fileUrl TEXT NOT NULL, status TEXT DEFAULT 'pending', ts BIGINT)`,
    `CREATE TABLE IF NOT EXISTS approvals (
      id TEXT PRIMARY KEY, entityType TEXT NOT NULL, entityId TEXT NOT NULL,
      requesterId TEXT NOT NULL, approverId TEXT, status TEXT DEFAULT 'pending',
      requestedChanges TEXT, approverNotes TEXT, deciderRole TEXT,
      createdAt BIGINT NOT NULL, updatedAt BIGINT)`,
    `CREATE TABLE IF NOT EXISTS password_resets (
      token TEXT PRIMARY KEY, email TEXT NOT NULL, expiresAt BIGINT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY, email TEXT NOT NULL, subject TEXT NOT NULL,
      message TEXT, readAt BIGINT, createdAt BIGINT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY, fromEmail TEXT NOT NULL, fromRole TEXT, fromName TEXT,
      toEmail TEXT NOT NULL, subject TEXT, body TEXT NOT NULL,
      readAt BIGINT, createdAt BIGINT NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS ix_migration_requests_status ON migration_requests(status)`,
    `CREATE INDEX IF NOT EXISTS ix_migration_requests_toschoolid_status ON migration_requests(toSchoolId, status)`,
    `CREATE INDEX IF NOT EXISTS ix_migration_requests_playerid ON migration_requests(playerId)`,
    `CREATE INDEX IF NOT EXISTS idx_notifications_email ON notifications(email, createdAt)`,
    `CREATE INDEX IF NOT EXISTS idx_messages_to ON messages(toEmail, createdAt)`,
    `CREATE INDEX IF NOT EXISTS idx_messages_from ON messages(fromEmail, createdAt)`,
    `CREATE INDEX IF NOT EXISTS idx_approvals_entity ON approvals(entityType, entityId)`,
    `CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status)`,
    `CREATE INDEX IF NOT EXISTS idx_migrations_player ON migrations(playerId, migrationDate)`,
    `CREATE INDEX IF NOT EXISTS idx_players_idnumber ON players(idNumber)`,
    `CREATE INDEX IF NOT EXISTS idx_players_email ON players(email)`,
  ]
  for (const s of stmts) await pool.query(s)

  // Keep schoolId unique (deduplicate first so the index can be created on an
  // existing/seeded table without erroring).
  await pool.query(`DELETE FROM schools a USING schools b
    WHERE a.ctid < b.ctid AND a.schoolId = b.schoolId`)
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS ux_schools_schoolid ON schools(schoolId)`)

  // An email identifies exactly one account per table (logins resolve by
  // email). Dedupe legacy rows (keep the newest ctid), then enforce with a
  // partial unique index — rows without an email are unaffected.
  for (const t of ['admins', 'coaches', 'referees', 'players']) {
    try {
      await pool.query(`DELETE FROM ${t} a USING ${t} b
        WHERE a.ctid < b.ctid AND lower(a.email) = lower(b.email)
          AND a.email IS NOT NULL AND a.email <> '' AND b.email IS NOT NULL AND b.email <> ''`)
      await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS ux_${t}_email ON ${t}(lower(email)) WHERE email IS NOT NULL AND email <> ''`)
    } catch (e) {
      console.error(`[pg] unique email index on ${t} skipped:`, e?.message || e)
    }
  }

  // Seed the school catalog once (only if empty), mirroring db-sqlite.js.
  const { rows } = await pool.query('SELECT COUNT(1)::int AS c FROM schools')
  if (!rows[0] || rows[0].c === 0) {
    try {
      const mdPath = path.join(process.cwd(), 'ep_schools_rugby_zones.md')
      if (fs.existsSync(mdPath)) {
        const list = parseSchoolsFromMd(fs.readFileSync(mdPath, 'utf8'))
        const ts = Date.now()
        for (const s of list) {
          await pool.query(
            `INSERT INTO schools (id, zoneId, schoolId, address, contactNumber, email, data, ts)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (schoolId) DO NOTHING`,
            [s.id, s.zoneId, s.schoolId, null, null, null, seedSchoolData(s), ts]
          )
        }
        console.log(`[pg] seeded ${list.length} schools`)
      }
    } catch (e) {
      console.error('[pg] school seed skipped:', e?.message || e)
    }
  }
}

export default db
