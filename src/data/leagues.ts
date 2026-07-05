// League expansion: beyond the original EPHSRU schools rugby zones (0–12),
// every additional competition is modelled as a "league zone". Clubs are
// organisations inside a league zone, exactly like schools inside a school
// zone — so the whole delegation / messaging / approvals / migration stack
// works for clubs with no special cases.
//
//   13–16  EPRU club rugby (regional)
//   17–22  Other team sports in the Eastern Cape (school + club per sport)
import type { Zone, School, Sport, OrgLevel } from './zones'
import { POSITIONS_BY_SPORT, SCHOOL_AGE_GROUPS, CLUB_AGE_GROUPS } from '../utils/constants'

export const LEAGUE_ZONES: Zone[] = [
  { id: 13, name: 'EPRU Clubs — Nelson Mandela Bay', sport: 'Rugby', level: 'club' },
  { id: 14, name: 'EPRU Clubs — Karoo & Midlands', sport: 'Rugby', level: 'club' },
  { id: 15, name: 'EPRU Clubs — Kouga & Tsitsikamma', sport: 'Rugby', level: 'club' },
  { id: 16, name: 'EPRU Clubs — Albany & Sundays River', sport: 'Rugby', level: 'club' },
  { id: 17, name: 'EP Schools Soccer', sport: 'Soccer', level: 'school' },
  { id: 18, name: 'EP Club Soccer', sport: 'Soccer', level: 'club' },
  { id: 19, name: 'EP Schools Netball', sport: 'Netball', level: 'school' },
  { id: 20, name: 'EP Club Netball', sport: 'Netball', level: 'club' },
  { id: 21, name: 'EP Schools Cricket', sport: 'Cricket', level: 'school' },
  { id: 22, name: 'EP Club Cricket', sport: 'Cricket', level: 'club' },
]

const slug = (name: string) =>
  'club-' + name.toLowerCase().replace(/[’']/g, '').replace(/[()&/]/g, ' ').replace(/\s+/g, '-').replace(/^-+|-+$/g, '')

function mk(zoneId: number, names: string[]): School[] {
  return names.map((name) => ({ id: slug(name), name, zoneId, quintileCategory: 'Club' as const }))
}

// The club sides of the Eastern Province Rugby Union, grouped into regional
// league zones by home town. Region guesses for ambiguous names default to
// Nelson Mandela Bay (most EPRU clubs are metro sides); the union admin can
// migrate a club to another region at any time.
export const EPRU_CLUBS: School[] = [
  ...mk(13, [
    'Algoa Park RC', 'African Bombers', 'Alderonians', 'All Blacks', 'Auckland Tigers', 'Black Lions',
    'Born Fighters', 'Central', 'DB Blues', 'Despatch', 'Despatch Oostelikes', 'Easterns', 'Excelsior',
    'Gardens', 'Gelvan Wallabies', 'Gladiators', 'Glen Roses', 'Hamilton', 'Hampshire', 'Harlequins',
    'Hilltop Eagles', 'Khyelitsha United', 'Klipfontein UT', 'Kuya', 'Kuyga', 'Kwaru', 'Lily White',
    'Mighty Blues', 'Mission', 'Motherwell', 'NMMU Madibaz', 'Old Grey', 'Orlando Eagles', 'Park',
    'Pirates', 'Port Elizabeth College', 'Port Elizabeth Crusaders', 'Port Elizabeth Harlequins',
    'Port Elizabeth Police', 'Port Elizabeth Villagers', 'Progress', 'Red Lions', 'Rosebuds', 'Scorpions',
    'Siyakhula', "Spring Rose", "St Cyprian's", "St Mark's", 'Star of Hope', 'Suburban', 'Sunday Stars',
    'Thistles', 'Trying Stars', 'Union', 'United Barbarians', 'Visitors', 'Walmer Wales', 'Walmer Wallabies',
    'Wanders', 'Windvogel United', 'Winter Rose', 'Winter Rose (UIT)',
  ]),
  ...mk(14, [
    'Aberdeen', 'Adelaide Rangers', 'Colesberg Wanderers', 'Cookhouse United', 'Evergreens (Cradock)',
    'Grootfontein', 'Jansenville', 'Karoo Springbokke', 'Kliplaat', 'Middleberg Eagles', 'Murraysburg',
    'Noupoort Diamonds', 'Pearston Villagers', 'Steytlerville Dolphins', 'Steytlerville United',
  ]),
  ...mk(15, [
    'Coldstream Crusaders', 'Evergreens (Krakeel)', 'Hankey Villagers', 'Humansdorp RC', 'Humansdorp United',
    'Kruisfontein', 'Loerie Blues', 'St Francis Sharks',
  ]),
  ...mk(16, [
    'Grahamstown Brumbies', 'Kirkwood', 'Kowie', 'Paterson Lions', 'Rhodes',
  ]),
]

// ---------------------------------------------------------------------------
// Sport / level helpers — key everything off the zone
// ---------------------------------------------------------------------------
const ZONE_BY_ID = new Map<number, Zone>(LEAGUE_ZONES.map((z) => [z.id, z]))

export function sportOfZone(zoneId: any): Sport {
  const z = ZONE_BY_ID.get(Number(zoneId))
  return z?.sport || 'Rugby'
}

export function levelOfZone(zoneId: any): OrgLevel {
  const z = ZONE_BY_ID.get(Number(zoneId))
  return z?.level || 'school'
}

/** "School" or "Club" — what an organisation is called in this zone. */
export function orgTermOf(zoneId: any): 'School' | 'Club' {
  return levelOfZone(zoneId) === 'club' ? 'Club' : 'School'
}

export function positionsForZone(zoneId: any): string[] {
  return POSITIONS_BY_SPORT[sportOfZone(zoneId)] || POSITIONS_BY_SPORT.Rugby
}

export function ageGroupsForZone(zoneId: any): string[] {
  return levelOfZone(zoneId) === 'club' ? CLUB_AGE_GROUPS : SCHOOL_AGE_GROUPS
}
