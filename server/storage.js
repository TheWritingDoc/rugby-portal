// File-upload storage abstraction.
//
// Vercel's serverless filesystem is read-only (except /tmp) and ephemeral, so
// uploads can't live on local disk in production. When Supabase Storage is
// configured we push the bytes there and return a public URL; otherwise we fall
// back to writing under server/uploads for local development.
import fs from 'fs'
import path from 'path'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BUCKET = process.env.SUPABASE_BUCKET || 'uploads'

export const usingSupabaseStorage = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)

const localDir = path.join(process.cwd(), 'server', 'uploads')

let _client = null
async function supabase() {
  if (_client) return _client
  const { createClient } = await import('@supabase/supabase-js')
  _client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
  return _client
}

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
    const client = await supabase()
    const { error } = await client.storage.from(BUCKET).upload(name, buffer, {
      contentType: mimetype || 'application/octet-stream',
      upsert: false,
    })
    if (error) throw error
    const { data } = client.storage.from(BUCKET).getPublicUrl(name)
    return data.publicUrl
  }
  if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true })
  fs.writeFileSync(path.join(localDir, name), buffer)
  return `/uploads/${name}`
}

export const localUploadDir = localDir
