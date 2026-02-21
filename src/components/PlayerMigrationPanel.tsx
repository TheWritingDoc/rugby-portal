import { useEffect, useMemo, useRef, useState } from 'react'
import { ZoneSelect, AutoFields } from './Dropdowns'
import { getJsonPath, postJsonPath } from '../utils/api'
import { X } from 'lucide-react'

function parseRowData(r: any) {
  if (!r) return {}
  const v = r.data
  if (!v) return {}
  if (typeof v === 'object') return v
  if (typeof v === 'string') {
    try { return JSON.parse(v || '{}') } catch { return {} }
  }
  return {}
}

function fmtTs(ts: any) {
  const n = typeof ts === 'number' ? ts : Number(ts || 0)
  if (!Number.isFinite(n) || n <= 0) return ''
  try { return new Date(n).toLocaleString() } catch { return '' }
}

interface PlayerMigrationPanelProps {
  onDone?: () => void
  playerId?: string
  onClose?: () => void
}

export default function PlayerMigrationPanel({ onDone, playerId, onClose }: PlayerMigrationPanelProps) {
  type Step = 0 | 1 | 2 | 3
  const [idNumber, setIdNumber] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [found, setFound] = useState<{ player: any; migrations: any[]; migrationRequests: any[] } | null>(null)
  const [step, setStep] = useState<Step>(playerId ? 1 : 0)
  const [error, setError] = useState<string>('')
  const [notice, setNotice] = useState<string>('')
  const [toZoneId, setToZoneId] = useState<string>('')
  const [toSchoolId, setToSchoolId] = useState<string>('')
  const [catalog, setCatalog] = useState<{ schoolId: string; zoneId: string; name: string }[]>([])
  const [reason, setReason] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const confirmRef = useRef<HTMLButtonElement | null>(null)
  const playerData = useMemo(() => parseRowData(found?.player), [found])
  useEffect(() => {
    ;(async () => {
      const res = await getJsonPath('schools/catalog')
      if (Array.isArray(res)) {
        setCatalog(res.map((x: any) => ({ schoolId: String(x.schoolId || ''), zoneId: String(x.zoneId || ''), name: String(x.name || '') })).filter((x: any) => !!x.schoolId))
      }
    })()
  }, [])

  async function loadById(id: string) {
    setLoading(true)
    setError('')
    setNotice('')
    try {
      const res = await getJsonPath(`players/${encodeURIComponent(id)}/history`)
      if (!res) {
        setError('Unable to load player')
        return
      }
      const p = (res as any).player
      const migrations = Array.isArray((res as any).migrations) ? (res as any).migrations : []
      const migrationRequests = Array.isArray((res as any).migrationRequests) ? (res as any).migrationRequests : []
      const registration = (res as any).registration || {}
      setFound({ player: p, migrations, migrationRequests })
      setToSchoolId('')
      setToZoneId(String(registration.currentZoneId ?? p?.zoneId ?? ''))
      setStep(1)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!playerId) return
    loadById(playerId)
  }, [playerId])
  useEffect(() => {
    if (confirmOpen) setTimeout(() => confirmRef.current?.focus(), 0)
  }, [confirmOpen])

  async function lookup() {
    setError('')
    setNotice('')
    setFound(null)
    setLoading(true)
    try {
      const q = idNumber.trim() ? `idNumber=${encodeURIComponent(idNumber.trim())}` : `email=${encodeURIComponent(email.trim())}`
      const res = await getJsonPath(`players/lookup?${q}`)
      if (!res) {
        setError('Player not found')
        return
      }
      setFound(res as any)
      const p = (res as any)?.player
      const pd = parseRowData(p)
      setToSchoolId('')
      setToZoneId(String(pd.currentZoneId ?? p?.zoneId ?? ''))
      setStep(1)
    } finally {
      setLoading(false)
    }
  }

  async function migrate() {
    if (!found?.player?.id) return
    if (!toSchoolId) { setError('Select destination school'); return }
    setError('')
    setNotice('')
    setLoading(true)
    try {
      const res = await postJsonPath(`players/${found.player.id}/migrate`, { toSchoolId, reason })
      if (!res.ok) {
        const msg = (res.data as any)?.error || 'Migration failed'
        setError(String(msg))
        return
      }
      setReason('')
      if (playerId) await loadById(playerId)
      else await lookup()
      setNotice('Migration request sent. Waiting for destination school approval.')
      setStep(3)
      onDone?.()
    } finally {
      setLoading(false)
    }
  }

  const currentSchool = String(playerData.currentSchoolId ?? found?.player?.schoolId ?? '')
  const currentZone = String(playerData.currentZoneId ?? found?.player?.zoneId ?? '')
  const canSearch = !!idNumber.trim() || !!email.trim()
  const catalogForZone = useMemo(() => {
    const z = toZoneId || currentZone
    const list = z ? catalog.filter((c) => c.zoneId === String(z)) : catalog
    return list.slice().sort((a, b) => {
      const an = (a.name || a.schoolId).toLowerCase()
      const bn = (b.name || b.schoolId).toLowerCase()
      return an.localeCompare(bn)
    })
  }, [catalog, currentZone, toZoneId])

  const progress = useMemo(() => {
    if (step === 0) return 25
    if (step === 1) return 50
    if (step === 2) return 75
    return 100
  }, [step])

  function resetAll() {
    setIdNumber('')
    setEmail('')
    setFound(null)
    setToZoneId('')
    setToSchoolId('')
    setReason('')
    setError('')
    setNotice('')
    setStep(0)
  }

  const steps = [
    { label: 'Begin Migration' },
    { label: 'Select Destination' },
    { label: 'Confirm Transfer' },
    { label: 'Complete' }
  ]

  return (
    <div className="rounded-md border bg-white p-3 shadow">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold">Player Migration</div>
        <div className="flex items-center gap-2">
          <span className={step === 3 ? 'rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700 ring-1 ring-green-300' : 'rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700 ring-1 ring-gray-300'}>
            {step === 3 ? 'Requested' : `Step ${step + 1} of 4`}
          </span>
          {onClose && (
            <button className="rounded-md border p-1 text-gray-500 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40" type="button" onClick={onClose} aria-label="Close">
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="mb-3">
        <div className="mb-1 flex items-center justify-between text-xs text-gray-600">
          <span>{steps[step].label}</span>
          <span>{progress}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-gray-200" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Migration progress">
          <div className="h-2 rounded-full bg-brand" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {notice && <div className="mb-3 rounded-md border border-green-300 bg-green-50 p-2 text-sm text-green-800" role="status" aria-live="polite">{notice}</div>}
      {error && <div className="mb-3 rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-700" role="alert" aria-live="assertive">{error}</div>}

      {step === 0 && (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="text-sm font-medium">ID/Passport Number</span>
          <input className="mt-1 w-full rounded-md border p-2" value={idNumber} onChange={(e) => setIdNumber(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Email (optional)</span>
          <input className="mt-1 w-full rounded-md border p-2" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <div className="flex items-end">
          <button className="w-full rounded-md bg-brand px-3 py-2 text-white hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:opacity-50" disabled={!canSearch || loading} onClick={lookup} type="button">Begin Migration</button>
        </div>
      </div>
      )}

      {playerId && !found && !loading && (
        <div className="rounded-md border bg-white p-3 text-sm text-gray-700">Player record not available.</div>
      )}

      {found && step >= 1 && (
        <div className="space-y-3">
          <div className="rounded-md bg-gray-50 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">{String(playerData.name ?? found.player.name ?? '')} {String(playerData.surname ?? found.player.surname ?? '')}</div>
                <div className="text-xs text-gray-700">ID: {String(playerData.idNumber ?? found.player.idNumber ?? '')}</div>
                <div className="text-xs text-gray-700">Current school: {currentSchool || 'N/A'}</div>
              </div>
              <button className="rounded-md border px-3 py-2 text-sm hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40" type="button" onClick={() => { setError(''); setNotice(''); setStep(0); setFound(null) }}>Back</button>
            </div>
          </div>

          {step === 1 && (
            <div className="space-y-3">
              <div className="text-sm text-gray-700">Select the destination school for this player. The system will store a transfer record and update the player’s current school.</div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <ZoneSelect value={toZoneId || currentZone} onChange={(v) => { setToZoneId(v); setToSchoolId('') }} />
                <label className="block">
                  <span className="text-sm font-medium">Destination School</span>
                  <select className="mt-1 w-full rounded-md border border-gray-300 bg-white p-2 text-sm focus:border-brand focus:outline-none" value={toSchoolId} onChange={(e) => setToSchoolId(e.target.value)}>
                    <option value="">Select...</option>
                    {catalogForZone.map((s) => (
                      <option key={s.schoolId} value={s.schoolId}>
                        {(s.name ? `${s.name} — ` : '') + s.schoolId}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <AutoFields schoolId={toSchoolId || currentSchool} />
              <label className="block">
                <span className="text-sm font-medium">Migration reason (optional)</span>
                <input className="mt-1 w-full rounded-md border p-2" value={reason} onChange={(e) => setReason(e.target.value)} />
              </label>

              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button className="rounded-md border px-4 py-2 text-sm hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40" type="button" onClick={resetAll}>Cancel</button>
                <button className="rounded-md bg-brand px-4 py-2 text-sm text-white hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:opacity-50" disabled={!toSchoolId || toSchoolId === currentSchool} type="button" onClick={() => { setError(''); setNotice(''); setStep(2) }}>Confirm Transfer</button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <div className="rounded-md border p-3">
                <div className="text-sm font-semibold">Review transfer details</div>
                <div className="mt-2 text-sm text-gray-700">
                  <div>From: <span className="font-medium">{currentSchool || 'N/A'}</span></div>
                  <div>To: <span className="font-medium">{toSchoolId || 'N/A'}</span></div>
                  {reason && <div>Reason: <span className="font-medium">{reason}</span></div>}
                </div>
                <div className="mt-3 text-xs text-gray-600">This sends a request to the destination school. The player moves only after acceptance.</div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button className="rounded-md border px-4 py-2 text-sm hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40" type="button" onClick={() => setStep(1)}>Back</button>
                <button className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 disabled:opacity-50" disabled={loading} type="button" onClick={() => setConfirmOpen(true)}>Confirm Transfer</button>
              </div>
            </div>
          )}

          <div className="rounded-md border p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-semibold">Migration History</div>
              <button className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40" type="button" onClick={lookup}>View Details</button>
            </div>
            <div className="divide-y">
              {(found.migrations || []).map((m: any) => (
                <div key={m.id} className="py-2 text-sm">
                  <div className="font-medium">{String(m.fromSchoolId || '')} → {String(m.toSchoolId || '')}</div>
                  <div className="text-xs text-gray-600">{fmtTs(m.migrationDate)}</div>
                </div>
              ))}
              {(found.migrations || []).length === 0 && <div className="py-2 text-sm text-gray-600">No migrations yet</div>}
            </div>
          </div>

          <div className="rounded-md border p-3">
            <div className="mb-2 text-sm font-semibold">Migration Requests</div>
            <div className="divide-y">
              {(found.migrationRequests || []).map((r: any) => (
                <div key={r.id} className="py-2 text-sm">
                  <div className="font-medium">{String(r.fromSchoolId || '')} → {String(r.toSchoolId || '')}</div>
                  <div className="text-xs text-gray-600">{String(r.status || '')}{r.requestedAt ? ` • ${fmtTs(r.requestedAt)}` : ''}</div>
                </div>
              ))}
              {(found.migrationRequests || []).length === 0 && <div className="py-2 text-sm text-gray-600">No requests</div>}
            </div>
          </div>

          {step === 3 && (
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button className="rounded-md border px-4 py-2 text-sm hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40" type="button" onClick={resetAll}>Begin Migration</button>
              <button className="rounded-md bg-brand px-4 py-2 text-sm text-white hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40" type="button" onClick={() => { setError(''); setNotice(''); onDone?.() }}>Complete</button>
            </div>
          )}
        </div>
      )}

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Confirm migration">
          <div className="w-full max-w-md rounded-md bg-white p-4 shadow-lg">
            <div className="text-base font-semibold">Confirm Transfer</div>
            <div className="mt-2 text-sm text-gray-700">Transfer this player from <span className="font-medium">{currentSchool || 'N/A'}</span> to <span className="font-medium">{toSchoolId || 'N/A'}</span>?</div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button className="rounded-md border px-4 py-2 text-sm hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40" type="button" onClick={() => setConfirmOpen(false)}>Cancel</button>
              <button ref={confirmRef} className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 disabled:opacity-50" type="button" disabled={loading} onClick={async () => { setConfirmOpen(false); await migrate() }}>Confirm Transfer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
