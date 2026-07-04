import { useState, useEffect, useMemo } from 'react'
import { 
  Users, UserCheck, School, MapPin, Calendar, Award, 
  TrendingUp, AlertCircle, ChevronDown, ChevronUp,
  Shield, Activity, FileText, MoreVertical, Filter,
  Download, Search, Plus, Edit, Trash2, Mail, Phone,
  BarChart3, PieChart as PieChartIcon, UserPlus,
  List as ListIcon, LayoutGrid, Folder, ChevronLeft,
  CheckCircle, XCircle
} from 'lucide-react'
import { fetchList, postJson, putJson } from '../../utils/api'
import { login } from '../../utils/auth'
import PlayerCard from '../PlayerCard'
import SchoolCard from '../SchoolCard'
import RefereeCard from '../RefereeCard'
import CoachCard from '../CoachCard'
import { zoneNameOf } from '../../utils/labels'
import PlayerProfileModal from '../modals/PlayerProfileModal'
import StaffProfileModal from '../modals/StaffProfileModal'
import SchoolPeopleBrowser from '../SchoolPeopleBrowser'

interface ZoneCoordinatorDashboardProps {
  zone?: string
  schools: any[]
  players: any[]
  coaches: any[]
  referees: any[]
  admins?: any[]
  onRefresh: () => void
}

