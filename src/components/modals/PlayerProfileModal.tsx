import { useState } from 'react'
import { X, AlertCircle, CheckCircle, User, Shield, Activity, Heart, School, MapPin } from 'lucide-react'
import { RELATIONSHIPS } from '../../utils/constants'
import { ageGroupsForZone, positionsForZone } from '../../data/leagues'
import { isEmail, isPhoneZA, isIdNumber } from '../../utils/validation'
import { putJson } from '../../utils/api'
import { ensureSession } from '../../utils/auth'
import { emitPlayersUpdated } from '../../utils/events'
import { API_ORIGIN } from '../../utils/apiBase'
import { schoolNameOf, zoneNameOf } from '../../utils/labels'

interface PlayerProfileModalProps {
  player: any
  onClose: () => void
  onUpdated: () => void
  role?: string // 'SchoolAdmin' | 'Coach' etc.
}

const SECTIONS = [
  { id: 'personal', label: 'Personal', icon: User, hint: 'Identity & contact details' },
  { id: 'guardian', label: 'Guardian', icon: Shield, hint: 'Parent & emergency contacts' },
  { id: 'rugby', label: 'Rugby Info', icon: Activity, hint: 'Team, position & history' },
  { id: 'medical', label: 'Medical', icon: Heart, hint: 'Medical aid & conditions' },
] as const

