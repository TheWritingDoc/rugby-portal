// Human-readable labels for internal identifiers.
// Resolves against the static EP schools/zones catalog; unknown ids (e.g. test data)
// fall back to the raw id so nothing is hidden, just prettified where possible.
import { zones, schools } from '../data/zones'

export function schoolNameOf(id: any): string {
  const key = String(id ?? '').trim()
  if (!key) return ''
  const hit = schools.find((s) => s.id === key)
  return hit ? hit.name : key
}

export function zoneNameOf(id: any): string {
  const key = String(id ?? '').trim()
  if (!key) return ''
  const hit = zones.find((z) => String(z.id) === key)
  return hit ? `${hit.name} Zone` : key
}
