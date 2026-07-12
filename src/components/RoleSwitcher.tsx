import { useEffect, useRef, useState } from 'react'
import { ChevronDown, RefreshCw } from 'lucide-react'
import { apiUrl } from '../utils/apiBase'
import { schoolNameOf, zoneNameOf } from '../utils/labels'
import { notifyError } from '../utils/notify'

const LABELS: Record<string, string> = {
  Player: 'Player', Referee: 'Referee', Coach: 'Coach',
  SchoolAdmin: 'School Admin', ZoneCoordinator: 'Zone Coordinator', EPHSRUAdmin: 'EPHSRU Admin',
}

type RoleEntry = { role: string; zoneId?: string; schoolId?: string }

// The header role badge. For single-role users it is the familiar static
// chip; for multi-role people it becomes a dropdown that mints a fresh token
// for the chosen hat (server verifies the role belongs to this email) and
// reloads into that dashboard.
export default function RoleSwitcher({ role }: { role: string }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [roles, setRoles] = useState<RoleEntry[]>(() => {
    try { return JSON.parse(localStorage.getItem('auth:roles') || '[]') } catch { return [] }
  })
  const ref = useRef<HTMLDivElement | null>(null)

  // Sessions predating the multi-role rollout have no cached list — fetch once
  useEffect(() => {
    if (roles.length > 0) return
    ;(async () => {
      try {
        const t = localStorage.getItem('auth:token') || ''
        const res = await fetch(apiUrl('/me'), { headers: t ? { Authorization: `Bearer ${t}` } : {} })
        if (!res.ok) return
        const me = await res.json()
        if (Array.isArray(me.roles) && me.roles.length) {
          setRoles(me.roles)
          try { localStorage.setItem('auth:roles', JSON.stringify(me.roles)) } catch {}
        }
      } catch {}
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  async function switchTo(target: string) {
    if (target === role) { setOpen(false); return }
    setBusy(true)
    try {
      const t = localStorage.getItem('auth:token') || ''
      const res = await fetch(apiUrl('/auth/switch-role'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
        body: JSON.stringify({ role: target }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.token) throw new Error(data?.error || 'switch failed')
      localStorage.setItem('auth:token', data.token)
      localStorage.setItem('auth:role', data.role)
      localStorage.setItem('auth:zoneId', String(data.zoneId || ''))
      localStorage.setItem('auth:schoolId', String(data.schoolId || ''))
      if (Array.isArray(data.roles)) localStorage.setItem('auth:roles', JSON.stringify(data.roles))
      localStorage.setItem('nav:target', 'dashboard')
      // A clean reload puts every dashboard/data hook on the new role's scope
      window.location.replace('/')
    } catch (e: any) {
      notifyError(`Could not switch role: ${e?.message || e}`)
      setBusy(false)
    }
  }

  const multi = roles.length > 1
  const badge = (
    <span data-testid="role-badge" className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-3 py-1.5 text-sm font-medium text-brand ring-1 ring-brand/30">
      {LABELS[role] || role}
      {multi && <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />}
    </span>
  )
  if (!multi) return badge

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} title="Switch role" className="cursor-pointer">
        {badge}
      </button>
      {open && (
        <div role="menu" className="absolute left-0 z-50 mt-2 w-64 rounded-lg border border-gray-100 bg-white p-1 shadow-lg" data-testid="role-menu">
          <div className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-400">Switch role</div>
          {roles.map((r) => (
            <button
              key={r.role}
              type="button"
              role="menuitem"
              disabled={busy}
              onClick={() => switchTo(r.role)}
              className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors ${r.role === role ? 'bg-brand/5 font-semibold text-brand' : 'text-gray-700 hover:bg-gray-50'}`}
            >
              <span>
                <span className="block">{LABELS[r.role] || r.role}</span>
                <span className="block text-xs font-normal text-gray-400">
                  {r.schoolId ? schoolNameOf(r.schoolId) : r.zoneId ? zoneNameOf(r.zoneId) : 'Union-wide'}
                </span>
              </span>
              {busy ? <RefreshCw size={13} className="animate-spin text-gray-300" /> : r.role === role ? <span className="text-xs">✓</span> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
