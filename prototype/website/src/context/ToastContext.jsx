import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Info, ShieldAlert, X } from 'lucide-react'
import { ToastContext } from './toastStore.js'
import { cn } from '../lib/utils.js'

const ICONS = {
  success: CheckCircle2,
  info: Info,
  warning: AlertTriangle,
  danger: ShieldAlert,
}

const TONES = {
  success: 'border-slate-200 bg-white text-slate-900',
  info: 'border-slate-200 bg-white text-slate-900',
  warning: 'border-brand-200 bg-brand-50 text-brand-900',
  danger: 'border-brand-300 bg-brand-50 text-brand-900',
}

const ICON_TONES = {
  success: 'text-brand-500',
  info: 'text-slate-500',
  warning: 'text-brand-600',
  danger: 'text-brand-700',
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  // Timeouts are tracked so they can all be cleared if the provider unmounts.
  const timers = useRef(new Map())

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const toast = useCallback(
    (message, tone = 'info', duration = 2800) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      setToasts((prev) => [...prev.slice(-2), { id, message, tone }])
      const timer = setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id))
        timers.current.delete(id)
      }, duration)
      timers.current.set(id, timer)
    },
    [],
  )

  useEffect(() => {
    const map = timers.current
    return () => {
      map.forEach((timer) => clearTimeout(timer))
      map.clear()
    }
  }, [])

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-6 z-[100] flex flex-col items-center gap-2 px-4"
        role="status"
        aria-live="polite"
      >
        {toasts.map((t) => {
          const Icon = ICONS[t.tone] ?? Info
          return (
            <div
              key={t.id}
              className={cn(
                'rise-in pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-2xl border px-4 py-3 shadow-lg shadow-slate-900/5',
                TONES[t.tone] ?? TONES.info,
              )}
            >
              <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', ICON_TONES[t.tone] ?? ICON_TONES.info)} aria-hidden="true" />
              <p className="flex-1 text-sm font-medium leading-snug">{t.message}</p>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss notification"
                className="-mr-1 rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

