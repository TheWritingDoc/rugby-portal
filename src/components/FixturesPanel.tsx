import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, MapPin, Flag, Plus, X, Loader2, Shield } from 'lucide-react'
import { apiUrl } from '../utils/apiBase'
import { getToken } from '../utils/auth'
import { fetchList, getJsonPath, postJsonPath } from '../utils/api'
import { schoolNameOf } from '../utils/labels'
import { notifyError, notifySuccess } from '../utils/notify'
import ShowMoreButton from './ShowMoreButton'
import { SchoolSelect } from './Dropdowns'
import { AGE_GROUPS } from '../utils/constants'

type Fixture = {
  id: string
  zoneId: string
  homeSchoolId: string
  awaySchoolId: string
  ageGroup: string
  kickoffAt: number
  venue?: string
  refereeEmail?: string | null
  status: string
  homeScore?: number | null
  awayScore?: number | null
  notes?: string
}

const STATUS_STYLE: Record<string, string> = {
  scheduled: 'bg-blue-50 text-blue-700 ring-blue-200',
  completed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  cancelled: 'bg-red-50 text-red-700 ring-red-200',
  postponed: 'bg-amber-50 text-amber-700 ring-amber-200',
}

function whenLabel(ts: number) {
  const d = new Date(Number(ts) || 0)
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) +
    ' · ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function authHeaders(): Record<string, string> {
  const t = getToken() || localStorage.getItem('auth:token') || ''
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }
}

