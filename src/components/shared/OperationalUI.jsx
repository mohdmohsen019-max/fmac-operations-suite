import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowUpRight, CheckCircle2, Info, TriangleAlert, X } from 'lucide-react'
import './OperationalUI.css'

const ICONS = {
  healthy: CheckCircle2,
  attention: TriangleAlert,
  critical: TriangleAlert,
  info: Info,
}

export function OpsSignalStrip({ tone = 'info', eyebrow, title, detail, value, action, onAction }) {
  const Icon = ICONS[tone] || Info
  return (
    <section className={`ops-signal ops-signal--${tone}`} aria-label={title}>
      <span className="ops-signal__icon" aria-hidden="true"><Icon size={18} /></span>
      <div className="ops-signal__copy">
        {eyebrow && <span className="ops-signal__eyebrow">{eyebrow}</span>}
        <strong>{title}</strong>
        {detail && <span>{detail}</span>}
      </div>
      {value != null && <b className="ops-signal__value" dir="ltr">{value}</b>}
      {action && onAction && (
        <button type="button" className="ops-signal__action" onClick={onAction}>
          {action}<ArrowUpRight size={14} aria-hidden="true" />
        </button>
      )}
    </section>
  )
}

export function OpsMiniMetric({ label, value, detail, tone = 'neutral', progress, icon: Icon }) {
  return (
    <div className={`ops-mini-metric ops-mini-metric--${tone}`}>
      <div className="ops-mini-metric__top">
        <span>{label}</span>
        {Icon && <Icon size={15} aria-hidden="true" />}
      </div>
      <strong dir="auto">{value}</strong>
      {detail && <small>{detail}</small>}
      {Number.isFinite(progress) && (
        <span className="ops-mini-metric__track" aria-label={`${Math.round(progress)}%`}>
          <i style={{ transform: `scaleX(${Math.max(0, Math.min(100, progress)) / 100})` }} />
        </span>
      )}
    </div>
  )
}

export function OpsEmptyState({ icon: Icon = CheckCircle2, title, detail, action, onAction, tone = 'neutral' }) {
  return (
    <div className={`ops-empty-state ops-empty-state--${tone}`}>
      <span className="ops-empty-state__icon" aria-hidden="true"><Icon size={22} /></span>
      <div>
        <strong>{title}</strong>
        {detail && <p>{detail}</p>}
      </div>
      {action && onAction && <button type="button" onClick={onAction}>{action}</button>}
    </div>
  )
}

export function OpsDrawer({ open, onClose, title, eyebrow, subtitle, children, footer, size = 'md' }) {
  const closeRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onKey = (event) => { if (event.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', onKey)
    const frame = requestAnimationFrame(() => closeRef.current?.focus())
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  const drawer = (
    <AnimatePresence>
      {open && (
        <div className="ops-drawer-layer" role="presentation">
          <motion.button
            type="button"
            className="ops-drawer-backdrop"
            aria-label="Close details"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.aside
            className={`ops-drawer ops-drawer--${size}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="ops-drawer-title"
            initial={{ opacity: 0, x: '6%' }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: '4%' }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            <header className="ops-drawer__header">
              <div>
                {eyebrow && <span className="ops-drawer__eyebrow">{eyebrow}</span>}
                <h2 id="ops-drawer-title">{title}</h2>
                {subtitle && <p>{subtitle}</p>}
              </div>
              <button ref={closeRef} type="button" className="ops-drawer__close" onClick={onClose} aria-label="Close">
                <X size={18} />
              </button>
            </header>
            <div className="ops-drawer__body">{children}</div>
            {footer && <footer className="ops-drawer__footer">{footer}</footer>}
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  )
  return typeof document === 'undefined' ? drawer : createPortal(drawer, document.body)
}

export function OpsDetailGrid({ items = [] }) {
  return (
    <dl className="ops-detail-grid">
      {items.filter((item) => item && item.label).map((item, index) => (
        <div key={`${item.label}-${index}`} className={item.wide ? 'wide' : ''}>
          <dt>{item.label}</dt>
          <dd dir={item.dir || 'auto'}>{item.value ?? '—'}</dd>
          {item.note && <small>{item.note}</small>}
        </div>
      ))}
    </dl>
  )
}
