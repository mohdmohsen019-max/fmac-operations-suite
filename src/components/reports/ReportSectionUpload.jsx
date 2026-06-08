import { useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Upload, FileText, X, Clock, RefreshCw, Check, AlertCircle,
  Edit3, RotateCcw, Send, ChevronDown, ChevronUp, Eye
} from 'lucide-react'
import * as pdfjsLib from 'pdfjs-dist'
import { db, storage } from '../../firebase'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import './SubmissionForms.css'

// PDF.js worker — same setup as pdfService.js
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.js',
  import.meta.url
).href

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

export default function ReportSectionUpload({ section, reportId, user, lang, t, onClose, onSubmitted, isHOD }) {
  // Steps: 'upload' | 'analyzing' | 'preview' | 'editing'
  const [step, setStep] = useState(() => {
    // If section already has content & is submitted/approved, go straight to preview
    let content = section?.content
    if (typeof content === 'string') {
      try { content = JSON.parse(content) } catch (e) {}
    }
    if ((section?.status === 'submitted' || section?.status === 'approved') && content?.summary) return 'preview'
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
    if (content?.summary) return content
    return null
  })
  const [submitting, setSubmitting] = useState(false)
  const [editingRaw, setEditingRaw] = useState(false)
  const [rawText, setRawText] = useState('')
  const [expandedTables, setExpandedTables] = useState({})
  const fileInputRef = useRef(null)

  const nameAr = section?.sectionNameAr || ''
  const nameEn = section?.sectionNameEn || ''

  // ── File selection ──────────────────────────────────────
  const handleFile = (f) => {
    if (!f) return
    if (f.type !== 'application/pdf') {
      setError(t('Please select a PDF file only.', 'يرجى اختيار ملف PDF فقط.'))
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
      // Step 1: Render PDF pages to images
      setStatusMsg(t('Reading document…', 'قراءة المستند…'))
      const arrayBuffer = await file.arrayBuffer()
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
      const pagesBase64 = []

      for (let i = 1; i <= pdf.numPages; i++) {
        setStatusMsg(t(`Rendering page ${i} of ${pdf.numPages}…`, `تجهيز صفحة ${i} من ${pdf.numPages}…`))
        const page = await pdf.getPage(i)
        const viewport = page.getViewport({ scale: 3.0 })
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        canvas.width = viewport.width
        canvas.height = viewport.height
        await page.render({ canvasContext: ctx, viewport }).promise
        pagesBase64.push(canvas.toDataURL('image/png').split(',')[1])
      }

      // Step 2: Call Claude Vision API
      setStatusMsg(t('Analyzing with AI…', 'تحليل بالذكاء الاصطناعي…'))

      const monthName = monthLabel(reportId, 'en')
      const sectionName = nameEn

      const imageContent = pagesBase64.map(img => ({
        type: 'image',
        source: { type: 'base64', media_type: 'image/png', data: img }
      }))

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
                      accept=".pdf"
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
                          {t('Drop PDF here or click to browse', 'أسقط ملف PDF هنا أو انقر للتصفح')}
                        </p>
                        <p className="rsu-drop-hint">
                          {t('PDF only, max 10MB', 'PDF فقط، بحد أقصى 10 ميجابايت')}
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
                    {t('View Original PDF', 'عرض ملف PDF الأصلي')}
                  </a>
                </div>
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

          {(step === 'preview' || step === 'editing') && (
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
