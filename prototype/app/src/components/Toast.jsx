import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, AlertTriangle, Info } from 'lucide-react'
import { cn } from '../lib/utils.js'

const ToastContext = createContext(null)

const KIND_STYLES = {
  success: { icon: CheckCircle2, classes: 'border-brand-300 bg-brand-50 text-brand-700' },
  warning: { icon: AlertTriangle, classes: 'border-brand-300 bg-brand-50 text-brand-800' },
  danger: { icon: AlertTriangle, classes: 'border-brand-300 bg-brand-50 text-brand-800' },
  info: { icon: Info, classes: 'border-slate-300 bg-slate-100 text-slate-800' },
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const idRef = useRef(0)
  const timersRef = useRef(new Set())

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback(
    (message, kind = 'info', duration = 2800) => {
      idRef.current += 1
      const id = idRef.current
      setToasts((prev) => [...prev.slice(-2), { id, message, kind }])
      const timer = window.setTimeout(() => {
        timersRef.current.delete(timer)
        dismiss(id)
      }, duration)
      timersRef.current.add(timer)
    },
    [dismiss],
  )

  useEffect(() => {
    const timers = timersRef.current
    return () => {
      timers.forEach((t) => window.clearTimeout(t))
      timers.clear()
    }
  }, [])

  const value = useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none absolute inset-x-4 bottom-24 z-[60] flex flex-col items-center gap-2" aria-live="polite">
        {toasts.map((t) => {
          const style = KIND_STYLES[t.kind] ?? KIND_STYLES.info
          const Icon = style.icon
          return (
            <div
              key={t.id}
              className={cn('rise-in flex w-full items-center gap-2.5 rounded-xl border px-3.5 py-2.5 backdrop-blur-md', style.classes)}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <p className="min-w-0 flex-1 text-xs font-semibold leading-snug">{t.message}</p>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
