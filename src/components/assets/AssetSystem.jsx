import { useState, useRef } from 'react'
import { motion } from 'framer-motion'
import {
  Upload, FileSpreadsheet, AlertTriangle, FileText, RefreshCw, Check, X, Download,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import { db } from '../../firebase'
import { collection, doc, writeBatch, serverTimestamp } from 'firebase/firestore'
import { daysSince, roomLabel } from './shared'
import CustomSelect from '../CustomSelect'
import AssetRoomReport from './AssetRoomReport'

// Map a spreadsheet row's flexible headers to our fields.
function pick(row, keys) {
  for (const k of Object.keys(row)) {
    const norm = k.toLowerCase().replace(/[^a-z]/g, '')
    if (keys.some(want => norm.includes(want))) {
      const v = row[k]
      return v == null ? '' : String(v).trim()
    }
  }
  return ''
}

const MISSING_DAYS = 90

export default function AssetSystem({ assets, rooms, lang, t, actorUid, actorName }) {
  // ── Excel import ──────────────────────────────────────────────────
  const fileRef = useRef(null)
  const [parsed, setParsed] = useState(null)   // { valid: [], skipped: [] }
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [importError, setImportError] = useState('')

  const handleFile = async (file) => {
    if (!file) return
    setImportError(''); setImportResult(null); setParsed(null)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' })
      const valid = [], skipped = []
      rows.forEach((row, i) => {
        // Disjoint matches so the EN/AR columns never cross-map regardless of order.
        const name_en = pick(row, ['nameen', 'englishname'])
        const name_ar = pick(row, ['namear', 'arabicname'])
        const sku = pick(row, ['sku'])
        const barcode = pick(row, ['barcode'])
        if (!barcode || !sku) skipped.push({ rowNum: i + 2, name_en, reason: t('Missing SKU or barcode', 'SKU أو باركود مفقود') })
        else valid.push({ name_en, name_ar, sku, barcode })
      })
      if (valid.length === 0 && skipped.length === 0) {
        setImportError(t('No rows found in the file.', 'لا توجد صفوف في الملف.'))
        return
      }
      setParsed({ valid, skipped })
    } catch (e) {
      console.error('[assets] parse failed:', e)
      setImportError(t('Could not read the Excel file.', 'تعذر قراءة ملف Excel.'))
    }
  }

  const confirmImport = async () => {
    if (!parsed?.valid?.length) return
    setImporting(true)
    try {
      // Chunk into batches (Firestore limit 500 writes/batch; each asset = 1 write + 1 audit).
      const chunkSize = 200
      for (let i = 0; i < parsed.valid.length; i += chunkSize) {
        const batch = writeBatch(db)
        for (const v of parsed.valid.slice(i, i + chunkSize)) {
          const ref = doc(collection(db, 'assets'))
          batch.set(ref, {
            name_en: v.name_en, name_ar: v.name_ar, sku: v.sku, barcode: v.barcode,
            category: '', type: '', location_room: '', assigned_to: '',
            status: 'Active', notes: '',
            created_at: serverTimestamp(), last_updated: serverTimestamp(), last_updated_by: actorUid,
          })
          const logRef = doc(collection(db, 'asset_audit_log'))
          batch.set(logRef, {
            asset_id: ref.id, asset_name_en: v.name_en,
            changed_by: actorUid, changed_by_name: actorName,
            change_type: 'created', previous_value: '', new_value: 'Excel import',
            timestamp: serverTimestamp(),
          })
        }
        await batch.commit()
      }
      setImportResult({ imported: parsed.valid.length, skipped: parsed.skipped.length })
      setParsed(null)
      if (fileRef.current) fileRef.current.value = ''
    } catch (e) {
      console.error('[assets] import failed:', e)
      setImportError(e.message || t('Import failed.', 'فشل الاستيراد.'))
    } finally {
      setImporting(false)
    }
  }

  // ── Auto-flag Missing assets (>90 days, Active) ───────────────────
  const candidates = assets.filter(a => a.status === 'Active' && daysSince(a.last_updated) > MISSING_DAYS)
  const [flagging, setFlagging] = useState(false)
  const [flagResult, setFlagResult] = useState(null)
  const [flagConfirm, setFlagConfirm] = useState(false)

  const runAuditFlag = async () => {
    if (candidates.length === 0) return
    setFlagging(true)
    try {
      const chunkSize = 200
      for (let i = 0; i < candidates.length; i += chunkSize) {
        const batch = writeBatch(db)
        for (const a of candidates.slice(i, i + chunkSize)) {
          batch.update(doc(db, 'assets', a.id), { status: 'Missing', last_updated: serverTimestamp(), last_updated_by: actorUid })
          const logRef = doc(collection(db, 'asset_audit_log'))
          batch.set(logRef, {
            asset_id: a.id, asset_name_en: a.name_en,
            changed_by: actorUid, changed_by_name: actorName,
            change_type: 'status_change', previous_value: 'Active', new_value: 'Missing',
            timestamp: serverTimestamp(),
          })
        }
        await batch.commit()
      }
      setFlagResult({ flagged: candidates.length })
      setFlagConfirm(false)
    } catch (e) {
      console.error('[assets] audit flag failed:', e)
    } finally {
      setFlagging(false)
    }
  }

  // ── Printable Room Report (html2canvas → jsPDF) ───────────────────
  const [reportRoomId, setReportRoomId] = useState('all')
  const [generating, setGenerating] = useState(false)
  const [reportRooms, setReportRooms] = useState(null) // rooms to render offscreen

  const generateReport = async () => {
    const targetRooms = reportRoomId === 'all' ? rooms : rooms.filter(r => r.id === reportRoomId)
    if (targetRooms.length === 0) return
    setGenerating(true)
    setReportRooms(targetRooms)
    // Wait for the offscreen DOM + fonts to be ready.
    await new Promise(res => setTimeout(res, 400))
    try {
      await document.fonts?.ready
      const pages = Array.from(document.querySelectorAll('#ast-report-root .ast-report-page'))
      if (pages.length === 0) throw new Error('No report pages rendered')
      const pdf = new jsPDF('p', 'mm', 'a4', true)
      for (let i = 0; i < pages.length; i++) {
        const canvas = await html2canvas(pages[i], { scale: 2, useCORS: true, backgroundColor: '#ffffff', windowWidth: 794, windowHeight: 1122 })
        const img = canvas.toDataURL('image/jpeg', 0.92)
        if (i > 0) pdf.addPage()
        pdf.addImage(img, 'JPEG', 0, 0, 210, 297, undefined, 'FAST')
      }
      const label = reportRoomId === 'all' ? 'All-Rooms' : (rooms.find(r => r.id === reportRoomId)?.name_en || 'Room').replace(/\s+/g, '-')
      pdf.save(`FMAC-Assets-${label}-${new Date().toISOString().slice(0, 10)}.pdf`)
    } catch (e) {
      console.error('[assets] report generation failed:', e)
    } finally {
      setReportRooms(null)
      setGenerating(false)
    }
  }

  return (
    <div className="ast-page">
      <div className="ast-page-header">
        <div>
          <h2 className="ast-page-title">{t('System', 'النظام')}</h2>
          <p className="ast-page-sub">{t('Import, audit, and reporting tools', 'أدوات الاستيراد والتدقيق والتقارير')}</p>
        </div>
      </div>

      {/* ── Excel Import ── */}
      <section className="ast-sys-card">
        <div className="ast-sys-card-head">
          <FileSpreadsheet size={18} />
          <div>
            <h3>{t('Excel Import', 'استيراد من Excel')}</h3>
            <p>{t('Columns: Asset Name (EN), Asset Name (AR), SKU, Barcode', 'الأعمدة: اسم الأصل (إنجليزي)، اسم الأصل (عربي)، SKU، الباركود')}</p>
          </div>
        </div>

        {importError && <div className="ast-form-error">{importError}</div>}

        {!parsed && !importResult && (
          <button className="ast-dropzone" onClick={() => fileRef.current?.click()}>
            <Upload size={26} />
            <span>{t('Choose an .xlsx file', 'اختر ملف .xlsx')}</span>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" hidden onChange={e => handleFile(e.target.files[0])} />
          </button>
        )}

        {parsed && (
          <div className="ast-import-preview">
            <div className="ast-import-stats">
              <span className="ast-import-stat ok">{parsed.valid.length} {t('ready to import', 'جاهز للاستيراد')}</span>
              {parsed.skipped.length > 0 && <span className="ast-import-stat warn">{parsed.skipped.length} {t('skipped', 'تم تخطيها')}</span>}
            </div>
            <div className="ast-table-wrap" style={{ maxHeight: 240, overflowY: 'auto' }}>
              <table className="ast-table">
                <thead><tr><th>{t('Name (EN)', 'الاسم')}</th><th>{t('Name (AR)', 'عربي')}</th><th>SKU</th><th>{t('Barcode', 'باركود')}</th></tr></thead>
                <tbody>
                  {parsed.valid.slice(0, 50).map((v, i) => (
                    <tr key={i}><td>{v.name_en || '—'}</td><td dir="rtl" style={{ fontFamily: "'Tajawal', sans-serif" }}>{v.name_ar || '—'}</td><td>{v.sku}</td><td className="ast-mono">{v.barcode}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            {parsed.valid.length > 50 && <p className="ast-muted" style={{ fontSize: '0.78rem' }}>{t('Showing first 50 rows…', 'عرض أول 50 صفاً…')}</p>}
            {parsed.skipped.length > 0 && (
              <details className="ast-skipped">
                <summary>{parsed.skipped.length} {t('rows skipped (missing SKU or barcode)', 'صف تم تخطيه (SKU أو باركود مفقود)')}</summary>
                <ul>{parsed.skipped.slice(0, 30).map((s, i) => <li key={i}>{t('Row', 'صف')} {s.rowNum}: {s.name_en || '—'}</li>)}</ul>
              </details>
            )}
            <div className="ast-import-actions">
              <button className="ast-btn ast-btn-ghost" onClick={() => { setParsed(null); if (fileRef.current) fileRef.current.value = '' }} disabled={importing}>{t('Cancel', 'إلغاء')}</button>
              <button className="ast-btn ast-btn-primary" onClick={confirmImport} disabled={importing || parsed.valid.length === 0}>
                {importing ? <><RefreshCw size={14} className="ast-spin" /> {t('Importing…', 'جارٍ الاستيراد…')}</> : <><Check size={14} /> {t('Import', 'استيراد')} {parsed.valid.length}</>}
              </button>
            </div>
          </div>
        )}

        {importResult && (
          <div className="ast-import-done">
            <Check size={18} style={{ color: '#10b981' }} />
            <span>{t('Imported', 'تم استيراد')} {importResult.imported} {t('assets', 'أصل')}{importResult.skipped > 0 ? `, ${importResult.skipped} ${t('skipped', 'تم تخطيها')}` : ''}.</span>
            <button className="ast-btn ast-btn-ghost ast-btn-sm" onClick={() => setImportResult(null)}>{t('Import more', 'استيراد المزيد')}</button>
          </div>
        )}
      </section>

      {/* ── Auto-flag Missing ── */}
      <section className="ast-sys-card">
        <div className="ast-sys-card-head">
          <AlertTriangle size={18} />
          <div>
            <h3>{t('Auto-flag Missing Assets', 'تمييز الأصول المفقودة تلقائياً')}</h3>
            <p>{t('Assets that are still "Active" but have not been updated in over 90 days are likely missing. Running this flags them as "Missing" and records each change in the audit log.', 'الأصول التي لا تزال "نشطة" ولم يتم تحديثها منذ أكثر من 90 يوماً يُحتمل أنها مفقودة. تشغيل هذا يميزها كـ "مفقود" ويسجل كل تغيير في سجل التغييرات.')}</p>
          </div>
        </div>

        {flagResult ? (
          <div className="ast-import-done">
            <Check size={18} style={{ color: '#10b981' }} />
            <span>{t('Flagged', 'تم تمييز')} {flagResult.flagged} {t('asset(s) as Missing.', 'أصل كمفقود.')}</span>
            <button className="ast-btn ast-btn-ghost ast-btn-sm" onClick={() => setFlagResult(null)}>{t('Done', 'تم')}</button>
          </div>
        ) : (
          <div className="ast-flag-row">
            <span className="ast-flag-count">
              <strong>{candidates.length}</strong> {t('asset(s) would be flagged.', 'أصل سيتم تمييزه.')}
            </span>
            {!flagConfirm ? (
              <button className="ast-btn ast-btn-primary ast-btn-sm" onClick={() => setFlagConfirm(true)} disabled={candidates.length === 0}>
                <AlertTriangle size={14} /> {t('Run Audit Flag', 'تشغيل التدقيق')}
              </button>
            ) : (
              <div className="ast-flag-confirm">
                <span>{t('Flag', 'تمييز')} {candidates.length}?</span>
                <button className="ast-btn ast-btn-ghost ast-btn-sm" onClick={() => setFlagConfirm(false)} disabled={flagging}>{t('Cancel', 'إلغاء')}</button>
                <button className="ast-btn ast-btn-primary ast-btn-sm" onClick={runAuditFlag} disabled={flagging}>
                  {flagging ? <><RefreshCw size={13} className="ast-spin" /> {t('Running…', 'جارٍ…')}</> : t('Confirm', 'تأكيد')}
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Printable Room Report ── */}
      <section className="ast-sys-card">
        <div className="ast-sys-card-head">
          <FileText size={18} />
          <div>
            <h3>{t('Printable Room Report', 'تقرير الغرف للطباعة')}</h3>
            <p>{t('Bilingual A4 PDF listing all assets in a room.', 'ملف PDF ثنائي اللغة بحجم A4 يسرد جميع الأصول في الغرفة.')}</p>
          </div>
        </div>
        <div className="ast-report-controls">
          <div style={{ flex: 1, minWidth: 200 }}>
            <CustomSelect value={reportRoomId} onChange={setReportRoomId}
              options={[{ value: 'all', label: t('All Rooms', 'كل الغرف') }, ...rooms.map(r => ({ value: r.id, label: roomLabel(r, lang) }))]} />
          </div>
          <button className="ast-btn ast-btn-primary ast-btn-sm" onClick={generateReport} disabled={generating || rooms.length === 0}>
            {generating ? <><RefreshCw size={14} className="ast-spin" /> {t('Generating…', 'جارٍ الإنشاء…')}</> : <><Download size={14} /> {t('Generate Report', 'إنشاء التقرير')}</>}
          </button>
        </div>
        {rooms.length === 0 && <p className="ast-muted" style={{ fontSize: '0.8rem' }}>{t('Create a room first.', 'أنشئ غرفة أولاً.')}</p>}
      </section>

      {/* Offscreen report DOM for capture */}
      {reportRooms && (
        <div style={{ position: 'fixed', left: -99999, top: 0, zIndex: -1 }}>
          <AssetRoomReport rooms={reportRooms} assets={assets} lang={lang} />
        </div>
      )}
    </div>
  )
}
