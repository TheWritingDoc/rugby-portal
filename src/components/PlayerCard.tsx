import { API_ORIGIN } from '../utils/apiBase'
import { schoolNameOf } from '../utils/labels'
import React from 'react'

type PlayerRow = { id?: string, data?: any, schoolId?: string }

export default function PlayerCard({ player, badge, onClick }: { player: PlayerRow; badge?: string; onClick?: () => void }) {
  const d = player?.data || {}
  const initials = (((d.name || '').charAt(0) + (d.surname || '').charAt(0)).toUpperCase() || 'P')
  const photo = typeof d.photoUrl === 'string' && d.photoUrl.startsWith('/uploads') ? `${API_ORIGIN}${d.photoUrl}` : (d.photoUrl || '')
  const title = `${d.name || ''} ${d.surname || ''}`.trim() || initials
  const topBadge = badge || String(d.ageGroup || d.team || '—')
  const dob = String(d.dateOfBirth || d.dob || '—')
  const position = String(d.position || '—')
  const jersey = String(d.jerseyNumber || '').trim()
  const status = String(d.status || '').toLowerCase()
  return (
    <button
      className="group relative flex w-full flex-col overflow-hidden rounded-2xl bg-white text-left shadow-sm ring-1 ring-gray-200 transition duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:ring-blue-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      onClick={onClick}
      data-player-name={title}
    >
      {/* Photo */}
      <div className="relative h-44 w-full overflow-hidden bg-gradient-to-br from-slate-800 via-blue-900 to-blue-800">
        {photo ? (
          <img
            src={photo}
            alt={title}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-4xl font-bold tracking-wide text-white/80">{initials}</div>
        )}
        <span className="absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-0.5 text-xs font-bold text-blue-900 shadow-sm">{topBadge}</span>
        {status === 'pending' && (
          <span className="absolute right-3 top-3 rounded-full bg-amber-400 px-2.5 py-0.5 text-xs font-bold text-amber-950 shadow-sm">Pending</span>
        )}
        {status === 'rejected' && (
          <span className="absolute right-3 top-3 rounded-full bg-red-500 px-2.5 py-0.5 text-xs font-bold text-white shadow-sm">Rejected</span>
        )}
        {jersey && (
          <span className="absolute bottom-2 right-3 text-3xl font-black italic text-white/90 drop-shadow">#{jersey}</span>
        )}
        <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/50 to-transparent" />
      </div>

      {/* Details */}
      <div className="flex flex-1 flex-col p-4">
        <div className="truncate text-base font-bold leading-tight text-gray-900">{title}</div>
        <div className="mt-3 space-y-1.5 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium uppercase tracking-wider text-gray-400">Position</span>
            <span className="truncate font-semibold text-gray-700">{position}</span>
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-gray-100 pt-1.5">
            <span className="text-xs font-medium uppercase tracking-wider text-gray-400">Born</span>
            <span className="font-semibold text-gray-700">{dob}</span>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-2 text-xs text-gray-400">
          <span className="truncate">{schoolNameOf(d.schoolId || player.schoolId)}</span>
          <span className="font-semibold text-brand opacity-0 transition group-hover:opacity-100">View profile →</span>
        </div>
      </div>
    </button>
  )
}
