import { useEffect, useRef, useState } from 'react'
import { Download, FileText, CreditCard, Table, ChevronDown } from 'lucide-react'
import { exportPlayersCsv, printPlayerProfiles, printPlayerCards } from '../utils/exporters'
import { notifyError, notifyInfo } from '../utils/notify'

export default function ExportMenu({
  players,
  schoolName,
  logoUrl,
  label = 'Print / Export',
}: {
  players: any[]
  schoolName?: string
  logoUrl?: string
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const count = Array.isArray(players) ? players.length : 0
  const meta = { schoolName, logoUrl }

  const runPrint = async (fn: (p: any[], m: any) => boolean | void | Promise<boolean | void>, what: string) => {
    setOpen(false)
    if (!count) return notifyError('No players to export')
    const ok = await fn(players, { ...meta, title: what })
    if (ok === false) notifyError('Pop-up blocked — allow pop-ups for this site to print.')
    else notifyInfo('Choose "Save as PDF" in the print dialog for offline storage.')
  }

  return (
    <div className="relative inline-block" ref={rootRef} data-testid="export-menu">
      <button
        type="button"
        className="inline-flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Download size={16} aria-hidden="true" />
        {label}
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-72 origin-top-right rounded-lg border border-gray-100 bg-white p-1 shadow-lg ring-1 ring-black/5" role="menu">
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left hover:bg-gray-50"
            onClick={() => runPrint(printPlayerProfiles, `Player profiles — ${schoolName || 'squad'}`)}
          >
            <FileText size={16} className="mt-0.5 shrink-0 text-blue-600" aria-hidden="true" />
            <span>
              <span className="block text-sm font-semibold text-gray-900">Profile sheets (PDF)</span>
              <span className="block text-xs text-gray-500">One full page per player for offline records</span>
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left hover:bg-gray-50"
            onClick={() => runPrint(printPlayerCards, `Player ID cards — ${schoolName || 'squad'}`)}
          >
            <CreditCard size={16} className="mt-0.5 shrink-0 text-green-600" aria-hidden="true" />
            <span>
              <span className="block text-sm font-semibold text-gray-900">Game ID cards (PDF)</span>
              <span className="block text-xs text-gray-500">Wallet-size cards with photo for match-day identification</span>
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left hover:bg-gray-50"
            onClick={() => {
              setOpen(false)
              if (!count) return notifyError('No players to export')
              exportPlayersCsv(players, (schoolName || 'players').toLowerCase().replace(/\s+/g, '-'))
            }}
          >
            <Table size={16} className="mt-0.5 shrink-0 text-emerald-700" aria-hidden="true" />
            <span>
              <span className="block text-sm font-semibold text-gray-900">Spreadsheet (Excel / CSV)</span>
              <span className="block text-xs text-gray-500">All player details in one file</span>
            </span>
          </button>
          <div className="border-t px-3 py-1.5 text-[11px] text-gray-400">{count} player{count === 1 ? '' : 's'} selected</div>
        </div>
      )}
    </div>
  )
}
