export type Sport = 'Rugby' | 'Soccer' | 'Netball' | 'Cricket'
export type OrgLevel = 'school' | 'club'

export type Zone = {
  id: number
  name: string
  pool?: 'Uitenhage' | 'Northern Areas'
  /** Which sport this zone/league belongs to. Zones 0–12 are the original EPHSRU schools rugby zones. */
  sport?: Sport
  /** Whether organisations in this zone are schools or clubs. Defaults to 'school'. */
  level?: OrgLevel
}

export type School = {
  id: string
  name: string
  zoneId: number
  quintileCategory: 'Q1-3' | 'Q4-5 festival' | 'Club'
}

export const zones: Zone[] = [
  { id: 1, name: 'Uitenhage', pool: 'Uitenhage' },
  { id: 2, name: 'Kwadwezi' },
  { id: 3, name: 'Zwide' },
  { id: 4, name: 'Kwazakhele' },
  { id: 5, name: 'New Brighton' },
  { id: 6, name: 'Swartkops' },
  { id: 7, name: 'Motherwell' },
  { id: 8, name: 'Albany' },
  { id: 9, name: 'Karoo' },
  { id: 10, name: 'Midlands' },
  { id: 11, name: 'Northern Areas', pool: 'Northern Areas' },
  { id: 12, name: 'Kouga' },
]

const q13 = 'Q1-3' as const
const q45 = 'Q4-5 festival' as const

