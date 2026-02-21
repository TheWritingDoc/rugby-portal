export type DocumentRecord = { id?: string; ownerType: 'School' | 'Player' | 'Coach' | 'Referee' | 'Admin'; ownerId: string; type: string; url: string; status?: 'pending' | 'approved' | 'rejected' }

export async function saveDocumentLocal(doc: DocumentRecord) {
  const key = 'db:documents'
  const list = JSON.parse(localStorage.getItem(key) || '[]')
  list.push({ ...doc, id: crypto.randomUUID(), status: 'pending' })
  localStorage.setItem(key, JSON.stringify(list))
}

export function loadDocumentsLocal() {
  return JSON.parse(localStorage.getItem('db:documents') || '[]') as DocumentRecord[]
}

export function updateDocumentLocal(id: string, status: 'approved' | 'rejected') {
  const key = 'db:documents'
  const list: DocumentRecord[] = JSON.parse(localStorage.getItem(key) || '[]')
  const item = list.find((d) => d.id === id)
  if (item) item.status = status
  localStorage.setItem(key, JSON.stringify(list))
}