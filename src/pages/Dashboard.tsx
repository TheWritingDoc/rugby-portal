import { useEffect, useMemo, useRef, useState } from 'react'
import { ZoneSelect, SchoolSelect } from '../components/Dropdowns'
import { getEntities, updateEntity, getProposals, addProposal, setProposalStatus, deleteProposal } from '../utils/db'
import { fetchList, safePost, safePut, postJson, putJson, fetchOne, postJsonPath, getJsonPath } from '../utils/api'
import { emitPlayersLoaded, emitPlayersUpdated, emitListReady, emitRowAdded } from '../utils/events'
import { normalizeRow } from '../utils/normalize'
import { AGE_GROUPS, POSITIONS, RELATIONSHIPS } from '../utils/constants'
import { ensureSession, getToken } from '../utils/auth'
import { API_ORIGIN, apiUrl } from '../utils/apiBase'
import { LayoutGrid, List as ListIcon, Users, User, Heart, Shield, Activity, FileText, ChevronDown, MoreVertical, School, Mail, Phone, MapPin, Calendar, CreditCard, AlertCircle, X, UserCheck, Crown, Search } from 'lucide-react'
import { isEmail, isPhoneZA, isIdNumber } from '../utils/validation'
import SearchBar from '../components/SearchBar'
import { trackUserAction, trackPerformance, trackError, measurePerformance, trackApiCall } from '../utils/metrics'
import { notifySuccess, notifyError, notifyWarning, notifyInfo } from '../utils/notify'
import PlayerHistoryPanel from '../components/PlayerHistoryPanel'
import PlayerApprovalsPanel from '../components/PlayerApprovalsPanel'
import PlayerMigrationPanel from '../components/PlayerMigrationPanel'
import PlayerCard from '../components/PlayerCard'
import SchoolCard from '../components/SchoolCard'
import RefereeCard from '../components/RefereeCard'
import { coachPhotoUrl } from '../components/CoachCard'
import ExportMenu from '../components/ExportMenu'
import SchoolAdminDashboard from '../components/dashboards/SchoolAdminDashboard'
import ZoneCoordinatorDashboard from '../components/dashboards/ZoneCoordinatorDashboard'
import EPHSRUAdminDashboard from '../components/dashboards/EPHSRUAdminDashboard'
import SeasonFilter from '../components/SeasonFilter'
import Messages from '../components/Messages'
import MyPhoto from '../components/MyPhoto'
import ShowMoreButton from '../components/ShowMoreButton'
import { currentSeasonYear, filterBySeason, seasonsPresent, archivedCount, seasonYearOf } from '../utils/season'
import { schoolNameOf, zoneNameOf } from '../utils/labels'
import { resizeImage } from '../utils/image'
import { zones as STATIC_ZONES } from '../data/zones'

type Role = 'Player' | 'Referee' | 'Coach' | 'SchoolAdmin' | 'ZoneCoordinator' | 'EPHSRUAdmin'

const COACH_PLAYERS_VIEW_KEY = 'ui:coach:players:view'
const SCHOOLADMIN_TEAMS_VIEW_KEY = 'ui:schooladmin:teams:view'

export default function Dashboard({ role }: { role: Role }) {
  const [zone, setZone] = useState<string>()
  const [school, setSchool] = useState<string>()
  const [schoolNameTop, setSchoolNameTop] = useState<string>('')
  const [players, setPlayers] = useState<any[]>([])
  const [coaches, setCoaches] = useState<any[]>([])
  const [referees, setReferees] = useState<any[]>([])
  const [schoolsList, setSchoolsList] = useState<any[]>([])
  const [admins, setAdmins] = useState<any[]>([])
  const filteredPlayers = useMemo(() => filterBy(role, players, zone, school), [role, players, zone, school])
  // Admin dashboards default to the current season; older registrations stay reachable via the archive selector
  const [seasonYear, setSeasonYear] = useState<number | null>(currentSeasonYear())
  const seasonPlayers = useMemo(() => filterBySeason(filteredPlayers, seasonYear), [filteredPlayers, seasonYear])
  const playerSeasons = useMemo(() => seasonsPresent(filteredPlayers), [filteredPlayers])
  const archivedPlayers = useMemo(() => archivedCount(filteredPlayers, currentSeasonYear()), [filteredPlayers])
  // Coaches follow the same season selection: past-season coaches are archived, not deleted
  const seasonCoaches = useMemo(() => filterBySeason(filterBy(role, coaches, zone, school), seasonYear), [role, coaches, zone, school, seasonYear])
  const filteredCoaches = useMemo(() => filterBy(role, coaches, zone, school), [role, coaches, zone, school])
  const filteredReferees = useMemo(() => filterBy(role, referees, zone, school), [role, referees, zone, school])
  const filteredSchools = useMemo(() => filterBy(role, schoolsList, zone, school), [role, schoolsList, zone, school])
  const filteredAdmins = useMemo(() => filterBy(role, admins, zone, school), [role, admins, zone, school])
  // Union of the fixed EP zones and any zone ids present in live data (e.g. test data)
  const zonesList = useMemo(() => {
    const names = new Map(STATIC_ZONES.map((z) => [String(z.id), z.name]))
    const ids = new Set<string>(STATIC_ZONES.map((z) => String(z.id)))
    for (const x of [...schoolsList, ...admins, ...coaches, ...players, ...referees]) {
      const z = String(x?.data?.zoneId ?? x?.zoneId ?? '')
      if (z) ids.add(z)
    }
    return Array.from(ids).map((id) => ({ id, name: names.get(id) || `Zone ${id}`, data: { name: names.get(id) || `Zone ${id}` } }))
  }, [schoolsList, admins, coaches, players, referees])
  useEffect(() => {
    const z = localStorage.getItem('auth:zoneId') || undefined
    const s = localStorage.getItem('auth:schoolId') || undefined
    if (z) setZone(z)
    if (s) setSchool(s)
  }, [])
  useEffect(() => { load() }, [zone, school])
  useEffect(() => { load() }, [role])
  useEffect(() => {
    (async () => {
      const filters: any = { zoneId: zone, schoolId: school }
      const list = await fetchList('schools', filters)
      const s = Array.isArray(list) && list.length ? list[0] : null
      const authSchoolId = typeof window !== 'undefined' ? (localStorage.getItem('auth:schoolId') || '') : ''
      // Fall back to the humanized catalog name, never the raw slug
      setSchoolNameTop(String(s?.data?.name || s?.name || (authSchoolId ? schoolNameOf(authSchoolId) : '') || ''))
    })()
  }, [zone, school])
  useEffect(() => {
    function onInsert(e: any) {
      const d = e?.detail
      if (d?.entity === 'players' && d?.row) {
        const nr = normalizeRow(d.row)
        setPlayers((prev) => {
          const exists = prev.some((p) => p.id === nr.id)
          if (exists) return prev
          return [nr, ...prev]
        })
      }
    }
    window.addEventListener('app:list:insert', onInsert as any)
    return () => { window.removeEventListener('app:list:insert', onInsert as any) }
  }, [])
  useEffect(() => {
    // Restore a session token if none exists (e.g. page reload); never re-issues with a different role
    if (role && !getToken()) {
      ensureSession()
    }
  }, [role, zone, school])
  async function load() {
    const startTime = Date.now()
    trackUserAction('dashboard_load', 'load_data', { role, zone, school })
    
    try {
      const filters: any = { zoneId: zone, schoolId: school }
      if (role === 'Player') {
        const p = await measurePerformance('fetch_players', () => fetchList('players'))
        setPlayers(p)
        try { 
          window.dispatchEvent(new CustomEvent('data:players:loaded', { detail: { count: p.length } })) 
        } catch {}
        trackPerformance('dashboard_load', Date.now() - startTime, true, { role: 'Player', playerCount: p.length })
        return
      }
      
      let p = await measurePerformance('fetch_players', () => fetchList('players', filters)) as any[]
      if (!Array.isArray(p) || p.length === 0) {
        p = await measurePerformance('fetch_players_fallback', () => fetchList('players')) as any[]
      }
      const [c, r, s, a] = await Promise.all([
        measurePerformance('fetch_coaches', () => fetchList('coaches', filters)),
        measurePerformance('fetch_referees', () => fetchList('referees', filters)),
        measurePerformance('fetch_schools', () => fetchList('schools', filters)),
        measurePerformance('fetch_admins', () => fetchList('admins', filters)),
      ])
      
      setPlayers(p)
      emitPlayersLoaded(p.length)
      try { 
        requestAnimationFrame(() => emitListReady('players', p.length)) 
      } catch { 
        setTimeout(() => emitListReady('players', p.length), 50) 
      }
      setCoaches(c)
      setReferees(r)
      setSchoolsList(s)
      setAdmins(a)
      
      trackPerformance('dashboard_load', Date.now() - startTime, true, {
        role,
        playerCount: p.length,
        coachCount: c.length,
        refereeCount: r.length,
        schoolCount: s.length,
        adminCount: a.length
      })
    } catch (error: any) {
      trackError(error.message, 'dashboard_load', error.stack, { role, zone, school })
      throw error
    }
  }
  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        {(role === 'Coach' || role === 'SchoolAdmin' || role === 'Player') && schoolNameTop ? (
          <h1 className="text-xl font-bold">{schoolNameTop}</h1>
        ) : <span />}
        <MyPhoto />
      </div>
      <Messages />
      {role === 'Player' ? (
        <PlayerView players={players} />
      ) : role === 'Coach' ? (
        <CoachView role={role} players={players} onRefresh={async () => {
          const filters: any = { zoneId: zone, schoolId: school }
          const p = await fetchList('players', filters)
          setPlayers(p); emitPlayersLoaded(p.length); try { requestAnimationFrame(() => emitListReady('players', p.length)) } catch { setTimeout(() => emitListReady('players', p.length), 50) }
        }} />
      ) : role === 'Referee' ? (
        <RefereeDashboard referees={filteredReferees} />
      ) : role === 'EPHSRUAdmin' ? (
        <>
          <SeasonFilter seasons={playerSeasons} value={seasonYear} onChange={setSeasonYear} archivedCount={archivedPlayers} />
          <EPHSRUAdminDashboard
            zones={zonesList}
            schools={filteredSchools}
            players={seasonPlayers}
            coaches={seasonCoaches}
            referees={referees}
            admins={filteredAdmins}
            onRefresh={load}
          />
        </>
      ) : role === 'ZoneCoordinator' ? (
        <>
          <SeasonFilter seasons={playerSeasons} value={seasonYear} onChange={setSeasonYear} archivedCount={archivedPlayers} />
          <ZoneCoordinatorDashboard
            zone={zone}
            schools={filteredSchools}
            players={seasonPlayers}
            coaches={seasonCoaches}
            referees={filteredReferees}
            admins={filteredAdmins}
            onRefresh={load}
          />
        </>
      ) : role === 'SchoolAdmin' ? (
        <>
          <SeasonFilter seasons={playerSeasons} value={seasonYear} onChange={setSeasonYear} archivedCount={archivedPlayers} />
          <SchoolAdminDashboard
            zone={zone}
            school={school}
            schoolNameTop={schoolNameTop}
            players={seasonPlayers}
            coaches={seasonCoaches}
            referees={filteredReferees}
            admins={filteredAdmins}
            onRefresh={load}
          />
        </>
      ) : null}
    </section>
  )
}

function filterBy(role: Role, items: any[], zone?: string, school?: string) {
  let list = items
  if (zone) list = list.filter((x) => String(x.data.zoneId ?? '') === zone)
  if (school) list = list.filter((x) => String(x.data.schoolId ?? '') === school)
  if (role === 'SchoolAdmin') {
    if (school) return list.filter((x) => String(x.data.schoolId ?? '') === school)
    return list.filter((x) => x.data.schoolId)
  }
  if (role === 'Coach') {
    return list.filter((x) => x.data.schoolId)
  }
  if (role === 'ZoneCoordinator') {
    return list.filter((x) => x.data.zoneId)
  }
  return list
}