export const schools: School[] = [
  // Zone 1: Uitenhage (16)
  { id: 'uitenhage-gammel-street', name: 'Gammel Street', zoneId: 1, quintileCategory: q13 },
  { id: 'uitenhage-mccarthy', name: 'McCarthy', zoneId: 1, quintileCategory: q13 },
  { id: 'uitenhage-uitenhage', name: 'Uitenhage', zoneId: 1, quintileCategory: q13 },
  { id: 'uitenhage-john-walton', name: 'John Walton', zoneId: 1, quintileCategory: q13 },
  { id: 'uitenhage-molly-blackburn', name: 'Molly Blackburn', zoneId: 1, quintileCategory: q13 },
  { id: 'uitenhage-solomon-mahlangu', name: 'Solomon Mahlangu', zoneId: 1, quintileCategory: q13 },
  { id: 'uitenhage-moses-mabida', name: 'Moses Mabida', zoneId: 1, quintileCategory: q13 },
  { id: 'uitenhage-hector-mlungisi', name: 'Hector Mlungisi', zoneId: 1, quintileCategory: q13 },
  { id: 'uitenhage-st-colmcile', name: 'St Colmcile', zoneId: 1, quintileCategory: q13 },
  { id: 'uitenhage-kirkwood', name: 'Kirkwood', zoneId: 1, quintileCategory: q13 },
  { id: 'uitenhage-thandooxolo', name: 'Thandooxolo', zoneId: 1, quintileCategory: q13 },
  { id: 'uitenhage-nkululeko', name: 'Nkululeko', zoneId: 1, quintileCategory: q13 },
  { id: 'uitenhage-tinara', name: 'Tinara', zoneId: 1, quintileCategory: q13 },
  { id: 'uitenhage-kwinina', name: 'Kwinina', zoneId: 1, quintileCategory: q13 },
  { id: 'uitenhage-sisonke', name: 'Sisonke', zoneId: 1, quintileCategory: q13 },
  { id: 'uitenhage-phampani', name: 'Phampani', zoneId: 1, quintileCategory: q13 },

  // Zone 2: Kwadwezi (6)
  { id: 'kwadwezi-ez-kabane', name: 'Ez kabane', zoneId: 2, quintileCategory: q13 },
  { id: 'kwadwezi-gqebera', name: 'Gqebera', zoneId: 2, quintileCategory: q13 },
  { id: 'kwadwezi-kwamagxaki', name: 'Kwamagxaki', zoneId: 2, quintileCategory: q13 },
  { id: 'kwadwezi-lungisa', name: 'Lungisa', zoneId: 2, quintileCategory: q13 },
  { id: 'kwadwezi-sek-mkayi', name: 'Sek Mkayi', zoneId: 2, quintileCategory: q13 },
  { id: 'kwadwezi-tyhiluwazi', name: 'Tyhiluwazi', zoneId: 2, quintileCategory: q13 },

  // Zone 3: Zwide (7)
  { id: 'zwide-khwezi-lomzo', name: 'Khwezi Lomzo', zoneId: 3, quintileCategory: q13 },
  { id: 'zwide-loyiso', name: 'Loyiso', zoneId: 3, quintileCategory: q13 },
  { id: 'zwide-thembalabantu', name: 'Thembalabantu', zoneId: 3, quintileCategory: q13 },
  { id: 'zwide-lwazilwthu', name: 'Lwazilwthu', zoneId: 3, quintileCategory: q13 },
  { id: 'zwide-pakamisa', name: 'Pakamisa', zoneId: 3, quintileCategory: q13 },
  { id: 'zwide-sakisiswe', name: 'Sakisiswe', zoneId: 3, quintileCategory: q13 },
  { id: 'zwide-nzondolelo', name: 'Nzondolelo', zoneId: 3, quintileCategory: q13 },

  // Zone 4: Kwazakhele (6)
  { id: 'kwazakhele-kwazakhele', name: 'Kwazakhele', zoneId: 4, quintileCategory: q13 },
  { id: 'kwazakhele-chubekile', name: 'Chubekile', zoneId: 4, quintileCategory: q13 },
  { id: 'kwazakhele-qapphelani', name: 'Qapphelani', zoneId: 4, quintileCategory: q13 },
  { id: 'kwazakhele-tamsanqa', name: 'Tamsanqa', zoneId: 4, quintileCategory: q13 },
  { id: 'kwazakhele-mzontsundu', name: 'Mzontsundu', zoneId: 4, quintileCategory: q13 },
  { id: 'kwazakhele-masibambane', name: 'Masibambane', zoneId: 4, quintileCategory: q13 },

  // Zone 5: New Brighton (6)
  { id: 'new-brighton-ithembilihle', name: 'Ithembilihle', zoneId: 5, quintileCategory: q13 },
  { id: 'new-brighton-cowan', name: 'Cowan', zoneId: 5, quintileCategory: q13 },
  { id: 'new-brighton-newell', name: 'Newell', zoneId: 5, quintileCategory: q13 },
  { id: 'new-brighton-sophakama', name: 'Sophakama', zoneId: 5, quintileCategory: q13 },
  { id: 'new-brighton- lwandlekasi', name: 'Lwandlekasi', zoneId: 5, quintileCategory: q13 },
  { id: 'new-brighton-thubelihle', name: 'Thubelihle', zoneId: 5, quintileCategory: q13 },

  // Zone 6: Swartkops (6)
  { id: 'swartkops-vulumzi', name: 'Vulumzi', zoneId: 6, quintileCategory: q13 },
  { id: 'swartkops-motherwell', name: 'Motherwell', zoneId: 6, quintileCategory: q13 },
  { id: 'swartkops-ddt-jabavu', name: 'Ddt Jabavu', zoneId: 6, quintileCategory: q13 },
  { id: 'swartkops-soqhayisa', name: 'Soqhayisa', zoneId: 6, quintileCategory: q13 },
  { id: 'swartkops-ndyebo', name: 'Ndyebo', zoneId: 6, quintileCategory: q13 },
  { id: 'swartkops-cingani', name: 'Cingani', zoneId: 6, quintileCategory: q13 },

  // Zone 7: Motherwell (6)
  { id: 'motherwell-douglas-mpopha', name: 'Douglas Mpopha', zoneId: 7, quintileCategory: q13 },
  { id: 'motherwell-mfesane', name: 'Mfesane', zoneId: 7, quintileCategory: q13 },
  { id: 'motherwell-masipatsane', name: 'Masipatsane', zoneId: 7, quintileCategory: q13 },
  { id: 'motherwell-ncedo', name: 'Ncedo', zoneId: 7, quintileCategory: q13 },
  { id: 'motherwell-james-jalobe', name: 'James Jalobe', zoneId: 7, quintileCategory: q13 },
  { id: 'motherwell-coselelan', name: 'Coselelan', zoneId: 7, quintileCategory: q13 },

  // Zone 8: Albany (14)
  { id: 'albany-alexandria', name: 'Alexandria', zoneId: 8, quintileCategory: q13 },
  { id: 'albany-hendrick-knayisa', name: 'Hendrick Knayisa', zoneId: 8, quintileCategory: q13 },
  { id: 'albany-khayakhulu', name: 'Khayakhulu', zoneId: 8, quintileCategory: q13 },
  { id: 'albany-kutliso-daniels', name: 'Kutliso Daniels', zoneId: 8, quintileCategory: q13 },
  { id: 'albany-mary-walters', name: 'Mary Walters', zoneId: 8, quintileCategory: q13 },
  { id: 'albany-nataniel-nyaluza', name: 'Nataniel Nyaluza', zoneId: 8, quintileCategory: q13 },
  { id: 'albany-nombulelo', name: 'Nombulelo', zoneId: 8, quintileCategory: q13 },
  { id: 'albany-ntsika', name: 'Ntsika', zoneId: 8, quintileCategory: q13 },
  { id: 'albany-qyayiya', name: 'Qyayiya', zoneId: 8, quintileCategory: q13 },
  { id: 'albany-sipo-camagu', name: 'Sipo Camagu', zoneId: 8, quintileCategory: q13 },
  { id: 'albany-tem-mrwetyyana', name: 'Tem Mrwetyyana', zoneId: 8, quintileCategory: q13 },
  { id: 'albany-ukhanyo', name: 'Ukhanyo', zoneId: 8, quintileCategory: q13 },
  { id: 'albany-zanolwazi', name: 'Zanolwazi', zoneId: 8, quintileCategory: q13 },
  { id: 'albany-nomzamo', name: 'Nomzamo', zoneId: 8, quintileCategory: q13 },

  // Zone 9: Karoo (7)
  { id: 'karoo-aberdeen-sekonder', name: 'Aberdeen Sekonder', zoneId: 9, quintileCategory: q13 },
  { id: 'karoo-asherville', name: 'Asherville', zoneId: 9, quintileCategory: q13 },
  { id: 'karoo-carel-du-toit', name: 'Carel du Toit', zoneId: 9, quintileCategory: q13 },
  { id: 'karoo-kliplaat', name: 'Kliplaat', zoneId: 9, quintileCategory: q13 },
  { id: 'karoo-middelburg', name: 'Middelburg', zoneId: 9, quintileCategory: q13 },
  { id: 'karoo-spandau', name: 'Spandau', zoneId: 9, quintileCategory: q13 },
  { id: 'karoo-willowmore', name: 'Willowmore', zoneId: 9, quintileCategory: q13 },

  // Zone 10: Midlands (11)
  { id: 'midlands-aeroville', name: 'Aeroville', zoneId: 10, quintileCategory: q13 },
  { id: 'midlands-cradock', name: 'Cradock', zoneId: 10, quintileCategory: q13 },
  { id: 'midlands-gcinubuzwe', name: 'Gcinubuzwe', zoneId: 10, quintileCategory: q13 },
  { id: 'midlands-johnson-nconqoza', name: 'Johnson Nconqoza', zoneId: 10, quintileCategory: q13 },
  { id: 'midlands-lonwaba-bedford', name: 'Lonwaba Bedford', zoneId: 10, quintileCategory: q13 },
  { id: 'midlands-matthew-coniwe', name: 'Matthew Coniwe', zoneId: 10, quintileCategory: q13 },
  { id: 'midlands-michausdal', name: 'Michausdal', zoneId: 10, quintileCategory: q13 },
  { id: 'midlands-msombombuvu-black', name: 'Msombombuvu Black', zoneId: 10, quintileCategory: q13 },
  { id: 'midlands-pearston-sek', name: 'Pearston Sek', zoneId: 10, quintileCategory: q13 },
  { id: 'midlands-templeton', name: 'Templeton', zoneId: 10, quintileCategory: q13 },
  { id: 'midlands-thubeletha', name: 'Thubeletha', zoneId: 10, quintileCategory: q13 },

  // Zone 11: Northern Areas (20)
  { id: 'northern-areas-paterson', name: 'Paterson', zoneId: 11, quintileCategory: q13 },
  { id: 'northern-areas-david-livingstone', name: 'David Livingstone', zoneId: 11, quintileCategory: q13 },
  { id: 'northern-areas-woolhope', name: 'Woolhope', zoneId: 11, quintileCategory: q13 },
  { id: 'northern-areas-morningside', name: 'Morningside', zoneId: 11, quintileCategory: q13 },
  { id: 'northern-areas-st-thomas', name: 'St Thomas', zoneId: 11, quintileCategory: q13 },
  { id: 'northern-areas-chapman', name: 'Chapman', zoneId: 11, quintileCategory: q13 },
  { id: 'northern-areas-gelvandale', name: 'Gelvandale', zoneId: 11, quintileCategory: q13 },
  { id: 'northern-areas-hillside', name: 'Hillside', zoneId: 11, quintileCategory: q13 },
  { id: 'northern-areas-bethelsdorp', name: 'Bethelsdorp', zoneId: 11, quintileCategory: q13 },
  { id: 'northern-areas-arcadia', name: 'Arcadia', zoneId: 11, quintileCategory: q13 },
  { id: 'northern-areas-sanctor', name: 'Sanctor', zoneId: 11, quintileCategory: q13 },
  { id: 'northern-areas-westville', name: 'Westville', zoneId: 11, quintileCategory: q13 },
  { id: 'northern-areas-chatty', name: 'Chatty', zoneId: 11, quintileCategory: q13 },
  { id: 'northern-areas-bertram', name: 'Bertram', zoneId: 11, quintileCategory: q13 },
  { id: 'northern-areas-booysen-park', name: 'Booysen Park', zoneId: 11, quintileCategory: q13 },
  { id: 'northern-areas-walmer', name: 'Walmer', zoneId: 11, quintileCategory: q13 },
  { id: 'northern-areas-lawson-brown', name: 'Lawson Brown', zoneId: 11, quintileCategory: q13 },
  { id: 'northern-areas-stedin-college', name: 'Stedin College', zoneId: 11, quintileCategory: q13 },
  { id: 'northern-areas-bonzai', name: 'Bonzai', zoneId: 11, quintileCategory: q13 },
  { id: 'northern-areas-brylin', name: 'Brylin', zoneId: 11, quintileCategory: q13 },

  // Zone 12: Kouga (7)
  { id: 'kouga-hankey', name: 'Hankey', zoneId: 12, quintileCategory: q13 },
  { id: 'kouga-patensie', name: 'Patensie', zoneId: 12, quintileCategory: q13 },
  { id: 'kouga-humansdorp', name: 'Humansdorp', zoneId: 12, quintileCategory: q13 },
  { id: 'kouga-kareedouw', name: 'Kareedouw', zoneId: 12, quintileCategory: q13 },
  { id: 'kouga-jeffreys-bay', name: 'Jeffreys Bay', zoneId: 12, quintileCategory: q13 },
  { id: 'kouga-kayalethu', name: 'Kayalethu', zoneId: 12, quintileCategory: q13 },
  { id: 'kouga-louterwater', name: 'Louterwater', zoneId: 12, quintileCategory: q13 },
]

