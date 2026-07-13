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
      // Let dashboard banners showing this user's photo refresh without a reload
      try { window.dispatchEvent(new CustomEvent('me:photo:updated', { detail: { url: String(url || '') } })) } catch {}
      notifySuccess('Profile photo updated')
    } catch (err: any) {
      notifyError(`Could not update photo: ${err?.message || err}`)
    } finally {
      setBusy(false)
    }
  }

  const ROLE_LABELS: Record<string, string> = {
    Player: 'Player', Referee: 'Referee', Coach: 'Coach',
    SchoolAdmin: 'School Admin', ZoneCoordinator: 'Zone Coordinator', EPHSRUAdmin: 'EPHSRU Admin',
  }

  return (
    <label
      className="group inline-flex cursor-pointer items-center gap-3 rounded-xl border border-gray-200 bg-white py-1.5 pl-1.5 pr-4 shadow-sm transition-all hover:border-brand/40 hover:shadow-md"
      data-testid="my-photo"
      title="Change my profile photo"
    >
      <span className="relative block h-14 w-14 shrink-0">
        {photo ? (
          <img
            src={photo}
            alt="My profile"
            className="h-14 w-14 rounded-full object-cover ring-2 ring-brand/20"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
          />
        ) : (
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-brand/20 to-brand/5 text-lg font-bold text-brand ring-2 ring-brand/20">{initials}</span>
        )}
        {/* Camera overlay: appears on hover so the photo reads as editable */}
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
          <Camera size={18} className="text-white" aria-hidden="true" />
        </span>
        {/* Small always-visible camera badge so new users discover the feature */}
        <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand text-white shadow ring-2 ring-white group-hover:opacity-0">
          <Camera size={11} aria-hidden="true" />
        </span>
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-gray-800">
          {[me.name, me.surname].filter(Boolean).join(' ') || 'My profile'}
        </span>
        <span className="block text-xs text-gray-400">
          {busy ? 'Uploading…' : me.photoUrl ? (ROLE_LABELS[me.role || ''] || me.role || 'Change photo') : 'Add my photo'}
        </span>
      </span>
      <input type="file" accept="image/*" className="hidden" onChange={onPick} disabled={busy} aria-label="Upload profile photo" />
    </label>
  )
}
