import { useEffect, useState } from 'react'
import { CheckCircle, XCircle, Info, AlertTriangle, X } from 'lucide-react'
import type { ToastDetail, ToastType } from '../utils/notify'

const STYLES: Record<ToastType, { bar: string; icon: JSX.Element }> = {
  success: { bar: 'border-l-green-500', icon: <CheckCircle className="h-5 w-5 text-green-500" /> },
  error: { bar: 'border-l-red-500', icon: <XCircle className="h-5 w-5 text-red-500" /> },
  warning: { bar: 'border-l-amber-500', icon: <AlertTriangle className="h-5 w-5 text-amber-500" /> },
  info: { bar: 'border-l-blue-500', icon: <Info className="h-5 w-5 text-blue-500" /> },
}

export default function Toaster() {
  const [toasts, setToasts] = useState<ToastDetail[]>([])

  useEffect(() => {
    const timers = new Map<string, ReturnType<typeof setTimeout>>()
    function onToast(e: Event) {
      const detail = (e as CustomEvent).detail as ToastDetail
      if (!detail?.message) return
      setToasts((prev) => [...prev.slice(-4), detail])
      timers.set(detail.id, setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== detail.id))
        timers.delete(detail.id)
      }, detail.duration || 4500))
    }
    window.addEventListener('app:toast', onToast)
    return () => {
      window.removeEventListener('app:toast', onToast)
      timers.forEach((t) => clearTimeout(t))
    }
  }, [])

  if (toasts.length === 0) return null
  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(24rem,calc(100vw-2rem))] flex-col-reverse gap-2">
      {toasts.map((t) => {
        const s = STYLES[t.type] || STYLES.info
        return (
          <div key={t.id} role="status" data-testid={`toast-${t.type}`}
            className={`pointer-events-auto flex items-start gap-3 rounded-lg border border-l-4 ${s.bar} bg-white p-3 shadow-lg animate-[toast-in_.18s_ease-out]`}>
            <div className="mt-0.5 shrink-0">{s.icon}</div>
            <div className="flex-1 text-sm text-gray-800">{t.message}</div>
            <button aria-label="Dismiss notification" className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}>
              <X className="h-4 w-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
