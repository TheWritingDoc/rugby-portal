// File-upload storage abstraction.
//
// Vercel's serverless filesystem is read-only (except /tmp) and ephemeral, so
// uploads can't live on local disk in production. When Supabase Storage is
// configured we push the bytes there and return a public URL; otherwise we fall
// back to writing under server/uploads for local development.
//
// Uploads use the Storage REST API directly instead of @supabase/supabase-js:
// the SDK initializes Realtime, which crashes on Node 20 serverless (no native
// WebSocket) — and storage only needs one authenticated PUT anyway.
import fs from 'fs'
import path from 'path'

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/$/, '')
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BUCKET = process.env.SUPABASE_BUCKET || 'uploads'

export const usingSupabaseStorage = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)

const localDir = path.join(process.cwd(), 'server', 'uploads')

function safeName(originalName) {
  const cleaned = String(originalName || 'file').replace(/[^a-zA-Z0-9_.-]/g, '_')
  return `${Date.now()}-${cleaned}`
}

// Returns the URL to store on the record. Supabase returns a fully-qualified
// public URL; local storage returns a relative /uploads/<name> path (the app's
// image helpers prefix that with API_ORIGIN at render time).
export async function saveUpload(buffer, originalName, mimetype) {
  const name = safeName(originalName)
  if (usingSupabaseStorage) {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodeURIComponent(name)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        'Content-Type': mimetype || 'application/octet-stream',
        'x-upsert': 'false',
      },
      body: buffer,
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new Error(`storage upload failed (${res.status}): ${detail.slice(0, 200)}`)
    }
    return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${name}`
  }
  if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true })
  fs.writeFileSync(path.join(localDir, name), buffer)
  return `/uploads/${name}`
}

export const localUploadDir = localDir
