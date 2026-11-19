import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { CheckCircle, Info, WarningCircle, X, XCircle } from '@phosphor-icons/react'

const ToastCtx = createContext(() => {})
export const useToast = () => useContext(ToastCtx)

const ICONS = {
  success: CheckCircle,
  error: XCircle,
  warn: WarningCircle,
  info: Info,
}

export function ToastProvider({ children }) {
  const [items, setItems] = useState([])
  const seq = useRef(0)

  const dismiss = useCallback((id) => setItems((l) => l.filter((t) => t.id !== id)), [])

  const push = useCallback(
    (kind, title, message, ttl = kind === 'error' ? 7000 : 4000) => {
      const id = ++seq.current
      setItems((l) => [...l.slice(-3), { id, kind, title, message }])
      if (ttl) setTimeout(() => dismiss(id), ttl)
      return id
    },
    [dismiss],
  )

  const api = useMemo(
    () => ({
      push,
      success: (t, m) => push('success', t, m),
      error: (t, m) => push('error', t, m),
      warn: (t, m) => push('warn', t, m),
      info: (t, m) => push('info', t, m),
      dismiss,
    }),
    [push, dismiss],
  )

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => {
          const Icon = ICONS[t.kind] || Info
          return (
            <div key={t.id} className="toast" data-kind={t.kind}>
              <span className="ico">
                <Icon size={18} weight="fill" />
              </span>
              <div className="body">
                <b>{t.title}</b>
                {t.message && <p>{t.message}</p>}
              </div>
              <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
                <X size={14} weight="bold" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastCtx.Provider>
  )
}
