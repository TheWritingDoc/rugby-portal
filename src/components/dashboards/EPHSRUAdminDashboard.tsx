import { useState, useMemo, useEffect } from 'react'
import { 
  Users, UserCheck, School, MapPin, Shield, Activity, 
  TrendingUp, AlertCircle, CheckCircle, XCircle, Search,
  Download, Plus, Edit, Trash2, BarChart3, Settings, 
  FileText, Globe, UserCog, Filter, MoreHorizontal, 
  ChevronRight, ChevronLeft, Award, Clock, CheckSquare, Crown, Database,
  PieChart as PieChartIcon, Eye, List as ListIcon, LayoutGrid
} from 'lucide-react'

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

export default function EPHSRUAdminDashboard({ 
  zones, schools, players, coaches, referees, admins, onRefresh 
}: EPHSRUAdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'zones' | 'schools' | 'users' | 'approvals' | 'analytics'>('overview')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedZone, setSelectedZone] = useState('')
  const [selectedZoneDetail, setSelectedZoneDetail] = useState<any>(null)
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

  const pendingApprovals: PendingApproval[] = [
    { id: '1', type: 'player', name: 'John Smith', school: 'Grey High', zone: 'Zone A', submittedAt: '2026-02-01' },
    { id: '2', type: 'school', name: 'Victoria Park High', zone: 'Zone B', submittedAt: '2026-02-01' },
    { id: '3', type: 'coach', name: 'Sarah Johnson', school: 'Grey High', zone: 'Zone A', submittedAt: '2026-01-31' },
  ]

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
              <h1 className="text-3xl font-bold mb-2">EPHSRU Administration</h1>
              <p className="text-purple-100">Eastern Province High Schools Rugby Union</p>
              <div className="flex items-center gap-4 mt-4 text-sm text-purple-100">
                <span className="flex items-center gap-1"><Globe className="h-4 w-4" />{stats.totalZones} Zones</span>
                <span>•</span>
                <span className="flex items-center gap-1"><School className="h-4 w-4" />{stats.totalSchools} Schools</span>
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
          { icon: MapPin, label: 'Zones', value: stats.totalZones, color: 'indigo' },
          { icon: School, label: 'Schools', value: stats.totalSchools, color: 'purple' },
          { icon: Users, label: 'Players', value: stats.totalPlayers, color: 'blue' },
          { icon: UserCheck, label: 'Coaches', value: stats.totalCoaches, color: 'green' },
          { icon: Award, label: 'Referees', value: stats.totalReferees, color: 'amber' },
          { icon: Shield, label: 'Admins', value: stats.totalAdmins, color: 'rose' }
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className={`rounded-lg bg-${stat.color}-50 p-2 w-fit mb-3`}>
              <stat.icon className={`h-5 w-5 text-${stat.color}-600`} />
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
              {'badge' in tab && tab.badge > 0 && (
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
                { icon: Plus, label: 'Add Zone', desc: 'Create new zone', color: 'indigo' },
                { icon: School, label: 'Add School', desc: 'Register school', color: 'purple' },
                { icon: UserCog, label: 'Manage Users', desc: 'View all users', color: 'blue' },
                { icon: Download, label: 'Export Data', desc: 'Download reports', color: 'green' }
              ].map((action) => (
                <button key={action.label} className={`flex items-center gap-3 p-4 bg-${action.color}-50 hover:bg-${action.color}-100 rounded-xl transition-colors text-left`}>
                  <div className={`p-3 bg-${action.color}-600 text-white rounded-lg`}>
                    <action.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <div className={`font-medium text-${action.color}-900`}>{action.label}</div>
                    <div className={`text-sm text-${action.color}-600`}>{action.desc}</div>
                  </div>
                </button>
              ))}
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
                  ].map((stat) => (
                    <div key={stat.label} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 bg-${stat.color}-100 rounded-lg`}>
                          <stat.icon className={`h-4 w-4 text-${stat.color}-600`} />
                        </div>
                        <span className="text-gray-600">{stat.label}</span>
                      </div>
                      <span className={`text-2xl font-bold text-${stat.color}-600`}>{stat.value.toLocaleString()}</span>
                    </div>
                  ))}
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
                        <button className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"><CheckCircle className="h-5 w-5" /></button>
                        <button className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"><XCircle className="h-5 w-5" /></button>
                      </div>
                    </div>
                  )
                })}
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
              <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                <Plus className="h-4 w-4" /> Add Zone
              </button>
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
            <div className="flex items-center gap-4">
              <select value={selectedZone} onChange={(e) => setSelectedZone(e.target.value)} className="rounded-lg border-gray-300">
                <option value="">All Zones</option>
                {zones.map(z => <option key={z.id} value={z.id}>{z.data?.name || z.name}</option>)}
              </select>
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input type="text" placeholder="Search schools..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300" />
              </div>
              <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                <Plus className="h-4 w-4" /> Add School
              </button>
            </div>
            <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">School</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Zone</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Players</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Coaches</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {schools.filter(s => !selectedZone || s.data?.zoneId === selectedZone).map((school) => (
                    <tr key={school.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center"><School className="h-5 w-5 text-indigo-600" /></div>
                          <span className="font-medium text-gray-900">{school.data?.name || school.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">{zones.find(z => z.id === school.data?.zoneId)?.data?.name || '—'}</td>
                      <td className="px-6 py-4 font-semibold">{players.filter(p => p.data?.schoolId === school.id).length}</td>
                      <td className="px-6 py-4">{coaches.filter(c => c.data?.schoolId === school.id).length}</td>
                      <td className="px-6 py-4"><button className="text-indigo-600 hover:text-indigo-900 text-sm font-medium">View</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'users' && (
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input type="text" placeholder="Search users..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { title: 'Players', data: players, icon: Users, color: 'blue' },
                { title: 'Coaches', data: coaches, icon: UserCheck, color: 'green' },
                { title: 'Referees', data: referees, icon: Award, color: 'amber' },
                { title: 'Admins', data: admins, icon: Shield, color: 'rose' }
              ].map((category) => (
                <div key={category.title} className="rounded-xl border bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`p-2 bg-${category.color}-100 rounded-lg`}>
                      <category.icon className={`h-5 w-5 text-${category.color}-600`} />
                    </div>
                    <h3 className="font-semibold text-gray-900">{category.title}</h3>
                    <span className="ml-auto text-2xl font-bold text-gray-900">{category.data.length}</span>
                  </div>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {category.data.slice(0, 5).map((item) => (
                      <div key={item.id} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
                        <div className={`h-8 w-8 rounded-full bg-${category.color}-100 flex items-center justify-center text-${category.color}-600 text-xs font-bold`}>
                          {(item.data?.name?.[0] || '')}{(item.data?.surname?.[0] || '')}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900 truncate">{item.data?.name} {item.data?.surname}</div>
                          <div className="text-xs text-gray-500 truncate">{item.data?.email || item.email}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

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
                <button className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                  <CheckCircle className="h-4 w-4" /> Approve All
                </button>
              </div>
            </div>
            <div className={`transition-opacity duration-150 ${resultsSwitching ? 'opacity-0' : 'opacity-100'}`}>
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
                                <button className="p-1.5 text-green-600 hover:bg-green-50 rounded"><CheckCircle className="h-5 w-5" /></button>
                                <button className="p-1.5 text-red-600 hover:bg-red-50 rounded"><XCircle className="h-5 w-5" /></button>
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
                            <button className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"><CheckCircle className="h-4 w-4" /> Approve</button>
                            <button className="flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-50"><XCircle className="h-4 w-4" /> Reject</button>
                            <button className="p-2 hover:bg-gray-100 rounded-lg text-gray-400"><Eye className="h-4 w-4" /></button>
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
    </div>
  )
}
