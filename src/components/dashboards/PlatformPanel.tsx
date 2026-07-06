import { useEffect, useMemo, useState } from 'react'
import {
  Building2, Trophy, Users, UserCheck, Award, Shield, School,
  Activity, AlertCircle, CalendarCheck, ChevronRight, Globe, Loader2,
} from 'lucide-react'
import { apiUrl } from '../../utils/apiBase'
import { getToken } from '../../utils/auth'
import { zoneNameOf } from '../../utils/labels'
import ShowMoreButton from '../ShowMoreButton'

type Product = {
  id: string
  name: string
  sport: string
  level: string
  status: string
  orgs: number
  players: number
  coaches: number
  referees: number
  zoneCoordinators: number
  schoolAdmins: number
  unionAdmins: number
  registrationsThisSeason: number
  pendingPlayers: number
  lastActivityAt: number
}

type Overview = {
  company: string
  generatedAt: number
  products: Product[]
  zones: { zoneId: string; schools: number; players: number; coaches: number }[]
  activity: { day: string; events: number }[]
  topActions: { action: string; n: number }[]
}

// Sports the company plans to launch next — shown as roadmap cards so the
// owner panel doubles as the pitch view. Purely presentational: no data
// exists for these until a federation signs on. The demo figures are
// realistic Eastern Cape scale, used only in the showcase toggle and always
// badged DEMO so they can never be mistaken for live numbers.
const ROADMAP = [
  { name: 'EPRU Club Rugby', sport: 'Rugby', level: 'club', demo: { orgs: 90, players: 2840, coaches: 178, referees: 42, admins: 94, season: 2610 } },
  { name: 'EP Soccer (School & Club)', sport: 'Soccer', level: 'school + club', demo: { orgs: 124, players: 3960, coaches: 214, referees: 58, admins: 129, season: 3705 } },
  { name: 'EP Netball (School & Club)', sport: 'Netball', level: 'school + club', demo: { orgs: 96, players: 2310, coaches: 141, referees: 33, admins: 101, season: 2188 } },
  { name: 'EP Cricket (School & Club)', sport: 'Cricket', level: 'school + club', demo: { orgs: 64, players: 1480, coaches: 92, referees: 21, admins: 66, season: 1352 } },
]

