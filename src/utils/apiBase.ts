export const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined) ||
  (import.meta.env.DEV ? 'http://localhost:4000/api' : '/api')

export const API_ORIGIN = (() => {
  try {
    return new URL(API_BASE, window.location.origin).origin
  } catch {
    return ''
  }
})()

export function apiUrl(path: string) {
  return `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`
}
