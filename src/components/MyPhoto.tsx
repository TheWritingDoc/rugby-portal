import { useEffect, useState } from 'react'
import { Camera } from 'lucide-react'
import { getJsonPath, postJsonPath } from '../utils/api'
import { apiUrl, API_ORIGIN } from '../utils/apiBase'
import { resizeImage } from '../utils/image'
import { notifyError, notifySuccess } from '../utils/notify'

// Every signed-in user can set their own profile picture from their dashboard.
// The photo lands on their own record (players/coaches/referees/admins) and is
// used everywhere avatars appear — cards, profiles, printed ID cards.
export default function MyPhoto() {
  const [me, setMe] = useState<{ name?: string; surname?: string; photoUrl?: string; role?: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    ;(async () => {
      const res = await getJsonPath('me')
      if (res && typeof res === 'object') setMe(res as any)
    })()
  }, [])

  if (!me) return null
  const initials = `${(me.name || '?')[0] || ''}${(me.surname || '')[0] || ''}`.toUpperCase()
  const photo = me.photoUrl ? (me.photoUrl.startsWith('/uploads') ? `${API_ORIGIN}${me.photoUrl}` : me.photoUrl) : ''

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.files?.[0]
    if (!raw) return
    setBusy(true)
    try {
      const file = await resizeImage(raw, 512)
      const fd = new FormData()
      fd.append('file', file)
      const t = localStorage.getItem('auth:token') || ''
      const up = await fetch(apiUrl('/upload'), { method: 'POST', headers: t ? { Authorization: `Bearer ${t}` } : {}, body: fd })
      if (!up.ok) throw new Error('upload failed')
      const { url } = await up.json()
      const res = await postJsonPath('me/photo', { photoUrl: String(url || '') })
      if (!res.ok) throw new Error((res.data as any)?.error || 'save failed')
      setMe((prev) => ({ ...prev, photoUrl: String(url || '') }))
      notifySuccess('Profile photo updated')
    } catch (err: any) {
      notifyError(`Could not update photo: ${err?.message || err}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <label
      className="group inline-flex cursor-pointer items-center gap-2 rounded-full border border-gray-200 bg-white py-1 pl-1 pr-3 text-xs font-medium text-gray-600 shadow-sm transition-colors hover:bg-gray-50"
      data-testid="my-photo"
      title="Change my profile photo"
    >
      {photo ? (
        <img src={photo} alt="My profile" className="h-7 w-7 rounded-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
      ) : (
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand/10 text-[11px] font-bold text-brand">{initials}</span>
      )}
      <Camera size={13} className="text-gray-400 group-hover:text-brand" aria-hidden="true" />
      {busy ? 'Uploading…' : me.photoUrl ? 'Change photo' : 'Add my photo'}
      <input type="file" accept="image/*" className="hidden" onChange={onPick} disabled={busy} aria-label="Upload profile photo" />
    </label>
  )
}
