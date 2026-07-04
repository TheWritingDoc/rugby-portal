import { useMemo, useState } from 'react'
import { ChevronRight, Search, Users, Shield, Award, UserCheck, Eye } from 'lucide-react'
import { CoachAvatar } from './CoachCard'

type StaffRole = 'Coach' | 'Referee' | 'SchoolAdmin'

const AGE_ORDER = ['U14', 'U15', 'U16', 'U17', 'U19']
const PAGE = 10
// Small schools open fully — nothing to hunt for. Big schools start collapsed
// so the page is a tidy folder list instead of an endless scroll.
const AUTO_EXPAND_LIMIT = 15

// One tidy, collapsible "folder" view of everyone at a school. Shared by the
// EPHSRU and Zone Coordinator drill-downs so the union sees the same
// organisation everywhere: staff first, then one folder per team.
export default function SchoolPeopleBrowser({
  schoolId,
  players,
  coaches,
  referees,
  admins,
  onViewPlayer,
  onViewStaff,
}: {
  schoolId: string
  players: any[]
  coaches: any[]
  referees: any[]
  admins: any[]
  onViewPlayer: (p: any) => void
  onViewStaff: (person: any, role: StaffRole) => void
}) {
  const sid = String(schoolId)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [shown, setShown] = useState<Record<string, number>>({})

  const q = query.trim().toLowerCase()
  const matches = (x: any) =>
    !q || `${x.data?.name || x.name || ''} ${x.data?.surname || x.surname || ''} ${x.data?.email || x.email || ''}`.toLowerCase().includes(q)
  const ofSchool = (x: any) => String(x.data?.schoolId || x.schoolId || '') === sid

  const sPlayers = useMemo(() => players.filter(ofSchool), [players, sid])
  const sCoaches = useMemo(() => coaches.filter(ofSchool), [coaches, sid])
  const sReferees = useMemo(() => referees.filter((r) => String(r.data?.schoolId || '') === sid), [referees, sid])
  const sAdmins = useMemo(
    () => admins.filter((a) => (a.role === 'SchoolAdmin' || a.data?.role === 'SchoolAdmin') && ofSchool(a)),
    [admins, sid]
  )

  const teamOf = (x: any) => {
    const t = String(x.data?.team || x.data?.ageGroup || '')
    return AGE_ORDER.includes(t) ? t : ''
  }
  const groups = useMemo(() => {
    const present = new Set<string>()
    for (const p of sPlayers) { const t = teamOf(p); if (t) present.add(t) }
    for (const c of sCoaches) { const t = teamOf(c); if (t) present.add(t) }
    return AGE_ORDER.filter((g) => present.has(g))
  }, [sPlayers, sCoaches])

  const autoExpand = sPlayers.length <= AUTO_EXPAND_LIMIT
  const isOpen = (key: string) => (q ? true : open[key] ?? autoExpand)
  const toggle = (key: string) => setOpen((prev) => ({ ...prev, [key]: !isOpen(key) }))
  const shownFor = (key: string) => shown[key] ?? PAGE
  const showMore = (key: string) => setShown((prev) => ({ ...prev, [key]: shownFor(key) + 25 }))

  const initialsOf = (x: any) => `${(x.data?.name?.[0] || x.name?.[0] || '')}${(x.data?.surname?.[0] || x.surname?.[0] || '')}`
  const nameOf = (x: any) => `${x.data?.name || x.name || ''} ${x.data?.surname || x.surname || ''}`.trim()

  const StaffChip = ({ person, role, tint, text }: { person: any; role: StaffRole; tint: string; text: string }) => (
    <button
      type="button"
      onClick={() => onViewStaff(person, role)}
      className={`flex items-center gap-2.5 rounded-lg border p-2.5 text-left transition-colors ${tint}`}
      title={`View ${role} profile`}
    >
      {role === 'Coach' ? (
        <CoachAvatar coach={person} size="sm" />
      ) : (
        <div className={`h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${text}`}>{initialsOf(person)}</div>
      )}
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-gray-900">{nameOf(person)}</div>
        <div className="truncate text-[11px] text-gray-500">
          {role === 'Coach'
            ? person.data?.qualifications || person.qualifications || 'Coach'
            : role === 'Referee'
              ? person.qualifications || person.data?.refereeLevel || 'Referee'
              : person.data?.email || person.email || ''}
        </div>
      </div>
      <Eye size={13} className="ml-auto shrink-0 text-gray-400" aria-hidden="true" />
    </button>
  )

  const Roster = ({ list, sectionKey }: { list: any[]; sectionKey: string }) => {
    const visible = list.slice(0, shownFor(sectionKey))
    return (
      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-gray-500">Player</th>
              <th className="px-4 py-2 text-left font-medium text-gray-500 hidden sm:table-cell">Position</th>
              <th className="px-4 py-2 text-left font-medium text-gray-500">Status</th>
              <th className="px-4 py-2 text-right font-medium text-gray-500">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visible.map((p) => {
              const status = String(p.data?.status || 'approved').toLowerCase()
              return (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium text-gray-900">{nameOf(p)}</td>
                  <td className="px-4 py-2 text-gray-600 hidden sm:table-cell">{p.data?.position || '—'}</td>
                  <td className="px-4 py-2">
                    <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${
                      status === 'pending' ? 'bg-amber-100 text-amber-800' : status === 'rejected' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                    }`}>{status}</span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => onViewPlayer(p)} className="rounded-md bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-600 transition-colors hover:bg-indigo-100 hover:text-indigo-900">View</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {list.length > visible.length && (
          <button
            type="button"
            onClick={() => showMore(sectionKey)}
            className="w-full border-t bg-gray-50 px-4 py-2.5 text-center text-xs font-medium text-gray-600 hover:bg-gray-100"
          >
            Show more ({list.length - visible.length} remaining)
          </button>
        )}
      </div>
    )
  }

  const Section = ({ sectionKey, icon: Icon, iconColor, title, meta, children, count }: any) => {
    if (count === 0) return null
    const openNow = isOpen(sectionKey)
    return (
      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <button type="button" onClick={() => toggle(sectionKey)} className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-gray-50">
          <Icon className={`h-5 w-5 shrink-0 ${iconColor}`} aria-hidden="true" />
          <span className="font-semibold text-gray-900">{title}</span>
          <span className="text-xs text-gray-500">{meta}</span>
          <ChevronRight className={`ml-auto h-4 w-4 shrink-0 text-gray-400 transition-transform ${openNow ? 'rotate-90' : ''}`} aria-hidden="true" />
        </button>
        {openNow && <div className="space-y-4 border-t px-5 py-4">{children}</div>}
      </div>
    )
  }

  const teamlessCoaches = sCoaches.filter((c) => !teamOf(c)).filter(matches)
  const fAdmins = sAdmins.filter(matches)
  const fReferees = sReferees.filter(matches)
  const staffCount = fAdmins.length + fReferees.length + teamlessCoaches.length
  const unassignedPlayers = sPlayers.filter((p) => !teamOf(p)).filter(matches)

  return (
    <div className="space-y-3" data-testid="school-people-browser">
      {/* Search + summary */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <input
            type="text"
            placeholder="Find a person in this school..."
            aria-label="Find a person in this school"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-4 text-sm"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
          <span><b className="text-gray-900">{sAdmins.length}</b> admins</span>
          <span><b className="text-gray-900">{sCoaches.length}</b> coaches</span>
          <span><b className="text-gray-900">{sReferees.length}</b> referees</span>
          <span><b className="text-gray-900">{sPlayers.length}</b> players</span>
        </div>
      </div>

      {/* Staff & officials */}
      <Section
        sectionKey="staff"
        icon={Shield}
        iconColor="text-blue-600"
        title="Staff & Officials"
        meta={`${fAdmins.length} admins • ${fReferees.length} referees${teamlessCoaches.length ? ` • ${teamlessCoaches.length} coaches without a team` : ''}`}
        count={staffCount}
      >
        {fAdmins.length > 0 && (
          <div>
            <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">School Admins</h4>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
              {fAdmins.map((a) => <StaffChip key={a.id} person={a} role="SchoolAdmin" tint="bg-blue-50 border-blue-100 hover:bg-blue-100" text="bg-blue-200 text-blue-700" />)}
            </div>
          </div>
        )}
        {fReferees.length > 0 && (
          <div>
            <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">Referees</h4>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
              {fReferees.map((r) => <StaffChip key={r.id} person={r} role="Referee" tint="bg-amber-50 border-amber-100 hover:bg-amber-100" text="bg-amber-200 text-amber-700" />)}
            </div>
          </div>
        )}
        {teamlessCoaches.length > 0 && (
          <div>
            <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">Coaches without a team</h4>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
              {teamlessCoaches.map((c) => <StaffChip key={c.id} person={c} role="Coach" tint="bg-green-50 border-green-100 hover:bg-green-100" text="bg-green-200 text-green-700" />)}
            </div>
          </div>
        )}
      </Section>

      {/* One folder per team — coaches listed once, roster listed once */}
      {groups.map((g) => {
        const gCoaches = sCoaches.filter((c) => teamOf(c) === g).filter(matches)
        const gPlayers = sPlayers.filter((p) => teamOf(p) === g).filter(matches)
        if (q && gCoaches.length === 0 && gPlayers.length === 0) return null
        return (
          <Section
            key={g}
            sectionKey={g}
            icon={Users}
            iconColor="text-indigo-600"
            title={`${g} Team`}
            meta={`${gCoaches.length} coach${gCoaches.length === 1 ? '' : 'es'} • ${gPlayers.length} player${gPlayers.length === 1 ? '' : 's'}`}
            count={gCoaches.length + gPlayers.length}
          >
            {gCoaches.length > 0 && (
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
                {gCoaches.map((c) => <StaffChip key={c.id} person={c} role="Coach" tint="bg-green-50 border-green-100 hover:bg-green-100" text="bg-green-200 text-green-700" />)}
              </div>
            )}
            {gPlayers.length > 0 ? <Roster list={gPlayers} sectionKey={g} /> : <div className="text-sm italic text-gray-400">No players in this team yet.</div>}
          </Section>
        )
      })}

      {/* Players not yet placed in a team */}
      <Section
        sectionKey="unassigned"
        icon={UserCheck}
        iconColor="text-gray-500"
        title="Players without a team"
        meta={`${unassignedPlayers.length} player${unassignedPlayers.length === 1 ? '' : 's'}`}
        count={unassignedPlayers.length}
      >
        <Roster list={unassignedPlayers} sectionKey="unassigned" />
      </Section>

      {q && staffCount === 0 && unassignedPlayers.length === 0 && groups.every((g) => sPlayers.filter((p) => teamOf(p) === g).filter(matches).length === 0 && sCoaches.filter((c) => teamOf(c) === g).filter(matches).length === 0) && (
        <div className="rounded-xl border-2 border-dashed bg-gray-50 py-10 text-center text-sm text-gray-500">Nobody in this school matches “{query}”.</div>
      )}
    </div>
  )
}
