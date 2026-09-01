/**
 * Operations Strategy & Excellence — /strategy
 *
 * Scoped to the Operations Department: only KPIs owned by the operations unit
 * appear here. The register drives:
 *  • Overview     — excellence score, strategic goals, checkpoints, initiatives
 *  • KPI Register — searchable, filterable, live + manual, history, targets, CSV
 *  • Initiatives  — the strategic initiatives with operations KPIs behind them
 *  • Reports      — one-click printable scorecard, portfolio, executive brief
 *
 * Readings live in `strategy_readings` (doc `${kpiId}__${periodKey}`);
 * target overrides in `strategy_settings/targets`. Values are never negative.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  Target, Zap, RefreshCw, ChevronDown, PenLine, X, CalendarClock,
  ClipboardList, Rocket, FileText, Activity, Printer, Search, Download, Flag,
  Award, Paperclip, Upload, Trash2, Plus, UserRound,
} from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { db, storage } from '../firebase'
import { collection, getDocs, doc, getDoc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'
import { ref as sRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import * as XLSX from 'xlsx'
import { useLanguage } from '../contexts/LanguageContext'
import { usePermissions } from '../hooks/usePermissions'
import ModuleLock from './shared/ModuleLock'
import exportCsv from '../utils/exportCsv'
import {
  KPIS as ALL_KPIS, GOALS, NATURES, NATURE_WEIGHT, INITIATIVES, FREQ_LABEL, def,
  periodKey, prevPeriodKey, periodRange, attainment, statusOf,
  OWNERS, ownerLabel,
} from './strategy/kpiCatalog'
import { computeLiveKpis } from './strategy/liveKpis'
import './StrategyModule.css'

/* This module is the Operations Department's cockpit — operations KPIs only.
   The full list is the shipped catalog PLUS any admin-added custom KPIs
   (loaded from Firestore), computed reactively inside the component below —
   see the `KPIS`/`KPI_IDS` useMemo. */
const OPS_UNIT = 'operations'

/* ── helpers ─────────────────────────────────────────────────────── */

const STATUS_META = {
  above:    { en: 'Above target',    ar: 'فوق المستهدف',   cls: 'above' },
  ontrack:  { en: 'On target',       ar: 'على المستهدف',   cls: 'ok' },
  atrisk:   { en: 'Needs attention', ar: 'تحتاج متابعة',   cls: 'warn' },
  offtrack: { en: 'Behind',          ar: 'متأخر',          cls: 'risk' },
  nodata:   { en: 'Reading overdue', ar: 'قراءة مستحقة',   cls: 'warn' },
  notdue:   { en: 'Not due yet',     ar: 'لم يحن موعدها',  cls: 'idle' },
  notarget: { en: 'No target',       ar: 'بلا مستهدف',     cls: 'idle' },
}

const PRINT_STATUS_HEX = {
  above: '#2563eb', ontrack: '#0c7a58', atrisk: '#a17708', offtrack: '#c23934',
  nodata: '#a17708', notdue: '#6f6f78', notarget: '#6f6f78',
}

const natureOf = (id) => NATURES.find(n => n.id === id)

function friendlyPeriod(freq, key) {
  const k = key || periodKey(freq)
  const y = k.slice(0, 4)
  if (freq === 'monthly') return `${k.slice(6)}/${y}`
  if (freq === 'annual') return y
  return `${k.slice(5)} · ${y}`
}

function fmtVal(kpi, v, locale) {
  if (v == null) return '—'
  const n = Math.max(0, Number(v)).toLocaleString(locale, { maximumFractionDigits: 1 })
  return kpi.ut === '%' ? `${n}%` : n
}

const UT_LABEL = {
  '%': { en: '%', ar: '%' },
  count: { en: 'count', ar: 'عدد' },
  days: { en: 'days', ar: 'أيام' },
  hours: { en: 'hours', ar: 'ساعات' },
}

/* Build per-KPI view models from live results + manual readings + overrides.
   Unit overrides (strategy_settings/units) swap the kpi's display unit. */
function buildModels(kpis, live, readings, targets, units) {
  return kpis.map(baseKpi => {
    const utOv = units?.[baseKpi.id]
    const kpi = utOv && utOv !== baseKpi.ut ? { ...baseKpi, ut: utOv } : baseKpi
    const target = targets?.[kpi.id] ?? kpi.target
    let value = null, detail = null, prev = null, valuePeriod = null
    if (kpi.source === 'live') {
      const r = live?.[kpi.calc]
      if (r) { value = r.value; detail = r }
    } else {
      // The latest recorded reading is the KPI's current standing — a filled
      // Q1/Q2 must not read as "not measured" just because this quarter is
      // still empty. prev = the reading before the latest.
      const mine = Object.values(readings || {})
        .filter(r => r.kpiId === kpi.id && r.value != null)
        .sort((a, b) => String(b.periodKey).localeCompare(String(a.periodKey)))
      if (mine[0]) { value = Math.max(0, Number(mine[0].value)); valuePeriod = mine[0].periodKey }
      if (mine[1]) prev = Math.max(0, Number(mine[1].value))
    }
    // Due-date model: only periods that have ENDED can be overdue.
    const missing = kpi.source === 'manual'
      ? completedPeriodKeys(kpi.freq).filter(k => readings?.[`${kpi.id}__${k}`]?.value == null)
      : []
    const nextDueMs = periodRange(kpi.freq)[1].getTime()
    const att = attainment(kpi, value, target)
    const status = att != null ? statusOf(att)
      : value != null && target == null ? 'notarget'
      : missing.length > 0 ? 'nodata'
      : 'notdue'
    return { kpi, target, value, detail, prev, att, status, valuePeriod, missing, nextDueMs }
  })
}

function excellenceScore(models) {
  const measured = models.filter(m => m.att != null)
  if (!measured.length) return null
  const w = (m) => NATURE_WEIGHT[m.kpi.nature] || 1
  const wSum = measured.reduce((s, m) => s + w(m), 0)
  return Math.round(measured.reduce((s, m) => s + Math.min(100, m.att) * w(m), 0) / wSum)
}

function buildCheckpoints(kpis) {
  const now = Date.now()
  return ['monthly', 'quarterly', 'semiannual', 'annual'].map(freq => {
    const [, end] = periodRange(freq)
    const n = kpis.filter(k => k.freq === freq).length
    return { freq, end, days: Math.max(0, Math.ceil((end.getTime() - now) / 86400000)), n }
  }).filter(c => c.n > 0).sort((a, b) => a.days - b.days)
}

/* ── module-level components (never defined during render) ──────── */

function ScoreRing({ score, size = 148 }) {
  const r = (size - 14) / 2
  const c = 2 * Math.PI * r
  const filled = score == null ? 0 : (Math.min(100, score) / 100) * c
  return (
    <div className="str-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke="var(--theme-border)" strokeWidth="10" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke="var(--theme-accent)" strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${filled} ${c - filled}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div className="str-ring-center" dir="ltr">
        {score == null ? '—' : score}
        {score != null && <span>/100</span>}
      </div>
    </div>
  )
}

function StatusChip({ status, t }) {
  const m = STATUS_META[status]
  return <span className={`str-chip str-chip--${m.cls}`}>{t(m.en, m.ar)}</span>
}

