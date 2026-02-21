import { useEffect, useState } from 'react'
import { ZoneSelect, SchoolSelect, AutoFields } from '../../components/Dropdowns'
import { isEmail, isPhoneZA, isIdNumber } from '../../utils/validation'
import { addAudit } from '../../utils/audit'
import { addEntity } from '../../utils/db'
import { safePost } from '../../utils/api'
import { loadDraft, saveDraft, clearDraft } from '../../utils/storage'
import { login } from '../../utils/auth'
import bcrypt from 'bcryptjs'

export default function AdminForm({ role }: { role?: 'Player' | 'Referee' | 'Coach' | 'SchoolAdmin' | 'ZoneCoordinator' | 'EPHSRUAdmin' }) {
  const [zone, setZone] = useState<string>()
  const [school, setSchool] = useState<string>()
  const [name, setName] = useState('')
  const [surname, setSurname] = useState('')
  const [idNumber, setIdNumber] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [roleSel, setRoleSel] = useState<'SchoolAdmin' | 'ZoneCoordinator' | 'EPHSRUAdmin'>('SchoolAdmin')
  useEffect(() => {
    const d = loadDraft<any>('admin')
    if (d) {
      setZone(d.zone); setSchool(d.school); setName(d.name); setSurname(d.surname); setIdNumber(d.idNumber); setPhone(d.phone); setEmail(d.email)
    }
  }, [])
  useEffect(() => {
    const pref = localStorage.getItem('reg:adminRole') as any
    if (pref && ['SchoolAdmin','ZoneCoordinator','EPHSRUAdmin'].includes(pref)) setRoleSel(pref)
  }, [])
  useEffect(() => {
    saveDraft('admin', { zone, school, name, surname, idNumber, phone, email, roleSel })
  }, [zone, school, name, surname, idNumber, phone, email, roleSel])
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    
    if (email && !isEmail(email)) return alert('Invalid email')
    if (phone && !isPhoneZA(phone)) return alert('Invalid phone number (+27 or 0XXXXXXXXX)')
    if (idNumber && !isIdNumber(idNumber)) return alert('Invalid ID number')
    const passwordHash = password ? bcrypt.hashSync(password, 10) : undefined
    const payload = { name, surname, idNumber, phone, email, role: roleSel, zoneId: zone, schoolId: school, passwordHash }
    await login('EPHSRUAdmin', zone, school)
    const ok = await safePost('admins', payload)
    if (!ok) addEntity('Admin', payload)
    addAudit({ id: crypto.randomUUID(), userRole: 'EPHSRUAdmin', entity: 'Admin', action: 'create', after: { name, surname, school, role: roleSel }, ts: Date.now() })
    clearDraft('admin')
    alert('Admin registration submitted')
  }
  return (
    <form className="space-y-3" onSubmit={submit}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ZoneSelect value={zone} onChange={setZone} />
        <SchoolSelect zoneId={zone} value={school} onChange={setSchool} />
      </div>
      <AutoFields schoolId={school} />
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
          <span className="text-sm font-medium">Mobile Number</span>
          <input className="mt-1 w-full rounded-md border p-2" placeholder="+27" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Email Address</span>
          <input type="email" className="mt-1 w-full rounded-md border p-2" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
      </div>
      <fieldset className="rounded-md border p-3">
        <legend className="px-2 text-sm font-semibold">Administrative Role</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium">Organization Type</span>
            <select className="mt-1 w-full rounded-md border p-2" value={roleSel === 'SchoolAdmin' ? 'School' : roleSel === 'ZoneCoordinator' ? 'Zone' : 'EPHSRU'} onChange={(e) => {
              const v = e.target.value
              setRoleSel(v === 'School' ? 'SchoolAdmin' : v === 'Zone' ? 'ZoneCoordinator' : 'EPHSRUAdmin')
            }}>
              {['School','Zone','EPHSRU'].map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium">Admin Level</span>
            <select className="mt-1 w-full rounded-md border p-2" value={roleSel} onChange={(e) => setRoleSel(e.target.value as any)}>
              <option value="SchoolAdmin">School Admin</option>
              <option value="ZoneCoordinator">Zone Coordinator</option>
              <option value="EPHSRUAdmin">EPHSRU Admin</option>
            </select>
          </label>
          <div className="sm:col-span-2">
            <div className="text-sm font-medium">Permissions Required</div>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {['Approve Registrations','Manage Fixtures','View Reports','Manage Coaches','Export Data'].map((p) => (
                <label key={p} className="flex items-center gap-2 text-sm"><input type="checkbox" /> {p}</label>
              ))}
            </div>
          </div>
        </div>
      </fieldset>
      <fieldset className="rounded-md border p-3">
        <legend className="px-2 text-sm font-semibold">Verification</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium">Organization Email Address</span>
            <input type="email" className="mt-1 w-full rounded-md border p-2" />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Position/Title</span>
            <input className="mt-1 w-full rounded-md border p-2" />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium">Letter of Appointment</span>
            <input type="file" className="mt-1 w-full rounded-md border p-2" accept="application/pdf,image/*" />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium">ID Document</span>
            <input type="file" className="mt-1 w-full rounded-md border p-2" accept="application/pdf,image/*" />
          </label>
        </div>
      </fieldset>
      <button className="w-full rounded-md bg-brand p-2 text-white">Submit Admin Registration</button>
    </form>
  )
}