function timeAgo(ts: number) {
  if (!ts) return '—'
  const mins = Math.floor((Date.now() - ts) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? '' : 's'} ago`
  const days = Math.floor(hrs / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

// PrecisionCode PTY LTD owner panel: the business view of the platform.
// Product portfolio, headline numbers, season pulse and activity — all from
// the one shared database via a single aggregate endpoint.
export default function PlatformPanel() {
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState('')
  const [visibleZones, setVisibleZones] = useState(13)
  // Showcase mode: renders the roadmap sports as full product cards with
  // sample figures (badged DEMO) — for pitching the platform to federations.
  const [demoMode, setDemoMode] = useState(false)

  useEffect(() => {
    ;(async () => {
      try {
        const t = getToken() || localStorage.getItem('auth:token') || ''
        const res = await fetch(apiUrl('/platform/overview'), { headers: t ? { Authorization: `Bearer ${t}` } : {} })
        if (!res.ok) throw new Error(res.status === 403 ? 'Owner access required' : `Failed (${res.status})`)
        setData(await res.json())
      } catch (e: any) {
        setError(String(e?.message || e))
      }
    })()
  }, [])

  const live = data?.products?.[0]
  const maxEvents = useMemo(() => Math.max(1, ...(data?.activity || []).map((a) => a.events)), [data])

  if (error) {
    return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
  }
  if (!data || !live) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border bg-white py-16 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading platform overview…
      </div>
    )
  }

  return (
    <div className="space-y-6" data-testid="platform-panel">
      {/* Company banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 px-6 py-6 text-white shadow-xl sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20">
              <Building2 className="h-6 w-6 text-emerald-300" />
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-widest text-slate-300">Platform Owner</div>
              <h2 className="text-xl font-bold sm:text-2xl">{data.company}</h2>
            </div>
          </div>
          <div className="text-right text-xs text-slate-300">
            <div>Last platform activity</div>
            <div className="mt-0.5 text-sm font-semibold text-white">{timeAgo(live.lastActivityAt)}</div>
          </div>
        </div>
      </div>

      {/* Live product */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Products</h3>
          <button
            type="button"
            aria-pressed={demoMode}
            onClick={() => setDemoMode((v) => !v)}
            data-testid="demo-toggle"
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${demoMode ? 'bg-amber-100 text-amber-700 ring-1 ring-amber-300' : 'bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50'}`}
            title="Preview the expansion sports as product cards with sample figures"
          >
            <span className={`h-2 w-2 rounded-full ${demoMode ? 'bg-amber-500' : 'bg-gray-300'}`} />
            {demoMode ? 'Demo showcase on' : 'Demo showcase'}
          </button>
        </div>
        {demoMode && (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
            Showcase mode — the cards below marked <strong>DEMO</strong> use sample figures to illustrate the platform running multiple sports. Only the LIVE card shows real data.
          </div>
        )}
        <div className="overflow-hidden rounded-xl border border-emerald-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-100 bg-emerald-50/60 px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                <Trophy className="h-5 w-5" />
              </div>
              <div>
                <div className="font-semibold text-gray-900">{live.name}</div>
                <div className="text-xs text-gray-500">{live.sport} · {live.level} level · Eastern Cape</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> LIVE
              </span>
              <a href="https://rugby-portal.vercel.app" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50">
                <Globe className="h-3 w-3" /> rugby-portal.vercel.app
              </a>
            </div>
          </div>
          <div className="grid grid-cols-2 divide-x divide-y divide-gray-100 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { icon: School, label: 'Schools', value: live.orgs },
              { icon: Users, label: 'Players', value: live.players },
              { icon: UserCheck, label: 'Coaches', value: live.coaches },
              { icon: Award, label: 'Referees', value: live.referees },
              { icon: Shield, label: 'Zone coordinators', value: live.zoneCoordinators },
              { icon: Shield, label: 'School admins', value: live.schoolAdmins },
            ].map((s) => (
              <div key={s.label} className="px-4 py-4">
                <s.icon className="mb-1.5 h-4 w-4 text-gray-400" aria-hidden="true" />
                <div className="text-xl font-bold text-gray-900">{s.value.toLocaleString()}</div>
                <div className="text-xs text-gray-500">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Demo showcase: expansion sports rendered as product cards with sample figures */}
        {demoMode && (
          <div className="mt-3 space-y-3" data-testid="demo-products">
            {ROADMAP.map((r) => (
              <div key={r.name} className="overflow-hidden rounded-xl border border-amber-200 bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-100 bg-amber-50/60 px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                      <Trophy className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900">{r.name}</div>
                      <div className="text-xs text-gray-500">{r.sport} · {r.level} level · Eastern Cape</div>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> DEMO — sample figures
                  </span>
                </div>
                <div className="grid grid-cols-2 divide-x divide-y divide-gray-100 sm:grid-cols-3 lg:grid-cols-6">
                  {[
                    { icon: School, label: r.level === 'club' ? 'Clubs' : 'Organisations', value: r.demo.orgs },
                    { icon: Users, label: 'Players', value: r.demo.players },
                    { icon: UserCheck, label: 'Coaches', value: r.demo.coaches },
                    { icon: Award, label: 'Referees', value: r.demo.referees },
                    { icon: Shield, label: 'Admins', value: r.demo.admins },
                    { icon: CalendarCheck, label: 'Season registrations', value: r.demo.season },
                  ].map((s) => (
                    <div key={s.label} className="px-4 py-4">
                      <s.icon className="mb-1.5 h-4 w-4 text-amber-400" aria-hidden="true" />
                      <div className="text-xl font-bold text-gray-900">{s.value.toLocaleString()}</div>
                      <div className="text-xs text-gray-500">{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Season pulse + activity */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-400">
              <CalendarCheck className="h-4 w-4" /> This season ({new Date().getFullYear()})
            </div>
            <div className="mt-2 text-3xl font-bold text-gray-900">{live.registrationsThisSeason.toLocaleString()}</div>
            <div className="text-sm text-gray-500">player registrations</div>
          </div>
          <div className={`rounded-xl border p-5 shadow-sm ${live.pendingPlayers > 0 ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-white'}`}>
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-400">
              <AlertCircle className="h-4 w-4" /> Awaiting review
            </div>
            <div className={`mt-2 text-3xl font-bold ${live.pendingPlayers > 0 ? 'text-amber-700' : 'text-gray-900'}`}>{live.pendingPlayers.toLocaleString()}</div>
            <div className="text-sm text-gray-500">pending player approvals</div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-400">
              <Activity className="h-4 w-4" /> Platform activity — last 14 days
            </div>
            <span className="text-xs text-gray-500">{data.activity.reduce((a, x) => a + x.events, 0).toLocaleString()} events</span>
          </div>
          {data.activity.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-500">No activity recorded yet</div>
          ) : (
            <div className="flex h-32 items-end gap-1.5">
              {data.activity.map((a) => (
                <div key={a.day} className="group relative flex-1">
                  <div
                    className="w-full rounded-t bg-indigo-500/80 transition-colors group-hover:bg-indigo-600"
                    style={{ height: `${Math.max(4, Math.round((a.events / maxEvents) * 112))}px` }}
                    title={`${a.day}: ${a.events.toLocaleString()} events`}
                  />
                  <div className="mt-1 truncate text-center text-[9px] text-gray-400">{a.day.slice(5)}</div>
                </div>
              ))}
            </div>
          )}
          {data.topActions.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5 border-t border-gray-100 pt-3">
              {data.topActions.map((t) => (
                <span key={t.action} className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 ring-1 ring-inset ring-black/5">
                  {t.action} · {t.n.toLocaleString()}
                </span>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Zone breakdown */}
      <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-3 text-sm font-semibold text-gray-900">Where the players are</div>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <th className="px-5 py-2 font-medium">Zone</th>
              <th className="px-5 py-2 font-medium">Schools</th>
              <th className="px-5 py-2 font-medium">Players</th>
              <th className="px-5 py-2 font-medium">Coaches</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.zones.slice(0, visibleZones).map((z) => (
              <tr key={z.zoneId} className="hover:bg-gray-50">
                <td className="px-5 py-2 font-medium text-gray-900">{zoneNameOf(z.zoneId)}</td>
                <td className="px-5 py-2 text-gray-600">{z.schools.toLocaleString()}</td>
                <td className="px-5 py-2 text-gray-600">{z.players.toLocaleString()}</td>
                <td className="px-5 py-2 text-gray-600">{z.coaches.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-5 pb-4">
          <ShowMoreButton total={data.zones.length} shown={visibleZones} onMore={() => setVisibleZones((n) => n + 25)} className="mt-3" />
        </div>
      </section>

      {/* Roadmap (hidden while the showcase renders these as demo cards) */}
      {!demoMode && (
      <section>
        <h3 className="mb-3 text-sm font-semibold text-gray-900">Expansion roadmap</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ROADMAP.map((r) => (
            <div key={r.name} className="flex items-center gap-3 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50/60 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-200/70 text-gray-400">
                <Trophy className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-gray-700">{r.name}</div>
                <div className="text-xs text-gray-400">{r.sport} · {r.level} · not launched</div>
              </div>
              <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-gray-300" aria-hidden="true" />
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-gray-400">
          The same portal runs any sport at school or club level — new leagues launch on this shared platform when a federation signs on.
        </p>
      </section>
      )}
    </div>
  )
}
