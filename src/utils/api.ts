import { API_BASE, apiUrl } from './apiBase'

export async function getJsonPath(path: string) {
  try {
    const t = localStorage.getItem('auth:token')
    const res = await fetch(apiUrl(path), { headers: { ...(t ? { Authorization: `Bearer ${t}` } : {}) } })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export async function postJsonPath(path: string, payload: any) {
  try {
    const t = localStorage.getItem('auth:token')
    const res = await fetch(apiUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
      body: JSON.stringify(payload)
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { ok: false, status: res.status, data: text ? (() => { try { return JSON.parse(text) } catch { return { error: text } } })() : null }
    }
    return { ok: true, status: res.status, data: await res.json() }
  } catch {
    return { ok: false, status: 0, data: null }
  }
}

export async function safePost(entity: 'schools' | 'players' | 'coaches' | 'referees' | 'admins' | 'documents', payload: any) {
  try {
    const t = localStorage.getItem('auth:token')
    const res = await fetch(`${API_BASE}/${entity}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }, body: JSON.stringify(payload) })
    return res.ok
  } catch {
    return false
  }
}

export async function safePut(entity: 'schools' | 'players' | 'coaches' | 'referees' | 'admins', id: string, payload: any) {
  try {
    const t = localStorage.getItem('auth:token')
    const res = await fetch(`${API_BASE}/${entity}/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }, body: JSON.stringify(payload) })
    return res.ok
  } catch {
    return false
  }
}
 
export async function putJson(entity: 'schools' | 'players' | 'coaches' | 'referees' | 'admins', id: string, payload: any) {
  try {
    const t = localStorage.getItem('auth:token')
    const res = await fetch(`${API_BASE}/${entity}/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }, body: JSON.stringify(payload) })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export async function fetchList(entity: 'schools' | 'players' | 'coaches' | 'referees' | 'admins' | 'audits' | 'documents', filters: Record<string, string | undefined> = {}) {
  const q = new URLSearchParams()
  Object.entries(filters).forEach(([k, v]) => { if (v) q.set(k, v) })
  try {
    const t = localStorage.getItem('auth:token')
    const res = await fetch(`${API_BASE}/${entity}?${q.toString()}`, { headers: { ...(t ? { Authorization: `Bearer ${t}` } : {}) } })
    if (!res.ok) return []
    const rows = await res.json()
    if (Array.isArray(rows)) {
      const { normalizeRow } = await import('./normalize')
      return rows.map((r: any) => normalizeRow(r))
    }
    return rows
  } catch {
    return []
  }
}

function safeJson(s: string) {
  try { return JSON.parse(s || '{}') } catch { return null }
}

export async function postJson(entity: 'schools' | 'players' | 'coaches' | 'referees' | 'admins' | 'documents', payload: any) {
  try {
    const t = localStorage.getItem('auth:token')
    const res = await fetch(`${API_BASE}/${entity}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }, body: JSON.stringify(payload) })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export async function fetchOne(entity: 'schools' | 'players' | 'coaches' | 'referees' | 'admins', id: string) {
  try {
    const t = localStorage.getItem('auth:token')
    const res = await fetch(`${API_BASE}/${entity}/${id}`, { headers: { ...(t ? { Authorization: `Bearer ${t}` } : {}) } })
    if (!res.ok) return null
    const r = await res.json()
    const { normalizeRow } = await import('./normalize')
    return normalizeRow(r)
  } catch {
    return null
  }
}

export async function approveDocument(id: string) {
  try {
    const t = localStorage.getItem('auth:token')
    const res = await fetch(`${API_BASE}/documents/${id}/approve`, { method: 'POST', headers: { ...(t ? { Authorization: `Bearer ${t}` } : {}) } })
    return res.ok
  } catch { return false }
}

export async function rejectDocument(id: string) {
  try {
    const t = localStorage.getItem('auth:token')
    const res = await fetch(`${API_BASE}/documents/${id}/reject`, { method: 'POST', headers: { ...(t ? { Authorization: `Bearer ${t}` } : {}) } })
    return res.ok
  } catch { return false }
}

type QueueItem = { entity: 'schools' | 'players' | 'coaches' | 'referees' | 'admins', id: string, payload: any }

export function queuePutAdd(entity: QueueItem['entity'], id: string, payload: any) {
  const key = 'sync:queue'
  const v = localStorage.getItem(key)
  const list: QueueItem[] = v ? JSON.parse(v) : []
  list.push({ entity, id, payload })
  localStorage.setItem(key, JSON.stringify(list))
}

export async function processQueue() {
  const key = 'sync:queue'
  const v = localStorage.getItem(key)
  const list: QueueItem[] = v ? JSON.parse(v) : []
  if (!list.length) return
  const remaining: QueueItem[] = []
  for (const item of list) {
    const ok = await safePut(item.entity, item.id, item.payload)
    if (!ok) remaining.push(item)
  }
  localStorage.setItem(key, JSON.stringify(remaining))
}
