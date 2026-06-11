import { Calendar, Archive } from 'lucide-react'
import { currentSeasonYear } from '../utils/season'

export default function SeasonFilter({
  seasons,
  value,
  onChange,
  archivedCount,
}: {
  seasons: number[]
  value: number | null
  onChange: (year: number | null) => void
  archivedCount: number
}) {
  const current = currentSeasonYear()
  const years = Array.from(new Set([current, ...seasons])).sort((a, b) => b - a)
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm" data-testid="season-filter">
      <div className="flex items-center gap-2 text-sm text-gray-700">
        <Calendar className="h-4 w-4 text-brand" aria-hidden="true" />
        <span className="font-semibold">{value ? `Season ${value}` : 'All seasons'}</span>
        {value === current && (
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700 ring-1 ring-green-300">Current</span>
        )}
        {value !== null && value !== current && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-300">Archived season</span>
        )}
      </div>
      <div className="flex items-center gap-3">
        {archivedCount > 0 && value === current && (
          <span className="inline-flex items-center gap-1 text-xs text-gray-500">
            <Archive className="h-3.5 w-3.5" aria-hidden="true" />
            {archivedCount} archived player{archivedCount === 1 ? '' : 's'} hidden
          </span>
        )}
        <label className="flex items-center gap-2 text-sm">
          <span className="text-gray-600">Season</span>
          <select
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm shadow-sm focus:border-brand focus:ring-brand"
            value={value === null ? 'all' : String(value)}
            onChange={(e) => onChange(e.target.value === 'all' ? null : Number(e.target.value))}
            aria-label="Season"
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}{y === current ? ' (current)' : ''}</option>
            ))}
            <option value="all">All seasons (archive)</option>
          </select>
        </label>
      </div>
    </div>
  )
}
