import { forwardRef, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import { Download, FileText, Loader2, Printer, X } from 'lucide-react'
import { useLanguage } from '../../contexts/LanguageContext'

function asDate(value) {
  if (!value) return null
  if (typeof value?.toDate === 'function') return value.toDate()
  const parsed = value instanceof Date ? value : new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function dateTime(value, locale) {
  const parsed = asDate(value)
  return parsed ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(parsed) : '—'
}

function approvalName(step) {
  return step?.name || step?.overriddenByName || '—'
}

function approvalStatus(step, t) {
  if (step?.status === 'approved') return t('Approved', 'معتمد')
  if (step?.status === 'overridden') return t('Overridden by Head', 'تم تجاوزه من رئيس العمليات')
  if (step?.status === 'requested') return t('Requested', 'مقدم')
  return t('Pending', 'قيد الانتظار')
}

function safeFileName(value) {
  return String(value || 'stock-issue-voucher').replace(/[\\/:*?"<>|]+/g, '-').trim()
}

export const IssueVoucherDocument = forwardRef(function IssueVoucherDocument({ request, t, locale }, ref) {
  const issuedTo = request.details?.issuedTo || request.issuedTo || {}
  const requester = request.approval?.requester || {}
  const specialist = request.approval?.specialist || {}
  const head = request.approval?.head || {}
  const issueDate = request.appliedAt || request.approvedAt || request.issuedAt
  const evidence = Array.isArray(request.evidence) ? request.evidence : []

  const cell = { padding: '8px 10px', borderBottom: '1px solid #e6e1d8', verticalAlign: 'top' }
  const label = { fontSize: 10, fontWeight: 800, color: '#706a61', letterSpacing: '.04em' }
  const value = { marginTop: 3, fontSize: 12, fontWeight: 700, color: '#111218' }

  return (
    <div ref={ref} className="inv-voucher-document" style={{
      width: 794, minHeight: 1123, padding: '42px 48px 38px', background: '#fff', color: '#111218',
      direction: 'rtl', fontFamily: "'Cairo', 'Inter', Arial, sans-serif", boxSizing: 'border-box',
    }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24, paddingBottom: 20, borderBottom: '3px solid #111218' }}>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: '#a17811', fontSize: 10, fontWeight: 900, letterSpacing: '.14em' }}>FMAC · INVENTORY CONTROL</div>
          <h1 style={{ margin: '6px 0 2px', fontSize: 25, lineHeight: 1.2 }}>إذن صرف مخزون</h1>
          <div style={{ color: '#5f5a52', fontSize: 12 }}>Stock Issue Voucher · نادي الفجيرة للفنون القتالية</div>
        </div>
        <div style={{ minWidth: 190, textAlign: 'left', direction: 'ltr' }}>
          <div style={{ fontSize: 18, fontWeight: 900 }}>{request.receiptNumber || '—'}</div>
          <div style={{ marginTop: 3, color: '#6d675f', fontSize: 10 }}>{request.requestCode || request.id || '—'}</div>
          <div style={{ marginTop: 10, color: '#444', fontSize: 11 }}>{dateTime(issueDate, locale)}</div>
        </div>
      </header>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', marginTop: 22, border: '1px solid #ded8ce', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ padding: 12, borderLeft: '1px solid #e6e1d8' }}><div style={label}>المستلم · RECIPIENT</div><div style={value}>{issuedTo.personName || '—'}</div></div>
        <div style={{ padding: 12, borderLeft: '1px solid #e6e1d8' }}><div style={label}>الرياضة · SPORT</div><div style={value}>{issuedTo.sportAr || issuedTo.sportOther || issuedTo.sport || '—'}</div></div>
        <div style={{ padding: 12 }}><div style={label}>الصفة · ROLE</div><div style={value}>{issuedTo.roleAr || issuedTo.role || '—'}</div></div>
      </section>

      {issuedTo.playerNames && (
        <section style={{ marginTop: 12, padding: '11px 13px', border: '1px solid #e6e1d8', borderRadius: 8, background: '#faf9f7' }}>
          <div style={label}>اللاعبون المستفيدون · BENEFICIARIES</div>
          <div style={{ ...value, whiteSpace: 'pre-line', lineHeight: 1.65 }}>{issuedTo.playerNames}</div>
        </section>
      )}

      <section style={{ marginTop: 22 }}>
        <div style={{ marginBottom: 8, fontSize: 11, fontWeight: 900 }}>الأصناف المصروفة · ISSUED ITEMS</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #ded8ce', fontSize: 11 }}>
          <thead><tr style={{ background: '#111218', color: '#fff' }}>
            <th style={{ padding: '8px 7px', width: 34 }}>#</th>
            <th style={{ padding: '8px 9px', textAlign: 'right' }}>الصنف · ITEM</th>
            <th style={{ padding: '8px 9px' }}>SKU</th>
            <th style={{ padding: '8px 9px' }}>المقاس · SIZE</th>
            <th style={{ padding: '8px 9px' }}>الوحدة · UNIT</th>
            <th style={{ padding: '8px 9px' }}>الكمية · QTY</th>
          </tr></thead>
          <tbody>{(request.items || []).map((item, index) => (
            <tr key={`${item.itemId || item.itemSku}-${index}`} style={{ background: index % 2 ? '#faf9f7' : '#fff' }}>
              <td style={{ ...cell, textAlign: 'center' }}>{index + 1}</td>
              <td style={cell}><strong>{item.itemNameAr || item.itemNameEn || '—'}</strong>{item.itemNameAr && item.itemNameEn ? <div style={{ marginTop: 2, color: '#6b665e', direction: 'ltr', textAlign: 'right' }}>{item.itemNameEn}</div> : null}</td>
              <td style={{ ...cell, direction: 'ltr', textAlign: 'center' }}>{item.itemSku || item.sku || '—'}</td>
              <td style={{ ...cell, textAlign: 'center' }}>{item.size || '—'}</td>
              <td style={{ ...cell, textAlign: 'center' }}>{item.unitAr || item.unit || '—'}</td>
              <td style={{ ...cell, textAlign: 'center', fontWeight: 900 }}>{Number(item.quantity || 0).toLocaleString(locale)}</td>
            </tr>
          ))}</tbody>
        </table>
      </section>

      {request.notes && (
        <section style={{ marginTop: 14, padding: '11px 13px', borderRight: '3px solid #a17811', background: '#f8f5ed' }}>
          <div style={label}>ملاحظات الطلب · REQUEST NOTES</div>
          <div style={{ ...value, fontWeight: 500, lineHeight: 1.6 }}>{request.notes}</div>
        </section>
      )}

      <section style={{ marginTop: 22 }}>
        <div style={{ marginBottom: 8, fontSize: 11, fontWeight: 900 }}>مسار الاعتماد · APPROVAL TRAIL</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #ded8ce', fontSize: 10.5 }}>
          <thead><tr style={{ background: '#f0ede7' }}><th style={{ padding: 8, textAlign: 'right' }}>المرحلة · STAGE</th><th style={{ padding: 8, textAlign: 'right' }}>المسؤول · OFFICER</th><th style={{ padding: 8 }}>الحالة · STATUS</th><th style={{ padding: 8 }}>التاريخ · DATE</th></tr></thead>
          <tbody>
            <tr><td style={cell}>Warehouse/Store Manager</td><td style={cell}>{approvalName(requester) || request.requestedByName}</td><td style={{ ...cell, textAlign: 'center' }}>{approvalStatus(requester, t)}</td><td style={{ ...cell, direction: 'ltr', textAlign: 'center' }}>{dateTime(requester.at || request.requestedAt, locale)}</td></tr>
            <tr><td style={cell}>Sports Activities Specialist</td><td style={cell}>{approvalName(specialist)}</td><td style={{ ...cell, textAlign: 'center' }}>{approvalStatus(specialist, t)}</td><td style={{ ...cell, direction: 'ltr', textAlign: 'center' }}>{dateTime(specialist.at, locale)}</td></tr>
            <tr><td style={cell}>Head of Operations</td><td style={cell}>{approvalName(head)}</td><td style={{ ...cell, textAlign: 'center' }}>{approvalStatus(head, t)}</td><td style={{ ...cell, direction: 'ltr', textAlign: 'center' }}>{dateTime(head.at || issueDate, locale)}</td></tr>
          </tbody>
        </table>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginTop: 18 }}>
        <div style={{ padding: 12, border: '1px solid #e1dcd3', borderRadius: 8 }}>
          <div style={label}>طلب بواسطة · REQUESTED BY</div><div style={value}>{request.requestedByName || approvalName(requester)}</div>
          <div style={{ marginTop: 4, color: '#6c665e', fontSize: 10 }}>{dateTime(request.requestedAt || requester.at, locale)}</div>
        </div>
        <div style={{ padding: 12, border: '1px solid #e1dcd3', borderRadius: 8 }}>
          <div style={label}>المستندات المؤيدة · EVIDENCE</div>
          <div style={{ ...value, fontSize: 10.5, fontWeight: 600, lineHeight: 1.55 }}>{evidence.length ? evidence.map((file) => file.name).join(' · ') : t('None attached', 'لا يوجد')}</div>
        </div>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 42, marginTop: 34 }}>
        <div style={{ textAlign: 'center' }}><div style={{ height: 35, borderBottom: '1px solid #777' }} /><div style={{ marginTop: 7, fontSize: 10, fontWeight: 800 }}>توقيع المستلم · RECIPIENT SIGNATURE</div></div>
        <div style={{ textAlign: 'center' }}><div style={{ height: 35, borderBottom: '1px solid #777' }} /><div style={{ marginTop: 7, fontSize: 10, fontWeight: 800 }}>اعتماد رئيس العمليات · HEAD APPROVAL</div><div style={{ marginTop: 2, color: '#6d675f', fontSize: 9 }}>{approvalName(head)}</div></div>
      </section>

      <footer style={{ marginTop: 30, paddingTop: 11, borderTop: '1px solid #e5e0d7', color: '#817a70', fontSize: 9, textAlign: 'center' }}>
        مستند رقابي صادر من نظام عمليات نادي الفجيرة للفنون القتالية · Official inventory control record
      </footer>
    </div>
  )
})

