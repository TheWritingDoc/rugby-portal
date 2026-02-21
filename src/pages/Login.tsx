import { useState } from 'react'
import { login } from '../utils/auth'
import { getEntities } from '../utils/db'
import { apiUrl } from '../utils/apiBase'
import bcrypt from 'bcryptjs'

type Role = 'Player' | 'Referee' | 'Coach' | 'SchoolAdmin' | 'ZoneCoordinator' | 'EPHSRUAdmin'

export default function Login({ onRole, onSuccess }: { onRole: (r: Role) => void; onSuccess?: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resetting, setResetting] = useState(false)
  const [resetMsg, setResetMsg] = useState<string | null>(null)
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
  try {
      const res = await fetch(apiUrl(`/identify?email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`))
      let info: any = null
      if (res.ok) {
        info = await res.json()
      } else {
        // Fallback: check local stored entities for coach registration in dev/test
        const coaches = getEntities('Coach')
        const found = coaches.find((c: any) => String(c.data?.email || '').toLowerCase() === email.toLowerCase())
        if (!found) {
          setError('No registration found for this email')
          try {
            localStorage.removeItem('nav:target')
            window.dispatchEvent(new CustomEvent('app:navigate', { detail: 'login' }))
          } catch {}
          setLoading(false)
          return
        }
        const hash = String(found.data?.passwordHash || '')
        if (hash && password && !bcrypt.compareSync(password, hash)) {
          setError('Invalid password')
          setLoading(false)
          return
        }
        info = { role: 'Coach', zoneId: found.data?.zoneId || '', schoolId: found.data?.schoolId || '' }
      }
      const ok = await login(info.role, info.zoneId, info.schoolId, email)
      if (ok) {
        localStorage.setItem('auth:email', email)
        localStorage.setItem('auth:role', info.role)
        if (info.zoneId) localStorage.setItem('auth:zoneId', String(info.zoneId))
        if (info.schoolId) localStorage.setItem('auth:schoolId', String(info.schoolId))
        onRole(info.role)
        try { localStorage.setItem('nav:target', 'dashboard') } catch {}
        if (onSuccess) onSuccess()
      }
    } catch {
      setError('Unable to sign in')
      try {
        localStorage.removeItem('nav:target')
        window.dispatchEvent(new CustomEvent('app:navigate', { detail: 'login' }))
      } catch {}
    } finally {
      setLoading(false)
    }
  }
  async function resetPassword() {
    setResetMsg(null)
    setResetting(true)
    try {
      const res = await fetch(apiUrl(`/identify?email=${encodeURIComponent(email)}`))
      if (!res.ok) {
        setResetMsg('Email not found')
      } else {
        setResetMsg('Reset link will be sent if email exists')
      }
    } catch {
      setResetMsg('Unable to process request')
    } finally {
      setResetting(false)
    }
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block">
        <span className="text-sm font-medium">Email</span>
        <input type="email" className="mt-1 w-full rounded-md border p-2" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="block">
        <span className="text-sm font-medium">Password</span>
        <input type="password" className="mt-1 w-full rounded-md border p-2" value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      {error && <div className="rounded-md bg-red-100 p-2 text-sm text-red-700">{error}</div>}
      <button disabled={loading} className="w-full rounded-md bg-brand p-2 text-white">{loading ? 'Signing In...' : 'Sign In'}</button>
      <div className="text-center text-sm">
        <button type="button" className="text-brand underline" onClick={resetPassword} disabled={resetting}>{resetting ? 'Processing...' : 'Forgot password?'}</button>
      </div>
      {resetMsg && <div className="rounded-md bg-gray-100 p-2 text-sm text-gray-700">{resetMsg}</div>}
    </form>
  )
}
