import { useState, useEffect, useMemo, useRef } from 'react'
import { 
  Users, UserCheck, School, MapPin, Calendar, Award, 
  TrendingUp, AlertCircle, ChevronDown, ChevronUp,
  Shield, Activity, FileText, MoreVertical, Filter,
  Download, Search, Plus, Edit, Trash2, Mail, Phone,
  BarChart3, PieChart as PieChartIcon,
  List as ListIcon, LayoutGrid, Folder, ChevronLeft,
  CheckCircle, XCircle
} from 'lucide-react'
import { fetchList, postJson, putJson, deleteJson } from '../../utils/api'
import { ensureSession } from '../../utils/auth'
import { notifyError, notifySuccess } from '../../utils/notify'
import { API_ORIGIN, apiUrl } from '../../utils/apiBase'
import { zoneNameOf } from '../../utils/labels'
import { resizeImage } from '../../utils/image'
import bcrypt from 'bcryptjs'
import PlayerCard from '../PlayerCard'
import SchoolCard from '../SchoolCard'
import CoachCard, { CoachAvatar } from '../CoachCard'
import ExportMenu from '../ExportMenu'
import PlayerProfileModal from '../modals/PlayerProfileModal'

interface SchoolAdminDashboardProps {
  zone?: string
  school?: string
  schoolNameTop?: string
  players: any[]
  coaches: any[]
  referees: any[]
  admins: any[]
  onRefresh: () => void
}

