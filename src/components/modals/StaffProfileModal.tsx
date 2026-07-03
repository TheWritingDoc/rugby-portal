import { X, Mail, Phone, MapPin, School as SchoolIcon, Award, Calendar, CreditCard, Shield, UserCheck, Crown } from 'lucide-react'
import { schoolNameOf, zoneNameOf } from '../../utils/labels'
import { API_ORIGIN } from '../../utils/apiBase'

type StaffRole = 'Coach' | 'Referee' | 'SchoolAdmin' | 'ZoneCoordinator' | 'EPHSRUAdmin'

// Read-only profile modal for staff (coaches, referees, admins). Players have
// their own richer editable modal (PlayerProfileModal).
export default function StaffProfileModal({ person, role, onClose }: { person: any; role: StaffRole; onClose: () => void }) {
  const d = person?.data || {}
  const name = `${d.name || person?.name || ''} ${d.surname || person?.surname || ''}`.trim() || '—'
  const initials = `${(d.name || person?.name || '?')[0] || ''}${(d.surname || person?.surname || '')[0] || ''}`.toUpperCase()
  const email = d.email || person?.email || ''
  const phone = d.phone || d.contactNumber || person?.contactNumber || ''
  const idNumber = d.idNumber || person?.idNumber || ''
  const dob = d.dob || d.dateOfBirth || ''
  const schoolId = String(d.schoolId || person?.schoolId || '')
  const zoneId = String(d.zoneId || person?.zoneId || '')
  const rawPhoto = String(d.photoUrl || '')
  const photo = rawPhoto ? (rawPhoto.startsWith('/uploads') ? `${API_ORIGIN}${rawPhoto}` : rawPhoto) : ''
  const qualifications = d.qualifications || person?.qualifications || d.qualificationLevel || d.refereeLevel || ''
  const experience = d.yearsExperience || d.experience || person?.experience || ''
  const availability: string[] = Array.isArray(d.availability) ? d.availability : []
  const ageGroups: string[] = Array.isArray(d.coachingAgeGroups) ? d.coachingAgeGroups : (d.team ? [d.team] : [])

  const ROLE_META: Record<StaffRole, { label: string; Icon: any; grad: string }> = {
    Coach: { label: 'Coach Profile', Icon: UserCheck, grad: 'from-green-800 via-green-700 to-emerald-600' },
    Referee: { label: 'Referee Profile', Icon: Award, grad: 'from-amber-700 via-amber-600 to-yellow-500' },
    SchoolAdmin: { label: 'School Admin Profile', Icon: Shield, grad: 'from-blue-900 via-blue-800 to-blue-600' },
    ZoneCoordinator: { label: 'Zone Coordinator Profile', Icon: MapPin, grad: 'from-indigo-900 via-indigo-800 to-indigo-600' },
    EPHSRUAdmin: { label: 'Union Admin Profile', Icon: Crown, grad: 'from-purple-900 via-purple-800 to-purple-600' },
  }
  const meta = ROLE_META[role] || ROLE_META.Coach

  const Field = ({ icon: Icon, label, value }: { icon: any; label: string; value: any }) => (
    <div className="flex items-start gap-3 border-b border-dotted border-gray-200 py-2.5">
      <Icon size={15} className="mt-0.5 shrink-0 text-gray-400" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{label}</div>
        <div className="truncate text-sm font-semibold text-gray-800">{String(value || '—')}</div>
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose} data-testid="staff-profile-modal">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Banner */}
        <div className={`relative bg-gradient-to-br ${meta.grad} px-6 py-6 text-white`}>
          <button onClick={onClose} className="absolute right-3 top-3 rounded-full p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white" aria-label="Close">
            <X size={18} />
          </button>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-white/70">
            <meta.Icon size={14} aria-hidden="true" /> {meta.label}
          </div>
          <div className="mt-3 flex items-center gap-4">
            {photo ? (
              <img src={photo} alt={name} className="h-20 w-20 rounded-xl border-2 border-white/40 object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-white/15 text-2xl font-extrabold">{initials}</div>
            )}
            <div className="min-w-0">
              <h2 className="truncate text-2xl font-bold">{name}</h2>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {qualifications && <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold">{qualifications}</span>}
                {experience && <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold">{experience} yrs experience</span>}
                {ageGroups.map((g) => <span key={g} className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold">{g}</span>)}
              </div>
            </div>
          </div>
        </div>

        {/* Details */}
        <div className="px-6 py-4">
          <Field icon={Mail} label="Email" value={email} />
          <Field icon={Phone} label="Mobile" value={phone} />
          {schoolId && <Field icon={SchoolIcon} label="School" value={schoolNameOf(schoolId)} />}
          {zoneId && <Field icon={MapPin} label="Zone" value={zoneNameOf(zoneId)} />}
          {idNumber && <Field icon={CreditCard} label="ID Number" value={idNumber} />}
          {dob && <Field icon={Calendar} label="Date of Birth" value={dob} />}
          {role === 'Referee' && availability.length > 0 && (
            <Field icon={Calendar} label="Availability" value={availability.join(', ')} />
          )}
          {d.position && <Field icon={Award} label="Position / Title" value={d.position} />}
        </div>
      </div>
    </div>
  )
}
