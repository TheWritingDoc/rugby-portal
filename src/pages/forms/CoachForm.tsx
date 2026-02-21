import { useEffect, useState } from 'react'
import { ZoneSelect, SchoolSelect, AutoFields } from '../../components/Dropdowns'
import { isEmail, isPhoneZA, isIdNumber } from '../../utils/validation'
import { addAudit } from '../../utils/audit'
import { addEntity } from '../../utils/db'
import { safePost } from '../../utils/api'
import { loadDraft, saveDraft, clearDraft } from '../../utils/storage'
import { uploadFile } from '../../utils/upload'
import { saveDocumentLocal } from '../../utils/approvals'
import { login } from '../../utils/auth'
import bcrypt from 'bcryptjs'

export default function CoachForm({ role, onGoLogin, onGoDashboard }: { role?: 'Player' | 'Referee' | 'Coach' | 'SchoolAdmin' | 'ZoneCoordinator' | 'EPHSRUAdmin'; onGoLogin?: () => void; onGoDashboard?: () => void }) {
  const [zone, setZone] = useState<string>()
  const [school, setSchool] = useState<string>()
  const [name, setName] = useState('')
  const [surname, setSurname] = useState('')
  const [idNumber, setIdNumber] = useState('')
  const [dob, setDob] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [password, setPassword] = useState('')
  const [preRegDone, setPreRegDone] = useState(false)
  useEffect(() => {
    const d = loadDraft<any>('coach')
    if (d) {
      setZone(d.zone); setSchool(d.school); setName(d.name); setSurname(d.surname); setIdNumber(d.idNumber); setDob(d.dob); setPhone(d.phone); setEmail(d.email)
    }
    const regEmail = localStorage.getItem('reg:email') || ''
    const regPassword = localStorage.getItem('reg:password') || ''
    if (regEmail) setEmail(regEmail)
    if (regPassword) setPassword(regPassword)
    if (regEmail || regPassword) setPreRegDone(true)
  }, [])
  useEffect(() => {
    saveDraft('coach', { zone, school, name, surname, idNumber, dob, phone, email })
  }, [zone, school, name, surname, idNumber, dob, phone, email])
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    
    if (email && !isEmail(email)) return alert('Invalid email')
    if (phone && !isPhoneZA(phone)) return alert('Invalid phone number (+27 or 0XXXXXXXXX)')
    if (idNumber && !isIdNumber(idNumber)) return alert('Invalid ID number')
    const passwordHash = password ? bcrypt.hashSync(password, 10) : undefined
    const payload = { name, surname, idNumber, dob, phone, email, zoneId: zone, schoolId: school, passwordHash }
    await login('Coach', zone, school)
    try {
      localStorage.setItem('auth:role', 'Coach')
      if (zone) localStorage.setItem('auth:zoneId', String(zone))
      if (school) localStorage.setItem('auth:schoolId', String(school))
    } catch {}
    const ok = await safePost('coaches', payload)
    if (!ok) addEntity('Coach', payload)
    addAudit({ id: crypto.randomUUID(), userRole: 'SchoolAdmin', entity: 'Coach', action: 'create', after: { name, surname, school }, ts: Date.now() })
    clearDraft('coach')
    setSubmitted(true)
  }
  return (
    <form className="space-y-3" onSubmit={submit}>
      {preRegDone && !submitted && (
        <div className="rounded-md border border-green-300 bg-green-50 p-3 text-sm">
          <div className="text-base font-semibold text-green-700">CONGRATULATIONS!!!</div>
          <div className="text-green-800">Personal information section is loaded.</div>
        </div>
      )}
      {submitted && (
        <div className="rounded-md border border-green-300 bg-green-50 p-3 text-sm">
          <div className="mb-2 text-base font-semibold text-green-700">Congratulations! Your coach registration has been submitted.</div>
          <div className="mb-3 text-green-800">You can sign in and view the dashboard.</div>
          <div className="flex gap-2">
            <button type="button" onClick={onGoLogin} className="rounded-md border bg-white px-3 py-2">Login</button>
            <button type="button" onClick={onGoDashboard} className="rounded-md bg-brand px-3 py-2 text-white">View Dashboard</button>
          </div>
        </div>
      )}
      {!submitted && (
      <>
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
            <span className="text-sm font-medium">Coaching Qualification Level</span>
            <select className="mt-1 w-full rounded-md border p-2">
              {['Level 1','Level 2','Level 3','None'].map((q) => (
                <option key={q}>{q}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium">Years of Coaching Experience</span>
            <input type="number" className="mt-1 w-full rounded-md border p-2" />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium">Qualification Certificate</span>
            <input type="file" className="mt-1 w-full rounded-md border p-2" accept="application/pdf,image/*" onChange={async (e) => {
              const f = e.target.files?.[0]; if (!f || !school) return; const url = await uploadFile(f); if (!url) return; const doc = { ownerType: 'Coach', ownerId: school, type: 'qualification', url }; const ok = await safePost('documents', doc); if (!ok) saveDocumentLocal(doc)
            }} />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium">First Aid Certificate</span>
            <input type="file" className="mt-1 w-full rounded-md border p-2" accept="application/pdf,image/*" onChange={async (e) => {
              const f = e.target.files?.[0]; if (!f || !school) return; const url = await uploadFile(f); if (!url) return; const doc = { ownerType: 'Coach', ownerId: school, type: 'first_aid', url }; const ok = await safePost('documents', doc); if (!ok) saveDocumentLocal(doc)
            }} />
          </label>
        </div>
      </fieldset>
      <fieldset className="rounded-md border p-3">
        <legend className="px-2 text-sm font-semibold">School Assignment</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium">Age Group(s) Coaching</span>
            <select multiple className="mt-1 w-full rounded-md border p-2">
              {['U15', 'U16', 'U17', 'U19'].map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium">Position</span>
            <select className="mt-1 w-full rounded-md border p-2">
              {['Head Coach','Assistant Coach','Team Manager'].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
        </div>
      </fieldset>
      <fieldset className="rounded-md border p-3">
        <legend className="px-2 text-sm font-semibold">Background Checks</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium">Police Clearance Certificate</span>
            <input type="file" className="mt-1 w-full rounded-md border p-2" accept="application/pdf,image/*" onChange={async (e) => {
              const f = e.target.files?.[0]; if (!f || !school) return; const url = await uploadFile(f); if (!url) return; const doc = { ownerType: 'Coach', ownerId: school, type: 'police_clearance', url }; const ok = await safePost('documents', doc); if (!ok) saveDocumentLocal(doc)
            }} />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium">Child Protection Training Certificate</span>
            <input type="file" className="mt-1 w-full rounded-md border p-2" accept="application/pdf,image/*" />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium">References (2)</span>
            <textarea className="mt-1 w-full rounded-md border p-2" placeholder="Name, contact details for two references" />
          </label>
        </div>
      </fieldset>
      <button className="w-full rounded-md bg-brand p-2 text-white">Submit Coach Registration</button>
      </>
      )}
    </form>
  )
}