function PlayerView({ players }: { players: any[] }) {
  const email = typeof window !== 'undefined' ? localStorage.getItem('auth:email') || '' : ''
  const me = players.find((p) => String(p.data?.email || p.email || '') === email)
  if (!me) {
    return <div className="rounded-lg border bg-white p-3 text-sm text-gray-600">No player record found</div>
  }
  
  // Check for pending proposals for this player
  const proposals = getProposals('Player').filter((pp) => {
    const pid = me.id
    const sid = me.data?.serverId
    const pem = String(me.email ?? me.data?.email ?? '')
    return (pid === pp.recordId) || (sid === pp.recordId) || (pem && pem === String(pp.recordId))
  })
  
  const pendingFields = proposals.filter(pp => pp.status === 'pending').map(pp => pp.field)
  const approvedFields = proposals.filter(pp => pp.status === 'approved').map(pp => pp.field)
  const rejectedFields = proposals.filter(pp => pp.status === 'rejected').map(pp => pp.field)
  
  // Show notification for recently approved/rejected fields
  useEffect(() => {
    if (approvedFields.length > 0 || rejectedFields.length > 0) {
      if (approvedFields.length > 0) {
        notifySuccess(`Profile updates reviewed — approved: ${approvedFields.join(', ')}`)
      }
      if (rejectedFields.length > 0) {
        notifyWarning(`Profile updates reviewed — rejected: ${rejectedFields.join(', ')}`)
      }

      // Clear the proposals after showing notification
      setTimeout(() => {
        proposals.forEach(pp => {
          if (pp.status === 'approved' || pp.status === 'rejected') {
            deleteProposal('Player', pp.id)
          }
        })
      }, 1000)
    }
  }, [approvedFields.length, rejectedFields.length])
  
  const d0 = { 
    ...(me.data || {}),
    name: me.name !== undefined ? me.name : (me.data?.name || ''),
    surname: me.surname !== undefined ? me.surname : (me.data?.surname || ''),
    email: me.email !== undefined ? me.email : (me.data?.email || ''),
    schoolId: me.schoolId !== undefined ? me.schoolId : (me.data?.schoolId || ''),
    zoneId: me.zoneId !== undefined ? me.zoneId : (me.data?.zoneId || ''),
    ageGroup: me.ageGroup !== undefined ? me.ageGroup : (me.data?.ageGroup || ''),
    phone: me.contactNumber !== undefined ? me.contactNumber : (me.data?.phone || ''),
    idNumber: me.idNumber !== undefined ? me.idNumber : (me.data?.idNumber || ''),
  }
  const [data1, setData1] = useState<any>(d0)
  const initialPhoto = typeof d0.photoUrl === 'string' && d0.photoUrl.startsWith('/uploads') ? `${API_ORIGIN}${d0.photoUrl}` : (d0.photoUrl || '')
  const [photo, setPhoto] = useState<string>(initialPhoto)
  const [refreshKey, setRefreshKey] = useState<number>(0)
  const locked: string[] = Array.isArray(data1.lockedFields) ? data1.lockedFields : []
  const [preview, setPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  
  useEffect(() => {
    const next = {
      ...(me.data || {}),
      name: me.name !== undefined ? me.name : (me.data?.name || ''),
      surname: me.surname !== undefined ? me.surname : (me.data?.surname || ''),
      email: me.email !== undefined ? me.email : (me.data?.email || ''),
      schoolId: me.schoolId !== undefined ? me.schoolId : (me.data?.schoolId || ''),
      zoneId: me.zoneId !== undefined ? me.zoneId : (me.data?.zoneId || ''),
      ageGroup: me.ageGroup !== undefined ? me.ageGroup : (me.data?.ageGroup || ''),
      phone: me.contactNumber !== undefined ? me.contactNumber : (me.data?.phone || ''),
      idNumber: me.idNumber !== undefined ? me.idNumber : (me.data?.idNumber || ''),
    }
    setData1(next)
    const ph = typeof next.photoUrl === 'string' && next.photoUrl.startsWith('/uploads') ? `${API_ORIGIN}${next.photoUrl}` : (next.photoUrl || '')
    setPhoto(ph)
    const id = me.id || me.data?.serverId || ''
    if (id) {
      ;(async () => {
        setLoading(true)
        const deadline = Date.now() + 30000
        while (Date.now() < deadline) {
          const one = await fetchOne('players', id)
          if (one?.data && ((one.data.name && one.data.name !== next.name) || (one.data.surname && one.data.surname !== next.surname))) {
            const upd = one.data
            setData1(upd)
            const ph2 = typeof upd.photoUrl === 'string' && upd.photoUrl.startsWith('/uploads') ? `${API_ORIGIN}${upd.photoUrl}` : (upd.photoUrl || '')
            setPhoto(ph2)
            setLoading(false)
            try {
              requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                  window.dispatchEvent(new CustomEvent('player:self:ready', { detail: { id } }))
                })
              })
            } catch {}
            return
          }
          await new Promise((r) => setTimeout(r, 700))
        }
        setLoading(false)
      })()
    } else {
      setLoading(false)
    }
  }, [me])
  useEffect(() => {
    const id = me.id || me.data?.serverId || ''
    const h = async () => {
      if (!id) return
      setLoading(true)
      const one = await fetchOne('players', id)
      if (one?.data) {
        setData1(one.data)
        const ph2 = typeof one.data.photoUrl === 'string' && one.data.photoUrl.startsWith('/uploads') ? `${API_ORIGIN}${one.data.photoUrl}` : (one.data.photoUrl || '')
        setPhoto(ph2)
      }
      setLoading(false)
      try {
        setTimeout(() => {
          requestAnimationFrame(() => {
            window.dispatchEvent(new CustomEvent('player:self:ready', { detail: { id } }))
          })
        }, 25)
      } catch {}
    }
    window.addEventListener('data:players:loaded', h as any)
    window.addEventListener('data:players:updated', h as any)
    return () => {
      window.removeEventListener('data:players:loaded', h as any)
      window.removeEventListener('data:players:updated', h as any)
    }
  }, [me])
  const [showSelfMigrate, setShowSelfMigrate] = useState(false)
  const [showApprovals, setShowApprovals] = useState(false)
  const [actionsOpen, setActionsOpen] = useState(false)
  const [showMissingInfo, setShowMissingInfo] = useState(false)
  const pid = (me.id || me.data?.serverId || '') as string
  return (
    <div className="space-y-6" data-testid="player-self-panel">
      {loading && <div className="text-sm text-gray-600">Loading player data...</div>}
      
      {/* Profile Header Card */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-700 via-blue-600 to-blue-500 text-white shadow-xl">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48Y2lyY2xlIGN4PSIzMCIgY3k9IjMwIiByPSIyIi8+PC9nPjwvZz48L3N2Zz4=')] opacity-30"></div>
        <div className="relative px-8 py-8">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-6">
              <div className="relative rounded-full ring-4 ring-white/20 bg-white p-1 shadow-sm">
                {photo ? (
                  <img src={photo} alt="Profile" className="h-24 w-24 rounded-full object-cover" onDoubleClick={() => setPreview(photo)} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                ) : (
                  <div className="flex h-24 w-24 items-center justify-center rounded-full bg-blue-50 text-3xl font-bold text-blue-600">
                    {(data1.name?.[0] || '')}{(data1.surname?.[0] || '')}
                  </div>
                )}
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <User className="h-5 w-5 text-blue-100" />
                  <span className="text-blue-100 text-sm font-medium uppercase tracking-wider">Player Profile</span>
                </div>
                <h1 className="text-3xl font-bold mb-2">{data1.name} {data1.surname}</h1>
                <div className="flex flex-wrap items-center gap-4 text-blue-100">
                  <span className="flex items-center gap-1">
                    <School className="h-4 w-4" />
                    {schoolNameOf(data1.schoolId) || 'No School Assigned'}
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    {zoneNameOf(data1.zoneId) || 'No Zone'}
                  </span>
                </div>
              </div>
            </div>
            
            <div className="flex flex-col items-end gap-3">
               <div className="relative">
                 <button
                   className="flex items-center gap-2 rounded-lg bg-white/15 px-4 py-2 text-sm font-medium text-white ring-1 ring-white/30 backdrop-blur-sm transition hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                   type="button"
                   onClick={() => setActionsOpen((v) => !v)}
                 >
                   <MoreVertical size={16} />
                   <span>Actions</span>
                   <ChevronDown size={16} className={`transition-transform ${actionsOpen ? 'rotate-180' : ''}`} />
                 </button>
                 {actionsOpen && (
                   <div className="absolute right-0 z-50 mt-2 w-64 origin-top-right rounded-lg border border-gray-100 bg-white p-1 text-gray-700 shadow-lg ring-1 ring-black/5">
                     <button className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-gray-50" type="button" onClick={() => { setShowMissingInfo((v) => !v); setActionsOpen(false) }}>
                       <FileText size={16} className="text-gray-400" /> Complete My Profile
                     </button>
                     <button className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-gray-50" type="button" onClick={() => { setShowSelfMigrate((v) => !v); setActionsOpen(false) }}>
                       <School size={16} className="text-gray-400" /> Request School Transfer
                     </button>
                     <button className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-gray-50" type="button" onClick={() => { setShowApprovals((v) => !v); setActionsOpen(false) }}>
                       <UserCheck size={16} className="text-gray-400" /> My Approval Requests
                     </button>
                   </div>
                 )}
               </div>
               <div className="flex flex-wrap justify-end gap-2">
                 {data1.ageGroup && (
                  <span className="inline-flex items-center rounded-full bg-white/20 px-3 py-1 text-sm font-medium text-white backdrop-blur-sm ring-1 ring-white/30">
                    {data1.ageGroup}
                  </span>
                 )}
                 {data1.position && (
                  <span className="inline-flex items-center rounded-full bg-white/20 px-3 py-1 text-sm font-medium text-white backdrop-blur-sm ring-1 ring-white/30">
                    {data1.position}
                  </span>
                 )}
                 {data1.jerseyNumber && (
                  <span className="inline-flex items-center rounded-full bg-white/20 px-3 py-1 text-sm font-medium text-white backdrop-blur-sm ring-1 ring-white/30">
                    #{data1.jerseyNumber}
                  </span>
                 )}
               </div>
            </div>
          </div>
        </div>
      </div>

      {showMissingInfo && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="text-lg font-semibold text-gray-900">Fill Missing Information</div>
            <button className="rounded-md border p-1 text-gray-500 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40" type="button" onClick={() => setShowMissingInfo(false)} aria-label="Close">
              <X size={16} />
            </button>
          </div>
          {pendingFields.length > 0 && (
            <div className="mb-4 rounded-md border border-yellow-200 bg-yellow-50 p-4">
              <div className="flex items-center gap-2">
                <AlertCircle className="text-yellow-600" size={20} />
                <span className="text-sm font-semibold text-yellow-800">Pending Review</span>
              </div>
              <div className="mt-1 text-sm text-yellow-700">
                {pendingFields.length} field{pendingFields.length > 1 ? 's' : ''} awaiting approval: {pendingFields.join(', ')}
              </div>
            </div>
          )}
          <PlayerMissingForm
            id={me.id}
            serverId={data1.serverId || pid || ''}
            data={data1}
            lockedFields={locked}
            pendingFields={pendingFields}
            onUpdated={(nextData, nextLocked) => {
              const merged = { ...nextData, lockedFields: nextLocked }
              updateEntity('Player', me.id, merged)
              setData1(merged)
            }}
          />
        </div>
      )}

      {showSelfMigrate && pid && (
        <PlayerMigrationPanel playerId={pid} onDone={() => {}} onClose={() => setShowSelfMigrate(false)} />
      )}
      {pid && showApprovals && (
        <PlayerApprovalsPanel entityId={pid} title="My Approval Requests" onClose={() => setShowApprovals(false)} />
      )}
      
      {/* Content Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Personal Info Card */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-4 py-3">
             <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
               <User size={18} className="text-brand" /> Personal Information
             </div>
          </div>
          <div className="grid grid-cols-1 gap-1 p-4 sm:grid-cols-2">
            <Info label="ID/Passport" value={data1.idNumber} icon={CreditCard} />
            <Info label="Date of Birth" value={data1.dob} icon={Calendar} />
            <Info label="Gender" value={data1.gender} icon={Users} />
            <Info label="Mobile" value={data1.phone} icon={Phone} />
            <Info label="Email" value={data1.email} icon={Mail} />
            <Info label="Address" value={data1.address} icon={MapPin} />
          </div>
        </div>

        {/* Rugby Info Card */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm h-fit">
          <div className="border-b border-gray-100 px-4 py-3">
             <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
               <Activity size={18} className="text-brand" /> Rugby Profile
             </div>
          </div>
          <div className="grid grid-cols-1 gap-1 p-4 sm:grid-cols-2">
            <Info label="Age Group" value={data1.ageGroup} icon={Users} />
            <Info label="Position" value={data1.position} icon={Activity} />
            <Info label="Jersey" value={data1.jerseyNumber ? `#${data1.jerseyNumber}` : ''} icon={LayoutGrid} />
            <Info label="Prev. Team" value={data1.previousSchool} icon={School} />
          </div>
        </div>

        {/* Medical Info Card */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
           <div className="border-b border-gray-100 px-4 py-3">
             <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
               <Heart size={18} className="text-brand" /> Medical Information
             </div>
          </div>
          <div className="grid grid-cols-1 gap-1 p-4 sm:grid-cols-2">
            <Info label="Medical Aid" value={data1.medicalAidName} icon={Heart} />
            <Info label="Number" value={data1.medicalAidNumber} icon={FileText} />
            <Info label="Allergies" value={data1.allergies} icon={AlertCircle} />
            <Info label="Chronic" value={data1.chronicConditions} icon={Activity} />
            <div className="sm:col-span-2">
               <Info label="Emergency Notes" value={data1.medicalNotes} icon={FileText} />
            </div>
          </div>
        </div>

        {/* Guardian Info Card */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
           <div className="border-b border-gray-100 px-4 py-3">
             <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
               <Shield size={18} className="text-brand" /> Guardian Information
             </div>
          </div>
          <div className="grid grid-cols-1 gap-1 p-4 sm:grid-cols-2">
            <Info label="Name" value={data1.parentName} icon={User} />
            <Info label="Surname" value={data1.parentSurname} icon={User} />
            <Info label="Relation" value={data1.relationship} icon={Users} />
            <Info label="Contact" value={data1.parentContact} icon={Phone} />
            <Info label="Email" value={data1.parentEmail} icon={Mail} />
            <Info label="Signature" value={data1.consentSignature ? 'Signed' : 'Pending'} icon={FileText} />
          </div>
        </div>
      </div>

      {/* Notifications Card */}
      <PlayerNotifications />

      {/* Documents Card */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-4 py-3">
             <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
               <FileText size={18} className="text-brand" /> Documents
             </div>
        </div>
        <div className="p-4">
          <PlayerDocumentUpload ownerId={data1.serverId || pid || ''} onUploaded={() => setRefreshKey((k) => k + 1)} />
          <PlayerDocuments ownerId={data1.serverId || pid || ''} refreshKey={refreshKey} />
        </div>
      </div>

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setPreview(null)}>
          <img src={preview} alt="Preview" className="max-h-[95vh] max-w-[98vw] rounded-md shadow-lg" style={{ transform: 'scale(2)' }} />
        </div>
      )}
    </div>
  )
}

function PlayerNotifications() {
  const [items, setItems] = useState<any[]>([])
  const [expanded, setExpanded] = useState(false)
  useEffect(() => {
    ;(async () => {
      const list = await getJsonPath('notifications')
      if (Array.isArray(list)) setItems(list)
    })()
  }, [])
  if (items.length === 0) return null
  const unread = items.filter((n) => !n.readAt).length
  const shown = expanded ? items : items.slice(0, 5)
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm" data-testid="player-notifications">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <AlertCircle size={18} className="text-brand" /> Notifications
          {unread > 0 && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-red-300">{unread} new</span>
          )}
        </div>
        {unread > 0 && (
          <button
            className="text-xs font-medium text-brand hover:underline"
            type="button"
            onClick={async () => {
              const res = await postJsonPath('notifications/read-all', {})
              if (res.ok) setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt || Date.now() })))
            }}
          >
            Mark all read
          </button>
        )}
      </div>
      <div className="divide-y px-4">
        {shown.map((n) => (
          <div key={n.id} className="py-2.5 text-sm">
            <div className="flex items-center gap-2">
              {!n.readAt && <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" aria-hidden="true" />}
              <span className="font-semibold text-gray-900">{n.subject}</span>
              <span className="ml-auto shrink-0 text-xs text-gray-400">{n.createdAt ? new Date(Number(n.createdAt)).toLocaleString() : ''}</span>
            </div>
            {n.message && <div className="mt-0.5 text-gray-600">{n.message}</div>}
          </div>
        ))}
      </div>
      {items.length > 5 && (
        <button className="w-full border-t px-4 py-2 text-center text-xs font-medium text-gray-500 hover:bg-gray-50" type="button" onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Show fewer' : `Show all ${items.length}`}
        </button>
      )}
    </div>
  )
}

function PlayerDocumentUpload({ ownerId, onUploaded }: { ownerId: string; onUploaded: () => void }) {
  const [busy, setBusy] = useState(false)
  if (!ownerId) return null
  return (
    <label className="flex flex-wrap items-center gap-3 rounded-md border border-dashed border-gray-300 bg-gray-50 p-3 text-sm">
      <span className="font-medium text-gray-700">Upload a document</span>
      <span className="text-xs text-gray-500">ID copy, birth certificate, consent form… (PDF or image)</span>
      <input
        type="file"
        accept="application/pdf,image/*"
        disabled={busy}
        className="text-sm"
        onChange={async (e) => {
          const file = e.target.files?.[0]
          if (!file) return
          setBusy(true)
          try {
            const fd = new FormData()
            fd.append('file', file)
            const t = getToken() || localStorage.getItem('auth:token') || ''
            const res = await fetch(apiUrl('/upload'), { method: 'POST', headers: { ...(t ? { Authorization: `Bearer ${t}` } : {}) }, body: fd })
            if (!res.ok) { notifyError('Upload failed. Please try again.'); return }
            const data = await res.json()
            const url = String(data.url || '')
            const ok = await safePost('documents', { ownerType: 'players', ownerId, fileName: file.name, fileUrl: url })
            if (ok) {
              notifySuccess('Document uploaded — your school will review it.')
              onUploaded()
            } else {
              notifyError('Could not save the document record.')
            }
          } catch {
            notifyError('Upload failed. Please try again.')
          } finally {
            setBusy(false)
            try { e.target.value = '' } catch {}
          }
        }}
      />
    </label>
  )
}

function PlayerDocuments({ ownerId, refreshKey }: { ownerId: string; refreshKey?: number }) {
  const [docs, setDocs] = useState<any[]>([])
  useEffect(() => { load() }, [ownerId, refreshKey])
  async function load() {
    if (!ownerId) { setDocs([]); return }
    const list = await fetchList('documents', { ownerType: 'players', ownerId })
    setDocs(list)
  }
  if (!ownerId) return <div className="text-sm text-gray-500">No documents</div>
  return (
    <div className="mt-2 divide-y">
      {docs.map((d) => {
        const url = typeof d.fileUrl === 'string' && d.fileUrl.startsWith('/uploads') ? `${API_ORIGIN}${d.fileUrl}` : d.fileUrl
        return (
          <div key={d.id} className="py-2 text-sm">
            <a href={url} className="text-brand underline" target="_blank" rel="noreferrer">{d.fileName}</a>
            <span className="ml-2 text-gray-600">({d.status})</span>
          </div>
        )
      })}
      {docs.length === 0 && <div className="py-2 text-sm text-gray-500">No documents</div>}
    </div>
  )
}

