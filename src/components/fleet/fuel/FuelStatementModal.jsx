import React, { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertCircle, CheckCircle2, FileCheck, FileStack, Fuel, Loader2, Upload, X,
} from 'lucide-react'
import {
  collection, doc, getDocs, query, serverTimestamp, setDoc, where,
} from 'firebase/firestore'
import * as XLSX from 'xlsx'
import { db } from '../../../firebase'
import { useLanguage } from '../../../contexts/LanguageContext'
import CustomSelect from '../../CustomSelect'
import { combineAdnocImports, parseAdnocWorksheet } from './adnocStatementParser'

const emptyForm = () => ({
  month: new Date().getMonth() + 1,
  year: new Date().getFullYear(),
  totalLitres: 0,
  totalCost: 0,
  totalVat: null,
  pricePerLitre: '',
  notes: '',
  vehicleAllocations: [],
  transactions: [],
  fuelTypeSummary: [],
  statementControlTotal: null,
  statementControlAllocations: [],
  reconciliationVariance: null,
  dataModel: '',
  dataCoverage: '',
  importVersion: 1,
})

const workbookAttachment = (file, arrayBuffer) => {
  const bytes = new Uint8Array(arrayBuffer)
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return {
    name: file.name,
    size: file.size,
    contentType: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    dataBase64: btoa(binary),
  }
}

const readWorkbook = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onerror = () => reject(new Error(`Could not read ${file.name}.`))
  reader.onload = () => {
    try {
      const arrayBuffer = reader.result
      const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true })
      resolve({
        parsed: parseAdnocWorksheet(rows),
        attachment: workbookAttachment(file, arrayBuffer),
      })
    } catch (error) {
      reject(error)
    }
  }
  reader.readAsArrayBuffer(file)
})

const sourceLabel = (format, t) => ({
  'transaction-ledger': t('Detailed transaction ledger', 'سجل المعاملات التفصيلي'),
  'payment24-summary': t('Payment24 control summary', 'ملخص المطابقة من Payment24'),
  'legacy-summary': t('Legacy monthly summary', 'الملخص الشهري السابق'),
}[format] || format)

