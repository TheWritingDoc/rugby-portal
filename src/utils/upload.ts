import { apiUrl } from './apiBase'

export async function uploadFile(file: File): Promise<string | null> {
  try {
    const fd = new FormData()
    fd.append('file', file)
    const t = localStorage.getItem('auth:token') || ''
    const res = await fetch(apiUrl('/upload'), { method: 'POST', headers: { ...(t ? { Authorization: `Bearer ${t}` } : {}) }, body: fd })
    if (res.ok) {
      const data = await res.json()
      return data.url as string
    }
  } catch {}
  return await toDataUrl(file)
}

export async function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(file)
  })
}
