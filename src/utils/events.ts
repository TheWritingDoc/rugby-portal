export function emitPlayersLoaded(count: number) {
  try {
    window.dispatchEvent(new CustomEvent('data:players:loaded', { detail: { count } }))
  } catch {}
}

export function emitPlayersUpdated(id: string) {
  try {
    window.dispatchEvent(new CustomEvent('data:players:updated', { detail: { id } }))
  } catch {}
}

export function emitListReady(entity: 'players' | 'coaches' | 'referees' | 'schools' | 'admins', count: number) {
  try {
    window.dispatchEvent(new CustomEvent('app:list:ready', { detail: { entity, count, ts: Date.now() } }))
  } catch {}
}

export function emitRowAdded(entity: 'players' | 'coaches' | 'referees' | 'schools' | 'admins', row: any) {
  try {
    window.dispatchEvent(new CustomEvent('app:list:insert', { detail: { entity, row, ts: Date.now() } }))
  } catch {}
}