export default function FuelStatementModal({ isOpen, onClose, onSave }) {
  const { t, locale } = useLanguage()
  const [formData, setFormData] = useState(emptyForm)
  const [parsedImports, setParsedImports] = useState([])
  const [fileInfo, setFileInfo] = useState([])
  const [isSaving, setIsSaving] = useState(false)
  const [isParsing, setIsParsing] = useState(false)
  const [error, setError] = useState(null)
  const fileInputRef = useRef(null)
  const sourceFilesRef = useRef(new Map())

  const months = [
    t('January', 'يناير'), t('February', 'فبراير'), t('March', 'مارس'),
    t('April', 'أبريل'), t('May', 'مايو'), t('June', 'يونيو'),
    t('July', 'يوليو'), t('August', 'أغسطس'), t('September', 'سبتمبر'),
    t('October', 'أكتوبر'), t('November', 'نوفمبر'), t('December', 'ديسمبر'),
  ]

  const reset = () => {
    setFormData(emptyForm())
    setParsedImports([])
    setFileInfo([])
    setError(null)
    sourceFilesRef.current = new Map()
  }

  const close = () => {
    if (isSaving) return
    reset()
    onClose()
  }

  const handleFileUpload = async (event) => {
    const files = [...(event.target.files || [])]
    event.target.value = ''
    if (files.length === 0) return
    const oversized = files.find((file) => file.size > 700 * 1024)
    if (oversized) {
      setError(t(
        `${oversized.name} is larger than 700KB and cannot be retained as evidence.`,
        `يتجاوز الملف ${oversized.name} حجم 700 كيلوبايت ولا يمكن حفظه كمرفق إثبات.`,
      ))
      return
    }

    setIsParsing(true)
    setError(null)
    try {
      const results = await Promise.all(files.map(readWorkbook))
      let nextImports = [...parsedImports]
      const nextInfo = [...fileInfo]
      results.forEach(({ parsed, attachment }) => {
        nextImports = nextImports.filter((item) => item.format !== parsed.format)
        nextImports.push(parsed)
        sourceFilesRef.current.set(parsed.format, attachment)
        const info = {
          format: parsed.format,
          name: attachment.name,
          size: `${(attachment.size / 1024).toFixed(1)} KB`,
        }
        const index = nextInfo.findIndex((item) => item.format === parsed.format)
        if (index >= 0) nextInfo.splice(index, 1, info)
        else nextInfo.push(info)
      })
      const combined = combineAdnocImports(nextImports)
      setParsedImports(nextImports)
      setFileInfo(nextInfo)
      setFormData((previous) => ({
        ...previous,
        ...combined,
        month: combined.month || previous.month,
        year: combined.year || previous.year,
      }))
    } catch (uploadError) {
      setError(uploadError.message)
    } finally {
      setIsParsing(false)
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setIsSaving(true)
    setError(null)
    try {
      if (formData.totalCost <= 0 || fileInfo.length === 0) {
        throw new Error(t('Upload a valid ADNOC workbook first.', 'حمّل ملف أدنوك صالحاً أولاً.'))
      }
      const period = `${formData.year}-${String(formData.month).padStart(2, '0')}`
      const existingSnapshot = await getDocs(query(
        collection(db, 'fuelStatements'),
        where('month', '==', formData.month),
        where('year', '==', formData.year),
      ))
      const existing = existingSnapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .sort((a, b) => Number(b.updatedAt?.seconds || b.createdAt?.seconds || 0)
          - Number(a.updatedAt?.seconds || a.createdAt?.seconds || 0))[0]
      const statementRef = existing
        ? doc(db, 'fuelStatements', existing.id)
        : doc(collection(db, 'fuelStatements'))

      const sourceAttachments = []
      for (const info of fileInfo) {
        const attachment = sourceFilesRef.current.get(info.format)
        if (!attachment) continue
        const fileDocId = `${period}--${info.format}`
        await setDoc(doc(db, 'fuel_statement_files', fileDocId), {
          ...attachment,
          sourceType: info.format,
          statementId: statementRef.id,
          period,
          uploadedAt: serverTimestamp(),
        })
        sourceAttachments.push({
          fileDocId,
          sourceType: info.format,
          name: attachment.name,
          size: attachment.size,
          contentType: attachment.contentType,
          storageMode: 'firestore',
        })
      }
      if (sourceAttachments.length === 0) {
        throw new Error(t('Select the source workbook again.', 'اختر ملف المصدر مرة أخرى.'))
      }

      const manualPrice = Number(formData.pricePerLitre)
      await setDoc(statementRef, {
        ...formData,
        pricePerLitre: formData.dataModel === 'transaction-ledger'
          ? null
          : (Number.isFinite(manualPrice) && manualPrice > 0 ? Math.round(manualPrice * 1000) / 1000 : null),
        monthName: months[formData.month - 1],
        sourceAttachments,
        sourceAttachment: sourceAttachments.find((item) => item.sourceType === 'transaction-ledger')
          || sourceAttachments[0],
        updatedAt: serverTimestamp(),
        ...(!existing ? { createdAt: serverTimestamp() } : {}),
      }, { merge: true })

      onSave?.()
      reset()
      onClose()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setIsSaving(false)
    }
  }

  if (!isOpen) return null
  const hasTransactions = formData.dataModel === 'transaction-ledger'
  const variance = Number(formData.reconciliationVariance)

  /* Portal to <body>: the fleet module sits inside a framer-motion
     transform, which becomes the containing block for position:fixed and
     lets the sticky fleet rail (z-index 120) paint over this overlay. */
  return createPortal(
    <AnimatePresence>
      <div className="fuel-import-shell" role="dialog" aria-modal="true" aria-labelledby="fuel-import-title">
        <motion.div className="fuel-import-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close} />
        <motion.div className="fuel-import-modal" initial={{ opacity: 0, scale: 0.96, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, y: 8 }}>
          <header className="fuel-import-header">
            <div className="fuel-import-heading">
              <span className="fuel-import-icon"><Fuel size={21} /></span>
              <div>
                <h3 id="fuel-import-title">{t('ADNOC fuel import', 'استيراد وقود أدنوك')}</h3>
                <p>{t('August 2026 onward: transaction-level fuel intelligence', 'اعتباراً من أغسطس 2026: بيانات وقود تفصيلية لكل معاملة')}</p>
              </div>
            </div>
            <button type="button" className="fan-icon-btn" onClick={close} aria-label={t('Close', 'إغلاق')}><X size={18} /></button>
          </header>

          <form onSubmit={handleSubmit} className="fuel-import-body">
            {error && <div className="fuel-import-error"><AlertCircle size={18} /> <span>{error}</span></div>}

            <div className="fuel-import-period">
              <div className="fuel-input-group">
                <label className="fuel-kpi-label">{t('Reporting month', 'شهر التقرير')}</label>
                <CustomSelect value={formData.month} onChange={(month) => setFormData({ ...formData, month })} options={months.map((label, index) => ({ value: index + 1, label }))} />
              </div>
              <div className="fuel-input-group">
                <label className="fuel-kpi-label">{t('Reporting year', 'سنة التقرير')}</label>
                <input type="number" className="fuel-input" value={formData.year} onChange={(event) => setFormData({ ...formData, year: Number(event.target.value) })} />
              </div>
            </div>

            <section className="fuel-import-guide">
              <div><FileStack size={18} /><strong>{t('Recommended monthly flow', 'التدفق الشهري الموصى به')}</strong></div>
              <ol>
                <li>{t('Upload the detailed transaction export (required for litres, fuel type and vehicle drill-down).', 'حمّل ملف المعاملات التفصيلي (مطلوب للترات ونوع الوقود وتفاصيل المركبات).')}</li>
                <li>{t('Upload the Payment24 report as the official control total (recommended).', 'حمّل تقرير Payment24 كإجمالي رسمي للمطابقة (موصى به).')}</li>
              </ol>
            </section>

            <button type="button" className={`fuel-import-drop${fileInfo.length ? ' has-files' : ''}`} onClick={() => fileInputRef.current?.click()}>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls" multiple onChange={handleFileUpload} hidden />
              {isParsing ? <><Loader2 size={28} className="animate-spin" /><strong>{t('Reading ADNOC workbooks…', 'جارٍ قراءة ملفات أدنوك…')}</strong></> : <><Upload size={28} /><strong>{t('Choose one or both ADNOC workbooks', 'اختر ملفاً واحداً أو ملفي أدنوك')}</strong><span>{t('Payment24 summary + detailed transactions', 'ملخص Payment24 + سجل المعاملات التفصيلي')}</span></>}
            </button>

            {fileInfo.length > 0 && (
              <div className="fuel-import-files">
                {fileInfo.map((item) => <div key={item.format}><FileCheck size={17} /><span><strong>{sourceLabel(item.format, t)}</strong><small>{item.name} · {item.size}</small></span><CheckCircle2 size={17} /></div>)}
              </div>
            )}

            {fileInfo.length > 0 && (
              <section className="fuel-import-preview">
                <div><span>{t('Total spent', 'إجمالي الإنفاق')}</span><strong>{formData.totalCost.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} AED</strong></div>
                <div><span>{t('Total litres', 'إجمالي اللترات')}</span><strong>{formData.totalLitres > 0 ? formData.totalLitres.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}</strong></div>
                <div><span>{t('Vehicles', 'المركبات')}</span><strong>{formData.vehicleAllocations.length}</strong></div>
                <div><span>{t('Transactions', 'المعاملات')}</span><strong>{formData.transactions.length || '—'}</strong></div>
              </section>
            )}

            {hasTransactions && formData.fuelTypeSummary.length > 0 && (
              <div className="fuel-import-mix">
                {formData.fuelTypeSummary.map((item) => <div key={item.fuelType}><span>{item.fuelType}</span><strong>{item.litres.toLocaleString(locale)} L</strong><small>{item.transactionCount} {t('transactions', 'معاملة')} · {item.averageCostPerLitre.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 3 })} AED/L</small></div>)}
              </div>
            )}

            {hasTransactions && formData.statementControlTotal != null && Math.abs(variance) >= 0.01 && (
              <div className="fuel-import-reconcile"><AlertCircle size={18} /><div><strong>{t('Payment24 reconciliation difference', 'فرق المطابقة مع Payment24')}: {Math.abs(variance).toLocaleString(locale, { minimumFractionDigits: 2 })} AED</strong><span>{t('The transaction ledger remains authoritative. This difference is retained for audit review, not discarded.', 'يبقى سجل المعاملات هو المصدر المعتمد. يُحفظ الفرق للمراجعة ولا يتم تجاهله.')}</span></div></div>
            )}

            {!hasTransactions && fileInfo.length > 0 && formData.totalLitres === 0 && (
              <div className="fuel-import-note">{t('This Payment24 file contains vehicle costs only. Add the detailed transaction export to unlock litres, fuel types and transaction drill-down.', 'يحتوي ملف Payment24 على تكاليف المركبات فقط. أضف ملف المعاملات التفصيلي لإظهار اللترات وأنواع الوقود وتفاصيل المعاملات.')}</div>
            )}

            {!hasTransactions && (
              <div className="fuel-input-group">
                <label className="fuel-kpi-label">{t('Price per litre (optional legacy input)', 'سعر اللتر (اختياري للسجلات السابقة)')}</label>
                <input type="number" min="0" step="0.001" className="fuel-input" value={formData.pricePerLitre} onChange={(event) => setFormData({ ...formData, pricePerLitre: event.target.value })} />
              </div>
            )}

            <div className="fuel-input-group">
              <label className="fuel-kpi-label">{t('Notes (optional)', 'ملاحظات (اختياري)')}</label>
              <textarea className="fuel-input" value={formData.notes} onChange={(event) => setFormData({ ...formData, notes: event.target.value })} placeholder={t('Internal reference or reconciliation note…', 'مرجع داخلي أو ملاحظة مطابقة…')} />
            </div>

            <footer className="fuel-import-actions">
              <button type="button" className="fuel-import-cancel" onClick={close}>{t('Cancel', 'إلغاء')}</button>
              <button type="submit" className="fuel-btn-action" disabled={isSaving || fileInfo.length === 0}>{isSaving ? <><Loader2 size={18} className="animate-spin" /> {t('Saving…', 'جارٍ الحفظ…')}</> : <><FileCheck size={18} /> {t('Save monthly fuel data', 'حفظ بيانات الوقود الشهرية')}</>}</button>
            </footer>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body,
  )
}