export const festivalSchools: School[] = [
  { id: 'festival-grey-volkskool', name: 'Grey / Volkskool', zoneId: 0, quintileCategory: q45 },
  { id: 'festival-marlow-brandwag', name: 'Marlow / Brandwag', zoneId: 0, quintileCategory: q45 },
  { id: 'festival-framesby-muir', name: 'Framesby / Muir College', zoneId: 0, quintileCategory: q45 },
  { id: 'festival-pearson-greame', name: 'Pearson / Greame College', zoneId: 0, quintileCategory: q45 },
  { id: 'festival-nico-malan-union-high', name: 'Nico Malan / Union High', zoneId: 0, quintileCategory: q45 },
  { id: 'festival-woodridge-winterberg', name: 'Woodridge / Winterberg', zoneId: 0, quintileCategory: q45 },
  { id: 'festival-otto-duplesis-middelande', name: 'Otto Duplesis / Middelande', zoneId: 0, quintileCategory: q45 },
  { id: 'festival-alexander-road-gill', name: 'Alexander Road / Gill College', zoneId: 0, quintileCategory: q45 },
  { id: 'festival-westview-bergsig', name: 'Westview / Bergsig', zoneId: 0, quintileCategory: q45 },
  { id: 'festival-westring-victoria-park', name: 'Westring / Victoria Park', zoneId: 0, quintileCategory: q45 },
  { id: 'festival-daniel-pienaar-despatch', name: 'Daniel Pienaar / Despatch', zoneId: 0, quintileCategory: q45 },
  { id: 'festival-df-malherbe-newton-tech', name: 'DF Malherbe / Newton Tech', zoneId: 0, quintileCategory: q45 },
  { id: 'festival-jansenville-kingswood', name: 'Jansenville / Kingswood College', zoneId: 0, quintileCategory: q45 },
  { id: 'festival-linkside-mcclachlan', name: 'Linkside / McClachlan', zoneId: 0, quintileCategory: q45 },
  { id: 'festival-pauls-sauer-pj-olivier', name: 'Pauls Sauer / PJ Olivier', zoneId: 0, quintileCategory: q45 },
  { id: 'festival-port-alfred-st-andrews', name: 'Port Alfred / St Andrews', zoneId: 0, quintileCategory: q45 },
  { id: 'festival-andrew-rabie', name: 'Andrew Rabie', zoneId: 0, quintileCategory: q45 },
]

export type AgeGroup = 'U15' | 'U16' | 'U17' | 'U19'

export const ageGroups: AgeGroup[] = ['U15', 'U16', 'U17', 'U19']

export function suggestAgeGroups(dateOfBirth: string, gender?: 'Male' | 'Female'): AgeGroup[] {
  const dob = new Date(dateOfBirth)
  if (isNaN(dob.getTime())) return []
  const ref = new Date(`${new Date().getFullYear()}-12-31`)
  let age = ref.getFullYear() - dob.getFullYear()
  const m = ref.getMonth() - dob.getMonth()
  if (m < 0 || (m === 0 && ref.getDate() < dob.getDate())) age--

  const groups: AgeGroup[] = []
  if (age <= 15) groups.push('U15')
  if (age >= 15 && age <= 16) groups.push('U16')
  if (age >= 16 && age <= 17) groups.push('U17')
  if (age >= 17 && age <= 19) groups.push('U19')
  return groups
}