export default function SchoolAdminDashboard({ 
  zone, 
  school, 
  schoolNameTop, 
  players, 
  coaches, 
  referees,
  admins,
  onRefresh 
}: SchoolAdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'teams' | 'coaches' | 'requests' | 'admins' | 'analytics'>('overview')
  const [selectedTeam, setSelectedTeam] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [showAddCoach, setShowAddCoach] = useState(false)
  const [editingCoach, setEditingCoach] = useState<string | null>(null)
  const [expandedStats, setExpandedStats] = useState(true)
  const [resultsView, setResultsView] = useState<'cards' | 'list'>(() => {
    try {
      return localStorage.getItem('school:players:view') === 'list' ? 'list' : 'cards'
    } catch {
      return 'cards'
    }
  })
  const [resultsSwitching, setResultsSwitching] = useState(false)
  const [viewingPlayer, setViewingPlayer] = useState<any>(null)

  useEffect(() => {
    try { localStorage.setItem('school:players:view', resultsView) } catch {}
  }, [resultsView])

  // School statistics
  const stats = useMemo(() => {
    const totalPlayers = players.length
    const totalCoaches = coaches.length
    const pendingPlayers = players.filter(p => 
      String(p.data?.status || '').toLowerCase() === 'pending'
    ).length
    const rejectedPlayers = players.filter(p => 
      String(p.data?.status || '').toLowerCase() === 'rejected'
    ).length
    const approvedPlayers = totalPlayers - pendingPlayers - rejectedPlayers
    
    const ageGroups = players.reduce((acc, p) => {
      const ag = p.data?.ageGroup || p.data?.team || 'Unassigned'
      acc[ag] = (acc[ag] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    const genderSplit = players.reduce((acc, p) => {
      const g = p.data?.gender || 'Unknown'
      acc[g] = (acc[g] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    return {
      totalPlayers,
      totalCoaches,
      pendingPlayers,
      rejectedPlayers,
      approvedPlayers,
      ageGroups,
      genderSplit
    }
  }, [players, coaches])

  // Teams derived from age groups
  const teams = useMemo(() => {
    const teamSet = new Set<string>()
    players.forEach(p => {
      const team = p.data?.team || p.data?.ageGroup || ''
      if (team) teamSet.add(team)
    })
    coaches.forEach(c => {
      const team = c.data?.team || ''
      if (team) teamSet.add(team)
    })
    return ['U15', 'U16', 'U17', 'U19'].filter(t => teamSet.has(t) || true)
  }, [players, coaches])

  // Filtered players by team
  const teamPlayers = useMemo(() => {
    let result = players;
    if (selectedTeam) {
      result = players.filter(p => (p.data?.team || p.data?.ageGroup) === selectedTeam)
    }
    // Sort alphabetically by name
    return [...result].sort((a, b) => {
      const nameA = `${a.data?.name || ''} ${a.data?.surname || ''}`.toLowerCase()
      const nameB = `${b.data?.name || ''} ${b.data?.surname || ''}`.toLowerCase()
      return nameA.localeCompare(nameB)
    })
  }, [players, selectedTeam])

  // Filtered by search
  const filteredPlayers = useMemo(() => {
    if (!searchQuery) return teamPlayers
    const q = searchQuery.toLowerCase()
    return teamPlayers.filter(p => {
      const fullName = `${p.data?.name || ''} ${p.data?.surname || ''}`.toLowerCase()
      return fullName.includes(q) || 
             String(p.data?.idNumber || '').includes(q) ||
             String(p.data?.email || '').toLowerCase().includes(q)
    })
  }, [teamPlayers, searchQuery])

  // Requests list (Pending & Rejected)
  const requestsList = useMemo(() => {
    return players.filter(p => {
      const s = String(p.data?.status || '').toLowerCase()
      return s === 'pending' || s === 'rejected'
    })
  }, [players])

  // Quick actions for coaches
  const EMPTY_COACH_FORM = { name: '', surname: '', email: '', phone: '', idNumber: '', team: '', photoUrl: '', qualifications: '', experience: '', password: '' }
  const [coachForm, setCoachForm] = useState(EMPTY_COACH_FORM)
  const [coachSearch, setCoachSearch] = useState('')
  const COACH_PAGE_SIZE = 10
  const [visibleCoachCount, setVisibleCoachCount] = useState(COACH_PAGE_SIZE)
  const coachFormRef = useRef<HTMLDivElement | null>(null)

  // The edit form sits above the list; bring it into view when opened from a row far down
  useEffect(() => {
    if (showAddCoach) {
      setTimeout(() => coachFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)
    }
  }, [showAddCoach, editingCoach])

  // Newest first so recently added coaches are immediately visible; searchable and paginated
  const coachesSorted = useMemo(() => {
    const q = coachSearch.trim().toLowerCase()
    let list = [...coaches].sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0))
    if (q) {
      list = list.filter((c) => {
        const d = c.data || {}
        return [d.name, d.surname, d.email, c.email, d.team].some((v) => String(v || '').toLowerCase().includes(q))
      })
    }
    return list
  }, [coaches, coachSearch])
  useEffect(() => { setVisibleCoachCount(COACH_PAGE_SIZE) }, [coachSearch])

  const handleAddCoach = async () => {
    if (!school || !zone) return
    await ensureSession()
    const { password, ...coachFields } = coachForm
    const credentials = password ? { passwordHash: bcrypt.hashSync(password, 10) } : {}

    if (editingCoach) {
      // Update existing coach
      const existing = coaches.find(c => c.id === editingCoach)
      if (!existing) return

      const payload = {
        ...existing.data,
        ...coachFields,
        ...credentials,
        schoolId: school,
        zoneId: zone,
        role: 'Coach'
      }
      const res = await putJson('coaches', editingCoach, payload)
      if (res) {
        setShowAddCoach(false)
        setEditingCoach(null)
        setCoachForm(EMPTY_COACH_FORM)
        onRefresh()
      } else {
        notifyError('Could not update coach. Please check the details and try again.')
      }
    } else {
      // Create new coach
      const payload = {
        ...coachFields,
        ...credentials,
        schoolId: school,
        zoneId: zone,
        role: 'Coach'
      }
      const res = await postJson('coaches', payload)
      if (res) {
        setShowAddCoach(false)
        setCoachForm(EMPTY_COACH_FORM)
        onRefresh()
      } else {
        notifyError('Could not add coach. Please check the details and try again.')
      }
    }
  }

  const handleDeleteCoach = async (coach: any) => {
    const label = `${coach.data?.name || ''} ${coach.data?.surname || ''}`.trim() || 'this coach'
    if (!confirm(`Remove ${label} from your school? This cannot be undone.`)) return
    await ensureSession()
    const ok = await deleteJson('coaches', coach.id)
    if (ok) {
      notifySuccess(`${label} removed`)
      onRefresh()
    } else {
      notifyError('Could not remove the coach. Please try again.')
    }
  }

  const startEditCoach = (coach: any) => {
    setCoachForm({
      name: coach.data?.name || '',
      surname: coach.data?.surname || '',
      email: coach.data?.email || coach.email || '',
      phone: coach.data?.phone || coach.data?.contactNumber || '',
      idNumber: coach.data?.idNumber || '',
      team: coach.data?.team || '',
      photoUrl: coach.data?.photoUrl || '',
      qualifications: coach.data?.qualifications || coach.qualifications || '',
      experience: coach.data?.experience || coach.experience || '',
      password: ''
    })
    setEditingCoach(coach.id)
    setShowAddCoach(true)
  }

  // School record (for the emblem/logo)
  const [schoolRow, setSchoolRow] = useState<any | null>(null)
  const loadSchoolRow = async () => {
    if (!school) return
    const rows = await fetchList('schools', { schoolId: school, zoneId: zone })
    setSchoolRow(Array.isArray(rows) && rows.length ? rows[0] : null)
  }
  useEffect(() => { loadSchoolRow() }, [school, zone])
  const schoolLogo = (() => {
    const u = String(schoolRow?.data?.logoUrl || '')
    return u.startsWith('/uploads') ? `${API_ORIGIN}${u}` : u
  })()

  const handleLogoUpload = async (raw: File | undefined) => {
    if (!raw || !schoolRow?.id) return
    const file = await resizeImage(raw, 256)
    const fd = new FormData()
    fd.append('file', file)
    try {
      await ensureSession()
      const t = localStorage.getItem('auth:token') || ''
      const res = await fetch(apiUrl('/upload'), { method: 'POST', headers: { ...(t ? { Authorization: `Bearer ${t}` } : {}) }, body: fd })
      if (!res.ok) return notifyError('Logo upload failed. Please try again.')
      const data = await res.json()
      const ok = await putJson('schools', schoolRow.id, { logoUrl: String(data.url || ''), schoolId: school, zoneId: zone })
      if (ok) {
        notifySuccess('School emblem updated')
        await loadSchoolRow()
      } else {
        notifyError('Could not save the school emblem.')
      }
    } catch {
      notifyError('Logo upload failed. Please try again.')
    }
  }

  // Approve / reject pending registrations from the Requests tab
  const decideRequest = async (player: any, decision: 'approve' | 'reject') => {
    await ensureSession()
    const t = localStorage.getItem('auth:token') || ''
    let body: any = {}
    if (decision === 'reject') {
      const reason = prompt(`Reason for rejecting ${player.data?.name || 'this player'} (optional):`)
      if (reason === null) return // cancelled
      body = { reason: reason || 'Rejected by school admin' }
    }
    try {
      const res = await fetch(apiUrl(`/players/${player.id}/${decision}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        notifySuccess(`${player.data?.name || 'Player'} ${player.data?.surname || ''} ${decision === 'approve' ? 'approved' : 'rejected'}`.trim())
        onRefresh()
      } else {
        notifyError(`Could not ${decision} the registration. Please try again.`)
      }
    } catch {
      notifyError(`Could not ${decision} the registration. Please try again.`)
    }
  }

  const handleOverrideRejection = async (player: any) => {
    if (!confirm(`Are you sure you want to override the rejection for ${player.data?.name}? This will approve the player.`)) return
    
    const updatedData = { 
      ...player.data, 
      status: 'approved', 
      needsReview: false,
      overrideBy: 'SchoolAdmin',
      overrideDate: Date.now()
    }
    
    const res = await putJson('players', player.id, updatedData)
    if (!res) {
      notifyError('Could not override the rejection. Please try again.')
      return
    }
    onRefresh()
  }

  return (
    <div className="space-y-6">
      {/* School Header Card */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-700 via-blue-600 to-blue-500 text-white shadow-xl">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48Y2lyY2xlIGN4PSIzMCIgY3k9IjMwIiByPSIyIi8+PC9nPjwvZz48L3N2Zz4=')] opacity-30"></div>
        <div className="relative px-8 py-8">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-6">
              <div className="group relative shrink-0">
                {schoolLogo ? (
                  <img
                    src={schoolLogo}
                    alt="School emblem"
                    className="h-24 w-24 rounded-xl bg-white object-contain p-1 ring-4 ring-white/20 shadow-sm"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                  />
                ) : (
                  <div className="flex h-24 w-24 items-center justify-center rounded-xl bg-white/10 ring-4 ring-white/20">
                    <School className="h-10 w-10 text-blue-100" />
                  </div>
                )}
                <label className="absolute inset-x-0 -bottom-2 mx-auto w-fit cursor-pointer rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-blue-900 shadow opacity-0 transition group-hover:opacity-100">
                  {schoolLogo ? 'Change emblem' : 'Add emblem'}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleLogoUpload(e.target.files?.[0])}
                  />
                </label>
              </div>
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-blue-100 text-sm font-medium uppercase tracking-wider">School Administration</span>
                </div>
                <h1 className="text-3xl font-bold mb-2">{schoolNameTop || 'School Dashboard'}</h1>
                <div className="flex items-center gap-4 text-blue-100">
                  <span className="flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    {zoneNameOf(zone) || 'No Zone Assigned'}
                  </span>
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-4xl font-bold">{stats.totalPlayers}</div>
              <div className="text-blue-100 text-sm">Total Players</div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <div className="rounded-lg bg-blue-50 p-2">
              <Users className="h-5 w-5 text-blue-600" />
            </div>
            <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded-full">
              {stats.approvedPlayers} approved
            </span>
          </div>
          <div className="text-2xl font-bold text-gray-900">{stats.totalPlayers}</div>
          <div className="text-sm text-gray-500">Total Players</div>
          {(stats.pendingPlayers > 0 || stats.rejectedPlayers > 0) && (
            <div className="mt-2 text-xs flex items-center gap-2">
              {stats.pendingPlayers > 0 && (
                <span className="text-amber-600 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {stats.pendingPlayers} pending
                </span>
              )}
              {stats.rejectedPlayers > 0 && (
                <span className="text-red-600 flex items-center gap-1">
                  <XCircle className="h-3 w-3" />
                  {stats.rejectedPlayers} rejected
                </span>
              )}
            </div>
          )}
        </div>

        <div className="rounded-xl border bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <div className="rounded-lg bg-purple-50 p-2">
              <UserCheck className="h-5 w-5 text-purple-600" />
            </div>
            <span className="text-xs font-medium text-purple-600 bg-purple-50 px-2 py-1 rounded-full">
              {coaches.length} active
            </span>
          </div>
          <div className="text-2xl font-bold text-gray-900">{stats.totalCoaches}</div>
          <div className="text-sm text-gray-500">Coaches</div>
        </div>

        <div className="rounded-xl border bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <div className="rounded-lg bg-green-50 p-2">
              <Award className="h-5 w-5 text-green-600" />
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-900">{Object.keys(stats.ageGroups).length}</div>
          <div className="text-sm text-gray-500">Active Teams</div>
        </div>

        <div className="rounded-xl border bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <div className="rounded-lg bg-amber-50 p-2">
              <Shield className="h-5 w-5 text-amber-600" />
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-900">{admins.length}</div>
          <div className="text-sm text-gray-500">School Admins</div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8">
          {[
            { id: 'overview', label: 'Overview', icon: Activity },
            { id: 'teams', label: 'Teams & Players', icon: Users },
            { id: 'coaches', label: 'Coaches', icon: UserCheck },
            { id: 'requests', label: 'Requests', icon: FileText },
            { id: 'admins', label: 'Admins', icon: Shield },
            { id: 'analytics', label: 'Analytics', icon: BarChart3 }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
              {tab.id === 'requests' && requestsList.length > 0 && (
                <span className="ml-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600">
                  {requestsList.length}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px]">
        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Age Group Distribution */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rounded-xl border bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Users className="h-5 w-5 text-blue-600" />
                  Players by Age Group
                </h3>
                <div className="space-y-3">
                  {['U15', 'U16', 'U17', 'U19'].map((age) => {
                    const count = stats.ageGroups[age] || 0
                    const percentage = stats.totalPlayers ? (count / stats.totalPlayers * 100) : 0
                    return (
                      <div key={age} className="flex items-center gap-4">
                        <span className="w-12 font-medium text-gray-700">{age}</span>
                        <div className="flex-1 h-8 bg-gray-100 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full flex items-center justify-end pr-3 transition-all duration-500"
                            style={{ width: `${Math.max(percentage, 5)}%` }}
                          >
                            {percentage > 15 && (
                              <span className="text-white text-sm font-medium">{count}</span>
                            )}
                          </div>
                        </div>
                        <span className="w-12 text-right text-sm text-gray-500">{count}</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="rounded-xl border bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-green-600" />
                  Quick Stats
                </h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <span className="text-gray-600">Pending Approvals</span>
                    <span className={`text-2xl font-bold ${stats.pendingPlayers > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                      {stats.pendingPlayers}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <span className="text-gray-600">Rejected Requests</span>
                    <span className={`text-2xl font-bold ${stats.rejectedPlayers > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                      {stats.rejectedPlayers}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <span className="text-gray-600">Total Teams</span>
                    <span className="text-2xl font-bold text-blue-600">{Object.keys(stats.ageGroups).length}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Activity */}
            <div className="rounded-xl border bg-white p-6 shadow-sm">
              <h3 className="text-lg font-semibold mb-4">Recent Players</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {players.slice(0, 8).map((player) => (
                  <PlayerCard 
                    key={player.id} 
                    player={player} 
                    badge={player.data?.ageGroup || player.data?.team || '—'}
                    onClick={() => setViewingPlayer(player)}
                  />
                ))}
                {players.length === 0 && (
                  <div className="col-span-full text-center py-8 text-gray-500">
                    No players registered yet
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TEAMS TAB */}
        {activeTab === 'teams' && (
          <div className="space-y-6">
            {/* Team Selector Toolbar */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border shadow-sm">
              <div className="flex flex-wrap items-center gap-4 w-full sm:w-auto">
                {selectedTeam ? (
                  <button 
                    onClick={() => setSelectedTeam('')}
                    className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Back to All Teams
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-gray-500" />
                    <span className="text-sm font-medium text-gray-700">Filter by Team:</span>
                    <select 
                      value={selectedTeam} 
                      onChange={(e) => setSelectedTeam(e.target.value)}
                      className="rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm py-2 pl-3 pr-8"
                    >
                      <option value="">Select Team</option>
                      {teams.map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                )}
                
                <div className="relative flex-1 sm:flex-none min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search players..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                <ExportMenu
                  players={filteredPlayers}
                  schoolName={schoolNameTop || schoolRow?.data?.name}
                  logoUrl={schoolRow?.data?.logoUrl}
                  label="Export"
                />

                {(selectedTeam || searchQuery) && (
                  <div className="inline-flex overflow-hidden rounded-lg border bg-gray-50 p-1" role="group" aria-label="Player view">
                    <button
                      type="button"
                      aria-label="List view"
                      aria-pressed={resultsView === 'list'}
                      className={`inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md transition-all ${resultsView === 'list' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                      onClick={() => {
                        if (resultsView === 'list') return
                        setResultsSwitching(true)
                        setTimeout(() => { setResultsView('list'); setResultsSwitching(false) }, 120)
                      }}
                    >
                      <ListIcon size={16} aria-hidden="true" />
                      <span className="hidden sm:inline">List</span>
                    </button>
                    <button
                      type="button"
                      aria-label="Card view"
                      aria-pressed={resultsView === 'cards'}
                      className={`inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md transition-all ${resultsView === 'cards' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                      onClick={() => {
                        if (resultsView === 'cards') return
                        setResultsSwitching(true)
                        setTimeout(() => { setResultsView('cards'); setResultsSwitching(false) }, 120)
                      }}
                    >
                      <LayoutGrid size={16} aria-hidden="true" />
                      <span className="hidden sm:inline">Cards</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Team Stats */}
            {selectedTeam && (
              <div className="rounded-xl bg-blue-50 p-4 border border-blue-100 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-blue-900">{selectedTeam} Team</h3>
                  <p className="text-blue-600 text-sm">{teamPlayers.length} players registered</p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-blue-900">
                    {coaches.filter(c => c.data?.team === selectedTeam).length}
                  </div>
                  <div className="text-sm text-blue-600">Coaches</div>
                </div>
              </div>
            )}

            {/* Players Grid / List */}
            <div className={`transition-opacity duration-200 ${resultsSwitching ? 'opacity-50' : 'opacity-100'}`}>
              {/* Folder View for All Teams */}
              {!selectedTeam && !searchQuery ? (
                <div className="space-y-8">
                  {teams.map(team => {
                    const playersInTeam = filteredPlayers.filter(p => (p.data?.team || p.data?.ageGroup) === team)
                    const coachesInTeam = coaches.filter(c => c.data?.team === team)
                    
                    if (playersInTeam.length === 0 && coachesInTeam.length === 0) return null
                    
                    return (
                      <div key={team} className="space-y-4">
                        <div className="flex items-center gap-3 border-b pb-2">
                          <h4 className="text-lg font-bold text-gray-900">{team}</h4>
                          <div className="flex gap-2">
                            <span className="text-sm font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{playersInTeam.length} Players</span>
                            <span className="text-sm font-medium text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">{coachesInTeam.length} Coaches</span>
                          </div>
                        </div>

                        {/* Coaches in Team */}
                        {coachesInTeam.length > 0 && (
                          <div className="mb-4">
                            <h5 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Coaches</h5>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                              {coachesInTeam.map(coach => (
                                <div key={coach.id} className="flex items-center gap-3 p-3 bg-purple-50 rounded-lg border border-purple-100">
                                  <CoachAvatar coach={coach} size="sm" />
                                  <div className="overflow-hidden">
                                    <div className="font-medium text-sm text-gray-900 truncate">
                                      {coach.data?.name} {coach.data?.surname}
                                    </div>
                                    <div className="text-xs text-gray-500 truncate">
                                      {coach.data?.position || coach.data?.email}
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => { setActiveTab('coaches'); startEditCoach(coach); }}
                                    className="ml-auto p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-100 rounded-md"
                                  >
                                    <Edit className="h-3 w-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <h5 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Players</h5>
                        {resultsView === 'list' ? (
                          <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
                            <div className="overflow-x-auto">
                              <table className="w-full border-separate border-spacing-0 text-sm">
                                <thead>
                                  <tr className="bg-gray-50">
                                    <th className="sticky top-0 border-b px-6 py-3 text-left font-semibold text-gray-900">Name</th>
                                    <th className="sticky top-0 border-b px-6 py-3 text-left font-semibold text-gray-900">Surname</th>
                                    <th className="sticky top-0 border-b px-6 py-3 text-left font-semibold text-gray-900">Status</th>
                                    <th className="sticky top-0 border-b px-6 py-3 text-right font-semibold text-gray-900">Actions</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                  {playersInTeam.map((player) => {
                                    const dn = player.data || {}
                                    const isPending = String(dn.status || '').toLowerCase() === 'pending'
                                    const isRejected = String(dn.status || '').toLowerCase() === 'rejected'
                                    return (
                                      <tr key={player.id} className={`hover:bg-gray-50 transition-colors ${isPending ? 'bg-amber-50/50' : isRejected ? 'bg-red-50/50' : ''}`}>
                                        <td className="px-6 py-4 font-medium text-gray-900">{dn.name}</td>
                                        <td className="px-6 py-4 text-gray-700">{dn.surname}</td>
                                        <td className="px-6 py-4">
                                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border ${
                                            isPending ? 'bg-amber-100 text-amber-800 border-amber-200' : 
                                            isRejected ? 'bg-red-100 text-red-800 border-red-200' :
                                            'bg-green-100 text-green-800 border-green-200'
                                          }`}>
                                            {isPending ? 'Pending' : isRejected ? 'Rejected' : 'Approved'}
                                          </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                          <button 
                                            onClick={() => setViewingPlayer(player)}
                                            className="text-blue-600 hover:text-blue-800 font-medium text-xs bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-md transition-colors"
                                          >
                                            View
                                          </button>
                                        </td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {playersInTeam.map((player) => (
                              <PlayerCard 
                                key={player.id} 
                                player={player}
                                badge={player.data?.ageGroup || player.data?.team || '—'}
                                onClick={() => setViewingPlayer(player)}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                /* Filtered View (Grid or List) */
                <>
                  {resultsView === 'list' ? (
                    <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
                      <div className="overflow-x-auto">
                        <table className="w-full border-separate border-spacing-0 text-sm">
                          <thead>
                            <tr className="bg-gray-50">
                              <th className="sticky top-0 border-b px-6 py-3 text-left font-semibold text-gray-900">Team</th>
                              <th className="sticky top-0 border-b px-6 py-3 text-left font-semibold text-gray-900">Name</th>
                              <th className="sticky top-0 border-b px-6 py-3 text-left font-semibold text-gray-900">Surname</th>
                              <th className="sticky top-0 border-b px-6 py-3 text-left font-semibold text-gray-900 hidden sm:table-cell">Age Group</th>
                              <th className="sticky top-0 border-b px-6 py-3 text-left font-semibold text-gray-900">Status</th>
                              <th className="sticky top-0 border-b px-6 py-3 text-right font-semibold text-gray-900">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {filteredPlayers.map((player) => {
                              const dn = player.data || {}
                              const t = String(dn.team || dn.ageGroup || '') || '—'
                              const isPending = String(dn.status || '').toLowerCase() === 'pending'
                              const isRejected = String(dn.status || '').toLowerCase() === 'rejected'
                              return (
                                <tr key={player.id} className={`hover:bg-gray-50 transition-colors ${isPending ? 'bg-amber-50/50' : isRejected ? 'bg-red-50/50' : ''}`}>
                                  <td className="px-6 py-4 text-gray-700 font-medium">{t}</td>
                                  <td className="px-6 py-4 font-medium text-gray-900">{dn.name}</td>
                                  <td className="px-6 py-4 text-gray-700">{dn.surname}</td>
                                  <td className="px-6 py-4 text-gray-700 hidden sm:table-cell">{dn.ageGroup || t}</td>
                                  <td className="px-6 py-4">
                                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border ${
                                      isPending ? 'bg-amber-100 text-amber-800 border-amber-200' : 
                                      isRejected ? 'bg-red-100 text-red-800 border-red-200' :
                                      'bg-green-100 text-green-800 border-green-200'
                                    }`}>
                                      {isPending ? 'Pending' : isRejected ? 'Rejected' : 'Approved'}
                                    </span>
                                  </td>
                                  <td className="px-6 py-4 text-right">
                                    <button 
                                      onClick={() => setViewingPlayer(player)}
                                      className="text-blue-600 hover:text-blue-800 font-medium text-xs bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-md transition-colors"
                                    >
                                      View
                                    </button>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                      {filteredPlayers.map((player) => (
                        <PlayerCard 
                          key={player.id} 
                          player={player}
                          badge={player.data?.ageGroup || player.data?.team || '—'}
                          onClick={() => setViewingPlayer(player)}
                        />
                      ))}
                    </div>
                  )}
                  
                  {filteredPlayers.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-16 text-center bg-white rounded-xl border border-dashed">
                      <div className="p-3 bg-gray-50 rounded-full mb-4">
                        <Search className="h-6 w-6 text-gray-400" />
                      </div>
                      <h3 className="text-lg font-medium text-gray-900">No players found</h3>
                      <p className="text-gray-500 mt-1">Try adjusting your search or filters</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* COACHES TAB */}
        {activeTab === 'coaches' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Manage Coaches</h3>
              <button 
                onClick={() => {
                  setEditingCoach(null)
                  setCoachForm(EMPTY_COACH_FORM)
                  setShowAddCoach(true)
                }}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" />
                Add Coach
              </button>
            </div>

            {showAddCoach && (
              <div ref={coachFormRef} className="rounded-xl border bg-white p-6 shadow-sm">
                <h4 className="font-medium mb-4">{editingCoach ? 'Edit Coach' : 'Add New Coach'}</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <input
                    placeholder="Name"
                    value={coachForm.name}
                    onChange={(e) => setCoachForm({...coachForm, name: e.target.value})}
                    className="px-4 py-2 border rounded-lg"
                  />
                  <input
                    placeholder="Surname"
                    value={coachForm.surname}
                    onChange={(e) => setCoachForm({...coachForm, surname: e.target.value})}
                    className="px-4 py-2 border rounded-lg"
                  />
                  <input
                    placeholder="Email"
                    type="email"
                    value={coachForm.email}
                    onChange={(e) => setCoachForm({...coachForm, email: e.target.value})}
                    className="px-4 py-2 border rounded-lg"
                  />
                  <input
                    placeholder="Phone"
                    value={coachForm.phone}
                    onChange={(e) => setCoachForm({...coachForm, phone: e.target.value})}
                    className="px-4 py-2 border rounded-lg"
                  />
                  <input
                    placeholder="ID Number"
                    value={coachForm.idNumber}
                    onChange={(e) => setCoachForm({...coachForm, idNumber: e.target.value})}
                    className="px-4 py-2 border rounded-lg"
                  />
                  <select
                    value={coachForm.team}
                    onChange={(e) => setCoachForm({...coachForm, team: e.target.value})}
                    className="px-4 py-2 border rounded-lg"
                  >
                    <option value="">Select Team</option>
                    {teams.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <input
                    placeholder="Qualification (e.g. Level 1)"
                    value={coachForm.qualifications}
                    onChange={(e) => setCoachForm({...coachForm, qualifications: e.target.value})}
                    className="px-4 py-2 border rounded-lg"
                  />
                  <input
                    placeholder="Years of experience"
                    type="number"
                    min={0}
                    value={coachForm.experience}
                    onChange={(e) => setCoachForm({...coachForm, experience: e.target.value})}
                    className="px-4 py-2 border rounded-lg"
                  />
                  <input
                    placeholder={editingCoach ? 'New login password (optional)' : 'Initial login password (optional)'}
                    type="password"
                    autoComplete="new-password"
                    value={coachForm.password}
                    onChange={(e) => setCoachForm({...coachForm, password: e.target.value})}
                    className="px-4 py-2 border rounded-lg sm:col-span-2"
                  />
                  <label className="flex items-center gap-3 sm:col-span-2">
                    {coachForm.photoUrl ? (
                      <img
                        src={coachForm.photoUrl.startsWith('/uploads') ? `${API_ORIGIN}${coachForm.photoUrl}` : coachForm.photoUrl}
                        alt="Coach"
                        className="h-12 w-12 rounded-full object-cover ring-2 ring-purple-200"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                      />
                    ) : (
                      <span className="text-sm text-gray-500">Photo:</span>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      className="flex-1 px-4 py-2 border rounded-lg text-sm"
                      onChange={async (e) => {
                        const raw = e.target.files?.[0]
                        if (!raw) return
                        const file = await resizeImage(raw)
                        const fd = new FormData()
                        fd.append('file', file)
                        try {
                          const t = localStorage.getItem('auth:token') || ''
                          const res = await fetch(apiUrl('/upload'), { method: 'POST', headers: { ...(t ? { Authorization: `Bearer ${t}` } : {}) }, body: fd })
                          if (res.ok) {
                            const data = await res.json()
                            setCoachForm((prev) => ({ ...prev, photoUrl: String(data.url || '') }))
                          }
                        } catch {}
                      }}
                    />
                  </label>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={handleAddCoach}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    {editingCoach ? 'Update Coach' : 'Save Coach'}
                  </button>
                  <button 
                    onClick={() => { setShowAddCoach(false); setEditingCoach(null); }}
                    className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Search within this season's coaches */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search coaches by name, email or team..."
                value={coachSearch}
                onChange={(e) => setCoachSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                aria-label="Search coaches"
              />
            </div>

            {/* Coaches List (newest first, paginated) */}
            <div className="grid grid-cols-1 gap-4">
              {coachesSorted.slice(0, visibleCoachCount).map((coach) => (
                <CoachCard
                  key={coach.id}
                  coach={coach}
                  actions={
                    <>
                      <button
                        onClick={() => startEditCoach(coach)}
                        className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600"
                        aria-label="Edit coach"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteCoach(coach)}
                        className="p-2 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-600"
                        aria-label="Delete coach"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  }
                />
              ))}
              {coachesSorted.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  {coachSearch ? 'No coaches match your search' : 'No coaches registered yet'}
                </div>
              )}
              {coachesSorted.length > visibleCoachCount && (
                <button
                  type="button"
                  onClick={() => setVisibleCoachCount((n) => n + COACH_PAGE_SIZE)}
                  className="rounded-lg border border-dashed border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  Show more ({coachesSorted.length - visibleCoachCount} remaining)
                </button>
              )}
            </div>
          </div>
        )}

        {/* REQUESTS TAB */}
        {activeTab === 'requests' && (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold">Pending Requests & Approvals</h3>
            <div className="space-y-4">
              {requestsList.map((player) => {
                const status = String(player.data?.status || '').toLowerCase()
                const isRejected = status === 'rejected'
                
                return (
                  <div key={player.id} className="rounded-xl border bg-white p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className={`h-12 w-12 rounded-full flex items-center justify-center font-bold text-lg ${
                        isRejected ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'
                      }`}>
                        {(player.data?.name?.[0] || '')}{(player.data?.surname?.[0] || '')}
                      </div>
                      <div>
                        <div className="font-medium text-gray-900 flex items-center gap-2">
                          {player.data?.name} {player.data?.surname}
                          <span className={`px-2 py-0.5 text-xs rounded-full border ${
                            isRejected ? 'bg-red-50 text-red-700 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}>
                            {isRejected ? 'Rejected' : 'Pending Approval'}
                          </span>
                        </div>
                        <div className="text-sm text-gray-500 flex items-center gap-3">
                          <span>{player.data?.ageGroup || player.data?.team || 'No Team'}</span>
                          <span>•</span>
                          <span>{player.data?.idNumber}</span>
                        </div>
                        {isRejected && player.data?.rejectionReason && (
                          <div className="text-sm text-red-600 mt-1">
                            Reason: {player.data.rejectionReason}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      <button
                        onClick={() => setViewingPlayer(player)}
                        className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                      >
                        View Details
                      </button>
                      {isRejected ? (
                        <button
                          onClick={() => handleOverrideRejection(player)}
                          className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 flex items-center gap-2"
                        >
                          <Shield className="h-3 w-3" />
                          Override Rejection
                        </button>
                      ) : (
                        <div className="flex gap-2">
                           <button
                             onClick={() => decideRequest(player, 'reject')}
                             className="px-3 py-1.5 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100"
                           >
                             Reject
                           </button>
                           <button
                             onClick={() => decideRequest(player, 'approve')}
                             className="px-3 py-1.5 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100"
                           >
                             Approve
                           </button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
              
              {requestsList.length === 0 && (
                <div className="text-center py-12 text-gray-500 border border-dashed rounded-xl">
                  <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3 opacity-20" />
                  <p>All caught up! No pending requests.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ADMINS TAB */}
        {activeTab === 'admins' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Manage School Admins</h3>
            </div>

            {/* School admins cannot create admins (server restricts POST /api/admins
                to EPHSRUAdmin and ZoneCoordinator), so no Add Admin form here. */}
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>School admin accounts are provisioned by your zone coordinator. Contact them to add or change admins for this school.</span>
            </div>

            {/* Admins List */}
            <div className="grid grid-cols-1 gap-4">
              {admins.map((admin) => (
                <div key={admin.id} className="rounded-xl border bg-white p-4 shadow-sm flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 font-bold">
                      {(admin.data?.name?.[0] || '')}{(admin.data?.surname?.[0] || '')}
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">
                        {admin.data?.name} {admin.data?.surname}
                      </div>
                      <div className="text-sm text-gray-500 flex items-center gap-3">
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {admin.data?.email || admin.email}
                        </span>
                        <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded text-xs">
                          School Admin
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {admins.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  No admins registered yet
                </div>
              )}
            </div>
          </div>
        )}

        {/* ANALYTICS TAB */}
        {activeTab === 'analytics' && (
          <div className="space-y-6">
            <div className="rounded-xl border bg-white p-6 shadow-sm">
              <h3 className="text-lg font-semibold mb-6">School Analytics</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Gender Distribution */}
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-4">Gender Distribution</h4>
                  <div className="space-y-3">
                    {Object.entries(stats.genderSplit).map(([gender, count]) => {
                      const n = Number(count) || 0
                      const percentage = stats.totalPlayers ? (n / stats.totalPlayers * 100) : 0
                      return (
                        <div key={gender} className="flex items-center gap-4">
                          <span className="w-20 text-sm text-gray-600">{gender}</span>
                          <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full flex items-center justify-end pr-2 transition-all duration-500 ${
                                gender === 'Male' ? 'bg-blue-500' : 
                                gender === 'Female' ? 'bg-pink-500' : 'bg-gray-500'
                              }`}
                              style={{ width: `${Math.max(percentage, 5)}%` }}
                            />
                          </div>
                          <span className="w-12 text-right text-sm text-gray-500">{n}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Registration Status */}
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-4">Registration Status</h4>
                  <div className="space-y-3">
                    <div className="flex items-center gap-4">
                      <span className="w-20 text-sm text-gray-600">Approved</span>
                      <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-green-500 rounded-full transition-all duration-500"
                          style={{ width: `${stats.totalPlayers ? (stats.approvedPlayers / stats.totalPlayers * 100) : 0}%` }}
                        />
                      </div>
                      <span className="w-12 text-right text-sm text-gray-500">{stats.approvedPlayers}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="w-20 text-sm text-gray-600">Pending</span>
                      <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-amber-500 rounded-full transition-all duration-500"
                          style={{ width: `${stats.totalPlayers ? (stats.pendingPlayers / stats.totalPlayers * 100) : 0}%` }}
                        />
                      </div>
                      <span className="w-12 text-right text-sm text-gray-500">{stats.pendingPlayers}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {viewingPlayer && (
        <PlayerProfileModal
          player={viewingPlayer}
          role="SchoolAdmin"
          onClose={() => setViewingPlayer(null)}
          onUpdated={() => { onRefresh() }}
        />
      )}
    </div>
  )
}