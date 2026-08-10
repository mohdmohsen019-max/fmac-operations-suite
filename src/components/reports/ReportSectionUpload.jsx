import { useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Upload, FileText, X, Clock, RefreshCw, Check, AlertCircle,
  Edit3, RotateCcw, Send, ChevronDown, ChevronUp, Eye, Pencil, Save
} from 'lucide-react'
import * as pdfjsLib from 'pdfjs-dist'
import { detectKind, extractSheetText, extractDocxText, extractJsonText, ACCEPT_ATTR } from './fileExtract'
import { db, storage } from '../../firebase'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import ReportBlockEditor from './ReportBlockEditor'
import { migrateToBlocks, blocksToLegacy } from '../../utils/reportBlocks'
import './SubmissionForms.css'

/* PDF.js worker — served from /public so it is delivered byte-for-byte.
   Anything resolved through the bundler (`new URL(..., import.meta.url)` or an
   `?url` import) gets handed to Vite's JS transform in dev, which rewrites this
   classic worker script into an ES module — a classic Worker cannot load that
   ("Cannot use import statement outside a module"), and PDF.js then falls back
   to a fake worker that also fails. Files in /public bypass the pipeline
   entirely, so this works identically in dev and in the production build.
   Keep public/pdf.worker.min.js in sync with the pdfjs-dist version in
   package.json — `npm run sync-pdf-worker`. */
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js'

const MONTHS_EN = ['January','February','March','April','May','June','July','August','September','October','November','December']
const MONTHS_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']

function monthLabel(monthStr, lang) {
  if (!monthStr) return '—'
  const [yr, mo] = monthStr.split('-')
  const idx = parseInt(mo, 10) - 1
  if (idx < 0 || idx > 11) return monthStr
  return lang === 'ar' ? `${MONTHS_AR[idx]} ${yr}` : `${MONTHS_EN[idx]} ${yr}`
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1048576).toFixed(1) + ' MB'
}

// Read-only rendering of the block list (the "view" half of view/edit).
function ReadOnlyBlocks({ blocks }) {
  return (
    <div className="rsu-ro-blocks">
      {blocks.map((b) => {
        if (b.type === 'heading') return <h4 key={b.id} className="rsu-ro-heading" dir="auto">{b.text}</h4>
        if (b.type === 'paragraph') return <p key={b.id} className="rsu-ro-para" dir="auto">{b.text}</p>
        if (b.type === 'list') return (
          <ul key={b.id} className="rsu-ro-list">
            {b.items.filter(Boolean).map((it, i) => <li key={i} dir="auto">{it}</li>)}
          </ul>
        )
        if (b.type === 'cards') return (
          <div key={b.id} className="rsu-metrics-grid">
            {b.items.filter(it => it.label || it.value).map((it, i) => (
              <div key={i} className="rsu-metric-card">
                <span className="rsu-metric-label">{it.label}</span>
                <span className="rsu-metric-value">{it.value}</span>
              </div>
            ))}
          </div>
        )
        if (b.type === 'table') return (
          <div key={b.id} className="rsu-table-block">
            {b.title && <div className="rsu-ro-table-title">{b.title}</div>}
            <div className="sf-table-wrap">
              <table className="sf-table">
                <thead><tr>{(b.headers || []).map((h, hi) => <th key={hi}>{h}</th>)}</tr></thead>
                <tbody>
                  {(b.rows || []).map((r, ri) => <tr key={ri}>{r.map((c, ci) => <td key={ci}>{c}</td>)}</tr>)}
                </tbody>
              </table>
            </div>
          </div>
        )
        if (b.type === 'image') return b.src ? (
          <figure key={b.id} className="rsu-ro-figure">
            <img src={b.src} alt={b.caption || ''} />
            {b.caption && <figcaption>{b.caption}</figcaption>}
          </figure>
        ) : null
        return null
      })}
    </div>
  )
}