// Fixture list shared by every role. The server scopes what comes back;
// `manage` adds the zone coordinator's scheduling and referee-assignment
// controls. `compact` renders upcoming-only and hides itself when empty
// (coach/player dashboards shouldn't grow an empty section).
export default function FixturesPanel({ manage = false, compact = false }: { manage?: boolean; compact?: boolean }) {
  const [fixtures, setFixtures] = useState<Fixture[]>([])
  const [loaded, setLoaded] = useState(false)
  const [showUpcoming, setShowUpcoming] = useState(8)
  const [showPast, setShowPast] = useState(6)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [referees, setReferees] = useState<{ email: string; name: string }[]>([])
  const zoneId = localStorage.getItem('auth:zoneId') || ''
  const mySchool = localStorage.getItem('auth:schoolId') || ''
  const myEmail = (localStorage.getItem('auth:email') || '').toLowerCase()

  const [form, setForm] = useState({ homeSchoolId: '', awaySchoolId: '', ageGroup: 'U16', date: '', time: '14:00', venue: '', refereeEmail: '' })

  async function load() {
    const list = await getJsonPath('fixtures')
    if (Array.isArray(list)) setFixtures(list)
    setLoaded(true)
  }
  useEffect(() => { load() }, [])
  useEffect(() => {
    if (!manage) return
    ;(async () => {
      const refs = await fetchList('referees', { zoneId })
      if (Array.isArray(refs)) {
        setReferees(refs.map((r: any) => ({
          email: String(r.email || r.data?.email || '').toLowerCase(),
          name: `${r.name || r.data?.name || ''} ${r.surname || r.data?.surname || ''}`.trim(),
        })).filter((r) => r.email))
      }
    })()
  }, [manage, zoneId])

  const now = Date.now()
  const upcoming = useMemo(() => fixtures.filter((f) => Number(f.kickoffAt) >= now - 3 * 3600_000 && f.status !== 'cancelled').sort((a, b) => a.kickoffAt - b.kickoffAt), [fixtures, now])
  const past = useMemo(() => fixtures.filter((f) => Number(f.kickoffAt) < now - 3 * 3600_000 || f.status === 'cancelled').sort((a, b) => b.kickoffAt - a.kickoffAt), [fixtures, now])

  async function createFixture() {
    if (!form.homeSchoolId || !form.awaySchoolId) return notifyError('Select both schools')
    if (form.homeSchoolId === form.awaySchoolId) return notifyError('Home and away must be different schools')
    if (!form.date) return notifyError('Pick a match date')
    const kickoffAt = new Date(`${form.date}T${form.time || '14:00'}`).getTime()
    if (!Number.isFinite(kickoffAt)) return notifyError('Invalid date/time')
    setSaving(true)
    try {
      const res = await postJsonPath('fixtures', {
        zoneId, homeSchoolId: form.homeSchoolId, awaySchoolId: form.awaySchoolId,
        ageGroup: form.ageGroup, kickoffAt, venue: form.venue, refereeEmail: form.refereeEmail || undefined,
      })
      if (!res.ok) throw new Error((res.data as any)?.error || 'create failed')
      notifySuccess('Fixture scheduled — both schools have been notified.')
      setCreating(false)
      setForm({ homeSchoolId: '', awaySchoolId: '', ageGroup: 'U16', date: '', time: '14:00', venue: '', refereeEmail: '' })
      await load()
    } catch (e: any) {
      notifyError(`Could not schedule the fixture: ${e?.message || e}`)
    } finally {
      setSaving(false)
    }
  }

  async function updateFixture(id: string, patch: any, successMsg: string) {
    try {
      const res = await fetch(apiUrl(`/fixtures/${encodeURIComponent(id)}`), { method: 'PUT', headers: authHeaders(), body: JSON.stringify(patch) })
      if (!res.ok) throw new Error((await res.json().catch(() => ({})) as any)?.error || 'update failed')
      notifySuccess(successMsg)
      await load()
    } catch (e: any) {
      notifyError(`Update failed: ${e?.message || e}`)
    }
  }

  function FixtureCard({ f }: { f: Fixture }) {
    const mine = mySchool && (f.homeSchoolId === mySchool || f.awaySchoolId === mySchool)
    const refMine = myEmail && String(f.refereeEmail || '').toLowerCase() === myEmail
    return (
      <div className={`rounded-xl border bg-white p-4 shadow-sm ${refMine ? 'border-purple-200' : mine ? 'border-brand/30' : 'border-gray-200'}`} data-testid="fixture-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
              <CalendarDays className="h-5 w-5" />
            </span>
            <div>
              <div className="text-sm font-semibold text-gray-900">
                {schoolNameOf(f.homeSchoolId)} <span className="text-gray-400">vs</span> {schoolNameOf(f.awaySchoolId)}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-700">{f.ageGroup}</span>
                <span>{whenLabel(f.kickoffAt)}</span>
                {f.venue && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{f.venue}</span>}
                <span className="inline-flex items-center gap-1">
                  <Flag className="h-3 w-3" />
                  {f.refereeEmail ? (referees.find((r) => r.email === String(f.refereeEmail).toLowerCase())?.name || f.refereeEmail) : 'Referee TBC'}
                  {refMine && <span className="rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] font-semibold text-purple-700">You</span>}
                </span>
              </div>
            </div>
          </div>
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${STATUS_STYLE[f.status] || 'bg-gray-100 text-gray-600 ring-gray-200'}`}>
            {f.status}
          </span>
        </div>
        {manage && f.status === 'scheduled' && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
            <select
              aria-label="Assign referee"
              className="rounded-md border border-gray-300 py-1.5 pl-2 pr-7 text-xs"
              value={String(f.refereeEmail || '')}
              onChange={(e) => updateFixture(f.id, { refereeEmail: e.target.value }, e.target.value ? 'Referee appointed and notified.' : 'Referee unassigned.')}
            >
              <option value="">Assign referee…</option>
              {referees.map((r) => <option key={r.email} value={r.email}>{r.name || r.email}</option>)}
            </select>
            <button type="button" className="rounded-md border border-gray-300 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
              onClick={() => updateFixture(f.id, { status: 'postponed' }, 'Fixture postponed — both schools notified.')}>Postpone</button>
            <button type="button" className="rounded-md border border-red-200 px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50"
              onClick={() => { if (confirm('Cancel this fixture? Both schools will be notified.')) updateFixture(f.id, { status: 'cancelled' }, 'Fixture cancelled — both schools notified.') }}>Cancel</button>
          </div>
        )}
      </div>
    )
  }

  // Compact mode disappears entirely when there is nothing to show
  if (compact && loaded && upcoming.length === 0) return null

  return (
    <div className="space-y-3" data-testid="fixtures-panel">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <CalendarDays className="h-4 w-4 text-brand" /> {compact ? 'Upcoming matches' : 'Fixtures'}
        </h3>
        {manage && (
          <button
            type="button"
            onClick={() => setCreating((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${creating ? 'border border-gray-300 text-gray-600 hover:bg-gray-50' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
          >
            {creating ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            {creating ? 'Close' : 'Schedule Fixture'}
          </button>
        )}
      </div>

      {manage && creating && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <SchoolSelect zoneId={zoneId} value={form.homeSchoolId} onChange={(v) => setForm((x) => ({ ...x, homeSchoolId: v }))} />
            <label className="block">
              <span className="text-sm font-medium">Away school</span>
              <select className="mt-1 w-full rounded-md border border-gray-300 bg-white p-2 text-sm" aria-label="Away school"
                value={form.awaySchoolId} onChange={(e) => setForm((x) => ({ ...x, awaySchoolId: e.target.value }))}>
                <option value="">Select...</option>
                {/* away school comes from the same zone list; cross-zone festivals arrive later */}
                <SchoolOptions zoneId={zoneId} />
              </select>
            </label>
            <label className="block"><span className="text-sm font-medium">Age group</span>
              <select className="mt-1 w-full rounded-md border border-gray-300 bg-white p-2 text-sm" aria-label="Fixture age group"
                value={form.ageGroup} onChange={(e) => setForm((x) => ({ ...x, ageGroup: e.target.value }))}>
                {AGE_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </label>
            <label className="block"><span className="text-sm font-medium">Venue</span>
              <input className="mt-1 w-full rounded-md border border-gray-300 p-2 text-sm" value={form.venue} placeholder="e.g. Daniel Pienaar Stadium"
                onChange={(e) => setForm((x) => ({ ...x, venue: e.target.value }))} />
            </label>
            <label className="block"><span className="text-sm font-medium">Date</span>
              <input type="date" className="mt-1 w-full rounded-md border border-gray-300 p-2 text-sm" value={form.date}
                onChange={(e) => setForm((x) => ({ ...x, date: e.target.value }))} />
            </label>
            <label className="block"><span className="text-sm font-medium">Kick-off</span>
              <input type="time" className="mt-1 w-full rounded-md border border-gray-300 p-2 text-sm" value={form.time}
                onChange={(e) => setForm((x) => ({ ...x, time: e.target.value }))} />
            </label>
            <label className="block sm:col-span-2"><span className="text-sm font-medium">Referee (optional — can be assigned later)</span>
              <select className="mt-1 w-full rounded-md border border-gray-300 bg-white p-2 text-sm" aria-label="Fixture referee"
                value={form.refereeEmail} onChange={(e) => setForm((x) => ({ ...x, refereeEmail: e.target.value }))}>
                <option value="">Assign later</option>
                {referees.map((r) => <option key={r.email} value={r.email}>{r.name || r.email}</option>)}
              </select>
            </label>
          </div>
          <div className="mt-3 text-right">
            <button type="button" onClick={createFixture} disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Schedule Fixture
            </button>
          </div>
        </div>
      )}

      {!loaded ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border bg-white py-8 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading fixtures…
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {upcoming.slice(0, showUpcoming).map((f) => <FixtureCard key={f.id} f={f} />)}
            {upcoming.length === 0 && !compact && (
              <div className="rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 py-8 text-center text-sm text-gray-500">
                <Shield className="mx-auto mb-2 h-6 w-6 text-gray-300" />
                No upcoming fixtures{manage ? ' — schedule the first one above' : ' yet'}
              </div>
            )}
            <ShowMoreButton total={upcoming.length} shown={showUpcoming} onMore={() => setShowUpcoming((n) => n + 12)} />
          </div>
          {!compact && past.length > 0 && (
            <div className="space-y-2">
              <div className="pt-2 text-xs font-medium uppercase tracking-wide text-gray-400">Past & cancelled</div>
              {past.slice(0, showPast).map((f) => <FixtureCard key={f.id} f={f} />)}
              <ShowMoreButton total={past.length} shown={showPast} onMore={() => setShowPast((n) => n + 12)} />
            </div>
          )}
        </>
      )}
    </div>
  )
}

// Options-only helper so the away select can reuse the school catalog without
// nesting a second labelled SchoolSelect (unique test-ids stay unique).
function SchoolOptions({ zoneId }: { zoneId: string }) {
  const [opts, setOpts] = useState<{ id: string; name: string }[]>([])
  useEffect(() => {
    ;(async () => {
      const rows = await fetchList('schools', { zoneId })
      if (Array.isArray(rows)) {
        setOpts(rows.map((s: any) => {
          let d: any = {}
          try { d = typeof s.data === 'string' ? JSON.parse(s.data) : s.data || {} } catch {}
          return { id: String(s.schoolId || s.id || ''), name: String(d.name || s.name || s.schoolId || '') }
        }).filter((s) => s.id))
      }
    })()
  }, [zoneId])
  return <>{opts.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</>
}
