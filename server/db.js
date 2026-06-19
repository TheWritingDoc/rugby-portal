// Data-layer selector.
//
// Production (Vercel + Supabase): set DATABASE_URL -> Postgres adapter.
// Local development: leave DATABASE_URL unset -> SQLite (zero-config).
//
// Dynamic import keeps the unused driver out of the bundle. In particular it
// means sqlite3's native binding is never loaded in the serverless deployment,
// where it can't be built.
let db
if (process.env.DATABASE_URL) {
  db = (await import('./db-postgres.js')).default
} else {
  // Indirect specifier so Vercel's dependency tracer does not pull the native
  // sqlite3 binding into the serverless bundle (production always takes the
  // Postgres branch above; this branch only runs for local dev).
  const sqliteModule = './db-sqlite.js'
  db = (await import(sqliteModule)).default
}

export default db
