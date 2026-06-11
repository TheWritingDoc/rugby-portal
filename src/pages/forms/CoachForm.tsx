import { notifyError, notifySuccess } from '../../utils/notify'
import { useEffect, useState } from 'react'
import { ZoneSelect, SchoolSelect, AutoFields } from '../../components/Dropdowns'
import { isEmail, isPhoneZA, isIdNumber } from '../../utils/validation'
import { addAudit } from '../../utils/audit'
import { addEntity } from '../../utils/db'
import { safePost, postJson } from '../../utils/api'
import { loadDraft, saveDraft, clearDraft } from '../../utils/storage'
import { uploadFile } from '../../utils/upload'
import { saveDocumentLocal } from '../../utils/approvals'
import { login } from '../../utils/auth'
import { API_ORIGIN, apiUrl } from '../../utils/apiBase'
import { resizeImage } from '../../utils/image'
import bcrypt from 'bcryptjs'

const QUALIFICATION_LEVELS = ['None', 'Level 1', 'Level 2', 'Level 3']
const COACH_AGE_GROUPS = ['U15', 'U16', 'U17', 'U19']
const COACH_POSITIONS = ['Head Coach', 'Assistant Coach', 'Team Manager']

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
  const [photoUrl, setPhotoUrl] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const [qualificationLevel, setQualificationLevel] = useState('None')
  const [yearsExperience, setYearsExperience] = useState('')
  const [coachingAgeGroups, setCoachingAgeGroups] = useState<string[]>([])
  const [coachPosition, setCoachPosition] = useState('Head Coach')
  const [references, setReferences] = useState('')
  // Uploaded certificate URLs are linked to the coach record after it is created
  const [docUrls, setDocUrls] = useState<Record<string, string>>({})
  useEffect(() => {
    const d = loadDraft<any>('coach')
    if (d) {
      setZone(d.zone); setSchool(d.school); setName(d.name); setSurname(d.surname); setIdNumber(d.idNumber); setDob(d.dob); setPhone(d.phone); setEmail(d.email)
      if (d.qualificationLevel) setQualificationLevel(d.qualificationLevel)
      if (d.yearsExperience) setYearsExperience(d.yearsExperience)
      if (Array.isArray(d.coachingAgeGroups)) setCoachingAgeGroups(d.coachingAgeGroups)
      if (d.coachPosition) setCoachPosition(d.coachPosition)
      if (d.references) setReferences(d.references)
      if (d.photoUrl) setPhotoUrl(d.photoUrl)
    }
    const regEmail = localStorage.getItem('reg:email') || ''
    const regPassword = localStorage.getItem('reg:password') || ''
    if (regEmail) setEmail(regEmail)
    if (regPassword) setPassword(regPassword)
    if (regEmail || regPassword) setPreRegDone(true)
  }, [])
  useEffect(() => {
    saveDraft('coach', { zone, school, name, surname, idNumber, dob, phone, email, qualificationLevel, yearsExperience, coachingAgeGroups, coachPosition, references, photoUrl })
  }, [zone, school, name, surname, idNumber, dob, phone, email, qualificationLevel, yearsExperience, coachingAgeGroups, coachPosition, references, photoUrl])
  async function uploadDoc(file: File | undefined, type: string) {
    if (!file) return
    if (!localStorage.getItem('auth:token')) await login('Coach', zone, school)
    const url = await uploadFile(file)
    if (!url) return notifyError('Upload failed. Please try again.')
    setDocUrls((prev) => ({ ...prev, [type]: url }))
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault()

    if (email && !isEmail(email)) return notifyError('Invalid email')
    if (phone && !isPhoneZA(phone)) return notifyError('Invalid phone number (+27 or 0XXXXXXXXX)')
    if (idNumber && !isIdNumber(idNumber)) return notifyError('Invalid ID number')
    const passwordHash = password ? bcrypt.hashSync(password, 10) : undefined
    const payload = {
      name, surname, idNumber, dob, phone, email,
      contactNumber: phone,
      zoneId: zone, schoolId: school, passwordHash,
      photoUrl,
      qualifications: qualificationLevel,
      experience: yearsExperience,
      position: coachPosition,
      coachingAgeGroups,
      team: coachingAgeGroups[0] || '',
      references,
    }
    await login('Coach', zone, school)
    try {
      localStorage.setItem('auth:role', 'Coach')
      if (zone) localStorage.setItem('auth:zoneId', String(zone))
      if (school) localStorage.setItem('auth:schoolId', String(school))
    } catch {}
    const res = await postJson('coaches', payload)
    if (!res) addEntity('Coach', payload)
    const coachId = (res as any)?.id || school || ''
    for (const [type, url] of Object.entries(docUrls)) {
      const doc = { ownerType: 'Coach' as const, ownerId: coachId, type, fileName: url.split('/').pop(), fileUrl: url, url }
      const ok = await safePost('documents', doc)
      if (!ok) saveDocumentLocal(doc)
    }
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
        <label className="block sm:col-span-2">
          <span className="text-sm font-medium">Profile Photo</span>
          <input
            type="file"
            className="mt-1 w-full rounded-md border p-2"
            accept="image/*"
            onChange={async (e) => {
              const raw = e.target.files?.[0]
              if (!raw) return
              const file = await resizeImage(raw)
              const fd = new FormData()
              fd.append('file', file)
              try {
                if (!localStorage.getItem('auth:token')) await login('Coach', zone, school)
                const t = localStorage.getItem('auth:token') || ''
                const res = await fetch(apiUrl('/upload'), { method: 'POST', headers: { ...(t ? { Authorization: `Bearer ${t}` } : {}) }, body: fd })
                if (res.ok) {
                  const data = await res.json()
                  const url = String(data.url || '')
                  const abs = url.startsWith('/uploads') ? `${API_ORIGIN}${url}` : url
                  setPhotoUrl(abs)
                } else {
                  notifyError('Photo upload failed. Please try again.')
                }
              } catch {
                notifyError('Photo upload failed. Please try again.')
              }
            }}
          />
          {photoUrl && (
            <>
              <img
                src={photoUrl}
                alt="Profile"
                className="mt-2 h-16 w-16 rounded-full object-cover"
                onDoubleClick={() => setPreview(photoUrl)}
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
              />
              {preview && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setPreview(null)}>
                  <img src={preview} alt="Preview" className="max-h-[95vh] max-w-[98vw] rounded-md shadow-lg" style={{ transform: 'scale(2)' }} />
                </div>
              )}
            </>
          )}
        </label>
      </div>
      <fieldset className="rounded-md border p-3">
        <legend className="px-2 text-sm font-semibold">Qualification Details</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium">Coaching Qualification Level</span>
            <select className="mt-1 w-full rounded-md border p-2" value={qualificationLevel} onChange={(e) => setQualificationLevel(e.target.value)}>
              {QUALIFICATION_LEVELS.map((q) => (
                <option key={q}>{q}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium">Years of Coaching Experience</span>
            <input type="number" min={0} className="mt-1 w-full rounded-md border p-2" value={yearsExperience} onChange={(e) => setYearsExperience(e.target.value)} />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium">Qualification Certificate</span>
            <input type="file" className="mt-1 w-full rounded-md border p-2" accept="application/pdf,image/*" onChange={(e) => uploadDoc(e.target.files?.[0], 'qualification')} />
            {docUrls.qualification && <span className="mt-1 block text-xs text-green-700">Uploaded ✓</span>}
          </label>
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium">First Aid Certificate</span>
            <input type="file" className="mt-1 w-full rounded-md border p-2" accept="application/pdf,image/*" onChange={(e) => uploadDoc(e.target.files?.[0], 'first_aid')} />
            {docUrls.first_aid && <span className="mt-1 block text-xs text-green-700">Uploaded ✓</span>}
          </label>
        </div>
      </fieldset>
      <fieldset className="rounded-md border p-3">
        <legend className="px-2 text-sm font-semibold">School Assignment</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium">Age Group(s) Coaching</span>
            <select
              multiple
              className="mt-1 w-full rounded-md border p-2"
              value={coachingAgeGroups}
              onChange={(e) => setCoachingAgeGroups(Array.from(e.target.selectedOptions).map((o) => o.value))}
            >
              {COACH_AGE_GROUPS.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-gray-500">Hold Ctrl (Cmd on Mac) to select more than one. The first selection becomes your primary team.</span>
          </label>
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium">Position</span>
            <select className="mt-1 w-full rounded-md border p-2" value={coachPosition} onChange={(e) => setCoachPosition(e.target.value)}>
              {COACH_POSITIONS.map((p) => (
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
            <input type="file" className="mt-1 w-full rounded-md border p-2" accept="application/pdf,image/*" onChange={(e) => uploadDoc(e.target.files?.[0], 'police_clearance')} />
            {docUrls.police_clearance && <span className="mt-1 block text-xs text-green-700">Uploaded ✓</span>}
          </label>
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium">Child Protection Training Certificate</span>
            <input type="file" className="mt-1 w-full rounded-md border p-2" accept="application/pdf,image/*" onChange={(e) => uploadDoc(e.target.files?.[0], 'child_protection')} />
            {docUrls.child_protection && <span className="mt-1 block text-xs text-green-700">Uploaded ✓</span>}
          </label>
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium">References (2)</span>
            <textarea className="mt-1 w-full rounded-md border p-2" placeholder="Name, contact details for two references" value={references} onChange={(e) => setReferences(e.target.value)} />
          </label>
        </div>
      </fieldset>
      <button className="w-full rounded-md bg-brand p-2 text-white">Submit Coach Registration</button>
      </>
      )}
    </form>
  )
}
