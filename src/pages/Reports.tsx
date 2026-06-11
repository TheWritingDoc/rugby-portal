import { useEffect, useMemo, useState } from 'react'
import { fetchList } from '../utils/api'
import { ZoneSelect, SchoolSelect } from '../components/Dropdowns'
import { RoleGate } from '../components/RoleGate'
import { exportCsv } from '../utils/csv'
import { notifySuccess } from '../utils/notify'
import { Users, UserCheck, School, Award, Download, BarChart3, Filter } from 'lucide-react'

type Role = 'Player' | 'Referee' | 'Coach' | 'SchoolAdmin' | 'ZoneCoordinator' | 'EPHSRUAdmin'

export default function Reports() {
  const role = ((): Role => {
    try { return (localStorage.getItem('auth:role') as Role) || 'Player' } catch { return 'Player' }
  })()
  const [zone, setZone] = useState<string>()
  const [school, setSchool] = useState<string>()
  const [players, setPlayers] = useState<any[]>([])
  const [schools, setSchools] = useState<any[]>([])
  const [coaches, setCoaches] = useState<any[]>([])
  const [referees, setReferees] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Zone coordinators are locked to their own zone
    try {
      const z = localStorage.getItem('auth:zoneId') || ''
      if (role === 'ZoneCoordinator' && z) setZone(z)
    } catch {}
  }, [role])

  useEffect(() => { load() }, [zone, school])
  async function load() {
    setLoading(true)
    const filters: any = { zoneId: zone, schoolId: school }
    const [p, s, c, r] = await Promise.all([
      fetchList('players', filters),
      fetchList('schools', filters),
      fetchList('coaches', filters),
      fetchList('referees', filters),
    ])
    setPlayers(p || [])
    setSchools(s || [])
    setCoaches(c || [])
    setReferees(r || [])
    setLoading(false)
  }

  const byAge = useMemo(() => {
    const out: Record<string, number> = {}
    players.forEach((p) => { const g = p.data?.ageGroup || p.data?.team || 'Unassigned'; out[g] = (out[g] || 0) + 1 })
    return out
  }, [players])

  const bySchool = useMemo(() => {
    const names = new Map(schools.map((s) => [String(s.data?.schoolId || s.id), String(s.data?.name || s.data?.schoolId || s.id)]))
    const out: Record<string, number> = {}
    players.forEach((p) => {
      const sid = String(p.data?.schoolId || 'Unknown')
      const label = names.get(sid) || sid
      out[label] = (out[label] || 0) + 1
    })
    return out
  }, [players, schools])

  function doExport(file: string, entries: Record<string, number>) {
    exportCsv(file, entries)
    notifySuccess(`Exported ${file}`)
  }

  const stats = [
    { icon: Users, label: 'Players', value: players.length, accent: 'bg-blue-50 text-blue-600' },
    { icon: UserCheck, label: 'Coaches', value: coaches.length, accent: 'bg-green-50 text-green-600' },
    { icon: School, label: 'Schools', value: schools.length, accent: 'bg-purple-50 text-purple-600' },
    { icon: Award, label: 'Referees', value: referees.length, accent: 'bg-amber-50 text-amber-600' },
  ]

  return (
    <section>
      <RoleGate role={role} allow={['ZoneCoordinator', 'EPHSRUAdmin']}>
        <div className="space-y-5">
          {/* Filters */}
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
              <Filter className="h-4 w-4 text-brand" /> Report Filters
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {role === 'ZoneCoordinator' ? (
                <div className="rounded-md border bg-gray-50 p-2">
                  <div className="text-xs text-gray-600">Zone (locked to your assignment)</div>
                  <div className="text-sm font-semibold">{zone || '—'}</div>
                </div>
              ) : (
                <ZoneSelect value={zone} onChange={(z) => { setZone(z); setSchool(undefined) }} />
              )}
              <SchoolSelect zoneId={zone} value={school} onChange={setSchool} />
            </div>
          </div>

          {/* Summary stats */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="rounded-xl border bg-white p-4 shadow-sm">
                <div className={`mb-3 w-fit rounded-lg p-2 ${s.accent}`}>
                  <s.icon className="h-5 w-5" />
                </div>
                <div className="text-2xl font-bold text-gray-900">{loading ? '…' : s.value.toLocaleString()}</div>
                <div className="text-sm text-gray-500">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Distributions */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <DistributionCard
              title="Players by Age Group"
              entries={byAge}
              total={players.length}
              onExport={() => doExport('players_by_age.csv', byAge)}
            />
            <DistributionCard
              title="Players by School"
              entries={bySchool}
              total={players.length}
              maxRows={12}
              onExport={() => doExport('players_by_school.csv', bySchool)}
            />
          </div>
        </div>
      </RoleGate>
    </section>
  )
}

function DistributionCard({ title, entries, total, onExport, maxRows = 8 }: { title: string; entries: Record<string, number>; total: number; onExport: () => void; maxRows?: number }) {
  const [showAll, setShowAll] = useState(false)
  const rows = Object.entries(entries).sort((a, b) => b[1] - a[1])
  const visible = showAll ? rows : rows.slice(0, maxRows)
  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900">
          <BarChart3 className="h-5 w-5 text-brand" /> {title}
        </h3>
        <button onClick={onExport} className="flex items-center gap-1.5 rounded-md border bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
          <Download className="h-4 w-4" /> CSV
        </button>
      </div>
      {rows.length === 0 ? (
        <div className="rounded-md border-2 border-dashed py-8 text-center text-sm text-gray-500">No data for this filter</div>
      ) : (
        <div className="space-y-2.5">
          {visible.map(([label, count]) => {
            const pct = total ? Math.round((count / total) * 100) : 0
            return (
              <div key={label} className="flex items-center gap-3">
                <span className="w-32 truncate text-sm text-gray-700" title={label}>{label}</span>
                <div className="h-6 flex-1 overflow-hidden rounded-full bg-gray-100">
                  <div className="flex h-full items-center justify-end rounded-full bg-gradient-to-r from-brand/80 to-brand pr-2 transition-all duration-500" style={{ width: `${Math.max(pct, 4)}%` }}>
                    {pct >= 12 && <span className="text-xs font-medium text-white">{count}</span>}
                  </div>
                </div>
                <span className="w-14 text-right text-sm text-gray-500">{count} ({pct}%)</span>
              </div>
            )
          })}
          {rows.length > maxRows && (
            <button className="text-sm text-brand underline" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Show fewer' : `Show all ${rows.length}`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
