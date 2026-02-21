import { useEffect, useState } from 'react'
import { ZoneSelect } from '../../components/Dropdowns'
import { isEmail, isPhoneZA, isIdNumber } from '../../utils/validation'
import { addAudit } from '../../utils/audit'
import { addEntity } from '../../utils/db'
import { safePost } from '../../utils/api'
import { loadDraft, saveDraft, clearDraft } from '../../utils/storage'
import { login } from '../../utils/auth'
import bcrypt from 'bcryptjs'

export default function RefereeForm({ role }: { role?: 'Player' | 'Referee' | 'Coach' | 'SchoolAdmin' | 'ZoneCoordinator' | 'EPHSRUAdmin' }) {
  const [zone, setZone] = useState<string>()
  const [name, setName] = useState('')
  const [surname, setSurname] = useState('')
  const [idNumber, setIdNumber] = useState('')
  const [dob, setDob] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  useEffect(() => {
    const d = loadDraft<any>('referee')
    if (d) {
      setZone(d.zone); setName(d.name); setSurname(d.surname); setIdNumber(d.idNumber); setDob(d.dob); setPhone(d.phone); setEmail(d.email)
    }
  }, [])
  useEffect(() => {
    saveDraft('referee', { zone, name, surname, idNumber, dob, phone, email })
  }, [zone, name, surname, idNumber, dob, phone, email])
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    
    if (email && !isEmail(email)) return alert('Invalid email')
    if (phone && !isPhoneZA(phone)) return alert('Invalid phone number (+27 or 0XXXXXXXXX)')
    if (idNumber && !isIdNumber(idNumber)) return alert('Invalid ID number')
    const passwordHash = password ? bcrypt.hashSync(password, 10) : undefined
    const payload = { name, surname, idNumber, dob, phone, email, zoneId: zone, passwordHash }
    await login('Referee', zone)
    const ok = await safePost('referees', payload)
    if (!ok) addEntity('Referee', payload)
    addAudit({ id: crypto.randomUUID(), userRole: 'EPHSRUAdmin', entity: 'Referee', action: 'create', after: { name, surname, zone }, ts: Date.now() })
    clearDraft('referee')
    alert('Referee registration submitted')
  }
  return (
    <form className="space-y-3" onSubmit={submit}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ZoneSelect value={zone} onChange={setZone} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="text-sm font-medium">Create Password</span>
          <input type="password" className="mt-1 w-full rounded-md border p-2" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Name</span>
          <input className="mt-1 w-full rounded-md border p-2" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Surname</span>
          <input className="mt-1 w-full rounded-md border p-2" value={surname} onChange={(e) => setSurname(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">ID Number</span>
          <input className="mt-1 w-full rounded-md border p-2" value={idNumber} onChange={(e) => setIdNumber(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Date of Birth</span>
          <input type="date" className="mt-1 w-full rounded-md border p-2" value={dob} onChange={(e) => setDob(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Mobile Number</span>
          <input className="mt-1 w-full rounded-md border p-2" placeholder="+27" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Email Address</span>
          <input type="email" className="mt-1 w-full rounded-md border p-2" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
      </div>
      <fieldset className="rounded-md border p-3">
        <legend className="px-2 text-sm font-semibold">Qualification Details</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium">Referee Level</span>
            <select className="mt-1 w-full rounded-md border p-2">
              {['Provincial','Club','Schools'].map((q) => (
                <option key={q}>{q}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium">Years of Experience</span>
            <input type="number" className="mt-1 w-full rounded-md border p-2" />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium">Refereeing Qualification Certificate</span>
            <input type="file" className="mt-1 w-full rounded-md border p-2" accept="application/pdf,image/*" />
          </label>
        </div>
      </fieldset>
      <fieldset className="rounded-md border p-3">
        <legend className="px-2 text-sm font-semibold">Availability</legend>
        <div className="grid grid-cols-2 gap-2">
          {['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map((d) => (
            <label key={d} className="flex items-center gap-2 text-sm"><input type="checkbox" /> {d}</label>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium">Available Times</span>
            <select className="mt-1 w-full rounded-md border p-2">
              {['Morning','Afternoon','Evening'].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium">Preferred Age Groups</span>
            <select multiple className="mt-1 w-full rounded-md border p-2">
              {['U15', 'U16', 'U17', 'U19'].map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </label>
        </div>
      </fieldset>
      <fieldset className="rounded-md border p-3">
        <legend className="px-2 text-sm font-semibold">Requirements</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium">Police Clearance Certificate</span>
            <input type="file" className="mt-1 w-full rounded-md border p-2" accept="application/pdf,image/*" />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium">First Aid Certificate</span>
            <input type="file" className="mt-1 w-full rounded-md border p-2" accept="application/pdf,image/*" />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Referee Kit Size</span>
            <select className="mt-1 w-full rounded-md border p-2">
              {['S','M','L','XL','XXL'].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>
      </fieldset>
      <button className="w-full rounded-md bg-brand p-2 text-white">Submit Referee Registration</button>
    </form>
  )
}
