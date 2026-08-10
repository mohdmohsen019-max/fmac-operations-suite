import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Printer, Globe, Copy, Check, AlertCircle, ExternalLink, RefreshCw } from 'lucide-react'
import JsBarcode from 'jsbarcode'
import { useLanguage } from '../../contexts/LanguageContext'
// The modal is shared by Inventory AND Assets (both lazy chunks). It must
// carry its own styles — otherwise opening it from /assets before /inventory
// has ever loaded renders it completely unstyled at the bottom of the page.
import '../InventoryModule.css'

// ─── Parse Zebra Browser Print /default response ─────────────────────────────
// Older Browser Print versions return plain text "Device:\n\tname: ...\n\tuid: ..."
// Newer versions return JSON. Handle both.
async function getZebraDevice() {
  // Try with ?type=printer first (SDK convention), fall back to bare endpoint
  for (const url of [
    'http://localhost:9100/default?type=printer',
    'http://localhost:9100/default',
  ]) {
    let res
    try {
      res = await fetch(url, { method: 'GET', mode: 'cors' })
    } catch {
      continue
    }
    const text = await res.text()

    // Try JSON parse (newer Browser Print)
    try { return JSON.parse(text) } catch { /* ignore */ }

    // Try line-by-line "key: value" plain text format (older Browser Print)
    const device = {}
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*(\w[\w\s]*?)\s*:\s*(.+)$/)
      if (m) {
        const key = m[1].trim()
        if (key.toLowerCase() !== 'device') device[key] = m[2].trim()
      }
    }
    if (device.uid || device.name) return device
  }
  throw new Error('Could not get Zebra device from /default')
}

// ─── ZPL generation ───────────────────────────────────────────────────────────
// 38mm × 25mm at 203 dpi: PW304 (38×8=304 dots), LL200 (25×8=200 dots)

// Code128 width in modules: digit-only data packs two digits per symbol
// (subset C); anything alphanumeric costs one symbol per character (subset B).
function code128Modules(data) {
  const s = String(data)
  if (/^\d+$/.test(s) && s.length >= 4) {
    // Odd-length correction: subset C encodes digits in pairs, so an ODD count
    // leaves one trailing digit that needs its own subset-B symbol PLUS a
    // code-switch symbol — one extra 11-module symbol the ceil() alone misses.
    const oddExtra = s.length % 2 === 1 ? 1 : 0
    return 11 * (2 + Math.ceil(s.length / 2) + oddExtra) + 13
  }
  return 11 * (s.length + 2) + 13
}

function generateZPL(item, quantity = 1, opts = {}) {
  const barcode  = String(item.barcode || item.sku || '')
  const name     = item.nameAr || ''
  const clubName = 'Fujairah Martial Arts Club'

  // Auto-fit: drop the module width from 3 dots until the barcode fits. Short
  // numeric codes (inventory) keep printing at ^BY3 exactly as before; long
  // alphanumeric codes (assets FMAC-####) get ^BY2 and are centered instead of
  // running off the right edge. The fit test uses a conservative 296-dot bound
  // (label is 304 dots at 38mm/203dpi) so borderline widths keep a couple dots
  // of quiet-zone margin; centering still uses the full 304-dot label width.
  const mods = code128Modules(barcode)
  let by = 3
  while (by > 1 && mods * by > 296) by--
  const x = by < 3 ? Math.max(0, Math.floor((304 - mods * by) / 2)) : 0

  // boldCode: larger human-readable number under the bars (assets labels).
  const codeLine = opts.boldCode
    ? `^CF0,30
^FO0,140^FB304,1,0,C,0^FD${barcode}^FS

^CF0,24
^FO0,172^FB304,1,0,C,0^CI28^FD${name}^FS`
    : `^CF0,24
^FO0,148^FB304,1,0,C,0^FD${barcode}^FS

^CF0,24
^FO0,174^FB304,1,0,C,0^CI28^FD${name}^FS`

  let zpl = ''
  for (let i = 0; i < quantity; i++) {
    zpl += `
^XA
~SD30
^MD30
^MMT
^PW304
^LL200
^LS0

^CF0,22
^FO0,10^FB304,1,0,C,0^FD${clubName}^FS

^FO${x},35
^BY${by},3,100
^BCN,100,N,N,N
^JUS
^FD${barcode}^FS

${codeLine}

^XZ`
  }
  return zpl
}