export default function ZoneCoordinatorDashboard({
  zone,
  schools,
  players,
  coaches,
  referees,
  admins = [],
  onRefresh
}: ZoneCoordinatorDashboardProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'schools' | 'referees' | 'requests'>('overview')
  const [searchQuery, setSearchQuery] = useState('')
  const [showAddReferee, setShowAddReferee] = useState(false)
  const [selectedSchool, setSelectedSchool] = useState<any | null>(null)
  const [viewingPlayer, setViewingPlayer] = useState<any | null>(null)
  const [viewingStaff, setViewingStaff] = useState<{ person: any; role: 'Coach' | 'Referee' | 'SchoolAdmin' } | null>(null)
  const [assigningReferee, setAssigningReferee] = useState<any | null>(null)
  
  // School Registration
  const [schoolFilter, setSchoolFilter] = useState<'all' | 'active' | 'unregistered'>('all')
  const [registeringSchool, setRegisteringSchool] = useState<any | null>(null)
  const [adminForm, setAdminForm] = useState({
    name: '', surname: '', email: '', phone: ''
  })

  // Get current user details from local storage
  const [currentUser, setCurrentUser] = useState<any>(null)

  useEffect(() => {
    try {
      const name = localStorage.getItem('auth:name') || ''
      const surname = localStorage.getItem('auth:surname') || ''
      const email = localStorage.getItem('auth:email') || ''
      setCurrentUser({ name, surname, email })
    } catch (e) {
      console.error('Failed to load user profile', e)
    }
  }, [])

  // Zone statistics
  const stats = useMemo(() => {
    return {
      totalSchools: schools.length,
      totalPlayers: players.length,
      totalCoaches: coaches.length,
      totalReferees: referees.length,
      pendingPlayers: players.filter(p => String(p.data?.status || '').toLowerCase() === 'pending').length,
      rejectedPlayers: players.filter(p => String(p.data?.status || '').toLowerCase() === 'rejected').length
    }
  }, [schools, players, coaches, referees])

  // School Stats (Activity)
  const schoolStats = useMemo(() => {
    const map = new Map()
    schools.forEach(s => {
      // Check if school has players
      const pCount = players.filter(p => 
        String(p.data?.schoolId || '') === String(s.id) || 
        String(p.schoolId || '') === String(s.id)
      ).length
      
      // Check if school has coaches
      const cCount = coaches.filter(c => 
        String(c.data?.schoolId || '') === String(s.id) || 
        String(c.schoolId || '') === String(s.id)
      ).length
      
      map.set(s.id, { 
        pCount, 
        cCount, 
        active: pCount > 0 || cCount > 0 
      })
    })
    return map
  }, [schools, players, coaches])

  // Filtered lists
  const filteredSchools = useMemo(() => {
    let list = schools
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      list = list.filter(s => 
        (s.data?.name || '').toLowerCase().includes(q) || 
        (s.id || '').toLowerCase().includes(q)
      )
    }
    
    if (schoolFilter === 'active') {
      list = list.filter(s => schoolStats.get(s.id)?.active)
    } else if (schoolFilter === 'unregistered') {
      list = list.filter(s => {
        const stats = schoolStats.get(s.id)
        // If no stats found, assume inactive. If stats found, check if active is false.
        return !stats || !stats.active
      })
    }
    
    return list
  }, [schools, searchQuery, schoolFilter, schoolStats])

  const filteredReferees = useMemo(() => {
    if (!searchQuery) return referees
    const q = searchQuery.toLowerCase()
    return referees.filter(r => 
      `${r.data?.name || ''} ${r.data?.surname || ''}`.toLowerCase().includes(q) ||
      (r.email || '').toLowerCase().includes(q)
    )
  }, [referees, searchQuery])

  // Rejected Requests
  const rejectedRequests = useMemo(() => {
    return players.filter(p => String(p.data?.status || '').toLowerCase() === 'rejected')
  }, [players])

  // Quick actions for referees
  const [refereeForm, setRefereeForm] = useState({
    name: '', surname: '', email: '', contactNumber: '', idNumber: '', qualifications: '', experience: ''
  })

  const handleAddReferee = async () => {
    if (!zone) return
    const payload = {
      ...refereeForm,
      zoneId: zone,
      role: 'Referee'
    }
    const res = await postJson('referees', payload)
    if (res) {
      setShowAddReferee(false)
      setRefereeForm({ name: '', surname: '', email: '', contactNumber: '', idNumber: '', qualifications: '', experience: '' })
      onRefresh()
    }
  }

  const handleAssignReferee = async (schoolId: string) => {
    if (!assigningReferee) return
    const payload = {
      ...assigningReferee.data,
      schoolId: schoolId
    }
    await putJson('referees', assigningReferee.id, payload)
    setAssigningReferee(null)
    onRefresh()
  }

  const handleOverrideRejection = async (player: any) => {
    if (!confirm(`Override rejection for ${player.data?.name}? This will approve the player.`)) return
    
    const updatedData = { 
      ...player.data, 
      status: 'approved', 
      overrideBy: 'ZoneCoordinator',
      overrideDate: Date.now()
    }
    
    await putJson('players', player.id, updatedData)
    onRefresh()
  }

  const handleRegisterSchool = async () => {
    if (!registeringSchool || !zone) return
    const payload = {
      ...adminForm,
      role: 'SchoolAdmin',
      zoneId: zone,
      schoolId: registeringSchool.id,
      contactNumber: adminForm.phone
    }
    const res = await postJson('admins', payload)
    if (res) {
      setRegisteringSchool(null)
      setAdminForm({ name: '', surname: '', email: '', phone: '' })
      onRefresh()
    }
  }

  if (selectedSchool) {
    const schoolPlayers = players.filter(p => p.data?.schoolId === selectedSchool.id)
    const schoolCoaches = coaches.filter(c => c.data?.schoolId === selectedSchool.id)

    return (
      <div className="space-y-6">
        <button 
          onClick={() => setSelectedSchool(null)}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Dashboard
        </button>

        <div className="rounded-2xl bg-white p-6 shadow-sm border">
          <div className="flex items-center gap-4 mb-6">
            <div className="h-16 w-16 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
              <School className="h-8 w-8" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{selectedSchool.data?.name}</h1>
              <p className="text-gray-500">{selectedSchool.data?.address || 'No address'}</p>
            </div>
          </div>

          {/* Organised folder view: staff first, then one collapsible folder per team */}
          <SchoolPeopleBrowser
            schoolId={String(selectedSchool.id)}
            players={players}
            coaches={coaches}
            referees={referees}
            admins={admins}
            onViewPlayer={(p) => setViewingPlayer(p)}
            onViewStaff={(person, role) => setViewingStaff({ person, role })}
          />
        </div>

        {viewingPlayer && (
          <PlayerProfileModal
            player={viewingPlayer}
            role="ZoneCoordinator"
            onClose={() => setViewingPlayer(null)}
            onUpdated={() => onRefresh()}
          />
        )}
        {viewingStaff && (
          <StaffProfileModal person={viewingStaff.person} role={viewingStaff.role} onClose={() => setViewingStaff(null)} />
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Zone Header Card */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-700 via-emerald-600 to-teal-500 text-white shadow-xl">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48Y2lyY2xlIGN4PSIzMCIgY3k9IjMwIiByPSIyIi8+PC9nPjwvZz48L3N2Zz4=')] opacity-30"></div>
        <div className="relative px-8 py-8">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-6">
              <div className="h-24 w-24 rounded-full border-4 border-white/30 bg-white/10 flex items-center justify-center text-4xl font-bold backdrop-blur-sm shadow-inner">
                {currentUser?.name?.[0]}{currentUser?.surname?.[0]}
              </div>
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <span className="bg-white/20 px-3 py-1 rounded-full text-xs font-medium backdrop-blur-sm border border-white/10">Zone Administration</span>
                </div>
                <h1 className="text-3xl font-bold mb-1">{zone ? zoneNameOf(zone) : 'Zone Dashboard'}</h1>
                <div className="text-xl text-emerald-100 font-medium mb-2">
                  Coordinator: {currentUser?.name} {currentUser?.surname}
                </div>
                <div className="flex items-center gap-4 text-emerald-100 text-sm">
                  <span className="flex items-center gap-1"><School className="h-4 w-4" /> Managing {stats.totalSchools} Schools</span>
                </div>
              </div>
            </div>
            <div className="text-right hidden sm:block">
              <div className="text-5xl font-bold mb-1">{stats.totalPlayers}</div>
              <div className="text-emerald-100 text-sm font-medium uppercase tracking-wider">Total Players</div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <div className="rounded-lg bg-blue-50 p-2">
              <School className="h-5 w-5 text-blue-600" />
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-900">{stats.totalSchools}</div>
          <div className="text-sm text-gray-500">Schools</div>
        </div>

        <div className="rounded-xl border bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <div className="rounded-lg bg-amber-50 p-2">
              <Shield className="h-5 w-5 text-amber-600" />
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-900">{stats.totalReferees}</div>
          <div className="text-sm text-gray-500">Referees</div>
        </div>

        <div className="rounded-xl border bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <div className="rounded-lg bg-red-50 p-2">
              <XCircle className="h-5 w-5 text-red-600" />
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-900">{stats.rejectedPlayers}</div>
          <div className="text-sm text-gray-500">Rejected Requests</div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8">
          {[
            { id: 'overview', label: 'Overview', icon: Activity },
            { id: 'schools', label: 'Schools', icon: School },
            { id: 'referees', label: 'Referees', icon: Shield },
            { id: 'requests', label: 'Requests', icon: FileText },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === tab.id
                  ? 'border-emerald-600 text-emerald-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
              {tab.id === 'requests' && rejectedRequests.length > 0 && (
                <span className="ml-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600">
                  {rejectedRequests.length}
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
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rounded-xl border bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold mb-4">Zone Status</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <span className="text-gray-600">Active Schools</span>
                    <span className="text-xl font-bold text-gray-900">{stats.totalSchools}</span>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <span className="text-gray-600">Total Players</span>
                    <span className="text-xl font-bold text-gray-900">{stats.totalPlayers}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SCHOOLS TAB */}
        {activeTab === 'schools' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-lg self-start">
                <button
                  onClick={() => setSchoolFilter('all')}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${schoolFilter === 'all' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  All
                </button>
                <button
                  onClick={() => setSchoolFilter('active')}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${schoolFilter === 'active' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  Active
                </button>
                <button
                  onClick={() => setSchoolFilter('unregistered')}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${schoolFilter === 'unregistered' ? 'bg-white text-amber-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  Unregistered
                </button>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search schools..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-4 py-2 text-sm rounded-lg border border-gray-300 focus:border-emerald-500 focus:ring-emerald-500 w-full sm:w-64"
                />
              </div>
            </div>

            {/* Same school stat cards the union dashboard uses — one look everywhere */}
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {filteredSchools.map((s) => {
                const st = schoolStats.get(s.id) || { pCount: 0, cCount: 0, active: false }
                const aCount = (admins || []).filter((a) => (a.role === 'SchoolAdmin' || a.data?.role === 'SchoolAdmin') && String(a.data?.schoolId || a.schoolId || '') === String(s.id)).length
                return (
                  <div key={s.id} className="relative group">
                    <button
                      type="button"
                      onClick={() => setSelectedSchool(s)}
                      className={`w-full text-left rounded-xl border p-6 shadow-sm transition-all hover:shadow-md ${st.active ? 'bg-white hover:border-emerald-200' : 'bg-gray-50 border-gray-200 opacity-80'}`}
                    >
                      <div className={`absolute top-2 right-2 px-2 py-0.5 text-[10px] font-bold uppercase rounded ${st.active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                        {st.active ? 'Registered' : 'Unregistered'}
                      </div>
                      <div className="flex items-center gap-4 mb-4">
                        <div className={`h-12 w-12 rounded-full flex items-center justify-center transition-colors ${st.active ? 'bg-emerald-50 group-hover:bg-emerald-600' : 'bg-gray-200'}`}>
                          <School className={`h-6 w-6 ${st.active ? 'text-emerald-600 group-hover:text-white' : 'text-gray-400'}`} />
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-bold text-gray-900 line-clamp-1">{s.data?.name || s.name}</h3>
                          <div className="text-xs text-gray-500 truncate">ID: {s.schoolId || String(s.id).slice(0, 12)}</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center text-sm border-t pt-4">
                        <div>
                          <div className="font-bold text-gray-900">{aCount}</div>
                          <div className="text-xs text-gray-500">Admins</div>
                        </div>
                        <div className="border-l">
                          <div className="font-bold text-gray-900">{st.cCount}</div>
                          <div className="text-xs text-gray-500">Coaches</div>
                        </div>
                        <div className="border-l">
                          <div className="font-bold text-gray-900">{st.pCount}</div>
                          <div className="text-xs text-gray-500">Players</div>
                        </div>
                      </div>
                    </button>
                    {!st.active && (
                      <div className="absolute bottom-3 right-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setRegisteringSchool(s)
                          }}
                          className="flex items-center gap-1 px-3 py-1 bg-emerald-600 text-white text-xs font-bold rounded-full shadow-lg hover:bg-emerald-700 transition-colors"
                        >
                          <UserPlus className="h-3 w-3" />
                          Register
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
              {filteredSchools.length === 0 && (
                <div className="col-span-full py-12 text-center text-gray-500 border border-dashed rounded-xl">
                  No schools found
                </div>
              )}
            </div>
          </div>
        )}

        {/* REFEREES TAB */}
        {activeTab === 'referees' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Manage Referees</h3>
              <button 
                onClick={() => setShowAddReferee(true)}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
              >
                <Plus className="h-4 w-4" />
                Add Referee
              </button>
            </div>

            {showAddReferee && (
              <div className="rounded-xl border bg-white p-6 shadow-sm">
                <h4 className="font-medium mb-4">Add New Referee</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <input
                    placeholder="Name"
                    value={refereeForm.name}
                    onChange={(e) => setRefereeForm({...refereeForm, name: e.target.value})}
                    className="px-4 py-2 border rounded-lg"
                  />
                  <input
                    placeholder="Surname"
                    value={refereeForm.surname}
                    onChange={(e) => setRefereeForm({...refereeForm, surname: e.target.value})}
                    className="px-4 py-2 border rounded-lg"
                  />
                  <input
                    placeholder="Email"
                    type="email"
                    value={refereeForm.email}
                    onChange={(e) => setRefereeForm({...refereeForm, email: e.target.value})}
                    className="px-4 py-2 border rounded-lg"
                  />
                  <input
                    placeholder="Contact Number"
                    value={refereeForm.contactNumber}
                    onChange={(e) => setRefereeForm({...refereeForm, contactNumber: e.target.value})}
                    className="px-4 py-2 border rounded-lg"
                  />
                  <input
                    placeholder="ID Number"
                    value={refereeForm.idNumber}
                    onChange={(e) => setRefereeForm({...refereeForm, idNumber: e.target.value})}
                    className="px-4 py-2 border rounded-lg"
                  />
                  <input
                    placeholder="Qualifications"
                    value={refereeForm.qualifications}
                    onChange={(e) => setRefereeForm({...refereeForm, qualifications: e.target.value})}
                    className="px-4 py-2 border rounded-lg"
                  />
                  <input
                    placeholder="Experience"
                    value={refereeForm.experience}
                    onChange={(e) => setRefereeForm({...refereeForm, experience: e.target.value})}
                    className="px-4 py-2 border rounded-lg sm:col-span-2"
                  />
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={handleAddReferee}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
                  >
                    Save Referee
                  </button>
                  <button 
                    onClick={() => setShowAddReferee(false)}
                    className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Same amber "official" chips used on the school views — one look everywhere */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {filteredReferees.map((r) => {
                const assignedSchool = r.data?.schoolId ? (schools.find(s => s.id === r.data.schoolId)?.data?.name || 'Unknown School') : ''
                return (
                  <div key={r.id} className="relative group rounded-xl border bg-amber-50 border-amber-100 p-4">
                    <div className="flex items-center gap-3">
                      <div className="h-11 w-11 shrink-0 rounded-full bg-amber-200 flex items-center justify-center text-amber-700 font-bold">
                        {(r.data?.name?.[0] || r.name?.[0] || '')}{(r.data?.surname?.[0] || r.surname?.[0] || '')}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-gray-900 truncate">{r.data?.name || r.name} {r.data?.surname || r.surname}</div>
                        <div className="text-xs text-gray-500 truncate">
                          {r.qualifications || r.data?.refereeLevel || 'Referee'}
                          {(r.experience || r.data?.yearsExperience) ? ` • ${r.experience || r.data?.yearsExperience} yrs` : ''}
                        </div>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${r.data?.schoolId ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-600'}`}>
                        {r.data?.schoolId ? 'Assigned' : 'Unassigned'}
                      </span>
                    </div>
                    {assignedSchool && (
                      <div className="mt-2 text-xs text-gray-500">Assigned to: {assignedSchool}</div>
                    )}
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => setViewingStaff({ person: r, role: 'Referee' })}
                        className="flex-1 rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                      >
                        View Profile
                      </button>
                      <button
                        onClick={() => setAssigningReferee(r)}
                        className="flex-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                      >
                        Assign to School
                      </button>
                    </div>
                  </div>
                )
              })}
              {filteredReferees.length === 0 && (
                <div className="col-span-full py-12 text-center text-gray-500 border border-dashed rounded-xl">
                  No referees found
                </div>
              )}
            </div>
          </div>
        )}

        {/* REQUESTS TAB */}
        {activeTab === 'requests' && (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold">Rejected Requests</h3>
            <div className="space-y-4">
              {rejectedRequests.map((player) => (
                <div key={player.id} className="rounded-xl border bg-white p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center text-red-600 font-bold text-lg">
                      {(player.data?.name?.[0] || '')}{(player.data?.surname?.[0] || '')}
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">
                        {player.data?.name} {player.data?.surname}
                      </div>
                      <div className="text-sm text-gray-500 flex items-center gap-3">
                        <span className="text-red-600 font-medium">Rejected</span>
                        <span>•</span>
                        <span>{player.data?.schoolId ? (schools.find(s => s.id === player.data.schoolId)?.data?.name) : 'Unknown School'}</span>
                      </div>
                      {player.data?.rejectionReason && (
                        <div className="text-sm text-red-600 mt-1">Reason: {player.data.rejectionReason}</div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setViewingPlayer(player)}
                      className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      View Profile
                    </button>
                    <button 
                      onClick={() => handleOverrideRejection(player)}
                      className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 flex items-center gap-2"
                    >
                      <Shield className="h-3 w-3" />
                      Override
                    </button>
                  </div>
                </div>
              ))}
              {rejectedRequests.length === 0 && (
                <div className="text-center py-12 text-gray-500 border border-dashed rounded-xl">
                  <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3 opacity-20" />
                  <p>No rejected requests found.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Register School Modal */}
      {registeringSchool && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-bold mb-4">Register School Admin</h3>
            <div className="mb-4 bg-emerald-50 p-3 rounded-lg border border-emerald-100">
              <p className="text-sm font-medium text-emerald-800">School: {registeringSchool.data?.name}</p>
              <p className="text-xs text-emerald-600">This will create a School Admin account for this school.</p>
            </div>
            <div className="space-y-4 mb-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-500">Name</label>
                  <input
                    value={adminForm.name}
                    onChange={(e) => setAdminForm({...adminForm, name: e.target.value})}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    placeholder="Admin Name"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-500">Surname</label>
                  <input
                    value={adminForm.surname}
                    onChange={(e) => setAdminForm({...adminForm, surname: e.target.value})}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    placeholder="Admin Surname"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500">Email Address</label>
                <input
                  type="email"
                  value={adminForm.email}
                  onChange={(e) => setAdminForm({...adminForm, email: e.target.value})}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  placeholder="admin@school.com"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500">Phone Number</label>
                <input
                  value={adminForm.phone}
                  onChange={(e) => setAdminForm({...adminForm, phone: e.target.value})}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  placeholder="082 123 4567"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button 
                onClick={handleRegisterSchool}
                disabled={!adminForm.email || !adminForm.name}
                className="flex-1 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                Create Admin
              </button>
              <button 
                onClick={() => setRegisteringSchool(null)}
                className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Referee Modal */}
      {assigningReferee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-bold mb-4">Assign Referee to School</h3>
            <p className="mb-4 text-gray-600">Select a school for {assigningReferee.data?.name} {assigningReferee.data?.surname}</p>
            <div className="space-y-2 max-h-60 overflow-y-auto mb-6">
              {schools.map(school => (
                <button
                  key={school.id}
                  onClick={() => handleAssignReferee(school.id)}
                  className="w-full text-left px-4 py-3 rounded-lg border hover:bg-emerald-50 hover:border-emerald-200 transition-colors"
                >
                  <div className="font-medium text-gray-900">{school.data?.name}</div>
                  <div className="text-xs text-gray-500">{school.data?.address}</div>
                </button>
              ))}
            </div>
            <button 
              onClick={() => setAssigningReferee(null)}
              className="w-full py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-lg"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Player Profile Modal */}
      {viewingPlayer && (
        <PlayerProfileModal
          player={viewingPlayer}
          role="ZoneCoordinator"
          onClose={() => setViewingPlayer(null)}
          onUpdated={() => onRefresh()}
        />
      )}
      {viewingStaff && (
        <StaffProfileModal person={viewingStaff.person} role={viewingStaff.role} onClose={() => setViewingStaff(null)} />
      )}
    </div>
  )
}
