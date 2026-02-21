import { useState, useEffect } from 'react'
import { X, Save, AlertCircle, CheckCircle } from 'lucide-react'
import { AGE_GROUPS, POSITIONS, RELATIONSHIPS } from '../../utils/constants'
import { isEmail, isPhoneZA, isIdNumber } from '../../utils/validation'
import { putJson, safePut } from '../../utils/api'
import { login } from '../../utils/auth'
import { emitPlayersUpdated } from '../../utils/events'

interface PlayerProfileModalProps {
  player: any
  onClose: () => void
  onUpdated: () => void
  role?: string // 'SchoolAdmin' | 'Coach' etc.
}

export default function PlayerProfileModal({ player, onClose, onUpdated, role = 'SchoolAdmin' }: PlayerProfileModalProps) {
  const d = player.data || {}
  const [vals, setVals] = useState<any>({ ...d })
  const id = player.id || d.serverId || ''
  const [banner, setBanner] = useState<{ t: 'success' | 'error', msg: string } | null>(null)
  const [activeSection, setActiveSection] = useState<'personal' | 'guardian' | 'rugby' | 'medical'>('personal')

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
    await login(role, rowZone, rowSchool)

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="flex h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b bg-gray-50 px-6 py-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Player Profile</h2>
            <p className="text-sm text-gray-500">{vals.name} {vals.surname} • {vals.team || vals.ageGroup || 'Unassigned'}</p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 hover:bg-gray-200 transition-colors">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Banner */}
        {banner && (
          <div className={`px-6 py-2 text-sm font-medium flex items-center gap-2 ${
            banner.t === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}>
            {banner.t === 'success' ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            {banner.msg}
          </div>
        )}

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar Navigation */}
          <div className="w-48 border-r bg-gray-50 p-4 hidden sm:block">
            <nav className="space-y-1">
              {[
                { id: 'personal', label: 'Personal' },
                { id: 'guardian', label: 'Guardian' },
                { id: 'rugby', label: 'Rugby Info' },
                { id: 'medical', label: 'Medical' },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveSection(item.id as any)}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                    activeSection === item.id
                      ? 'bg-white text-blue-600 shadow-sm ring-1 ring-gray-200'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Form Fields */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              {fields.filter(f => f.section === activeSection).map((f) => (
                <div key={f.key} className="space-y-1">
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {f.label}
                  </label>
                  <div className="relative flex items-center">
                    {f.key === 'gender' ? (
                      <select 
                        className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm py-2.5"
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
                        className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm py-2.5"
                        value={vals[f.key] ?? ''}
                        onChange={(e) => setValue(f.key, e.target.value)}
                        onBlur={() => saveField(f.key)}
                      >
                        {AGE_GROUPS.map(g => <option key={g}>{g}</option>)}
                      </select>
                    ) : f.key === 'position' ? (
                      <select 
                        className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm py-2.5"
                        value={vals[f.key] ?? ''}
                        onChange={(e) => setValue(f.key, e.target.value)}
                        onBlur={() => saveField(f.key)}
                      >
                         <option value="">Select...</option>
                        {POSITIONS.map(p => <option key={p}>{p}</option>)}
                      </select>
                    ) : f.key === 'relationship' ? (
                      <select 
                        className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm py-2.5"
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
                        className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm py-2.5"
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
            <div className="mt-8 flex justify-between sm:hidden border-t pt-4">
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