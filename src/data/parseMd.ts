import mdRaw from '../../ep_schools_rugby_zones.md?raw'

export type ParsedZone = { id: number; name: string; pool?: 'Uitenhage' | 'Northern Areas' }
export type ParsedSchool = { id: string; name: string; zoneId: number; quintileCategory: 'Q1-3' | 'Q4-5 festival' }

let parsed: { zones: ParsedZone[]; schools: ParsedSchool[] } | null = null

export function getParsedData() {
  if (parsed) return parsed
  try {
    const lines = mdRaw.split(/\r?\n/)
    const zones: ParsedZone[] = []
    const schools: ParsedSchool[] = []
    let zoneId = 0
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]
      const m = l.match(/<summary><strong>Zone\s*(\d+):\s*([^<]+)\s*\(/)
      if (m) {
        zoneId = parseInt(m[1], 10)
        const name = m[2].trim()
        const pool = name === 'Uitenhage' ? 'Uitenhage' : name === 'Northern Areas' ? 'Northern Areas' : undefined
        zones.push({ id: zoneId, name, pool })
        let j = i + 1
        while (j < lines.length && !lines[j].includes('</details>')) {
          const sm = lines[j].match(/^\s*\d+\.\s*(.+?)\s*$/)
          if (sm) {
            const schoolName = sm[1].trim()
            schools.push({ id: `${name.toLowerCase().replace(/\s+/g, '-')}-${schoolName.toLowerCase().replace(/\s+/g, '-')}`, name: schoolName, zoneId, quintileCategory: 'Q1-3' })
          }
          j++
        }
        i = j
      }
      if (l.includes('Quintile 4 & 5 Schools')) {
        let j = i
        while (j < lines.length && !lines[j].includes('## Competition Structure')) {
          const fm = lines[j].match(/^\s*-\s*(.+)$/)
          if (fm) {
            const schoolName = fm[1].trim()
            schools.push({ id: `festival-${schoolName.toLowerCase().replace(/\s+/g, '-')}`, name: schoolName, zoneId: 0, quintileCategory: 'Q4-5 festival' })
          }
          j++
        }
        i = j
      }
    }
    parsed = { zones, schools }
    return parsed
  } catch {
    return { zones: [], schools: [] }
  }
}