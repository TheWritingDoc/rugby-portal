// Season (registration year) helpers shared by the dashboards.
// A player belongs to the season they were registered in; older seasons are "archived".

export function currentSeasonYear(): number {
  return new Date().getFullYear()
}

function yearFromTs(rawTs: any): number | null {
  if (rawTs === undefined || rawTs === null || rawTs === '') return null
  let n = typeof rawTs === 'number' ? rawTs : Number(rawTs)
  if (!Number.isFinite(n) || n <= 0) return null
  if (n < 1_000_000_000_000) n = n * 1000
  try {
    const y = new Date(n).getFullYear()
    return Number.isFinite(y) ? y : null
  } catch {
    return null
  }
}

export function seasonYearOf(row: any): number {
  const dn = row?.data || {}
  const direct = Number(dn.registrationYear ?? dn.registration_year ?? dn.regYear ?? dn.reg_year)
  if (Number.isFinite(direct) && direct > 2000) return direct
  return (
    yearFromTs(dn.registeredAt) ??
    yearFromTs(row?.createdAt ?? dn.createdAt) ??
    yearFromTs(row?.ts ?? row?.updatedAt ?? dn.ts) ??
    currentSeasonYear()
  )
}

export function seasonsPresent(rows: any[]): number[] {
  const set = new Set<number>()
  for (const r of Array.isArray(rows) ? rows : []) set.add(seasonYearOf(r))
  return Array.from(set).sort((a, b) => b - a)
}

/** Filter rows to one season; pass null to show every season (archive view). */
export function filterBySeason(rows: any[], year: number | null): any[] {
  if (!year) return rows
  return (Array.isArray(rows) ? rows : []).filter((r) => seasonYearOf(r) === year)
}

export function archivedCount(rows: any[], year: number): number {
  return (Array.isArray(rows) ? rows : []).filter((r) => seasonYearOf(r) !== year).length
}
