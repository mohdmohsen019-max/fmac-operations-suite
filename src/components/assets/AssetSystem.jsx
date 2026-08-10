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
import {
  daysSince, roomLabel, normalizeCategory, mapStatus, mapCondition,
  matchGoal, classifyGoal, deriveDefaults, criticalityLabel, resolveRoomInfo,
  goalByCode,
} from './shared'
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
  const [parsed, setParsed] = useState(null)   // { valid: [], skipped: [], existingDupes }
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [importError, setImportError] = useState('')
  const [replaceAll, setReplaceAll] = useState(false) // wipe current register before import

  const handleFile = async (file) => {
    if (!file) return
    setImportError(''); setImportResult(null); setParsed(null)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' })

      // In-file duplicate guard; clashes with the current register are counted
      // separately so the user can choose "replace register" instead.
      const existingCodes = new Set((assets || []).map(a => (a.asset_code || '').trim()).filter(Boolean))
      const seen = new Set()
      const valid = [], skipped = []
      let existingDupes = 0

      rows.forEach((row, i) => {
        const asset_code = pick(row, ['assetid', 'assetcode'])
        const name_en = pick(row, ['assetname', 'nameen', 'englishname'])
        if (!asset_code && !name_en) return // truly blank row — ignore silently
        if (!asset_code) { skipped.push({ rowNum: i + 2, name_en, reason: t('Missing Asset ID', 'رقم الأصل مفقود') }); return }
        if (seen.has(asset_code)) {
          skipped.push({ rowNum: i + 2, name_en, reason: t('Duplicate Asset ID in file', 'رقم أصل مكرر في الملف') }); return
        }
        seen.add(asset_code)
        if (existingCodes.has(asset_code)) existingDupes += 1

        const category = normalizeCategory(pick(row, ['category']))
        // Explicit goal column wins if present; otherwise the classifier
        // assigns the pillar from location + category.
        const goalText = pick(row, ['strategicgoal'])
        const goal = matchGoal(goalText)
        const base = {
          asset_code,
          name_en,
          department: pick(row, ['department']),
          category,
          quantity: Number(pick(row, ['quantity'])) || 1,
          unit: pick(row, ['unit']) || 'PCS',
          brand: pick(row, ['brand']),
          manufacturer: pick(row, ['manufactur']),
          serial: pick(row, ['serial']),
          location_code: pick(row, ['locationcode']),
          purchase_cost: Number(pick(row, ['purchasecost'])) || 0,
          purchase_rate: Number(pick(row, ['purchaserate'])) || 0,
          tax_pct: Number(pick(row, ['tax'])) || 0,
          condition: mapCondition(pick(row, ['condition'])),
          status: mapStatus(pick(row, ['status'])),
          rack: pick(row, ['rack']),
          notes: pick(row, ['notes']),
          strategic_goal_code: goal?.code || '',
          strategic_goal_text: goal?.ar || '',
          alreadyExists: existingCodes.has(asset_code),
        }
        const goal_code = base.strategic_goal_code || classifyGoal(base)
        valid.push({ ...base, ...deriveDefaults(base), goal_code })
      })

      if (valid.length === 0 && skipped.length === 0) {
        setImportError(t('No rows found in the file.', 'لا توجد صفوف في الملف.'))
        return
      }
      setReplaceAll(existingDupes > 0) // most common case: re-importing the register
      setParsed({ valid, skipped, existingDupes })
    } catch (e) {
      console.error('[assets] parse failed:', e)
      setImportError(t('Could not read the Excel file.', 'تعذر قراءة ملف Excel.'))
    }
  }

  const confirmImport = async () => {
    if (!parsed?.valid?.length) return
    setImporting(true)
    try {
      // 0. Optional wipe — replace the whole register (assets only; rooms and
      //    the audit trail are preserved).
      let removed = 0
      if (replaceAll && assets.length > 0) {
        const ids = assets.map(a => a.id)
        for (let i = 0; i < ids.length; i += 400) {
          const batch = writeBatch(db)
          ids.slice(i, i + 400).forEach(id => batch.delete(doc(db, 'assets', id)))
          await batch.commit()
        }
        removed = ids.length
      }

      // 1. Auto-create rooms from the register's Location Code column (the
      //    source of truth — one room per code; department is only a naming
      //    fallback for the few rows with no code). Build a resolver-key →
      //    room-id map for linking, seeded with rooms already in Firestore.
      const roomIdByKey = {}
      for (const r of rooms) {
        const key = r.floor ? `CODE:${r.floor}` : (r.name_en ? `DEPT:${r.name_en.trim().toUpperCase()}` : '')
        if (key && !roomIdByKey[key]) roomIdByKey[key] = r.id
      }
      const wanted = new Map() // key → room info
      for (const v of parsed.valid) {
        const info = resolveRoomInfo(v)
        if (!info || roomIdByKey[info.key] || wanted.has(info.key)) continue
        wanted.set(info.key, info)
      }
      if (wanted.size > 0) {
        const entries = [...wanted.values()]
        for (let i = 0; i < entries.length; i += 200) {
          const batch = writeBatch(db)
          for (const w of entries.slice(i, i + 200)) {
            const ref = doc(collection(db, 'asset_rooms'))
            batch.set(ref, {
              name_en: w.name_en, name_ar: w.name_ar, floor: w.code || '',
              created_at: serverTimestamp(),
            })
            roomIdByKey[w.key] = ref.id
          }
          await batch.commit()
        }
      }

      // 2. Write assets (skip clashes with the current register unless replacing).
      const toImport = replaceAll ? parsed.valid : parsed.valid.filter(v => !v.alreadyExists)
      const chunkSize = 200
      for (let i = 0; i < toImport.length; i += chunkSize) {
        const batch = writeBatch(db)
        for (const v of toImport.slice(i, i + chunkSize)) {
          const ref = doc(collection(db, 'assets'))
          const info = resolveRoomInfo(v)
          batch.set(ref, {
            asset_code: v.asset_code,
            name_en: v.name_en, name_ar: '',
            sku: v.asset_code, barcode: v.asset_code,
            category: v.category, type: v.category,
            department: v.department, assigned_to: '',
            location_room: info ? (roomIdByKey[info.key] || '') : '',
            quantity: v.quantity, unit: v.unit,
            brand: v.brand, manufacturer: v.manufacturer, serial: v.serial,
            location_code: v.location_code, rack: v.rack,
            purchase_cost: v.purchase_cost, purchase_rate: v.purchase_rate, tax_pct: v.tax_pct,
            condition: v.condition, status: v.status, notes: v.notes,
            strategic_goal_code: v.goal_code, strategic_goal_text: goalByCode(v.goal_code)?.ar || '',
            criticality: v.criticality, useful_life_years: v.useful_life_years,
            replacement_year: v.replacement_year, est_replacement_cost: v.est_replacement_cost,
            funding_source: v.funding_source, utilization: v.utilization,
            created_at: serverTimestamp(), last_updated: serverTimestamp(), last_updated_by: actorUid,
          })
        }
        await batch.commit()
      }

      // 3. One audit entry for the whole operation (not 700 rows of noise).
      const logRef = doc(collection(db, 'asset_audit_log'))
      const summaryBatch = writeBatch(db)
      summaryBatch.set(logRef, {
        asset_id: '', asset_name_en: 'Asset Register',
        changed_by: actorUid, changed_by_name: actorName,
        change_type: 'created',
        previous_value: removed ? `${removed} removed` : '',
        new_value: `Excel import: ${toImport.length} assets, ${wanted.size} rooms created`,
        timestamp: serverTimestamp(),
      })
      await summaryBatch.commit()

      setImportResult({ imported: toImport.length, skipped: parsed.skipped.length + (parsed.valid.length - toImport.length), rooms: wanted.size, removed })
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
            <h3>{t('Import Asset Register', 'استيراد سجل الأصول')}</h3>
            <p>{t('FMAC register format: Asset ID, Name, Location/Department, Location Code, Category, Quantity, Condition… Rooms are created directly from Location Code (F1, CF, G, LR…); criticality, strategic goal & replacement plan are auto-derived (editable later).',
                  'صيغة سجل FMAC: رقم الأصل، الاسم، الموقع/القسم، رمز الموقع، الفئة، الكمية، الحالة… تُنشأ الغرف مباشرة من رمز الموقع (F1، CF، G، LR…)، وتُشتق درجة الأهمية والهدف الاستراتيجي وخطة الاستبدال تلقائياً (قابلة للتعديل لاحقاً).')}</p>
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
            <div className="ast-table-wrap" style={{ maxHeight: 300, overflowY: 'auto' }}>
              <table className="ast-table">
                <thead><tr>
                  <th>{t('Asset ID', 'رقم الأصل')}</th>
                  <th>{t('Name', 'الاسم')}</th>
                  <th>{t('Dept', 'القسم')}</th>
                  <th>{t('Category', 'الفئة')}</th>
                  <th>{t('Criticality', 'الأهمية')}</th>
                  <th>{t('Goal', 'الهدف')}</th>
                </tr></thead>
                <tbody>
                  {parsed.valid.slice(0, 50).map((v, i) => (
                    <tr key={i}>
                      <td className="ast-mono">{v.asset_code}</td>
                      <td>{v.name_en || '—'}</td>
                      <td>{v.department || '—'}</td>
                      <td>{v.category || '—'}</td>
                      <td>{criticalityLabel(v.criticality, lang)}</td>
                      <td><span style={{ color: goalByCode(v.goal_code)?.color, fontWeight: 700 }}>{v.goal_code}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {parsed.valid.length > 50 && <p className="ast-muted" style={{ fontSize: '0.78rem' }}>{t('Showing first 50 rows…', 'عرض أول 50 صفاً…')}</p>}
            {parsed.skipped.length > 0 && (
              <details className="ast-skipped">
                <summary>{parsed.skipped.length} {t('rows skipped (missing/duplicate Asset ID)', 'صف تم تخطيه (رقم أصل مفقود أو مكرر)')}</summary>
                <ul>{parsed.skipped.slice(0, 30).map((s, i) => <li key={i}>{t('Row', 'صف')} {s.rowNum}: {s.name_en || '—'} — {s.reason}</li>)}</ul>
              </details>
            )}
            {assets.length > 0 && (
              <label className="ast-replace-toggle">
                <input type="checkbox" checked={replaceAll} onChange={e => setReplaceAll(e.target.checked)} disabled={importing} />
                <span>
                  {t(`Replace current register (removes ${assets.length} existing assets first — rooms & audit log are kept)`,
                     `استبدال السجل الحالي (حذف ${assets.length} أصلاً موجوداً أولاً — تبقى الغرف وسجل التغييرات)`)}
                  {parsed.existingDupes > 0 && !replaceAll && (
                    <em> · {parsed.existingDupes} {t('rows clash with existing Asset IDs and will be skipped', 'صفاً يتعارض مع أرقام أصول موجودة وسيتم تخطيه')}</em>
                  )}
                </span>
              </label>
            )}
            <div className="ast-import-actions">
              <button className="ast-btn ast-btn-ghost" onClick={() => { setParsed(null); if (fileRef.current) fileRef.current.value = '' }} disabled={importing}>{t('Cancel', 'إلغاء')}</button>
              <button className="ast-btn ast-btn-primary" onClick={confirmImport} disabled={importing || parsed.valid.length === 0}>
                {importing ? <><RefreshCw size={14} className="ast-spin" /> {t('Importing…', 'جارٍ الاستيراد…')}</> : <><Check size={14} /> {t('Import', 'استيراد')} {replaceAll ? parsed.valid.length : parsed.valid.length - parsed.existingDupes}</>}
              </button>
            </div>
          </div>
        )}

        {importResult && (
          <div className="ast-import-done">
            <Check size={18} style={{ color: '#2c9c5c' }} />
            <span>
              {t('Imported', 'تم استيراد')} {importResult.imported} {t('assets', 'أصل')}
              {importResult.rooms > 0 ? ` · ${importResult.rooms} ${t('rooms created & linked', 'غرفة أُنشئت ورُبطت')}` : ''}
              {importResult.removed > 0 ? ` · ${importResult.removed} ${t('old assets replaced', 'أصل قديم استُبدل')}` : ''}
              {importResult.skipped > 0 ? ` · ${importResult.skipped} ${t('skipped', 'تم تخطيها')}` : ''}.
            </span>
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
            <Check size={18} style={{ color: '#2c9c5c' }} />
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
