import { useMemo, useState } from 'react'
import { isEmail } from '../utils/validation'

type FormKey = 'school' | 'player' | 'coach' | 'referee' | 'admin' | 'zone' | 'ephsru'

// Hierarchical user creation mapping
// EPHSRU Admin → Zone Coordinators
// Zone Coordinator → School Admins
// School Admin → Coaches, Referees
// Coach → Players
const ROLE_CREATION_MAP: Record<string, FormKey[]> = {
  EPHSRUAdmin: ['zone', 'ephsru', 'school'],
  ZoneCoordinator: ['admin', 'school'],
  SchoolAdmin: ['coach', 'referee', 'player'],
  Coach: ['player'],
  Referee: [],
  Player: [],
}

const FORM_LABELS: Record<FormKey, { label: string; desc: string }> = {
  school: { label: 'School Registration', desc: 'Register a new school' },
  player: { label: 'Player Registration', desc: 'Register a new player' },
  coach: { label: 'Coach Registration', desc: 'Register a new coach' },
  referee: { label: 'Referee Registration', desc: 'Register a new referee' },
  admin: { label: 'School Admin Registration', desc: 'Register a new school administrator' },
  zone: { label: 'Zone Coordinator Registration', desc: 'Register a new zone coordinator' },
  ephsru: { label: 'EPHSRU Admin Registration', desc: 'Register a new EPHSRU administrator' },
}

export default function Selection({ onChoose, role, restrictByRole = true }: { onChoose: (k: FormKey) => void; role: 'Player' | 'Referee' | 'Coach' | 'SchoolAdmin' | 'ZoneCoordinator' | 'EPHSRUAdmin'; restrictByRole?: boolean }) {
  const allowed: FormKey[] = restrictByRole ? (ROLE_CREATION_MAP[role] || []) : ['school','player','coach','referee','admin','zone','ephsru']
  const options = useMemo(() => allowed.map((key) => ({ key, ...FORM_LABELS[key] })), [allowed])
  const [selected, setSelected] = useState<FormKey | ''>(options[0]?.key ?? '')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  
  // Reset selected when options change
  useMemo(() => {
    if (options.length > 0 && !options.find(o => o.key === selected)) {
      setSelected(options[0].key)
    }
  }, [options])
  
  if (options.length === 0) {
    return (
      <div className="rounded-md border bg-white p-3 text-sm text-gray-600">
        You don't have permission to create users. Contact your administrator.
      </div>
    )
  }
  
  return (
    <div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="block sm:col-span-3">
          <span className="text-sm font-medium">Email</span>
          <input type="email" className="mt-1 w-full rounded-md border p-2" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="block sm:col-span-3">
          <span className="text-sm font-medium">Create Password</span>
          <input type="password" className="mt-1 w-full rounded-md border p-2" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label className="block sm:col-span-3">
          <span className="text-sm font-medium">Verify Password</span>
          <input type="password" className="mt-1 w-full rounded-md border p-2" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-sm font-medium">Select user type to create</span>
          <select className="mt-1 w-full rounded-md border p-2" value={selected} onChange={(e) => setSelected(e.target.value as FormKey)}>
            {options.map((i) => (
              <option key={i.key} value={i.key}>{i.label}</option>
            ))}
          </select>
        </label>
        <div className="flex items-end">
          <button
            data-testid={`btn-${selected || 'choose'}`}
            disabled={!selected || !email || !password || password !== confirm || !isEmail(email)}
            onClick={() => {
              if (!selected) return
              if (!isEmail(email)) return
              if (!password || password !== confirm) return
              localStorage.setItem('reg:email', email)
              localStorage.setItem('reg:password', password)
              if (selected === 'zone') {
                localStorage.setItem('reg:form', 'admin')
                localStorage.setItem('reg:adminRole', 'ZoneCoordinator')
                onChoose('admin')
              } else if (selected === 'ephsru') {
                localStorage.setItem('reg:form', 'admin')
                localStorage.setItem('reg:adminRole', 'EPHSRUAdmin')
                onChoose('admin')
              } else if (selected === 'admin') {
                localStorage.setItem('reg:form', 'admin')
                localStorage.setItem('reg:adminRole', 'SchoolAdmin')
                onChoose('admin')
              } else {
                localStorage.setItem('reg:form', selected)
                onChoose(selected)
              }
            }}
            className="w-full rounded-md bg-brand p-2 text-white"
          >
            Create User
          </button>
        </div>
      </div>
    </div>
  )
}