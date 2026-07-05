// Human-readable labels for internal identifiers.
// Resolves against the static EP schools/zones catalog plus the league
// expansion (EPRU clubs, other sports); unknown ids (e.g. test data)
// fall back to the raw id so nothing is hidden, just prettified where possible.
import { zones, schools } from '../data/zones'
import { LEAGUE_ZONES, EPRU_CLUBS } from '../data/leagues'

export function schoolNameOf(id: any): string {
  const key = String(id ?? '').trim()
  if (!key) return ''
  const hit = schools.find((s) => s.id === key) || EPRU_CLUBS.find((s) => s.id === key)
  return hit ? hit.name : key
}

export function zoneNameOf(id: any): string {
  const key = String(id ?? '').trim()
  if (!key) return ''
  const league = LEAGUE_ZONES.find((z) => String(z.id) === key)
  if (league) return league.name // league names stand alone ("EPRU Clubs — …")
  const hit = zones.find((z) => String(z.id) === key)
  return hit ? `${hit.name} Zone` : key
}
