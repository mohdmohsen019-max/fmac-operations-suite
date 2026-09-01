import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useLanguage } from '../contexts/LanguageContext'
import './CustomDateInput.css'
import './CustomDateInputPortal.css'

const pad = (value) => String(value).padStart(2, '0')
const toDateKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
const parseDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return Number.isNaN(date.getTime()) ? null : date
}
const startOfMonth = (value) => {
  const date = parseDate(value) || new Date()
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

/**
 * Shared application date picker. It deliberately avoids the browser's native
 * picker so date selection looks and behaves consistently across FMAC modules.
 */
export default function CustomDateInput({
  value = '', onChange, label, min, max, className = '', placeholder,
  disabled = false, required = false, clearable = true, ariaLabel,
}) {
  const { t, locale, lang } = useLanguage()
  const rootRef = useRef(null)
  const popoverRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState(() => startOfMonth(value))
  const [position, setPosition] = useState(null)
  const selected = parseDate(value)
  const todayKey = toDateKey(new Date())
  const weekdayNames = useMemo(() => {
    const base = new Date(2026, 7, 2) // Sunday
    return Array.from({ length: 7 }, (_, index) => new Intl.DateTimeFormat(locale || 'en-GB', { weekday: 'narrow' }).format(new Date(base.getFullYear(), base.getMonth(), base.getDate() + index)))
  }, [locale])
  const monthLabel = useMemo(() => new Intl.DateTimeFormat(locale || 'en-GB', { month: 'long', year: 'numeric' }).format(month), [locale, month])
  const displayValue = useMemo(() => selected
    ? new Intl.DateTimeFormat(locale || 'en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(selected)
    : (placeholder || t('Select date', 'اختر التاريخ')), [locale, placeholder, selected, t])

  useEffect(() => {
    if (selected) setMonth(startOfMonth(value))
  }, [value])

  useEffect(() => {
    const closeOnOutside = (event) => {
      if (!rootRef.current?.contains(event.target) && !popoverRef.current?.contains(event.target)) setOpen(false)
    }
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [])

  useEffect(() => {
    if (!open) return undefined
    const updatePosition = () => {
      const bounds = rootRef.current?.getBoundingClientRect()
      if (!bounds) return
      const width = 286
      setPosition({
        top: Math.min(bounds.bottom + 7, window.innerHeight - 356),
        left: Math.max(12, Math.min(bounds.left, window.innerWidth - width - 12)),
      })
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open])

  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1)
    const start = new Date(first)
    start.setDate(first.getDate() - first.getDay())
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start)
      date.setDate(start.getDate() + index)
      const key = toDateKey(date)
      return { date, key, inMonth: date.getMonth() === month.getMonth() }
    })
  }, [month])

  const isDisabled = (key) => Boolean((min && key < min) || (max && key > max))
  const choose = (key) => {
    if (isDisabled(key)) return
    onChange?.(key)
    setOpen(false)
  }

  return <div ref={rootRef} className={`custom-date-container ${className}`.trim()} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
    {label && <span className="custom-date-label">{label}{required && <em aria-hidden="true"> *</em>}</span>}
    <div className="custom-date-shell">
      <button
        type="button"
        className={`custom-date-trigger${open ? ' is-open' : ''}${value ? '' : ' is-empty'}`}
        onClick={() => !disabled && setOpen((current) => !current)}
        disabled={disabled}
        aria-label={ariaLabel || label || t('Choose date', 'اختر التاريخ')}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <CalendarDays size={16} aria-hidden="true" />
        <span>{displayValue}</span>
      </button>
      {clearable && value && !disabled && <button type="button" className="custom-date-clear" onClick={() => onChange?.('')} aria-label={t('Clear date', 'مسح التاريخ')}><X size={13} /></button>}
    </div>
    {open && position && createPortal(<div ref={popoverRef} className="custom-date-popover" style={position} role="dialog" aria-label={label || t('Calendar', 'التقويم')}>
      <div className="custom-date-calendar-head">
        <button type="button" onClick={() => setMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))} aria-label={t('Previous month', 'الشهر السابق')}><ChevronLeft size={16} /></button>
        <strong>{monthLabel}</strong>
        <button type="button" onClick={() => setMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))} aria-label={t('Next month', 'الشهر التالي')}><ChevronRight size={16} /></button>
      </div>
      <div className="custom-date-weekdays">{weekdayNames.map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div>
      <div className="custom-date-days">{days.map(({ date, key, inMonth }) => <button key={key} type="button" disabled={isDisabled(key)} onClick={() => choose(key)} className={`${inMonth ? '' : ' is-outside'}${key === value ? ' is-selected' : ''}${key === todayKey ? ' is-today' : ''}`.trim()} aria-label={new Intl.DateTimeFormat(locale || 'en-GB', { dateStyle: 'full' }).format(date)} aria-pressed={key === value}>{date.getDate()}</button>)}</div>
      <div className="custom-date-calendar-foot"><button type="button" onClick={() => { onChange?.(''); setOpen(false) }}>{t('Clear', 'مسح')}</button><button type="button" onClick={() => { const key = toDateKey(new Date()); if (!isDisabled(key)) choose(key) }}>{t('Today', 'اليوم')}</button></div>
    </div>, document.body)}
  </div>
}
