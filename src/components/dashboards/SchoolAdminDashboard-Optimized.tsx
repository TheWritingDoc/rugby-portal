import { useState, useEffect, useMemo } from 'react'
import { 
  Users, UserCheck, School, MapPin, Calendar, Award, 
  TrendingUp, AlertCircle, ChevronDown, ChevronUp,
  Shield, Activity, FileText, MoreVertical, Filter,
  Download, Search, Plus, Edit, Trash2, Mail, Phone,
  BarChart3, PieChart as PieChartIcon
} from 'lucide-react'
import { fetchList, postJson, putJson } from '../utils/api'
import { login } from '../utils/auth'
import PlayerCard from './PlayerCard'
import SchoolCard from './SchoolCard'

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
  const [activeTab, setActiveTab] = useState<'overview' | 'teams' | 'coaches' | 'admins' | 'analytics'>('overview')
  const [selectedTeam, setSelectedTeam] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [showAddCoach, setShowAddCoach] = useState(false)
  const [showAddAdmin, setShowAddAdmin] = useState(false)
  const [expandedStats, setExpandedStats] = useState(true)

  // School statistics
  const stats = useMemo(() => {
    const totalPlayers = players.length
    const totalCoaches = coaches.length
    const pendingPlayers = players.filter(p => 
      String(p.data?.status || '').toLowerCase() === 'pending'
    ).length
    const approvedPlayers = totalPlayers - pendingPlayers
    
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
    if (!selectedTeam) return players
    return players.filter(p => 
      (p.data?.team || p.data?.ageGroup) === selectedTeam
    )
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

  // Quick actions for coaches
  const [coachForm, setCoachForm] = useState({
    name: '', surname: '', email: '', phone: '', idNumber: '', team: ''
  })

  const handleAddCoach = async () => {
    if (!school || !zone) return
    await login('SchoolAdmin', zone, school)
    const payload = {
      ...coachForm,
      schoolId: school,
      zoneId: zone,
      role: 'Coach'
    }
    const res = await postJson('coaches', payload)
    if (res) {
      setShowAddCoach(false)
      setCoachForm({ name: '', surname: '', email: '', phone: '', idNumber: '', team: '' })
      onRefresh()
    }
  }

  // Quick actions for admins
  const [adminForm, setAdminForm] = useState({
    name: '', surname: '', email: '', phone: '', idNumber: ''
  })

  const handleAddAdmin = async () => {
    if (!school || !zone) return
    await login('SchoolAdmin', zone, school)
    const payload = {
      ...adminForm,
      schoolId: school,
      zoneId: zone,
      role: 'SchoolAdmin'
    }
    const res = await postJson('admins', payload)
    if (res) {
      setShowAddAdmin(false)
      setAdminForm({ name: '', surname: '', email: '', phone: '', idNumber: '' })
      onRefresh()
    }
  }

  return (
    <div className="space-y-6">
      {/* School Header Card - IMPROVED: Better contrast and spacing */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-700 via-blue-600 to-blue-500 text-white shadow-xl" role="banner" aria-label="School Administration Dashboard">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48Y2lyY2xlIGN4PSIzMCIgY3k9IjMwIiByPSIyIi8+PC9nPjwvZz48L3N2Zz4=')] opacity-30"></div>
        <div className="relative px-8 py-8">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <School className="h-8 w-8 text-blue-100" aria-hidden="true" />
                <span className="text-blue-100 text-sm font-medium uppercase tracking-wider">School Administration</span>
              </div>
              <h1 className="text-3xl font-bold mb-2 text-white">{schoolNameTop || 'School Dashboard'}</h1>
              <div className="flex items-center gap-4 text-blue-100">
                <span className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" aria-hidden="true" />
                  {zone || 'No Zone Assigned'}
                </span>
                <span aria-hidden="true">•</span>
                <span>School ID: {school || '—'}</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-4xl font-bold text-white">{stats.totalPlayers}</div>
              <div className="text-blue-100 text-sm">Total Players</div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Overview Cards - IMPROVED: Consistent spacing and better contrast */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="rounded-xl border bg-white p-6 shadow-sm hover:shadow-md transition-shadow focus-within:ring-2 focus-within:ring-blue-500">
          <div className="flex items-center justify-between mb-4">
            <div className="rounded-lg bg-blue-50 p-3">
              <Users className="h-6 w-6 text-blue-600" aria-hidden="true" />
            </div>
            <span className="text-xs font-medium text-green-700 bg-green-50 px-3 py-1 rounded-full">
              {stats.approvedPlayers} approved
            </span>
          </div>
          <div className="text-2xl font-bold text-gray-900">{stats.totalPlayers}</div>
          <div className="text-sm text-gray-600">Total Players</div>
          {stats.pendingPlayers > 0 && (
            <div className="mt-3 text-sm text-amber-700 flex items-center gap-2">
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
              {stats.pendingPlayers} pending approval
            </div>
          )}
        </div>

        <div className="rounded-xl border bg-white p-6 shadow-sm hover:shadow-md transition-shadow focus-within:ring-2 focus-within:ring-purple-500">
          <div className="flex items-center justify-between mb-4">
            <div className="rounded-lg bg-purple-50 p-3">
              <UserCheck className="h-6 w-6 text-purple-600" aria-hidden="true" />
            </div>
            <span className="text-xs font-medium text-purple-700 bg-purple-50 px-3 py-1 rounded-full">
              {coaches.length} active
            </span>
          </div>
          <div className="text-2xl font-bold text-gray-900">{stats.totalCoaches}</div>
          <div className="text-sm text-gray-600">Coaches</div>
        </div>

        <div className="rounded-xl border bg-white p-6 shadow-sm hover:shadow-md transition-shadow focus-within:ring-2 focus-within:ring-green-500">
          <div className="flex items-center justify-between mb-4">
            <div className="rounded-lg bg-green-50 p-3">
              <Award className="h-6 w-6 text-green-600" aria-hidden="true" />
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-900">{Object.keys(stats.ageGroups).length}</div>
          <div className="text-sm text-gray-600">Active Teams</div>
        </div>

        <div className="rounded-xl border bg-white p-6 shadow-sm hover:shadow-md transition-shadow focus-within:ring-2 focus-within:ring-amber-500">
          <div className="flex items-center justify-between mb-4">
            <div className="rounded-lg bg-amber-50 p-3">
              <Shield className="h-6 w-6 text-amber-600" aria-hidden="true" />
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-900">{admins.length}</div>
          <div className="text-sm text-gray-600">School Admins</div>
        </div>
      </div>

      {/* Tab Navigation - IMPROVED: Better accessibility and responsive design */}
      <div className="border-b border-gray-200">
        <nav className="flex flex-wrap gap-2 sm:gap-0 sm:space-x-8" role="tablist" aria-label="Dashboard navigation">
          {[
            { id: 'overview', label: 'Overview', icon: Activity },
            { id: 'teams', label: 'Teams & Players', icon: Users },
            { id: 'coaches', label: 'Coaches', icon: UserCheck },
            { id: 'admins', label: 'Admins', icon: Shield },
            { id: 'analytics', label: 'Analytics', icon: BarChart3 }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 py-4 px-4 border-b-2 font-medium text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600 bg-blue-50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 hover:bg-gray-50'
              }`}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`${tab.id}-panel`}
            >
              <tab.icon className="h-4 w-4" aria-hidden="true" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content - IMPROVED: Better semantic structure and accessibility */}
      <div className="min-h-[400px]" role="tabpanel">
        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <div className="space-y-8">
            {/* Age Group Distribution - IMPROVED: Better contrast and responsive design */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="rounded-xl border bg-white p-8 shadow-sm focus-within:ring-2 focus-within:ring-blue-500">
                <h3 className="text-xl font-semibold mb-6 flex items-center gap-3">
                  <Users className="h-5 w-5 text-blue-600" aria-hidden="true" />
                  Players by Age Group
                </h3>
                <div className="space-y-4">
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
                            role="progressbar"
                            aria-valuenow={percentage}
                            aria-valuemin={0}
                            aria-valuemax={100}
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

              <div className="rounded-xl border bg-white p-8 shadow-sm focus-within:ring-2 focus-within:ring-green-500">
                <h3 className="text-xl font-semibold mb-6 flex items-center gap-3">
                  <TrendingUp className="h-5 w-5 text-green-600" aria-hidden="true" />
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
                    <span className="text-gray-600">Approved Players</span>
                    <span className="text-2xl font-bold text-green-600">{stats.approvedPlayers}</span>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <span className="text-gray-600">Total Teams</span>
                    <span className="text-2xl font-bold text-blue-600">{Object.keys(stats.ageGroups).length}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Players - IMPROVED: Better responsive grid and accessibility */}
            <div className="rounded-xl border bg-white p-8 shadow-sm focus-within:ring-2 focus-within:ring-blue-500">
              <h3 className="text-xl font-semibold mb-6">Recent Players</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {players.slice(0, 8).map((player) => (
                  <PlayerCard 
                    key={player.id} 
                    player={player} 
                    badge={player.data?.ageGroup || player.data?.team || '—'}
                  />
                ))}
                {players.length === 0 && (
                  <div className="col-span-full text-center py-12 text-gray-500">
                    No players registered yet
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TEAMS TAB - IMPROVED: Better responsive design and accessibility */}
        {activeTab === 'teams' && (
          <div className="space-y-8">
            {/* Team Selector - IMPROVED: Better mobile layout */}
            <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center gap-4">
              <div className="flex items-center gap-3">
                <label htmlFor="team-filter" className="text-sm font-medium text-gray-700">Filter by Team:</label>
                <select 
                  id="team-filter"
                  value={selectedTeam} 
                  onChange={(e) => setSelectedTeam(e.target.value)}
                  className="rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white"
                >
                  <option value="">All Teams</option>
                  {teams.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" aria-hidden="true" />
                  <input
                    type="text"
                    placeholder="Search players..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                    aria-label="Search players"
                  />
                </div>
              </div>
              <button className="flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <Download className="h-4 w-4" aria-hidden="true" />
                Export
              </button>
            </div>

            {/* Team Stats - IMPROVED: Better contrast and layout */}
            {selectedTeam && (
              <div className="rounded-xl bg-blue-50 p-6 border border-blue-100">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-semibold text-blue-900">{selectedTeam} Team</h3>
                    <p className="text-blue-600 text-sm">{teamPlayers.length} players registered</p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-blue-900">
                      {coaches.filter(c => c.data?.team === selectedTeam).length}
                    </div>
                    <div className="text-sm text-blue-600">Coaches</div>
                  </div>
                </div>
              </div>
            )}

            {/* Players Grid - IMPROVED: Better responsive grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredPlayers.map((player) => (
                <PlayerCard 
                  key={player.id} 
                  player={player}
                  badge={player.data?.ageGroup || player.data?.team || '—'}
                />
              ))}
              {filteredPlayers.length === 0 && (
                <div className="col-span-full text-center py-12 text-gray-500">
                  No players found matching your criteria
                </div>
              )}
            </div>
          </div>
        )}

        {/* COACHES TAB - IMPROVED: Better form accessibility and layout */}
        {activeTab === 'coaches' && (
          <div className="space-y-8">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <h3 className="text-xl font-semibold">Manage Coaches</h3>
              <button 
                onClick={() => setShowAddCoach(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add Coach
              </button>
            </div>

            {showAddCoach && (
              <div className="rounded-xl border bg-white p-8 shadow-sm focus-within:ring-2 focus-within:ring-blue-500">
                <h4 className="text-lg font-medium mb-6">Add New Coach</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
                  <div>
                    <label htmlFor="coach-name" className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                    <input
                      id="coach-name"
                      type="text"
                      placeholder="Enter coach name"
                      value={coachForm.name}
                      onChange={(e) => setCoachForm({...coachForm, name: e.target.value})}
                      className="w-full px-4 py-2 border rounded-lg focus:border-blue-500 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="coach-surname" className="block text-sm font-medium text-gray-700 mb-1">Surname</label>
                    <input
                      id="coach-surname"
                      type="text"
                      placeholder="Enter coach surname"
                      value={coachForm.surname}
                      onChange={(e) => setCoachForm({...coachForm, surname: e.target.value})}
                      className="w-full px-4 py-2 border rounded-lg focus:border-blue-500 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="coach-email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input
                      id="coach-email"
                      type="email"
                      placeholder="coach@example.com"
                      value={coachForm.email}
                      onChange={(e) => setCoachForm({...coachForm, email: e.target.value})}
                      className="w-full px-4 py-2 border rounded-lg focus:border-blue-500 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="coach-phone" className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                    <input
                      id="coach-phone"
                      type="tel"
                      placeholder="+1 (555) 123-4567"
                      value={coachForm.phone}
                      onChange={(e) => setCoachForm({...coachForm, phone: e.target.value})}
                      className="w-full px-4 py-2 border rounded-lg focus:border-blue-500 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="coach-id" className="block text-sm font-medium text-gray-700 mb-1">ID Number</label>
                    <input
                      id="coach-id"
                      type="text"
                      placeholder="Enter ID number"
                      value={coachForm.idNumber}
                      onChange={(e) => setCoachForm({...coachForm, idNumber: e.target.value})}
                      className="w-full px-4 py-2 border rounded-lg focus:border-blue-500 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="coach-team" className="block text-sm font-medium text-gray-700 mb-1">Team</label>
                    <select
                      id="coach-team"
                      value={coachForm.team}
                      onChange={(e) => setCoachForm({...coachForm, team: e.target.value})}
                      className="w-full px-4 py-2 border rounded-lg focus:border-blue-500 focus:ring-blue-500"
                    >
                      <option value="">Select Team</option>
                      {teams.map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button 
                    onClick={handleAddCoach}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  >
                    Save Coach
                  </button>
                  <button 
                    onClick={() => setShowAddCoach(false)}
                    className="px-6 py-2 border rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Coaches List - IMPROVED: Better card layout and accessibility */}
            <div className="grid grid-cols-1 gap-6">
              {coaches.map((coach) => (
                <div key={coach.id} className="rounded-xl border bg-white p-6 shadow-sm hover:shadow-md transition-shadow focus-within:ring-2 focus-within:ring-purple-500">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 font-bold text-lg">
                        {(coach.data?.name?.[0] || '')}{(coach.data?.surname?.[0] || '')}
                      </div>
                      <div>
                        <div className="font-semibold text-gray-900 text-lg">
                          {coach.data?.name} {coach.data?.surname}
                        </div>
                        <div className="text-sm text-gray-600 flex items-center gap-3">
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3" aria-hidden="true" />
                            {coach.data?.email || coach.email}
                          </span>
                          {coach.data?.team && (
                            <>
                              <span aria-hidden="true">•</span>
                              <span className="bg-purple-50 text-purple-700 px-2 py-1 rounded text-xs font-medium">
                                {coach.data.team}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500"
                        aria-label={`Edit ${coach.data?.name} ${coach.data?.surname}`}
                      >
                        <Edit className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button 
                        className="p-2 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-500"
                        aria-label={`Delete ${coach.data?.name} ${coach.data?.surname}`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {coaches.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  No coaches registered yet
                </div>
              )}
            </div>
          </div>
        )}

        {/* ADMINS TAB - IMPROVED: Better form accessibility and layout */}
        {activeTab === 'admins' && (
          <div className="space-y-8">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <h3 className="text-xl font-semibold">Manage School Admins</h3>
              <button 
                onClick={() => setShowAddAdmin(true)}
                className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add Admin
              </button>
            </div>

            {showAddAdmin && (
              <div className="rounded-xl border bg-white p-8 shadow-sm focus-within:ring-2 focus-within:ring-amber-500">
                <h4 className="text-lg font-medium mb-6">Add New Admin</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
                  <div>
                    <label htmlFor="admin-name" className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                    <input
                      id="admin-name"
                      type="text"
                      placeholder="Enter admin name"
                      value={adminForm.name}
                      onChange={(e) => setAdminForm({...adminForm, name: e.target.value})}
                      className="w-full px-4 py-2 border rounded-lg focus:border-blue-500 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="admin-surname" className="block text-sm font-medium text-gray-700 mb-1">Surname</label>
                    <input
                      id="admin-surname"
                      type="text"
                      placeholder="Enter admin surname"
                      value={adminForm.surname}
                      onChange={(e) => setAdminForm({...adminForm, surname: e.target.value})}
                      className="w-full px-4 py-2 border rounded-lg focus:border-blue-500 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="admin-email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input
                      id="admin-email"
                      type="email"
                      placeholder="admin@example.com"
                      value={adminForm.email}
                      onChange={(e) => setAdminForm({...adminForm, email: e.target.value})}
                      className="w-full px-4 py-2 border rounded-lg focus:border-blue-500 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="admin-phone" className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                    <input
                      id="admin-phone"
                      type="tel"
                      placeholder="+1 (555) 123-4567"
                      value={adminForm.phone}
                      onChange={(e) => setAdminForm({...adminForm, phone: e.target.value})}
                      className="w-full px-4 py-2 border rounded-lg focus:border-blue-500 focus:ring-blue-500"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor="admin-id" className="block text-sm font-medium text-gray-700 mb-1">ID Number</label>
                    <input
                      id="admin-id"
                      type="text"
                      placeholder="Enter ID number"
                      value={adminForm.idNumber}
                      onChange={(e) => setAdminForm({...adminForm, idNumber: e.target.value})}
                      className="w-full px-4 py-2 border rounded-lg focus:border-blue-500 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div className="flex gap-3">
                  <button 
                    onClick={handleAddAdmin}
                    className="px-6 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
                  >
                    Save Admin
                  </button>
                  <button 
                    onClick={() => setShowAddAdmin(false)}
                    className="px-6 py-2 border rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Admins List - IMPROVED: Better card layout and accessibility */}
            <div className="grid grid-cols-1 gap-6">
              {admins.map((admin) => (
                <div key={admin.id} className="rounded-xl border bg-white p-6 shadow-sm hover:shadow-md transition-shadow focus-within:ring-2 focus-within:ring-amber-500">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 font-bold text-lg">
                        {(admin.data?.name?.[0] || '')}{(admin.data?.surname?.[0] || '')}
                      </div>
                      <div>
                        <div className="font-semibold text-gray-900 text-lg">
                          {admin.data?.name} {admin.data?.surname}
                        </div>
                        <div className="text-sm text-gray-600 flex items-center gap-3">
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3" aria-hidden="true" />
                            {admin.data?.email || admin.email}
                          </span>
                          <span className="bg-amber-50 text-amber-700 px-2 py-1 rounded text-xs font-medium">
                            School Admin
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500"
                        aria-label={`Edit ${admin.data?.name} ${admin.data?.surname}`}
                      >
                        <Edit className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button 
                        className="p-2 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-500"
                        aria-label={`Delete ${admin.data?.name} ${admin.data?.surname}`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
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

        {/* ANALYTICS TAB - IMPROVED: Better charts and accessibility */}
        {activeTab === 'analytics' && (
          <div className="space-y-8">
            <div className="rounded-xl border bg-white p-8 shadow-sm focus-within:ring-2 focus-within:ring-blue-500">
              <h3 className="text-xl font-semibold mb-8">School Analytics</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Gender Distribution - IMPROVED: Better contrast and accessibility */}
                <div>
                  <h4 className="text-base font-medium text-gray-700 mb-4">Gender Distribution</h4>
                  <div className="space-y-3">
                    {Object.entries(stats.genderSplit).map(([gender, count]) => {
                      const percentage = stats.totalPlayers ? (count / stats.totalPlayers * 100) : 0
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
                              role="progressbar"
                              aria-valuenow={percentage}
                              aria-valuemin={0}
                              aria-valuemax={100}
                            />
                          </div>
                          <span className="w-12 text-right text-sm text-gray-500">{count}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Registration Status - IMPROVED: Better contrast and accessibility */}
                <div>
                  <h4 className="text-base font-medium text-gray-700 mb-4">Registration Status</h4>
                  <div className="space-y-3">
                    <div className="flex items-center gap-4">
                      <span className="w-20 text-sm text-gray-600">Approved</span>
                      <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-green-500 rounded-full transition-all duration-500"
                          style={{ width: `${stats.totalPlayers ? (stats.approvedPlayers / stats.totalPlayers * 100) : 0}%` }}
                          role="progressbar"
                          aria-valuenow={stats.approvedPlayers}
                          aria-valuemin={0}
                          aria-valuemax={stats.totalPlayers}
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
                          role="progressbar"
                          aria-valuenow={stats.pendingPlayers}
                          aria-valuemin={0}
                          aria-valuemax={stats.totalPlayers}
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
    </div>
  )
}