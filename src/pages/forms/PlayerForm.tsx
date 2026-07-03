import { notifyError, notifySuccess } from '../../utils/notify'
import { useEffect, useMemo, useState } from 'react'
import { ZoneSelect, SchoolSelect, AutoFields } from '../../components/Dropdowns'
import { suggestAgeGroups } from '../../data/zones'
import { isEmail, isPhoneZA, isIdNumber, parseSaId } from '../../utils/validation'
import { addAudit } from '../../utils/audit'
import { addEntity } from '../../utils/db'
import { login } from '../../utils/auth'
import { safePost, postJsonPath } from '../../utils/api'
import { API_ORIGIN, apiUrl } from '../../utils/apiBase'
import { loadDraft, saveDraft, clearDraft } from '../../utils/storage'
import { resizeImage } from '../../utils/image'
import bcrypt from 'bcryptjs'

export default function PlayerForm({ role, onGoLogin, onGoDashboard }: { role?: 'Player' | 'Referee' | 'Coach' | 'SchoolAdmin' | 'ZoneCoordinator' | 'EPHSRUAdmin'; onGoLogin?: () => void; onGoDashboard?: () => void }) {
  const [zone, setZone] = useState<string>()
  const [school, setSchool] = useState<string>()
  const [dob, setDob] = useState('')
  const [gender, setGender] = useState<'Male' | 'Female' | ''>('')
  const [name, setName] = useState('')
  const [surname, setSurname] = useState('')
  const [idNumber, setIdNumber] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [photoUrl, setPhotoUrl] = useState<string>('')
  const [password, setPassword] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const [preRegDone, setPreRegDone] = useState(false)
  const [address, setAddress] = useState('')
  const [emergencyContactName, setEmergencyContactName] = useState('')
  const [emergencyContactNumber, setEmergencyContactNumber] = useState('')
  const [parentName, setParentName] = useState('')
  const [parentSurname, setParentSurname] = useState('')
  const [relationship, setRelationship] = useState('')
  const [parentContact, setParentContact] = useState('')
  const [parentEmail, setParentEmail] = useState('')
  const [consentSignature, setConsentSignature] = useState('')
  const [popiaConsent, setPopiaConsent] = useState(false)
  const [position, setPosition] = useState('')
  const [ageGroup, setAgeGroup] = useState('')
  const [jerseyNumber, setJerseyNumber] = useState<string>('')
  const [previousSchool, setPreviousSchool] = useState('')
  const [medicalAidName, setMedicalAidName] = useState('')
  const [medicalAidNumber, setMedicalAidNumber] = useState('')
  const [allergies, setAllergies] = useState('')
  const [chronicConditions, setChronicConditions] = useState('')
  const [medicalNotes, setMedicalNotes] = useState('')
  useEffect(() => {
    const d = loadDraft<any>('player')
    if (d) {
      setZone(d.zone)
      setSchool(d.school)
      setDob(d.dob)
      setGender(d.gender)
      setName(d.name)
      setSurname(d.surname)
      setIdNumber(d.idNumber)
      setPhone(d.phone)
      setEmail(d.email)
      setAddress(d.address || '')
      setEmergencyContactName(d.emergencyContactName || '')
      setEmergencyContactNumber(d.emergencyContactNumber || '')
      setParentName(d.parentName || '')
      setParentSurname(d.parentSurname || '')
      setRelationship(d.relationship || '')
      setParentContact(d.parentContact || '')
      setParentEmail(d.parentEmail || '')
      setConsentSignature(d.consentSignature || '')
      setPosition(d.position || '')
      setJerseyNumber(d.jerseyNumber || '')
      setPreviousSchool(d.previousSchool || '')
      setMedicalAidName(d.medicalAidName || '')
      setMedicalAidNumber(d.medicalAidNumber || '')
      setAllergies(d.allergies || '')
      setChronicConditions(d.chronicConditions || '')
      setMedicalNotes(d.medicalNotes || '')
    }
    const regEmail = localStorage.getItem('reg:email') || ''
    const regPassword = localStorage.getItem('reg:password') || ''
    if (regEmail) setEmail(regEmail)
    if (regPassword) setPassword(regPassword)
    if (regEmail || regPassword) setPreRegDone(true)
  }, [])
  useEffect(() => {
    saveDraft('player', { zone, school, dob, gender, name, surname, idNumber, phone, email, address, emergencyContactName, emergencyContactNumber, parentName, parentSurname, relationship, parentContact, parentEmail, consentSignature, position, jerseyNumber, previousSchool, medicalAidName, medicalAidNumber, allergies, chronicConditions, medicalNotes })
  }, [zone, school, dob, gender, name, surname, idNumber, phone, email, address, emergencyContactName, emergencyContactNumber, parentName, parentSurname, relationship, parentContact, parentEmail, consentSignature, position, jerseyNumber, previousSchool, medicalAidName, medicalAidNumber, allergies, chronicConditions, medicalNotes])
  const suggested = useMemo(() => suggestAgeGroups(dob, gender === '' ? undefined : gender), [dob, gender])
  // Decode the SA ID (if it's a valid 13-digit one) to auto-fill and cross-check
  // date of birth and gender against what was captured.
  const idInfo = useMemo(() => parseSaId(idNumber), [idNumber])
  useEffect(() => {
    if (!idInfo.valid) return
    if (!dob && idInfo.dob) setDob(idInfo.dob)
    if (!gender && idInfo.gender) setGender(idInfo.gender)
  }, [idInfo.valid, idInfo.dob, idInfo.gender]) // eslint-disable-line react-hooks/exhaustive-deps
  // Registering above the player's natural age-grade ("playing up") needs a
  // SARU Schedule A parent/guardian consent + exemption (front-row: Schedule B).
  const chosenAge = ageGroup || suggested[0] || ''
  const playingUp = Boolean(chosenAge && suggested.length > 0 && suggested.indexOf(chosenAge) > 0)
  const isFrontRow = position === 'Prop' || position === 'Hooker'
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (role && !['Player','Coach','SchoolAdmin','EPHSRUAdmin'].includes(role)) return notifyError('Not authorized')
    if (email && !isEmail(email)) return notifyError('Invalid email')
    if (phone && !isPhoneZA(phone)) return notifyError('Invalid phone number (+27 or 0XXXXXXXXX)')
    if (idNumber && !isIdNumber(idNumber)) return notifyError('Invalid ID/Passport number — a South African ID must be 13 digits with a valid check digit.')
    if (!popiaConsent) return notifyError('Please give POPIA consent to process this player’s personal and medical information.')
    const passwordHash = password ? bcrypt.hashSync(password, 10) : undefined
    const payload = { name, surname, idNumber, dob, gender, phone, email, zoneId: zone, schoolId: school, ageGroup: ageGroup || suggested[0], photoUrl, address, emergencyContactName, emergencyContactNumber, parentName, parentSurname, relationship, parentContact, parentEmail, consentSignature, popiaConsent, popiaConsentAt: popiaConsent ? Date.now() : undefined, playingUp, position, jerseyNumber, previousSchool, medicalAidName, medicalAidNumber, allergies, chronicConditions, medicalNotes, passwordHash }
    await login('Player', zone, school)
    try {
      localStorage.setItem('auth:role', 'Player')
      if (zone) localStorage.setItem('auth:zoneId', String(zone))
      if (school) localStorage.setItem('auth:schoolId', String(school))
    } catch {}
    const res = await postJsonPath('players/register', payload)
    if (!res.ok) {
      const err = (res.data as any)?.error || 'Registration failed'
      if (err === 'duplicate_idNumber') {
        return notifyError('This ID/Passport number is already registered. Please contact your school to migrate the player if needed.')
      }
      if (err === 'duplicate_email') {
        return notifyError('This email is already registered. Please login instead.')
      }
      return notifyError(String(err))
    }
    const serverId = (res.data as any)?.id || ''
    if (photoUrl && serverId) {
      await safePost('documents', { ownerType: 'players', ownerId: serverId, fileName: photoUrl.split('/').pop(), fileUrl: photoUrl })
    }
    addEntity('Player', { ...payload, serverId })
    addAudit({ id: crypto.randomUUID(), userRole: 'Coach', entity: 'Player', action: 'create', after: { name, surname, school }, ts: Date.now() })
    clearDraft('player')
    try { localStorage.removeItem('reg:email'); localStorage.removeItem('reg:password') } catch {}
    setSubmitted(true)
    notifySuccess(`Player registered${email ? ` (${email})` : ''} — submitted for coach review.`)
    // Close the form automatically after a short beat so the confirmation is seen
    setTimeout(() => { try { onGoDashboard?.() } catch {} }, 1500)
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
          <div className="mb-2 text-base font-semibold text-green-700">Congratulations! Your player registration has been submitted.</div>
          <div className="mb-3 text-green-800">You can sign in and view the player dashboard.</div>
          <div className="flex gap-2">
            <button type="button" onClick={onGoLogin} className="rounded-md border bg-white px-3 py-2">Login</button>
            <button type="button" onClick={onGoDashboard} className="rounded-md bg-brand px-3 py-2 text-white">View Player Dashboard</button>
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
        <label className="block">
          <span className="text-sm font-medium">Name</span>
          <input className="mt-1 w-full rounded-md border p-2" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Surname</span>
          <input className="mt-1 w-full rounded-md border p-2" value={surname} onChange={(e) => setSurname(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Date of Birth</span>
          <input type="date" className="mt-1 w-full rounded-md border p-2" value={dob} onChange={(e) => setDob(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">ID/Passport Number</span>
          <input className="mt-1 w-full rounded-md border p-2" value={idNumber} onChange={(e) => setIdNumber(e.target.value)} placeholder="13-digit SA ID or passport" />
          {idNumber.length >= 6 && (
            idInfo.valid ? (
              (dob && idInfo.dob && dob !== idInfo.dob) || (gender && idInfo.gender && gender !== idInfo.gender) ? (
                <span className="mt-1 block text-xs text-amber-700">⚠ ID indicates DOB {idInfo.dob}, {idInfo.gender} — does not match the entered date of birth/gender.</span>
              ) : (
                <span className="mt-1 block text-xs text-green-700">✓ Valid SA ID — DOB {idInfo.dob}, {idInfo.gender}{idInfo.citizen === false ? ' (permanent resident)' : ''}</span>
              )
            ) : /^\d{13}$/.test(idNumber) ? (
              <span className="mt-1 block text-xs text-red-600">⚠ Not a valid SA ID (check digit or date is wrong)</span>
            ) : (
              <span className="mt-1 block text-xs text-gray-400">Passport / non-SA document</span>
            )
          )}
        </label>
        <label className="block">
          <span className="text-sm font-medium">Gender</span>
          <select className="mt-1 w-full rounded-md border p-2" value={gender} onChange={(e) => setGender(e.target.value as any)}>
            <option value="">Select...</option>
            <option>Male</option>
            <option>Female</option>
          </select>
        </label>
      </div>
      <div>
        <div className="text-xs text-gray-500">Eligible Age Groups</div>
        <div className="mt-1 flex flex-wrap gap-2">
          {suggested.map((g) => (
            <span key={g} className="rounded-md bg-gray-200 px-2 py-1 text-xs">{g}</span>
          ))}
        </div>
      </div>
      <fieldset className="rounded-md border p-3">
        <legend className="px-2 text-sm font-semibold">Contact Information</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium">Create Password</span>
            <input type="password" className="mt-1 w-full rounded-md border p-2" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Mobile Number</span>
            <input className="mt-1 w-full rounded-md border p-2" placeholder="+27" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Email Address</span>
            <input type="email" className="mt-1 w-full rounded-md border p-2" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="block">
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
                  if (!localStorage.getItem('auth:token')) await login('Player', zone, school)
                  const t = localStorage.getItem('auth:token') || ''
                  const res = await fetch(apiUrl('/upload'), { method: 'POST', headers: { ...(t ? { Authorization: `Bearer ${t}` } : {}) }, body: fd })
                  if (res.ok) {
                    const data = await res.json()
                    const url = String(data.url || '')
                    const abs = url.startsWith('/uploads') ? `${API_ORIGIN}${url}` : url
                    setPhotoUrl(abs)
                  }
                } catch {}
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
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium">Physical Address</span>
            <input className="mt-1 w-full rounded-md border p-2" value={address} onChange={(e) => setAddress(e.target.value)} />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Emergency Contact Name</span>
            <input className="mt-1 w-full rounded-md border p-2" value={emergencyContactName} onChange={(e) => setEmergencyContactName(e.target.value)} />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Emergency Contact Number</span>
            <input className="mt-1 w-full rounded-md border p-2" placeholder="+27" value={emergencyContactNumber} onChange={(e) => setEmergencyContactNumber(e.target.value)} />
          </label>
        </div>
      </fieldset>
      <fieldset className="rounded-md border p-3">
        <legend className="px-2 text-sm font-semibold">Parent/Guardian Details (if under 18)</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium">Parent/Guardian Name</span>
            <input className="mt-1 w-full rounded-md border p-2" value={parentName} onChange={(e) => setParentName(e.target.value)} />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Parent/Guardian Surname</span>
            <input className="mt-1 w-full rounded-md border p-2" value={parentSurname} onChange={(e) => setParentSurname(e.target.value)} />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Relationship to Player</span>
            <input className="mt-1 w-full rounded-md border p-2" value={relationship} onChange={(e) => setRelationship(e.target.value)} />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Parent Contact Number</span>
            <input className="mt-1 w-full rounded-md border p-2" placeholder="+27" value={parentContact} onChange={(e) => setParentContact(e.target.value)} />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Parent Email Address</span>
            <input type="email" className="mt-1 w-full rounded-md border p-2" value={parentEmail} onChange={(e) => setParentEmail(e.target.value)} />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium">Digital Consent Signature</span>
            <input className="mt-1 w-full rounded-md border p-2" placeholder="Type full name" value={consentSignature} onChange={(e) => setConsentSignature(e.target.value)} />
          </label>
          <label className="flex items-start gap-2 sm:col-span-2">
            <input type="checkbox" className="mt-1" aria-label="POPIA consent" checked={popiaConsent} onChange={(e) => setPopiaConsent(e.target.checked)} />
            <span className="text-xs text-gray-700">
              I, as the player or parent/guardian, consent to the collection and processing of this player’s personal and medical
              information for rugby registration and administration, in accordance with the Protection of Personal Information Act
              (POPIA, Act 4 of 2013), and confirm the details provided are accurate. <span className="text-red-600">*</span>
            </span>
          </label>
        </div>
      </fieldset>
      <fieldset className="rounded-md border p-3">
        <legend className="px-2 text-sm font-semibold">Rugby Details</legend>
        {playingUp && (
          <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
            ⚠ This player is being registered <strong>above</strong> their natural age-grade. Per SARU age-banding, a parent/guardian
            two-year exemption &amp; consent (<strong>Schedule A</strong>{isFrontRow ? ' + Schedule B for front-row' : ''}) and coach
            certification are required. Ensure the consent below is completed and the exemption form is filed with your union.
          </div>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium">Position(s) Played</span>
            <select className="mt-1 w-full rounded-md border p-2" value={position} onChange={(e) => setPosition(e.target.value)}>
              {['Prop','Hooker','Lock','Flanker','Number 8','Scrum-half','Fly-half','Centre','Wing','Fullback'].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium">Jersey Number</span>
            <input type="number" className="mt-1 w-full rounded-md border p-2" value={jerseyNumber} onChange={(e) => setJerseyNumber(e.target.value)} />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Age Group (auto-suggested)</span>
            <select className="mt-1 w-full rounded-md border p-2" value={ageGroup || suggested[0] || ''} onChange={(e) => setAgeGroup(e.target.value)}>
              {suggested.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium">Previous School/Team (if transfer)</span>
            <input className="mt-1 w-full rounded-md border p-2" value={previousSchool} onChange={(e) => setPreviousSchool(e.target.value)} />
          </label>
        </div>
      </fieldset>
      <fieldset className="rounded-md border p-3">
        <legend className="px-2 text-sm font-semibold">Medical Information</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium">Medical Aid Name</span>
            <input className="mt-1 w-full rounded-md border p-2" value={medicalAidName} onChange={(e) => setMedicalAidName(e.target.value)} />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Medical Aid Number</span>
            <input className="mt-1 w-full rounded-md border p-2" value={medicalAidNumber} onChange={(e) => setMedicalAidNumber(e.target.value)} />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium">Known Allergies</span>
            <input className="mt-1 w-full rounded-md border p-2" value={allergies} onChange={(e) => setAllergies(e.target.value)} />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium">Chronic Conditions</span>
            <input className="mt-1 w-full rounded-md border p-2" value={chronicConditions} onChange={(e) => setChronicConditions(e.target.value)} />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium">Emergency Medical Notes</span>
            <textarea className="mt-1 w-full rounded-md border p-2" value={medicalNotes} onChange={(e) => setMedicalNotes(e.target.value)} />
          </label>
        </div>
      </fieldset>
      <button className="w-full rounded-md bg-brand p-2 text-white">Submit Player Registration</button>
      </>
      )}
    </form>
  )
}
