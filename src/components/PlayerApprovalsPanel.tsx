import { useEffect, useMemo, useRef, useState } from 'react'
import { getJsonPath, postJsonPath } from '../utils/api'
import { X } from 'lucide-react'

function fmtTs(ts: any) {
  const n = typeof ts === 'number' ? ts : Number(ts || 0)
  if (!Number.isFinite(n) || n <= 0) return ''
  try { return new Date(n).toLocaleString() } catch { return '' }
}

function badgeClass(status: string) {
  if (status === 'approved') return 'bg-green-100 text-green-800 ring-1 ring-green-300'
  if (status === 'rejected') return 'bg-red-100 text-red-800 ring-1 ring-red-300'
  return 'bg-yellow-100 text-yellow-800 ring-1 ring-yellow-300'
}

function fmtVal(v: any) {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  try { return JSON.stringify(v) } catch { return String(v) }
}

export default function PlayerApprovalsPanel({ entityId, canDecide, title, onClose }: { entityId: string; canDecide?: boolean; title?: string; onClose?: () => void }) {
  const [status, setStatus] = useState<string>('')
  const [requesterRole, setRequesterRole] = useState<string>('')
  const [approverRole, setApproverRole] = useState<string>('')
  const [from, setFrom] = useState<string>('')
  const [to, setTo] = useState<string>('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [rows, setRows] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [decisionOpen, setDecisionOpen] = useState<{ id: string; status: 'approved' | 'rejected' } | null>(null)
  const [decisionNotes, setDecisionNotes] = useState('')
  const confirmRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (decisionOpen) setTimeout(() => confirmRef.current?.focus(), 0)
  }, [decisionOpen])

  const fromTs = useMemo(() => {
    if (!from) return 0
    const d = new Date(from)
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }, [from])

  const toTs = useMemo(() => {
    if (!to) return 0
    const d = new Date(to)
    d.setHours(23, 59, 59, 999)
    return d.getTime()
  }, [to])

  async function load() {
    if (!entityId) return
    setLoading(true)
    setError('')
    try {
      const q = new URLSearchParams()
      q.set('entityType', 'players')
      q.set('entityId', entityId)
      if (status) q.set('status', status)
      if (requesterRole) q.set('requesterRole', requesterRole)
      if (approverRole) q.set('approverRole', approverRole)
      if (fromTs) q.set('fromTs', String(fromTs))
      if (toTs) q.set('toTs', String(toTs))
      q.set('page', String(page))
      q.set('pageSize', String(pageSize))
      const res = await getJsonPath(`approvals?${q.toString()}`)
      if (!res) {
        setError('Unable to load approval requests')
        return
      }
      setRows(Array.isArray(res.rows) ? res.rows : [])
      setTotal(Number(res.total || 0))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setPage(1)
  }, [status, requesterRole, approverRole, fromTs, toTs, pageSize, entityId])

  useEffect(() => {
    load()
  }, [status, fromTs, toTs, page, pageSize, entityId])

  const pageCount = Math.max(1, Math.ceil(total / pageSize))

  async function decide() {
    if (!decisionOpen) return
    setLoading(true)
    setError('')
    try {
      const res = await postJsonPath(`approvals/${decisionOpen.id}/decision`, { status: decisionOpen.status, notes: decisionNotes.trim() })
      if (!res.ok) {
        setError(String((res.data as any)?.error || 'Decision failed'))
        return
      }
      setDecisionOpen(null)
      setDecisionNotes('')
      await load()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-md border bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold">{title || 'Approval Requests'}</div>
        <div className="flex items-center gap-2">
          <button className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40" type="button" onClick={load}>Refresh</button>
          {onClose && (
            <button className="rounded-md border p-2 text-gray-500 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40" type="button" onClick={onClose} aria-label="Close">
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
        <label className="block">
          <span className="text-xs text-gray-600">Status</span>
          <select className="mt-1 w-full rounded-md border p-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-gray-600">Requester type</span>
          <select className="mt-1 w-full rounded-md border p-2 text-sm" value={requesterRole} onChange={(e) => setRequesterRole(e.target.value)}>
            <option value="">All</option>
            <option value="Player">Player</option>
            <option value="Coach">Coach</option>
            <option value="SchoolAdmin">SchoolAdmin</option>
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-gray-600">Approver type</span>
          <select className="mt-1 w-full rounded-md border p-2 text-sm" value={approverRole} onChange={(e) => setApproverRole(e.target.value)}>
            <option value="">All</option>
            <option value="Coach">Coach</option>
            <option value="SchoolAdmin">SchoolAdmin</option>
            <option value="EPHSRUAdmin">EPHSRUAdmin</option>
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-gray-600">From</span>
          <input className="mt-1 w-full rounded-md border p-2 text-sm" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-xs text-gray-600">To</span>
          <input className="mt-1 w-full rounded-md border p-2 text-sm" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-xs text-gray-600">Page size</span>
          <select className="mt-1 w-full rounded-md border p-2 text-sm" value={pageSize} onChange={(e) => setPageSize(parseInt(e.target.value, 10))}>
            {[10, 20, 50].map((n) => (<option key={n} value={n}>{n}</option>))}
          </select>
        </label>
      </div>

      {error && <div className="mt-3 rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-700">{error}</div>}
      {loading && <div className="mt-3 text-sm text-gray-600">Loading…</div>}

      {!loading && rows.length === 0 && !error && <div className="mt-3 text-sm text-gray-600">No approval requests found.</div>}

      <div className="mt-3 divide-y">
        {rows.map((r) => (
          <div key={r.id} className="py-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badgeClass(String(r.status || 'pending'))}`}>{String(r.status || 'pending')}</span>
                  <span className="text-xs text-gray-600">Requested: {fmtTs(r.createdAt) || '—'}</span>
                  {r.updatedAt && <span className="text-xs text-gray-600">Decision: {fmtTs(r.updatedAt)}</span>}
                </div>
                <div className="mt-1 text-sm font-semibold">{String(r.player?.name || '')} {String(r.player?.surname || '')}</div>
                <div className="text-xs text-gray-700">School: {String(r.player?.schoolId || '—')} · ID: {String(r.player?.idNumber || '—')}</div>
              </div>
              {canDecide && String(r.status) === 'pending' && (
                <div className="flex gap-2">
                  <button className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40" type="button" onClick={() => { setDecisionOpen({ id: r.id, status: 'rejected' }); setDecisionNotes('') }}>Reject</button>
                  <button className="rounded-md bg-green-600 px-3 py-2 text-sm text-white hover:bg-green-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-300" type="button" onClick={() => { setDecisionOpen({ id: r.id, status: 'approved' }); setDecisionNotes('') }}>Approve</button>
                </div>
              )}
            </div>

            <div className="mt-2 rounded-md bg-gray-50 p-2">
              <div className="text-xs text-gray-600">Requester: <span className="font-medium">{String(r.requester?.name || r.requester?.email || '—')}</span> {r.requester?.role ? `(${r.requester.role})` : ''}</div>
              {r.approver && <div className="text-xs text-gray-600">Approver: <span className="font-medium">{String(r.approver?.name || r.approver?.email || '—')}</span> {r.approver?.role ? `(${r.approver.role})` : ''}</div>}
              {r.approverNotes && <div className="mt-1 text-xs text-gray-700">Comment: <span className="font-medium">{String(r.approverNotes)}</span></div>}
              {String(r.status) !== 'pending' && <div className="mt-1 text-xs text-gray-700">Status change: <span className="font-medium">pending</span> → <span className="font-medium">{String(r.status)}</span></div>}
            </div>

            <details className="mt-2">
              <summary className="cursor-pointer text-sm text-gray-700">Requested changes ({Array.isArray(r.requestedChanges) ? r.requestedChanges.length : 0})</summary>
              <div className="mt-2 space-y-2">
                {(Array.isArray(r.requestedChanges) ? r.requestedChanges : []).map((c: any) => (
                  <div key={String(c.field)} className="rounded-md border p-2">
                    <div className="text-sm font-semibold">{String(c.field)}</div>
                    <div className="mt-2 flex min-w-0 flex-col gap-2 text-sm sm:flex-row sm:items-start sm:flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700 ring-1 ring-red-200">Previous</span>
                        <pre className="max-w-full whitespace-pre-wrap break-all rounded-md bg-red-50 px-2 py-1 font-medium text-red-900 ring-1 ring-red-200">{fmtVal(c.previous)}</pre>
                      </div>
                      <span className="text-gray-400">→</span>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700 ring-1 ring-green-200">Updated</span>
                        <pre className="max-w-full whitespace-pre-wrap break-all rounded-md bg-green-50 px-2 py-1 font-medium text-green-900 ring-1 ring-green-200">{fmtVal(c.updated)}</pre>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </details>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs text-gray-600">Showing page {page} of {pageCount} · Total {total}</div>
        <div className="flex gap-2">
          <button className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50" type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</button>
          <button className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50" type="button" disabled={page >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>Next</button>
        </div>
      </div>

      {decisionOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Approval decision">
          <div className="w-full max-w-md rounded-md bg-white p-4 shadow-lg">
            <div className="text-base font-semibold">{decisionOpen.status === 'approved' ? 'Approve Request' : 'Reject Request'}</div>
            <div className="mt-2 text-sm text-gray-700">Add an optional comment for this decision.</div>
            <label className="mt-3 block">
              <span className="text-sm font-medium">Comment</span>
              <textarea className="mt-1 w-full rounded-md border p-2 text-sm" rows={3} value={decisionNotes} onChange={(e) => setDecisionNotes(e.target.value)} />
            </label>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button className="rounded-md border px-4 py-2 text-sm hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40" type="button" onClick={() => setDecisionOpen(null)}>Cancel</button>
              <button ref={confirmRef} className={`rounded-md px-4 py-2 text-sm text-white focus-visible:outline-none focus-visible:ring-2 disabled:opacity-50 ${decisionOpen.status === 'approved' ? 'bg-green-600 hover:bg-green-700 focus-visible:ring-green-300' : 'bg-red-600 hover:bg-red-700 focus-visible:ring-red-300'}`} disabled={loading} type="button" onClick={decide}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
