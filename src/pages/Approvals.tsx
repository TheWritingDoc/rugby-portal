import { useEffect, useMemo, useState } from 'react'
import { loadDocumentsLocal, DocumentRecord, updateDocumentLocal } from '../utils/approvals'
import { fetchList, approveDocument, rejectDocument } from '../utils/api'
import { RoleGate } from '../components/RoleGate'
import { notifySuccess } from '../utils/notify'
import { API_ORIGIN } from '../utils/apiBase'
import { FileText, CheckCircle, XCircle, Clock, User, School, Award, Shield } from 'lucide-react'

type Role = 'Player' | 'Referee' | 'Coach' | 'SchoolAdmin' | 'ZoneCoordinator' | 'EPHSRUAdmin'
type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected'

const OWNER_ICONS: Record<string, any> = {
  players: User,
  coaches: UserIconFallback,
  schools: School,
  referees: Award,
  admins: Shield,
}

function UserIconFallback(props: any) { return <User {...props} /> }

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
}

export default function Approvals() {
  const [docs, setDocs] = useState<DocumentRecord[]>(loadDocumentsLocal())
  const [filter, setFilter] = useState<StatusFilter>('pending')
  const [busyId, setBusyId] = useState<string>('')
  const role = ((): Role => {
    try {
      const r = localStorage.getItem('auth:role') as Role | null
      if (r) return r
    } catch {}
    return 'Player'
  })()

  useEffect(() => {
    ;(async () => {
      const list = await fetchList('documents')
      if (list && list.length) setDocs(list)
    })()
  }, [])

  const counts = useMemo(() => ({
    all: docs.length,
    pending: docs.filter((d) => d.status === 'pending').length,
    approved: docs.filter((d) => d.status === 'approved').length,
    rejected: docs.filter((d) => d.status === 'rejected').length,
  }), [docs])

  const visible = useMemo(
    () => (filter === 'all' ? docs : docs.filter((d) => d.status === filter)),
    [docs, filter]
  )

  async function decide(d: DocumentRecord, status: 'approved' | 'rejected') {
    setBusyId(String(d.id))
    const ok = status === 'approved' ? await approveDocument(String(d.id)) : await rejectDocument(String(d.id))
    if (!ok && d.id) updateDocumentLocal(String(d.id), status)
    setDocs((prev) => prev.map((x) => (x.id === d.id ? { ...x, status } : x)))
    setBusyId('')
    if (status === 'approved') notifySuccess('Document approved')
    else notifySuccess('Document rejected')
  }

  return (
    <section>
      <RoleGate role={role} allow={['EPHSRUAdmin', 'ZoneCoordinator', 'SchoolAdmin']}>
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Review documents submitted with registrations. Player profile changes and school transfers are
            handled in the <span className="font-medium">Pending</span> and <span className="font-medium">Requests</span> tabs of your dashboard.
          </p>

          {/* Status filter tabs */}
          <div className="flex flex-wrap gap-2">
            {(['pending', 'approved', 'rejected', 'all'] as StatusFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium capitalize transition-colors ${
                  filter === f ? 'bg-brand text-white' : 'border bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                {f} ({counts[f]})
              </button>
            ))}
          </div>

          {visible.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed bg-gray-50 py-14 text-center text-gray-500">
              {filter === 'pending' ? (
                <>
                  <CheckCircle className="mx-auto mb-3 h-12 w-12 text-green-400" />
                  <p className="font-medium">All caught up</p>
                  <p className="text-sm">No documents are waiting for review.</p>
                </>
              ) : (
                <>
                  <FileText className="mx-auto mb-3 h-12 w-12 text-gray-300" />
                  <p className="font-medium">No {filter === 'all' ? '' : filter} documents</p>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {visible.map((d: any) => {
                const Icon = OWNER_ICONS[String(d.ownerType || '').toLowerCase()] || FileText
                const status = String(d.status || 'pending')
                const rawUrl = String(d.url || d.fileUrl || '')
                const href = rawUrl.startsWith('/uploads') ? `${API_ORIGIN}${rawUrl}` : rawUrl
                const label = String(d.type || d.fileName || 'Document').replace(/^\d+-/, '')
                return (
                  <div key={d.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4 shadow-sm">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="rounded-lg bg-brand/10 p-2.5 text-brand">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <a href={href || undefined} target="_blank" rel="noreferrer" className="block max-w-md truncate font-medium text-gray-900 underline-offset-2 hover:underline" title={label}>
                          {label}
                        </a>
                        <div className="text-sm capitalize text-gray-500">{String(d.ownerType || '').toLowerCase().replace(/s$/, '')} document{d.ts ? ` • ${new Date(Number(d.ts)).toLocaleDateString()}` : ''}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[status] || STATUS_STYLES.pending}`}>
                        {status === 'pending' && <Clock className="h-3 w-3" />}
                        {status}
                      </span>
                      {status === 'pending' && (
                        <>
                          <button
                            disabled={busyId === String(d.id)}
                            onClick={() => decide(d, 'approved')}
                            className="flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                          >
                            <CheckCircle className="h-4 w-4" /> Approve
                          </button>
                          <button
                            disabled={busyId === String(d.id)}
                            onClick={() => decide(d, 'rejected')}
                            className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                          >
                            <XCircle className="h-4 w-4" /> Reject
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </RoleGate>
    </section>
  )
}
