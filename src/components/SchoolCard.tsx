import React from 'react'

type SchoolRow = { id?: string, data?: any }

export default function SchoolCard({ school, onClick }: { school: SchoolRow; onClick?: () => void }) {
  const d = school?.data || {}
  const title = String(d.name || school?.id || 'School')
  const zoneId = String(d.zoneId || '—')
  const schoolId = String(d.schoolId || '—')
  const address = String(d.address || '—')
  return (
    <button
      className="group relative rounded-2xl border-4 border-blue-700 bg-gradient-to-b from-blue-700 via-blue-600 to-blue-500 p-3 text-left shadow-lg hover:shadow-xl transition"
      onClick={onClick}
      data-school-name={title}
    >
      <div className="w-full text-center">
        <div className="mx-auto inline-block rounded-md bg-green-500 px-3 py-1 text-xs font-bold text-white">{title}</div>
      </div>
      <div className="mt-3 space-y-1">
        <div className="flex items-center justify-between rounded-md bg-gradient-to-r from-blue-500 via-blue-400 to-green-500 px-3 py-1">
          <span className="text-xs font-semibold text-white">ZONE</span>
          <span className="text-xs font-bold text-white">{zoneId}</span>
        </div>
        <div className="flex items-center justify-between rounded-md bg-gradient-to-r from-blue-500 via-blue-400 to-green-500 px-3 py-1">
          <span className="text-xs font-semibold text-white">SCHOOL ID</span>
          <span className="text-xs font-bold text-white">{schoolId}</span>
        </div>
        <div className="rounded-md bg-white/20 px-3 py-1 text-xs font-semibold text-white ring-1 ring-white/30">{address}</div>
      </div>
    </button>
  )
}
