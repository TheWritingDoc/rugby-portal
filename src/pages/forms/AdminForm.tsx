import { notifyError, notifySuccess } from '../../utils/notify'
import { useEffect, useState } from 'react'
import { ZoneSelect, SchoolSelect, AutoFields } from '../../components/Dropdowns'
import { isEmail, isPhoneZA, isIdNumber } from '../../utils/validation'
import { addAudit } from '../../utils/audit'
import { addEntity } from '../../utils/db'
import { safePost } from '../../utils/api'
import { loadDraft, saveDraft, clearDraft } from '../../utils/storage'
import { login, getToken } from '../../utils/auth'
import { creatorScope } from '../../utils/creatorScope'
import PhotoField from '../../components/PhotoField'
import bcrypt from 'bcryptjs'

const ROLE_LABELS: Record<string, string> = {
  SchoolAdmin: 'School Admin',
  ZoneCoordinator: 'Zone Coordinator',
  EPHSRUAdmin: 'EPHSRU Admin',
}

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
  const [photoUrl, setPhotoUrl] = useState('')
  useEffect(() => {
    const d = loadDraft<any>('admin')
    if (d) {
      setZone(d.zone); setSchool(d.school); setName(d.name); setSurname(d.surname); setIdNumber(d.idNumber); setPhone(d.phone); setEmail(d.email)
    }
    // Credentials chosen on the Create User screen take precedence over stale drafts
    const regEmail = localStorage.getItem('reg:email') || ''
    const regPassword = localStorage.getItem('reg:password') || ''
    if (regEmail) setEmail(regEmail)
    if (regPassword) setPassword(regPassword)
    // Delegated creation: default zone/school to the creator's own scope (a
    // zone coordinator creating a school admin starts in their own zone)
    const scope = creatorScope()
    if (scope.zoneId) setZone((z) => z || scope.zoneId)
    if (scope.schoolId) setSchool((s) => s || scope.schoolId)
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
    
    if (!zone && roleSel !== 'EPHSRUAdmin') return notifyError('Select the zone for this account')
    if (!school && roleSel === 'SchoolAdmin') return notifyError('Select the school this admin will manage')
    if (email && !isEmail(email)) return notifyError('Invalid email')
    if (phone && !isPhoneZA(phone)) return notifyError('Invalid phone number (+27 or 0XXXXXXXXX)')
    if (idNumber && !isIdNumber(idNumber)) return notifyError('Invalid ID number')
    const passwordHash = password ? bcrypt.hashSync(password, 10) : undefined
    const payload = { name, surname, idNumber, phone, email, role: roleSel, zoneId: zone, schoolId: school, passwordHash, photoUrl }
    // Keep the creator's session (EPHSRU admin / zone coordinator stays signed
    // in) — the server checks THEIR authority to create this admin role.
    if (!getToken()) await login('EPHSRUAdmin', zone, school)
    const ok = await safePost('admins', payload)
    if (!ok) {
      addEntity('Admin', payload)
      return notifyError('Could not create the account — check that the role and zone are within your authority.')
    }
    addAudit({ id: crypto.randomUUID(), userRole: role || 'EPHSRUAdmin', entity: 'Admin', action: 'create', after: { name, surname, school, role: roleSel }, ts: Date.now() })
    clearDraft('admin')
    try { localStorage.removeItem('reg:email'); localStorage.removeItem('reg:password'); localStorage.removeItem('reg:adminRole') } catch {}
    notifySuccess(`${ROLE_LABELS[roleSel] || roleSel} account created${email ? ` for ${email}` : ''} — they can sign in now.`)
    // Close the form and return to the dashboard automatically
    window.dispatchEvent(new CustomEvent('app:navigate', { detail: 'dashboard' }))
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
        <PhotoField value={photoUrl} onChange={setPhotoUrl} ensureAuth={() => login('EPHSRUAdmin', zone, school)} />
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