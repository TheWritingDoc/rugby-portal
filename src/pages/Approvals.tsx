import { useEffect, useState } from 'react'
import { loadDocumentsLocal, DocumentRecord, updateDocumentLocal } from '../utils/approvals'
import { fetchList, approveDocument, rejectDocument } from '../utils/api'
import { RoleGate } from '../components/RoleGate'

export default function Approvals() {
  const [docs, setDocs] = useState<DocumentRecord[]>(loadDocumentsLocal())
  useEffect(() => {
    ;(async () => {
      const list = await fetchList('documents')
      if (list && list.length) setDocs(list)
    })()
  }, [])
  return (
    <section>
      <h1 className="mb-3 text-xl font-bold">Approvals</h1>
      <RoleGate role={'EPHSRUAdmin'} allow={['EPHSRUAdmin','SchoolAdmin']}>
        <div className="rounded-lg border bg-white p-3">
          {docs.length === 0 && <div className="text-sm text-gray-500">No documents</div>}
          <ul className="space-y-2">
            {docs.map((d) => (
              <li key={d.id} className="flex items-center justify-between">
                <div className="text-sm">
                  <span className="mr-2">{d.ownerType}</span>
                  <a className="text-brand" href={d.url} target="_blank" rel="noreferrer">{d.type}</a>
                  <span className="ml-2 text-gray-500">{d.status}</span>
                </div>
                <div className="flex gap-2">
                  <button className="rounded-md border px-2 py-1 text-sm" onClick={async () => {
                    const ok = await approveDocument(String(d.id))
                    if (!ok && d.id) updateDocumentLocal(String(d.id), 'approved')
                    setDocs((prev) => prev.map((x) => x.id === d.id ? { ...x, status: 'approved' } : x))
                  }}>Approve</button>
                  <button className="rounded-md border px-2 py-1 text-sm" onClick={async () => {
                    const ok = await rejectDocument(String(d.id))
                    if (!ok && d.id) updateDocumentLocal(String(d.id), 'rejected')
                    setDocs((prev) => prev.map((x) => x.id === d.id ? { ...x, status: 'rejected' } : x))
                  }}>Reject</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </RoleGate>
    </section>
  )
}