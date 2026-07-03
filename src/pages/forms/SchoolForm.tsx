import { notifyError, notifySuccess } from '../../utils/notify'
import { useEffect, useState } from 'react'
import { ZoneSelect, SchoolSelect, AutoFields } from '../../components/Dropdowns'
import { isEmail, isPhoneZA } from '../../utils/validation'
import { addAudit } from '../../utils/audit'
import { addEntity } from '../../utils/db'
import { safePost } from '../../utils/api'
import { loadDraft, saveDraft, clearDraft } from '../../utils/storage'
import { login } from '../../utils/auth'
import { API_ORIGIN, apiUrl } from '../../utils/apiBase'
import { resizeImage } from '../../utils/image'
import bcrypt from 'bcryptjs'

export default function SchoolForm({ role }: { role?: 'Player' | 'Referee' | 'Coach' | 'SchoolAdmin' | 'ZoneCoordinator' | 'EPHSRUAdmin' }) {
  const [zone, setZone] = useState<string>()
  const [school, setSchool] = useState<string>()
  const [address, setAddress] = useState('')
  const [contactNumber, setContactNumber] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [submitted, setSubmitted] = useState(false)
  useEffect(() => {
    const d = loadDraft<any>('school')
    if (d) {
      setZone(d.zone)
      setSchool(d.school)
      setAddress(d.address)
      setContactNumber(d.contactNumber)
      setEmail(d.email)
    }
  }, [])
  useEffect(() => {
    saveDraft('school', { zone, school, address, contactNumber, email })
  }, [zone, school, address, contactNumber, email])
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    
    if (email && !isEmail(email)) return notifyError('Invalid email')
    if (contactNumber && !isPhoneZA(contactNumber)) return notifyError('Invalid phone number (+27 or 0XXXXXXXXX)')
    const passwordHash = password ? bcrypt.hashSync(password, 10) : undefined
    const payload = { zoneId: zone, schoolId: school, address, contactNumber, email, passwordHash, logoUrl }
    // Keep the creator's session (zone coordinator / union admin stays signed in)
    const delegated = Boolean(localStorage.getItem('auth:token'))
    if (!delegated) await login('SchoolAdmin', zone, school)
    const ok = await safePost('schools', payload)
    if (!ok) {
      addEntity('School', payload)
      return notifyError('Could not register the school — check the zone is within your authority.')
    }
    addAudit({ id: crypto.randomUUID(), userRole: 'SchoolAdmin', entity: 'School', action: 'create', after: { zone, school }, ts: Date.now() })
    clearDraft('school')
    try { localStorage.removeItem('reg:email'); localStorage.removeItem('reg:password') } catch {}
    if (delegated) {
      notifySuccess('School registered — it is now on the union register.')
      window.dispatchEvent(new CustomEvent('app:navigate', { detail: 'dashboard' }))
    } else {
      setSubmitted(true)
    }
  }
  return (
    <form className="space-y-3" onSubmit={submit}>
      {submitted && (
        <div className="rounded-md border border-green-300 bg-green-50 p-3 text-sm">
          <div className="text-base font-semibold text-green-700">CONGRATULATIONS !!!</div>
          <div className="text-green-800">School registration has been submitted.</div>
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
          <span className="text-sm font-medium">School Physical Address</span>
          <input className="mt-1 w-full rounded-md border p-2" value={address} onChange={(e) => setAddress(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">School Contact Number</span>
          <input className="mt-1 w-full rounded-md border p-2" placeholder="+27" value={contactNumber} onChange={(e) => setContactNumber(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">School Email Address</span>
          <input type="email" className="mt-1 w-full rounded-md border p-2" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">School Emblem / Logo</span>
          <input
            type="file"
            accept="image/*"
            className="mt-1 w-full rounded-md border p-2"
            onChange={async (e) => {
              const raw = e.target.files?.[0]
              if (!raw) return
              const file = await resizeImage(raw, 256)
              const fd = new FormData()
              fd.append('file', file)
              try {
                if (!localStorage.getItem('auth:token')) await login('SchoolAdmin', zone, school)
                const t = localStorage.getItem('auth:token') || ''
                const res = await fetch(apiUrl('/upload'), { method: 'POST', headers: { ...(t ? { Authorization: `Bearer ${t}` } : {}) }, body: fd })
                if (res.ok) {
                  const data = await res.json()
                  setLogoUrl(String(data.url || ''))
                } else {
                  notifyError('Emblem upload failed. Please try again.')
                }
              } catch {
                notifyError('Emblem upload failed. Please try again.')
              }
            }}
          />
          {logoUrl && (
            <img
              src={logoUrl.startsWith('/uploads') ? `${API_ORIGIN}${logoUrl}` : logoUrl}
              alt="School emblem"
              className="mt-2 h-16 w-16 rounded-md object-contain ring-1 ring-gray-300"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
            />
          )}
        </label>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium">Principal/Sports Coordinator Name</span>
          <input className="mt-1 w-full rounded-md border p-2" />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Principal/Sports Coordinator Surname</span>
          <input className="mt-1 w-full rounded-md border p-2" />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Contact Number</span>
          <input className="mt-1 w-full rounded-md border p-2" placeholder="+27" />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Email Address</span>
          <input type="email" className="mt-1 w-full rounded-md border p-2" />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Position/Title</span>
          <input className="mt-1 w-full rounded-md border p-2" />
        </label>
       </div>
       <fieldset className="rounded-md border p-3">
         <legend className="px-2 text-sm font-semibold">Rugby Program Details</legend>
         <div className="grid grid-cols-2 gap-2">
           {['U15', 'U16', 'U17', 'U19'].map((g) => (
             <label key={g} className="flex items-center gap-2 text-sm">
               <input type="checkbox" /> {g}
             </label>
           ))}
         </div>
         <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
           <label className="block">
             <span className="text-sm font-medium">Number of Teams</span>
             <input type="number" className="mt-1 w-full rounded-md border p-2" />
           </label>
           <label className="block">
             <span className="text-sm font-medium">Preferred Registration Days</span>
             <select className="mt-1 w-full rounded-md border p-2">
               <option>Wednesdays (league)</option>
               <option>Fridays (cluster trials)</option>
             </select>
           </label>
         </div>
       </fieldset>
       <button className="w-full rounded-md bg-brand p-2 text-white">Submit School Registration</button>
       </>
       )}
    </form>
  )
}
