import { useEffect, useRef, useState } from 'react'
import { adoptSession, login } from '../utils/auth'
import { getEntities } from '../utils/db'
import { apiUrl } from '../utils/apiBase'
import { notifyError, notifySuccess } from '../utils/notify'
import bcrypt from 'bcryptjs'

type Role = 'Player' | 'Referee' | 'Coach' | 'SchoolAdmin' | 'ZoneCoordinator' | 'EPHSRUAdmin'

const GOOGLE_CLIENT_ID = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID || ''
const FACEBOOK_APP_ID = (import.meta as any).env?.VITE_FACEBOOK_APP_ID || ''

function loadScript(src: string, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.getElementById(id)) return resolve()
    const s = document.createElement('script')
    s.id = id
    s.src = src
    s.async = true
    s.defer = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error(`failed to load ${src}`))
    document.head.appendChild(s)
  })
}

export default function Login({ onRole, onSuccess }: { onRole: (r: Role) => void; onSuccess?: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resetting, setResetting] = useState(false)
  const [resetMsg, setResetMsg] = useState<string | null>(null)
  const [showReset, setShowReset] = useState(false)
  const [resetToken, setResetToken] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newPassword2, setNewPassword2] = useState('')
  const googleBtnRef = useRef<HTMLDivElement | null>(null)

  function finishLogin(token: string, info: { role: Role; zoneId?: string; schoolId?: string; name?: string; surname?: string }, userEmail: string) {
    adoptSession(token, { ...info, email: userEmail })
    onRole(info.role)
    try { localStorage.setItem('nav:target', 'dashboard') } catch {}
    notifySuccess(`Signed in${info.name ? ` as ${info.name}` : ''}`)
    if (onSuccess) onSuccess()
  }

  async function oauthSignIn(provider: 'google' | 'facebook', payload: Record<string, string>) {
    setError(null)
    setLoading(true)
    try {
      const res = await fetch(apiUrl('/auth/oauth'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, ...payload }),
      })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.token) {
        finishLogin(data.token, data, String(data?.email || ''))
      } else if (res.status === 404) {
        setError(`No portal registration found for ${data?.email || 'this account'}. Please register first.`)
      } else {
        setError('Social sign-in failed. Please try again or use your password.')
      }
    } catch {
      setError('Unable to reach the sign-in service')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return
    let cancelled = false
    loadScript('https://accounts.google.com/gsi/client', 'google-gsi').then(() => {
      if (cancelled) return
      const google = (window as any).google
      if (!google?.accounts?.id || !googleBtnRef.current) return
      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (resp: any) => { if (resp?.credential) oauthSignIn('google', { credential: resp.credential }) },
      })
      google.accounts.id.renderButton(googleBtnRef.current, { theme: 'outline', size: 'large', width: 320, text: 'signin_with' })
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  async function facebookSignIn() {
    try {
      await loadScript('https://connect.facebook.net/en_US/sdk.js', 'facebook-sdk')
      const FB = (window as any).FB
      if (!FB) return setError('Facebook sign-in is unavailable right now')
      FB.init({ appId: FACEBOOK_APP_ID, version: 'v19.0', cookie: true, xfbml: false })
      FB.login((resp: any) => {
        const token = resp?.authResponse?.accessToken
        if (token) oauthSignIn('facebook', { accessToken: token })
      }, { scope: 'email' })
    } catch {
      setError('Facebook sign-in is unavailable right now')
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch(apiUrl('/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (res.ok) {
        const data = await res.json()
        finishLogin(data.token, data, email)
        return
      }
      if (res.status === 401) {
        setError('Invalid password')
        return
      }
      if (res.status === 403) {
        setError('This account has no password set. Use "Forgot password?" or social sign-in.')
        return
      }
      if (res.status === 404) {
        setError('No registration found for this email')
        try {
          localStorage.removeItem('nav:target')
          window.dispatchEvent(new CustomEvent('app:navigate', { detail: 'login' }))
        } catch {}
        return
      }
      setError('Unable to sign in')
    } catch {
      // Offline/dev fallback: check locally stored coach registrations
      const coaches = getEntities('Coach')
      const found = coaches.find((c: any) => String(c.data?.email || '').toLowerCase() === email.toLowerCase())
      if (found) {
        const hash = String(found.data?.passwordHash || '')
        if (hash && password && !bcrypt.compareSync(password, hash)) {
          setError('Invalid password')
        } else {
          const ok = await login('Coach', found.data?.zoneId || '', found.data?.schoolId || '', email)
          if (ok) {
            onRole('Coach')
            try { localStorage.setItem('nav:target', 'dashboard') } catch {}
            if (onSuccess) onSuccess()
            return
          }
          setError('Unable to sign in')
        }
      } else {
        setError('Unable to sign in')
      }
    } finally {
      setLoading(false)
    }
  }

  async function requestReset() {
    if (!email) { setResetMsg('Enter your email above first'); return }
    setResetMsg(null)
    setResetting(true)
    try {
      const res = await fetch(apiUrl('/auth/forgot'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json().catch(() => null)
      setResetMsg(data?.message || 'If this email is registered, a reset link has been sent.')
      // Outside production the server returns the token directly so the flow works without email
      if (data?.token) setResetToken(data.token)
      setShowReset(true)
    } catch {
      setResetMsg('Unable to process request')
    } finally {
      setResetting(false)
    }
  }

  async function applyReset() {
    setResetMsg(null)
    if (!resetToken) { setResetMsg('Paste the reset code from your email'); return }
    if (newPassword.length < 8) { setResetMsg('Password must be at least 8 characters'); return }
    if (newPassword !== newPassword2) { setResetMsg('Passwords do not match'); return }
    setResetting(true)
    try {
      const res = await fetch(apiUrl('/auth/reset'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: resetToken, password: newPassword }),
      })
      if (res.ok) {
        notifySuccess('Password updated — you can sign in now')
        setShowReset(false)
        setResetToken('')
        setNewPassword('')
        setNewPassword2('')
        setPassword('')
        setResetMsg(null)
      } else {
        const data = await res.json().catch(() => null)
        setResetMsg(data?.error === 'invalid_or_expired_token' ? 'That reset code is invalid or has expired' : 'Could not reset the password')
      }
    } catch {
      setResetMsg('Unable to process request')
    } finally {
      setResetting(false)
    }
  }

  const hasSocial = !!GOOGLE_CLIENT_ID || !!FACEBOOK_APP_ID
  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block">
        <span className="text-sm font-medium">Email</span>
        <input type="email" autoComplete="email" className="mt-1 w-full rounded-md border p-2" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="block">
        <span className="text-sm font-medium">Password</span>
        <input type="password" autoComplete="current-password" className="mt-1 w-full rounded-md border p-2" value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      {error && <div role="alert" className="rounded-md bg-red-100 p-2 text-sm text-red-700">{error}</div>}
      <button disabled={loading} className="w-full rounded-md bg-brand p-2 text-white disabled:opacity-60">{loading ? 'Signing In...' : 'Sign In'}</button>
      {hasSocial && (
        <>
          <div className="flex items-center gap-3 py-1">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-xs uppercase tracking-wide text-gray-400">or continue with</span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>
          <div className="flex flex-col items-center gap-2">
            {GOOGLE_CLIENT_ID && <div ref={googleBtnRef} data-testid="btn-google-signin" />}
            {FACEBOOK_APP_ID && (
              <button type="button" data-testid="btn-facebook-signin" onClick={facebookSignIn}
                className="flex w-[320px] max-w-full items-center justify-center gap-2 rounded-md bg-[#1877F2] px-4 py-2 text-sm font-medium text-white hover:bg-[#166FE5]">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                Continue with Facebook
              </button>
            )}
          </div>
        </>
      )}
      <div className="text-center text-sm">
        <button type="button" className="text-brand underline" onClick={() => (showReset ? setShowReset(false) : requestReset())} disabled={resetting}>
          {resetting ? 'Processing...' : showReset ? 'Back to sign in' : 'Forgot password?'}
        </button>
      </div>
      {resetMsg && <div className="rounded-md bg-gray-100 p-2 text-sm text-gray-700">{resetMsg}</div>}
      {showReset && (
        <div className="space-y-3 rounded-md border bg-gray-50 p-3" data-testid="reset-panel">
          <div className="text-sm font-semibold">Reset your password</div>
          <label className="block">
            <span className="text-sm font-medium">Reset code</span>
            <input className="mt-1 w-full rounded-md border p-2" value={resetToken} onChange={(e) => setResetToken(e.target.value)} placeholder="From your reset email" />
          </label>
          <label className="block">
            <span className="text-sm font-medium">New password</span>
            <input type="password" autoComplete="new-password" className="mt-1 w-full rounded-md border p-2" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Confirm new password</span>
            <input type="password" autoComplete="new-password" className="mt-1 w-full rounded-md border p-2" value={newPassword2} onChange={(e) => setNewPassword2(e.target.value)} />
          </label>
          <button type="button" disabled={resetting} onClick={applyReset} className="w-full rounded-md bg-brand p-2 text-white disabled:opacity-60">Set new password</button>
        </div>
      )}
    </form>
  )
}
