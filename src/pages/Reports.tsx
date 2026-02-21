import { useEffect, useState } from 'react'
import { fetchList } from '../utils/api'
import { ZoneSelect, SchoolSelect } from '../components/Dropdowns'

export default function Reports() {
  const [zone, setZone] = useState<string>()
  const [school, setSchool] = useState<string>()
  const [players, setPlayers] = useState<any[]>([])
  const [schools, setSchools] = useState<any[]>([])
  useEffect(() => { load() }, [zone, school])
  async function load() {
    const filters: any = { zoneId: zone, schoolId: school }
    const [p, s] = await Promise.all([fetchList('players', filters), fetchList('schools', filters)])
    setPlayers(p || [])
    setSchools(s || [])
  }
  const byAge: Record<string, number> = {}
  players.forEach((p) => { const g = p.data?.ageGroup || 'Unknown'; byAge[g] = (byAge[g] || 0) + 1 })
  const bySchool: Record<string, number> = {}
  players.forEach((p) => { const s = p.data?.schoolId || 'Unknown'; bySchool[s] = (bySchool[s] || 0) + 1 })
  return (
    <section>
      <h1 className="mb-3 text-xl font-bold">Reports</h1>
      <RoleGate role={'EPHSRUAdmin'} allow={['ZoneCoordinator','EPHSRUAdmin']}>
        <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ZoneSelect value={zone} onChange={setZone} />
          <SchoolSelect zoneId={zone} value={school} onChange={setSchool} />
        </div>
        <div className="mb-3">
          <button className="rounded-md border bg-white px-3 py-1 text-sm" onClick={() => exportCsv('players_by_age.csv', byAge)}>Export Players by Age</button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Card title="Players by Age Group" entries={byAge} />
          <Card title="Players by School" entries={bySchool} />
          <div className="rounded-lg border bg-white p-3">
            <div className="mb-2 text-base font-semibold">Schools in filter</div>
            <ul className="text-sm">
              {schools.map((s) => (<li key={s.id}>{s.data?.schoolId || s.data?.name || s.id}</li>))}
            </ul>
          </div>
        </div>
      </RoleGate>
    </section>
  )
}

function Card({ title, entries }: { title: string; entries: Record<string, number> }) {
  const rows = Object.entries(entries)
  return (
    <div className="rounded-lg border bg-white p-3">
      <div className="mb-2 text-base font-semibold">{title}</div>
      {rows.length === 0 && <div className="text-sm text-gray-500">No data</div>}
      <ul className="text-sm">
        {rows.map(([k, v]) => (<li key={k} className="flex justify-between"><span>{k}</span><span>{v}</span></li>))}
      </ul>
    </div>
  )
}
import { RoleGate } from '../components/RoleGate'
import { exportCsv } from '../utils/csv'