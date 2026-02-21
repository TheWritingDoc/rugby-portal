import React from 'react'

type RefRow = { id?: string, data?: any }

export default function RefereeCard({ referee, badge, onClick }: { referee: RefRow; badge?: string; onClick?: () => void }) {
  const d = referee?.data || {}
  const initials = (((d.name || '').charAt(0) + (d.surname || '').charAt(0)).toUpperCase() || 'R')
  const title = `${d.name || ''} ${d.surname || ''}`.trim() || initials
  const topBadge = badge || String(d.zoneId || '—')
  const qual = String(d.qualifications || '—')
  const exp = String(d.experience || '—')
  return (
    <button
      className="group relative rounded-2xl border-4 border-blue-700 bg-gradient-to-b from-blue-700 via-blue-600 to-blue-500 p-3 text-left shadow-lg hover:shadow-xl transition"
      onClick={onClick}
      data-ref-name={title}
    >
      <div className="w-full text-center">
        <div className="mx-auto inline-block rounded-md bg-green-500 px-3 py-1 text-xs font-bold text-white">{title}</div>
      </div>
      <div className="mt-2 w-full text-center">
        <div className="inline-flex items-center rounded-full bg-white/20 px-2 py-0.5 text-xs font-semibold text-white ring-1 ring-white/30">{topBadge}</div>
      </div>
      <div className="mt-3 space-y-1">
        <div className="flex items-center justify-between rounded-md bg-gradient-to-r from-blue-500 via-blue-400 to-green-500 px-3 py-1">
          <span className="text-xs font-semibold text-white">QUALIFICATIONS</span>
          <span className="text-xs font-bold text-white">{qual}</span>
        </div>
        <div className="flex items-center justify-between rounded-md bg-gradient-to-r from-blue-500 via-blue-400 to-green-500 px-3 py-1">
          <span className="text-xs font-semibold text-white">EXPERIENCE</span>
          <span className="text-xs font-bold text-white">{exp}</span>
        </div>
      </div>
    </button>
  )
}