// ─── Barcode canvas helper (for browser-print data URL) ───────────────────────
function makeBarcodeDataURL(value) {
  try {
    const canvas = document.createElement('canvas')
    JsBarcode(canvas, value, {
      format: 'CODE128',
      width: 2,
      height: 40,
      displayValue: false,
      margin: 2,
      background: 'white',
    })
    return canvas.toDataURL('image/png')
  } catch {
    return ''
  }
}

// ─── Preview label (browser render, 4-row layout) ─────────────────────────────
function BarcodeLabel({ value, itemNameAr, itemNameEn, boldCode = false }) {
  const svgRef = useRef(null)
  const [fontsReady, setFontsReady] = useState(false)

  useEffect(() => {
    document.fonts.ready.then(() => setFontsReady(true))
  }, [])

  useEffect(() => {
    if (!svgRef.current || !value) return
    try {
      JsBarcode(svgRef.current, value, {
        format: 'CODE128',
        width: 1.2,
        height: 40,
        displayValue: false,
        margin: 0,
        background: 'transparent',
      })
      const svg = svgRef.current
      const w = svg.getAttribute('width')
      const h = svg.getAttribute('height')
      if (w && h && !svg.getAttribute('viewBox')) {
        svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
      }
      svg.removeAttribute('width')
      svg.removeAttribute('height')
    } catch { /* invalid value */ }
  }, [value, fontsReady])

  const displayName = itemNameAr || itemNameEn || value

  return (
    <div style={{
      width: '38mm', height: '25mm',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'space-between',
      padding: '1mm', boxSizing: 'border-box',
      backgroundColor: 'white',
      fontFamily: 'Cairo, sans-serif',
      overflow: 'hidden',
    }}>
      {/* Row 1 — club name */}
      <div style={{
        fontSize: '5pt', textAlign: 'center', width: '100%',
        whiteSpace: 'nowrap', letterSpacing: 0, wordSpacing: 0,
        lineHeight: 1, color: '#111',
      }}>
        Fujairah Martial Arts Club
      </div>

      {/* Row 2 — barcode bars */}
      <svg ref={svgRef} style={{ width: '34mm', height: '11mm', display: 'block' }} />

      {/* Row 3 — barcode number */}
      <div style={{
        fontSize: boldCode ? '6.5pt' : '5pt', textAlign: 'center',
        letterSpacing: 0, wordSpacing: 0, lineHeight: 1,
        fontWeight: boldCode ? 700 : 400,
        color: boldCode ? '#000' : '#333',
      }}>
        {value}
      </div>

      {/* Row 4 — item name (Arabic RTL or English) */}
      <div style={{
        fontSize: '7pt',
        fontWeight: 'bold',
        textAlign: 'center',
        direction: itemNameAr ? 'rtl' : 'ltr',
        fontFamily: 'Cairo, sans-serif',
        width: '100%',
        marginTop: '2px',
        lineHeight: 1.2,
        color: '#000',
        overflow: 'hidden',
        wordSpacing: 0,
        letterSpacing: 0,
      }}>
        {displayName}
      </div>
    </div>
  )
}

