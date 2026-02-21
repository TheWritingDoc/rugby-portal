import { API_ORIGIN } from '../utils/apiBase'
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
  return (
    <button
      className="group relative rounded-2xl border-4 border-blue-700 bg-gradient-to-b from-blue-700 via-blue-600 to-blue-500 p-3 text-left shadow-lg hover:shadow-xl transition"
      onClick={onClick}
      data-player-name={title}
    >
      <div className="w-full text-center">
        <div className="mx-auto inline-block rounded-md bg-green-500 px-3 py-1 text-xs font-bold text-white">{title}</div>
      </div>
      <div className="mt-2 overflow-hidden rounded-lg ring-1 ring-white/30">
        {photo ? (
          <img src={photo} alt="Profile" className="h-40 w-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
        ) : (
          <div className="flex h-40 w-full items-center justify-center rounded-lg bg-brand/10 text-2xl font-bold text-white ring-1 ring-brand/30">{initials}</div>
        )}
      </div>
      <div className="mt-2 w-full text-center">
        <div className="inline-flex items-center rounded-full bg-white/20 px-2 py-0.5 text-xs font-semibold text-white ring-1 ring-white/30">{topBadge}</div>
      </div>
      <div className="mt-3 space-y-1">
        <div className="flex items-center justify-between rounded-md bg-gradient-to-r from-blue-500 via-blue-400 to-green-500 px-3 py-1">
          <span className="text-xs font-semibold text-white">POSITION</span>
          <span className="text-xs font-bold text-white">{position}</span>
        </div>
        <div className="flex items-center justify-between rounded-md bg-gradient-to-r from-blue-500 via-blue-400 to-green-500 px-3 py-1">
          <span className="text-xs font-semibold text-white">DATE OF BIRTH</span>
          <span className="text-xs font-bold text-white">{dob}</span>
        </div>
      </div>
    </button>
  )
}
