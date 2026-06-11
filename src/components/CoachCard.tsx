import { Mail, Phone, Award, Clock } from 'lucide-react'
import { API_ORIGIN } from '../utils/apiBase'

export function coachPhotoUrl(coach: any): string {
  const d = coach?.data || {}
  const url = d.photoUrl
  if (typeof url !== 'string' || !url) return ''
  return url.startsWith('/uploads') ? `${API_ORIGIN}${url}` : url
}

export function CoachAvatar({ coach, size = 'md' }: { coach: any; size?: 'sm' | 'md' | 'lg' }) {
  const d = coach?.data || {}
  const photo = coachPhotoUrl(coach)
  const initials = (((d.name || '').charAt(0) + (d.surname || '').charAt(0)).toUpperCase() || 'C')
  const cls = size === 'lg' ? 'h-16 w-16 text-xl' : size === 'sm' ? 'h-8 w-8 text-xs' : 'h-12 w-12 text-sm'
  if (photo) {
    return (
      <img
        src={photo}
        alt={`${d.name || ''} ${d.surname || ''}`.trim() || 'Coach'}
        className={`${cls} shrink-0 rounded-full object-cover ring-2 ring-purple-200`}
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
      />
    )
  }
  return (
    <div className={`${cls} flex shrink-0 items-center justify-center rounded-full bg-purple-100 font-bold text-purple-700 ring-2 ring-purple-200`}>
      {initials}
    </div>
  )
}

export default function CoachCard({ coach, actions }: { coach: any; actions?: React.ReactNode }) {
  const d = coach?.data || {}
  const name = `${d.name || ''} ${d.surname || ''}`.trim() || 'Coach'
  const position = String(d.position || 'Coach')
  const team = String(d.team || (Array.isArray(d.coachingAgeGroups) ? d.coachingAgeGroups.join(', ') : '') || '')
  const qualification = String(d.qualifications || coach?.qualifications || '')
  const experience = String(d.experience || coach?.experience || '')
  const email = String(d.email || coach?.email || '')
  const phone = String(d.phone || d.contactNumber || coach?.contactNumber || '')
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border bg-white p-4 shadow-sm transition hover:shadow-md" data-coach-name={name}>
      <div className="flex min-w-0 items-start gap-4">
        <CoachAvatar coach={coach} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-semibold text-gray-900">{name}</span>
            {team && (
              <span className="rounded-full bg-purple-50 px-2 py-0.5 text-xs font-semibold text-purple-700 ring-1 ring-purple-200">{team}</span>
            )}
          </div>
          <div className="text-xs font-medium uppercase tracking-wide text-purple-600">{position}</div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
            {email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{email}</span>}
            {phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{phone}</span>}
            {qualification && qualification !== 'None' && (
              <span className="inline-flex items-center gap-1"><Award className="h-3 w-3 text-amber-500" />{qualification}</span>
            )}
            {experience && (
              <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{experience} yrs experience</span>
            )}
          </div>
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}
