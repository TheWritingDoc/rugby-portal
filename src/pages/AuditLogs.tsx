import { loadAudits } from '../utils/audit'
import { fetchList } from '../utils/api'
import { useEffect, useMemo, useState } from 'react'
import { ScrollText } from 'lucide-react'

const ACTION_STYLES: Record<string, string> = {
  create: 'bg-green-100 text-green-800',
  register: 'bg-green-100 text-green-800',
  update: 'bg-blue-100 text-blue-800',
  decision: 'bg-purple-100 text-purple-800',
  approval_apply: 'bg-purple-100 text-purple-800',
  delete: 'bg-red-100 text-red-800',
  oauth_login: 'bg-blue-100 text-blue-800',
  password_reset: 'bg-amber-100 text-amber-800',
}

const PAGE = 25

export default function AuditLogs() {
  const [entries, setEntries] = useState<any[]>(loadAudits().slice().reverse())
  const [error, setError] = useState('')
  const [limit, setLimit] = useState(PAGE)

  useEffect(() => {
    ;(async () => {
      const token = localStorage.getItem('auth:token')
      const role = localStorage.getItem('auth:role')

      if (!token || role !== 'EPHSRUAdmin') {
        setError('Access denied. Admin privileges required.')
        return
      }

      try {
        const list = await fetchList('audits')
        if (list && Array.isArray(list)) {
          setEntries(list.slice().reverse())
        } else {
          setError('Unable to load logs (Access Denied)')
        }
      } catch (err) {
        setError('Failed to fetch audit logs')
      }
    })()
  }, [])

  const visible = useMemo(() => entries.slice(0, limit), [entries, limit])

  if (error) {
    return (
      <section>
        <h2 className="mb-2 text-lg font-semibold">Audit Logs</h2>
        <div className="rounded-lg border bg-red-50 p-4 text-red-800 border-red-200">
          {error}. Please ensure you are logged in as an Administrator.
        </div>
      </section>
    )
  }
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <ScrollText className="h-5 w-5 text-brand" /> Audit Logs
        </h2>
        <span className="text-sm text-gray-500">{entries.length.toLocaleString()} events</span>
      </div>
      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2.5 font-medium text-gray-500">Time</th>
              <th className="px-4 py-2.5 font-medium text-gray-500">Role</th>
              <th className="px-4 py-2.5 font-medium text-gray-500">Entity</th>
              <th className="px-4 py-2.5 font-medium text-gray-500">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visible.map((e) => (
              <tr key={e.id} className="hover:bg-gray-50">
                <td className="whitespace-nowrap px-4 py-2 text-gray-600">{new Date(e.ts).toLocaleString()}</td>
                <td className="px-4 py-2">
                  <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">{e.userRole || 'system'}</span>
                </td>
                <td className="px-4 py-2 text-gray-700">{e.entity}</td>
                <td className="px-4 py-2">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${ACTION_STYLES[String(e.action)] || 'bg-gray-100 text-gray-700'}`}>{e.action}</span>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">No audit events yet</td></tr>
            )}
          </tbody>
        </table>
        {entries.length > limit && (
          <div className="border-t bg-gray-50 p-2 text-center">
            <button className="text-sm text-brand underline" onClick={() => setLimit((l) => l + PAGE)}>
              Show {Math.min(PAGE, entries.length - limit)} more
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