function CoachView({ role, players, onRefresh }: { role: Role; players: any[]; onRefresh: () => void }) {
  const schoolId = localStorage.getItem('auth:schoolId') || ''
  const zoneId = localStorage.getItem('auth:zoneId') || ''
  const [schoolName, setSchoolName] = useState('')
  const [schoolLogo, setSchoolLogo] = useState('')
  const [coachName, setCoachName] = useState('')
  const [coachSelf, setCoachSelf] = useState<any | null>(null)
  const [assignedTeam, setAssignedTeam] = useState('')
  const [query, setQuery] = useState('')
  const [history, setHistory] = useState<string[]>(() => {
    try { const v = localStorage.getItem('coach:search:history'); return v ? JSON.parse(v) : [] } catch { return [] }
  })
  const [showHistory, setShowHistory] = useState(false)
  const [pendingOnly, setPendingOnly] = useState(false)
  const [currentSeasonOnly, setCurrentSeasonOnly] = useState(true)
  const [teamFilter, setTeamFilter] = useState<string>('')
  const [ageFilter, setAgeFilter] = useState<string>('')
  // Search results page in steps of 24 — consistent with every other roster
  const [searchVisible, setSearchVisible] = useState(24)
  useEffect(() => { setSearchVisible(24) }, [query, pendingOnly, teamFilter, ageFilter, currentSeasonOnly])
  const [activeTab, setActiveTab] = useState<'players' | 'pending'>('players')
  const [pendingPlayers, setPendingPlayers] = useState<any[]>([])
  const [pendingApprovals, setPendingApprovals] = useState<any[]>([])
  const [pendingMigrationRequests, setPendingMigrationRequests] = useState<any[]>([])
  const [migrationOutcomes, setMigrationOutcomes] = useState<any[]>([])
  const [migrationDetailOpen, setMigrationDetailOpen] = useState(false)
  const [migrationDetailLoading, setMigrationDetailLoading] = useState(false)
  const [migrationDetail, setMigrationDetail] = useState<any | null>(null)
  const [migrationDetailErr, setMigrationDetailErr] = useState('')
  const [loadingPending, setLoadingPending] = useState(false)
  const [hierView, setHierView] = useState(true)
  const [resultsView, setResultsView] = useState<'cards' | 'list'>(() => {
    try {
      return localStorage.getItem(COACH_PLAYERS_VIEW_KEY) === 'list' ? 'list' : 'cards'
    } catch {
      return 'cards'
    }
  })
  const [resultsSwitching, setResultsSwitching] = useState(false)
  const pendingPreloadedRef = useRef(false)
  const [searchFilters, setSearchFilters] = useState({
    team: '',
    ageGroup: '',
    position: '',
    status: 'all' as 'pending' | 'approved' | 'rejected' | 'all'
  })
  useEffect(() => {
    try { localStorage.setItem(COACH_PLAYERS_VIEW_KEY, resultsView) } catch {}
  }, [resultsView])
  useEffect(() => {
    const email = (localStorage.getItem('auth:email') || '').trim().toLowerCase()
    ;(async () => {
      try {
        const schools = await fetchList('schools', { zoneId, schoolId })
        const s = Array.isArray(schools) && schools.length ? schools[0] : null
        setSchoolName(String(s?.data?.name || s?.name || schoolId || ''))
        setSchoolLogo(String(s?.data?.logoUrl || ''))
        const coaches = await fetchList('coaches', { zoneId, schoolId })
        let c = Array.isArray(coaches) ? coaches.find((x: any) => String(x.data?.email || x.email || '').trim().toLowerCase() === email) : null
        if (!c && Array.isArray(coaches) && coaches.length) c = coaches[0]
        const nm = `${String(c?.data?.name || c?.name || '')} ${String(c?.data?.surname || c?.surname || '')}`.trim()
        setCoachName(nm || (email || ''))
        setCoachSelf(c || null)
        setAssignedTeam(c?.data?.team || '')
      } catch (e) {
        console.error('Failed to load coach details', e)
      }
    })()
  }, [zoneId, schoolId])
  
  async function loadPending() {
    if (loadingPendingGuard.current) return
    loadingPendingGuard.current = true
    setLoadingPending(true)
    const startTime = Date.now()
    trackUserAction('load_pending_players', 'approval_tab')
    
    try {
      const response = await fetch(apiUrl('/pending'), {
        headers: { Authorization: `Bearer ${getToken()}` }
      })
      
      trackApiCall('/api/pending', 'GET', startTime, {
        statusCode: response.status,
        metadata: { source: 'approval_tab' }
      })
      
      if (response.ok) {
        const data = await response.json()
        setPendingPlayers((data?.registrations || []).map(normalizeRow))
        setPendingApprovals((data?.profileUpdates || []).map((r: any) => ({
          id: r.id,
          entityId: r.entityId,
          status: r.status,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
          requestedChanges: Array.isArray(r.requestedChanges) ? r.requestedChanges : [],
          requester: r.requester || null,
          approver: r.approver || null,
          approverNotes: r.approverNotes || '',
          player: r.player || null
        })))
        setPendingMigrationRequests(Array.isArray(data?.migrationRequests) ? data.migrationRequests : [])
        setMigrationOutcomes(Array.isArray(data?.migrationOutcomes) ? data.migrationOutcomes : [])
        trackPerformance('load_pending_players', Date.now() - startTime, true, {
          playerCount: (data?.registrations || []).length
        })
      } else {
        trackError(`Failed to load pending players: ${response.status}`, 'load_pending_players')
      }
    } catch (error: any) {
      trackError(error.message, 'load_pending_players', error.stack)
      console.error('Failed to load pending players:', error)
    } finally {
      setLoadingPending(false)
      loadingPendingGuard.current = false
    }
  }
  
  // Approve player
  async function approvePlayer(playerId: string) {
    const startTime = Date.now()
    trackUserAction('approve_player', 'pending_tab', { playerId })
    
    try {
      const response = await fetch(apiUrl(`/players/${playerId}/approve`), {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}` 
        }
      })
      
      trackApiCall(`/api/players/${playerId}/approve`, 'POST', startTime, {
        statusCode: response.status,
        metadata: { playerId, action: 'approve' }
      })
      
      if (response.ok) {
        setPendingPlayers(prev => prev.filter(p => p.id !== playerId))
        await onRefresh() // Refresh main player list
        trackPerformance('approve_player', Date.now() - startTime, true, { playerId })
      } else {
        trackError(`Failed to approve player: ${response.status}`, 'approve_player', undefined, { playerId })
      }
    } catch (error: any) {
      trackError(error.message, 'approve_player', error.stack, { playerId })
      console.error('Failed to approve player:', error)
    }
  }
  
  // Reject player
  async function rejectPlayer(playerId: string, reason?: string) {
    try {
      const response = await fetch(apiUrl(`/players/${playerId}/reject`), {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}` 
        },
        body: JSON.stringify({ reason: reason || 'Rejected by coach' })
      })
      if (response.ok) {
        setPendingPlayers(prev => prev.filter(p => p.id !== playerId))
        await onRefresh() // Refresh main player list
      }
    } catch (error) {
      console.error('Failed to reject player:', error)
    }
  }
  
  // Bulk approve players
  async function bulkApprovePlayers(playerIds: string[]) {
    try {
      const response = await fetch(apiUrl('/players/bulk-approve'), {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}` 
        },
        body: JSON.stringify({ playerIds })
      })
      if (response.ok) {
        const result = await response.json()
        setPendingPlayers(prev => prev.filter(p => !playerIds.includes(p.id)))
        await onRefresh() // Refresh main player list
        return result
      }
    } catch (error) {
      console.error('Failed to bulk approve players:', error)
    }
  }
  
  // Load pending players when tab is switched
  useEffect(() => {
    if (activeTab === 'pending') {
      try {
        const reviewKey = `notify:coach:lastReviewAt:${schoolId}`
        localStorage.setItem(reviewKey, String(Date.now()))
      } catch {}
      loadPending()
    }
  }, [activeTab])
  // Preload pending players in background so banner can show on Players tab
  useEffect(() => {
    if (!pendingPreloadedRef.current && activeTab !== 'pending') {
      pendingPreloadedRef.current = true
      loadPending()
    }
  }, [activeTab])
  
  const list = useMemo(() => {
    return players.filter((p) => {
      const ps = String(p.schoolId ?? p.data?.schoolId ?? '')
      const pz = String(p.zoneId ?? p.data?.zoneId ?? '')
      if (schoolId && ps !== schoolId) return false
      if (zoneId && pz !== zoneId) return false
      
      // Filter by assigned team if coach has one
      if (assignedTeam) {
        const pTeam = p.data?.team || p.data?.ageGroup || ''
        if (pTeam !== assignedTeam) return false
      }
      
      return true
    })
  }, [players, schoolId, zoneId, assignedTeam])

  const suggestions = useMemo(() => {
    if (query.length < 2) return []
    const names = list.map((p) => `${p.data?.name || ''} ${p.data?.surname || ''}`.trim()).filter((x) => !!x)
    const teams = list.map((p) => String(p.data?.team || p.data?.ageGroup || '')).filter((x) => !!x)
    const base = Array.from(new Set<string>([...names, ...teams]))
    const q = query.toLowerCase()
    return base.filter((x) => x.toLowerCase().includes(q)).slice(0, 6)
  }, [query, list])

  const localPending = useMemo(() => {
    const raw = getProposals('Player')
    return raw.filter((pp) => {
      if (pp.status !== 'pending') return false
      return list.some((p) => {
        const dn = p.data || {}
        const pid = p.id
        const sid = dn.serverId
        const pem = String(p.email ?? dn.email ?? '')
        return (pid === pp.recordId) || (sid === pp.recordId) || (pem && pem === String(pp.recordId))
      })
    })
  }, [list])

  async function approveLocalProposal(pp: any, p: any) {
    if (!p) return
    const rowZone = String(p.zoneId ?? p.data?.zoneId ?? '')
    const rowSchool = String(p.schoolId ?? p.data?.schoolId ?? '')
    await ensureSession()
    const res = await putJson('players', p.id || '', { [pp.field]: pp.value, schoolId: rowSchool, zoneId: rowZone })
    if (res) {
      setProposalStatus('Player', pp.id, 'approved')
      deleteProposal('Player', pp.id)
      try { window.dispatchEvent(new CustomEvent('data:players:updated', { detail: { id: p.id || '' } })) } catch {}
      await onRefresh()
      return
    }
    notifyError('Could not apply the change to the server. It is kept as pending.')
  }

  async function rejectLocalProposal(pp: any) {
    setProposalStatus('Player', pp.id, 'rejected')
    deleteProposal('Player', pp.id)
    await onRefresh()
  }
  async function decideApproval(approvalId: string, status: 'approved' | 'rejected') {
    const startTime = Date.now()
    trackUserAction('decide_profile_update', 'pending_tab', { approvalId, status })
    try {
      const response = await fetch(apiUrl(`/approvals/${approvalId}/decision`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`
        },
        body: JSON.stringify({ status })
      })
      trackApiCall(`/api/approvals/${approvalId}/decision`, 'POST', startTime, {
        statusCode: response.status,
        metadata: { approvalId, status }
      })
      if (response.ok) {
        setPendingApprovals(prev => prev.filter(a => a.id !== approvalId))
        await onRefresh()
        trackPerformance('decide_profile_update', Date.now() - startTime, true, { approvalId, status })
      } else {
        trackError(`Failed to decide approval: ${response.status}`, 'decide_profile_update', undefined, { approvalId, status })
      }
    } catch (error: any) {
      trackError(error.message, 'decide_profile_update', error.stack, { approvalId, status })
    }
  }

  async function decideMigrationRequest(requestId: string, status: 'accepted' | 'rejected') {
    const startTime = Date.now()
    trackUserAction('decide_migration_request', 'pending_tab', { requestId, status })
    try {
      const response = await fetch(apiUrl(`/migration-requests/${requestId}/decision`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`
        },
        body: JSON.stringify({ status })
      })
      trackApiCall(`/api/migration-requests/${requestId}/decision`, 'POST', startTime, {
        statusCode: response.status,
        metadata: { requestId, status }
      })
      if (response.ok) {
        setPendingMigrationRequests((prev) => prev.filter((r: any) => String(r?.id || '') !== requestId))
        await onRefresh()
        trackPerformance('decide_migration_request', Date.now() - startTime, true, { requestId, status })
      } else {
        trackError(`Failed to decide migration request: ${response.status}`, 'decide_migration_request', undefined, { requestId, status })
      }
    } catch (error: any) {
      trackError(error.message, 'decide_migration_request', error.stack, { requestId, status })
    }
  }

  async function openMigrationDetail(requestId: string) {
    setMigrationDetailOpen(true)
    setMigrationDetailLoading(true)
    setMigrationDetailErr('')
    setMigrationDetail(null)
    try {
      const response = await fetch(apiUrl(`/migration-requests/${encodeURIComponent(requestId)}`), {
        headers: { Authorization: `Bearer ${getToken()}` }
      })
      if (!response.ok) {
        setMigrationDetailErr(`Failed to load request (${response.status})`)
        return
      }
      const data = await response.json()
      setMigrationDetail(data)
    } catch (e: any) {
      setMigrationDetailErr(String(e?.message || 'Failed to load request'))
    } finally {
      setMigrationDetailLoading(false)
    }
  }
  const pendingApprovalPlayerIds = useMemo(() => {
    const s = new Set<string>()
    for (const a of pendingApprovals) {
      const pid = String(a?.player?.id || a?.entityId || '')
      if (pid) s.add(pid)
    }
    return s
  }, [pendingApprovals])
  function isPending(p: any) {
    const pid = p.id
    const status = String(p.data?.status ?? p.status ?? '').toLowerCase()
    const dn = p.data || {}
    const sid = dn.serverId
    const pem = String(p.email ?? dn.email ?? '')
    const local = localPending.some((pp) => (pid === pp.recordId) || (sid === pp.recordId) || (pem && pem === String(pp.recordId)))
    return status === 'pending' || pendingApprovalPlayerIds.has(String(pid || '')) || local
  }
  const recent = (() => {
    try {
      const v = localStorage.getItem('recent:player')
      const o = v ? JSON.parse(v) : null
      if (o && Number(Date.now() - (o.ts || 0)) < 15000) return o
    } catch {}
    return null
  })()
  function applyFilters(p: any) {
    const dn = p.data || {}

    // Default to this season's registrations; archived seasons are opt-in
    if (currentSeasonOnly && seasonYearOf(p) !== currentSeasonYear()) return false

    // Apply pending filter
    if (pendingOnly) {
      if (!isPending(p)) return false
    }

    const q = query.trim().toLowerCase()
    if (q) {
      const hay = [
        String(dn.name ?? p.name ?? ''),
        String(dn.surname ?? p.surname ?? ''),
        String(dn.team ?? ''),
        String(dn.ageGroup ?? ''),
        String(dn.position ?? ''),
        String(dn.idNumber ?? p.idNumber ?? ''),
        String(dn.email ?? p.email ?? ''),
        String(dn.contactNumber ?? p.contactNumber ?? '')
      ].join(' ').toLowerCase().replace(/\s+/g, ' ').trim()
      const tokens = q.split(/\s+/).filter(Boolean)
      for (const t of tokens) {
        if (!hay.includes(t)) return false
      }
    }
    
    // Apply search filters
    if (searchFilters.team) {
      const t = String(dn.team || dn.ageGroup || '')
      if (t !== searchFilters.team) return false
    }
    if (searchFilters.ageGroup) {
      const ag = String(dn.ageGroup || '')
      if (ag !== searchFilters.ageGroup) return false
    }
    if (searchFilters.position) {
      const pos = String(dn.position || '')
      if (pos !== searchFilters.position) return false
    }
    if (searchFilters.status !== 'all') {
      const status = dn.status || 'approved'
      if (status !== searchFilters.status) return false
    }
    
    return true
  }
  const listFiltered = list.filter(applyFilters)
  const listFilteredUniqueCount = useMemo(() => {
    const seen = new Set<string>()
    for (const p of listFiltered) {
      const dn = p?.data || {}
      const email = String(dn.email ?? p?.email ?? '').trim().toLowerCase()
      const idNumber = String(dn.idNumber ?? p?.idNumber ?? '').trim().toLowerCase()
      const serverId = String(dn.serverId ?? '').trim().toLowerCase()
      const name = String(dn.name ?? p?.name ?? '').trim().toLowerCase()
      const surname = String(dn.surname ?? p?.surname ?? '').trim().toLowerCase()
      const dob = String(dn.dateOfBirth ?? p?.dateOfBirth ?? dn.dob ?? '').trim().toLowerCase()
      const composite = [name, surname, dob].filter(Boolean).join('|')
      const key = email
        ? `email:${email}`
        : idNumber
          ? `id:${idNumber}`
          : serverId
            ? `sid:${serverId}`
            : composite
              ? `n:${composite}`
              : `rid:${String(p?.id || '')}`
      seen.add(key)
    }
    return seen.size
  }, [listFiltered])
  const listSorted = [...list].sort((a, b) => {
    const ap = isPending(a)
    const bp = isPending(b)
    const ar = recent && ((a.id === recent.id) || (`${a.data?.name || ''} ${a.data?.surname || ''}`.trim() === `${recent.name} ${recent.surname}`.trim()))
    const br = recent && ((b.id === recent.id) || (`${b.data?.name || ''} ${b.data?.surname || ''}`.trim() === `${recent.name} ${recent.surname}`.trim()))
    if (ar && !br) return -2
    if (!ar && br) return 2
    if (ap && !bp) return -1
    if (!ap && bp) return 1
    return 0
  })
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', surname: '', idNumber: '', phone: '', email: '', dob: '', gender: '', ageGroup: '', position: '', photoUrl: '' })
  const [selected, setSelected] = useState<any | null>(null)
  const [selectedMode, setSelectedMode] = useState<'edit' | 'docs'>('edit')
  const [folderStats, setFolderStats] = useState<{ year: number; count: number } | null>(null)
  const [showMigration, setShowMigration] = useState(false)
  const noticeRef = useRef<string | null>(null)
  const loadingPendingGuard = useRef(false)
  const pendingSummary = useMemo(() => {
    const registrationsCount = pendingPlayers.length
    const updatesCount = pendingApprovals.length + localPending.length
    const migrationCount = pendingMigrationRequests.length
    const total = registrationsCount + updatesCount + migrationCount
    const newestUpdateTs = Math.max(0, ...pendingApprovals.map((a: any) => Number(a?.updatedAt || a?.createdAt || 0)))
    const newestRegTs = Math.max(0, ...pendingPlayers.map((pp: any) => Number(pp?.ts || pp?.updatedAt || pp?.createdAt || 0)))
    const newestLocalTs = Math.max(0, ...localPending.map((pp) => Number(pp.ts || 0)))
    const newestMigTs = Math.max(0, ...pendingMigrationRequests.map((r: any) => Number(r?.requestedAt || 0)))
    const newestTs = Math.max(newestUpdateTs, newestRegTs, newestLocalTs, newestMigTs)
    return { registrationsCount, updatesCount, migrationCount, total, newestTs }
  }, [localPending, pendingApprovals, pendingMigrationRequests, pendingPlayers])
  const migrationOutcomeSummary = useMemo(() => {
    const count = migrationOutcomes.length
    const newestTs = Math.max(0, ...migrationOutcomes.map((r: any) => Number(r?.decidedAt || 0)))
    return { count, newestTs }
  }, [migrationOutcomes])
  const bannerMsg = useMemo(() => {
    try {
      const ackKey = `notify:coach:ackts:${schoolId}`
      const ackTs = parseInt(localStorage.getItem(ackKey) || '0') || 0
      const migAckKey = `notify:coach:ackts:migrationOutcomes:${schoolId}`
      const migAckTs = parseInt(localStorage.getItem(migAckKey) || '0') || 0
      const reviewKey = `notify:coach:lastReviewAt:${schoolId}`
      const lastReviewAt = parseInt(localStorage.getItem(reviewKey) || '0') || 0
      const now = Date.now()

      if (activeTab === 'pending') return ''
      const hasPending = pendingSummary.total > 0
      const hasOutcomes = migrationOutcomeSummary.count > 0
      if (!hasPending && !hasOutcomes) return ''
      const pendingIsNew = pendingSummary.newestTs > 0 && pendingSummary.newestTs > ackTs
      const outcomesAreNew = migrationOutcomeSummary.newestTs > 0 && migrationOutcomeSummary.newestTs > migAckTs
      if (!pendingIsNew && !outcomesAreNew) return ''

      const overDay = lastReviewAt > 0
        ? (now - lastReviewAt) > 24 * 60 * 60 * 1000
        : (pendingSummary.newestTs > 0 ? (now - pendingSummary.newestTs) > 24 * 60 * 60 * 1000 : false)
      if (!overDay) return ''

      if (!pendingIsNew && outcomesAreNew) {
        return `You have ${migrationOutcomeSummary.count} migration update${migrationOutcomeSummary.count > 1 ? 's' : ''} (accepted/rejected)`
      }

      const parts = [] as string[]
      if (pendingSummary.registrationsCount > 0) parts.push(`${pendingSummary.registrationsCount} registrations`)
      if (pendingSummary.updatesCount > 0) parts.push(`${pendingSummary.updatesCount} profile updates`)
      if (pendingSummary.migrationCount > 0) parts.push(`${pendingSummary.migrationCount} migrations`)
      const suffix = parts.length ? ` (${parts.join(', ')})` : ''
      return `You have ${pendingSummary.total} pending review${pendingSummary.total > 1 ? 's' : ''}${suffix}`
    } catch {}
    return ''
  }, [activeTab, migrationOutcomeSummary.count, migrationOutcomeSummary.newestTs, pendingSummary.newestTs, pendingSummary.registrationsCount, pendingSummary.total, pendingSummary.updatesCount, schoolId])
  async function addPlayer() {
    if (!form.name.trim() || !form.surname.trim()) return notifyError('Name and surname are required')
    if (form.email && !isEmail(form.email)) return notifyError('Invalid email address')
    if (form.phone && !isPhoneZA(form.phone)) return notifyError('Invalid phone number (+27 or 0XXXXXXXXX)')
    if (form.idNumber && !isIdNumber(form.idNumber)) return notifyError('Invalid ID/Passport number')
    const payload: any = {
      name: form.name,
      surname: form.surname,
      idNumber: form.idNumber,
      contactNumber: form.phone,
      phone: form.phone,
      email: form.email,
      dob: form.dob,
      dateOfBirth: form.dob,
      gender: form.gender,
      position: form.position,
      photoUrl: form.photoUrl,
      team: form.ageGroup || null,
      schoolId,
      zoneId: localStorage.getItem('auth:zoneId') || zoneId || '',
      ageGroup: form.ageGroup || null,
      dataOrigin: 'coach_add'
    }
    await ensureSession()
    const res = await postJson('players', payload)
    if (res) {
      try {
        const recent = { id: res.id || '', name: payload.name, surname: payload.surname, ts: Date.now() }
        localStorage.setItem('recent:player', JSON.stringify(recent))
      } catch {}
      emitRowAdded('players', res)
      setForm({ name: '', surname: '', idNumber: '', phone: '', email: '', dob: '', gender: '', ageGroup: '', position: '', photoUrl: '' })
      setAdding(false)
      notifySuccess(`${payload.name} ${payload.surname} added to your squad`)
      await onRefresh()
    }
    else {
      // Fallback: add locally so coach can see immediately
      notifyWarning('Network or permission issue; the player was added locally and will sync when online.')
    }
  }
  return (
    <div>
      {selected ? (
        <CoachPlayerDetail player={selected} mode={selectedMode} onBack={() => setSelected(null)} onUpdated={onRefresh} />
      ) : (
      <div>
      {/* Coach Header Card */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-700 via-blue-600 to-blue-500 text-white shadow-xl mb-6">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48Y2lyY2xlIGN4PSIzMCIgY3k9IjMwIiByPSIyIi8+PC9nPjwvZz48L3N2Zz4=')] opacity-30"></div>
        <div className="relative px-8 py-8">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-6">
              <div className="relative shrink-0 rounded-full bg-white/10 p-1 ring-4 ring-white/20 shadow-sm">
                {coachPhotoUrl(coachSelf) ? (
                  <img
                    src={coachPhotoUrl(coachSelf)}
                    alt="Coach"
                    className="h-24 w-24 rounded-full object-cover"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                  />
                ) : (
                  <div className="flex h-24 w-24 items-center justify-center rounded-full bg-white/10 text-3xl font-bold text-white">
                    {(coachName || 'C').split(' ').map((w) => w.charAt(0)).join('').slice(0, 2).toUpperCase()}
                  </div>
                )}
              </div>
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <UserCheck className="h-6 w-6 text-blue-100" />
                  <span className="text-blue-100 text-sm font-medium uppercase tracking-wider">
                    Team Management {assignedTeam ? `• ${assignedTeam}` : ''}
                  </span>
                </div>
                <h1 className="text-3xl font-bold mb-2">Welcome, {coachName || 'Coach'}</h1>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-blue-100">
                  <span className="flex items-center gap-1">
                    <School className="h-4 w-4" />
                    {schoolName || 'No School'}
                  </span>
                  {coachSelf?.data?.position && (
                    <span className="inline-flex items-center rounded-full bg-white/15 px-3 py-0.5 text-sm font-medium ring-1 ring-white/30">
                      {coachSelf.data.position}
                    </span>
                  )}
                  {coachSelf?.data?.qualifications && coachSelf.data.qualifications !== 'None' && (
                    <span className="inline-flex items-center rounded-full bg-white/15 px-3 py-0.5 text-sm font-medium ring-1 ring-white/30">
                      {coachSelf.data.qualifications}
                    </span>
                  )}
                  {coachSelf?.data?.experience && (
                    <span className="inline-flex items-center rounded-full bg-white/15 px-3 py-0.5 text-sm font-medium ring-1 ring-white/30">
                      {coachSelf.data.experience} yrs experience
                    </span>
                  )}
                  {(coachSelf?.data?.email || '') && (
                    <span className="hidden items-center gap-1 text-sm sm:inline-flex">
                      <Mail className="h-4 w-4" />
                      {coachSelf.data.email}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-4xl font-bold">{listFilteredUniqueCount}</div>
              <div className="text-blue-100 text-sm">Active Players</div>
            </div>
          </div>
        </div>
      </div>

      {bannerMsg && (
        <div className="mb-6 rounded-md bg-blue-50 p-4 border border-blue-100 text-sm text-blue-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-blue-600" />
            <span className="font-medium">{bannerMsg}</span>
          </div>
          <div className="flex gap-2">
            <button className="rounded-md bg-blue-600 px-3 py-1.5 text-white hover:bg-blue-700 transition-colors" onClick={() => {
              setActiveTab('pending')
            }}>Review Pending</button>
            <button className="rounded-md border bg-white px-3 py-1.5 hover:bg-gray-50 text-gray-700" onClick={() => {
              const first = pendingApprovals[0]
              const pid = String(first?.player?.id || first?.entityId || '')
              const p = pid ? list.find((x) => x.id === pid || x.data?.serverId === pid) : null
              if (p) { setSelected(p); setSelectedMode('edit') }
              else setActiveTab('pending')
            }}>Open First Update</button>
            <button className="rounded-md border bg-white px-3 py-1.5 hover:bg-gray-50 text-gray-700" onClick={() => {
              try {
                const ackKey = `notify:coach:ackts:${schoolId}`
                localStorage.setItem(ackKey, String(pendingSummary.newestTs || Date.now()))
                const migAckKey = `notify:coach:ackts:migrationOutcomes:${schoolId}`
                localStorage.setItem(migAckKey, String(migrationOutcomeSummary.newestTs || Date.now()))
                const reviewKey = `notify:coach:lastReviewAt:${schoolId}`
                localStorage.setItem(reviewKey, String(Date.now()))
              } catch {}
            }}>Dismiss</button>
          </div>
        </div>
      )}
      
      {/* Tab Navigation */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex space-x-8">
          <button 
            className={`flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === 'players' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
            onClick={() => setActiveTab('players')}
          >
            <Users className="h-4 w-4" />
            Players ({hierView && folderStats ? folderStats.count : listFilteredUniqueCount})
          </button>
          {(role === 'Coach' || role === 'SchoolAdmin' || role === 'EPHSRUAdmin') && (
            <button
              className={`flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === 'pending' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
              onClick={() => setActiveTab('pending')}
            >
              <AlertCircle className="h-4 w-4" />
              Pending ({pendingSummary.total})
            </button>
          )}
        </nav>
      </div>
      
      {/* Pending Players Tab */}
      {activeTab === 'pending' && (
        <div className="space-y-3">
          <div className="text-sm font-semibold">Registrations ({pendingSummary.registrationsCount})</div>
          <PendingPlayersView 
            players={pendingPlayers}
            loading={loadingPending}
            onApprove={approvePlayer}
            onReject={rejectPlayer}
            onBulkApprove={bulkApprovePlayers}
            onRefresh={loadPending}
          />
          <div className="text-sm font-semibold">Profile Updates ({pendingSummary.updatesCount})</div>
          <div className="rounded-lg border bg-white p-3 shadow">
            <div className="divide-y">
              {pendingApprovals.map((a: any) => {
                const pid = String(a?.player?.id || a?.entityId || '')
                const p = pid ? list.find((x) => x.id === pid || x.data?.serverId === pid) : null
                const dn = p?.data || a?.player || {}
                const firstChange = Array.isArray(a?.requestedChanges) ? a.requestedChanges[0] : null
                const field = String(firstChange?.field || '')
                const updated = firstChange?.updated
                return (
                  <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <div>
                      <span className="font-semibold">{dn.name} {dn.surname}</span>
                      <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-red-300">Needs Review</span>
                      {field && <span className="ml-2 text-gray-700">• {field}{typeof updated !== 'undefined' ? ` → ${String(updated)}` : ''}</span>}
                    </div>
                    <div className="flex gap-2">
                      <button className="rounded-md border px-2 py-1" onClick={() => { if (p) { setSelected(p); setSelectedMode('edit') } }}>Open</button>
                      <button className="rounded-md bg-brand px-2 py-1 text-white" onClick={() => decideApproval(String(a.id), 'approved')}>Approve</button>
                      <button className="rounded-md border px-2 py-1" onClick={() => decideApproval(String(a.id), 'rejected')}>Reject</button>
                    </div>
                  </div>
                )
              })}
              {localPending.map((pp) => {
                const p = list.find((x) => {
                  const dn = x.data || {}
                  const pid = x.id
                  const sid = dn.serverId
                  const pem = String(x.email ?? dn.email ?? '')
                  return (pid === pp.recordId) || (sid === pp.recordId) || (pem && pem === String(pp.recordId))
                })
                const dn = p?.data || {}
                return (
                  <div key={pp.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <div>
                      <span className="font-semibold">{dn.name} {dn.surname}</span>
                      <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700 ring-1 ring-gray-300">Offline</span>
                      <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-red-300">Needs Review</span>
                      <span className="ml-2 text-gray-700">• {pp.field} → {String(pp.value)}</span>
                    </div>
                    <div className="flex gap-2">
                      <button className="rounded-md border px-2 py-1" onClick={() => { if (p) { setSelected(p); setSelectedMode('edit') } }}>Open</button>
                      <button className="rounded-md bg-brand px-2 py-1 text-white" onClick={() => approveLocalProposal(pp, p)}>Approve</button>
                      <button className="rounded-md border px-2 py-1" onClick={() => rejectLocalProposal(pp)}>Reject</button>
                    </div>
                  </div>
                )
              })}
              {pendingApprovals.length === 0 && localPending.length === 0 && (
                <div className="py-2 text-sm text-gray-600">No profile update requests</div>
              )}
            </div>
          </div>

          <div className="text-sm font-semibold">Migration Requests ({pendingSummary.migrationCount})</div>
          <div className="rounded-lg border bg-white p-3 shadow">
            <div className="divide-y">
              {pendingMigrationRequests.map((r: any) => {
                const p = r?.player || {}
                const fromSchoolId = String(r?.fromSchoolId || '')
                const toSchoolId = String(r?.toSchoolId || '')
                return (
                  <div key={String(r?.id || '')} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <div>
                      <span className="font-semibold">{String(p.name || '')} {String(p.surname || '')}</span>
                      <span className="ml-2 text-gray-700">• {schoolNameOf(fromSchoolId)} → {schoolNameOf(toSchoolId)}</span>
                      <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-red-300">Needs Review</span>
                    </div>
                    <div className="flex gap-2">
                      <button className="rounded-md border px-2 py-1" onClick={() => openMigrationDetail(String(r.id))}>View</button>
                      <button className="rounded-md bg-brand px-2 py-1 text-white" onClick={() => decideMigrationRequest(String(r.id), 'accepted')}>Accept</button>
                      <button className="rounded-md border px-2 py-1" onClick={() => decideMigrationRequest(String(r.id), 'rejected')}>Reject</button>
                    </div>
                  </div>
                )
              })}
              {pendingMigrationRequests.length === 0 && (
                <div className="py-2 text-sm text-gray-600">No migration requests</div>
              )}
            </div>
          </div>

          <div className="text-sm font-semibold">Migration Outcomes ({migrationOutcomes.length})</div>
          <div className="rounded-lg border bg-white p-3 shadow">
            <div className="divide-y">
              {migrationOutcomes.map((r: any) => {
                const p = r?.player || {}
                const fromSchoolId = String(r?.fromSchoolId || '')
                const toSchoolId = String(r?.toSchoolId || '')
                const status = String(r?.status || '')
                const decidedAt = Number(r?.decidedAt || 0)
                return (
                  <div key={String(r?.id || '')} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <div>
                      <span className="font-semibold">{String(p.name || '')} {String(p.surname || '')}</span>
                      <span className="ml-2 text-gray-700">• {schoolNameOf(fromSchoolId)} → {schoolNameOf(toSchoolId)}</span>
                      <span className={status === 'accepted' ? 'ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700 ring-1 ring-green-300' : 'ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-red-300'}>
                        {status || '—'}
                      </span>
                      {decidedAt > 0 && <span className="ml-2 text-xs text-gray-600">{new Date(decidedAt).toLocaleString()}</span>}
                    </div>
                  </div>
                )
              })}
              {migrationOutcomes.length === 0 && (
                <div className="py-2 text-sm text-gray-600">No migration outcomes</div>
              )}
            </div>
          </div>
        </div>
      )}

      {migrationDetailOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Migration request details">
          <div className="w-full max-w-2xl rounded-md bg-white p-4 shadow-lg">
            <div className="flex items-center justify-between">
              <div className="text-base font-semibold">Migration Request</div>
              <button className="rounded-md border px-3 py-2 text-sm" onClick={() => setMigrationDetailOpen(false)} type="button">Close</button>
            </div>
            {migrationDetailLoading && <div className="mt-2 text-sm text-gray-600">Loading…</div>}
            {migrationDetailErr && <div className="mt-2 rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-700">{migrationDetailErr}</div>}
            {(!migrationDetailLoading && !migrationDetailErr && migrationDetail) && (
              <div className="mt-3 space-y-3">
                <div className="rounded-md bg-gray-50 p-3">
                  <div className="text-sm font-semibold">Player</div>
                  <div className="mt-2 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                    <div><span className="text-gray-600">Name:</span> <span className="font-medium">{String(migrationDetail?.player?.name || '')} {String(migrationDetail?.player?.surname || '')}</span></div>
                    <div><span className="text-gray-600">ID Number:</span> <span className="font-medium">{String(migrationDetail?.player?.idNumber || '—')}</span></div>
                    <div><span className="text-gray-600">Email:</span> <span className="font-medium">{String(migrationDetail?.player?.email || '—')}</span></div>
                    <div><span className="text-gray-600">Contact:</span> <span className="font-medium">{String(migrationDetail?.player?.contactNumber || '—')}</span></div>
                    <div><span className="text-gray-600">Gender:</span> <span className="font-medium">{String(migrationDetail?.player?.gender || '—')}</span></div>
                    <div><span className="text-gray-600">Age group:</span> <span className="font-medium">{String(migrationDetail?.player?.ageGroup || '—')}</span></div>
                  </div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-sm font-semibold">Transfer</div>
                  <div className="mt-2 text-sm text-gray-700">From <span className="font-medium">{schoolNameOf(migrationDetail?.fromSchoolId)}</span> to <span className="font-medium">{schoolNameOf(migrationDetail?.toSchoolId)}</span></div>
                  <div className="mt-1 text-sm text-gray-700">Reason: <span className="font-medium">{String(migrationDetail?.reason || '') || '—'}</span></div>
                  <div className="mt-1 text-xs text-gray-600">Requested by: {String(migrationDetail?.requesterRole || '') || '—'} {String(migrationDetail?.requesterEmail || '') || ''}</div>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <button className="rounded-md bg-brand px-3 py-2 text-sm text-white" type="button" onClick={() => { setMigrationDetailOpen(false); decideMigrationRequest(String(migrationDetail?.id || ''), 'accepted') }}>Accept</button>
                  <button className="rounded-md border px-3 py-2 text-sm" type="button" onClick={() => { setMigrationDetailOpen(false); decideMigrationRequest(String(migrationDetail?.id || ''), 'rejected') }}>Reject</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Players Tab */}
      {activeTab === 'players' && (
      <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex items-center rounded-full bg-brand/10 px-3 py-1 text-sm font-semibold text-brand ring-1 ring-brand/30 shadow-sm">
          <Users size={16} className="mr-1" />
          <span>{hierView && folderStats ? folderStats.count : listFilteredUniqueCount}</span>
        </div>
        {hierView && folderStats && (
          <div className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700 ring-1 ring-gray-300">Year: {folderStats.year}</div>
        )}
        <button className="rounded-md border px-3 py-2" onClick={() => setActiveTab('pending')}>Review</button>
        <div className="inline-flex overflow-hidden rounded-md border">
          <button
            className={`px-3 py-2 text-sm ${hierView ? 'bg-gray-100 font-semibold' : ''}`}
            onClick={() => setHierView(true)}
            type="button"
          >
            Browse
          </button>
          <button
            className={`px-3 py-2 text-sm ${!hierView ? 'bg-gray-100 font-semibold' : ''}`}
            onClick={() => setHierView(false)}
            type="button"
          >
            Search
          </button>
        </div>
        {(role === 'Coach' || role === 'SchoolAdmin' || role === 'EPHSRUAdmin') && (
          <button className={`rounded-md px-3 py-2 ${showMigration ? 'bg-blue-600 text-white' : 'border'}`} onClick={() => setShowMigration((v) => !v)}>{showMigration ? 'Close Migration' : 'Migrate Player'}</button>
        )}
        <ExportMenu players={hierView ? list : listFiltered} schoolName={schoolName} logoUrl={schoolLogo} />
        <button className="rounded-md bg-brand px-3 py-2 text-white" onClick={() => setAdding((v) => !v)}>{adding ? 'Cancel' : 'Add Player'}</button>
      </div>

      {showMigration && (
        <div className="mb-3">
          <PlayerMigrationPanel onDone={onRefresh} />
        </div>
      )}
      
      {!hierView && (
        <div className="mb-3">
          <SearchBar
            onSearch={(searchQuery, filters) => {
              const startTime = Date.now()
              setQuery(searchQuery)
              setSearchFilters(filters)
              trackUserAction('search_players', 'search_bar', searchQuery, filters)
              if (searchQuery.trim()) {
                const next = [searchQuery.trim(), ...history.filter((h) => h !== searchQuery.trim())].slice(0, 6)
                setHistory(next)
                try { localStorage.setItem('coach:search:history', JSON.stringify(next)) } catch {}
              }
              trackPerformance('search_operation', Date.now() - startTime, true, {
                query: searchQuery,
                filters
              })
            }}
            suggestions={suggestions}
            searchHistory={history}
            onClearHistory={() => {
              trackUserAction('clear_search_history', 'search_bar')
              setHistory([])
              try { localStorage.removeItem('coach:search:history') } catch {}
            }}
            placeholder="Search players by name, team, or position..."
            showFilters={true}
            filters={searchFilters}
            onFilterChange={(filters) => {
              trackUserAction('change_search_filters', 'search_bar', undefined, filters)
              setSearchFilters(filters)
            }}
          />
        </div>
      )}

      {!hierView && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-4">
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={pendingOnly} onChange={(e) => setPendingOnly(e.target.checked)} />
              Show only players needing review
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={currentSeasonOnly} onChange={(e) => setCurrentSeasonOnly(e.target.checked)} />
              Current season only ({currentSeasonYear()})
            </label>
          </div>
          <div className="inline-flex overflow-hidden rounded-md border" role="group" aria-label="Player view">
            <button
              type="button"
              aria-label="List view"
              aria-pressed={resultsView === 'list'}
              className={`inline-flex items-center gap-1 px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 ${resultsView === 'list' ? 'bg-brand text-white' : ''}`}
              onClick={() => {
                if (resultsView === 'list') return
                setResultsSwitching(true)
                setTimeout(() => { setResultsView('list'); setResultsSwitching(false) }, 120)
              }}
            >
              <ListIcon size={16} aria-hidden="true" />
              List
            </button>
            <button
              type="button"
              aria-label="Card view"
              aria-pressed={resultsView === 'cards'}
              className={`inline-flex items-center gap-1 px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 ${resultsView === 'cards' ? 'bg-brand text-white' : ''}`}
              onClick={() => {
                if (resultsView === 'cards') return
                setResultsSwitching(true)
                setTimeout(() => { setResultsView('cards'); setResultsSwitching(false) }, 120)
              }}
            >
              <LayoutGrid size={16} aria-hidden="true" />
              Cards
            </button>
          </div>
        </div>
      )}
      
      {adding && (
        <div className="mb-3 rounded-md border p-3">
          <div className="mb-3 flex items-center gap-2 border-b pb-2">
            <Users size={16} className="text-brand" />
            <span className="text-sm font-semibold text-gray-900">Register New Player</span>
            <span className="text-xs text-gray-500">— added to {schoolName || 'your school'} for the {new Date().getFullYear()} season</span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block"><span className="text-sm font-medium">Name</span><input className="mt-1 w-full rounded-md border p-2" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label className="block"><span className="text-sm font-medium">Surname</span><input className="mt-1 w-full rounded-md border p-2" value={form.surname} onChange={(e) => setForm({ ...form, surname: e.target.value })} /></label>
            <label className="block"><span className="text-sm font-medium">ID/Passport</span><input className="mt-1 w-full rounded-md border p-2" value={form.idNumber} onChange={(e) => setForm({ ...form, idNumber: e.target.value })} /></label>
            <label className="block"><span className="text-sm font-medium">Mobile</span><input className="mt-1 w-full rounded-md border p-2" placeholder="+27" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
            <label className="block sm:col-span-2"><span className="text-sm font-medium">Email</span><input type="email" className="mt-1 w-full rounded-md border p-2" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
            <label className="block"><span className="text-sm font-medium">Date of Birth</span><input type="date" className="mt-1 w-full rounded-md border p-2" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} /></label>
            <label className="block"><span className="text-sm font-medium">Gender</span>
              <select className="mt-1 w-full rounded-md border p-2" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                <option value="">Select...</option>
                <option>Male</option>
                <option>Female</option>
              </select>
            </label>
            <label className="block"><span className="text-sm font-medium">Age Group</span>
              <select className="mt-1 w-full rounded-md border p-2" value={form.ageGroup} onChange={(e) => setForm({ ...form, ageGroup: e.target.value })}>
                <option value="">Select...</option>
                {AGE_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </label>
            <label className="block"><span className="text-sm font-medium">Position</span>
              <select className="mt-1 w-full rounded-md border p-2" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })}>
                <option value="">Select...</option>
                {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <label className="block sm:col-span-2"><span className="text-sm font-medium">Profile Photo</span>
              <input
                type="file"
                accept="image/*"
                className="mt-1 w-full rounded-md border p-2"
                onChange={async (e) => {
                  const raw = e.target.files?.[0]
                  if (!raw) return
                  const file = await resizeImage(raw)
                  const fd = new FormData()
                  fd.append('file', file)
                  try {
                    const t = getToken() || localStorage.getItem('auth:token') || ''
                    const res = await fetch(apiUrl('/upload'), { method: 'POST', headers: { ...(t ? { Authorization: `Bearer ${t}` } : {}) }, body: fd })
                    if (res.ok) {
                      const data = await res.json()
                      setForm((prev: any) => ({ ...prev, photoUrl: String(data.url || '') }))
                    } else {
                      notifyError('Photo upload failed')
                    }
                  } catch {
                    notifyError('Photo upload failed')
                  }
                }}
              />
              {form.photoUrl && (
                <img
                  src={form.photoUrl.startsWith('/uploads') ? `${API_ORIGIN}${form.photoUrl}` : form.photoUrl}
                  alt="Player"
                  className="mt-2 h-14 w-14 rounded-full object-cover ring-1 ring-gray-300"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                />
              )}
            </label>
          </div>
          <div className="mt-3 text-right"><button className="rounded-md bg-brand px-3 py-2 text-white" onClick={addPlayer}>Save Player</button></div>
        </div>
      )}
      {hierView ? (
        <CoachFolderBrowser
          players={list}
          onSelect={(p) => { setSelected(p); setSelectedMode('edit') }}
          currentYearOnly={false}
          onStats={setFolderStats}
          viewMode={resultsView}
          onViewModeChange={setResultsView}
          onRefresh={onRefresh}
          exportMeta={{ schoolName, logoUrl: schoolLogo }}
        />
      ) : (
        <div className={`rounded-lg border bg-white p-3 shadow transition-opacity duration-150 ${resultsSwitching ? 'opacity-0' : 'opacity-100'}`}>
          {listFiltered.length === 0 && (
            <div className="py-2 text-sm text-gray-600">
              <div className="font-semibold">No matches</div>
              <div className="mt-1">Try clearing filters or switching view.</div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button className="rounded-md border px-2 py-1" onClick={() => { setQuery(''); setPendingOnly(false); setTeamFilter(''); setAgeFilter(''); setSearchFilters({ team: '', ageGroup: '', position: '', status: 'all' }) }}>Clear filters</button>
                <button className="rounded-md border px-2 py-1" onClick={() => setHierView(true)}>Browse instead</button>
              </div>
            </div>
          )}

          {listFiltered.length > 0 && resultsView === 'list' && (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full border-separate border-spacing-0 text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="sticky top-0 border-b px-3 py-2 text-left font-semibold">Team</th>
                    <th className="sticky top-0 border-b px-3 py-2 text-left font-semibold">Name</th>
                    <th className="sticky top-0 border-b px-3 py-2 text-left font-semibold">Surname</th>
                    <th className="sticky top-0 border-b px-3 py-2 text-left font-semibold hidden sm:table-cell">Age Group</th>
                    <th className="sticky top-0 border-b px-3 py-2 text-left font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {listFiltered.sort((a, b) => {
                    const ai = listSorted.findIndex((x) => x.id === a.id)
                    const bi = listSorted.findIndex((x) => x.id === b.id)
                    return ai - bi
                  }).slice(0, searchVisible).map((p) => {
                    const dn = p.data || {}
                    const t = String(dn.team || dn.ageGroup || '') || '—'
                    const needsReview = isPending(p)
                    return (
                      <tr key={p.id || dn.serverId || dn.idNumber} className={`cursor-pointer hover:bg-gray-50 ${needsReview ? 'bg-red-50' : ''}`} onClick={() => { setSelected(p); setSelectedMode('edit') }}>
                        <td className="border-b px-3 py-2">{t}</td>
                        <td className="border-b px-3 py-2">{dn.name}</td>
                        <td className="border-b px-3 py-2">{dn.surname}</td>
                        <td className="border-b px-3 py-2 hidden sm:table-cell">{dn.ageGroup || t}</td>
                        <td className="border-b px-3 py-2">{needsReview ? 'Needs review' : 'Approved'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {listFiltered.length > 0 && resultsView === 'cards' && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {listFiltered.sort((a, b) => {
                const ai = listSorted.findIndex((x) => x.id === a.id)
                const bi = listSorted.findIndex((x) => x.id === b.id)
                return ai - bi
              }).slice(0, searchVisible).map((p) => (
                <PlayerCard
                  key={p.id || p.data?.serverId || p.data?.idNumber}
                  player={p}
                  badge={String(p.data?.ageGroup || p.data?.team || '—')}
                  onClick={() => { setSelected(p); setSelectedMode('edit') }}
                />
              ))}
            </div>
          )}
          {listFiltered.length > 0 && (
            <ShowMoreButton total={listFiltered.length} shown={searchVisible} onMore={() => setSearchVisible((n) => n + 24)} className="mt-3" />
          )}

          {list.length === 0 && (
            <div className="py-2 text-sm text-gray-500">
              <div className="font-semibold">No players yet</div>
              <div className="mt-1">Add a player to get started.</div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button className="rounded-md bg-brand px-2 py-1 text-white" onClick={() => setAdding(true)}>Add Player</button>
              </div>
            </div>
          )}
        </div>
      )}
      </div>
      )}
    </div>
    )}
    </div>
  )
}

function CoachPlayerRow({ player, hasPending, isRecent, onUpdated, onSelect }) {
  const d = player.data || {}
  const [showDocs, setShowDocs] = useState(false)
  const [docs, setDocs] = useState<any[]>([])
  const [preview, setPreview] = useState<string | null>(null)
  const photo = typeof d.photoUrl === 'string' && d.photoUrl.startsWith('/uploads') ? `${API_ORIGIN}${d.photoUrl}` : (d.photoUrl || '')
  const initials = ((d.name || '').charAt(0) + (d.surname || '').charAt(0)).toUpperCase() || 'P'
  return (
    <div className="text-sm">
        <div className={`rounded-md border p-3 shadow-sm transition hover:shadow ${hasPending ? 'border-l-4 border-red-500 bg-red-50 ring-1 ring-red-300' : ''}`} data-player-id={player.id || d.serverId || ''} data-player-name={`${d.name || ''} ${d.surname || ''}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {photo ? (
                <img src={photo} alt="Profile" className={`h-20 w-20 rounded-full object-cover ${hasPending ? 'ring-2 ring-red-300' : ''}`} onDoubleClick={() => setPreview(photo)} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
              ) : (
                <div className={`flex h-20 w-20 items-center justify-center rounded-full ${hasPending ? 'bg-red-100 text-red-700 ring-2 ring-red-300' : 'bg-brand/10 text-brand ring-1 ring-brand/30'}`}>{initials}</div>
              )}
              <div>
                <div className={`text-base font-semibold ${hasPending ? 'text-red-600' : ''}`}>
                  {d.name} {d.surname}
                  {hasPending && <span className="ml-2 inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-red-300">Needs Review</span>}
                  {isRecent && <span className="ml-2 inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700 ring-1 ring-blue-300">Recently Added</span>}
                </div>
                <div className="mt-1 flex flex-wrap gap-2">
                  <span className="inline-flex items-center rounded-full bg-brand/10 px-2 py-0.5 text-xs font-semibold text-brand ring-1 ring-brand/30">{d.position || 'Position —'}</span>
                  <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700 ring-1 ring-gray-300">{d.ageGroup || 'Age Group —'}</span>
                  <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700 ring-1 ring-gray-300">{schoolNameOf(d.schoolId || player.schoolId) || 'School —'}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button className="rounded-md border px-3 py-1" onClick={() => onSelect('docs')}>View Documents</button>
              {hasPending ? (
                <button className="rounded-md bg-red-600 px-3 py-1 text-white" onClick={() => onSelect('edit')}>Review</button>
              ) : (
                <button className="rounded-md bg-brand px-3 py-1 text-white" onClick={() => onSelect('edit')}>Edit</button>
              )}
            </div>
          </div>
        </div>
        {preview && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setPreview(null)}>
            <img src={preview} alt="Preview" className="max-h-[95vh] max-w-[98vw] rounded-md shadow-lg" style={{ transform: 'scale(2)' }} />
          </div>
        )}
    </div>
  )
}
function CoachFolderBrowser({ players, onSelect, currentYearOnly, onStats, viewMode, onViewModeChange, onRefresh, exportMeta }: { players: any[]; onSelect: (p: any) => void; currentYearOnly?: boolean; onStats?: (stats: { year: number; count: number }) => void; viewMode: 'cards' | 'list'; onViewModeChange: (next: 'cards' | 'list') => void; onRefresh?: () => void; exportMeta?: { schoolName?: string; logoUrl?: string } }) {
  const systemYear = new Date().getFullYear()
  const yearTouchedRef = useRef(false)
  function inferYearFromTs(rawTs: any) {
    if (rawTs === undefined || rawTs === null || rawTs === '') return null
    let n = typeof rawTs === 'number' ? rawTs : Number(rawTs)
    if (!Number.isFinite(n) || n <= 0) return null
    if (n < 1_000_000_000_000) n = n * 1000
    try {
      const y = new Date(n).getFullYear()
      return Number.isFinite(y) ? y : null
    } catch {
      return null
    }
  }
  function registrationYearOf(p: any) {
    const dn = p?.data || {}
    const direct = Number(dn.registrationYear ?? dn.registration_year ?? dn.regYear ?? dn.reg_year)
    if (Number.isFinite(direct) && direct > 2000) return direct
    const y1 = inferYearFromTs(dn.registeredAt)
    if (y1) return y1
    const y2 = inferYearFromTs(p?.createdAt ?? p?.data?.createdAt)
    if (y2) return y2
    const y3 = inferYearFromTs(p?.ts ?? p?.updatedAt ?? p?.data?.ts)
    if (y3) return y3
    return systemYear
  }
  function registrationTsOf(p: any) {
    const dn = p?.data || {}
    const rt = dn.registeredAt
    const t = typeof rt === 'number' ? rt : Number(rt)
    if (Number.isFinite(t) && t > 0) return t
    const raw = p?.createdAt ?? p?.data?.createdAt
    const c = typeof raw === 'number' ? raw : Number(raw)
    if (Number.isFinite(c) && c > 0) return c
    const raw2 = p?.ts ?? p?.updatedAt ?? p?.data?.ts
    const u = typeof raw2 === 'number' ? raw2 : Number(raw2)
    return Number.isFinite(u) && u > 0 ? u : 0
  }
  const yearsPresent = useMemo(() => {
    const set = new Set<number>()
    ;(Array.isArray(players) ? players : []).forEach((p) => {
      const y = registrationYearOf(p)
      if (y) set.add(y)
    })
    return Array.from(set)
  }, [players])
  const basePlayers = useMemo(() => {
    if (!currentYearOnly) return players
    return (Array.isArray(players) ? players : []).filter((p) => registrationYearOf(p) === systemYear)
  }, [players, currentYearOnly, systemYear])
  const [yearSel, setYearSel] = useState<number>(systemYear)
  const [genderSel, setGenderSel] = useState<string | null>(null)
  const [teamSel, setTeamSel] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  // Rosters page in steps of 24 — no endless scroll inside a team folder
  const [visibleCount, setVisibleCount] = useState(24)
  useEffect(() => { setVisibleCount(24) }, [yearSel, genderSel, teamSel, search])
  const [switching, setSwitching] = useState(false)
  const cache = useRef<Map<string, any[]>>(new Map())
  useEffect(() => { cache.current.clear() }, [players, yearSel])
  function normalizeGender(p: any) {
    const dn = p?.data || {}
    const rawGender = String(dn.gender || '').toLowerCase()
    const rawTeam = String(dn.team || dn.ageGroup || '').toLowerCase()
    if (rawGender.includes('female') || rawGender.includes('girl')) return 'Girls'
    if (rawGender.includes('male') || rawGender.includes('boy')) return 'Boys'
    if (rawTeam.includes('girls')) return 'Girls'
    if (rawTeam.includes('boys')) return 'Boys'
    return 'Unspecified'
  }
  useEffect(() => {
    if (yearTouchedRef.current) return
    setYearSel(systemYear)
  }, [systemYear])
  const years = useMemo(() => {
    const base = [systemYear - 2, systemYear - 1, systemYear]
    const set = new Set<number>(base)
    yearsPresent.forEach((y) => { if (y <= systemYear) set.add(y) })
    return Array.from(set).sort((a, b) => a - b)
  }, [systemYear, yearsPresent])
  function promoteGroup(v: string, steps: number) {
    if (!v || steps <= 0) return v
    let out = v
    for (let i = 0; i < steps; i++) {
      if (out === 'U15') out = 'U16'
      else if (out === 'U16') out = 'U17'
      else if (out === 'U17') out = 'U19'
      else if (out === 'U19') out = 'U19'
      else out = out
    }
    return out
  }
  function identityKey(p: any) {
    const dn = p?.data || {}
    const email = String(dn.email ?? p?.email ?? '').trim().toLowerCase()
    if (email) return `email:${email}`
    const idNumber = String(dn.idNumber ?? p?.idNumber ?? '').trim().toLowerCase()
    if (idNumber) return `id:${idNumber}`
    const serverId = String(dn.serverId ?? '').trim().toLowerCase()
    if (serverId) return `sid:${serverId}`
    const name = String(dn.name ?? '').trim().toLowerCase()
    const surname = String(dn.surname ?? '').trim().toLowerCase()
    const dob = String(dn.dob ?? '').trim().toLowerCase()
    const composite = [name, surname, dob].filter(Boolean).join('|')
    return composite ? `n:${composite}` : ''
  }
  const playersForSelectedYear = useMemo(() => {
    if (!Array.isArray(basePlayers) || basePlayers.length === 0) return []

    const bestAnchorByKey = new Map<string, any>()
    basePlayers.forEach((p) => {
      const k = identityKey(p) || String(p?.id || '')
      if (!k) return
      const ry = registrationYearOf(p)
      const prev = bestAnchorByKey.get(k)
      if (!prev) {
        bestAnchorByKey.set(k, p)
        return
      }
      const pry = registrationYearOf(prev)
      if (ry < pry) {
        bestAnchorByKey.set(k, p)
        return
      }
      if (ry === pry) {
        const pts = registrationTsOf(prev)
        const nts = registrationTsOf(p)
        if (nts && pts && nts < pts) bestAnchorByKey.set(k, p)
      }
    })

    const anchors = Array.from(bestAnchorByKey.values()).filter((p) => registrationYearOf(p) <= yearSel)
    return anchors.map((p) => {
      const baseYear = registrationYearOf(p)
      const diff = Math.max(0, yearSel - baseYear)
      if (diff <= 0) return p
      const dn = p?.data || {}
      const ageGroup = String(dn.ageGroup || '')
      const team = String(dn.team || dn.ageGroup || '')
      const nextAgeGroup = promoteGroup(ageGroup, diff)
      const nextTeam = promoteGroup(team, diff)
      if (nextAgeGroup === ageGroup && nextTeam === team) return p
      return { ...p, data: { ...dn, ageGroup: nextAgeGroup || dn.ageGroup, team: nextTeam || dn.team } }
    })
  }, [basePlayers, systemYear, yearSel])
  useEffect(() => {
    onStats?.({ year: yearSel, count: playersForSelectedYear.length })
  }, [onStats, playersForSelectedYear.length, yearSel])
  const makeKey = (a?: string|number|null,b?: string|number|null,c?: string|number|null) => [a ?? '', b ?? '', c ?? ''].join('|')
  const genders = useMemo(() => {
    const key = makeKey('genders', yearSel, null)
    if (cache.current.has(key)) return cache.current.get(key) || []
    const set = new Map<string, number>()
    playersForSelectedYear.forEach((p) => {
      const g = normalizeGender(p)
      set.set(g, (set.get(g) || 0) + 1)
    })
    const arr = Array.from(set.entries()).map(([name, count]) => ({ name, count }))
    cache.current.set(key, arr)
    return arr
  }, [playersForSelectedYear, yearSel])
  const teams = useMemo(() => {
    if (!genderSel) return []
    const key = makeKey('teams', yearSel, genderSel)
    if (cache.current.has(key)) return cache.current.get(key) || []
    const set = new Map<string, number>()
    playersForSelectedYear.filter((p) => normalizeGender(p) === genderSel).forEach((p) => {
      const dn = p.data || {}
      const t = String(dn.team || dn.ageGroup || '') || 'Unassigned'
      set.set(t, (set.get(t) || 0) + 1)
    })
    const arr = Array.from(set.entries()).map(([name, count]) => ({ name, count }))
    cache.current.set(key, arr)
    return arr
  }, [playersForSelectedYear, yearSel, genderSel])
  const finalPlayers = useMemo(() => {
    if (!genderSel || !teamSel) return []
    const key = makeKey('players', yearSel, `${genderSel}|${teamSel}|${search.toLowerCase().trim()}`)
    if (cache.current.has(key)) return cache.current.get(key) || []
    const needle = search.toLowerCase().trim()
    const arr = playersForSelectedYear.filter((p) => {
      if (normalizeGender(p) !== genderSel) return false
      const dn = p.data || {}
      const t = String(dn.team || dn.ageGroup || '') || 'Unassigned'
      if (t !== teamSel) return false
      if (!needle) return true
      const full = `${dn.name || ''} ${dn.surname || ''}`.toLowerCase()
      return full.includes(needle)
    })
    cache.current.set(key, arr)
    return arr
  }, [playersForSelectedYear, yearSel, genderSel, teamSel, search])
  const level = genderSel ? (teamSel ? 'players' : 'team') : 'gender'
  const items = level === 'gender' ? genders : teams
  const filteredItems = items.filter((it: any) => it.name.toLowerCase().includes(search.toLowerCase()))
  const [reregistering, setReregistering] = useState(false)
  // Players whose registration is genuinely from a past season (not already rolled over)
  const reregisterTargets = useMemo(() => {
    if (yearSel >= systemYear) return []
    return playersForSelectedYear.filter((p) => registrationYearOf(p) < systemYear && p.id)
  }, [playersForSelectedYear, yearSel, systemYear])
  async function reregisterSeason() {
    if (reregisterTargets.length === 0) return
    if (!confirm(`Re-register ${reregisterTargets.length} player${reregisterTargets.length === 1 ? '' : 's'} for the ${systemYear} season? Age groups are promoted automatically (U15 → U16 → U17 → U19).`)) return
    setReregistering(true)
    try {
      await ensureSession()
      const res = await postJsonPath('players/bulk-reregister', { playerIds: reregisterTargets.map((p) => p.id) })
      if (res.ok) {
        const n = (res.data as any)?.successful ?? reregisterTargets.length
        notifySuccess(`${n} player${n === 1 ? '' : 's'} re-registered for ${systemYear}`)
        onRefresh?.()
      } else {
        notifyError('Re-registration failed. Please try again.')
      }
    } finally {
      setReregistering(false)
    }
  }
  return (
    <div className="rounded-lg border bg-white p-3 shadow">
      <div className="mb-3 flex flex-wrap gap-2" data-folder-level="year">
        {years.map((y) => (
          <button
            key={y}
            className={y === yearSel ? 'rounded-full bg-brand px-3 py-1 text-sm font-semibold text-white' : 'rounded-full border px-3 py-1 text-sm'}
            onClick={() => {
              if (y !== yearSel) {
                yearTouchedRef.current = true
                setYearSel(y)
                setGenderSel(null)
                setTeamSel(null)
                setSearch('')
              }
            }}
            aria-current={y === yearSel ? 'true' : undefined}
          >
            {y}
          </button>
        ))}
      </div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold">
          <span className="underline cursor-pointer" onClick={() => { setGenderSel(null); setTeamSel(null) }}>Teams</span>
          <> / <span className="underline cursor-pointer" onClick={() => { setGenderSel(null); setTeamSel(null) }}>{yearSel}</span></>
          {genderSel && <> / <span className="underline cursor-pointer" onClick={() => { setTeamSel(null) }}>{genderSel}</span></>}
          {teamSel && <> / <span className="underline">{teamSel}</span></>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {level === 'players' && reregisterTargets.length > 0 && (
            <button
              type="button"
              className="rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              disabled={reregistering}
              onClick={reregisterSeason}
            >
              {reregistering ? 'Re-registering…' : `Re-register ${reregisterTargets.length} for ${systemYear}`}
            </button>
          )}
          <input className="w-40 rounded-md border p-2 text-sm sm:w-56" placeholder="Filter..." value={search} onChange={(e) => setSearch(e.target.value)} />
          {level === 'players' && finalPlayers.length > 0 && (
            <ExportMenu players={finalPlayers} schoolName={exportMeta?.schoolName} logoUrl={exportMeta?.logoUrl} label={`Export ${teamSel || 'team'}`} />
          )}
          {level === 'players' && (
            <div className="inline-flex overflow-hidden rounded-md border" role="group" aria-label="Player view">
              <button
                type="button"
                aria-label="Card view"
                aria-pressed={viewMode === 'cards'}
                className={`inline-flex items-center gap-1 px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 ${viewMode === 'cards' ? 'bg-brand text-white' : ''}`}
                onClick={() => {
                  if (viewMode === 'cards') return
                  setSwitching(true)
                  setTimeout(() => { onViewModeChange('cards'); setSwitching(false) }, 120)
                }}
              >
                <LayoutGrid size={16} aria-hidden="true" />
                Cards
              </button>
              <button
                type="button"
                aria-label="List view"
                aria-pressed={viewMode === 'list'}
                className={`inline-flex items-center gap-1 px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 ${viewMode === 'list' ? 'bg-brand text-white' : ''}`}
                onClick={() => {
                  if (viewMode === 'list') return
                  setSwitching(true)
                  setTimeout(() => { onViewModeChange('list'); setSwitching(false) }, 120)
                }}
              >
                <ListIcon size={16} aria-hidden="true" />
                List
              </button>
            </div>
          )}
        </div>
      </div>
      {level !== 'players' ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" data-folder-level={level}>
          {filteredItems.map((it: any) => (
            <button key={it.name} data-folder-item="folder" className="flex items-center justify-between rounded-md border p-3 text-left hover:bg-gray-50 transition" onClick={() => {
              if (level === 'gender') setGenderSel(it.name)
              else setTeamSel(it.name)
            }}>
              <div>
                <div className="text-sm font-semibold">{it.name}</div>
                <div className="text-xs text-gray-600">Items: {it.count}</div>
              </div>
              <div className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700 ring-1 ring-gray-300">{it.count}</div>
            </button>
          ))}
          {filteredItems.length === 0 && <div className="py-2 text-sm text-gray-600">No folders</div>}
        </div>
      ) : (
        <div className={`transition-opacity duration-150 ${switching ? 'opacity-0' : 'opacity-100'}`}>
          {viewMode === 'list' ? (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full border-separate border-spacing-0 text-sm" aria-label="Players list">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="sticky top-0 border-b px-3 py-2 text-left font-semibold">Name</th>
                    <th className="sticky top-0 border-b px-3 py-2 text-left font-semibold">Surname</th>
                    <th className="sticky top-0 border-b px-3 py-2 text-left font-semibold hidden sm:table-cell">Position</th>
                    <th className="sticky top-0 border-b px-3 py-2 text-left font-semibold hidden md:table-cell">School</th>
                  </tr>
                </thead>
                <tbody>
                  {finalPlayers.slice(0, visibleCount).map((p) => {
                    const d = p.data || {}
                    return (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="border-b px-3 py-2">
                          <button type="button" className="w-full text-left" onClick={() => onSelect(p)} aria-label={`Open ${d.name || ''} ${d.surname || ''}`}>{d.name}</button>
                        </td>
                        <td className="border-b px-3 py-2">{d.surname}</td>
                        <td className="border-b px-3 py-2 hidden sm:table-cell">{String(d.position || '—')}</td>
                        <td className="border-b px-3 py-2 hidden md:table-cell">{schoolNameOf(d.schoolId)}</td>
                      </tr>
                    )
                  })}
                  {finalPlayers.length === 0 && (
                    <tr>
                      <td className="px-3 py-3 text-gray-600" colSpan={4}>No players</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {finalPlayers.slice(0, visibleCount).map((p) => (
                <PlayerCard
                  key={p.id}
                  player={p}
                  badge={String(p.data?.ageGroup || p.data?.team || '—')}
                  onClick={() => onSelect(p)}
                />
              ))}
              {finalPlayers.length === 0 && <div className="py-2 text-sm text-gray-600">No players</div>}
            </div>
          )}
          <ShowMoreButton total={finalPlayers.length} shown={visibleCount} onMore={() => setVisibleCount((n) => n + 24)} className="mt-3" />
        </div>
      )}
    </div>
  )
}

function CoachPlayerDetail({ player, mode, onBack, onUpdated }: { player: any; mode: 'edit' | 'docs'; onBack: () => void; onUpdated: () => void }) {
  const d = player.data || {}
  const initials = (((d.name || '').charAt(0) + (d.surname || '').charAt(0)).toUpperCase() || 'P')
  const photo = typeof d.photoUrl === 'string' && d.photoUrl.startsWith('/uploads') ? `${API_ORIGIN}${d.photoUrl}` : (d.photoUrl || '')
  const [showMigrate, setShowMigrate] = useState(false)
  const proposals = getProposals('Player').filter((pp) => {
    const pid = player.id || ''
    const sid = (player.data?.serverId || '') as string
    const pem = String(player.email ?? player.data?.email ?? '')
    return (pp.recordId === pid) || (sid && pp.recordId === sid) || (pem && String(pp.recordId) === pem)
  })
  const [preview, setPreview] = useState<string | null>(null)
  const [actionsOpen, setActionsOpen] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showApprovals, setShowApprovals] = useState(false)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <button className="flex items-center gap-1 rounded-md px-2 py-1 text-sm hover:bg-gray-100" onClick={onBack}>
          <ChevronDown className="rotate-90" size={16} /> Back
        </button>
      </div>

      {/* Profile Header Card */}
      <div className="relative rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
        <div className="h-32 rounded-t-2xl bg-gradient-to-r from-blue-700 to-blue-500"></div>
        <div className="px-6 pb-6">
          <div className="relative flex items-end justify-between -mt-12">
            <div className="flex items-end gap-4">
              <div className="relative rounded-full ring-4 ring-white bg-white p-1 shadow-sm">
                {photo ? (
                  <img src={photo} alt="Profile" className="h-24 w-24 rounded-full object-cover" onDoubleClick={() => setPreview(photo)} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                ) : (
                  <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gray-100 text-3xl font-bold text-gray-400">
                    {initials}
                  </div>
                )}
              </div>
              <div className="mb-1 hidden sm:block">
                <h1 className="text-2xl font-bold text-gray-900">{d.name} {d.surname}</h1>
                <div className="flex items-center gap-2 text-gray-600 text-sm">
                  <School size={16} /> <span>{schoolNameOf(d.schoolId) || 'No School Assigned'}</span>
                  {d.zoneId && <span className="text-gray-300">•</span>}
                  {d.zoneId && <span>{zoneNameOf(d.zoneId)}</span>}
                </div>
              </div>
            </div>
            
            <div className="mb-2 flex items-center gap-2">
              <div className="relative">
                <button className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2" type="button" onClick={() => setActionsOpen((v) => !v)}>
                  <MoreVertical size={16} />
                  <span>Actions</span>
                  <ChevronDown size={16} className={`transition-transform ${actionsOpen ? 'rotate-180' : ''}`} />
                </button>
                {actionsOpen && (
                  <div className="absolute right-0 z-50 mt-2 w-56 origin-top-right rounded-lg border border-gray-100 bg-white p-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                    <button className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50" onClick={() => { setShowEdit((v) => !v); setActionsOpen(false) }}>
                      <FileText size={16} className="text-gray-400" /> {showEdit ? 'Hide Edit Profile' : 'Edit Profile'}
                    </button>
                    <button className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50" onClick={() => { setShowApprovals((v) => !v); setActionsOpen(false) }}>
                      <FileText size={16} className="text-gray-400" /> {showApprovals ? 'Hide Approval Requests' : 'Show Approval Requests'}
                    </button>
                    <button className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50" onClick={() => { setShowMigrate(true); setActionsOpen(false) }}>
                      <School size={16} className="text-gray-400" /> Migrate School
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          <div className="mt-4 sm:hidden">
            <h1 className="text-xl font-bold text-gray-900">{d.name} {d.surname}</h1>
            <div className="flex items-center gap-2 text-gray-600 text-sm mt-1">
              <School size={16} /> <span>{d.schoolId || 'No School Assigned'}</span>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {d.ageGroup && (
              <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
                {d.ageGroup}
              </span>
            )}
            {d.position && (
              <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
                {d.position}
              </span>
            )}
             {d.jerseyNumber && (
              <span className="inline-flex items-center rounded-full bg-gray-50 px-2.5 py-0.5 text-xs font-medium text-gray-600 ring-1 ring-inset ring-gray-500/10">
                #{d.jerseyNumber}
              </span>
            )}
          </div>
        </div>
      </div>

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setPreview(null)}>
          <img src={preview} alt="Preview" className="max-h-[95vh] max-w-[98vw] rounded-md shadow-lg" style={{ transform: 'scale(2)' }} />
        </div>
      )}

      {showMigrate && (
        <PlayerMigrationPanel playerId={player.id || ''} onDone={onUpdated} onClose={() => setShowMigrate(false)} />
      )}

      {showApprovals && (
         <PlayerApprovalsPanel entityId={player.id || ''} canDecide title="Approval Requests" onClose={() => setShowApprovals(false)} />
      )}

      {/* Read-Only Info Cards */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Personal Info Card */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-4 py-3">
             <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
               <User size={18} className="text-brand" /> Personal Information
             </div>
          </div>
          <div className="grid grid-cols-1 gap-1 p-4 sm:grid-cols-2">
            <Info label="ID/Passport" value={d.idNumber} icon={CreditCard} />
            <Info label="Date of Birth" value={d.dob} icon={Calendar} />
            <Info label="Gender" value={d.gender} icon={Users} />
            <Info label="Mobile" value={d.phone} icon={Phone} />
            <Info label="Email" value={d.email} icon={Mail} />
            <Info label="Address" value={d.address} icon={MapPin} />
          </div>
        </div>

        {/* Rugby Info Card */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm h-fit">
          <div className="border-b border-gray-100 px-4 py-3">
             <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
               <Activity size={18} className="text-brand" /> Rugby Profile
             </div>
          </div>
          <div className="grid grid-cols-1 gap-1 p-4 sm:grid-cols-2">
            <Info label="Age Group" value={d.ageGroup} icon={Users} />
            <Info label="Position" value={d.position} icon={Activity} />
            <Info label="Jersey" value={d.jerseyNumber ? `#${d.jerseyNumber}` : ''} icon={LayoutGrid} />
            <Info label="Prev. Team" value={d.previousSchool} icon={School} />
          </div>
        </div>

        {/* Medical Info Card */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
           <div className="border-b border-gray-100 px-4 py-3">
             <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
               <Heart size={18} className="text-brand" /> Medical Information
             </div>
          </div>
          <div className="grid grid-cols-1 gap-1 p-4 sm:grid-cols-2">
            <Info label="Medical Aid" value={d.medicalAidName} icon={Heart} />
            <Info label="Number" value={d.medicalAidNumber} icon={FileText} />
            <Info label="Allergies" value={d.allergies} icon={AlertCircle} />
            <Info label="Chronic" value={d.chronicConditions} icon={Activity} />
            <div className="sm:col-span-2">
               <Info label="Emergency Notes" value={d.medicalNotes} icon={FileText} />
            </div>
          </div>
        </div>

        {/* Guardian Info Card */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
           <div className="border-b border-gray-100 px-4 py-3">
             <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
               <Shield size={18} className="text-brand" /> Guardian Information
             </div>
          </div>
          <div className="grid grid-cols-1 gap-1 p-4 sm:grid-cols-2">
            <Info label="Name" value={d.parentName} icon={User} />
            <Info label="Surname" value={d.parentSurname} icon={User} />
            <Info label="Relation" value={d.relationship} icon={Users} />
            <Info label="Contact" value={d.parentContact} icon={Phone} />
            <Info label="Email" value={d.parentEmail} icon={Mail} />
            <Info label="Signature" value={d.consentSignature ? 'Signed' : 'Pending'} icon={FileText} />
          </div>
        </div>
      </div>

      {showEdit && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-4 py-3 flex justify-between items-center">
               <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                 <FileText size={18} className="text-brand" /> Edit Profile
               </div>
               <button className="rounded-md border p-1 text-gray-500 hover:bg-gray-50" onClick={() => setShowEdit(false)}>
                 <X size={16} />
               </button>
          </div>
          <div className="p-4">
            <CoachPlayerEditor player={player} onUpdated={onUpdated} onClose={() => setShowEdit(false)} />
          </div>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-4 py-3">
             <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
               <FileText size={18} className="text-brand" /> Documents
             </div>
        </div>
        <div className="p-4">
          <PlayerDocuments ownerId={player.id || d.serverId || ''} />
        </div>
      </div>

      <div className="rounded-md border bg-white p-3">
        <div className="mb-2 text-sm font-semibold">Pending Changes</div>
        {proposals.length === 0 && <div className="text-xs text-gray-600">No pending changes</div>}
        <div className="divide-y">
          {proposals.map((pp) => (
            <div key={pp.id} className="flex items-center justify-between py-2 text-sm">
              <div>
                <span className="font-semibold">{pp.field}</span>
                <span className="ml-2 text-gray-700">→ {String(pp.value)}</span>
                <span className="ml-2 rounded-full bg-yellow-100 px-2 py-0.5 text-xs text-yellow-700">{pp.status}</span>
              </div>
              <div className="flex gap-2">
                <button className="rounded-md border px-2 py-1" onClick={async () => {
                  const rowZone = (player.zoneId ?? d.zoneId ?? '') as string
                  const rowSchool = (player.schoolId ?? d.schoolId ?? '') as string
                  await ensureSession()
                  const res = await putJson('players', player.id || '', { [pp.field]: pp.value, schoolId: rowSchool, zoneId: rowZone })
                  if (res) {
                    setProposalStatus('Player', pp.id, 'approved')
                    deleteProposal('Player', pp.id)
                    try { window.dispatchEvent(new CustomEvent('data:players:updated', { detail: { id: player.id || '' } })) } catch {}
                    await onUpdated()
                  }
                }}>Approve</button>
                <button className="rounded-md border px-2 py-1" onClick={async () => {
                  setProposalStatus('Player', pp.id, 'rejected')
                  deleteProposal('Player', pp.id)
                  await onUpdated()
                }}>Reject</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <PlayerHistoryPanel playerId={player.id || ''} />
    </div>
  )
}

function CoachPlayerEditor({ player, onUpdated, onClose }: { player: any; onUpdated: () => void; onClose: () => void }) {
  const d = player.data || {}
  const [vals, setVals] = useState<any>({ ...d })
  const id = player.id || d.serverId || ''
  const fields: { key: string; label: string; type?: 'text' | 'date' | 'email' | 'number' }[] = [
    { key: 'name', label: 'Name' },
    { key: 'surname', label: 'Surname' },
    { key: 'idNumber', label: 'ID/Passport' },
    { key: 'dob', label: 'Date of Birth', type: 'date' },
    { key: 'gender', label: 'Gender' },
    { key: 'ageGroup', label: 'Age Group' },
    { key: 'phone', label: 'Mobile' },
    { key: 'email', label: 'Email', type: 'email' },
    { key: 'address', label: 'Address' },
    { key: 'emergencyContactName', label: 'Emergency Contact Name' },
    { key: 'emergencyContactNumber', label: 'Emergency Contact Number' },
    { key: 'parentName', label: 'Parent/Guardian Name' },
    { key: 'parentSurname', label: 'Parent/Guardian Surname' },
    { key: 'relationship', label: 'Relationship to Player' },
    { key: 'parentContact', label: 'Parent Contact Number' },
    { key: 'parentEmail', label: 'Parent Email', type: 'email' },
    { key: 'consentSignature', label: 'Digital Consent Signature' },
    { key: 'position', label: 'Position(s) Played' },
    { key: 'jerseyNumber', label: 'Jersey Number', type: 'number' },
    { key: 'team', label: 'Team' },
    { key: 'previousSchool', label: 'Previous School/Team' },
    { key: 'medicalAidName', label: 'Medical Aid Name' },
    { key: 'medicalAidNumber', label: 'Medical Aid Number' },
    { key: 'allergies', label: 'Known Allergies' },
    { key: 'chronicConditions', label: 'Chronic Conditions' },
    { key: 'medicalNotes', label: 'Emergency Medical Notes' },
  ]
  const personalKeys = ['name','surname','idNumber','dob','gender','ageGroup','phone','email','address','emergencyContactName','emergencyContactNumber']
  const guardianKeys = ['parentName','parentSurname','relationship','parentContact','parentEmail','consentSignature']
  const rugbyKeys = ['position','jerseyNumber','team','previousSchool']
  const medicalKeys = ['medicalAidName','medicalAidNumber','allergies','chronicConditions','medicalNotes']
  const allKeys = [...personalKeys, ...guardianKeys, ...rugbyKeys, ...medicalKeys]
  const [focusNextKey, setFocusNextKey] = useState<string | undefined>(undefined)
  const [banner, setBanner] = useState<{ t: 'success' | 'error', msg: string } | null>(null)
  useEffect(() => {
    if (!focusNextKey) return
    const host = document.querySelector(`[data-field-key="${focusNextKey}"]`) as HTMLElement | null
    const input = host?.querySelector('input,select') as HTMLElement | null
    input?.focus()
    setFocusNextKey(undefined)
  }, [focusNextKey])
  function group(keys: string[]) { return fields.filter((f) => keys.includes(f.key)) }
  const [prevZone, setPrevZone] = useState<string>('')
  const [prevSchool, setPrevSchool] = useState<string>(vals.previousSchool || '')
  function setValue(k: string, v: string) {
    setVals((prev: any) => ({ ...prev, [k]: v }))
  }
  async function saveField(k: string) {
    if (!id) return
    const value = k === 'previousSchool' ? (prevSchool || '').toString().trim() : (vals[k] ?? '').toString().trim()
    if (k === 'email' && value && !isEmail(value)) return
    if (k === 'phone' && value && !isPhoneZA(value)) return
    if (k === 'idNumber' && value && !isIdNumber(value)) return
    const rowZone = (player.zoneId ?? d.zoneId ?? '') as string
    const rowSchool = (player.schoolId ?? d.schoolId ?? '') as string
    await ensureSession()
    const res = await putJson('players', id, { [k]: value, schoolId: rowSchool, zoneId: rowZone })
    if (res) {
      const parsed = typeof res?.data === 'string' ? (() => { try { return JSON.parse(res.data || '{}') } catch { return {} } })() : (res?.data || {})
      const merged = {
        ...parsed,
        name: res.name !== undefined ? res.name : parsed.name,
        surname: res.surname !== undefined ? res.surname : parsed.surname,
        email: res.email !== undefined ? res.email : parsed.email,
        schoolId: res.schoolId !== undefined ? res.schoolId : parsed.schoolId,
        zoneId: res.zoneId !== undefined ? res.zoneId : parsed.zoneId,
        ageGroup: res.ageGroup !== undefined ? res.ageGroup : parsed.ageGroup,
        phone: res.contactNumber !== undefined ? res.contactNumber : parsed.phone,
        idNumber: res.idNumber !== undefined ? res.idNumber : parsed.idNumber,
      }
      setVals(merged)
      setBanner({ t: 'success', msg: 'Saved' })
      emitPlayersUpdated(id)
      await onUpdated()
    } else {
      const ok = await safePut('players', id, { [k]: value, schoolId: rowSchool, zoneId: rowZone })
      if (ok) { setBanner({ t: 'success', msg: 'Saved' }); await onUpdated() } else { setBanner({ t: 'error', msg: 'Update failed' }) }
    }
    setTimeout(() => setBanner(null), 1500)
    const idx = allKeys.indexOf(k)
    const nxt = allKeys[idx + 1]
    if (nxt) setFocusNextKey(nxt)
  }
  async function saveAll() {
    if (!id) return
    const updates: any = {}
    fields.forEach(f => {
      const nv = vals[f.key]
      const ov = d[f.key]
      if (nv !== undefined && nv !== ov) updates[f.key] = nv
    })
    if (prevSchool && prevSchool !== d.previousSchool) updates.previousSchool = prevSchool
    if (!Object.keys(updates).length) return onClose()
    const rowZone = (player.zoneId ?? d.zoneId ?? '') as string
    const rowSchool = (player.schoolId ?? d.schoolId ?? '') as string
    await ensureSession()
    const res = await putJson('players', id, { ...updates, schoolId: rowSchool, zoneId: rowZone })
    if (res) {
      const parsed = typeof res?.data === 'string' ? (() => { try { return JSON.parse(res.data || '{}') } catch { return {} } })() : (res?.data || {})
      const merged = {
        ...parsed,
        name: res.name !== undefined ? res.name : parsed.name,
        surname: res.surname !== undefined ? res.surname : parsed.surname,
        email: res.email !== undefined ? res.email : parsed.email,
        schoolId: res.schoolId !== undefined ? res.schoolId : parsed.schoolId,
        zoneId: res.zoneId !== undefined ? res.zoneId : parsed.zoneId,
        ageGroup: res.ageGroup !== undefined ? res.ageGroup : parsed.ageGroup,
        phone: res.contactNumber !== undefined ? res.contactNumber : parsed.phone,
        idNumber: res.idNumber !== undefined ? res.idNumber : parsed.idNumber,
      }
      setVals(merged)
      setBanner({ t: 'success', msg: 'All changes saved' })
      emitPlayersUpdated(id)
      await onUpdated(); onClose()
    } else {
      const ok = await safePut('players', id, { ...updates, schoolId: rowSchool, zoneId: rowZone })
      if (ok) { setBanner({ t: 'success', msg: 'All changes saved' }); await onUpdated(); onClose() } else { setBanner({ t: 'error', msg: 'Update failed' }) }
    }
    setTimeout(() => setBanner(null), 1500)
  }
  return (
    <div className="space-y-4">
      {banner && (
        <div className={`rounded-md p-2 text-sm ${banner.t === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{banner.msg}</div>
      )}
      <fieldset className="rounded-md border p-3">
        <legend className="text-sm font-semibold text-brand border-l-4 border-brand pl-2">Personal Information</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {group(personalKeys).map((f) => (
            <div
              key={f.key}
              className={`rounded-md p-2 ${!vals[f.key] ? 'border-yellow-400 bg-yellow-50 border' : 'border'}`}
              data-field-key={f.key}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveField(f.key) } }}
            >
              {!vals[f.key] && <span className="float-right rounded-full bg-yellow-100 px-2 py-0.5 text-xs text-yellow-700">Missing</span>}
              <label className="block">
                <span className="text-sm font-medium">{f.label}</span>
                {f.key === 'gender' ? (
                  <select className="mt-1 w-full rounded-md border p-2" value={vals[f.key] ?? ''} onChange={(e) => setValue(f.key, e.target.value)}>
                    <option value="">Select...</option>
                    <option>Male</option>
                    <option>Female</option>
                  </select>
                ) : f.key === 'ageGroup' ? (
                  <select className="mt-1 w-full rounded-md border p-2" value={vals[f.key] ?? ''} onChange={(e) => setValue(f.key, e.target.value)}>
                    {AGE_GROUPS.map((g) => (
                      <option key={g}>{g}</option>
                    ))}
                  </select>
                ) : f.key === 'position' ? (
                  <select className="mt-1 w-full rounded-md border p-2" value={vals[f.key] ?? ''} onChange={(e) => setValue(f.key, e.target.value)}>
                    {POSITIONS.map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                ) : f.key === 'relationship' ? (
                  <select className="mt-1 w-full rounded-md border p-2" value={vals[f.key] ?? ''} onChange={(e) => setValue(f.key, e.target.value)}>
                    {RELATIONSHIPS.map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                ) : (
                  <input type={f.type || 'text'} className="mt-1 w-full rounded-md border p-2" value={vals[f.key] ?? ''} onChange={(e) => setValue(f.key, e.target.value)} />
                )}
              </label>
              <div className="mt-2 text-right"><button className="rounded-md bg-brand px-3 py-1 text-white" onClick={() => saveField(f.key)}>Save</button></div>
            </div>
          ))}
        </div>
      </fieldset>
      <fieldset className="rounded-md border p-3">
        <legend className="text-sm font-semibold text-brand border-l-4 border-brand pl-2">Parent/Guardian Information</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {group(guardianKeys).map((f) => (
            <div
              key={f.key}
              className={`rounded-md p-2 ${!vals[f.key] ? 'border-yellow-400 bg-yellow-50 border' : 'border'}`}
              data-field-key={f.key}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveField(f.key) } }}
            >
              {!vals[f.key] && <span className="float-right rounded-full bg-yellow-100 px-2 py-0.5 text-xs text-yellow-700">Missing</span>}
              <label className="block">
                <span className="text-sm font-medium">{f.label}</span>
                {f.key === 'gender' ? (
                  <select className="mt-1 w-full rounded-md border p-2" value={vals[f.key] ?? ''} onChange={(e) => setValue(f.key, e.target.value)}>
                    <option value="">Select...</option>
                    <option>Male</option>
                    <option>Female</option>
                  </select>
                ) : f.key === 'ageGroup' ? (
                  <select className="mt-1 w-full rounded-md border p-2" value={vals[f.key] ?? ''} onChange={(e) => setValue(f.key, e.target.value)}>
                    {AGE_GROUPS.map((g) => (
                      <option key={g}>{g}</option>
                    ))}
                  </select>
                ) : f.key === 'position' ? (
                  <select className="mt-1 w-full rounded-md border p-2" value={vals[f.key] ?? ''} onChange={(e) => setValue(f.key, e.target.value)}>
                    {POSITIONS.map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                ) : f.key === 'relationship' ? (
                  <select className="mt-1 w-full rounded-md border p-2" value={vals[f.key] ?? ''} onChange={(e) => setValue(f.key, e.target.value)}>
                    {RELATIONSHIPS.map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                ) : (
                  <input type={f.type || 'text'} className="mt-1 w-full rounded-md border p-2" value={vals[f.key] ?? ''} onChange={(e) => setValue(f.key, e.target.value)} />
                )}
              </label>
              <div className="mt-2 text-right"><button className="rounded-md bg-brand px-3 py-1 text-white" onClick={() => saveField(f.key)}>Save</button></div>
            </div>
          ))}
        </div>
      </fieldset>
      <fieldset className="rounded-md border p-3">
        <legend className="text-sm font-semibold text-brand border-l-4 border-brand pl-2">Rugby Information</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {group(rugbyKeys).map((f) => (
            <div
              key={f.key}
              className={`rounded-md p-2 ${f.key === 'previousSchool' ? (!prevSchool ? 'border-yellow-400 bg-yellow-50 border' : 'border') : (!vals[f.key] ? 'border-yellow-400 bg-yellow-50 border' : 'border')}`}
              data-field-key={f.key}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveField(f.key) } }}
            >
              {(f.key === 'previousSchool' ? !prevSchool : !vals[f.key]) && <span className="float-right rounded-full bg-yellow-100 px-2 py-0.5 text-xs text-yellow-700">Missing</span>}
              {f.key === 'previousSchool' ? (
                <div className="grid grid-cols-1 gap-2">
                  <span className="text-sm font-medium">Previous School</span>
                  <ZoneSelect value={prevZone} onChange={setPrevZone} />
                  <SchoolSelect zoneId={prevZone} value={prevSchool} onChange={setPrevSchool} />
                </div>
                ) : (
                  <label className="block">
                    <span className="text-sm font-medium">{f.label}</span>
                    {f.key === 'position' ? (
                      <select className="mt-1 w-full rounded-md border p-2" value={vals[f.key] ?? ''} onChange={(e) => setValue(f.key, e.target.value)}>
                        {POSITIONS.map((p) => (
                          <option key={p}>{p}</option>
                        ))}
                      </select>
                    ) : f.key === 'team' ? (
                      <select className="mt-1 w-full rounded-md border p-2" value={vals[f.key] ?? ''} onChange={(e) => setValue(f.key, e.target.value)}>
                        <option value="">Select...</option>
                        {AGE_GROUPS.map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                    ) : (
                      <input type={f.type || 'text'} className="mt-1 w-full rounded-md border p-2" value={vals[f.key] ?? ''} onChange={(e) => setValue(f.key, e.target.value)} />
                    )}
                  </label>
                )}
              <div className="mt-2 text-right"><button className="rounded-md bg-brand px-3 py-1 text-white" onClick={() => saveField(f.key)}>Save</button></div>
            </div>
          ))}
        </div>
      </fieldset>
      <fieldset className="rounded-md border p-3">
        <legend className="text-sm font-semibold text-brand border-l-4 border-brand pl-2">Medical Information</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {group(medicalKeys).map((f) => (
            <div
              key={f.key}
              className={`rounded-md p-2 ${!vals[f.key] ? 'border-yellow-400 bg-yellow-50 border' : 'border'}`}
              data-field-key={f.key}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveField(f.key) } }}
            >
              {!vals[f.key] && <span className="float-right rounded-full bg-yellow-100 px-2 py-0.5 text-xs text-yellow-700">Missing</span>}
              <label className="block">
                <span className="text-sm font-medium">{f.label}</span>
                {f.key === 'gender' ? (
                  <select className="mt-1 w-full rounded-md border p-2" value={vals[f.key] ?? ''} onChange={(e) => setValue(f.key, e.target.value)}>
                    <option value="">Select...</option>
                    <option>Male</option>
                    <option>Female</option>
                  </select>
                ) : f.key === 'ageGroup' ? (
                  <select className="mt-1 w-full rounded-md border p-2" value={vals[f.key] ?? ''} onChange={(e) => setValue(f.key, e.target.value)}>
                    {AGE_GROUPS.map((g) => (
                      <option key={g}>{g}</option>
                    ))}
                  </select>
                ) : f.key === 'position' ? (
                  <select className="mt-1 w-full rounded-md border p-2" value={vals[f.key] ?? ''} onChange={(e) => setValue(f.key, e.target.value)}>
                    {POSITIONS.map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                ) : f.key === 'relationship' ? (
                  <select className="mt-1 w-full rounded-md border p-2" value={vals[f.key] ?? ''} onChange={(e) => setValue(f.key, e.target.value)}>
                    {RELATIONSHIPS.map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                ) : (
                  <input type={f.type || 'text'} className="mt-1 w-full rounded-md border p-2" value={vals[f.key] ?? ''} onChange={(e) => setValue(f.key, e.target.value)} />
                )}
              </label>
              <div className="mt-2 text-right"><button className="rounded-md bg-brand px-3 py-1 text-white" onClick={() => saveField(f.key)}>Save</button></div>
            </div>
          ))}
        </div>
      </fieldset>
      <div className="text-right">
        <button className="mr-2 rounded-md border px-3 py-1" onClick={onClose}>Close</button>
        <button className="rounded-md bg-brand px-3 py-1 text-white" onClick={saveAll}>Save All Changes</button>
      </div>
      {banner && (
        <div className={`fixed bottom-4 right-4 rounded-md px-3 py-2 text-white shadow ${banner.t === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>{banner.msg}</div>
      )}
    </div>
  )
}

function PlayerMissingForm({ id, serverId, data, lockedFields, pendingFields = [], onUpdated }: { id: string; serverId: string; data: any; lockedFields: string[]; pendingFields?: string[]; onUpdated: (d: any, locked: string[]) => void }) {
  const fields: { key: string; label: string; type?: 'text' | 'date' | 'email' | 'number' }[] = [
    { key: 'idNumber', label: 'ID/Passport' },
    { key: 'dob', label: 'Date of Birth', type: 'date' },
    { key: 'gender', label: 'Gender' },
    { key: 'ageGroup', label: 'Age Group' },
    { key: 'schoolId', label: 'School' },
    { key: 'zoneId', label: 'Zone' },
    { key: 'phone', label: 'Mobile' },
    { key: 'email', label: 'Email', type: 'email' },
    { key: 'address', label: 'Address' },
    { key: 'emergencyContactName', label: 'Emergency Contact Name' },
    { key: 'emergencyContactNumber', label: 'Emergency Contact Number' },
    { key: 'parentName', label: 'Parent/Guardian Name' },
    { key: 'parentSurname', label: 'Parent/Guardian Surname' },
    { key: 'relationship', label: 'Relationship to Player' },
    { key: 'parentContact', label: 'Parent Contact Number' },
    { key: 'parentEmail', label: 'Parent Email Address', type: 'email' },
    { key: 'consentSignature', label: 'Digital Consent Signature' },
    { key: 'position', label: 'Position(s) Played' },
    { key: 'jerseyNumber', label: 'Jersey Number', type: 'number' },
    { key: 'previousSchool', label: 'Previous School/Team' },
    { key: 'medicalAidName', label: 'Medical Aid Name' },
    { key: 'medicalAidNumber', label: 'Medical Aid Number' },
    { key: 'allergies', label: 'Known Allergies' },
    { key: 'chronicConditions', label: 'Chronic Conditions' },
    { key: 'medicalNotes', label: 'Emergency Medical Notes' },
  ]
  const missing = fields.filter(f => !data?.[f.key])
  const [values, setValues] = useState<Record<string, string>>({})
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const [focusNextKey, setFocusNextKey] = useState<string | undefined>(undefined)
  const [banner, setBanner] = useState<{ t: 'success' | 'error', msg: string } | null>(null)
  const [selZone, setSelZone] = useState<string>(String(data.zoneId || ''))
  const [selSchool, setSelSchool] = useState<string>(String(data.schoolId || ''))
  const [prevZone, setPrevZone] = useState<string>('')
  const [prevSchool, setPrevSchool] = useState<string>('')
  useEffect(() => {
    const init: Record<string, string> = {}
    missing.forEach(f => { init[f.key] = '' })
    setValues(init)
  }, [id])
  useEffect(() => {
    if (!focusNextKey) return
    const el = inputRefs.current[focusNextKey]
    if (el) el.focus()
    setFocusNextKey(undefined)
  }, [missing, focusNextKey])
  if (missing.length === 0) return <div className="text-sm text-gray-500">No missing information</div>
  function setValue(k: string, v: string) {
    setValues(prev => ({ ...prev, [k]: v }))
  }
  async function saveOne(fieldKey: string) {
    const v = (values[fieldKey] || '').trim()
    const val = fieldKey === 'zoneId' ? selZone : fieldKey === 'schoolId' ? selSchool : fieldKey === 'previousSchool' ? prevSchool : v
    if (!val) return
    const updates: any = { [fieldKey]: val }
    const newLocks = [...lockedFields]
    if (!newLocks.includes(fieldKey)) newLocks.push(fieldKey)
    onUpdated({ ...data, ...updates }, newLocks)
    if (serverId) {
      const res = await postJsonPath('approvals', { entityType: 'players', entityId: serverId, requestedChanges: [{ field: fieldKey, previous: (data as any)?.[fieldKey], updated: val }] })
      if (!res.ok) {
        addProposal('Player', serverId || id, fieldKey, val)
        setBanner({ t: 'error', msg: 'Saved locally; approval request not sent' })
        setTimeout(() => setBanner(null), 2000)
        return
      }
    } else {
      addProposal('Player', serverId || id, fieldKey, val)
    }
    setBanner({ t: 'success', msg: 'Saved' })
    setTimeout(() => setBanner(null), 1500)
    const idx = missing.findIndex((m) => m.key === fieldKey)
    const nxt = missing[idx + 1]?.key
    if (nxt) setFocusNextKey(nxt)
  }
  return (
    <div className="mt-2 rounded-md border p-3">
      <div className="mb-2 text-xs text-gray-600">Saved values are locked locally; if online, an approval request is sent to your school for review.</div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {missing.map((f) => {
          const isPending = pendingFields.includes(f.key)
          const isLocked = lockedFields.includes(f.key)
          
          return (
          <div key={f.key} className={`rounded-md border p-2 ${isPending ? 'border-yellow-400 bg-yellow-50' : ''} ${isLocked ? 'bg-gray-50' : ''}`}>
            <label className="block">
              <span className="text-sm font-medium">
                {f.label}
                {isPending && <span className="ml-1 text-yellow-600">⏳ Pending</span>}
                {isLocked && !isPending && <span className="ml-1 text-gray-600">🔒 Locked</span>}
              </span>
              {f.key === 'gender' ? (
                <select className="mt-1 w-full rounded-md border p-2" value={values[f.key] || ''} onChange={(e) => setValue(f.key, e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveOne(f.key) } }}>
                  <option value="">Select...</option>
                  <option>Male</option>
                  <option>Female</option>
                </select>
              ) : f.key === 'ageGroup' ? (
                <select className="mt-1 w-full rounded-md border p-2" value={values[f.key] || ''} onChange={(e) => setValue(f.key, e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveOne(f.key) } }}>
                  {['U15', 'U16', 'U17', 'U19'].map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                </select>
              ) : f.key === 'position' ? (
                <select className="mt-1 w-full rounded-md border p-2" value={values[f.key] || ''} onChange={(e) => setValue(f.key, e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveOne(f.key) } }}>
                  {['Prop','Hooker','Lock','Flanker','Number 8','Scrum-half','Fly-half','Centre','Wing','Fullback'].map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              ) : f.key === 'relationship' ? (
                <select className="mt-1 w-full rounded-md border p-2" value={values[f.key] || ''} onChange={(e) => setValue(f.key, e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveOne(f.key) } }}>
                  {['Parent','Guardian','Relative','Other'].map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              ) : f.key === 'zoneId' ? (
                <ZoneSelect value={selZone} onChange={setSelZone} />
              ) : f.key === 'schoolId' ? (
                <SchoolSelect zoneId={selZone} value={selSchool} onChange={setSelSchool} />
              ) : f.key === 'previousSchool' ? (
                <div className="grid grid-cols-1 gap-2">
                  <span className="text-xs text-gray-600">Previous School</span>
                  <ZoneSelect value={prevZone} onChange={setPrevZone} />
                  <SchoolSelect zoneId={prevZone} value={prevSchool} onChange={setPrevSchool} />
                </div>
              ) : (
                <input
                  type={f.type || 'text'}
                  className="mt-1 w-full rounded-md border p-2"
                  value={values[f.key] || ''}
                  onChange={(e) => setValue(f.key, e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveOne(f.key) } }}
                  ref={(el) => { inputRefs.current[f.key] = el }}
                />
              )}
            </label>
            <div className="mt-2 text-right">
              <button 
                className={`rounded-md px-3 py-1 text-white ${
                  isPending 
                    ? 'bg-yellow-500 cursor-not-allowed' 
                    : isLocked 
                    ? 'bg-gray-500 cursor-not-allowed'
                    : 'bg-brand hover:bg-brand/90'
                }`}
                onClick={() => saveOne(f.key)}
                disabled={isPending || isLocked}
              >
                {isPending ? 'Pending Review' : isLocked ? 'Locked' : 'Save'}
              </button>
            </div>
          </div>
        )})}
      </div>
      {banner && (
        <div className={`fixed bottom-4 right-4 rounded-md px-3 py-2 text-white shadow ${banner.t === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>{banner.msg}</div>
      )}
    </div>
  )
}
function Info({ label, value, icon: Icon }: { label: string; value?: string; icon?: any }) {
  return (
    <div className="flex items-start gap-3 p-2 transition-colors hover:bg-gray-50 rounded-lg">
      {Icon && <div className="mt-0.5 text-brand/60"><Icon size={16} /></div>}
      <div>
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</div>
        <div className="text-sm font-semibold text-gray-900 mt-0.5">{value || '—'}</div>
      </div>
    </div>
  )
}

function PendingPlayersView({ players, loading, onApprove, onReject, onBulkApprove, onRefresh }: {
  players: any[]
  loading: boolean
  onApprove: (playerId: string) => void
  onReject: (playerId: string, reason?: string) => void
  onBulkApprove: (playerIds: string[]) => void
  onRefresh: () => void
}) {
  const [selectedPlayers, setSelectedPlayers] = useState<Set<string>>(new Set())
  const [rejectModal, setRejectModal] = useState<{ playerId: string; show: boolean } | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [pendingVisible, setPendingVisible] = useState(20)
  
  const toggleSelection = (playerId: string) => {
    const newSelected = new Set(selectedPlayers)
    if (newSelected.has(playerId)) {
      newSelected.delete(playerId)
    } else {
      newSelected.add(playerId)
    }
    setSelectedPlayers(newSelected)
  }
  
  const selectAll = () => {
    if (selectedPlayers.size === players.length) {
      setSelectedPlayers(new Set())
    } else {
      setSelectedPlayers(new Set(players.map(p => p.id)))
    }
  }
  
  const handleBulkApprove = async () => {
    if (selectedPlayers.size === 0) return
    const playerIds = Array.from(selectedPlayers)
    await onBulkApprove(playerIds)
    setSelectedPlayers(new Set())
  }
  
  const handleReject = async () => {
    if (!rejectModal) return
    await onReject(rejectModal.playerId, rejectReason || 'Rejected by coach')
    setRejectModal(null)
    setRejectReason('')
  }
  
  if (loading) {
    return (
      <div className="rounded-lg border bg-white p-8 text-center">
        <div className="text-gray-600">Loading pending players...</div>
      </div>
    )
  }
  
  if (players.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-8 text-center">
        <div className="text-gray-600">No pending player reviews</div>
        <button className="mt-2 rounded-md bg-brand px-3 py-1 text-white" onClick={onRefresh}>
          Refresh
        </button>
      </div>
    )
  }
  
  return (
    <div className="space-y-4">
      {/* Bulk Actions */}
      <div className="flex items-center justify-between rounded-lg border bg-white p-3">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2">
            <input 
              type="checkbox" 
              checked={selectedPlayers.size === players.length && players.length > 0}
              onChange={selectAll}
            />
            <span className="text-sm">Select All</span>
          </label>
          <span className="text-sm text-gray-600">
            {selectedPlayers.size} selected
          </span>
        </div>
        <div className="flex gap-2">
          <button 
            className="rounded-md bg-green-600 px-3 py-1 text-white disabled:opacity-50"
            onClick={handleBulkApprove}
            disabled={selectedPlayers.size === 0}
          >
            Approve Selected ({selectedPlayers.size})
          </button>
          <button 
            className="rounded-md border px-3 py-1"
            onClick={onRefresh}
          >
            Refresh
          </button>
        </div>
      </div>
      
      {/* Pending Players List */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {players.slice(0, pendingVisible).map((player) => {
          const d = player.data || {}
          const photo = typeof d.photoUrl === 'string' && d.photoUrl.startsWith('/uploads') 
            ? `${API_ORIGIN}${d.photoUrl}`
            : (d.photoUrl || '')
          const initials = ((d.name || '').charAt(0) + (d.surname || '').charAt(0)).toUpperCase() || 'P'
          const isSelected = selectedPlayers.has(player.id)
          
          return (
            <div key={player.id} className="rounded-lg border bg-white p-3 shadow-sm">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <input 
                    type="checkbox" 
                    checked={isSelected}
                    onChange={() => toggleSelection(player.id)}
                    className="mt-1"
                  />
                  {photo ? (
                    <img src={photo} alt="Profile" className="h-16 w-16 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-700 ring-2 ring-red-300">
                      {initials}
                    </div>
                  )}
                  <div>
                    <div className="font-semibold text-red-600">
                      {d.name} {d.surname}
                    </div>
                    <div className="text-sm text-gray-600">
                      {d.ageGroup || '—'} • {schoolNameOf(d.schoolId || player.schoolId) || '—'}
                    </div>
                    <div className="text-sm text-gray-600">
                      {d.email || '—'}
                    </div>
                    {d.rejectionReason && (
                      <div className="mt-1 text-xs text-red-600">
                        Previous rejection: {d.rejectionReason}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <button 
                    className="rounded-md bg-green-600 px-3 py-1 text-white text-sm"
                    onClick={() => onApprove(player.id)}
                  >
                    Approve
                  </button>
                  <button 
                    className="rounded-md border px-3 py-1 text-sm"
                    onClick={() => setRejectModal({ playerId: player.id, show: true })}
                  >
                    Reject
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <ShowMoreButton total={players.length} shown={pendingVisible} onMore={() => setPendingVisible((n) => n + 20)} />

      {/* Reject Modal */}
      {rejectModal?.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="rounded-lg border bg-white p-4 shadow-lg max-w-md w-[90%]">
            <div className="mb-3 text-lg font-semibold">Reject Player</div>
            <div className="mb-3">
              <label className="block">
                <span className="text-sm font-medium">Reason for rejection (optional)</span>
                <textarea 
                  className="mt-1 w-full rounded-md border p-2"
                  rows={3}
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Enter reason for rejection..."
                />
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button 
                className="rounded-md border px-3 py-1"
                onClick={() => {
                  setRejectModal(null)
                  setRejectReason('')
                }}
              >
                Cancel
              </button>
              <button 
                className="rounded-md bg-red-600 px-3 py-1 text-white"
                onClick={handleReject}
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function RefereeDashboard({ referees }: { referees: any[] }) {
  return (
    <div className="space-y-6">
      {/* Referee Header Card */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-700 via-blue-600 to-blue-500 text-white shadow-xl">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48Y2lyY2xlIGN4PSIzMCIgY3k9IjMwIiByPSIyIi8+PC9nPjwvZz48L3N2Zz4=')] opacity-30"></div>
        <div className="relative px-8 py-8">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <Shield className="h-8 w-8 text-blue-100" />
                <span className="text-blue-100 text-sm font-medium uppercase tracking-wider">Officials</span>
              </div>
              <h1 className="text-3xl font-bold mb-2">Referee Dashboard</h1>
              <div className="text-blue-100">Manage and view officials</div>
            </div>
            <div className="text-right">
              <div className="text-4xl font-bold">{referees.length}</div>
              <div className="text-blue-100 text-sm">Active Referees</div>
            </div>
          </div>
        </div>
      </div>

      <div>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {referees.map((r) => (
            <RefereeCard key={r.id} referee={r} badge={r.data?.zoneId ? zoneNameOf(String(r.data.zoneId)) : '—'} />
          ))}
          {referees.length === 0 && <div className="col-span-full py-12 text-center text-gray-500 border border-dashed rounded-xl">No referees found</div>}
        </div>
      </div>
    </div>
  )
}
