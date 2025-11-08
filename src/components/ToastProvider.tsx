import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

export type Toast = {
  id: string
  title?: string
  description?: string
  variant?: 'default' | 'success' | 'error'
  duration?: number
}

type ToastContextValue = {
  show: (t: Omit<Toast, 'id'>) => void
  dismiss: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const show = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).slice(2)
    const toast: Toast = { id, duration: 2500, variant: 'default', ...t }
    setToasts((prev) => [...prev, toast])
    if (toast.duration && toast.duration > 0) {
      window.setTimeout(() => dismiss(id), toast.duration)
    }
  }, [dismiss])

  const value = useMemo(() => ({ show, dismiss }), [show, dismiss])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed z-50 bottom-4 right-4 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={[
              'min-w-[240px] max-w-sm rounded-xl px-4 py-3 shadow-lg border text-sm',
              t.variant === 'success' ? 'bg-emerald-600 text-white border-emerald-700' : '',
              t.variant === 'error' ? 'bg-red-600 text-white border-red-700' : '',
              (!t.variant || t.variant === 'default') ? 'bg-white text-slate-800 border-slate-200' : '',
            ].join(' ')}
          >
            {t.title && <div className="font-semibold">{t.title}</div>}
            {t.description && <div className="text-slate-600/90 text-xs">{t.description}</div>}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>')
  return ctx
}