export default function ReportSectionUpload({ section, reportId, user, lang, t, onClose, onSubmitted, isHOD, canEdit }) {
  // Steps: 'upload' | 'analyzing' | 'preview' | 'editing'
  const [step, setStep] = useState(() => {
    // If section already has content, go straight to preview
    let content = section?.content
    if (typeof content === 'string') {
      try { content = JSON.parse(content) } catch (e) { /* ignore */ }
    }
    const hasBlocks = Array.isArray(content?.blocks) && content.blocks.length > 0
    const hasLegacy = !!content?.summary
      || (Array.isArray(content?.tables) && content.tables.length > 0)
      || (content?.numbers && Object.keys(content.numbers).length > 0)
    if (hasBlocks) return 'preview'
    if ((section?.status === 'submitted' || section?.status === 'approved') && hasLegacy) return 'preview'
    return 'upload'
  })
  const [file, setFile] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState(null)
  const [statusMsg, setStatusMsg] = useState('')
  const [aiResult, setAiResult] = useState(() => {
    // Pre-fill from existing content if available
    let content = section?.content
    if (typeof content === 'string') {
      try { content = JSON.parse(content) } catch (e) { console.error('Parse error:', e) }
    }
    const hasBlocks = Array.isArray(content?.blocks) && content.blocks.length > 0
    if (content?.summary || hasBlocks
        || (Array.isArray(content?.tables) && content.tables.length > 0)
        || (content?.numbers && Object.keys(content.numbers).length > 0)) return content
    return null
  })
  const [submitting, setSubmitting] = useState(false)
  const [editingRaw, setEditingRaw] = useState(false)
  const [rawText, setRawText] = useState('')
  const [expandedTables, setExpandedTables] = useState({})
  const [isEditing, setIsEditing] = useState(false)
  const [blocks, setBlocks] = useState([])
  const [savingBlocks, setSavingBlocks] = useState(false)
  const fileInputRef = useRef(null)

  const nameAr = section?.sectionNameAr || ''
  const nameEn = section?.sectionNameEn || ''

  // ── File selection ──────────────────────────────────────
  const handleFile = (f) => {
    if (!f) return
    const kind = detectKind(f)
    if (kind === 'legacy-doc') {
      // mammoth/docx tooling only reads the modern XML format.
      setError(t('The old .doc format is not supported. Please open it in Word and save as .docx.',
                 'صيغة .doc القديمة غير مدعومة. افتح الملف في Word واحفظه بصيغة .docx.'))
      return
    }
    if (kind === 'unknown') {
      setError(t('Please select a PDF, Excel (.xlsx, .xls, .csv), Word (.docx) or JSON file.',
                 'يرجى اختيار ملف PDF أو Excel (.xlsx, .xls, .csv) أو Word (.docx) أو JSON.'))
      return
    }
    if (f.size > 10 * 1024 * 1024) {
      setError(t('File size must be under 10MB.', 'حجم الملف يجب أن يكون أقل من 10 ميجابايت.'))
      return
    }
    setFile(f)
    setError(null)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    handleFile(e.dataTransfer.files[0])
  }

  // ── Upload & Analyze ────────────────────────────────────
  const startAnalysis = useCallback(async () => {
    if (!file) return
    setStep('analyzing')
    setError(null)

    try {
      /* Step 1 — get the document in front of the model. A PDF is rendered to
         page images; a spreadsheet or Word file is far better read as text
         (and much cheaper than screenshotting it). */
      const kind = detectKind(file)
      setStatusMsg(t('Reading document…', 'قراءة المستند…'))
      const imageContent = []

      if (kind === 'pdf') {
        const arrayBuffer = await file.arrayBuffer()
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

        for (let i = 1; i <= pdf.numPages; i++) {
          setStatusMsg(t(`Rendering page ${i} of ${pdf.numPages}…`, `تجهيز صفحة ${i} من ${pdf.numPages}…`))
          const page = await pdf.getPage(i)
          const viewport = page.getViewport({ scale: 3.0 })
          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')
          canvas.width = viewport.width
          canvas.height = viewport.height
          await page.render({ canvasContext: ctx, viewport }).promise
          imageContent.push({
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: canvas.toDataURL('image/png').split(',')[1] },
          })
        }
      } else {
        let docText = ''
        try {
          if (kind === 'sheet') docText = await extractSheetText(file)
          else if (kind === 'json') docText = await extractJsonText(file)
          else docText = await extractDocxText(file)
        } catch (exErr) {
          const why = {
            EMPTY_WORKBOOK: t('That spreadsheet has no data in any sheet.', 'جدول البيانات لا يحتوي على أي بيانات.'),
            DOCX_EMPTY: t('That Word file appears to be empty.', 'ملف Word يبدو فارغاً.'),
            JSON_EMPTY: t('That JSON file is empty.', 'ملف JSON فارغ.'),
            JSON_INVALID: t(`That file is not valid JSON. ${exErr.detail || ''}`.trim(),
                            `الملف ليس JSON صالحاً. ${exErr.detail || ''}`.trim()),
          }[exErr?.message]
          throw new Error(why || t(
            'Could not read that file. Try re-saving it, or export it as PDF.',
            'تعذّرت قراءة الملف. حاول حفظه من جديد أو تصديره بصيغة PDF.'))
        }
        // Keep well inside the model's context; these documents are tabular.
        const MAX = 180_000
        if (docText.length > MAX) docText = `${docText.slice(0, MAX)}\n…[truncated]`
        imageContent.push({
          type: 'text',
          text: `Document file name: ${file.name}\n\n${docText}`,
        })
      }

      // Step 2: Call Claude API
      setStatusMsg(t('Analyzing with AI…', 'تحليل بالذكاء الاصطناعي…'))

      const monthName = monthLabel(reportId, 'en')
      const sectionName = nameEn

      imageContent.push({
        type: 'text',
        text: `You are analyzing a report section submitted by an employee of Fujairah Martial Arts Club Operations Department. This is the [${sectionName}] section for [${monthName}].

Extract ALL information from this document and return a JSON object with ONLY these fields (keep values concise):
{
  "summary": "2-3 sentence summary in English",
  "summaryAr": "2-3 sentence summary in Arabic",
  "keyPoints": ["up to 8 bullet points of main findings in English"],
  "keyPointsAr": ["same points in Arabic"],
  "tables": [{"title": "table title", "headers": ["col1","col2"], "rows": [["val1","val2"]]}],
  "numbers": {"metric label": "value with unit"}
}
Do NOT include a rawText field. Return ONLY valid JSON, no markdown, no backticks, no trailing text.`
      })

      const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
      if (!apiKey) throw new Error('Anthropic API key missing')

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: 'claude-opus-4-5',
          max_tokens: 8000,
          messages: [{ role: 'user', content: imageContent }]
        })
      })

      if (!response.ok) {
        const errData = await response.json()
        throw new Error(errData.error?.message || response.statusText)
      }

      const data = await response.json()
      const text = data.content[0].text
      const cleaned = text.replace(/```json|```/g, '').trim()

      // Extract the JSON object robustly — handles truncated responses
      let parsed
      try {
        parsed = JSON.parse(cleaned)
      } catch {
        // Try to extract the JSON object between the first { and last }
        const start = cleaned.indexOf('{')
        const end = cleaned.lastIndexOf('}')
        if (start !== -1 && end !== -1 && end > start) {
          try {
            parsed = JSON.parse(cleaned.slice(start, end + 1))
          } catch {
            throw new Error(t(
              'AI returned incomplete JSON. The document may be too large — try splitting it into smaller sections.',
              'استجابة الذكاء الاصطناعي غير مكتملة. قد يكون المستند كبيراً جداً — حاول تقسيمه إلى أقسام أصغر.'
            ))
          }
        } else {
          throw new Error(t(
            'AI returned incomplete JSON. The document may be too large — try splitting it into smaller sections.',
            'استجابة الذكاء الاصطناعي غير مكتملة. قد يكون المستند كبيراً جداً — حاول تقسيمه إلى أقسام أصغر.'
          ))
        }
      }

      // Add original filename
      parsed.originalFileName = file.name

      setAiResult(parsed)
      setRawText('')
      setStep('preview')

    } catch (e) {
      console.error('Analysis error:', e)
      setError(e.message || t('Analysis failed', 'فشل التحليل'))
      setStep('upload')
    }
  }, [file, reportId, nameEn, t])

  // ── Submit for Review ───────────────────────────────────
  const handleSubmit = async () => {
    if (!aiResult || !section?.id) return
    setSubmitting(true)
    setError(null)

    try {
      // Step 1: Try uploading PDF to Firebase Storage (non-blocking)
      let pdfUrl = null
      if (file) {
        try {
          const storagePath = `report_sections/${reportId}/${section.sectionKey}/${file.name}`
          const storageRef = ref(storage, storagePath)
          await uploadBytes(storageRef, file)
          pdfUrl = await getDownloadURL(storageRef)
        } catch (storageErr) {
          console.warn('PDF Storage upload failed (permissions). Continuing without file attachment:', storageErr.message)
          // Don't block — content is the important part
        }
      }

      // Step 2: Save extracted content to Firestore (critical)
      // We normalize the aiResult to ensure no non-serializable data causes Firestore errors
      const normalizedContent = JSON.parse(JSON.stringify(aiResult || {}))
      
      await updateDoc(doc(db, 'report_sections', section.id), {
        content: JSON.stringify(normalizedContent),
        attachments: pdfUrl ? [pdfUrl] : [],
        status: 'submitted',
        submittedBy: user?.email || user?.uid || '',
        submittedAt: serverTimestamp(),
      })

      onSubmitted?.()
    } catch (e) {
      console.error('Submit error:', e)
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  // ── Re-upload ───────────────────────────────────────────
  const handleReupload = () => {
    if (section?.type === 'auto') return // Not applicable
    setFile(null)
    setAiResult(null)
    setError(null)
    setStep('upload')
  }

  // ── Rich block editing ──────────────────────────────────
  const enterEdit = () => {
    setBlocks(migrateToBlocks(aiResult || {}))
    setIsEditing(true)
  }

  const cancelEdit = () => {
    setIsEditing(false)
    setBlocks([])
  }

  const handleSaveBlocks = async () => {
    if (!section?.id) return
    setSavingBlocks(true)
    setError(null)
    try {
      // Blocks are the source of truth; keep a legacy projection for back-compat.
      const legacy = blocksToLegacy(blocks)
      const merged = { ...(aiResult || {}), ...legacy, blocks }
      const normalizedContent = JSON.parse(JSON.stringify(merged))

      await updateDoc(doc(db, 'report_sections', section.id), {
        content: JSON.stringify(normalizedContent),
        editedBy: user?.email || user?.uid || '',
        editedAt: serverTimestamp(),
      })

      setAiResult(merged)
      setIsEditing(false)
      onSubmitted?.()
    } catch (e) {
      console.error('Save blocks error:', e)
      setError(e.message)
    } finally {
      setSavingBlocks(false)
    }
  }

  // ── Update AI result fields ─────────────────────────────
  const updateSummary = (val) => setAiResult(p => ({ ...p, summary: val }))
  const updateKeyPoint = (idx, val) => {
    setAiResult(p => {
      const kp = [...(p.keyPoints || [])]
      kp[idx] = val
      return { ...p, keyPoints: kp }
    })
  }
  const removeKeyPoint = (idx) => {
    setAiResult(p => ({
      ...p,
      keyPoints: (p.keyPoints || []).filter((_, i) => i !== idx)
    }))
  }

  const toggleTable = (idx) => {
    setExpandedTables(p => ({ ...p, [idx]: !p[idx] }))
  }

  return (
    <div className="sf-overlay" onClick={onClose}>
      <motion.div
        className="sf-modal"
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sf-header">
          <div className="sf-header-left">
            <div className="sf-header-names">
              <span className="sf-header-ar">{nameAr}</span>
              <span className="sf-header-en">{nameEn}</span>
            </div>
            <div className="sf-header-period">
              <Clock size={11} />
              {monthLabel(reportId, lang)}
            </div>
          </div>
          <button className="rpt-icon-btn" onClick={onClose}>
            <X size={17} />
          </button>
        </div>

        {/* Body */}
        <div className="sf-body">

          {/* ═══ STEP: UPLOAD ═══ */}
          {step === 'upload' && (
            <>
              {section?.type === 'auto' ? (
                <div className="rsu-auto-prompt" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '40px 20px' }}>
                  <Clock size={48} strokeWidth={1} style={{ opacity: 0.2, marginBottom: 16, color: 'var(--theme-accent)' }} />
                  <h3 style={{ margin: '0 0 10px', fontSize: '1.2rem', fontWeight: 700 }}>{t('System Data Required', 'مطلوب بيانات النظام')}</h3>
                  <p style={{ margin: '0 0 24px', color: 'var(--theme-text-muted)', fontSize: '0.9rem', lineHeight: 1.6, maxWidth: '300px' }}>
                    {t('This section is automated. Please use the "Import System Data" button on the dashboard to populate this report.', 'هذا القسم آلي. يرجى استخدام زر "استيراد بيانات النظام" من لوحة التحكم لملء هذا التقرير.')}
                  </p>
                  <button className="rpt-btn-primary" onClick={onClose}>
                    {t('Go back to Dashboard', 'العودة للوحة التحكم')}
                  </button>
                </div>
              ) : (
                <>
                  <div className="sf-period-display">
                    <Clock size={13} />
                    {t('Reporting Period:', 'فترة التقرير:')} {monthLabel(reportId, lang)}
                  </div>

                  {error && (
                    <div className="sf-validation-msg">
                      <AlertCircle size={14} /> {error}
                    </div>
                  )}

                  <div
                    className={`rsu-dropzone ${dragOver ? 'rsu-dropzone-active' : ''} ${file ? 'rsu-dropzone-has-file' : ''}`}
                    onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={ACCEPT_ATTR}
                      hidden
                      onChange={e => handleFile(e.target.files[0])}
                    />
                    {file ? (
                      <div className="rsu-file-info">
                        <FileText size={28} style={{ color: 'var(--theme-accent)' }} />
                        <div className="rsu-file-details">
                          <span className="rsu-file-name">{file.name}</span>
                          <span className="rsu-file-size">{formatFileSize(file.size)}</span>
                        </div>
                        <button
                          className="rsu-file-remove"
                          onClick={e => { e.stopPropagation(); setFile(null) }}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <div className="rsu-drop-content">
                        <Upload size={36} style={{ opacity: 0.4, color: 'var(--theme-accent)' }} />
                        <p className="rsu-drop-title">
                          {t('Drop a file here or click to browse', 'أسقط الملف هنا أو انقر للتصفح')}
                        </p>
                        <p className="rsu-drop-hint">
                          {t('PDF, Excel, Word or JSON — max 10MB', 'PDF أو Excel أو Word أو JSON — بحد أقصى 10 ميجابايت')}
                        </p>
                      </div>
                    )}
                  </div>

                  <button
                    className="sf-btn sf-btn-submit"
                    style={{ width: '100%', padding: '12px', justifyContent: 'center', gap: 8 }}
                    disabled={!file}
                    onClick={startAnalysis}
                  >
                    <FileText size={15} />
                    {t('Upload & Analyze', 'رفع وتحليل')}
                  </button>

                  {canEdit && (
                    <button
                      className="sf-btn sf-btn-ghost"
                      style={{ width: '100%', padding: '11px', justifyContent: 'center', gap: 8, marginTop: 10 }}
                      onClick={() => { setAiResult({}); setBlocks(migrateToBlocks({})); setIsEditing(true); setStep('preview') }}
                    >
                      <Pencil size={14} />
                      {t('Build manually (no file)', 'إنشاء يدوي (بدون ملف)')}
                    </button>
                  )}
                </>
              )}
            </>
          )}

          {/* ═══ STEP: ANALYZING ═══ */}
          {step === 'analyzing' && (
            <div className="rsu-analyzing">
              <div className="rsu-analyzing-spinner">
                <RefreshCw size={28} className="rpt-spin" style={{ color: 'var(--theme-accent)' }} />
              </div>
              <h3 className="rsu-analyzing-title">
                {t('Analyzing Document', 'تحليل المستند')}
              </h3>
              <p className="rsu-analyzing-msg">{statusMsg}</p>
              <div className="rsu-analyzing-bar">
                <div className="rsu-analyzing-bar-fill" />
              </div>
            </div>
          )}

          {/* ═══ STEP: PREVIEW ═══ */}
          {(step === 'preview' || step === 'editing') && aiResult && (
            <>
              {error && (
                <div className="sf-validation-msg">
                  <AlertCircle size={14} /> {error}
                </div>
              )}

              {isEditing ? (
                <ReportBlockEditor
                  blocks={blocks}
                  setBlocks={setBlocks}
                  reportId={reportId}
                  sectionKey={section?.sectionKey}
                  t={t}
                />
              ) : (
              <>
              {canEdit && (
                <button className="rbe-edit-cta" onClick={enterEdit}>
                  <Pencil size={13} /> {t('Edit Report Content', 'تعديل محتوى التقرير')}
                </button>
              )}

              {aiResult.blocks?.length > 0 ? (
                <ReadOnlyBlocks blocks={aiResult.blocks} />
              ) : (
              <>
              {/* Summary */}
              <div className="rsu-preview-section">
                <div className="rsu-preview-label">
                  <FileText size={12} />
                  {t('AI Summary', 'ملخص الذكاء الاصطناعي')}
                </div>
                <textarea
                  className="sf-textarea"
                  rows={3}
                  value={aiResult.summary || ''}
                  onChange={e => updateSummary(e.target.value)}
                  placeholder={t('Summary…', 'الملخص…')}
                />
                {aiResult.summaryAr && (
                  <div className="rsu-summary-ar" dir="rtl">
                    {aiResult.summaryAr}
                  </div>
                )}
              </div>

              {/* Key Points */}
              {aiResult.keyPoints?.length > 0 && (
                <div className="rsu-preview-section">
                  <div className="rsu-preview-label">
                    {t('Key Points', 'النقاط الرئيسية')}
                  </div>
                  <div className="rsu-keypoints">
                    {aiResult.keyPoints.map((point, i) => (
                      <div key={i} className="rsu-keypoint-row">
                        <span className="rsu-keypoint-bullet">{i + 1}</span>
                        <input
                          type="text"
                          className="sf-input rsu-keypoint-input"
                          value={point}
                          onChange={e => updateKeyPoint(i, e.target.value)}
                        />
                        <button
                          className="sf-row-remove-btn"
                          onClick={() => removeKeyPoint(i)}
                        >
                          <X size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Numbers/Metrics */}
              {aiResult.numbers && Object.keys(aiResult.numbers).length > 0 && (
                <div className="rsu-preview-section">
                  <div className="rsu-preview-label">
                    {t('Key Metrics', 'المقاييس الرئيسية')}
                  </div>
                  <div className="rsu-metrics-grid">
                    {Object.entries(aiResult.numbers).map(([label, value], i) => (
                      <div key={i} className="rsu-metric-card">
                        <span className="rsu-metric-label">{label}</span>
                        <span className="rsu-metric-value">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tables */}
              {aiResult.tables?.length > 0 && (
                <div className="rsu-preview-section">
                  <div className="rsu-preview-label">
                    {t('Tables Found', 'الجداول المستخرجة')}
                  </div>
                  {aiResult.tables.map((tbl, idx) => (
                    <div key={idx} className="rsu-table-block">
                      <button
                        className="rsu-table-toggle"
                        onClick={() => toggleTable(idx)}
                      >
                        <span>{tbl.title || `${t('Table', 'جدول')} ${idx + 1}`}</span>
                        {expandedTables[idx] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                      {expandedTables[idx] && tbl.headers && (
                        <div className="sf-table-wrap">
                          <table className="sf-table">
                            <thead>
                              <tr>
                                {tbl.headers.map((h, hi) => <th key={hi}>{h}</th>)}
                              </tr>
                            </thead>
                            <tbody>
                              {(tbl.rows || []).map((row, ri) => (
                                <tr key={ri}>
                                  {row.map((cell, ci) => <td key={ci}>{cell}</td>)}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              </>
              )}

              {/* Raw Text (toggle) */}
              <div className="rsu-preview-section">
                <button
                  className="rsu-raw-toggle"
                  onClick={() => setEditingRaw(!editingRaw)}
                >
                  <Edit3 size={12} />
                  {editingRaw
                    ? t('Hide Raw Text', 'إخفاء النص الخام')
                    : t('Edit Raw Text', 'تعديل النص الخام')
                  }
                </button>
                {editingRaw && (
                  <textarea
                    className="sf-textarea"
                    rows={8}
                    value={rawText}
                    onChange={e => {
                      setRawText(e.target.value)
                      setAiResult(p => ({ ...p, rawText: e.target.value }))
                    }}
                    style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
                  />
                )}
              </div>

              {/* PDF link for HOD review */}
              {section?.attachments?.[0] && (
                <div className="rsu-preview-section">
                  <a
                    href={section.attachments[0]}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rsu-pdf-link"
                  >
                    <Eye size={13} />
                    {t('View original file', 'عرض الملف الأصلي')}
                  </a>
                </div>
              )}
              </>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="sf-footer">
          {step === 'upload' && (
            <button className="sf-btn sf-btn-ghost" onClick={onClose}>
              {t('Cancel', 'إلغاء')}
            </button>
          )}

          {step === 'analyzing' && (
            <button className="sf-btn sf-btn-ghost" onClick={() => { setStep('upload'); setError(null) }}>
              {t('Cancel', 'إلغاء')}
            </button>
          )}

          {(step === 'preview' || step === 'editing') && isEditing && (
            <>
              <div className="sf-footer-left">
                <button className="sf-btn sf-btn-ghost" onClick={cancelEdit} disabled={savingBlocks}>
                  {t('Cancel', 'إلغاء')}
                </button>
              </div>
              <button
                className="sf-btn sf-btn-submit"
                onClick={handleSaveBlocks}
                disabled={savingBlocks}
                style={{ padding: '10px 24px' }}
              >
                {savingBlocks ? (
                  <><RefreshCw size={13} className="rpt-spin" /> {t('Saving…', 'جارٍ الحفظ…')}</>
                ) : (
                  <><Save size={13} /> {t('Save Changes', 'حفظ التغييرات')}</>
                )}
              </button>
            </>
          )}

          {(step === 'preview' || step === 'editing') && !isEditing && (
            <>
              <div className="sf-footer-left">
                {section?.type !== 'auto' && (
                  <button className="sf-btn sf-btn-ghost" onClick={handleReupload}>
                    <RotateCcw size={13} />
                    {t('Re-upload', 'إعادة الرفع')}
                  </button>
                )}
              </div>
              {/* Only show submit if not already submitted (HOD reviewing) */}
              {section?.status !== 'submitted' && section?.status !== 'approved' ? (
                <button
                  className="sf-btn sf-btn-submit"
                  onClick={handleSubmit}
                  disabled={submitting}
                  style={{ padding: '10px 24px' }}
                >
                  {submitting ? (
                    <><RefreshCw size={13} className="rpt-spin" /> {t('Submitting…', 'جارٍ التقديم…')}</>
                  ) : (
                    <><Send size={13} /> {t('Looks good — Submit', 'يبدو جيداً — تقديم')}</>
                  )}
                </button>
              ) : (
                <button className="sf-btn sf-btn-ghost" onClick={onClose}>
                  {t('Close', 'إغلاق')}
                </button>
              )}
            </>
          )}
        </div>
      </motion.div>
    </div>
  )
}
