// Shared school-seed parser for ep_schools_rugby_zones.md.
// Used by both the SQLite (dev) and Postgres (prod) data layers so the seeded
// school catalog is identical across environments.
import crypto from 'crypto'

export function parseSchoolsFromMd(md) {
  const lines = String(md || '').split(/\r?\n/)
  const schools = []
  let zoneId = 0
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    const m = l.match(/<summary><strong>Zone\s*(\d+):\s*([^<]+)\s*\(/)
    if (m) {
      zoneId = parseInt(m[1], 10)
      const zoneName = m[2].trim()
      let j = i + 1
      while (j < lines.length && !lines[j].includes('</details>')) {
        const sm = lines[j].match(/^\s*\d+\.\s*(.+?)\s*$/)
        if (sm) {
          const schoolName = sm[1].trim()
          const slug = `${zoneName.toLowerCase().replace(/\s+/g, '-')}-${schoolName.toLowerCase().replace(/\s+/g, '-')}`
          schools.push({ id: slug, zoneId: String(zoneId), schoolId: slug, name: schoolName, zoneName, quintileCategory: 'Q1-3' })
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
          const slug = `festival-${schoolName.toLowerCase().replace(/\s+/g, '-')}`
          schools.push({ id: slug, zoneId: '0', schoolId: slug, name: schoolName, zoneName: 'Festival', quintileCategory: 'Q4-5 festival' })
        }
        j++
      }
      i = j
    }
  }
  return schools
}

// Build the JSON `data` blob the app expects on a seeded school row.
export function seedSchoolData(s) {
  return JSON.stringify({
    name: s.name,
    zoneName: s.zoneName,
    quintileCategory: s.quintileCategory,
    seeded: true,
    seedId: crypto.randomUUID(),
  })
}