function KpiRow({ m, lang, t, locale, canManage, expanded, onToggle, onRecord, onDeleteKpi, history }) {
  const { kpi } = m
  const [confirmDelKpi, setConfirmDelKpi] = useState(false)
  const name = lang === 'ar' ? kpi.ar : kpi.en
  const nature = natureOf(kpi.nature)
  return (
    <div className={`str-kpi${expanded ? ' str-kpi--open' : ''}`}>
      <button className="str-kpi-row" onClick={onToggle} aria-expanded={expanded}>
        <div className="str-kpi-main">
          <span className="str-kpi-name" dir="auto">{name}</span>
          <span className="str-kpi-meta">
            {kpi.source !== 'manual' && (
              <span className="str-live"><Zap size={10} strokeWidth={2.4} />{t('Live', 'مباشر')}</span>
            )}
            {kpi.custom && (
              <span className="str-custom-tag">{t('Custom', 'مخصص')}</span>
            )}
            <span className="str-nature" dir="auto">{lang === 'ar' ? nature.ar : nature.en}</span>
            <span>{t(FREQ_LABEL[kpi.freq].en, FREQ_LABEL[kpi.freq].ar)}</span>
            <span dir="auto">{t(UT_LABEL[kpi.ut].en, UT_LABEL[kpi.ut].ar)}</span>
            {ownerLabel(kpi.owner, lang) && (
              <span className="str-owner" dir="auto" title={t('Measurement owner', 'مسؤول القياس')}>
                <UserRound size={10} strokeWidth={2.2} />{ownerLabel(kpi.owner, lang)}
              </span>
            )}
          </span>
        </div>
        <div className="str-kpi-nums" dir="ltr">
          <span className="str-kpi-val">{fmtVal(kpi, m.value, locale)}</span>
          <span className="str-kpi-target">/ {m.target == null ? '—' : fmtVal(kpi, m.target, locale)}</span>
        </div>
        <div className="str-kpi-barwrap">
          <div className="str-bar">
            <div className={`str-bar-fill str-bar-fill--${STATUS_META[m.status].cls}`}
              style={{ width: `${m.att == null ? 0 : Math.min(100, m.att)}%` }} />
          </div>
        </div>
        <StatusChip status={m.status} t={t} />
        <ChevronDown size={15} className="str-kpi-caret" />
      </button>

      {expanded && (
        <div className="str-kpi-detail">
          <p className="str-formula" dir="auto"><b>{t('Formula', 'المعادلة')}:</b> {kpi.formulaAr}</p>
          {kpi.dir === 'down' && (
            <p dir="auto">{t('Lower is better for this indicator.', 'القيمة الأقل أفضل لهذا المؤشر.')}</p>
          )}
          {m.detail && (
            <p className="str-livecalc" dir="auto">
              <Zap size={11} strokeWidth={2.4} />
              {t('Computed now from the suite', 'محسوب الآن من النظام')}:{' '}
              <span dir="ltr">{m.detail.num ?? '—'} / {m.detail.den ?? '—'}</span>{' '}
              — {lang === 'ar' ? m.detail.noteAr : m.detail.noteEn}
            </p>
          )}
          {kpi.source === 'manual' && (
            <p className="str-livecalc" dir="auto">
              <CalendarClock size={11} strokeWidth={2.2} />
              {m.valuePeriod
                ? <>{t('Latest reading', 'أحدث قراءة')}: <span dir="ltr">{friendlyPeriod(kpi.freq, m.valuePeriod)}</span></>
                : <>{t('No readings yet', 'لا قراءات بعد')}</>}
              {m.prev != null && (
                <> · {t('Previous', 'السابقة')}: <span dir="ltr">{fmtVal(kpi, m.prev, 'en')}</span></>
              )}
              {' · '}{t('Next due date', 'تاريخ الاستحقاق القادم')}:{' '}
              <span dir="ltr">{new Date(m.nextDueMs).toLocaleDateString(locale)}</span>
              {' '}({friendlyPeriod(kpi.freq)})
            </p>
          )}
          {kpi.source === 'manual' && m.missing.length > 0 && (
            <p className="str-due-line" dir="auto">
              <Flag size={11} strokeWidth={2.2} />
              {t('Overdue readings', 'قراءات مستحقة')}:{' '}
              <span dir="ltr">{m.missing.map(k => friendlyPeriod(kpi.freq, k)).join(' · ')}</span>
            </p>
          )}
          {history.filter(h => h.evidence?.length).map(h => (
            <div key={h.periodKey} className="str-ev-list">
              <span className="str-hist-label">
                <Paperclip size={11} strokeWidth={2} /> {friendlyPeriod(kpi.freq, h.periodKey)}:
              </span>
              {h.evidence.map((e, i) => (
                <a key={i} className="str-ev-link" href={e.url} target="_blank" rel="noreferrer" dir="auto">
                  {e.name}
                </a>
              ))}
            </div>
          ))}
          {history.length > 0 && (
            <div className="str-hist">
              <span className="str-hist-label">{t('Reading history', 'سجل القراءات')}:</span>
              {history.map(h => (
                <span key={h.periodKey} className="str-hist-chip" dir="ltr"
                  title={h.note || undefined}>
                  {friendlyPeriod(kpi.freq, h.periodKey)} · {fmtVal(kpi, h.value, 'en')}
                  {h.evidence?.length ? ` · 📎${h.evidence.length}` : ''}
                </span>
              ))}
            </div>
          )}
          {canManage && (
            <div className="str-kpi-actions">
              <button className="str-btn str-btn--ink" onClick={onRecord}>
                <PenLine size={13} />
                {kpi.source === 'manual'
                  ? t('Record reading', 'تسجيل قراءة')
                  : t('Set target', 'تحديد المستهدف')}
              </button>
              {kpi.custom && (
                confirmDelKpi ? (
                  <button className="str-btn str-btn--danger" onClick={() => onDeleteKpi(kpi.id)}>
                    <Trash2 size={13} /> {t('Confirm delete KPI', 'تأكيد حذف المؤشر')}
                  </button>
                ) : (
                  <button className="str-btn str-btn--danger-ghost" onClick={() => setConfirmDelKpi(true)}>
                    <Trash2 size={13} /> {t('Delete this KPI', 'حذف هذا المؤشر')}
                  </button>
                )
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function RecordModal({ m, t, lang, onClose, onSave, onDelete, saving, error, history }) {
  const manual = m.kpi.source === 'manual'
  const [confirmDel, setConfirmDel] = useState(false)
  const [periodOptions] = useState(() => buildPeriodOptions(m.kpi.freq))
  const [period, setPeriod] = useState(() => periodKey(m.kpi.freq))
  const readingFor = (pk) => (history || []).find(h => h.periodKey === pk)
  const [val, setVal] = useState(() => {
    const ex = (history || []).find(h => h.periodKey === periodKey(m.kpi.freq))
    return manual && ex?.value != null ? String(ex.value) : ''
  })
  const [tgt, setTgt] = useState(m.target != null ? String(m.target) : '')
  const [note, setNote] = useState(() => {
    const ex = (history || []).find(h => h.periodKey === periodKey(m.kpi.freq))
    return ex?.note || ''
  })
  const [files, setFiles] = useState([])
  const [fileErr, setFileErr] = useState('')
  const [ut, setUt] = useState(m.kpi.ut)
  const existingEvidence = readingFor(period)?.evidence || []
  const name = lang === 'ar' ? m.kpi.ar : m.kpi.en

  const pickPeriod = (pk) => {
    setPeriod(pk)
    const ex = readingFor(pk)
    setVal(ex?.value != null ? String(ex.value) : '')
    setNote(ex?.note || '')
    setFiles([])
    setFileErr('')
    setConfirmDel(false)
  }
  const valNum = Number(val)
  const tgtNum = Number(tgt)
  const valOk = !manual || (val !== '' && !Number.isNaN(valNum) && valNum >= 0)
  const tgtOk = tgt === '' || (!Number.isNaN(tgtNum) && tgtNum >= 0)

  const pickFiles = (e) => {
    const picked = [...(e.target.files || [])]
    e.target.value = ''
    const merged = [...files]
    let err = ''
    for (const f of picked) {
      if (f.size > 15 * 1024 * 1024) { err = t('Each file must be under 15 MB.', 'يجب ألا يتجاوز حجم الملف 15 ميغابايت.'); continue }
      if (merged.length >= 5) { err = t('Up to 5 files per reading.', 'بحد أقصى 5 ملفات لكل قراءة.'); break }
      merged.push(f)
    }
    setFiles(merged)
    setFileErr(err)
  }

  return (
    <div className="str-modal-backdrop" onMouseDown={onClose}>
      <div className="str-modal" onMouseDown={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="str-modal-head">
          <h3 dir="auto">{name}</h3>
          <button className="str-x" onClick={onClose} aria-label={t('Close', 'إغلاق')}><X size={15} /></button>
        </div>
        <p className="str-modal-sub" dir="auto">
          {!manual && <>{t('Live KPI — the value is computed by the suite.', 'مؤشر مباشر — القيمة تُحسب من النظام.')}{' '}</>}
          {t('Unit', 'الوحدة')}: <b>{t(UT_LABEL[ut].en, UT_LABEL[ut].ar)}</b>
          {m.kpi.dir === 'down' && <> · {t('lower is better', 'الأقل أفضل')}</>}
        </p>
        {manual && (
          <div className="str-field">
            <span>{t('Period', 'الفترة')}</span>
            <div className="str-period-chips">
              {periodOptions.map(pk => (
                <button key={pk} type="button"
                  className={`str-period-chip${period === pk ? ' active' : ''}${readingFor(pk) ? ' has-reading' : ''}`}
                  onClick={() => pickPeriod(pk)} dir="ltr">
                  {friendlyPeriod(m.kpi.freq, pk)}
                  {readingFor(pk) && <span className="str-period-dot" />}
                </button>
              ))}
            </div>
          </div>
        )}
        {manual && (
          <label className="str-field">
            <span>{t('Value (never negative)', 'القيمة (غير سالبة)')}</span>
            <input type="number" inputMode="decimal" min="0" value={val} autoFocus
              onChange={e => setVal(e.target.value)} dir="ltr" />
          </label>
        )}
        <label className="str-field">
          <span>{t('Target', 'المستهدف')}{m.kpi.target == null && m.target == null ? ` — ${t('not set in the register', 'غير محدد في السجل')}` : ''}</span>
          <input type="number" inputMode="decimal" min="0" value={tgt}
            onChange={e => setTgt(e.target.value)} dir="ltr" />
        </label>
        <div className="str-field">
          <span>{t('Measurement unit', 'وحدة القياس')}</span>
          <div className="str-period-chips">
            {Object.keys(UT_LABEL).map(u => (
              <button key={u} type="button"
                className={`str-period-chip${ut === u ? ' active' : ''}`}
                onClick={() => setUt(u)}>
                {t(UT_LABEL[u].en, UT_LABEL[u].ar)}
              </button>
            ))}
          </div>
        </div>
        {manual && (
          <label className="str-field">
            <span>{t('Text evidence / note (optional)', 'دليل نصي / ملاحظة (اختياري)')}</span>
            <input type="text" value={note} onChange={e => setNote(e.target.value)} dir="auto"
              placeholder={t('e.g. survey link, report reference…', 'مثال: رابط الاستبيان، مرجع التقرير…')} />
          </label>
        )}
        {manual && (
          <div className="str-field">
            <span>{t('Evidence files — PDF, image, Excel…', 'ملفات الأدلة — PDF، صورة، Excel…')}</span>
            <label className="str-btn str-upload">
              <Upload size={13} />
              {t('Attach files', 'إرفاق ملفات')}
              <input type="file" multiple hidden onChange={pickFiles}
                accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.xlsx,.xls,.csv,.doc,.docx,.txt" />
            </label>
            {files.length > 0 && (
              <div className="str-files">
                {files.map((f, i) => (
                  <div key={i} className="str-file-row" dir="auto">
                    <Paperclip size={11} strokeWidth={2} />
                    <span className="str-file-name">{f.name}</span>
                    <span className="str-file-size" dir="ltr">{(f.size / 1024 / 1024).toFixed(1)}MB</span>
                    <button type="button" className="str-x" onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {existingEvidence?.length > 0 && (
              <>
                <p className="str-file-existing" dir="auto">
                  {t('Already attached to this period (click to open) — new files are added alongside:',
                     'مرفقة مسبقاً لهذه الفترة (اضغط للفتح) — الملفات الجديدة تُضاف إليها:')}
                </p>
                <div className="str-ev-list">
                  {existingEvidence.map((e, i) => (
                    <a key={i} className="str-ev-link" href={e.url} target="_blank" rel="noreferrer" dir="auto">
                      {e.name}
                    </a>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
        {(fileErr || error) && (
          <p className="str-msg-err" dir="auto">{fileErr || error}</p>
        )}
        <div className="str-modal-actions">
          {manual && readingFor(period) && (
            confirmDel ? (
              <button className="str-btn str-btn--danger" disabled={saving}
                onClick={() => onDelete(period)}>
                <Trash2 size={13} /> {saving ? t('Deleting…', 'جارٍ الحذف…') : t('Confirm delete', 'تأكيد الحذف')}
              </button>
            ) : (
              <button className="str-btn str-btn--danger-ghost" disabled={saving}
                onClick={() => setConfirmDel(true)}>
                <Trash2 size={13} /> {t('Delete reading', 'حذف القراءة')}
              </button>
            )
          )}
          <span style={{ flex: 1 }} />
          <button className="str-btn" onClick={onClose}>{t('Cancel', 'إلغاء')}</button>
          <button className="str-btn str-btn--ink" disabled={saving || !valOk || !tgtOk}
            onClick={() => onSave(manual && val !== '' ? Math.max(0, valNum) : null,
                                  tgt !== '' ? Math.max(0, tgtNum) : null, note, files, period, ut)}>
            {saving ? t('Saving…', 'جارٍ الحفظ…') : t('Save', 'حفظ')}
          </button>
        </div>
      </div>
    </div>
  )
}

const FREQ_OPTIONS = ['monthly', 'quarterly', 'semiannual', 'annual']
const DIR_OPTIONS = [
  { id: 'up', en: 'Higher is better', ar: 'الأعلى أفضل' },
  { id: 'down', en: 'Lower is better', ar: 'الأقل أفضل' },
]

/* Add a club-defined KPI — always Operations, always manual (no live
   calculator exists for something just typed into a form). The official
   2026 scorecard slots (#1-8) stay reserved: this form has no "featured"
   field, so a custom KPI can never claim one. */
function NewKpiModal({ t, lang, onClose, onSave, saving, error }) {
  const [en, setEn] = useState('')
  const [ar, setAr] = useState('')
  const [nature, setNature] = useState('operational')
  const [goal, setGoal] = useState('')
  const [freq, setFreq] = useState('quarterly')
  const [dir, setDir] = useState('up')
  const [ut, setUt] = useState('%')
  const [target, setTarget] = useState('')
  const [formula, setFormula] = useState('')
  const [initiative, setInitiative] = useState('')

  const targetNum = Number(target)
  const targetOk = target === '' || (!Number.isNaN(targetNum) && targetNum >= 0)
  const canSave = en.trim() && ar.trim() && formula.trim() && goal && targetOk

  return (
    <div className="str-modal-backdrop" onMouseDown={onClose}>
      <div className="str-modal str-modal--wide" onMouseDown={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="str-modal-head">
          <h3 dir="auto">{t('New KPI', 'مؤشر جديد')}</h3>
          <button className="str-x" onClick={onClose} aria-label={t('Close', 'إغلاق')}><X size={15} /></button>
        </div>
        <p className="str-modal-sub" dir="auto">
          {t('Added to the Operations register — readings, targets, and evidence work exactly like the built-in KPIs.',
             'تُضاف إلى سجل مؤشرات العمليات — القراءات والمستهدفات والأدلة تعمل تماماً كالمؤشرات الأساسية.')}
        </p>

        <label className="str-field">
          <span>{t('Name (English)', 'الاسم (إنجليزي)')}</span>
          <input type="text" value={en} autoFocus onChange={e => setEn(e.target.value)} dir="ltr"
            placeholder={t('e.g. Player equipment turnaround time', 'مثال: زمن تجهيز معدات اللاعبين')} />
        </label>
        <label className="str-field">
          <span>{t('Name (Arabic)', 'الاسم (عربي)')}</span>
          <input type="text" value={ar} onChange={e => setAr(e.target.value)} dir="rtl"
            placeholder="مثال: زمن تجهيز معدات اللاعبين" />
        </label>

        <div className="str-field">
          <span>{t('Nature', 'طبيعة المؤشر')}</span>
          <div className="str-period-chips">
            {NATURES.map(n => (
              <button key={n.id} type="button"
                className={`str-period-chip${nature === n.id ? ' active' : ''}`}
                onClick={() => setNature(n.id)}>
                {t(n.en, n.ar)}
              </button>
            ))}
          </div>
        </div>

        <div className="str-field">
          <span>{t('Strategic goal', 'الهدف الاستراتيجي')}</span>
          <div className="str-period-chips">
            {GOALS.map(g => (
              <button key={g.id} type="button"
                className={`str-period-chip${goal === g.id ? ' active' : ''}`}
                onClick={() => setGoal(g.id)} dir="auto">
                {lang === 'ar' ? g.ar : g.en}
              </button>
            ))}
          </div>
        </div>

        <div className="str-field">
          <span>{t('Measurement cycle', 'دورية القياس')}</span>
          <div className="str-period-chips">
            {FREQ_OPTIONS.map(f => (
              <button key={f} type="button"
                className={`str-period-chip${freq === f ? ' active' : ''}`}
                onClick={() => setFreq(f)}>
                {t(FREQ_LABEL[f].en, FREQ_LABEL[f].ar)}
              </button>
            ))}
          </div>
        </div>

        <div className="str-field">
          <span>{t('Direction', 'اتجاه المؤشر')}</span>
          <div className="str-period-chips">
            {DIR_OPTIONS.map(d => (
              <button key={d.id} type="button"
                className={`str-period-chip${dir === d.id ? ' active' : ''}`}
                onClick={() => setDir(d.id)}>
                {t(d.en, d.ar)}
              </button>
            ))}
          </div>
        </div>

        <div className="str-field">
          <span>{t('Measurement unit', 'وحدة القياس')}</span>
          <div className="str-period-chips">
            {Object.keys(UT_LABEL).map(u => (
              <button key={u} type="button"
                className={`str-period-chip${ut === u ? ' active' : ''}`}
                onClick={() => setUt(u)}>
                {t(UT_LABEL[u].en, UT_LABEL[u].ar)}
              </button>
            ))}
          </div>
        </div>

        <label className="str-field">
          <span>{t('Target (optional — can be set later)', 'المستهدف (اختياري — يمكن تحديده لاحقاً)')}</span>
          <input type="number" inputMode="decimal" min="0" value={target}
            onChange={e => setTarget(e.target.value)} dir="ltr" />
        </label>

        <label className="str-field">
          <span>{t('Formula / how it is measured', 'المعادلة / طريقة القياس')}</span>
          <textarea value={formula} onChange={e => setFormula(e.target.value)} dir="auto" rows={2}
            placeholder={t('e.g. items processed ÷ items received', 'مثال: العناصر المُجهّزة ÷ العناصر المستلمة')} />
        </label>

        <div className="str-field">
          <span>{t('Linked initiative (optional)', 'مبادرة مرتبطة (اختياري)')}</span>
          <div className="str-period-chips">
            <button type="button" className={`str-period-chip${!initiative ? ' active' : ''}`}
              onClick={() => setInitiative('')}>
              {t('None', 'بلا')}
            </button>
            {INITIATIVES.map(i => (
              <button key={i.id} type="button"
                className={`str-period-chip${initiative === i.id ? ' active' : ''}`}
                onClick={() => setInitiative(i.id)} dir="auto">
                {lang === 'ar' ? i.ar : i.en}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="str-msg-err" dir="auto">{error}</p>}

        <div className="str-modal-actions">
          <button className="str-btn" onClick={onClose}>{t('Cancel', 'إلغاء')}</button>
          <button className="str-btn str-btn--ink" disabled={saving || !canSave}
            onClick={() => onSave({
              en: en.trim(), ar: ar.trim(), nature, goal, freq, dir, ut,
              target: target !== '' ? Math.max(0, targetNum) : null,
              formula: formula.trim(), initiative: initiative || null,
            })}>
            {saving ? t('Adding…', 'جارٍ الإضافة…') : t('Add KPI', 'إضافة المؤشر')}
          </button>
        </div>
      </div>
    </div>
  )
}

/* Periods of the current fiscal year that have ENDED — their readings are due.
   On 20 Jul: monthly → Jan..Jun, quarterly → Q1..Q2, semiannual → H1,
   annual → none (FY reading is due only after 31 Dec). */
function completedPeriodKeys(freq, d = new Date()) {
  const y = d.getFullYear()
  const m = d.getMonth()
  const keys = []
  if (freq === 'monthly') {
    for (let i = 0; i < m; i++) keys.push(`${y}-M${String(i + 1).padStart(2, '0')}`)
  } else if (freq === 'quarterly') {
    const q = Math.floor(m / 3)
    for (let i = 1; i <= q; i++) keys.push(`${y}-Q${i}`)
  } else if (freq === 'semiannual') {
    if (m >= 6) keys.push(`${y}-H1`)
  }
  return keys
}

/* Selectable periods for a reading: every period of the current fiscal year
   up to and including the one we're in (no future readings). Newest first. */
function buildPeriodOptions(freq) {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const opts = []
  if (freq === 'monthly') {
    for (let i = 0; i <= m; i++) opts.push(`${y}-M${String(i + 1).padStart(2, '0')}`)
  } else if (freq === 'quarterly') {
    const q = Math.floor(m / 3) + 1
    for (let i = 1; i <= q; i++) opts.push(`${y}-Q${i}`)
  } else if (freq === 'semiannual') {
    const h = m < 6 ? 1 : 2
    for (let i = 1; i <= h; i++) opts.push(`${y}-H${i}`)
  } else {
    opts.push(`${y}`)
  }
  return opts.reverse()
}

/* Which Q-column a period lands in on the 2026 scorecard (year passed in). */
function scCellKey(kpi, q, year) {
  if (kpi.freq === 'quarterly') return `${year}-Q${q}`
  if (kpi.freq === 'semiannual') return q === 2 ? `${year}-H1` : q === 4 ? `${year}-H2` : null
  if (kpi.freq === 'annual') return q === 4 ? `${year}` : null
  return null
}

/* ── tabs ────────────────────────────────────────────────────────── */

const TABS = [
  { slug: '',            id: 'overview',    icon: Activity, en: 'Overview',     ar: 'نظرة عامة' },
  { slug: 'scorecard',   id: 'scorecard',   icon: Award,    en: '2026 Scorecard', ar: 'بطاقة 2026' },
  { slug: 'kpis',        id: 'kpis',        icon: Target,   en: 'KPI Register', ar: 'سجل المؤشرات' },
  { slug: 'initiatives', id: 'initiatives', icon: Rocket,   en: 'Initiatives',  ar: 'المبادرات' },
  { slug: 'reports',     id: 'reports',     icon: FileText, en: 'Reports',      ar: 'التقارير' },
]

export default function StrategyModule() {
  const { t, lang, locale } = useLanguage()
  const { isMasterAdmin, isHOD, userProfile, user } = usePermissions()
  // Explicit 'edit' grants from User Management also unlock reading entry;
  // absent key = legacy account → view allowed.
  const strategyPerm = userProfile?.permissions?.strategy
  const canManage = isMasterAdmin || isHOD || strategyPerm === 'edit'
  const canView = isMasterAdmin || isHOD || strategyPerm !== 'none'
  const navigate = useNavigate()
  const location = useLocation()

  const slug = location.pathname.split('/').filter(Boolean)[1] || ''
  const tab = (TABS.find(x => x.slug === slug) || TABS[0]).id

  const [live, setLive] = useState(undefined)          // calcKey → result
  const [readings, setReadings] = useState(undefined)  // docId → data
  const [targets, setTargets] = useState({})           // kpiId → target override
  const [units, setUnits] = useState({})               // kpiId → unit override
  const [customKpis, setCustomKpis] = useState([])      // admin-added KPIs (Firestore)
  const [refreshing, setRefreshing] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const [recording, setRecording] = useState(null)     // model being recorded
  const [addingKpi, setAddingKpi] = useState(false)
  const [saving, setSaving] = useState(false)
  const [q, setQ] = useState('')
  const [freqFilter, setFreqFilter] = useState('all')
  const [srcFilter, setSrcFilter] = useState('all')
  const [dueOnly, setDueOnly] = useState(false)
  const [ownerFilter, setOwnerFilter] = useState('all')
  const [year] = useState(() => new Date().getFullYear())
  const [saveError, setSaveError] = useState('')
  const [expandedEv, setExpandedEv] = useState(null)   // scorecard: KPI id with evidence open
  const [exporting, setExporting] = useState(false)    // full-backup export in flight
  const [exportNote, setExportNote] = useState('')     // transient result message

  const load = useCallback(async () => {
    const [liveRes, readSnap, tgtSnap, unitSnap, customSnap] = await Promise.all([
      computeLiveKpis().catch(() => ({})),
      getDocs(collection(db, 'strategy_readings')).catch(() => null),
      getDoc(doc(db, 'strategy_settings', 'targets')).catch(() => null),
      getDoc(doc(db, 'strategy_settings', 'units')).catch(() => null),
      getDocs(collection(db, 'strategy_custom_kpis')).catch(() => null),
    ])
    setLive(liveRes)
    setReadings(readSnap ? Object.fromEntries(readSnap.docs.map(d => [d.id, d.data()])) : {})
    setTargets(tgtSnap?.exists?.() ? tgtSnap.data() : {})
    setUnits(unitSnap?.exists?.() ? unitSnap.data() : {})
    setCustomKpis(customSnap ? customSnap.docs.map(d => ({ ...d.data(), id: d.id })) : [])
    setRefreshing(false)
  }, [])

  // All state writes in load() happen after its fetches settle (async),
  // never synchronously — same pattern/waiver as useIsMobile.js.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  // Shipped catalog + admin-added custom KPIs, scoped to Operations. Recomputes
  // only when customKpis changes — buildModels/buildCheckpoints take this as
  // an explicit argument rather than closing over a module-level constant.
  const KPIS = useMemo(
    () => [...ALL_KPIS, ...customKpis].filter(k => k.unit === OPS_UNIT),
    [customKpis]
  )
  const KPI_IDS = useMemo(() => new Set(KPIS.map(k => k.id)), [KPIS])
  const checkpoints = useMemo(() => buildCheckpoints(KPIS), [KPIS])

  const models = useMemo(
    () => (live === undefined ? [] : buildModels(KPIS, live, readings, targets, units)),
    [KPIS, live, readings, targets, units]
  )
  const loading = live === undefined
  const score = useMemo(() => excellenceScore(models), [models])

  const counts = useMemo(() => {
    const c = { ontrack: 0, atrisk: 0, offtrack: 0, nodata: 0, notarget: 0 }
    models.forEach(m => { c[m.status] += 1 })
    return c
  }, [models])

  const goalScores = useMemo(() => GOALS.map(g => {
    const ms = models.filter(m => m.kpi.goal === g.id)
    return { goal: g, score: excellenceScore(ms), total: ms.length,
             measured: ms.filter(m => m.att != null).length }
  }).filter(g => g.total > 0), [models])

  const initiativeModels = useMemo(() => INITIATIVES.map(init => {
    const linked = models.filter(m => m.kpi.initiative === init.id)
    return { init, linked, score: excellenceScore(linked) }
  }).filter(x => x.linked.length > 0), [models])

  const readingsByKpi = useMemo(() => {
    const map = {}
    Object.values(readings || {}).forEach(r => {
      if (!r?.kpiId || !KPI_IDS.has(r.kpiId)) return
      ;(map[r.kpiId] = map[r.kpiId] || []).push(r)
    })
    Object.values(map).forEach(list => list.sort((a, b) => String(b.periodKey).localeCompare(String(a.periodKey))))
    return map
  }, [readings, KPI_IDS])

  const dueCount = useMemo(
    () => models.filter(m => m.kpi.source === 'manual' && m.missing.length > 0).length,
    [models]
  )

  /* Overdue readings per cadence (an ended period with no reading). */
  const overdueByFreq = useMemo(() => {
    const map = {}
    models.forEach(m => {
      if (m.kpi.source !== 'manual' || !m.missing.length) return
      map[m.kpi.freq] = (map[m.kpi.freq] || 0) + 1
    })
    return map
  }, [models])

  const filteredModels = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return models.filter(m => {
      if (freqFilter !== 'all' && m.kpi.freq !== freqFilter) return false
      if (srcFilter === 'live' && m.kpi.source === 'manual') return false
      if (srcFilter === 'manual' && m.kpi.source !== 'manual') return false
      if (dueOnly && !(m.kpi.source === 'manual' && m.missing.length > 0)) return false
      if (ownerFilter !== 'all' && m.kpi.owner !== ownerFilter) return false
      if (needle) {
        const hay = `${m.kpi.en} ${m.kpi.ar} ${m.kpi.formulaAr}`.toLowerCase()
        if (!hay.includes(needle)) return false
      }
      return true
    })
  }, [models, q, freqFilter, srcFilter, dueOnly, ownerFilter])

  /* KPI count per measurement owner — drives the owner filter chips. */
  const ownerCounts = useMemo(() => {
    const c = {}
    models.forEach(m => { if (m.kpi.owner) c[m.kpi.owner] = (c[m.kpi.owner] || 0) + 1 })
    return c
  }, [models])

  const liveCount = KPIS.filter(k => k.source !== 'manual').length

  /* ── Official 2026 scorecard (featured KPIs) ── */
  const scRows = useMemo(() => {
    const featured = models.filter(m => m.kpi.featured)
      .sort((a, b) => a.kpi.featured - b.kpi.featured)
    return featured.map(m => {
      const cells = [1, 2, 3, 4].map(q => {
        const key = scCellKey(m.kpi, q, year)
        const rd = key ? readings?.[`${m.kpi.id}__${key}`] : null
        return { key, value: rd?.value ?? null, evidence: rd?.evidence?.length || 0 }
      })
      const atts = cells
        .filter(c => c.value != null)
        .map(c => attainment(m.kpi, Number(c.value), m.target))
        .filter(a => a != null)
      const annual = atts.length
        ? Math.round(atts.reduce((sum, a) => sum + a, 0) / atts.length)
        : null
      const ev = (readingsByKpi[m.kpi.id] || [])
        .reduce((sum, r) => sum + (r.evidence?.length || 0), 0)
      const status = annual != null ? statusOf(annual)
        : m.missing.length > 0 ? 'nodata' : 'notdue'
      return { m, cells, annual, status, ev }
    })
  }, [models, readings, readingsByKpi, year])

  const scSummary = useMemo(() => {
    const measured = scRows.filter(r => r.annual != null)
    return {
      total: scRows.length,
      avg: measured.length
        ? Math.round(measured.reduce((s2, r) => s2 + Math.min(150, r.annual), 0) / measured.length)
        : null,
      ok: scRows.filter(r => r.status === 'above' || r.status === 'ontrack').length,
      warn: scRows.filter(r => r.status === 'atrisk').length,
      behind: scRows.filter(r => r.status === 'offtrack').length,
      notstarted: scRows.filter(r => r.status === 'nodata' || r.status === 'notdue').length,
    }
  }, [scRows])

  /* ── Full backup export ────────────────────────────────────────────────
     Everything the module holds in Firestore: the KPI register, EVERY period
     reading (with notes + who entered it), EVERY evidence file (name + direct
     download URL + storage path), target/unit overrides and club-added KPIs.

     Pulled fresh and UNFILTERED straight from Firestore — never from the
     on-screen filtered view — so the backup is complete regardless of what the
     UI is currently showing. Produces two files:
       • .xlsx  — 5 readable sheets for humans/auditors
       • .json  — raw docs with their IDs preserved, so readings and evidence
                  can be restored verbatim if a rebuild ever goes wrong.
     Read-only: it never writes or deletes anything.                          */
  const exportEverything = async () => {
    if (exporting) return
    setExporting(true)
    try {
      const [readSnap, customSnap, tgtSnap, unitSnap] = await Promise.all([
        getDocs(collection(db, 'strategy_readings')),
        getDocs(collection(db, 'strategy_custom_kpis')),
        getDoc(doc(db, 'strategy_settings', 'targets')),
        getDoc(doc(db, 'strategy_settings', 'units')),
      ])

      const readingDocs = readSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      const customDocs  = customSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      const targetsAll  = tgtSnap.exists() ? tgtSnap.data() : {}
      const unitsAll    = unitSnap.exists() ? unitSnap.data() : {}

      const stamp = new Date().toISOString().slice(0, 10)
      const asDate = (v) => {
        try { return v?.toDate ? v.toDate().toISOString() : (v || '') } catch { return '' }
      }
      // Catalog + custom KPIs, unscoped, so every reading can resolve its KPI.
      const allKpis = [...ALL_KPIS, ...customDocs]
      const kpiById = Object.fromEntries(allKpis.map(k => [k.id, k]))

      /* Sheet 1 — KPI register (every indicator, with its live/current model
         value where the suite measures it). */
      const modelByKpi = Object.fromEntries(models.map(m => [m.kpi.id, m]))
      const sKpis = allKpis.map(k => {
        const m = modelByKpi[k.id]
        return {
          'KPI ID': k.id,
          'Indicator (EN)': k.en || '',
          'Indicator (AR)': k.ar || '',
          'Unit / Dept': k.unit || '',
          'Owner (EN)': ownerLabel(k.owner, 'en') || '',
          'Owner (AR)': ownerLabel(k.owner, 'ar') || '',
          'Nature': natureOf(k.nature).en,
          'Goal': GOALS.find(g => g.id === k.goal)?.en || '',
          'Initiative': INITIATIVES.find(i => i.id === k.initiative)?.en || '',
          'Cycle': FREQ_LABEL[k.freq]?.en || k.freq || '',
          'Source': k.source || '',
          'Unit of measure': unitsAll[k.id] ?? k.ut ?? '',
          'Target': targetsAll[k.id] ?? k.target ?? '',
          'Current value': m?.value ?? '',
          'Attainment %': m?.att == null ? '' : Math.round(m.att),
          'Status': m ? STATUS_META[m.status].en : '',
          'Custom KPI': customDocs.some(c => c.id === k.id) ? 'YES' : '',
        }
      })

      /* Sheet 2 — every reading ever entered. */
      const sReadings = readingDocs
        .slice()
        .sort((a, b) => String(a.kpiId).localeCompare(String(b.kpiId))
          || String(a.periodKey).localeCompare(String(b.periodKey)))
        .map(r => {
          const k = kpiById[r.kpiId]
          return {
            'Doc ID': r.id,
            'KPI ID': r.kpiId || '',
            'Indicator (EN)': k?.en || '',
            'Indicator (AR)': k?.ar || '',
            'Period': r.periodKey || '',
            'Value': r.value ?? '',
            'Note': r.note || '',
            'Evidence files': (r.evidence || []).length,
            'Entered by': r.updatedByName || '',
            'Entered at': asDate(r.updatedAt),
          }
        })

      /* Sheet 3 — every evidence file, one row each, with its direct URL. */
      const sEvidence = []
      readingDocs.forEach(r => {
        (r.evidence || []).forEach(e => {
          const k = kpiById[r.kpiId]
          sEvidence.push({
            'KPI ID': r.kpiId || '',
            'Indicator (EN)': k?.en || '',
            'Indicator (AR)': k?.ar || '',
            'Period': r.periodKey || '',
            'File name': e.name || '',
            'Size (KB)': e.size ? Math.round(e.size / 1024) : '',
            'Type': e.type || '',
            'Storage path': e.path || '',
            'Download URL': e.url || '',
          })
        })
      })

      /* Sheet 4 — target & unit overrides (admin-set, not in the catalog). */
      const overrideIds = [...new Set([...Object.keys(targetsAll), ...Object.keys(unitsAll)])]
      const sOverrides = overrideIds.map(id => ({
        'KPI ID': id,
        'Indicator (EN)': kpiById[id]?.en || '',
        'Catalog target': kpiById[id]?.target ?? '',
        'Override target': targetsAll[id] ?? '',
        'Catalog unit': kpiById[id]?.ut ?? '',
        'Override unit': unitsAll[id] ?? '',
      }))

      /* Sheet 5 — club-added KPIs, verbatim. */
      const sCustom = customDocs.map(c => ({
        'KPI ID': c.id,
        'Indicator (EN)': c.en || '',
        'Indicator (AR)': c.ar || '',
        'Unit / Dept': c.unit || '',
        'Owner': ownerLabel(c.owner, 'en') || '',
        'Nature': c.nature || '',
        'Goal': c.goal || '',
        'Cycle': c.freq || '',
        'Target': c.target ?? '',
        'Unit of measure': c.ut || '',
        'Created by': c.createdByName || '',
        'Created at': asDate(c.createdAt),
      }))

      const wb = XLSX.utils.book_new()
      if (lang === 'ar') wb.Workbook = { Views: [{ RTL: true }] }
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sKpis), 'KPI Register')
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sReadings.length ? sReadings : [{ Note: 'No readings' }]), 'Readings')
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sEvidence.length ? sEvidence : [{ Note: 'No evidence files' }]), 'Evidence')
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sOverrides.length ? sOverrides : [{ Note: 'No overrides' }]), 'Targets & Units')
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sCustom.length ? sCustom : [{ Note: 'No custom KPIs' }]), 'Custom KPIs')
      XLSX.writeFile(wb, `FMAC-Strategy-Backup-${stamp}.xlsx`)

      /* Raw restorable snapshot — doc IDs preserved exactly as stored. */
      const backup = {
        exportedAt: new Date().toISOString(),
        exportedBy: userProfile?.displayName || user?.email || '',
        counts: {
          readings: readingDocs.length,
          evidenceFiles: sEvidence.length,
          customKpis: customDocs.length,
          targetOverrides: Object.keys(targetsAll).length,
          unitOverrides: Object.keys(unitsAll).length,
        },
        collections: {
          strategy_readings: readingDocs.map(r => ({
            ...r, updatedAt: asDate(r.updatedAt),
          })),
          strategy_custom_kpis: customDocs.map(c => ({
            ...c, createdAt: asDate(c.createdAt),
          })),
        },
        documents: {
          'strategy_settings/targets': targetsAll,
          'strategy_settings/units': unitsAll,
        },
      }
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
      )
      const a = document.createElement('a')
      a.href = url
      a.download = `FMAC-Strategy-Backup-${stamp}.json`
      a.click()
      URL.revokeObjectURL(url)

      setExportNote(t(
        `Exported ${readingDocs.length} readings and ${sEvidence.length} evidence files.`,
        `تم تصدير ${readingDocs.length} قراءة و${sEvidence.length} ملف دليل.`
      ))
      setTimeout(() => setExportNote(''), 6000)
    } catch (err) {
      console.error('[strategy] full export failed:', err)
      setExportNote(t('Export failed. Please try again.', 'فشل التصدير. حاول مرة أخرى.'))
      setTimeout(() => setExportNote(''), 6000)
    }
    setExporting(false)
  }

  const exportRegistry = () => {
    exportCsv(
      `fmac-operations-kpis-${new Date().toISOString().slice(0, 10)}`,
      ['Indicator', 'Indicator (AR)', 'Owner', 'Owner (AR)', 'Nature', 'Goal', 'Cycle', 'Source',
       'Target', 'Current', 'Attainment %', 'Status'],
      filteredModels.map(m => [
        m.kpi.en, m.kpi.ar,
        ownerLabel(m.kpi.owner, 'en') || '', ownerLabel(m.kpi.owner, 'ar') || '',
        natureOf(m.kpi.nature).en,
        GOALS.find(g => g.id === m.kpi.goal)?.en || '', FREQ_LABEL[m.kpi.freq].en,
        m.kpi.source, m.target ?? '', m.value ?? '',
        m.att == null ? '' : Math.round(m.att), STATUS_META[m.status].en,
      ])
    )
  }

  const saveReading = async (value, targetOverride, note, files = [], period = null, unitSel = null) => {
    if (!recording) return
    setSaving(true)
    setSaveError('')
    const kpi = recording.kpi
    try {
      if (value != null && kpi.source === 'manual') {
        const pk = period || periodKey(kpi.freq)
        const id = `${kpi.id}__${pk}`

        // Evidence uploads → Firebase Storage, metadata kept on the reading.
        const uploaded = []
        for (const f of files) {
          const clean = f.name.replace(/[^\w.\-؀-ۿ ]+/g, '_')
          const fileRef = sRef(storage, `strategy_evidence/${kpi.id}/${pk}/${Date.now()}_${clean}`)
          await uploadBytes(fileRef, f)
          uploaded.push({
            name: f.name, path: fileRef.fullPath,
            url: await getDownloadURL(fileRef),
            size: f.size, type: f.type || '',
          })
        }
        const prevEv = readings?.[id]?.evidence || []
        const evidence = [...prevEv, ...uploaded]

        await setDoc(doc(db, 'strategy_readings', id), {
          kpiId: kpi.id, periodKey: pk, value, note: note || '', evidence,
          updatedByName: userProfile?.displayName || user?.email || '',
          updatedAt: serverTimestamp(),
        }, { merge: true })
        setReadings(prev => ({ ...(prev || {}), [id]: { kpiId: kpi.id, periodKey: pk, value, note, evidence } }))
      }
      if (targetOverride != null && targetOverride !== recording.target) {
        await setDoc(doc(db, 'strategy_settings', 'targets'),
          { [kpi.id]: targetOverride }, { merge: true })
        setTargets(prev => ({ ...prev, [kpi.id]: targetOverride }))
      }
      if (unitSel && unitSel !== kpi.ut) {
        await setDoc(doc(db, 'strategy_settings', 'units'),
          { [kpi.id]: unitSel }, { merge: true })
        setUnits(prev => ({ ...prev, [kpi.id]: unitSel }))
      }
      setRecording(null)
    } catch (err) {
      // Keep the modal open so the entry isn't lost; show why it failed.
      setSaveError(err?.message || String(err))
    }
    setSaving(false)
  }

  /* Remove a manual reading for one period (mistaken entry). Best-effort:
     delete its evidence files from Storage, then the Firestore doc. */
  const deleteReading = async (period) => {
    if (!recording) return
    setSaving(true)
    setSaveError('')
    const kpi = recording.kpi
    const id = `${kpi.id}__${period}`
    try {
      const ev = readings?.[id]?.evidence || []
      await Promise.allSettled(ev.map(e => e.path ? deleteObject(sRef(storage, e.path)) : Promise.resolve()))
      await deleteDoc(doc(db, 'strategy_readings', id))
      setReadings(prev => {
        const next = { ...(prev || {}) }
        delete next[id]
        return next
      })
      setRecording(null)
    } catch (err) {
      setSaveError(err?.message || String(err))
    }
    setSaving(false)
  }

  /* Add a club-defined KPI. Always Operations + manual (there is no live
     calculator for a KPI just typed into a form) and never `featured` — the
     official 2026 scorecard slots stay reserved for the shipped catalog. */
  const addCustomKpi = async (form) => {
    setSaving(true)
    setSaveError('')
    try {
      const slug = form.en.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'kpi'
      const id = `custom_${slug}_${Date.now().toString(36)}`
      const extra = { ut: form.ut, dir: form.dir, source: 'manual', custom: true }
      if (form.initiative) extra.initiative = form.initiative
      const kpi = def(id, OPS_UNIT, form.nature, form.goal, form.freq, form.target,
        form.en, form.ar, form.formula, extra)
      await setDoc(doc(db, 'strategy_custom_kpis', id), {
        ...kpi,
        createdByName: userProfile?.displayName || user?.email || '',
        createdAt: serverTimestamp(),
      })
      setCustomKpis(prev => [...prev, kpi])
      setAddingKpi(false)
    } catch (err) {
      setSaveError(err?.message || String(err))
    }
    setSaving(false)
  }

  /* Remove a custom KPI (mistaken entry). Catalog KPIs are never deletable —
     KpiRow only ever calls this when kpi.custom is true. */
  const deleteCustomKpi = async (kpiId) => {
    setSaving(true)
    setSaveError('')
    try {
      await deleteDoc(doc(db, 'strategy_custom_kpis', kpiId))
      setCustomKpis(prev => prev.filter(k => k.id !== kpiId))
      setExpandedId(null)
    } catch (err) {
      setSaveError(err?.message || String(err))
    }
    setSaving(false)
  }

  /* ── printable reports (literal hexes only — CSS vars don't resolve) ── */

  /* Escape any value that reaches the print document. KPI names are
     admin-editable free text (custom KPIs), so they must never be
     interpolated into the HTML string raw. */
  const esc = (s) => String(s == null ? '' : s)
    .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

  const openPrintDoc = (title, body) => {
    const w = window.open('', '_blank', 'width=880,height=980')
    if (!w) return
    const rtl = lang === 'ar'
    const logo = `${window.location.origin}/fmac-ops-logo.png`
    w.document.write(`<!doctype html><html dir="${rtl ? 'rtl' : 'ltr'}" lang="${lang}"><head>
      <meta charset="utf-8"><title>${title}</title>
      <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet">
      <style>
        * { box-sizing: border-box; }
        body { font-family: ${rtl ? "'Cairo'," : ''} 'Segoe UI', Tahoma, sans-serif;
               color: #111114; margin: 34px 40px; font-size: 12.5px; }
        .brand { display: flex; align-items: center; gap: 14px; margin-bottom: 14px; }
        .brand img { height: 54px; width: auto; }
        h1 { font-size: 20px; margin: 0; letter-spacing: -0.01em; }
        .sub { color: #6f6f78; font-size: 12px; margin: 3px 0 22px; }
        h2 { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em;
             color: #6f6f78; margin: 24px 0 8px; }
        table { width: 100%; border-collapse: collapse; }
        th { text-align: ${rtl ? 'right' : 'left'}; font-size: 10px; font-weight: 600;
             color: #6f6f78; padding: 6px 5px; border-bottom: 1px solid #d9d9de; }
        td { padding: 6px 5px; border-bottom: 1px solid #ececec; vertical-align: top; }
        .num { white-space: nowrap; font-weight: 600; }
        .pill { display: inline-block; padding: 1px 8px; border-radius: 99px;
                font-size: 10px; font-weight: 700; color: #fff; }
        .scorebox { display: inline-block; border: 2px solid #111114; border-radius: 14px;
                    padding: 11px 20px; margin: 4px 12px 6px 0; }
        .scorebox b { font-size: 28px; }
        .muted { color: #6f6f78; }
        .init { border: 1px solid #ececec; border-radius: 12px; padding: 12px 14px; margin-bottom: 12px; }
        .init h3 { margin: 0 0 3px; font-size: 13.5px; }
        .foot { margin-top: 28px; color: #9a9aa2; font-size: 10.5px; }
        @media print { body { margin: 16px 20px; } }
      </style></head><body>
      <div class="brand"><img src="${logo}" alt="FMAC" onerror="this.style.display='none'"/>
        <div><h1>${title}</h1>
        <div class="sub">${t('Operations Department · Fujairah Martial Arts Club', 'إدارة العمليات · نادي الفجيرة للفنون القتالية')} · ${new Date().toLocaleDateString(locale)}</div></div>
      </div>
      ${body}
      <div class="foot">${t('Generated by the FMAC Operations Suite — live figures computed at print time. Readings are never shown as negative values.',
        'أُنشئ عبر منظومة عمليات النادي — الأرقام الحية محسوبة لحظة الطباعة، ولا تُعرض قراءات سالبة.')} · ${new Date().toLocaleString(locale)}</div>
      </body></html>`)
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 450)
  }

  const kpiTableHtml = (ms) => `
    <table><thead><tr>
      <th>${t('Indicator', 'المؤشر')}</th><th>${t('Owner', 'مسؤول القياس')}</th><th>${t('Nature', 'الطبيعة')}</th>
      <th>${t('Cycle', 'الدورية')}</th><th>${t('Target', 'المستهدف')}</th>
      <th>${t('Current', 'الحالي')}</th><th>${t('Attainment', 'الإنجاز')}</th>
      <th>${t('Status', 'الحالة')}</th>
    </tr></thead><tbody>
    ${ms.map(m => {
      const s = STATUS_META[m.status]
      const nat = natureOf(m.kpi.nature)
      return `<tr>
        <td dir="auto">${esc(lang === 'ar' ? m.kpi.ar : m.kpi.en)}${m.kpi.source !== 'manual' ? ` <span class="muted">⚡</span>` : ''}</td>
        <td dir="auto" class="muted">${esc(ownerLabel(m.kpi.owner, lang) || '—')}</td>
        <td dir="auto">${lang === 'ar' ? nat.ar : nat.en}</td>
        <td>${t(FREQ_LABEL[m.kpi.freq].en, FREQ_LABEL[m.kpi.freq].ar)}</td>
        <td class="num" dir="ltr">${m.target == null ? '—' : fmtVal(m.kpi, m.target, locale)}</td>
        <td class="num" dir="ltr">${fmtVal(m.kpi, m.value, locale)}</td>
        <td class="num" dir="ltr">${m.att == null ? '—' : Math.round(m.att) + '%'}</td>
        <td><span class="pill" style="background:${PRINT_STATUS_HEX[m.status]}">${t(s.en, s.ar)}</span></td>
      </tr>`
    }).join('')}
    </tbody></table>`

  const printScorecard2026 = () => {
    const bodyRows = GOALS.map(g => {
      const rows = scRows.filter(r => r.m.kpi.goal === g.id)
      if (!rows.length) return ''
      const goalRow = `<tr><td colspan="10" style="background:#faeefa; font-weight:700; padding:8px 6px;" dir="auto">${t('Goal', 'الهدف')}: ${lang === 'ar' ? g.ar : g.en}</td></tr>`
      const kpiRows = rows.map(r => {
        const meta = STATUS_META[r.status]
        const cells = r.cells.map(c =>
          `<td class="num" dir="ltr">${c.key == null ? '·' : c.value == null ? '—' : fmtVal(r.m.kpi, c.value, locale)}${c.evidence > 0 ? ' 📎' : ''}</td>`
        ).join('')
        return `<tr>
          <td class="num" dir="ltr">${r.m.kpi.featured}</td>
          <td dir="auto">${esc(lang === 'ar' ? r.m.kpi.ar : r.m.kpi.en)}${r.m.kpi.dir === 'down' ? ` <span class="muted">(${t('lower is better', 'الأقل أفضل')})</span>` : ''}</td>
          <td>${t(FREQ_LABEL[r.m.kpi.freq].en, FREQ_LABEL[r.m.kpi.freq].ar)}</td>
          <td class="num" dir="ltr">${r.m.target == null ? '—' : fmtVal(r.m.kpi, r.m.target, locale)}</td>
          ${cells}
          <td class="num" dir="ltr">${r.annual == null ? '—' : r.annual + '%'}</td>
          <td><span class="pill" style="background:${PRINT_STATUS_HEX[r.status]}">${t(meta.en, meta.ar)}</span></td>
        </tr>`
      }).join('')
      return goalRow + kpiRows
    }).join('')
    openPrintDoc(t(`${year} KPI Scorecard`, `بطاقة مؤشرات ${year}`), `
      <div class="scorebox">${t('Avg. achievement', 'متوسط الإنجاز')}: <b dir="ltr">${scSummary.avg == null ? '—' : scSummary.avg + '%'}</b></div>
      <span class="scorebox">${t('On / above target', 'على المستهدف أو أعلى')}: <b dir="ltr">${scSummary.ok}/${scSummary.total}</b></span>
      <h2>${t('Official KPIs — quarterly readings', 'المؤشرات الرسمية — القراءات الفصلية')}</h2>
      <table><thead><tr>
        <th>#</th><th>${t('KPI', 'المؤشر')}</th><th>${t('Cycle', 'الدورية')}</th><th>${t('Target', 'المستهدف')}</th>
        <th>Q1</th><th>Q2</th><th>Q3</th><th>Q4</th>
        <th>${t('Annual', 'السنوي')}</th><th>${t('Status', 'الحالة')}</th>
      </tr></thead><tbody>${bodyRows}</tbody></table>`)
  }

  const printScorecard = () => {
    const sectionsHtml = GOALS.map(g => {
      const ms = models.filter(m => m.kpi.goal === g.id)
      if (!ms.length) return ''
      return `<h2>${lang === 'ar' ? g.ar : g.en}</h2>${kpiTableHtml(ms)}`
    }).join('')
    openPrintDoc(t('Operations Excellence Scorecard', 'بطاقة أداء إدارة العمليات'), `
      <div class="scorebox">${t('Excellence score', 'مؤشر التميز')}: <b dir="ltr">${score == null ? '—' : score}</b> <span class="muted">/100</span></div>
      <div class="sub">${t('Register', 'السجل')}: ${models.length} ${t('KPIs', 'مؤشراً')} ·
        ${t('measured', 'مُقاس')}: ${models.filter(m => m.att != null).length} ·
        ⚡ ${t('auto-measured', 'يُقاس تلقائياً')}: ${liveCount}</div>
      ${sectionsHtml}`)
  }

  const printPortfolio = () => {
    const html = initiativeModels.map(({ init, linked, score: s }) => `
      <div class="init">
        <h3 dir="auto">${lang === 'ar' ? init.ar : init.en}</h3>
        <div class="muted" dir="auto">${lang === 'ar' ? init.goalAr : init.goalEn}</div>
        <div style="margin:7px 0" dir="auto"><b>${t('Progress', 'التقدم')}:</b>
          <span dir="ltr">${s == null ? t('awaiting measurement', 'بانتظار القياس') : Math.round(s) + '%'}</span>
          · <b>${t('Activities', 'الأنشطة')}:</b> ${init.activities.map(a => lang === 'ar' ? a.ar : a.en).join('، ')}</div>
        ${linked.length ? kpiTableHtml(linked) : `<div class="muted">${t('No linked KPIs yet.', 'لا مؤشرات مرتبطة بعد.')}</div>`}
      </div>`).join('')
    openPrintDoc(t('Initiative Portfolio', 'محفظة المبادرات'),
      `${html || `<div class="muted">${t('No initiatives with operations KPIs.', 'لا مبادرات ذات مؤشرات تشغيلية.')}</div>`}`)
  }

  const printBriefDoc = () => {
    const risky = models.filter(m => m.status === 'offtrack' || m.status === 'atrisk')
    const strong = models.filter(m => m.status === 'ontrack')
      .sort((a, b) => (b.att ?? 0) - (a.att ?? 0)).slice(0, 6)
    const waiting = models.filter(m => m.status === 'nodata' || m.status === 'notarget')
    openPrintDoc(t('Operations Executive Brief', 'الموجز التنفيذي لإدارة العمليات'), `
      <div class="scorebox">${t('Excellence score', 'مؤشر التميز')}: <b dir="ltr">${score == null ? '—' : score}</b> <span class="muted">/100</span></div>
      ${goalScores.map(g => `<span class="scorebox" dir="auto">${lang === 'ar' ? g.goal.ar : g.goal.en}: <b dir="ltr">${g.score == null ? '—' : g.score}</b></span>`).join('')}
      <h2>${t('Leading indicators', 'مؤشرات متقدمة')}</h2>${strong.length ? kpiTableHtml(strong) : `<div class="muted">—</div>`}
      <h2>${t('Needs intervention', 'تتطلب تدخلاً')}</h2>${risky.length ? kpiTableHtml(risky) : `<div class="muted">${t('Nothing off track.', 'لا شيء خارج المسار.')}</div>`}
      <h2>${t('Awaiting measurement or target', 'بانتظار القياس أو المستهدف')} (${waiting.length})</h2>
      <div dir="auto" class="muted">${waiting.map(m => lang === 'ar' ? m.kpi.ar : m.kpi.en).join('، ') || '—'}</div>`)
  }

  /* ── render ──────────────────────────────────────────────────── */

  if (!canView) return <ModuleLock />

  return (
    <motion.div className="str" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
      <div className="str-head">
        <div>
          <h1 className="str-title">{t('Operations Strategy & Excellence', 'استراتيجية وتميز إدارة العمليات')}</h1>
          <p className="str-sub">
            {t(`${KPIS.length} operations indicators · ${liveCount} measured live by the suite.`,
               `${KPIS.length} مؤشراً تشغيلياً · منها ${liveCount} يُقاس مباشرة من النظام.`)}
          </p>
        </div>
        <div className="str-head-actions">
          {exportNote && <span className="str-export-note" dir="auto">{exportNote}</span>}
          {/* Full backup — every reading + evidence file, read-only. */}
          <button className="str-refresh" onClick={exportEverything} disabled={exporting || loading}
            title={t('Download every KPI, reading and evidence file (Excel + JSON backup)',
                     'تنزيل كل المؤشرات والقراءات وملفات الأدلة (إكسل + نسخة JSON)')}>
            <Download size={13} className={exporting ? 'str-spin' : undefined} />
            {exporting ? t('Exporting…', 'جارٍ التصدير…') : t('Export all data', 'تصدير كل البيانات')}
          </button>
          <button className="str-refresh" onClick={() => { setRefreshing(true); load() }} disabled={refreshing || loading}>
            <RefreshCw size={13} className={refreshing ? 'str-spin' : undefined} />
            {t('Recompute', 'إعادة الحساب')}
          </button>
        </div>
      </div>

      <div className="str-tabs">
        {TABS.map(x => (
          <button key={x.id} className={`tab-item${tab === x.id ? ' active' : ''}`}
            onClick={() => navigate(`/strategy${x.slug ? `/${x.slug}` : ''}`)}>
            <x.icon size={14} strokeWidth={1.9} /> {t(x.en, x.ar)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="str-loading">{t('Computing live indicators…', 'جارٍ حساب المؤشرات الحية…')}</div>
      ) : (
        <>
          {tab === 'overview' && (
            <div className="str-overview">
              <section className="str-card str-scorecard">
                <ScoreRing score={score} />
                <div className="str-score-side">
                  <h2>{t('Operations excellence score', 'مؤشر تميز إدارة العمليات')}</h2>
                  <p>{t('Nature-weighted attainment across all measured operations KPIs.', 'الإنجاز الموزون حسب طبيعة المؤشر عبر جميع مؤشرات العمليات المُقاسة.')}</p>
                  <div className="str-count-chips">
                    <StatusChip status="ontrack" t={t} /><b>{counts.ontrack}</b>
                    <StatusChip status="atrisk" t={t} /><b>{counts.atrisk}</b>
                    <StatusChip status="offtrack" t={t} /><b>{counts.offtrack}</b>
                    <StatusChip status="nodata" t={t} /><b>{counts.nodata + counts.notarget}</b>
                  </div>
                  <p className="str-livecov">
                    <Zap size={12} strokeWidth={2.3} />
                    {t(`${liveCount} of ${KPIS.length} KPIs auto-measured by the suite`,
                       `${liveCount} من ${KPIS.length} مؤشراً يُقاس تلقائياً من النظام`)}
                  </p>
                  {dueCount > 0 && (
                    <button className="str-due" onClick={() => { setDueOnly(true); navigate('/strategy/kpis') }}>
                      <Flag size={12} strokeWidth={2.2} />
                      {t(`${dueCount} readings due this period`, `${dueCount} قراءة مستحقة لهذه الفترة`)}
                    </button>
                  )}
                </div>
              </section>

              <section className="str-card">
                <h2 className="str-card-title">{t('Strategic goals', 'الأهداف الاستراتيجية')}</h2>
                {goalScores.map(({ goal, score: s, measured, total }) => (
                  <div key={goal.id} className="str-pillar">
                    <span className="str-pillar-name" dir="auto">{lang === 'ar' ? goal.ar : goal.en}</span>
                    <div className="str-bar">
                      <div className="str-bar-fill str-bar-fill--accent" style={{ width: `${s ?? 0}%` }} />
                    </div>
                    <span className="str-pillar-num" dir="ltr">{s == null ? '—' : `${s}`}</span>
                    <span className="str-pillar-meta" dir="ltr">{measured}/{total}</span>
                  </div>
                ))}
              </section>

              <section className="str-card">
                <h2 className="str-card-title">{t('Measurement checkpoints', 'محطات القياس القادمة')}</h2>
                {checkpoints.map(c => {
                  const overdue = overdueByFreq[c.freq] || 0
                  const dateStr = new Date(c.end).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })
                  return (
                    <div key={c.freq} className="str-checkpoint">
                      <CalendarClock size={14} strokeWidth={1.9} />
                      <span className="str-cp-name">{t(FREQ_LABEL[c.freq].en, FREQ_LABEL[c.freq].ar)}</span>
                      <span className="str-cp-meta" dir="auto">
                        {c.n} {t('KPIs', 'مؤشر')} · {t('next', 'التالي')}{' '}
                        <b dir="auto">{dateStr}</b>{' '}
                        <span className="str-cp-days" dir="ltr">({c.days}{t('d', 'ي')})</span>
                        {overdue > 0 && (
                          <span className="str-cp-overdue" dir="auto"> · {overdue} {t('overdue', 'مستحقة')}</span>
                        )}
                      </span>
                    </div>
                  )
                })}
              </section>

              {initiativeModels.length > 0 && (
                <section className="str-card str-card--wide">
                  <h2 className="str-card-title">{t('Initiative progress', 'تقدم المبادرات')}</h2>
                  <div className="str-init-strip str-init-strip--3">
                    {initiativeModels.map(({ init, score: s }) => (
                      <button key={init.id} className="str-init-mini" onClick={() => navigate('/strategy/initiatives')}>
                        <span className="str-init-mini-name" dir="auto">{lang === 'ar' ? init.ar : init.en}</span>
                        <div className="str-bar">
                          <div className="str-bar-fill str-bar-fill--accent" style={{ width: `${s ?? 0}%` }} />
                        </div>
                        <span className="str-init-mini-num" dir="ltr">{s == null ? '—' : `${Math.round(s)}%`}</span>
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}

          {tab === 'scorecard' && (
            <div className="str-sc">
              <div className="str-sc-summary">
                <div className="str-sc-stat">
                  <b dir="ltr">{scSummary.total}</b>
                  <span>{t('KPIs', 'مؤشرات')}</span>
                </div>
                <div className="str-sc-stat">
                  <b dir="ltr">{scSummary.avg == null ? '—' : `${scSummary.avg}%`}</b>
                  <span>{t('Avg. achievement', 'متوسط الإنجاز')}</span>
                </div>
                <div className="str-sc-stat">
                  <b dir="ltr">{scSummary.ok}</b>
                  <span>{t('On / above target', 'على المستهدف أو أعلى')}</span>
                </div>
                <div className="str-sc-stat">
                  <b dir="ltr">{scSummary.warn + scSummary.behind}</b>
                  <span>{t('Need attention', 'تحتاج متابعة')}</span>
                </div>
                <div className="str-sc-stat">
                  <b dir="ltr">{scSummary.notstarted}</b>
                  <span>{t('Not started', 'لم تبدأ')}</span>
                </div>
              </div>

              <div className="str-sc-tablewrap">
                <table className="str-sc-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th className="str-sc-th-name">{t('KPI', 'المؤشر')}</th>
                      <th>{t('Cycle', 'الدورية')}</th>
                      <th>{t('Target', 'المستهدف')}</th>
                      <th dir="ltr">Q1</th><th dir="ltr">Q2</th><th dir="ltr">Q3</th><th dir="ltr">Q4</th>
                      <th>{t('Annual', 'السنوي')}</th>
                      <th>{t('Status', 'الحالة')}</th>
                      <th><Paperclip size={12} strokeWidth={2} /></th>
                      {canManage && <th />}
                    </tr>
                  </thead>
                  {GOALS.map(g => {
                    const rows = scRows.filter(r => r.m.kpi.goal === g.id)
                    if (!rows.length) return null
                    return (
                      <tbody key={g.id}>
                        <tr className="str-sc-goal">
                          <td colSpan={canManage ? 12 : 11} dir="auto">
                            {t('Goal', 'الهدف')}: {lang === 'ar' ? g.ar : g.en}
                          </td>
                        </tr>
                        {rows.map(r => (
                          <React.Fragment key={r.m.kpi.id}>
                          <tr>
                            <td className="str-sc-num" dir="ltr">{r.m.kpi.featured}</td>
                            <td className="str-sc-name" dir="auto">
                              {lang === 'ar' ? r.m.kpi.ar : r.m.kpi.en}
                              {r.m.kpi.dir === 'down' && (
                                <span className="str-sc-dir">{t('lower is better', 'الأقل أفضل')}</span>
                              )}
                            </td>
                            <td className="str-sc-muted">{t(FREQ_LABEL[r.m.kpi.freq].en, FREQ_LABEL[r.m.kpi.freq].ar)}</td>
                            <td className="str-sc-cell" dir="ltr">{r.m.target == null ? '—' : fmtVal(r.m.kpi, r.m.target, locale)}</td>
                            {r.cells.map((c, i) => (
                              <td key={i} className={`str-sc-cell${c.value != null ? ' str-sc-cell--filled' : ''}`} dir="ltr">
                                {c.key == null
                                  ? <span className="str-sc-na">·</span>
                                  : c.value == null ? '—' : fmtVal(r.m.kpi, c.value, locale)}
                                {c.evidence > 0 && <sup className="str-sc-evmark">📎</sup>}
                              </td>
                            ))}
                            <td className="str-sc-cell str-sc-cell--annual" dir="ltr">
                              {r.annual == null ? '—' : `${r.annual}%`}
                            </td>
                            <td><StatusChip status={r.status} t={t} /></td>
                            <td className="str-sc-cell" dir="ltr">
                              {r.ev > 0 ? (
                                <button className="str-sc-evbtn"
                                  onClick={() => setExpandedEv(v => v === r.m.kpi.id ? null : r.m.kpi.id)}
                                  aria-label={t('Show evidence', 'عرض الأدلة')}>
                                  <Paperclip size={11} strokeWidth={2} /> {r.ev}
                                </button>
                              ) : '—'}
                            </td>
                            {canManage && (
                              <td>
                                <button className="str-sc-pen" onClick={() => setRecording(r.m)}
                                  aria-label={t('Record reading', 'تسجيل قراءة')}>
                                  <PenLine size={13} />
                                </button>
                              </td>
                            )}
                          </tr>
                          {expandedEv === r.m.kpi.id && r.ev > 0 && (
                            <tr className="str-sc-evrow">
                              <td colSpan={canManage ? 12 : 11}>
                                {(readingsByKpi[r.m.kpi.id] || [])
                                  .filter(h => h.evidence?.length)
                                  .map(h => (
                                    <div key={h.periodKey} className="str-ev-list">
                                      <span className="str-hist-label" dir="ltr">
                                        {friendlyPeriod(r.m.kpi.freq, h.periodKey)}:
                                      </span>
                                      {h.evidence.map((e, i) => (
                                        <a key={i} className="str-ev-link" href={e.url}
                                          target="_blank" rel="noreferrer" dir="auto">
                                          {e.name}
                                        </a>
                                      ))}
                                    </div>
                                  ))}
                              </td>
                            </tr>
                          )}
                          </React.Fragment>
                        ))}
                      </tbody>
                    )
                  })}
                </table>
              </div>

              <p className="str-sc-note" dir="auto">
                {t(`FY ${year} · base year 2025 · every reading can carry text evidence and file attachments (PDF, image, Excel).`,
                   `السنة المالية ${year} · سنة الأساس 2025 · كل قراءة يمكن أن تحمل دليلاً نصياً ومرفقات (PDF، صورة، Excel).`)}
              </p>
            </div>
          )}

          {tab === 'kpis' && (
            <div>
              <div className="str-toolbar">
                <div className="str-search">
                  <Search size={14} strokeWidth={2} />
                  <input value={q} onChange={e => setQ(e.target.value)}
                    placeholder={t('Search operations KPIs…', 'ابحث في مؤشرات العمليات…')} dir="auto" />
                  {q && <button className="str-x" onClick={() => setQ('')}><X size={13} /></button>}
                </div>
                <button className="str-btn" onClick={exportRegistry} disabled={!filteredModels.length}>
                  <Download size={13} /> CSV
                </button>
                {canManage && (
                  <button className="str-btn str-btn--ink" onClick={() => setAddingKpi(true)}>
                    <Plus size={13} /> {t('Add KPI', 'إضافة مؤشر')}
                  </button>
                )}
              </div>
              <div className="str-filters">
                {['all', 'monthly', 'quarterly', 'semiannual', 'annual'].map(f => (
                  <button key={f} className={`str-filter${freqFilter === f ? ' active' : ''}`}
                    onClick={() => setFreqFilter(f)}>
                    {f === 'all' ? t('All cycles', 'كل الدوريات') : t(FREQ_LABEL[f].en, FREQ_LABEL[f].ar)}
                  </button>
                ))}
                <span className="str-filter-sep" />
                {['all', 'live', 'manual'].map(f => (
                  <button key={f} className={`str-filter${srcFilter === f ? ' active' : ''}`}
                    onClick={() => setSrcFilter(f)}>
                    {f === 'all' ? t('All sources', 'كل المصادر') : f === 'live' ? t('Live', 'مباشر') : t('Manual', 'يدوي')}
                  </button>
                ))}
                <span className="str-filter-sep" />
                <button className={`str-filter str-filter--due${dueOnly ? ' active' : ''}`}
                  onClick={() => setDueOnly(v => !v)}>
                  <Flag size={11} strokeWidth={2.2} /> {t('Due now', 'مستحقة الآن')} ({dueCount})
                </button>
              </div>
              {/* Measurement owner — توزيع المؤشرات على موظفي القسم */}
              <div className="str-filters str-filters--owner">
                <button className={`str-filter${ownerFilter === 'all' ? ' active' : ''}`}
                  onClick={() => setOwnerFilter('all')}>
                  {t('All owners', 'كل المسؤولين')}
                </button>
                {OWNERS.map(o => {
                  const n = ownerCounts[o.id] || 0
                  if (!n) return null
                  return (
                    <button key={o.id} className={`str-filter${ownerFilter === o.id ? ' active' : ''}`}
                      onClick={() => setOwnerFilter(v => v === o.id ? 'all' : o.id)} dir="auto">
                      {lang === 'ar' ? o.ar : o.en} ({n})
                    </button>
                  )
                })}
              </div>
              <div className="str-kpi-list">
                {filteredModels.length === 0 ? (
                  <div className="str-loading">{t('No indicators match.', 'لا مؤشرات مطابقة.')}</div>
                ) : filteredModels.map(m => (
                  <KpiRow key={m.kpi.id} m={m} lang={lang} t={t} locale={locale}
                    canManage={canManage}
                    history={readingsByKpi[m.kpi.id] || []}
                    expanded={expandedId === m.kpi.id}
                    onToggle={() => setExpandedId(v => v === m.kpi.id ? null : m.kpi.id)}
                    onRecord={() => setRecording(m)}
                    onDeleteKpi={deleteCustomKpi} />
                ))}
              </div>
            </div>
          )}

          {tab === 'initiatives' && (
            initiativeModels.length === 0 ? (
              <div className="str-loading">{t('No initiatives have operations KPIs yet.', 'لا مبادرات لها مؤشرات تشغيلية بعد.')}</div>
            ) : (
              <div className="str-init-grid">
                {initiativeModels.map(({ init, linked, score: s }) => (
                  <section key={init.id} className="str-card str-init-card">
                    <div className="str-init-head">
                      <h2 dir="auto">{lang === 'ar' ? init.ar : init.en}</h2>
                      <span className="str-init-score" dir="ltr">{s == null ? '—' : `${Math.round(s)}%`}</span>
                    </div>
                    <p className="str-init-goal" dir="auto">{lang === 'ar' ? init.goalAr : init.goalEn}</p>
                    <div className="str-init-acts">
                      {init.activities.map((a, i) => (
                        <span key={i} className="str-act" dir="auto">
                          <ClipboardList size={11} strokeWidth={2} /> {lang === 'ar' ? a.ar : a.en}
                        </span>
                      ))}
                    </div>
                    {linked.length > 0 && (
                      <div className="str-init-kpis">
                        {linked.map(m => (
                          <div key={m.kpi.id} className="str-init-kpirow">
                            <span dir="auto">{lang === 'ar' ? m.kpi.ar : m.kpi.en}</span>
                            <div className="str-bar">
                              <div className={`str-bar-fill str-bar-fill--${STATUS_META[m.status].cls}`}
                                style={{ width: `${m.att == null ? 0 : Math.min(100, m.att)}%` }} />
                            </div>
                            <b dir="ltr">{fmtVal(m.kpi, m.value, locale)}</b>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                ))}
              </div>
            )
          )}

          {tab === 'reports' && (
            <div className="str-reports">
              {[
                { icon: Award, en: '2026 Scorecard', ar: 'بطاقة مؤشرات 2026',
                  dEn: 'The official 9 KPIs with quarterly readings, annual achievement, status and evidence counts.',
                  dAr: 'المؤشرات الرسمية التسعة بقراءاتها الفصلية ونسبة الإنجاز السنوية والحالة وعدد الأدلة.',
                  go: printScorecard2026 },
                { icon: Target, en: 'Operations Scorecard', ar: 'بطاقة أداء العمليات',
                  dEn: 'The operations register by strategic goal — target, current, attainment, status. Live figures computed at print time.',
                  dAr: 'سجل العمليات حسب الهدف الاستراتيجي — المستهدف والحالي ونسبة الإنجاز والحالة. الأرقام الحية تُحسب لحظة الطباعة.',
                  go: printScorecard },
                { icon: Rocket, en: 'Initiative Portfolio', ar: 'محفظة المبادرات',
                  dEn: 'The strategic initiatives with operations KPIs behind them — goals, activities, and progress.',
                  dAr: 'المبادرات الاستراتيجية ذات المؤشرات التشغيلية — أهدافها وأنشطتها وتقدمها.',
                  go: printPortfolio },
                { icon: FileText, en: 'Executive Brief', ar: 'الموجز التنفيذي',
                  dEn: 'One page for leadership: the score, goals, what leads, what needs intervention.',
                  dAr: 'صفحة واحدة للقيادة: المؤشر العام والأهداف، المتقدم منها وما يتطلب تدخلاً.',
                  go: printBriefDoc },
              ].map((r, i) => (
                <section key={i} className="str-card str-report-card">
                  <r.icon size={19} strokeWidth={1.8} className="str-report-icon" />
                  <h2 dir="auto">{t(r.en, r.ar)}</h2>
                  <p dir="auto">{t(r.dEn, r.dAr)}</p>
                  <button className="str-btn str-btn--ink" onClick={r.go}>
                    <Printer size={13} /> {t('Generate', 'إنشاء التقرير')}
                  </button>
                </section>
              ))}
            </div>
          )}
        </>
      )}

      {recording && (
        <RecordModal m={recording} t={t} lang={lang} saving={saving} error={saveError}
          history={readingsByKpi[recording.kpi.id] || []}
          onClose={() => { setRecording(null); setSaveError('') }} onSave={saveReading} onDelete={deleteReading} />
      )}
      {addingKpi && (
        <NewKpiModal t={t} lang={lang} saving={saving} error={saveError}
          onClose={() => { setAddingKpi(false); setSaveError('') }} onSave={addCustomKpi} />
      )}
    </motion.div>
  )
}
