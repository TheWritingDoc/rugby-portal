import { useState } from 'react'
import { Search, UserPlus } from 'lucide-react'
import { apiUrl } from '../utils/apiBase'
import { ZoneSelect, SchoolSelect } from './Dropdowns'
import { schoolNameOf, zoneNameOf } from '../utils/labels'
import { notifyError, notifySuccess } from '../utils/notify'

const LABELS: Record<string, string> = {
  Player: 'Player', Referee: 'Referee', Coach: 'Coach',
  SchoolAdmin: 'School Admin', ZoneCoordinator: 'Zone Coordinator', EPHSRUAdmin: 'EPHSRU Admin',
}

type RoleEntry = { role: string; zoneId?: string; schoolId?: string; name?: string; surname?: string }

// Mirrors the server's grant matrix: each admin may only hand out roles below
// their own station, inside their own patch.
function grantableFor(role: string): string[] {
  if (role === 'EPHSRUAdmin') return ['EPHSRUAdmin', 'ZoneCoordinator', 'SchoolAdmin', 'Coach', 'Referee', 'Player']
  if (role === 'ZoneCoordinator') return ['SchoolAdmin', 'Referee']
  if (role === 'SchoolAdmin') return ['Coach', 'Referee', 'Player']
  return []
}

function authHeaders(): Record<string, string> {
  const t = localStorage.getItem('auth:token') || ''
  return t ? { Authorization: `Bearer ${t}` } : {}
}

// "Add role to existing user": look someone up by email, see the hats they
// already wear, grant one more. The new role reuses their existing password.
export default function AddRoleToUser({ role }: { role: string }) {
  const myZone = localStorage.getItem('auth:zoneId') || ''
  const mySchool = localStorage.getItem('auth:schoolId') || ''
  const [email, setEmail] = useState('')
  const [found, setFound] = useState<RoleEntry[] | null>(null)
  const [target, setTarget] = useState('')
  const [zoneId, setZoneId] = useState('')
  const [schoolId, setSchoolId] = useState('')
  const [busy, setBusy] = useState(false)

  const grantable = grantableFor(role)
  if (grantable.length === 0) return null
  const held = new Set((found || []).map((r) => r.role))
  const options = grantable.filter((r) => !held.has(r))

  // Which scope the union admin must still pick; lower admins have it forced.
  const needsZone = role === 'EPHSRUAdmin' && ['ZoneCoordinator', 'SchoolAdmin', 'Coach', 'Referee', 'Player'].includes(target)
  const needsSchool =
    (role === 'EPHSRUAdmin' && ['SchoolAdmin', 'Coach', 'Player'].includes(target)) ||
    (role === 'ZoneCoordinator' && target === 'SchoolAdmin')
  const schoolZone = role === 'ZoneCoordinator' ? myZone : zoneId
  const forcedScope =
    role === 'SchoolAdmin' ? (target === 'Referee' ? zoneNameOf(myZone) : schoolNameOf(mySchool)) :
    role === 'ZoneCoordinator' && target === 'Referee' ? zoneNameOf(myZone) : ''

  async function lookup() {
    setBusy(true); setFound(null); setTarget('')
    try {
      const res = await fetch(apiUrl(`/users/roles?email=${encodeURIComponent(email.trim())}`), { headers: authHeaders() })
      const data = await res.json().catch(() => null)
      if (res.status === 404) { notifyError('No account found with that email address'); return }
      if (!res.ok) throw new Error(data?.error || 'lookup failed')
      setFound(data.roles || [])
    } catch (e: any) {
      notifyError(`Could not look up user: ${e?.message || e}`)
    } finally { setBusy(false) }
  }

  async function grant() {
    if (!target) { notifyError('Choose the role to add'); return }
    if (needsZone && !zoneId) { notifyError('Choose a zone for the new role'); return }
    if (needsSchool && !schoolId) { notifyError('Choose a school for the new role'); return }
    setBusy(true)
    try {
      const res = await fetch(apiUrl('/users/add-role'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ email: email.trim(), role: target, zoneId, schoolId }),
      })
      const data = await res.json().catch(() => null)
      if (res.status === 409) { notifyError('That user already holds this role'); return }
      if (!res.ok) throw new Error(data?.error || 'grant failed')
      notifySuccess(`${LABELS[target] || target} role added — they can switch roles from the header menu`)
      setFound(data.roles || null)
      setTarget(''); setZoneId(''); setSchoolId('')
    } catch (e: any) {
      notifyError(`Could not add role: ${e?.message || e}`)
    } finally { setBusy(false) }
  }

  return (
    <section className="mt-4 rounded-lg border bg-white p-4 shadow" data-testid="add-role-panel">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <UserPlus size={18} className="text-brand" /> Add Role to Existing User
      </h2>
      <p className="mb-3 mt-0.5 text-sm text-gray-500">
        Give someone who already has an account an extra role. They keep their password and pick the role at sign-in.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="block min-w-56 flex-1">
          <span className="text-sm font-medium">User email</span>
          <input
            type="email" value={email} data-testid="add-role-email"
            onChange={(e) => { setEmail(e.target.value); setFound(null) }}
            onKeyDown={(e) => { if (e.key === 'Enter' && email.trim()) lookup() }}
            placeholder="name@example.com"
            className="mt-1 w-full rounded-md border border-gray-300 p-2 text-sm focus:border-brand focus:outline-none"
          />
        </label>
        <button type="button" disabled={busy || !email.trim()} onClick={lookup} data-testid="add-role-find"
          className="flex items-center gap-1 rounded-md border bg-white px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50">
          <Search size={15} /> Find user
        </button>
      </div>

      {found && (
        <div className="mt-3 space-y-3" data-testid="add-role-details">
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className="text-gray-500">Current roles:</span>
            {found.map((r) => (
              <span key={r.role} className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                {LABELS[r.role] || r.role}
                {r.schoolId ? ` · ${schoolNameOf(r.schoolId)}` : r.zoneId ? ` · ${zoneNameOf(r.zoneId)}` : ''}
              </span>
            ))}
          </div>
          {options.length === 0 ? (
            <p className="text-sm text-gray-500">There are no further roles you can grant this user.</p>
          ) : (
            <div className="grid grid-cols-1 items-end gap-2 sm:grid-cols-4">
              <label className="block">
                <span className="text-sm font-medium">Role to add</span>
                <select value={target} data-testid="add-role-select"
                  onChange={(e) => { setTarget(e.target.value); setZoneId(''); setSchoolId('') }}
                  className="mt-1 w-full rounded-md border border-gray-300 bg-white p-2 text-sm focus:border-brand focus:outline-none">
                  <option value="">Select...</option>
                  {options.map((r) => <option key={r} value={r}>{LABELS[r] || r}</option>)}
                </select>
              </label>
              {needsZone && <ZoneSelect value={zoneId} onChange={(v) => { setZoneId(v); setSchoolId('') }} />}
              {needsSchool && <SchoolSelect zoneId={schoolZone} value={schoolId} onChange={setSchoolId} />}
              {!needsZone && !needsSchool && target && forcedScope && (
                <div className="rounded-md bg-gray-100 p-2 text-sm">
                  <div className="text-xs text-gray-500">Scope</div>
                  <div className="font-medium">{forcedScope}</div>
                </div>
              )}
              <button type="button" disabled={busy || !target} onClick={grant} data-testid="add-role-submit"
                className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
                Add role
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
