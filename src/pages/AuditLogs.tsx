import { loadAudits } from '../utils/audit'
import { fetchList } from '../utils/api'
import { useEffect, useMemo, useState } from 'react'
import { ScrollText, ChevronRight, Search, Filter } from 'lucide-react'
import ShowMoreButton from '../components/ShowMoreButton'

const ACTION_STYLES: Record<string, string> = {
  create: 'bg-green-100 text-green-800',
  register: 'bg-green-100 text-green-800',
  update: 'bg-blue-100 text-blue-800',
  decision: 'bg-purple-100 text-purple-800',
  approval_apply: 'bg-purple-100 text-purple-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  delete: 'bg-red-100 text-red-800',
  send: 'bg-sky-100 text-sky-800',
  photo_update: 'bg-blue-100 text-blue-800',
  oauth_login: 'bg-blue-100 text-blue-800',
  password_reset: 'bg-amber-100 text-amber-800',
}

const DAY_PAGE = 20

function dayKeyOf(ts: number) {
  const d = new Date(Number(ts) || 0)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function dayLabelOf(key: string) {
  const today = dayKeyOf(Date.now())
  const yesterday = dayKeyOf(Date.now() - 86_400_000)
  if (key === today) return 'Today'
  if (key === yesterday) return 'Yesterday'
  return new Date(`${key}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

// Union-wide audit trail organised the same way as every other list in the
// app: filters on top, one collapsible folder per day, paginated rows inside.
export default function AuditLogs() {
  const [entries, setEntries] = useState<any[]>(loadAudits().slice().reverse())
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [entityFilter, setEntityFilter] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [openDays, setOpenDays] = useState<Record<string, boolean>>({})
  const [dayShown, setDayShown] = useState<Record<string, number>>({})
  const [visibleDays, setVisibleDays] = useState(7)

  useEffect(() => {
    ;(async () => {
      const token = localStorage.getItem('auth:token')
      const role = localStorage.getItem('auth:role')
      if (!token || role !== 'EPHSRUAdmin') {
        setError('Access denied. Admin privileges required.')
        return
      }
      try {
        const list = await fetchList('audits')
        if (list && Array.isArray(list)) setEntries(list.slice().reverse())
        else setError('Unable to load logs (Access Denied)')
      } catch {
        setError('Failed to fetch audit logs')
      }
    })()
  }, [])

  const entities = useMemo(() => [...new Set(entries.map((e) => String(e.entity || '')))].filter(Boolean).sort(), [entries])
  const actions = useMemo(() => [...new Set(entries.map((e) => String(e.action || '')))].filter(Boolean).sort(), [entries])
  const roles = useMemo(() => [...new Set(entries.map((e) => String(e.userRole || '')))].filter(Boolean).sort(), [entries])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return entries.filter((e) => {
      if (entityFilter && String(e.entity) !== entityFilter) return false
      if (actionFilter && String(e.action) !== actionFilter) return false
      if (roleFilter && String(e.userRole) !== roleFilter) return false
      if (q && !`${e.entity} ${e.action} ${e.userRole} ${e.before || ''} ${e.after || ''}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [entries, query, entityFilter, actionFilter, roleFilter])

  // Reset pagination whenever the filters change
  useEffect(() => { setVisibleDays(7); setDayShown({}); setOpenDays({}) }, [query, entityFilter, actionFilter, roleFilter])

  const days = useMemo(() => {
    const map = new Map<string, any[]>()
    for (const e of filtered) {
      const k = dayKeyOf(e.ts)
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(e)
    }
    return [...map.entries()] // insertion order = newest first (entries are reversed)
  }, [filtered])

  const actionCounts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const e of filtered) c[String(e.action)] = (c[String(e.action)] || 0) + 1
    return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 6)
  }, [filtered])

  const filtersActive = Boolean(query.trim() || entityFilter || actionFilter || roleFilter)
  const isDayOpen = (k: string, idx: number) => (filtersActive ? true : openDays[k] ?? idx === 0)
  const shownFor = (k: string) => dayShown[k] ?? DAY_PAGE

  if (error) {
    return (
      <section>
        <h2 className="mb-2 text-lg font-semibold">Audit Logs</h2>
        <div className="rounded-lg border bg-red-50 p-4 text-red-800 border-red-200">
          {error}. Please ensure you are logged in as an Administrator.
        </div>
      </section>
    )
  }

  return (
    <section data-testid="audit-logs">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <ScrollText className="h-5 w-5 text-brand" /> Audit Logs
        </h2>
        <span className="text-sm text-gray-500">{filtered.length.toLocaleString()} of {entries.length.toLocaleString()} events</span>
      </div>

      {/* Filters */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <input
            type="text"
            placeholder="Search events..."
            aria-label="Search audit events"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-48 rounded-lg border border-gray-300 py-1.5 pl-8 pr-3 text-sm"
          />
        </div>
        <select aria-label="Filter by entity" value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)} className="rounded-lg border border-gray-300 py-1.5 pl-2 pr-7 text-sm">
          <option value="">All entities</option>
          {entities.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <select aria-label="Filter by action" value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} className="rounded-lg border border-gray-300 py-1.5 pl-2 pr-7 text-sm">
          <option value="">All actions</option>
          {actions.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <select aria-label="Filter by role" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="rounded-lg border border-gray-300 py-1.5 pl-2 pr-7 text-sm">
          <option value="">All roles</option>
          {roles.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        {filtersActive && (
          <button
            type="button"
            onClick={() => { setQuery(''); setEntityFilter(''); setActionFilter(''); setRoleFilter('') }}
            className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            <Filter className="h-3 w-3" aria-hidden="true" /> Clear
          </button>
        )}
      </div>

      {/* What happened, at a glance */}
      {actionCounts.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {actionCounts.map(([action, n]) => (
            <button
              key={action}
              type="button"
              onClick={() => setActionFilter(actionFilter === action ? '' : action)}
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ring-black/5 transition-opacity ${ACTION_STYLES[action] || 'bg-gray-100 text-gray-700'} ${actionFilter && actionFilter !== action ? 'opacity-40' : ''}`}
              title={`Filter by ${action}`}
            >
              {action} · {n}
            </button>
          ))}
        </div>
      )}

      {/* One folder per day */}
      <div className="space-y-2">
        {days.slice(0, visibleDays).map(([key, rows], idx) => {
          const open = isDayOpen(key, idx)
          const shown = shownFor(key)
          return (
            <div key={key} className="overflow-hidden rounded-xl border bg-white shadow-sm">
              <button
                type="button"
                onClick={() => setOpenDays((prev) => ({ ...prev, [key]: !open }))}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50"
              >
                <span className="font-semibold text-gray-900">{dayLabelOf(key)}</span>
                <span className="text-xs text-gray-500">{rows.length} event{rows.length === 1 ? '' : 's'}</span>
                <ChevronRight className={`ml-auto h-4 w-4 text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden="true" />
              </button>
              {open && (
                <div className="border-t">
                  <table className="w-full text-left text-sm">
                    <tbody className="divide-y divide-gray-100">
                      {rows.slice(0, shown).map((e) => (
                        <tr key={e.id} className="hover:bg-gray-50">
                          <td className="whitespace-nowrap px-4 py-2 text-xs text-gray-500">{new Date(e.ts).toLocaleTimeString()}</td>
                          <td className="px-4 py-2">
                            <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">{e.userRole || 'system'}</span>
                          </td>
                          <td className="px-4 py-2 text-gray-700">{e.entity}</td>
                          <td className="px-4 py-2">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${ACTION_STYLES[String(e.action)] || 'bg-gray-100 text-gray-700'}`}>{e.action}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {rows.length > shown && (
                    <button
                      type="button"
                      onClick={() => setDayShown((prev) => ({ ...prev, [key]: shown + 50 }))}
                      className="w-full border-t bg-gray-50 px-4 py-2 text-center text-xs font-medium text-gray-600 hover:bg-gray-100"
                    >
                      Show more ({rows.length - shown} remaining)
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
        {days.length === 0 && (
          <div className="rounded-xl border-2 border-dashed bg-gray-50 py-10 text-center text-sm text-gray-500">
            {filtersActive ? 'No events match these filters.' : 'No audit events yet'}
          </div>
        )}
        <ShowMoreButton total={days.length} shown={visibleDays} onMore={() => setVisibleDays((n) => n + 7)} />
      </div>
    </section>
  )
}
