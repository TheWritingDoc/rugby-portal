export type DraftKey = 'school' | 'player' | 'coach' | 'referee' | 'admin'

export function loadDraft<T>(key: DraftKey): T | null {
  try {
    const v = localStorage.getItem(`draft:${key}`)
    return v ? (JSON.parse(v) as T) : null
  } catch {
    return null
  }
}

export function saveDraft<T>(key: DraftKey, value: T) {
  localStorage.setItem(`draft:${key}`, JSON.stringify(value))
}

export function clearDraft(key: DraftKey) {
  localStorage.removeItem(`draft:${key}`)
}