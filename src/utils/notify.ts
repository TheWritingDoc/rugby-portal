export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface ToastDetail {
  id: string
  type: ToastType
  message: string
  duration: number
}

// App-wide notifications. Dispatches an event the <Toaster /> component listens for,
// so any module (including non-React utils) can notify without threading context.
export function notify(message: string, type: ToastType = 'info', duration = 4500) {
  try {
    const detail: ToastDetail = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      message: String(message || ''),
      duration,
    }
    window.dispatchEvent(new CustomEvent('app:toast', { detail }))
  } catch {}
}

export const notifySuccess = (m: string, d?: number) => notify(m, 'success', d)
export const notifyError = (m: string, d?: number) => notify(m, 'error', d)
export const notifyInfo = (m: string, d?: number) => notify(m, 'info', d)
export const notifyWarning = (m: string, d?: number) => notify(m, 'warning', d)
