import { useEffect, useMemo, useState } from 'react'
import { zones as fallbackZones, schools as fallbackSchools, School } from '../data/zones'
import { getParsedData } from '../data/parseMd'

type SelectProps = {
  label: string
  value?: string
  onChange: (v: string) => void
  options: { label: string; value: string }[]
}

function Select({ label, value, onChange, options }: SelectProps) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <select
        className="mt-1 w-full rounded-md border border-gray-300 bg-white p-2 text-sm focus:border-brand focus:outline-none"
        name={label}
        data-testid={`${label.toLowerCase().replace(/\s+/g,'-')}-select`}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Select...</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export function ZoneSelect({ value, onChange }: { value?: string; onChange: (v: string) => void }) {
  const [opts, setOpts] = useState<{ label: string; value: string }[]>([])
  useEffect(() => {
    const { zones } = getParsedData()
    const list = zones.length ? zones : fallbackZones
    setOpts(list.map((z) => ({ label: z.name, value: String(z.id) })))
  }, [])
  return <Select label="Zone" value={value} onChange={onChange} options={opts} />
}

export function SchoolSelect({ zoneId, value, onChange }: { zoneId?: string; value?: string; onChange: (v: string) => void }) {
  const [all, setAll] = useState<School[]>([])
  useEffect(() => {
    const { schools } = getParsedData()
    const list = schools.length ? schools : fallbackSchools
    setAll(list as any)
  }, [])
  const options = useMemo(() => {
    let list: School[] = all
    if (zoneId) list = list.filter((s) => String(s.zoneId) === zoneId)
    return list.map((s) => ({ label: s.name, value: s.id }))
  }, [zoneId, all])
  return <Select label="School" value={value} onChange={onChange} options={options} />
}

export function AutoFields({ schoolId }: { schoolId?: string }) {
  const [meta, setMeta] = useState<{ zone: string; pool?: string; quintileCategory: string } | null>(null)
  useEffect(() => {
    if (!schoolId) { setMeta(null); return }
    const { zones, schools } = getParsedData()
    const zlist = zones.length ? zones : fallbackZones
    const slist = schools.length ? schools : fallbackSchools
    const s = slist.find((x: any) => x.id === schoolId)
    if (!s) { setMeta(null); return }
    const z = zlist.find((z) => z.id === s.zoneId)
    setMeta({ zone: z?.name ?? '', pool: z?.pool, quintileCategory: s.quintileCategory })
  }, [schoolId])

  if (!meta) return null
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      <div className="rounded-md bg-gray-100 p-2">
        <div className="text-xs text-gray-500">Zone</div>
        <div className="text-sm font-medium">{meta.zone}</div>
      </div>
      <div className="rounded-md bg-gray-100 p-2">
        <div className="text-xs text-gray-500">Pool</div>
        <div className="text-sm font-medium">{meta.pool ?? 'N/A'}</div>
      </div>
      <div className="rounded-md bg-gray-100 p-2">
        <div className="text-xs text-gray-500">Quintile</div>
        <div className="text-sm font-medium">{meta.quintileCategory}</div>
      </div>
    </div>
  )
}