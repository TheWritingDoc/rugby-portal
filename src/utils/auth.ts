import { apiUrl } from './apiBase'

let token: string | null = localStorage.getItem('auth:token')

export function setToken(t: string) {
  token = t
  localStorage.setItem('auth:token', t)
}

export function getToken() {
  return token
}

// Stores a server-issued session (credential or OAuth login) without re-requesting a token.
// Keys the new account doesn't have are cleared so scope never leaks from a previous login.
export function adoptSession(t: string, info: { role: string; zoneId?: string; schoolId?: string; email?: string; name?: string; surname?: string }) {
  setToken(t)
  try {
    localStorage.setItem('auth:role', info.role)
    const setOrClear = (key: string, v?: string) => {
      if (v) localStorage.setItem(key, String(v))
      else localStorage.removeItem(key)
    }
    setOrClear('auth:zoneId', info.zoneId)
    setOrClear('auth:schoolId', info.schoolId)
    setOrClear('auth:email', info.email)
    setOrClear('auth:name', info.name)
    setOrClear('auth:surname', info.surname)
  } catch {}
}

// Re-establishes a session token from the credentials stored at login.
// Never changes role or scope — use this instead of calling login() with a hardcoded role.
export async function ensureSession() {
  if (token) return true
  let role = ''
  let zoneId: string | undefined
  let schoolId: string | undefined
  let email: string | undefined
  try {
    role = localStorage.getItem('auth:role') || ''
    zoneId = localStorage.getItem('auth:zoneId') || undefined
    schoolId = localStorage.getItem('auth:schoolId') || undefined
    email = localStorage.getItem('auth:email') || undefined
  } catch {}
  if (!role) return false
  return login(role, zoneId, schoolId, email)
}

export async function login(role: string, zoneId?: string, schoolId?: string, email?: string, name?: string, surname?: string) {
  try {
    const res = await fetch(apiUrl('/login'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role, zoneId, schoolId, email }) })
    if (res.ok) {
      const data = await res.json()
      setToken(data.token)
      try {
        localStorage.setItem('auth:role', role)
        if (zoneId) localStorage.setItem('auth:zoneId', String(zoneId))
        if (schoolId) localStorage.setItem('auth:schoolId', String(schoolId))
        if (email) localStorage.setItem('auth:email', String(email))
        if (name) localStorage.setItem('auth:name', String(name))
        if (surname) localStorage.setItem('auth:surname', String(surname))
      } catch {}
      return true
    }
  } catch {}
  const mode = (import.meta as any)?.env?.MODE || 'development'
  if (mode !== 'production') {
    setToken('dev')
    try {
      localStorage.setItem('auth:role', role)
      if (zoneId) localStorage.setItem('auth:zoneId', String(zoneId))
      if (schoolId) localStorage.setItem('auth:schoolId', String(schoolId))
      if (email) localStorage.setItem('auth:email', String(email))
      if (name) localStorage.setItem('auth:name', String(name))
      if (surname) localStorage.setItem('auth:surname', String(surname))
    } catch {}
    return true
  }
  return false
}
