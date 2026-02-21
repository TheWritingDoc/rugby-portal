import { loadAudits } from '../utils/audit'
import { fetchList } from '../utils/api'
import { useEffect, useState } from 'react'

export default function AuditLogs() {
  const [entries, setEntries] = useState<any[]>(loadAudits().slice().reverse())
  useEffect(() => {
    ;(async () => {
      const list = await fetchList('audits')
      if (list && list.length) setEntries(list.slice().reverse())
    })()
  }, [])
  return (
    <section>
      <h2 className="mb-2 text-lg font-semibold">Audit Logs</h2>
      <div className="rounded-lg border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-2">Time</th>
              <th className="p-2">Role</th>
              <th className="p-2">Entity</th>
              <th className="p-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-t">
                <td className="p-2">{new Date(e.ts).toLocaleString()}</td>
                <td className="p-2">{e.userRole}</td>
                <td className="p-2">{e.entity}</td>
                <td className="p-2">{e.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}