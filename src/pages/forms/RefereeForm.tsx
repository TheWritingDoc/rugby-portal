import { notifyError, notifySuccess } from '../../utils/notify'
import { useEffect, useState } from 'react'
import { ZoneSelect } from '../../components/Dropdowns'
import { isEmail, isPhoneZA, isIdNumber } from '../../utils/validation'
import { addAudit } from '../../utils/audit'
import { addEntity } from '../../utils/db'
import { safePost } from '../../utils/api'
import { loadDraft, saveDraft, clearDraft } from '../../utils/storage'
import { login, getToken } from '../../utils/auth'
import { creatorScope } from '../../utils/creatorScope'
import PhotoField from '../../components/PhotoField'
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
  const [refereeLevel, setRefereeLevel] = useState('Provincial')
  const [yearsExperience, setYearsExperience] = useState('')
  const [availability, setAvailability] = useState<string[]>([])
  const [photoUrl, setPhotoUrl] = useState('')
  useEffect(() => {
    const d = loadDraft<any>('referee')
    if (d) {
      setZone(d.zone); setName(d.name); setSurname(d.surname); setIdNumber(d.idNumber); setDob(d.dob); setPhone(d.phone); setEmail(d.email)
      if (d.refereeLevel) setRefereeLevel(d.refereeLevel)
      if (d.yearsExperience) setYearsExperience(d.yearsExperience)
      if (Array.isArray(d.availability)) setAvailability(d.availability)
    }
    // Credentials chosen on the Create User screen take precedence over stale drafts
    const regEmail = localStorage.getItem('reg:email') || ''
    const regPassword = localStorage.getItem('reg:password') || ''
    if (regEmail) setEmail(regEmail)
    if (regPassword) setPassword(regPassword)
    // Delegated creation: default the zone to the creator's own scope
    const scope = creatorScope()
    if (scope.zoneId) setZone((z) => z || scope.zoneId)
  }, [])
  useEffect(() => {
    saveDraft('referee', { zone, name, surname, idNumber, dob, phone, email, refereeLevel, yearsExperience, availability })
  }, [zone, name, surname, idNumber, dob, phone, email, refereeLevel, yearsExperience, availability])
  const toggleDay = (d: string) => setAvailability((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]))
  async function submit(e: React.FormEvent) {
    e.preventDefault()

    if (!zone) return notifyError("Select the referee's zone")
    if (email && !isEmail(email)) return notifyError('Invalid email')
    if (phone && !isPhoneZA(phone)) return notifyError('Invalid phone number (+27 or 0XXXXXXXXX)')
    if (idNumber && !isIdNumber(idNumber)) return notifyError('Invalid ID number')
    const passwordHash = password ? bcrypt.hashSync(password, 10) : undefined
    // When a school admin registers the referee, tie the official to their school
    // so messaging and document review stay in scope.
    const creatorSchool = localStorage.getItem('auth:schoolId') || undefined
    const payload = {
      name, surname, idNumber, dob, phone, email, zoneId: zone, passwordHash,
      qualifications: refereeLevel, experience: yearsExperience,
      refereeLevel, yearsExperience, availability, photoUrl,
      schoolId: creatorSchool,
    }
    // Keep the creator's session (the school admin stays signed in); only fall
    // back to a self-registration token when nobody is logged in.
    if (!getToken()) await login('Referee', zone)
    const ok = await safePost('referees', payload)
    if (!ok) {
      addEntity('Referee', payload)
      return notifyError('Could not create the referee — check the zone is within your authority.')
    }
    addAudit({ id: crypto.randomUUID(), userRole: role || 'SchoolAdmin', entity: 'Referee', action: 'create', after: { name, surname, zone }, ts: Date.now() })
    clearDraft('referee')
    try { localStorage.removeItem('reg:email'); localStorage.removeItem('reg:password') } catch {}
    notifySuccess(`Referee account created${email ? ` for ${email}` : ''} — they can sign in now.`)
    // Close the form and return to the dashboard automatically
    window.dispatchEvent(new CustomEvent('app:navigate', { detail: 'dashboard' }))
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
        <PhotoField value={photoUrl} onChange={setPhotoUrl} ensureAuth={() => login('Referee', zone)} />
      </div>
      <fieldset className="rounded-md border p-3">
        <legend className="px-2 text-sm font-semibold">Qualification Details</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium">Referee Level</span>
            <select className="mt-1 w-full rounded-md border p-2" value={refereeLevel} onChange={(e) => setRefereeLevel(e.target.value)}>
              {['Provincial','Club','Schools'].map((q) => (
                <option key={q}>{q}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium">Years of Experience</span>
            <input type="number" className="mt-1 w-full rounded-md border p-2" value={yearsExperience} onChange={(e) => setYearsExperience(e.target.value)} />
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
            <label key={d} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={availability.includes(d)} onChange={() => toggleDay(d)} /> {d}
            </label>
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
