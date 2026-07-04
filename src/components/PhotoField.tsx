import { useState } from 'react'
import { apiUrl, API_ORIGIN } from '../utils/apiBase'
import { resizeImage } from '../utils/image'
import { notifyError } from '../utils/notify'

// Shared "Profile Photo" form field: resize client-side, upload, preview.
// `ensureAuth` runs when no session token exists yet (self-registration flows).
export default function PhotoField({
  label = 'Profile Photo',
  value,
  onChange,
  ensureAuth,
}: {
  label?: string
  value: string
  onChange: (url: string) => void
  ensureAuth?: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const preview = value ? (value.startsWith('/uploads') ? `${API_ORIGIN}${value}` : value) : ''
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input
        type="file"
        accept="image/*"
        className="mt-1 w-full rounded-md border p-2"
        disabled={busy}
        onChange={async (e) => {
          const raw = e.target.files?.[0]
          if (!raw) return
          setBusy(true)
          try {
            const file = await resizeImage(raw, 512)
            const fd = new FormData()
            fd.append('file', file)
            if (!localStorage.getItem('auth:token') && ensureAuth) await ensureAuth()
            const t = localStorage.getItem('auth:token') || ''
            const res = await fetch(apiUrl('/upload'), { method: 'POST', headers: t ? { Authorization: `Bearer ${t}` } : {}, body: fd })
            if (!res.ok) throw new Error('upload failed')
            const data = await res.json()
            onChange(String(data.url || ''))
          } catch (err: any) {
            notifyError(`Photo upload failed: ${err?.message || err}`)
          } finally {
            setBusy(false)
          }
        }}
      />
      {preview && (
        <img src={preview} alt="Profile preview" className="mt-2 h-16 w-16 rounded-full object-cover ring-1 ring-gray-300" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
      )}
    </label>
  )
}