async function downloadPdf(element, request) {
  await document.fonts.ready
  const canvas = await html2canvas(element, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false })
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
  const pageWidth = 210
  const pageHeight = 297
  const pageHeightPx = Math.floor(canvas.width * (pageHeight / pageWidth))
  let offset = 0
  let page = 0

  while (offset < canvas.height) {
    const sliceHeight = Math.min(pageHeightPx, canvas.height - offset)
    const slice = document.createElement('canvas')
    slice.width = canvas.width
    slice.height = sliceHeight
    slice.getContext('2d').drawImage(canvas, 0, offset, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight)
    if (page > 0) pdf.addPage()
    pdf.addImage(slice.toDataURL('image/jpeg', 0.96), 'JPEG', 0, 0, pageWidth, sliceHeight * pageWidth / canvas.width, undefined, 'FAST')
    offset += sliceHeight
    page += 1
  }

  pdf.save(`${safeFileName(request.receiptNumber || request.requestCode)}.pdf`)
}

function printDocument(element, title) {
  const popup = window.open('', '_blank', 'width=920,height=900')
  if (!popup) throw new Error('Allow pop-ups to print the issue voucher')
  popup.document.open()
  popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${safeFileName(title)}</title><style>*{box-sizing:border-box}body{margin:0;background:#fff}@page{size:A4;margin:0}@media print{body{margin:0}.inv-voucher-document{width:210mm!important;min-height:297mm!important}}</style></head><body>${element.outerHTML}</body></html>`)
  popup.document.close()
  popup.focus()
  setTimeout(() => { popup.print() }, 350)
}

export default function InventoryIssueVoucher({ request, onClose }) {
  const { t, lang } = useLanguage()
  const locale = lang === 'ar' ? 'ar-AE' : 'en-AE'
  const documentRef = useRef(null)
  const [working, setWorking] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  const run = async (action) => {
    if (!documentRef.current || working) return
    setWorking(action)
    setError('')
    try {
      if (action === 'download') await downloadPdf(documentRef.current, request)
      else printDocument(documentRef.current, request.receiptNumber || request.requestCode)
    } catch (err) {
      setError(err.message || t('Could not prepare the voucher.', 'تعذر تجهيز إذن الصرف.'))
    } finally {
      setWorking('')
    }
  }

  return createPortal(
    <div className="inv-voucher-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="inv-voucher-modal" role="dialog" aria-modal="true" aria-labelledby="inv-voucher-title">
        <header className="inv-voucher-modal-head">
          <div><span>{t('APPROVED ISSUE RECORD', 'سجل صرف معتمد')}</span><h2 id="inv-voucher-title">{t('Stock issue voucher', 'إذن صرف مخزون')}</h2><p>{request.receiptNumber} · {request.requestCode}</p></div>
          <button type="button" onClick={onClose} aria-label={t('Close', 'إغلاق')}><X size={18} /></button>
        </header>
        <div className="inv-voucher-preview"><IssueVoucherDocument ref={documentRef} request={request} t={t} locale={locale} /></div>
        {error && <div className="inv-error-msg inv-voucher-error">{error}</div>}
        <footer className="inv-voucher-modal-actions">
          <span><FileText size={14} /> {t('The voucher remains available on this approved request.', 'يبقى الإذن متاحاً في هذا الطلب المعتمد.')}</span>
          <div>
            <button type="button" className="inv-btn inv-btn-ghost" onClick={() => run('print')} disabled={!!working}>{working === 'print' ? <Loader2 size={14} className="inv-spin" /> : <Printer size={14} />} {t('Print', 'طباعة')}</button>
            <button type="button" className="inv-btn inv-btn-primary" onClick={() => run('download')} disabled={!!working}>{working === 'download' ? <Loader2 size={14} className="inv-spin" /> : <Download size={14} />} {t('Download PDF', 'تحميل PDF')}</button>
          </div>
        </footer>
      </section>
    </div>,
    document.body,
  )
}
