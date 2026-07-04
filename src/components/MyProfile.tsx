import { useEffect, useRef, useState } from 'react'
import { UserCog, Camera, FileText, Upload, Trash2, X, Loader2 } from 'lucide-react'
import { apiUrl, API_ORIGIN } from '../utils/apiBase'
import { getToken } from '../utils/auth'
import { resizeImage } from '../utils/image'
import { notifyError, notifySuccess } from '../utils/notify'

type Profile = {
  role?: string
  email?: string
  id?: string
  name?: string
  surname?: string
  contactNumber?: string
  photoUrl?: string
  qualifications?: string
  experience?: string
  position?: string
  availability?: string
  address?: string
  bio?: string
  title?: string
}

type DocRow = { id: string; fileName: string; fileUrl: string; status?: string; ts?: number }

function authHeaders(json = true): Record<string, string> {
  const t = getToken() || localStorage.getItem('auth:token') || ''
  return { ...(json ? { 'Content-Type': 'application/json' } : {}), ...(t ? { Authorization: `Bearer ${t}` } : {}) }
}

// Self-service profile: any signed-in user (player, coach, referee, school
// admin, zone coordinator, EPHSRU admin) can update their own details, change
// their photo, and manage their personal documents from one place.
export default function MyProfile() {
  const [open, setOpen] = useState(false)
  const [me, setMe] = useState<Profile | null>(null)
  const [form, setForm] = useState<Profile>({})
  const [docs, setDocs] = useState<DocRow[]>([])
  const [saving, setSaving] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [docBusy, setDocBusy] = useState(false)
  const docInputRef = useRef<HTMLInputElement | null>(null)

  async function loadProfile() {
    try {
      const res = await fetch(apiUrl('/me'), { headers: authHeaders() })
      if (!res.ok) return
      const data = await res.json()
      setMe(data)
      setForm(data)
    } catch { /* ignore */ }
  }
  async function loadDocs() {
    try {
      const res = await fetch(apiUrl('/me/documents'), { headers: authHeaders() })
      if (!res.ok) return
      setDocs(await res.json())
    } catch { /* ignore */ }
  }

  // Load lazily — only when the panel opens — so every dashboard mount doesn't
  // fire an extra /api/me request (MyPhoto already fetches the avatar).
  useEffect(() => { if (open) { loadProfile(); loadDocs() } }, [open])

  const role = String(me?.role || '')
  const isStaff = role === 'Coach' || role === 'Referee'
  const isAdmin = role === 'SchoolAdmin' || role === 'ZoneCoordinator' || role === 'EPHSRUAdmin'
  const initials = `${(me?.name || '?')[0] || ''}${(me?.surname || '')[0] || ''}`.toUpperCase()
  const photo = me?.photoUrl ? (me.photoUrl.startsWith('/uploads') ? `${API_ORIGIN}${me.photoUrl}` : me.photoUrl) : ''

  async function save() {
    if (!String(form.name || '').trim() || !String(form.surname || '').trim()) {
      return notifyError('Name and surname are required')
    }
    setSaving(true)
    try {
      const res = await fetch(apiUrl('/me'), { method: 'PUT', headers: authHeaders(), body: JSON.stringify(form) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'save failed')
      setMe(data); setForm(data)
      notifySuccess('Profile updated')
      setOpen(false)
    } catch (err: any) {
      notifyError(`Could not save profile: ${err?.message || err}`)
    } finally {
      setSaving(false)
    }
  }

  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.files?.[0]
    if (!raw) return
    setPhotoBusy(true)
    try {
      const file = await resizeImage(raw, 512)
      const fd = new FormData()
      fd.append('file', file)
      const up = await fetch(apiUrl('/upload'), { method: 'POST', headers: authHeaders(false), body: fd })
      if (!up.ok) throw new Error('upload failed')
      const { url } = await up.json()
      const res = await fetch(apiUrl('/me/photo'), { method: 'POST', headers: authHeaders(), body: JSON.stringify({ photoUrl: String(url || '') }) })
      if (!res.ok) throw new Error('save failed')
      setMe((prev) => ({ ...(prev || {}), photoUrl: String(url || '') }))
      notifySuccess('Profile photo updated')
    } catch (err: any) {
      notifyError(`Could not update photo: ${err?.message || err}`)
    } finally {
      setPhotoBusy(false)
    }
  }

  async function onPickDoc(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.files?.[0]
    if (!raw) return
    if (raw.size > 5 * 1024 * 1024) { notifyError('File too large (max 5 MB)'); return }
    setDocBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', raw)
      const up = await fetch(apiUrl('/upload'), { method: 'POST', headers: authHeaders(false), body: fd })
      if (!up.ok) throw new Error('unsupported file type or upload failed')
      const { url } = await up.json()
      const res = await fetch(apiUrl('/me/documents'), { method: 'POST', headers: authHeaders(), body: JSON.stringify({ fileName: raw.name, fileUrl: String(url || '') }) })
      if (!res.ok) throw new Error('save failed')
      notifySuccess('Document uploaded')
      await loadDocs()
    } catch (err: any) {
      notifyError(`Could not upload document: ${err?.message || err}`)
    } finally {
      setDocBusy(false)
      if (docInputRef.current) docInputRef.current.value = ''
    }
  }

  async function removeDoc(id: string) {
    if (!confirm('Remove this document?')) return
    try {
      const res = await fetch(apiUrl(`/me/documents/${encodeURIComponent(id)}`), { method: 'DELETE', headers: authHeaders() })
      if (!res.ok) throw new Error('delete failed')
      setDocs((prev) => prev.filter((d) => d.id !== id))
      notifySuccess('Document removed')
    } catch (err: any) {
      notifyError(`Could not remove document: ${err?.message || err}`)
    }
  }

  const field = (label: string, key: keyof Profile, opts: { type?: string; placeholder?: string; textarea?: boolean } = {}) => (
    <label className="block">
      <span className="text-xs font-medium text-gray-600">{label}</span>
      {opts.textarea ? (
        <textarea
          className="mt-1 w-full rounded-md border border-gray-300 p-2 text-sm"
          rows={2}
          value={String(form[key] || '')}
          placeholder={opts.placeholder}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        />
      ) : (
        <input
          type={opts.type || 'text'}
          className="mt-1 w-full rounded-md border border-gray-300 p-2 text-sm"
          value={String(form[key] || '')}
          placeholder={opts.placeholder}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        />
      )}
    </label>
  )

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="my-profile-toggle"
        className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 shadow-sm transition-colors hover:bg-gray-50"
        title="Edit my profile and documents"
      >
        <UserCog size={14} className="text-brand" aria-hidden="true" />
        My Profile
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label="My profile">
          <div data-testid="my-profile-modal" className="my-8 w-full max-w-2xl rounded-2xl bg-white shadow-xl">
            {/* Header */}
            <div className="relative overflow-hidden rounded-t-2xl bg-gradient-to-r from-blue-700 to-blue-500 px-6 py-5 text-white">
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="absolute right-3 top-3 rounded-full p-1.5 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
              >
                <X size={18} />
              </button>
              <div className="flex items-center gap-4">
                <label className="group relative shrink-0 cursor-pointer" title="Change photo">
                  {photo ? (
                    <img src={photo} alt="My profile" className="h-16 w-16 rounded-full object-cover ring-4 ring-white/30" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                  ) : (
                    <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/15 text-xl font-bold ring-4 ring-white/30">{initials}</span>
                  )}
                  <span className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-white text-brand shadow ring-2 ring-white">
                    {photoBusy ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />}
                  </span>
                  <input type="file" accept="image/*" className="hidden" onChange={onPickPhoto} disabled={photoBusy} aria-label="Upload profile photo" />
                </label>
                <div className="min-w-0">
                  <div className="truncate text-lg font-bold">{me?.name || form.name || ''} {me?.surname || form.surname || ''}</div>
                  <div className="text-sm text-blue-100">{role || 'User'}{me?.email ? ` · ${me.email}` : ''}</div>
                </div>
              </div>
            </div>

            <div className="max-h-[70vh] space-y-6 overflow-y-auto px-6 py-5">
              {/* Details */}
              <section>
                <h3 className="mb-3 text-sm font-semibold text-gray-900">My details</h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {field('Name', 'name')}
                  {field('Surname', 'surname')}
                  {field('Mobile', 'contactNumber', { type: 'tel', placeholder: '+27 or 0XXXXXXXXX' })}
                  <label className="block">
                    <span className="text-xs font-medium text-gray-600">Email</span>
                    <input value={me?.email || ''} disabled className="mt-1 w-full cursor-not-allowed rounded-md border border-gray-200 bg-gray-50 p-2 text-sm text-gray-500" />
                  </label>
                  {isStaff && field('Qualifications', 'qualifications', { placeholder: 'e.g. SARU Level 1' })}
                  {isStaff && field('Experience (years)', 'experience', { placeholder: 'e.g. 5' })}
                  {role === 'Coach' && field('Position / role', 'position', { placeholder: 'e.g. Head Coach' })}
                  {role === 'Referee' && field('Availability', 'availability', { placeholder: 'e.g. Weekends' })}
                  {isAdmin && field('Title', 'title', { placeholder: 'e.g. Administrator' })}
                  <div className="sm:col-span-2">{field('Address', 'address')}</div>
                  <div className="sm:col-span-2">{field('About me', 'bio', { textarea: true, placeholder: 'A short note about you (optional)' })}</div>
                </div>
              </section>

              {/* Documents */}
              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900">My documents</h3>
                  <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 ${docBusy ? 'pointer-events-none opacity-60' : ''}`}>
                    {docBusy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                    {docBusy ? 'Uploading…' : 'Upload'}
                    <input ref={docInputRef} type="file" accept="image/*,application/pdf,.doc,.docx" className="hidden" onChange={onPickDoc} disabled={docBusy} aria-label="Upload document" />
                  </label>
                </div>
                {docs.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
                    No documents yet. Upload certificates, ID copies or clearances (PDF, Word or image, max 5 MB).
                  </div>
                ) : (
                  <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                    {docs.map((d) => {
                      const href = d.fileUrl?.startsWith('/uploads') ? `${API_ORIGIN}${d.fileUrl}` : d.fileUrl
                      return (
                        <li key={d.id} className="flex items-center gap-3 px-3 py-2.5">
                          <FileText size={16} className="shrink-0 text-brand" aria-hidden="true" />
                          <a href={href} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-sm text-gray-700 hover:text-brand hover:underline">
                            {d.fileName || 'Document'}
                          </a>
                          {d.ts ? <span className="hidden shrink-0 text-xs text-gray-400 sm:block">{new Date(Number(d.ts)).toLocaleDateString()}</span> : null}
                          <button type="button" onClick={() => removeDoc(d.id)} aria-label={`Remove ${d.fileName || 'document'}`} className="shrink-0 rounded-md p-1 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600">
                            <Trash2 size={15} />
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 rounded-b-2xl border-t border-gray-100 bg-gray-50 px-6 py-3">
              <button type="button" onClick={() => setOpen(false)} className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Close</button>
              <button type="button" onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:brightness-110 disabled:opacity-60">
                {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
