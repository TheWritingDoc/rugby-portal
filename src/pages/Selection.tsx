import { useMemo, useState } from 'react'
import { isEmail } from '../utils/validation'

type FormKey = 'school' | 'player' | 'coach' | 'referee' | 'admin' | 'zone' | 'ephsru'

export default function Selection({ onChoose, role, restrictByRole = true }: { onChoose: (k: FormKey) => void; role: 'Player' | 'Referee' | 'Coach' | 'SchoolAdmin' | 'ZoneCoordinator' | 'EPHSRUAdmin'; restrictByRole?: boolean }) {
  const items: { key: FormKey; label: string; desc: string }[] = [
    { key: 'school', label: 'School Registration', desc: 'Register your school and rugby program' },
    { key: 'player', label: 'Player Registration', desc: 'Register as a player' },
    { key: 'coach', label: 'Coach Registration', desc: 'Register as a coach' },
    { key: 'referee', label: 'Referee Registration', desc: 'Register as a referee' },
    { key: 'admin', label: 'School Admin Registration', desc: 'Register administrative roles at a school' },
    { key: 'zone', label: 'Zone Coordinator Registration', desc: 'Register zone-level administrator' },
    { key: 'ephsru', label: 'EPHSRU Admin Registration', desc: 'Register EPHSRU-level administrator' },
  ]
  const allowed: FormKey[] = (() => {
    if (!restrictByRole) return ['school','player','coach','referee','admin','zone','ephsru']
    if (role === 'EPHSRUAdmin') return ['school','player','coach','referee','admin','zone','ephsru']
    if (role === 'SchoolAdmin') return ['school','player','coach','admin']
    if (role === 'Coach') return ['player','coach']
    if (role === 'Referee') return ['referee']
    if (role === 'Player') return ['player']
    if (role === 'ZoneCoordinator') return ['player','coach','zone']
    return []
  })()
  const options = useMemo(() => items.filter((i) => allowed.includes(i.key)), [allowed])
  const [selected, setSelected] = useState<FormKey | ''>(options[0]?.key ?? '')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  return (
    <div>
      {options.length === 0 ? (
        <div className="rounded-md border bg-white p-3 text-sm text-gray-600">No registration forms available for your role</div>
      ) : (
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
            <span className="text-sm font-medium">Select registration form</span>
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
              Continue
            </button>
          </div>
        </div>
      )}
    </div>
  )
}