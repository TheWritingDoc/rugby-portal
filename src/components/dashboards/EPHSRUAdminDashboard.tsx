import { useState, useMemo, useEffect } from 'react'
import {
  Users, UserCheck, School, MapPin, Shield, Activity,
  AlertCircle, CheckCircle, XCircle, Search,
  Download, Plus, BarChart3,
  FileText, Globe, UserCog, MoreHorizontal,
  ChevronRight, ChevronLeft, Award, Clock, CheckSquare, Crown,
  PieChart as PieChartIcon, Eye, List as ListIcon, LayoutGrid,
  Mail, Phone
} from 'lucide-react'
import { apiUrl } from '../../utils/apiBase'
import { getToken } from '../../utils/auth'
import { notifyError } from '../../utils/notify'
import { CoachAvatar } from '../CoachCard'
import PlayerProfileModal from '../modals/PlayerProfileModal'
import StaffProfileModal from '../modals/StaffProfileModal'
import { schoolNameOf, zoneNameOf } from '../../utils/labels'

interface EPHSRUAdminDashboardProps {
  zones: any[]
  schools: any[]
  players: any[]
  coaches: any[]
  referees: any[]
  admins: any[]
  onRefresh: () => void
}

interface PendingApproval {
  id: string
  type: 'player' | 'coach' | 'school' | 'zone'
  name: string
  school?: string
  zone?: string
  submittedAt: string
}

// Tailwind cannot see dynamically-built class names, so each accent color is mapped to static classes
const ACCENT: Record<string, { soft: string; softHover: string; tint: string; solid: string; icon: string; text: string; deep: string }> = {
  indigo: { soft: 'bg-indigo-50', softHover: 'hover:bg-indigo-100', tint: 'bg-indigo-100', solid: 'bg-indigo-600', icon: 'text-indigo-600', text: 'text-indigo-600', deep: 'text-indigo-900' },
  purple: { soft: 'bg-purple-50', softHover: 'hover:bg-purple-100', tint: 'bg-purple-100', solid: 'bg-purple-600', icon: 'text-purple-600', text: 'text-purple-600', deep: 'text-purple-900' },
  blue:   { soft: 'bg-blue-50',   softHover: 'hover:bg-blue-100',   tint: 'bg-blue-100',   solid: 'bg-blue-600',   icon: 'text-blue-600',   text: 'text-blue-600',   deep: 'text-blue-900' },
  green:  { soft: 'bg-green-50',  softHover: 'hover:bg-green-100',  tint: 'bg-green-100',  solid: 'bg-green-600',  icon: 'text-green-600',  text: 'text-green-600',  deep: 'text-green-900' },
  amber:  { soft: 'bg-amber-50',  softHover: 'hover:bg-amber-100',  tint: 'bg-amber-100',  solid: 'bg-amber-600',  icon: 'text-amber-600',  text: 'text-amber-600',  deep: 'text-amber-900' },
  rose:   { soft: 'bg-rose-50',   softHover: 'hover:bg-rose-100',   tint: 'bg-rose-100',   solid: 'bg-rose-600',   icon: 'text-rose-600',   text: 'text-rose-600',   deep: 'text-rose-900' },
  gray:   { soft: 'bg-gray-50',   softHover: 'hover:bg-gray-100',   tint: 'bg-gray-100',   solid: 'bg-gray-600',   icon: 'text-gray-600',   text: 'text-gray-600',   deep: 'text-gray-900' },
}