export default function PlayerProfileModal({ player, onClose, onUpdated, role = 'SchoolAdmin' }: PlayerProfileModalProps) {
  const d = player.data || {}
  const [vals, setVals] = useState<any>({ ...d })
  const id = player.id || d.serverId || ''
  const [banner, setBanner] = useState<{ t: 'success' | 'error', msg: string } | null>(null)
  const [activeSection, setActiveSection] = useState<'personal' | 'guardian' | 'rugby' | 'medical'>('personal')

  const photo = typeof vals.photoUrl === 'string' && vals.photoUrl.startsWith('/uploads') ? `${API_ORIGIN}${vals.photoUrl}` : (vals.photoUrl || '')
  const initials = (((vals.name || '').charAt(0) + (vals.surname || '').charAt(0)).toUpperCase() || 'P')
  const status = String(vals.status || '').toLowerCase()

  // Fields definition
  const fields: { key: string; label: string; type?: 'text' | 'date' | 'email' | 'number'; section: 'personal' | 'guardian' | 'rugby' | 'medical' }[] = [
    // Personal
    { key: 'name', label: 'Name', section: 'personal' },
    { key: 'surname', label: 'Surname', section: 'personal' },
    { key: 'idNumber', label: 'ID/Passport', section: 'personal' },
    { key: 'dob', label: 'Date of Birth', type: 'date', section: 'personal' },
    { key: 'gender', label: 'Gender', section: 'personal' },
    { key: 'ageGroup', label: 'Age Group', section: 'personal' },
    { key: 'phone', label: 'Mobile', section: 'personal' },
    { key: 'email', label: 'Email', type: 'email', section: 'personal' },
    { key: 'address', label: 'Address', section: 'personal' },

    // Guardian
    { key: 'parentName', label: 'Parent/Guardian Name', section: 'guardian' },
    { key: 'parentSurname', label: 'Parent/Guardian Surname', section: 'guardian' },
    { key: 'relationship', label: 'Relationship', section: 'guardian' },
    { key: 'parentContact', label: 'Parent Contact', section: 'guardian' },
    { key: 'parentEmail', label: 'Parent Email', type: 'email', section: 'guardian' },
    { key: 'emergencyContactName', label: 'Emergency Contact Name', section: 'guardian' },
    { key: 'emergencyContactNumber', label: 'Emergency Contact Number', section: 'guardian' },

    // Rugby
    { key: 'position', label: 'Position', section: 'rugby' },
    { key: 'jerseyNumber', label: 'Jersey Number', type: 'number', section: 'rugby' },
    { key: 'team', label: 'Team', section: 'rugby' },
    { key: 'previousSchool', label: 'Previous School/Team', section: 'rugby' },

    // Medical
    { key: 'medicalAidName', label: 'Medical Aid Name', section: 'medical' },
    { key: 'medicalAidNumber', label: 'Medical Aid Number', section: 'medical' },
    { key: 'allergies', label: 'Allergies', section: 'medical' },
    { key: 'chronicConditions', label: 'Chronic Conditions', section: 'medical' },
    { key: 'medicalNotes', label: 'Medical Notes', section: 'medical' },
  ]

  function setValue(k: string, v: string) {
    setVals((prev: any) => ({ ...prev, [k]: v }))
  }

  async function saveField(k: string) {
    if (!id) return
    const value = (vals[k] ?? '').toString().trim()

    // Validation
    if (k === 'email' && value && !isEmail(value)) { setBanner({t: 'error', msg: 'Invalid email'}); return }
    if (k === 'phone' && value && !isPhoneZA(value)) { setBanner({t: 'error', msg: 'Invalid phone'}); return }
    if (k === 'idNumber' && value && !isIdNumber(value)) { setBanner({t: 'error', msg: 'Invalid ID number'}); return }

    const rowZone = (player.zoneId ?? d.zoneId ?? '') as string
    const rowSchool = (player.schoolId ?? d.schoolId ?? '') as string

    // Auth context
    await ensureSession()

    // Save
    const res = await putJson('players', id, { [k]: value, schoolId: rowSchool, zoneId: rowZone })

    if (res) {
      setBanner({ t: 'success', msg: 'Saved' })
      emitPlayersUpdated(id)
      await onUpdated()
    } else {
      setBanner({ t: 'error', msg: 'Update failed' })
    }
    setTimeout(() => setBanner(null), 2000)
  }

  const inputClass = 'block w-full rounded-lg border-gray-300 bg-white shadow-sm transition focus:border-blue-500 focus:ring-blue-500 sm:text-sm py-2.5'
  const section = SECTIONS.find((s) => s.id === activeSection)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="flex h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
        {/* Header banner */}
        <div className="relative bg-gradient-to-r from-slate-900 via-blue-900 to-blue-700 px-6 py-5 text-white">
          <div className="flex items-center gap-4">
            <div className="relative shrink-0 rounded-full bg-white/10 p-1 ring-2 ring-white/30">
              {photo ? (
                <img
                  src={photo}
                  alt="Profile"
                  className="h-16 w-16 rounded-full object-cover"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10 text-xl font-bold text-white">{initials}</div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold uppercase tracking-widest text-blue-200">Player Profile</div>
              <h2 className="truncate text-xl font-bold">{vals.name} {vals.surname}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-blue-100">
                <span className="inline-flex items-center gap-1"><School className="h-3.5 w-3.5" />{schoolNameOf(vals.schoolId || player.schoolId) || 'No school'}</span>
                {(vals.zoneId || player.zoneId) && (
                  <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{zoneNameOf(vals.zoneId || player.zoneId)}</span>
                )}
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <button onClick={onClose} className="rounded-full p-2 text-blue-100 transition-colors hover:bg-white/10 hover:text-white" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
              <div className="flex flex-wrap justify-end gap-1.5">
                {status === 'pending' && <span className="rounded-full bg-amber-400/90 px-2.5 py-0.5 text-xs font-bold text-amber-950">Pending</span>}
                {status === 'rejected' && <span className="rounded-full bg-red-500/90 px-2.5 py-0.5 text-xs font-bold text-white">Rejected</span>}
                {(status === 'approved' || status === '') && <span className="rounded-full bg-emerald-400/90 px-2.5 py-0.5 text-xs font-bold text-emerald-950">Active</span>}
                {(vals.team || vals.ageGroup) && (
                  <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold text-white ring-1 ring-white/30">{vals.team || vals.ageGroup}</span>
                )}
                {vals.position && (
                  <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold text-white ring-1 ring-white/30">{vals.position}</span>
                )}
                {vals.jerseyNumber && (
                  <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold text-white ring-1 ring-white/30">#{vals.jerseyNumber}</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Banner */}
        {banner && (
          <div className={`flex items-center gap-2 px-6 py-2 text-sm font-medium ${
            banner.t === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}>
            {banner.t === 'success' ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            {banner.msg}
          </div>
        )}

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar Navigation */}
          <div className="hidden w-56 border-r bg-gray-50/80 p-4 sm:block">
            <nav className="space-y-1">
              {SECTIONS.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveSection(item.id as any)}
                  className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                    activeSection === item.id
                      ? 'bg-white text-blue-700 shadow-sm ring-1 ring-gray-200'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <item.icon className={`mt-0.5 h-4 w-4 shrink-0 ${activeSection === item.id ? 'text-blue-600' : 'text-gray-400'}`} />
                  <span>
                    <span className="block text-sm font-semibold leading-tight">{item.label}</span>
                    <span className="block text-[11px] text-gray-400">{item.hint}</span>
                  </span>
                </button>
              ))}
            </nav>
            <div className="mt-6 rounded-lg border border-blue-100 bg-blue-50 p-3 text-[11px] leading-relaxed text-blue-700">
              Changes save automatically when you leave a field.
            </div>
          </div>

          {/* Form Fields */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="mb-5 border-b pb-3">
              <h3 className="text-base font-semibold text-gray-900">{section?.label}</h3>
              <p className="text-xs text-gray-500">{section?.hint}</p>
            </div>
            <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
              {fields.filter(f => f.section === activeSection).map((f) => (
                <div key={f.key} className="space-y-1">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500">
                    {f.label}
                  </label>
                  <div className="relative flex items-center">
                    {f.key === 'gender' ? (
                      <select
                        className={inputClass}
                        value={vals[f.key] ?? ''}
                        onChange={(e) => setValue(f.key, e.target.value)}
                        onBlur={() => saveField(f.key)}
                      >
                        <option value="">Select...</option>
                        <option>Male</option>
                        <option>Female</option>
                      </select>
                    ) : f.key === 'ageGroup' ? (
                      <select
                        className={inputClass}
                        value={vals[f.key] ?? ''}
                        onChange={(e) => setValue(f.key, e.target.value)}
                        onBlur={() => saveField(f.key)}
                      >
                        {ageGroupsForZone(vals.zoneId || player.zoneId).map(g => <option key={g}>{g}</option>)}
                      </select>
                    ) : f.key === 'position' ? (
                      <select
                        className={inputClass}
                        value={vals[f.key] ?? ''}
                        onChange={(e) => setValue(f.key, e.target.value)}
                        onBlur={() => saveField(f.key)}
                      >
                        <option value="">Select...</option>
                        {positionsForZone(vals.zoneId || player.zoneId).map(p => <option key={p}>{p}</option>)}
                      </select>
                    ) : f.key === 'relationship' ? (
                      <select
                        className={inputClass}
                        value={vals[f.key] ?? ''}
                        onChange={(e) => setValue(f.key, e.target.value)}
                        onBlur={() => saveField(f.key)}
                      >
                        <option value="">Select...</option>
                        {RELATIONSHIPS.map(r => <option key={r}>{r}</option>)}
                      </select>
                    ) : (
                      <input
                        type={f.type || 'text'}
                        className={inputClass}
                        value={vals[f.key] ?? ''}
                        onChange={(e) => setValue(f.key, e.target.value)}
                        onBlur={() => saveField(f.key)}
                        onKeyDown={(e) => e.key === 'Enter' && saveField(f.key)}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Mobile Nav Helper */}
            <div className="mt-8 flex justify-between border-t pt-4 sm:hidden">
               <button
                 disabled={activeSection === 'personal'}
                 onClick={() => {
                   const secs = ['personal', 'guardian', 'rugby', 'medical']
                   const idx = secs.indexOf(activeSection)
                   if (idx > 0) setActiveSection(secs[idx - 1] as any)
                 }}
                 className="text-sm font-medium text-blue-600 disabled:text-gray-400"
               >
                 Previous
               </button>
               <button
                 disabled={activeSection === 'medical'}
                 onClick={() => {
                    const secs = ['personal', 'guardian', 'rugby', 'medical']
                    const idx = secs.indexOf(activeSection)
                    if (idx < secs.length - 1) setActiveSection(secs[idx + 1] as any)
                 }}
                 className="text-sm font-medium text-blue-600 disabled:text-gray-400"
               >
                 Next
               </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
