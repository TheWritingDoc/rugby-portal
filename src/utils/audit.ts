export type AuditEntry = {
  id: string
  userRole: 'Player' | 'Referee' | 'Coach' | 'SchoolAdmin' | 'ZoneCoordinator' | 'EPHSRUAdmin'
  entity: 'School' | 'Player' | 'Coach' | 'Referee' | 'Admin'
  action: 'create' | 'update'
  before?: any
  after?: any
  ts: number
}

export function addAudit(entry: AuditEntry) {
  const items = loadAudits()
  items.push(entry)
  localStorage.setItem('audit:entries', JSON.stringify(items))
}

export function loadAudits(): AuditEntry[] {
  try {
    const v = localStorage.getItem('audit:entries')
    return v ? (JSON.parse(v) as AuditEntry[]) : []
  } catch {
    return []
  }
}