// League-expansion seed shared by the SQLite (dev) and Postgres (prod) data
// layers. Clubs are organisations in "league zones" (13+), exactly like
// schools in zones 0–12, so all scoping/permissions work unchanged.
//
// Zone map (mirrors src/data/leagues.ts):
//   13 EPRU Clubs — Nelson Mandela Bay      (Rugby, club)
//   14 EPRU Clubs — Karoo & Midlands        (Rugby, club)
//   15 EPRU Clubs — Kouga & Tsitsikamma     (Rugby, club)
//   16 EPRU Clubs — Albany & Sundays River  (Rugby, club)
//   17–22 EP school/club leagues for Soccer, Netball, Cricket (containers;
//         organisations are created through the normal delegation flow)
import crypto from 'crypto'

const ZONE_NAMES = {
  13: 'EPRU Clubs — Nelson Mandela Bay',
  14: 'EPRU Clubs — Karoo & Midlands',
  15: 'EPRU Clubs — Kouga & Tsitsikamma',
  16: 'EPRU Clubs — Albany & Sundays River',
}

const slug = (name) =>
  'club-' + String(name).toLowerCase().replace(/[’']/g, '').replace(/[()&/]/g, ' ').replace(/\s+/g, '-').replace(/^-+|-+$/g, '')

const BY_ZONE = {
  13: [
    'Algoa Park RC', 'African Bombers', 'Alderonians', 'All Blacks', 'Auckland Tigers', 'Black Lions',
    'Born Fighters', 'Central', 'DB Blues', 'Despatch', 'Despatch Oostelikes', 'Easterns', 'Excelsior',
    'Gardens', 'Gelvan Wallabies', 'Gladiators', 'Glen Roses', 'Hamilton', 'Hampshire', 'Harlequins',
    'Hilltop Eagles', 'Khyelitsha United', 'Klipfontein UT', 'Kuya', 'Kuyga', 'Kwaru', 'Lily White',
    'Mighty Blues', 'Mission', 'Motherwell', 'NMMU Madibaz', 'Old Grey', 'Orlando Eagles', 'Park',
    'Pirates', 'Port Elizabeth College', 'Port Elizabeth Crusaders', 'Port Elizabeth Harlequins',
    'Port Elizabeth Police', 'Port Elizabeth Villagers', 'Progress', 'Red Lions', 'Rosebuds', 'Scorpions',
    'Siyakhula', 'Spring Rose', "St Cyprian's", "St Mark's", 'Star of Hope', 'Suburban', 'Sunday Stars',
    'Thistles', 'Trying Stars', 'Union', 'United Barbarians', 'Visitors', 'Walmer Wales', 'Walmer Wallabies',
    'Wanders', 'Windvogel United', 'Winter Rose', 'Winter Rose (UIT)',
  ],
  14: [
    'Aberdeen', 'Adelaide Rangers', 'Colesberg Wanderers', 'Cookhouse United', 'Evergreens (Cradock)',
    'Grootfontein', 'Jansenville', 'Karoo Springbokke', 'Kliplaat', 'Middleberg Eagles', 'Murraysburg',
    'Noupoort Diamonds', 'Pearston Villagers', 'Steytlerville Dolphins', 'Steytlerville United',
  ],
  15: [
    'Coldstream Crusaders', 'Evergreens (Krakeel)', 'Hankey Villagers', 'Humansdorp RC', 'Humansdorp United',
    'Kruisfontein', 'Loerie Blues', 'St Francis Sharks',
  ],
  16: [
    'Grahamstown Brumbies', 'Kirkwood', 'Kowie', 'Paterson Lions', 'Rhodes',
  ],
}

export const EPRU_CLUB_SEED = Object.entries(BY_ZONE).flatMap(([zoneId, names]) =>
  names.map((name) => ({
    id: slug(name),
    zoneId: String(zoneId),
    schoolId: slug(name),
    name,
    zoneName: ZONE_NAMES[zoneId],
  }))
)

// JSON `data` blob for a seeded club row. orgType/sport let the UI treat the
// organisation correctly without any schema change.
export function seedClubData(c) {
  return JSON.stringify({
    name: c.name,
    zoneName: c.zoneName,
    orgType: 'club',
    sport: 'Rugby',
    quintileCategory: 'Club',
    seeded: true,
    seedId: crypto.randomUUID(),
  })
}