export default function EPHSRUAdminDashboard({ 
  zones, schools, players, coaches, referees, admins, onRefresh 
}: EPHSRUAdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'zones' | 'schools' | 'users' | 'approvals' | 'analytics'>('overview')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedZone, setSelectedZone] = useState('')
  const [selectedZoneDetail, setSelectedZoneDetail] = useState<any>(null)
  const [selectedSchoolDetail, setSelectedSchoolDetail] = useState<any>(null)
  const [hideUnregistered, setHideUnregistered] = useState(false)
  // Profile modals: any player/staff member anywhere in the union is one click away
  const [viewingPlayer, setViewingPlayer] = useState<any>(null)
  const [viewingStaff, setViewingStaff] = useState<{ person: any; role: 'Coach' | 'Referee' | 'SchoolAdmin' | 'ZoneCoordinator' | 'EPHSRUAdmin' } | null>(null)
  const [expandedSchool, setExpandedSchool] = useState<string>('')

  useEffect(() => {
    // Reset drill-down states when changing main tabs; the search box is
    // per-tab in spirit, so clear it too (a Users search must not silently
    // filter the Schools tab's coordinator list).
    if (activeTab !== 'schools') {
      setSelectedZone('')
      setSelectedSchoolDetail(null)
    }
    setSearchQuery('')
  }, [activeTab])
  const [resultsView, setResultsView] = useState<'cards' | 'list'>(() => {
    try {
      return localStorage.getItem('ephsru:approvals:view') === 'list' ? 'list' : 'cards'
    } catch {
      return 'cards'
    }
  })
  const [resultsSwitching, setResultsSwitching] = useState(false)

  useEffect(() => {
    try { localStorage.setItem('ephsru:approvals:view', resultsView) } catch {}
  }, [resultsView])

  const stats = useMemo(() => ({
    totalZones: zones.length,
    totalSchools: schools.length,
    totalPlayers: players.length,
    totalCoaches: coaches.length,
    totalReferees: referees.length,
    totalAdmins: admins.length,
    pendingPlayers: players.filter(p => String(p.data?.status || '').toLowerCase() === 'pending').length,
    approvedPlayers: players.length - players.filter(p => String(p.data?.status || '').toLowerCase() === 'pending').length,
    playersByAgeGroup: players.reduce((acc, p) => {
      const ag = p.data?.ageGroup || p.data?.team || 'Unassigned'
      acc[ag] = (acc[ag] || 0) + 1
      return acc
    }, {} as Record<string, number>)
  }), [zones, schools, players, coaches, referees, admins])

  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([])
  const [approvalsLoading, setApprovalsLoading] = useState(false)
  const [decidingId, setDecidingId] = useState<string>('')

  async function loadApprovals() {
    setApprovalsLoading(true)
    try {
      const res = await fetch(apiUrl('/approvals?status=pending&pageSize=100'), {
        headers: { Authorization: `Bearer ${getToken()}` }
      })
      if (res.ok) {
        const data = await res.json()
        const rows = Array.isArray(data?.rows) ? data.rows : []
        setPendingApprovals(rows.map((r: any) => ({
          id: String(r.id),
          type: r.entityType === 'players' ? 'player' as const : 'school' as const,
          name: r.player ? `${r.player.name} ${r.player.surname}`.trim() || r.entityId : r.entityId,
          school: r.player?.schoolId || '',
          zone: r.player?.zoneId || '',
          submittedAt: r.createdAt ? new Date(Number(r.createdAt)).toLocaleDateString() : '',
        })))
      } else {
        notifyError('Could not load pending approvals')
      }
    } catch {
      notifyError('Could not load pending approvals')
    }
    setApprovalsLoading(false)
  }

  useEffect(() => { loadApprovals() }, [])

  async function decideApproval(id: string, status: 'approved' | 'rejected') {
    setDecidingId(id)
    try {
      const res = await fetch(apiUrl(`/approvals/${encodeURIComponent(id)}/decision`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ status })
      })
      if (res.ok) {
        setPendingApprovals((prev) => prev.filter((a) => a.id !== id))
        onRefresh()
      }
    } catch {}
    setDecidingId('')
  }

  async function approveAll() {
    for (const a of pendingApprovals) {
      await decideApproval(a.id, 'approved')
    }
  }

  const getApprovalIcon = (type: string) => {
    switch (type) {
      case 'player': return Users
      case 'coach': return UserCheck
      case 'school': return School
      default: return FileText
    }
  }

  // Zone Detail View
  if (selectedZoneDetail) {
    const zoneSchools = schools.filter(s => {
      const sZoneId = String(s.data?.zoneId || s.zoneId || '')
      const targetZoneId = String(selectedZoneDetail.id || selectedZoneDetail.data?.id || '')
      return sZoneId === targetZoneId
    })
    const zonePlayers = players.filter(p => {
      const pZoneId = String(p.data?.zoneId || p.zoneId || '')
      const targetZoneId = String(selectedZoneDetail.id || selectedZoneDetail.data?.id || '')
      return pZoneId === targetZoneId
    })
    const zoneCoaches = coaches.filter(c => {
      const cZoneId = String(c.data?.zoneId || c.zoneId || '')
      const targetZoneId = String(selectedZoneDetail.id || selectedZoneDetail.data?.id || '')
      return cZoneId === targetZoneId
    })
    const coordinator = admins.find(a => {
      const aZoneId = String(a.data?.zoneId || a.zoneId || '')
      const targetZoneId = String(selectedZoneDetail.id || selectedZoneDetail.data?.id || '')
      return a.role === 'ZoneCoordinator' && aZoneId === targetZoneId
    })

    return (
      <div className="space-y-6">
        <button onClick={() => setSelectedZoneDetail(null)} className="flex items-center gap-2 text-indigo-600 font-medium hover:underline">
          <ChevronLeft className="h-4 w-4" /> Back to Dashboard
        </button>

        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-700 via-purple-600 to-indigo-800 text-white shadow-xl">
            <div className="absolute inset-0 opacity-30"></div>
            <div className="relative px-8 py-8">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <MapPin className="h-8 w-8 text-purple-200" />
                    <span className="text-purple-100 text-sm font-medium uppercase tracking-wider">Zone Detail</span>
                  </div>
                  <h1 className="text-3xl font-bold mb-2">{selectedZoneDetail.data?.name || selectedZoneDetail.name}</h1>
                  <div className="flex items-center gap-4 mt-4 text-sm text-purple-100">
                    <span className="flex items-center gap-1"><School className="h-4 w-4" />{zoneSchools.length} Schools</span>
                    <span>•</span>
                    <span className="flex items-center gap-1"><Users className="h-4 w-4" />{zonePlayers.length} Players</span>
                     <span>•</span>
                    <span className="flex items-center gap-1"><UserCheck className="h-4 w-4" />{zoneCoaches.length} Coaches</span>
                  </div>
                </div>
                {coordinator && (
                  <div className="text-right">
                     <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-sm rounded-lg mb-2">
                        <Shield className="h-5 w-5 text-purple-200" />
                        <span className="font-medium">Coordinator</span>
                      </div>
                      <div className="text-xl font-bold">{coordinator.data?.name} {coordinator.data?.surname}</div>
                      <div className="text-purple-200 text-sm">{coordinator.email}</div>
                  </div>
                )}
              </div>
            </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {zoneSchools.map(school => {
                const sPlayers = zonePlayers.filter(p => String(p.data?.schoolId || '') === String(school.id)).length
                const sCoaches = zoneCoaches.filter(c => String(c.data?.schoolId || '') === String(school.id)).length
                const isActive = sPlayers > 0 || sCoaches > 0

                return (
                    <div key={school.id} className="group relative overflow-hidden rounded-xl border bg-white p-6 shadow-sm hover:shadow-md transition-all">
                        <div className={`absolute top-0 right-0 p-2 ${isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'} rounded-bl-xl text-xs font-bold`}>
                            {isActive ? 'Active' : 'Inactive'}
                        </div>
                        <div className="flex items-center gap-4 mb-4">
                            <div className="h-12 w-12 rounded-full bg-indigo-50 flex items-center justify-center">
                                <School className="h-6 w-6 text-indigo-600" />
                            </div>
                            <div>
                                <h3 className="font-bold text-gray-900 line-clamp-1">{school.data?.name || school.name}</h3>
                                <div className="text-xs text-gray-500">ID: {school.schoolId || school.id.slice(0, 8)}</div>
                            </div>
                        </div>
                         <div className="grid grid-cols-2 gap-4 border-t pt-4">
                            <div className="text-center">
                                <div className="text-2xl font-bold text-gray-900">{sPlayers}</div>
                                <div className="text-xs text-gray-500 uppercase tracking-wide">Players</div>
                            </div>
                            <div className="text-center border-l">
                                <div className="text-2xl font-bold text-gray-900">{sCoaches}</div>
                                <div className="text-xs text-gray-500 uppercase tracking-wide">Coaches</div>
                            </div>
                        </div>
                    </div>
                )
            })}
             {zoneSchools.length === 0 && (
                <div className="col-span-full py-12 text-center text-gray-500 border-2 border-dashed rounded-xl">
                  No schools found in this zone.
                </div>
              )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-700 via-purple-600 to-indigo-800 text-white shadow-xl">
        <div className="absolute inset-0 opacity-30"></div>
        <div className="relative px-8 py-8">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <Crown className="h-8 w-8 text-purple-200" />
                <span className="text-purple-100 text-sm font-medium uppercase tracking-wider">System Administration</span>
              </div>
              <h1 className="text-3xl font-bold mb-2">EPHSRU Dashboard</h1>
              <p className="text-purple-100">Eastern Province High Schools Rugby Union</p>
              <div className="flex items-center gap-4 mt-4 text-sm text-purple-100">
                <span className="flex items-center gap-1"><Globe className="h-4 w-4" />{stats.totalZones} Zones</span>
                <span>•</span>
                <span className="flex items-center gap-1"><School className="h-4 w-4" />{stats.totalSchools} Registered Schools</span>
                <span>•</span>
                <span className="flex items-center gap-1"><Users className="h-4 w-4" />{stats.totalPlayers.toLocaleString()} Players</span>
              </div>
            </div>
            <div className="hidden md:block">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-sm rounded-lg">
                <Shield className="h-5 w-5 text-purple-200" />
                <span className="font-medium">Super Admin</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { icon: MapPin, label: 'Zones', value: stats.totalZones, color: 'indigo', tab: 'zones' },
          { icon: School, label: 'Schools', value: stats.totalSchools, color: 'purple', tab: 'schools' },
          { icon: Users, label: 'Players', value: stats.totalPlayers, color: 'blue', tab: 'users' },
          { icon: UserCheck, label: 'Coaches', value: stats.totalCoaches, color: 'green', tab: 'users' },
          { icon: Award, label: 'Referees', value: stats.totalReferees, color: 'amber', tab: 'users' },
          { icon: Shield, label: 'Admins', value: stats.totalAdmins, color: 'rose', tab: 'users' }
        ].map((stat) => (
          <div key={stat.label}
            className="rounded-xl border bg-white p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
            onClick={() => setActiveTab(stat.tab as any || 'overview')}
          >
            <div className={`rounded-lg ${(ACCENT[stat.color] || ACCENT.gray).soft} p-2 w-fit mb-3`}>
              <stat.icon className={`h-5 w-5 ${(ACCENT[stat.color] || ACCENT.gray).icon}`} />
            </div>
            <div className="text-2xl font-bold text-gray-900">{stat.value.toLocaleString()}</div>
            <div className="text-sm text-gray-500">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-1 overflow-x-auto">
          {[
            { id: 'overview', label: 'Overview', icon: Activity },
            { id: 'zones', label: 'Zones', icon: MapPin },
            { id: 'schools', label: 'Schools', icon: School },
            { id: 'users', label: 'Users', icon: Users },
            { id: 'approvals', label: 'Approvals', icon: CheckSquare, badge: pendingApprovals.length },
            { id: 'analytics', label: 'Analytics', icon: BarChart3 }
          ].map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 py-4 px-4 border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
                activeTab === tab.id ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              <tab.icon className="h-4 w-4" />
              {tab.label}
              {'badge' in tab && (tab.badge ?? 0) > 0 && (
                <span className="ml-1 px-2 py-0.5 text-xs bg-amber-100 text-amber-700 rounded-full">{tab.badge}</span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px]">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Quick Actions */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {[
                { icon: MapPin, label: 'Browse Zones', desc: 'View all zones', color: 'indigo', tab: 'zones' },
                { icon: School, label: 'Browse Schools', desc: 'Drill into schools', color: 'purple', tab: 'schools' },
                { icon: UserCog, label: 'Manage Users', desc: 'View all users', color: 'blue', tab: 'users' },
                { icon: CheckSquare, label: 'Review Approvals', desc: 'Decide pending requests', color: 'green', tab: 'approvals' }
              ].map((action) => {
                const c = ACCENT[action.color] || ACCENT.gray
                return (
                  <button
                    key={action.label}
                    onClick={() => setActiveTab(action.tab as any)}
                    className={`flex items-center gap-3 p-4 ${c.soft} ${c.softHover} rounded-xl transition-colors text-left`}
                  >
                    <div className={`p-3 ${c.solid} text-white rounded-lg`}>
                      <action.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <div className={`font-medium ${c.deep}`}>{action.label}</div>
                      <div className={`text-sm ${c.text}`}>{action.desc}</div>
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Age Group Chart */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rounded-xl border bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Users className="h-5 w-5 text-indigo-600" />
                  Players by Age Group
                </h3>
                <div className="space-y-3">
                  {['U15', 'U16', 'U17', 'U19'].map((age) => {
                    const count = stats.playersByAgeGroup[age] || 0
                    const percentage = stats.totalPlayers ? (count / stats.totalPlayers * 100) : 0
                    return (
                      <div key={age} className="flex items-center gap-4">
                        <span className="w-12 font-medium text-gray-700">{age}</span>
                        <div className="flex-1 h-8 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-400 rounded-full flex items-center justify-end pr-3 transition-all duration-500"
                            style={{ width: `${Math.max(percentage, 5)}%` }}>
                            {percentage > 15 && <span className="text-white text-sm font-medium">{count}</span>}
                          </div>
                        </div>
                        <span className="w-12 text-right text-sm text-gray-500">{count}</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Registration Stats */}
              <div className="rounded-xl border bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <PieChartIcon className="h-5 w-5 text-purple-600" />
                  Registration Overview
                </h3>
                <div className="space-y-4">
                  {[
                    { icon: CheckCircle, label: 'Approved', value: stats.approvedPlayers, color: 'green' },
                    { icon: Clock, label: 'Pending', value: stats.pendingPlayers, color: stats.pendingPlayers > 0 ? 'amber' : 'gray' },
                    { icon: Users, label: 'Total Users', value: stats.totalPlayers + stats.totalCoaches + stats.totalReferees + stats.totalAdmins, color: 'blue' }
                  ].map((stat) => {
                    const c = ACCENT[stat.color] || ACCENT.gray
                    return (
                      <div key={stat.label} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 ${c.tint} rounded-lg`}>
                            <stat.icon className={`h-4 w-4 ${c.icon}`} />
                          </div>
                          <span className="text-gray-600">{stat.label}</span>
                        </div>
                        <span className={`text-2xl font-bold ${c.text}`}>{stat.value.toLocaleString()}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Pending Approvals */}
            <div className="rounded-xl border bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-amber-600" />
                  Pending Approvals
                </h3>
                <button onClick={() => setActiveTab('approvals')} className="text-sm text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1">
                  View All <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-3">
                {pendingApprovals.slice(0, 3).map((approval) => {
                  const Icon = getApprovalIcon(approval.type)
                  return (
                    <div key={approval.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-4">
                        <div className="p-2 rounded-lg bg-indigo-100 text-indigo-600">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">{approval.name}</div>
                          <div className="text-sm text-gray-500 capitalize">{approval.type} • {approval.submittedAt}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button aria-label="Approve" disabled={decidingId === approval.id} onClick={() => decideApproval(approval.id, 'approved')} className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors disabled:opacity-50"><CheckCircle className="h-5 w-5" /></button>
                        <button aria-label="Reject" disabled={decidingId === approval.id} onClick={() => decideApproval(approval.id, 'rejected')} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"><XCircle className="h-5 w-5" /></button>
                      </div>
                    </div>
                  )
                })}
                {pendingApprovals.length === 0 && (
                  <div className="flex items-center gap-3 p-4 bg-green-50 rounded-lg text-green-700 text-sm">
                    <CheckCircle className="h-5 w-5" /> All caught up — no pending approvals.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'zones' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="relative w-96">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input type="text" placeholder="Search zones..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 focus:border-indigo-500 focus:ring-indigo-500" />
              </div>
              <div className="text-sm text-gray-500">{zones.length} zones</div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {zones.map((zone) => (
                <div key={zone.id} className="rounded-xl border bg-white p-6 shadow-sm hover:shadow-md transition-shadow cursor-pointer" onClick={() => setSelectedZoneDetail(zone)}>
                  <div className="flex items-start justify-between mb-4">
                    <div className="p-3 bg-indigo-100 rounded-lg"><MapPin className="h-6 w-6 text-indigo-600" /></div>
                    <button className="p-2 hover:bg-gray-100 rounded-lg text-gray-400"><MoreHorizontal className="h-4 w-4" /></button>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">{zone.data?.name || zone.name}</h3>
                  <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                    <div>
                      <div className="text-2xl font-bold text-indigo-600">
                        {schools.filter(s => String(s.data?.zoneId || s.zoneId || '') === String(zone.id)).length}
                      </div>
                      <div className="text-sm text-gray-500">Schools</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-purple-600">
                        {players.filter(p => String(p.data?.zoneId || p.zoneId || '') === String(zone.id)).length}
                      </div>
                      <div className="text-sm text-gray-500">Players</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'schools' && (
          <div className="space-y-6">
            {!selectedZone && !selectedSchoolDetail && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">Zone Coordinators</h2>
                    <p className="text-sm text-gray-500">Select a coordinator to view their schools</p>
                  </div>
                  <div className="relative w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input type="text" placeholder="Search zones..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 focus:ring-indigo-500 focus:border-indigo-500" />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {zones.filter(z => (z.data?.name || z.name || '').toLowerCase().includes(searchQuery.toLowerCase())).map(zone => {
                    const coordinator = admins.find(a => a.role === 'ZoneCoordinator' && String(a.data?.zoneId || a.zoneId) === String(zone.id));
                    const schoolCount = schools.filter(s => String(s.data?.zoneId || s.zoneId) === String(zone.id)).length;
                    
                    return (
                      <div key={zone.id} 
                        onClick={() => setSelectedZone(zone.id)}
                        className="group relative overflow-hidden rounded-xl border bg-white p-6 shadow-sm hover:shadow-md transition-all cursor-pointer hover:border-indigo-200"
                      >
                        <div className="flex items-start justify-between mb-4">
                          <div className="p-3 bg-indigo-100 rounded-lg group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                            <MapPin className="h-6 w-6 text-indigo-600 group-hover:text-white" />
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Schools</span>
                            <div className="text-2xl font-bold text-gray-900">{schoolCount}</div>
                          </div>
                        </div>
                        <h3 className="text-lg font-bold text-gray-900 mb-1">{zone.data?.name || zone.name}</h3>
                        <div className="mt-4 pt-4 border-t border-gray-100">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 font-bold overflow-hidden">
                              {coordinator ? (
                                <span>{(coordinator.data?.name?.[0] || '')}{(coordinator.data?.surname?.[0] || '')}</span>
                              ) : (
                                <Users className="h-5 w-5" />
                              )}
                            </div>
                            <div>
                              <div className="text-sm font-medium text-gray-900">
                                {coordinator ? `${coordinator.data?.name} ${coordinator.data?.surname}` : 'No Coordinator'}
                              </div>
                              <div className="text-xs text-gray-500">Zone Coordinator</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {selectedZone && !selectedSchoolDetail && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <button onClick={() => setSelectedZone('')} className="p-2 hover:bg-gray-100 rounded-lg text-gray-600 transition-colors">
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">
                        {zones.find(z => String(z.id) === String(selectedZone))?.data?.name || 'Zone'} Schools
                      </h2>
                      <p className="text-sm text-gray-500">Select a school to manage details</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                     <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none bg-gray-50 px-3 py-2 rounded-lg border">
                        <input 
                          type="checkbox" 
                          checked={hideUnregistered} 
                          onChange={(e) => setHideUnregistered(e.target.checked)} 
                          className="rounded text-indigo-600 focus:ring-indigo-500" 
                        />
                        Hide Unregistered
                     </label>
                  </div>
                </div>

                {/* Zone Coordinator Info */}
                {(() => {
                  const zone = zones.find(z => String(z.id) === String(selectedZone))
                  const coordinator = admins.find(a => a.role === 'ZoneCoordinator' && String(a.data?.zoneId || a.zoneId) === String(selectedZone))
                  
                  if (!coordinator) return (
                    <div className="rounded-xl border border-dashed p-6 bg-gray-50 flex items-center justify-center gap-3 text-gray-500">
                      <Users className="h-5 w-5" />
                      <span>No Zone Coordinator assigned to this zone.</span>
                    </div>
                  )

                  return (
                    <div className="rounded-xl border bg-white p-6 shadow-sm flex items-start gap-6">
                      <div className="h-20 w-20 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 text-2xl font-bold border-4 border-white shadow-sm">
                        {(coordinator.data?.name?.[0] || '')}{(coordinator.data?.surname?.[0] || '')}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-xl font-bold text-gray-900">{coordinator.data?.name} {coordinator.data?.surname}</h3>
                          <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold uppercase">Zone Coordinator</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-y-2 gap-x-8 text-sm text-gray-600 mt-2">
                          <div className="flex items-center gap-2">
                            <Mail className="h-4 w-4 text-gray-400" />
                            {coordinator.data?.email || coordinator.email}
                          </div>
                          <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4 text-gray-400" />
                            {coordinator.data?.phone || 'No phone number'}
                          </div>
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-gray-400" />
                            {zone?.data?.name || 'Unknown Zone'}
                          </div>
                          <div className="flex items-center gap-2">
                            <School className="h-4 w-4 text-gray-400" />
                            {schools.filter(s => String(s.data?.zoneId || s.zoneId) === String(selectedZone)).length} Schools Managed
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })()}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {schools
                    .filter(s => String(s.data?.zoneId || s.zoneId) === String(selectedZone))
                    .filter(s => {
                       if (!hideUnregistered) return true;
                       // A school is considered "registered" if it has active players/coaches/admins or explicitly marked
                       const sPlayers = players.filter(p => String(p.data?.schoolId || p.schoolId) === String(s.id)).length
                       const sCoaches = coaches.filter(c => String(c.data?.schoolId || c.schoolId) === String(s.id)).length
                       const sAdmins = admins.filter(a => String(a.data?.schoolId || a.schoolId) === String(s.id)).length
                       return sPlayers > 0 || sCoaches > 0 || sAdmins > 0
                    })
                    .map(school => {
                       const sPlayers = players.filter(p => String(p.data?.schoolId || p.schoolId) === String(school.id)).length
                       const sCoaches = coaches.filter(c => String(c.data?.schoolId || c.schoolId) === String(school.id)).length
                       const sAdmins = admins.filter(a => String(a.data?.schoolId || a.schoolId) === String(school.id)).length
                       const isRegistered = sPlayers > 0 || sCoaches > 0 || sAdmins > 0

                       return (
                    <div key={school.id} 
                      onClick={() => setSelectedSchoolDetail(school)}
                      className={`group relative overflow-hidden rounded-xl border p-6 shadow-sm hover:shadow-md transition-all cursor-pointer ${isRegistered ? 'bg-white hover:border-purple-200' : 'bg-gray-50 border-gray-200 opacity-80'}`}
                    >
                      {!isRegistered && (
                        <div className="absolute top-2 right-2 px-2 py-0.5 bg-gray-200 text-gray-600 text-[10px] font-bold uppercase rounded">Unregistered</div>
                      )}
                      {isRegistered && (
                        <div className="absolute top-2 right-2 px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold uppercase rounded">Registered</div>
                      )}

                      <div className="flex items-center gap-4 mb-4">
                        <div className={`h-12 w-12 rounded-full flex items-center justify-center transition-colors ${isRegistered ? 'bg-purple-50 group-hover:bg-purple-600' : 'bg-gray-200'}`}>
                          <School className={`h-6 w-6 ${isRegistered ? 'text-purple-600 group-hover:text-white' : 'text-gray-400'}`} />
                        </div>
                        <div>
                          <h3 className="font-bold text-gray-900 line-clamp-1">{school.data?.name || school.name}</h3>
                          <div className="text-xs text-gray-500">ID: {school.schoolId || school.id.slice(0,8)}</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center text-sm border-t pt-4">
                        <div>
                          <div className="font-bold text-gray-900">{sAdmins}</div>
                          <div className="text-xs text-gray-500">Admins</div>
                        </div>
                        <div className="border-l">
                          <div className="font-bold text-gray-900">{sCoaches}</div>
                          <div className="text-xs text-gray-500">Coaches</div>
                        </div>
                        <div className="border-l">
                          <div className="font-bold text-gray-900">{sPlayers}</div>
                          <div className="text-xs text-gray-500">Players</div>
                        </div>
                      </div>
                    </div>
                  )})}
                  {schools.filter(s => String(s.data?.zoneId || s.zoneId) === String(selectedZone)).length === 0 && (
                    <div className="col-span-full py-12 text-center text-gray-500 border-2 border-dashed rounded-xl bg-gray-50">
                      <School className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                      <p>No schools found in this zone.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {selectedSchoolDetail && (
              <div className="space-y-6">
                <div className="flex items-center gap-4">
                  <button onClick={() => setSelectedSchoolDetail(null)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-600 transition-colors">
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">{selectedSchoolDetail.data?.name || selectedSchoolDetail.name}</h2>
                    <p className="text-sm text-gray-500">School Management Dashboard</p>
                  </div>
                  {(() => {
                    const zid = String(selectedSchoolDetail.data?.zoneId || selectedSchoolDetail.zoneId || '')
                    const coord = admins.find((a) => (a.role === 'ZoneCoordinator' || a.data?.role === 'ZoneCoordinator') && String(a.data?.zoneId || a.zoneId) === zid)
                    return (
                      <div className="ml-auto flex items-center gap-2">
                        <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 ring-1 ring-indigo-200">{zoneNameOf(zid)}</span>
                        {coord && (
                          <button
                            type="button"
                            onClick={() => setViewingStaff({ person: coord, role: 'ZoneCoordinator' })}
                            className="flex items-center gap-2 rounded-full border border-indigo-200 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-indigo-50"
                            title="View zone coordinator profile"
                          >
                            <MapPin size={12} className="text-indigo-500" aria-hidden="true" />
                            Coordinator: {coord.data?.name} {coord.data?.surname}
                          </button>
                        )}
                      </div>
                    )
                  })()}
                </div>

                {/* Hierarchical View: Coaches by Age Group -> Players */}
                <div className="space-y-6">
                   {['U14', 'U15', 'U16', 'U17', 'U19'].map(ageGroup => {
                      const ageGroupCoaches = coaches.filter(c => 
                         String(c.data?.schoolId || c.schoolId) === String(selectedSchoolDetail.id) && 
                         (c.data?.team === ageGroup || c.data?.ageGroup === ageGroup)
                      );
                      
                      const ageGroupPlayers = players.filter(p => 
                         String(p.data?.schoolId || p.schoolId) === String(selectedSchoolDetail.id) &&
                         (p.data?.team === ageGroup || p.data?.ageGroup === ageGroup)
                      );

                      if (ageGroupCoaches.length === 0 && ageGroupPlayers.length === 0) return null;

                      return (
                        <div key={ageGroup} className="rounded-xl border bg-white overflow-hidden shadow-sm">
                           <div className="bg-gray-50 px-6 py-3 border-b flex items-center justify-between">
                              <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                 <Users className="h-5 w-5 text-indigo-600" />
                                 {ageGroup} Team
                              </h3>
                              <div className="text-sm text-gray-500">
                                 {ageGroupCoaches.length} Coach{ageGroupCoaches.length !== 1 ? 'es' : ''} • {ageGroupPlayers.length} Player{ageGroupPlayers.length !== 1 ? 's' : ''}
                              </div>
                           </div>
                           
                           <div className="p-6">
                              {/* Coaches Section */}
                              <div className="mb-6">
                                 <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Coaches</h4>
                                 {ageGroupCoaches.length > 0 ? (
                                    <div className="grid grid-cols-1 gap-4">
                                       {ageGroupCoaches.map(coach => (
                                          <div key={coach.id} className="rounded-lg border bg-white overflow-hidden">
                                             <button
                                                type="button"
                                                onClick={() => setViewingStaff({ person: coach, role: 'Coach' })}
                                                className="flex w-full items-center gap-3 p-3 bg-green-50 border-b border-green-100 text-left hover:bg-green-100 transition-colors"
                                                title="View coach profile"
                                             >
                                                <CoachAvatar coach={coach} size="md" />
                                                <div>
                                                   <div className="font-medium text-gray-900">{coach.data?.name} {coach.data?.surname}</div>
                                                   <div className="text-xs text-gray-500">
                                                      {coach.data?.position || 'Coach'} • {coach.data?.email || coach.email}
                                                      {coach.data?.qualifications && coach.data.qualifications !== 'None' ? ` • ${coach.data.qualifications}` : ''}
                                                   </div>
                                                </div>
                                                <Eye size={15} className="ml-auto shrink-0 text-green-600" aria-hidden="true" />
                                             </button>
                                             
                                             {/* Players under this coach (in this age group) */}
                                             <div className="p-0">
                                                {ageGroupPlayers.length > 0 ? (
                                                   <table className="w-full text-sm">
                                                      <thead className="bg-gray-50 text-xs">
                                                         <tr>
                                                            <th className="px-4 py-2 text-left font-medium text-gray-500 pl-12">Player Name</th>
                                                            <th className="px-4 py-2 text-left font-medium text-gray-500">Position</th>
                                                            <th className="px-4 py-2 text-left font-medium text-gray-500">Status</th>
                                                            <th className="px-4 py-2 text-right font-medium text-gray-500">Action</th>
                                                         </tr>
                                                      </thead>
                                                      <tbody className="divide-y divide-gray-100">
                                                         {ageGroupPlayers.map(player => (
                                                            <tr key={player.id} className="hover:bg-gray-50">
                                                               <td className="px-4 py-2 pl-12">
                                                                  <div className="font-medium text-gray-900">{player.data?.name} {player.data?.surname}</div>
                                                               </td>
                                                               <td className="px-4 py-2 text-gray-600">{player.data?.position || '—'}</td>
                                                               <td className="px-4 py-2">
                                                                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                                                     (player.data?.status || 'active') === 'active' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                                                                  }`}>
                                                                     {player.data?.status || 'Active'}
                                                                  </span>
                                                               </td>
                                                               <td className="px-4 py-2 text-right">
                                                                  <button onClick={() => setViewingPlayer(player)} className="text-indigo-600 hover:text-indigo-900 font-medium text-xs bg-indigo-50 hover:bg-indigo-100 px-3 py-1 rounded-md transition-colors">View</button>
                                                               </td>
                                                            </tr>
                                                         ))}
                                                      </tbody>
                                                   </table>
                                                ) : (
                                                   <div className="p-4 text-center text-sm text-gray-400 italic">No players assigned to this team yet.</div>
                                                )}
                                             </div>
                                          </div>
                                       ))}
                                    </div>
                                 ) : (
                                    <div className="text-sm text-gray-400 italic mb-4">No coaches assigned to {ageGroup}</div>
                                 )}
                                 
                                 {/* Fallback for players if no coach exists to "hold" them */}
                                 {ageGroupCoaches.length === 0 && ageGroupPlayers.length > 0 && (
                                    <div className="mt-4 rounded-lg border bg-white overflow-hidden">
                                       <div className="p-3 bg-gray-50 border-b border-gray-200 text-sm font-medium text-gray-700">Players (No Coach Assigned)</div>
                                       <table className="w-full text-sm">
                                          <tbody className="divide-y divide-gray-100">
                                             {ageGroupPlayers.map(player => (
                                                <tr key={player.id} className="hover:bg-gray-50">
                                                   <td className="px-4 py-2">
                                                      <div className="font-medium text-gray-900">{player.data?.name} {player.data?.surname}</div>
                                                   </td>
                                                   <td className="px-4 py-2 text-gray-600">{player.data?.position || '—'}</td>
                                                   <td className="px-4 py-2">
                                                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                                         (player.data?.status || 'active') === 'active' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                                                      }`}>
                                                         {player.data?.status || 'Active'}
                                                      </span>
                                                   </td>
                                                   <td className="px-4 py-2 text-right">
                                                      <button onClick={() => setViewingPlayer(player)} className="text-indigo-600 hover:text-indigo-900 font-medium text-xs bg-indigo-50 hover:bg-indigo-100 px-3 py-1 rounded-md transition-colors">View</button>
                                                   </td>
                                                </tr>
                                             ))}
                                          </tbody>
                                       </table>
                                    </div>
                                 )}
                              </div>
                           </div>
                        </div>
                      )
                   })}

                   {/* Unassigned / Other Section */}
                   {(() => {
                      const unassignedCoaches = coaches.filter(c => 
                         String(c.data?.schoolId || c.schoolId) === String(selectedSchoolDetail.id) && 
                         !['U14', 'U15', 'U16', 'U17', 'U19'].includes(c.data?.team || c.data?.ageGroup)
                      );
                      const unassignedPlayers = players.filter(p => 
                         String(p.data?.schoolId || p.schoolId) === String(selectedSchoolDetail.id) &&
                         !['U14', 'U15', 'U16', 'U17', 'U19'].includes(p.data?.team || p.data?.ageGroup)
                      );
                      const schoolAdmins = admins.filter(a => String(a.data?.schoolId || a.schoolId) === String(selectedSchoolDetail.id));
                      // Referees carry the school in their data blob (zone is a column)
                      const schoolReferees = referees.filter(r => String(r.data?.schoolId || '') === String(selectedSchoolDetail.id));

                      if (unassignedCoaches.length === 0 && unassignedPlayers.length === 0 && schoolAdmins.length === 0 && schoolReferees.length === 0) return null;

                      const StaffChip = ({ person, role, tint, text }: any) => (
                        <button
                          type="button"
                          onClick={() => setViewingStaff({ person, role })}
                          className={`flex w-full items-center gap-3 p-3 rounded-lg border text-left transition-colors hover:shadow-sm ${tint}`}
                          title={`View ${role} profile`}
                        >
                          <div className={`h-10 w-10 shrink-0 rounded-full flex items-center justify-center font-bold ${text}`}>
                            {(person.data?.name?.[0] || '')}{(person.data?.surname?.[0] || '')}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-gray-900 truncate">{person.data?.name} {person.data?.surname}</div>
                            <div className="text-xs text-gray-500 truncate">{person.data?.email || person.email}</div>
                          </div>
                          <Eye size={14} className="ml-auto shrink-0 text-gray-400" aria-hidden="true" />
                        </button>
                      )

                      return (
                        <div className="rounded-xl border bg-white overflow-hidden shadow-sm mt-6">
                           <div className="bg-gray-50 px-6 py-3 border-b">
                              <h3 className="font-bold text-gray-800">School Staff & Officials</h3>
                           </div>
                           <div className="p-6 space-y-6">
                              {schoolAdmins.length > 0 && (
                                 <div>
                                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">School Admins ({schoolAdmins.length})</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                       {schoolAdmins.map(admin => (
                                          <StaffChip key={admin.id} person={admin} role="SchoolAdmin" tint="bg-blue-50 border-blue-100 hover:bg-blue-100" text="bg-blue-200 text-blue-700" />
                                       ))}
                                    </div>
                                 </div>
                              )}

                              {schoolReferees.length > 0 && (
                                 <div>
                                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Referees ({schoolReferees.length})</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                       {schoolReferees.map(ref => (
                                          <StaffChip key={ref.id} person={ref} role="Referee" tint="bg-amber-50 border-amber-100 hover:bg-amber-100" text="bg-amber-200 text-amber-700" />
                                       ))}
                                    </div>
                                 </div>
                              )}

                              {unassignedCoaches.length > 0 && (
                                 <div>
                                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Coaches without a team ({unassignedCoaches.length})</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                       {unassignedCoaches.map(coach => (
                                          <StaffChip key={coach.id} person={coach} role="Coach" tint="bg-green-50 border-green-100 hover:bg-green-100" text="bg-green-200 text-green-700" />
                                       ))}
                                    </div>
                                 </div>
                              )}

                              {unassignedPlayers.length > 0 && (
                                 <div>
                                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Players without an age group ({unassignedPlayers.length})</h4>
                                    <div className="rounded-lg border overflow-hidden">
                                       <table className="w-full text-sm">
                                          <tbody className="divide-y divide-gray-100">
                                             {unassignedPlayers.map(player => (
                                                <tr key={player.id} className="hover:bg-gray-50">
                                                   <td className="px-4 py-2">
                                                      <div className="font-medium text-gray-900">{player.data?.name} {player.data?.surname}</div>
                                                   </td>
                                                   <td className="px-4 py-2 text-gray-600">{player.data?.position || '—'}</td>
                                                   <td className="px-4 py-2 text-right">
                                                      <button onClick={() => setViewingPlayer(player)} className="text-indigo-600 hover:text-indigo-900 font-medium text-xs bg-indigo-50 hover:bg-indigo-100 px-3 py-1 rounded-md transition-colors">View</button>
                                                   </td>
                                                </tr>
                                             ))}
                                          </tbody>
                                       </table>
                                    </div>
                                 </div>
                              )}
                           </div>
                        </div>
                      )
                   })()}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'users' && (() => {
          // Union directory grouped by school (not a flat list): every school
          // shows its admins, coaches, referees and players; coordinators sit
          // at zone level. Every person opens a profile.
          const q = searchQuery.trim().toLowerCase()
          const matches = (item: any) =>
            !q || `${item.data?.name || ''} ${item.data?.surname || ''} ${item.data?.email || item.email || ''}`.toLowerCase().includes(q)
          const schoolIdOf = (x: any) => String(x.data?.schoolId || x.schoolId || '')

          const coordinators = admins.filter((a) => (a.role === 'ZoneCoordinator' || a.data?.role === 'ZoneCoordinator') && matches(a))

          const bySchool = new Map<string, { players: any[]; coaches: any[]; referees: any[]; admins: any[] }>()
          const bucket = (sid: string) => {
            if (!bySchool.has(sid)) bySchool.set(sid, { players: [], coaches: [], referees: [], admins: [] })
            return bySchool.get(sid)!
          }
          for (const p of players) if (schoolIdOf(p) && matches(p)) bucket(schoolIdOf(p)).players.push(p)
          for (const c of coaches) if (schoolIdOf(c) && matches(c)) bucket(schoolIdOf(c)).coaches.push(c)
          for (const r of referees) if (schoolIdOf(r) && matches(r)) bucket(schoolIdOf(r)).referees.push(r)
          for (const a of admins) if ((a.role === 'SchoolAdmin' || a.data?.role === 'SchoolAdmin') && schoolIdOf(a) && matches(a)) bucket(schoolIdOf(a)).admins.push(a)

          const groups = [...bySchool.entries()]
            .map(([sid, g]) => ({ sid, ...g, total: g.players.length + g.coaches.length + g.referees.length + g.admins.length }))
            .filter((g) => g.total > 0)
            .sort((a, b) => b.total - a.total)

          const PersonRow = ({ item, onClick, tint, text }: any) => (
            <button type="button" onClick={onClick} className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-gray-100 transition-colors">
              <div className={`h-8 w-8 shrink-0 rounded-full ${tint} flex items-center justify-center ${text} text-xs font-bold`}>
                {(item.data?.name?.[0] || '')}{(item.data?.surname?.[0] || '')}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-gray-900 truncate">{item.data?.name} {item.data?.surname}</div>
                <div className="text-xs text-gray-500 truncate">{item.data?.email || item.email}</div>
              </div>
              <Eye size={13} className="shrink-0 text-gray-300" aria-hidden="true" />
            </button>
          )

          const Section = ({ label, items, role, tint, text, asPlayer }: any) => items.length === 0 ? null : (
            <div>
              <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">{label} ({items.length})</h4>
              <div className="grid grid-cols-1 gap-1 md:grid-cols-2 lg:grid-cols-3">
                {items.slice(0, 120).map((item: any) => (
                  <PersonRow
                    key={item.id}
                    item={item}
                    tint={tint}
                    text={text}
                    onClick={() => (asPlayer ? setViewingPlayer(item) : setViewingStaff({ person: item, role }))}
                  />
                ))}
              </div>
              {items.length > 120 && <div className="mt-1 text-xs text-gray-400">…and {items.length - 120} more (refine the search)</div>}
            </div>
          )

          return (
            <div className="space-y-6" data-testid="users-by-school">
              <div className="flex items-center gap-4">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input type="text" placeholder="Search people by name or email..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300" />
                </div>
                <div className="text-sm text-gray-500">{groups.length} school{groups.length === 1 ? '' : 's'}</div>
              </div>

              {/* Zone coordinators live at zone level, above the schools */}
              {coordinators.length > 0 && (
                <div className="rounded-xl border bg-white p-4 shadow-sm">
                  <div className="mb-3 flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-indigo-600" />
                    <h3 className="font-semibold text-gray-900">Zone Coordinators ({coordinators.length})</h3>
                  </div>
                  <div className="grid grid-cols-1 gap-1 md:grid-cols-2 lg:grid-cols-3">
                    {coordinators.map((a) => (
                      <button key={a.id} type="button" onClick={() => setViewingStaff({ person: a, role: 'ZoneCoordinator' })}
                        className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-indigo-50 transition-colors">
                        <div className="h-8 w-8 shrink-0 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-xs font-bold">
                          {(a.data?.name?.[0] || '')}{(a.data?.surname?.[0] || '')}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-gray-900 truncate">{a.data?.name} {a.data?.surname}</div>
                          <div className="text-xs text-gray-500 truncate">{zoneNameOf(String(a.data?.zoneId || a.zoneId || ''))}</div>
                        </div>
                        <Eye size={13} className="shrink-0 text-gray-300" aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* One card per school, expandable */}
              {groups.map((g) => {
                const open = expandedSchool === g.sid || Boolean(q)
                return (
                  <div key={g.sid} className="rounded-xl border bg-white shadow-sm overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setExpandedSchool(open && !q ? '' : g.sid)}
                      className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-gray-50 transition-colors"
                    >
                      <School className="h-5 w-5 shrink-0 text-purple-600" aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-gray-900 truncate">{schoolNameOf(g.sid)}</div>
                        <div className="text-xs text-gray-500">{zoneNameOf(String(players.concat(g.coaches, g.admins).find((x: any) => schoolIdOf(x) === g.sid)?.data?.zoneId || g.players[0]?.data?.zoneId || g.coaches[0]?.data?.zoneId || g.admins[0]?.data?.zoneId || ''))}</div>
                      </div>
                      <div className="hidden sm:flex items-center gap-3 text-xs text-gray-500">
                        <span><b className="text-gray-900">{g.admins.length}</b> admins</span>
                        <span><b className="text-gray-900">{g.coaches.length}</b> coaches</span>
                        <span><b className="text-gray-900">{g.referees.length}</b> referees</span>
                        <span><b className="text-gray-900">{g.players.length}</b> players</span>
                      </div>
                      <ChevronRight className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden="true" />
                    </button>
                    {open && (
                      <div className="space-y-5 border-t px-5 py-4">
                        <Section label="School Admins" items={g.admins} role="SchoolAdmin" tint="bg-blue-100" text="text-blue-700" />
                        <Section label="Coaches" items={g.coaches} role="Coach" tint="bg-green-100" text="text-green-700" />
                        <Section label="Referees" items={g.referees} role="Referee" tint="bg-amber-100" text="text-amber-700" />
                        <Section label="Players" items={g.players} asPlayer tint="bg-gray-200" text="text-gray-700" />
                      </div>
                    )}
                  </div>
                )
              })}
              {groups.length === 0 && (
                <div className="rounded-xl border-2 border-dashed bg-gray-50 py-12 text-center text-gray-500">No people match this search.</div>
              )}
            </div>
          )
        })()}

        {activeTab === 'approvals' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Pending Approvals</h3>
              <div className="flex items-center gap-4">
                <div className="inline-flex overflow-hidden rounded-md border" role="group" aria-label="View toggle">
                  <button
                    type="button"
                    className={`inline-flex items-center gap-1 px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 ${resultsView === 'list' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                    onClick={() => {
                      if (resultsView === 'list') return
                      setResultsSwitching(true)
                      setTimeout(() => { setResultsView('list'); setResultsSwitching(false) }, 120)
                    }}
                  >
                    <ListIcon size={16} />
                    List
                  </button>
                  <button
                    type="button"
                    className={`inline-flex items-center gap-1 px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 ${resultsView === 'cards' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                    onClick={() => {
                      if (resultsView === 'cards') return
                      setResultsSwitching(true)
                      setTimeout(() => { setResultsView('cards'); setResultsSwitching(false) }, 120)
                    }}
                  >
                    <LayoutGrid size={16} />
                    Cards
                  </button>
                </div>
                <button disabled={pendingApprovals.length === 0 || !!decidingId} onClick={approveAll} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed">
                  <CheckCircle className="h-4 w-4" /> Approve All
                </button>
              </div>
            </div>
            {approvalsLoading && <div className="text-sm text-gray-500">Loading approvals...</div>}
            {!approvalsLoading && pendingApprovals.length === 0 && (
              <div className="rounded-xl border-2 border-dashed bg-gray-50 py-16 text-center text-gray-500">
                <CheckCircle className="h-12 w-12 text-green-400 mx-auto mb-3" />
                <p className="font-medium">All caught up</p>
                <p className="text-sm">There are no pending approval requests.</p>
              </div>
            )}
            <div className={`transition-opacity duration-150 ${resultsSwitching ? 'opacity-0' : 'opacity-100'} ${pendingApprovals.length === 0 ? 'hidden' : ''}`}>
              {resultsView === 'list' ? (
                <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left font-medium text-gray-500">Entity</th>
                        <th className="px-6 py-3 text-left font-medium text-gray-500">Type</th>
                        <th className="px-6 py-3 text-left font-medium text-gray-500">Location</th>
                        <th className="px-6 py-3 text-left font-medium text-gray-500">Submitted</th>
                        <th className="px-6 py-3 text-right font-medium text-gray-500">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {pendingApprovals.map((approval) => {
                        const Icon = getApprovalIcon(approval.type)
                        return (
                          <tr key={approval.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-indigo-100 text-indigo-600">
                                  <Icon className="h-4 w-4" />
                                </div>
                                <span className="font-medium text-gray-900">{approval.name}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4 capitalize text-gray-600">{approval.type}</td>
                            <td className="px-6 py-4 text-gray-600">{approval.school || approval.zone || '—'}</td>
                            <td className="px-6 py-4 text-gray-600">{approval.submittedAt}</td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex justify-end gap-2">
                                <button aria-label="Approve" disabled={decidingId === approval.id} onClick={() => decideApproval(approval.id, 'approved')} className="p-1.5 text-green-600 hover:bg-green-50 rounded disabled:opacity-50"><CheckCircle className="h-5 w-5" /></button>
                                <button aria-label="Reject" disabled={decidingId === approval.id} onClick={() => decideApproval(approval.id, 'rejected')} className="p-1.5 text-red-600 hover:bg-red-50 rounded disabled:opacity-50"><XCircle className="h-5 w-5" /></button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingApprovals.map((approval) => {
                    const Icon = getApprovalIcon(approval.type)
                    return (
                      <div key={approval.id} className="rounded-xl border bg-white p-6 shadow-sm">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-4">
                            <div className="h-14 w-14 rounded-full bg-indigo-100 flex items-center justify-center">
                              <Icon className="h-6 w-6 text-indigo-600" />
                            </div>
                            <div>
                              <div className="font-semibold text-lg">{approval.name}</div>
                              <div className="text-sm text-gray-500">{approval.type.charAt(0).toUpperCase() + approval.type.slice(1)} • {approval.school || approval.zone} • {approval.submittedAt}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button disabled={decidingId === approval.id} onClick={() => decideApproval(approval.id, 'approved')} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"><CheckCircle className="h-4 w-4" /> Approve</button>
                            <button disabled={decidingId === approval.id} onClick={() => decideApproval(approval.id, 'rejected')} className="flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-50 disabled:opacity-50"><XCircle className="h-4 w-4" /> Reject</button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'analytics' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rounded-xl border bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold mb-4">System Growth</h3>
                <div className="h-64 flex items-end justify-around">
                  {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'].map((month, i) => (
                    <div key={month} className="flex flex-col items-center gap-2">
                      <div className="w-12 bg-indigo-500 rounded-t-lg transition-all duration-500" style={{ height: `${(i + 1) * 30}px` }}></div>
                      <span className="text-sm text-gray-500">{month}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold mb-4">User Distribution</h3>
                <div className="space-y-4">
                  {[
                    { label: 'Players', value: stats.totalPlayers, color: 'bg-blue-500' },
                    { label: 'Coaches', value: stats.totalCoaches, color: 'bg-green-500' },
                    { label: 'Referees', value: stats.totalReferees, color: 'bg-amber-500' },
                    { label: 'Admins', value: stats.totalAdmins, color: 'bg-rose-500' }
                  ].map((item) => {
                    const total = stats.totalPlayers + stats.totalCoaches + stats.totalReferees + stats.totalAdmins
                    const percentage = total ? (item.value / total * 100) : 0
                    return (
                      <div key={item.label}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-gray-700">{item.label}</span>
                          <span className="text-sm text-gray-500">{item.value} ({percentage.toFixed(1)}%)</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full ${item.color} rounded-full`} style={{ width: `${percentage}%` }}></div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Profile modals — reachable from the Schools drill-down and the Users directory */}
      {viewingPlayer && (
        <PlayerProfileModal player={viewingPlayer} role="EPHSRUAdmin" onClose={() => setViewingPlayer(null)} onUpdated={onRefresh} />
      )}
      {viewingStaff && (
        <StaffProfileModal person={viewingStaff.person} role={viewingStaff.role} onClose={() => setViewingStaff(null)} />
      )}
    </div>
  )
}