// ─── ZPL fallback modal ────────────────────────────────────────────────────────
function ZplFallbackModal({ zplCode, onClose, t }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(zplCode).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

  return (
    <motion.div
      className="inv-modal-overlay"
      style={{ zIndex: 6000 }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="inv-modal-box"
        style={{ maxWidth: 440 }}
        initial={{ scale: 0.93, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.93, opacity: 0, y: 12 }}
        transition={{ duration: 0.2 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="inv-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <AlertCircle size={20} style={{ color: '#d4a008', flexShrink: 0 }} />
            <div>
              <div className="inv-modal-title">
                {t('Printer Not Connected', 'لم يتم الاتصال بالطابعة')}
              </div>
              <div className="inv-modal-sub">
                {t('Zebra Browser Print is not running', 'برنامج Zebra Browser Print غير مُشغَّل')}
              </div>
            </div>
          </div>
          <button className="inv-modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: '0.83rem', color: 'var(--theme-text-muted)', lineHeight: 1.6 }}>
            {t(
              'Install and run Zebra Browser Print on your Windows PC, then try again.',
              'قم بتثبيت وتشغيل Zebra Browser Print على جهاز Windows الخاص بك، ثم حاول مرة أخرى.'
            )}
          </p>

          <a
            href="https://www.zebra.com/us/en/support-downloads/software/printer-software/browser-print.html"
            target="_blank"
            rel="noopener noreferrer"
            className="inv-btn inv-btn-ghost inv-btn-sm"
            style={{ justifyContent: 'center', gap: 6, textDecoration: 'none' }}
          >
            <ExternalLink size={13} />
            {t('Download Zebra Browser Print', 'تحميل Zebra Browser Print')}
          </a>

          <div style={{
            background: 'var(--theme-surface)',
            border: '1px solid var(--theme-border)',
            borderRadius: 8, padding: 12,
          }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--theme-text-muted)', marginBottom: 8 }}>
              {t(
                'Alternatively, copy the ZPL code and paste it into Zebra Setup Utilities:',
                'بديلاً، انسخ كود ZPL والصقه في Zebra Setup Utilities:'
              )}
            </div>
            <textarea
              readOnly
              value={zplCode}
              style={{
                width: '100%', height: 90, resize: 'none',
                background: 'var(--theme-bg)',
                border: '1px solid var(--theme-border)',
                borderRadius: 6, padding: '6px 10px',
                fontSize: '0.68rem', fontFamily: 'monospace',
                color: 'var(--theme-text-main)',
                lineHeight: 1.4,
              }}
            />
          </div>

          <button
            className={`inv-btn ${copied ? 'inv-btn-accent' : 'inv-btn-primary'}`}
            onClick={handleCopy}
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {copied
              ? t('Copied!', 'تم النسخ!')
              : t('Copy ZPL Code', 'نسخ كود ZPL')
            }
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ─── Main modal ────────────────────────────────────────────────────────────────
// opts.boldCode — heavier, larger human-readable number on the label (used by
// the Assets module; inventory labels keep their original look).
export default function BarcodePrintModal({ item, onClose, opts = {} }) {
  const { t } = useLanguage()
  const [qty, setQty] = useState(1)
  const [zplCode, setZplCode] = useState('')
  const [showZplModal, setShowZplModal] = useState(false)
  // 'idle' | 'sending' | 'success' | 'error'
  const [zebraStatus, setZebraStatus] = useState('idle')
  // 'idle' | 'checking' | 'ok' | 'fail'
  const [connStatus, setConnStatus] = useState('idle')
  const [connLabel, setConnLabel] = useState('')

  const barcodeValue = (item.barcode || item.sku || 'ITEM').trim()

  // ── Test connection to Zebra Browser Print ────────────────────────────────
  const handleTestConnection = async () => {
    setConnStatus('checking')
    setConnLabel('')
    try {
      const device = await getZebraDevice()
      const name = device?.name || device?.uid || 'Unknown'
      setConnStatus('ok')
      setConnLabel(name)
      setTimeout(() => setConnStatus('idle'), 4000)
    } catch (err) {
      console.error('[Zebra] test connection failed:', err)
      setConnStatus('fail')
      setTimeout(() => setConnStatus('idle'), 4000)
    }
  }

  // ── Option 1: ZPL via Zebra Browser Print ─────────────────────────────────
  const handleZebraPrint = async () => {
    setZebraStatus('sending')
    const zpl = generateZPL(item, qty, opts)

    try {
      const device = await getZebraDevice()

      // Attempt A — JSON wrapper { device, data }
      const jsonRes = await fetch('http://localhost:9100/write', {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify({ device, data: zpl }),
      })
      const jsonText = await jsonRes.text()

      if (!jsonRes.ok) {
        // Attempt B — raw ZPL string (no device wrapper)
        const rawRes = await fetch('http://localhost:9100/write', {
          method: 'POST',
          mode: 'cors',
          headers: { 'Content-Type': 'text/plain' },
          body: zpl,
        })
        const rawText = await rawRes.text()
        if (!rawRes.ok) throw new Error(`both attempts failed (A:${jsonRes.status} B:${rawRes.status})`)
      }

      setZebraStatus('success')
      setTimeout(() => setZebraStatus('idle'), 2500)
    } catch (err) {
      console.error('[Zebra] print error:', err)
      setZebraStatus('idle')
      setZplCode(zpl)
      setShowZplModal(true)
    }
  }

  // ── Option 2: new blank window print ──────────────────────────────────────
  const handleBrowserPrint = () => {
    const barcodeDataUrl = makeBarcodeDataURL(barcodeValue)
    const nameAr  = item.nameAr  || ''
    const nameEn  = item.nameEn  || barcodeValue
    const display = nameAr || nameEn

    const singleLabel = `
      <div class="label">
        <div class="club">Fujairah Martial Arts Club</div>
        <img class="bc" src="${barcodeDataUrl}" alt="" />
        <div class="code">${barcodeValue}</div>
        <div class="name" dir="${nameAr ? 'rtl' : 'ltr'}">${display}</div>
      </div>`

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap');
@page { size: 38mm 25mm; margin: 0; }
*    { margin:0; padding:0; box-sizing:border-box; }
body { font-family:'Cairo',sans-serif; background:white; }
.label {
  width:38mm; height:25mm; overflow:hidden;
  display:flex; flex-direction:column;
  align-items:center; justify-content:space-between;
  padding:1mm;
  page-break-after:always; break-after:page;
}
.club { font-size:5pt; text-align:center; white-space:nowrap; line-height:1; }
.bc   { width:34mm; height:10mm; object-fit:fill; display:block; }
.code { font-size:${opts.boldCode ? '6.5pt' : '5pt'}; font-weight:${opts.boldCode ? '700' : '400'}; color:#000; text-align:center; line-height:1; }
.name {
  font-size:6pt; font-weight:bold; text-align:center;
  width:100%; line-height:1.2; max-height:8mm; overflow:hidden;
  font-family:'Cairo',sans-serif; word-spacing:0; letter-spacing:0;
}
</style></head><body>
${Array.from({ length: qty }, () => singleLabel).join('')}
</body></html>`

    const win = window.open('', '_blank', 'width=200,height=130')
    if (!win) return
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 1200)
  }

  return (
    <>
      <AnimatePresence>
        <motion.div
          className="inv-modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="inv-modal-box inv-bc-modal"
            initial={{ scale: 0.93, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.93, opacity: 0, y: 12 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="inv-modal-header">
              <div>
                <div className="inv-modal-title">{t('Print Barcode', 'طباعة الباركود')}</div>
                <div className="inv-modal-sub">{item.nameAr || item.nameEn} — {item.sku}</div>
              </div>
              <button className="inv-modal-close" onClick={onClose}><X size={18} /></button>
            </div>

            {/* 3× preview */}
            <div className="inv-bc-preview-area">
              <div className="inv-bc-preview-label-wrap">
                <div style={{
                  fontSize: '0.7rem', color: 'var(--theme-text-muted)',
                  marginBottom: 8, textAlign: 'center',
                }}>
                  {t('Preview (3× actual size)', 'معاينة (3 × الحجم الفعلي)')}
                </div>
                <div style={{ transform: 'scale(3)', transformOrigin: 'top center', marginBottom: 84 }}>
                  <div id="inv-bc-preview-label" style={{ border: '1px solid #ddd' }}>
                    <BarcodeLabel
                      value={barcodeValue}
                      itemNameAr={item.nameAr}
                      itemNameEn={item.nameEn}
                      boldCode={!!opts.boldCode}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Quantity */}
            <div className="inv-bc-qty-row">
              <label className="inv-bc-qty-label">
                {t('Quantity to print', 'الكمية للطباعة')}
              </label>
              <div className="inv-bc-qty-controls">
                <button className="inv-qty-btn" onClick={() => setQty(q => Math.max(1, q - 1))}>−</button>
                <input
                  className="inv-qty-input"
                  type="number" min={1} max={100}
                  value={qty}
                  onChange={e => setQty(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
                />
                <button className="inv-qty-btn" onClick={() => setQty(q => Math.min(100, q + 1))}>+</button>
              </div>
            </div>

            {/* Two print options */}
            <div className="inv-bc-actions">
              {/* Option 2 — browser fallback */}
              <button
                className="inv-btn inv-btn-ghost inv-btn-sm inv-bc-browser-btn"
                onClick={handleBrowserPrint}
                title={t('Open in new window and print', 'فتح في نافذة جديدة وطباعة')}
              >
                <Globe size={14} />
                {t('Browser Print', 'طباعة المتصفح')}
              </button>

              {/* Test connection */}
              <button
                className={`inv-btn inv-btn-sm ${
                  connStatus === 'ok'   ? 'inv-bc-conn-ok' :
                  connStatus === 'fail' ? 'inv-bc-conn-fail' :
                  'inv-btn-ghost'
                }`}
                onClick={handleTestConnection}
                disabled={connStatus === 'checking'}
                title={t('Test connection to Zebra Browser Print', 'اختبار الاتصال بـ Zebra Browser Print')}
              >
                {connStatus === 'checking' ? (
                  <RefreshCw size={13} className="inv-spin" />
                ) : connStatus === 'ok' ? (
                  <Check size={13} />
                ) : connStatus === 'fail' ? (
                  <AlertCircle size={13} />
                ) : (
                  <RefreshCw size={13} />
                )}
                {connStatus === 'ok'
                  ? (connLabel ? connLabel : t('Connected', 'متصل'))
                  : connStatus === 'fail'
                    ? t('Not Found', 'غير متصل')
                    : connStatus === 'checking'
                      ? t('Checking…', 'جارٍ الفحص…')
                      : t('Test Printer', 'اختبار الاتصال')
                }
              </button>

              {/* Option 1 — ZPL via Browser Print SDK */}
              <button
                className={`inv-btn inv-bc-zebra-btn ${
                  zebraStatus === 'success' ? 'inv-bc-zebra-success' : 'inv-btn-primary'
                }`}
                onClick={handleZebraPrint}
                disabled={zebraStatus === 'sending'}
              >
                {zebraStatus === 'sending' ? (
                  <RefreshCw size={15} className="inv-spin" />
                ) : zebraStatus === 'success' ? (
                  <Check size={15} />
                ) : (
                  <Printer size={15} />
                )}
                {zebraStatus === 'sending'
                  ? t('Sending…', 'جارٍ الإرسال…')
                  : zebraStatus === 'success'
                    ? t('Sent!', 'تم الإرسال!')
                    : t('Print to Zebra', 'طباعة للزيبرا')
                }
              </button>
            </div>
          </motion.div>
        </motion.div>
      </AnimatePresence>

      {/* ZPL fallback modal */}
      <AnimatePresence>
        {showZplModal && (
          <ZplFallbackModal
            zplCode={zplCode}
            onClose={() => setShowZplModal(false)}
            t={t}
          />
        )}
      </AnimatePresence>
    </>
  )
}
