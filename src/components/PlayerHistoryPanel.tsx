import { useEffect, useMemo, useState } from 'react'
import { getJsonPath } from '../utils/api'

function parseData(v: any) {
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

function fmtDurationMs(ms: any) {
  const n = typeof ms === 'number' ? ms : Number(ms || 0)
  if (!Number.isFinite(n) || n <= 0) return '—'
  const days = Math.floor(n / (24 * 60 * 60 * 1000))
  if (days < 1) return '< 1 day'
  if (days < 60) return `${days} day${days === 1 ? '' : 's'}`
  const months = Math.floor(days / 30)
  return `${months} month${months === 1 ? '' : 's'}`
}

function diffKeys(before: any, after: any) {
  const b = parseData(before)
  const a = parseData(after)
  const keys = new Set<string>([...Object.keys(b), ...Object.keys(a)])
  const out: string[] = []
  keys.forEach((k) => {
    const bv = b[k]
    const av = a[k]
    if (JSON.stringify(bv) !== JSON.stringify(av)) out.push(k)
  })
  return out.sort((x, y) => x.localeCompare(y))
}

function diffEntries(before: any, after: any) {
  const b = parseData(before)
  const a = parseData(after)
  const keys = new Set<string>([...Object.keys(b), ...Object.keys(a)])
  const out: { key: string; before: any; after: any }[] = []
  keys.forEach((k) => {
    const bv = b[k]
    const av = a[k]
    if (JSON.stringify(bv) !== JSON.stringify(av)) out.push({ key: k, before: bv, after: av })
  })
  return out.sort((x, y) => x.key.localeCompare(y.key))
}

function fmtVal(v: any) {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  try { return JSON.stringify(v) } catch { return String(v) }
}

export default function PlayerHistoryPanel({ playerId }: { playerId: string }) {
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [data, setData] = useState<any | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open || !playerId) return
    ;(async () => {
      setLoading(true)
      setErr('')
      try {
        const res = await getJsonPath(`players/${playerId}/history`)
        if (!res) {
          setErr('Unable to load history')
          return
        }
        setData(res)
      } finally {
        setLoading(false)
      }
    })()
  }, [open, playerId])

  const registration = data?.registration || {}
  const attendanceTimeline = Array.isArray(data?.attendanceTimeline) ? data.attendanceTimeline : []
  const migrations = Array.isArray(data?.migrations) ? data.migrations : []
  const audits = Array.isArray(data?.audits) ? data.audits : []

  const recentAudit = useMemo(() => audits.slice(0, 30), [audits])

  return (
    <div className="rounded-md border bg-white p-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">History</div>
        <button className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40" type="button" onClick={() => setOpen((v) => !v)}>
          {open ? 'Hide Details' : 'View Details'}
        </button>
      </div>

      {!open && (
        <div className="mt-2 text-xs text-gray-600">Shows registration info, migrations, and edit/audit events.</div>
      )}

      {open && (
        <div className="mt-3 space-y-3">
          {err && <div className="rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-700">{err}</div>}
          {loading && <div className="text-sm text-gray-600">Loading history…</div>}

          {!loading && !err && (
            <>
              <div className="rounded-md bg-gray-50 p-3">
                <div className="text-sm font-semibold">Registration</div>
                <div className="mt-2 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                  <div><span className="text-gray-600">Registered year:</span> <span className="font-medium">{String(registration.registrationYear || '—')}</span></div>
                  <div><span className="text-gray-600">Registered at:</span> <span className="font-medium">{fmtTs(registration.registeredAt) || '—'}</span></div>
                  <div><span className="text-gray-600">Initial school:</span> <span className="font-medium">{String(registration.initialSchoolId || '—')}</span></div>
                  <div><span className="text-gray-600">Current school:</span> <span className="font-medium">{String(registration.currentSchoolId || '—')}</span></div>
                </div>
              </div>

              <div className="rounded-md border p-3">
                <div className="mb-2 text-sm font-semibold">School Attendance</div>
                <div className="divide-y">
                  {attendanceTimeline.map((seg: any, idx: number) => {
                    const fromTs = Number(seg?.fromTs || 0)
                    const toTsRaw = seg?.toTs
                    const toTs = toTsRaw === null || typeof toTsRaw === 'undefined' ? 0 : Number(toTsRaw || 0)
                    const end = toTs > 0 ? toTs : Date.now()
                    const ms = fromTs > 0 ? Math.max(0, end - fromTs) : 0
                    const nextSchool = String(attendanceTimeline[idx + 1]?.schoolId || '')
                    return (
                      <div key={`${String(seg?.schoolId || '')}:${idx}`} className="py-2 text-sm">
                        <div className="font-medium">{String(seg?.schoolId || '—')}</div>
                        <div className="text-xs text-gray-600">
                          {fmtTs(fromTs) || '—'} → {toTs > 0 ? (fmtTs(toTs) || '—') : 'Present'} • {fmtDurationMs(ms)}
                          {toTs > 0 && nextSchool ? ` • moved to ${nextSchool}` : ''}
                        </div>
                      </div>
                    )
                  })}
                  {attendanceTimeline.length === 0 && <div className="py-2 text-sm text-gray-600">No attendance timeline available</div>}
                </div>
              </div>

              <div className="rounded-md border p-3">
                <div className="mb-2 text-sm font-semibold">Migrations</div>
                <div className="divide-y">
                  {migrations.map((m: any) => (
                    <div key={m.id} className="py-2 text-sm">
                      <div className="font-medium">{String(m.fromSchoolId || '')} → {String(m.toSchoolId || '')}</div>
                      <div className="text-xs text-gray-600">{fmtTs(m.migrationDate)}</div>
                    </div>
                  ))}
                  {migrations.length === 0 && <div className="py-2 text-sm text-gray-600">No migrations yet</div>}
                </div>
              </div>

              <div className="rounded-md border p-3">
                <div className="mb-2 text-sm font-semibold">Edits & Approvals</div>
                <div className="divide-y">
                  {recentAudit.map((a: any) => {
                    const changed = diffKeys(a.before, a.after)
                    const entries = diffEntries(a.before, a.after)
                    return (
                      <div key={a.id} className="py-2 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-medium">{String(a.action || '')}</div>
                          <div className="text-xs text-gray-600">{fmtTs(a.ts)}</div>
                        </div>
                        <div className="text-xs text-gray-600">By: {String(a.userRole || '—')}</div>
                        {changed.length > 0 && (
                          <details className="mt-2">
                            <summary className="cursor-pointer text-xs text-gray-700">Changed: {changed.slice(0, 8).join(', ')}{changed.length > 8 ? '…' : ''}</summary>
                            <div className="mt-2 space-y-1 text-xs">
                              {entries.slice(0, 50).map((e) => (
                                <div key={e.key} className="rounded-md border bg-white p-2">
                                  <div className="text-xs font-semibold text-gray-800">{e.key}</div>
                                  <div className="mt-1 flex min-w-0 flex-col gap-2 text-xs sm:flex-row sm:items-start sm:flex-wrap">
                                    <div className="flex items-center gap-2">
                                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700 ring-1 ring-red-200">Previous</span>
                                      <pre className="max-w-full whitespace-pre-wrap break-all rounded-md bg-red-50 px-2 py-1 font-medium text-red-900 ring-1 ring-red-200">{fmtVal(e.before)}</pre>
                                    </div>
                                    <span className="text-gray-400">→</span>
                                    <div className="flex items-center gap-2">
                                      <span className="rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700 ring-1 ring-green-200">Updated</span>
                                      <pre className="max-w-full whitespace-pre-wrap break-all rounded-md bg-green-50 px-2 py-1 font-medium text-green-900 ring-1 ring-green-200">{fmtVal(e.after)}</pre>
                                    </div>
                                  </div>
                                </div>
                              ))}
                              {entries.length > 50 && <div className="text-xs text-gray-600">Showing first 50 changes…</div>}
                            </div>
                          </details>
                        )}
                      </div>
                    )
                  })}
                  {recentAudit.length === 0 && <div className="py-2 text-sm text-gray-600">No audit events found</div>}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
