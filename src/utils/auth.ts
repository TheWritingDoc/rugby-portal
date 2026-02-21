import { apiUrl } from './apiBase'

let token: string | null = localStorage.getItem('auth:token')

export function setToken(t: string) {
  token = t
  localStorage.setItem('auth:token', t)
}

export function getToken() {
  return token
}

export async function login(role: string, zoneId?: string, schoolId?: string, email?: string) {
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
    } catch {}
    return true
  }
  return true
}
