type EntityType = 'School' | 'Player' | 'Coach' | 'Referee' | 'Admin'

export function addEntity(type: EntityType, data: any) {
  const key = `db:${type}`
  const list = getEntities(type)
  list.push({ id: crypto.randomUUID(), type, data, ts: Date.now() })
  localStorage.setItem(key, JSON.stringify(list))
}

export function getEntities(type: EntityType) {
  try {
    const key = `db:${type}`
    const v = localStorage.getItem(key)
    return v ? JSON.parse(v) as { id: string; type: EntityType; data: any; ts: number }[] : []
  } catch {
    return []
  }
}

export function updateEntity(type: EntityType, id: string, data: any) {
  const key = `db:${type}`
  const list = getEntities(type)
  const idx = list.findIndex((x) => x.id === id)
  if (idx >= 0) {
    list[idx] = { ...list[idx], data, ts: Date.now() }
    localStorage.setItem(key, JSON.stringify(list))
  }
}

type ProposalStatus = 'pending' | 'approved' | 'rejected'
export function addProposal(entityType: EntityType, recordId: string, field: string, value: any) {
  const key = `db:pending:${entityType}`
  const v = localStorage.getItem(key)
  const list = v ? JSON.parse(v) as any[] : []
  list.push({ id: crypto.randomUUID(), entityType, recordId, field, value, status: 'pending' as ProposalStatus, ts: Date.now() })
  localStorage.setItem(key, JSON.stringify(list))
}

export function getProposals(entityType: EntityType) {
  try {
    const key = `db:pending:${entityType}`
    const v = localStorage.getItem(key)
    return v ? JSON.parse(v) as { id: string, entityType: EntityType, recordId: string, field: string, value: any, status: ProposalStatus, ts: number }[] : []
  } catch { return [] }
}

export function setProposalStatus(entityType: EntityType, proposalId: string, status: ProposalStatus) {
  const key = `db:pending:${entityType}`
  const list = getProposals(entityType)
  const idx = list.findIndex((x) => x.id === proposalId)
  if (idx >= 0) {
    list[idx].status = status
    list[idx].ts = Date.now()
    localStorage.setItem(key, JSON.stringify(list))
  }
}

export function deleteProposal(entityType: EntityType, proposalId: string) {
  const key = `db:pending:${entityType}`
  const list = getProposals(entityType)
  const next = list.filter((x) => x.id !== proposalId)
  localStorage.setItem(key, JSON.stringify(next))
}