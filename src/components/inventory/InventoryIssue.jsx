import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, Plus, Trash2, Check, ChevronRight, ChevronLeft,
  User, Package, FileText, RefreshCw, AlertTriangle, ShieldAlert, ShieldCheck
} from 'lucide-react'
import { useLanguage } from '../../contexts/LanguageContext'
import { getSportLabel, getRoleLabel, fmtDateTime, DEFAULT_SPORTS, DEFAULT_ROLES, OTHER_SPORT } from './shared'
import CustomSelect from '../CustomSelect'
import { usePermissions } from '../../hooks/usePermissions'
import InventoryEvidencePicker from './InventoryEvidencePicker'
import { submitInventoryRequest } from './inventoryApprovalService'

function StepIndicator({ step, t }) {
  const steps = [
    { n: 1, label: t('Recipient', 'المستلم') },
    { n: 2, label: t('Items', 'الأصناف') },
    { n: 3, label: t('Confirm', 'تأكيد') },
  ]
  return (
    <div className="inv-stepper">
      {steps.map((s, i) => (
        <div key={s.n} className={`inv-step ${step >= s.n ? 'done' : ''} ${step === s.n ? 'active' : ''}`}>
          <div className="inv-step-circle">{step > s.n ? <Check size={13} /> : s.n}</div>
          <div className="inv-step-label">{s.label}</div>
          {i < steps.length - 1 && <div className="inv-step-line" />}
        </div>
      ))}
    </div>
  )
}

function ItemSearchDropdown({ items, lang, onSelect }) {
  const { t } = useLanguage()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)

  const results = q.length >= 2
    ? items.filter(i => {
        const hay = [i.nameAr, i.nameEn, i.sku, i.barcode].filter(Boolean).join(' ').toLowerCase()
        return hay.includes(q.toLowerCase())
      }).slice(0, 8)
    : []

  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
      <div className="inv-search-wrap" style={{ marginBottom: 0 }}>
        <Search size={14} className="inv-search-icon" />
        <input
          className="inv-search"
          placeholder={t('Search item to add…', 'ابحث عن صنف للإضافة…')}
          value={q}
          onChange={e => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
      </div>
      {open && results.length > 0 && (
        <div className="inv-search-dropdown">
          {results.map(item => (
            <button
              key={item.id}
              className="inv-search-option"
              onMouseDown={() => { onSelect(item); setQ(''); setOpen(false) }}
            >
              <div className="inv-search-opt-name">{lang === 'ar' ? item.nameAr : item.nameEn}</div>
              <div className="inv-search-opt-meta">
                {item.sku}
                {item.size ? ` · ${item.size}` : ''}
                {' · '}{t('Available', 'متوفر')}: {item.currentStock}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Receipt HTML renderer (used for PDF capture)
function ReceiptDocument({ receipt, t, lang, sports }) {
  return (
    <div id="inv-receipt-doc" style={{
      width: 794, background: '#fff', color: '#111',
      fontFamily: "'Cairo', 'Inter', sans-serif",
      padding: '40px 48px', direction: 'rtl',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, borderBottom: '2px solid #111', paddingBottom: 20 }}>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 4 }}>إذن صرف مخزون</div>
          <div style={{ fontSize: 13, color: '#444' }}>نادي الفجيرة للفنون القتالية — قسم المخازن</div>
        </div>
        <div style={{ textAlign: 'left', fontSize: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>{receipt.receiptNumber}</div>
          <div style={{ color: '#555' }}>{fmtDateTime(receipt.issuedAt)}</div>
        </div>
      </div>

      {/* Recipient */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20, fontSize: 12 }}>
        <thead>
          <tr style={{ background: '#f0f0f0' }}>
            <th style={{ padding: '6px 10px', textAlign: 'right', borderBottom: '1px solid #ccc' }}>الاسم</th>
            <th style={{ padding: '6px 10px', textAlign: 'right', borderBottom: '1px solid #ccc' }}>الرياضة</th>
            <th style={{ padding: '6px 10px', textAlign: 'right', borderBottom: '1px solid #ccc' }}>الدور</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ padding: '8px 10px', borderBottom: '1px solid #eee' }}>{receipt.issuedTo?.personName || '—'}</td>
            <td style={{ padding: '8px 10px', borderBottom: '1px solid #eee' }}>{receipt.issuedTo?.sportAr || receipt.issuedTo?.sport}</td>
            <td style={{ padding: '8px 10px', borderBottom: '1px solid #eee' }}>{receipt.issuedTo?.roleAr}</td>
          </tr>
        </tbody>
      </table>

      {/* Players the coach is collecting for */}
      {receipt.issuedTo?.playerNames && (
        <div style={{ marginBottom: 20, fontSize: 12, border: '1px solid #eee', borderRadius: 6, padding: '10px 12px', background: '#fafafa' }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>اللاعبون المستفيدون / Players</div>
          <div style={{ whiteSpace: 'pre-line', color: '#333', lineHeight: 1.7 }}>{receipt.issuedTo.playerNames}</div>
        </div>
      )}

      {/* Items */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28, fontSize: 12 }}>
        <thead>
          <tr style={{ background: '#f0f0f0' }}>
            <th style={{ padding: '6px 10px', textAlign: 'center', borderBottom: '1px solid #ccc', width: 30 }}>#</th>
            <th style={{ padding: '6px 10px', textAlign: 'right', borderBottom: '1px solid #ccc' }}>الصنف</th>
            <th style={{ padding: '6px 10px', textAlign: 'center', borderBottom: '1px solid #ccc' }}>المقاس</th>
            <th style={{ padding: '6px 10px', textAlign: 'center', borderBottom: '1px solid #ccc' }}>الوحدة</th>
            <th style={{ padding: '6px 10px', textAlign: 'center', borderBottom: '1px solid #ccc' }}>الكمية</th>
            <th style={{ padding: '6px 10px', textAlign: 'center', borderBottom: '1px solid #ccc', width: 80 }}>توقيع</th>
          </tr>
        </thead>
        <tbody>
          {receipt.items.map((item, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
              <td style={{ padding: '7px 10px', textAlign: 'center', borderBottom: '1px solid #eee' }}>{i + 1}</td>
              <td style={{ padding: '7px 10px', borderBottom: '1px solid #eee' }}>{item.itemNameAr}</td>
              <td style={{ padding: '7px 10px', textAlign: 'center', borderBottom: '1px solid #eee' }}>{item.size || '—'}</td>
              <td style={{ padding: '7px 10px', textAlign: 'center', borderBottom: '1px solid #eee' }}>{item.unitAr || item.unit}</td>
              <td style={{ padding: '7px 10px', textAlign: 'center', fontWeight: 700, borderBottom: '1px solid #eee' }}>{item.quantity}</td>
              <td style={{ padding: '7px 10px', borderBottom: '1px solid #eee' }} />
            </tr>
          ))}
        </tbody>
      </table>

      {/* Authorised-by line */}
      <div style={{ fontSize: 11, color: '#555', marginBottom: 28, textAlign: 'right' }}>
        تم الصرف بواسطة: {receipt.issuedByName}
      </div>

      {/* Named signatories */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
        <div style={{ width: '44%', textAlign: 'center' }}>
          <div style={{ borderBottom: '1px solid #555', marginBottom: 8, paddingBottom: 32 }} />
          <div style={{ fontSize: 12, fontWeight: 700 }}>ايهاب استيتيه</div>
          <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>رئيس قسم العمليات</div>
        </div>
        <div style={{ width: '44%', textAlign: 'center' }}>
          <div style={{ borderBottom: '1px solid #555', marginBottom: 8, paddingBottom: 32 }} />
          <div style={{ fontSize: 12, fontWeight: 700 }}>أنس العداربة</div>
          <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>رئيس القسم الفني</div>
        </div>
      </div>

      {/* Receiver acknowledgment */}
      <div style={{ marginTop: 32, border: '1px solid #ccc', borderRadius: 6, padding: '14px 16px', background: '#fafafa', fontSize: 12, lineHeight: 1.85, direction: 'rtl' }}>
        <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13 }}>إقرار الاستلام</div>
        <div>
          أقر بموجب هذا بأنني قد استلمت بنجاح البضائع أو المواد المدرجة أدناه من السيد/ محمد عبدالله العمايره
        </div>
        <div style={{ marginTop: 6 }}>
          أقر بأن البضائع المستلمة تمثل الكمية المذكورة أعلاه، وأنني قد تحققت منها وتأكدت من أنها تطابق ما تم ذكره في الوصف. وأنا مسؤول عن البضائع المستلمة اعتبارًا من تاريخ الاستلام أعلاه.
        </div>
        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>الاسم : <span style={{ display: 'inline-block', width: 180, borderBottom: '1px solid #999' }} /></div>
          <div>المنصب : <span style={{ display: 'inline-block', width: 160, borderBottom: '1px solid #999' }} /></div>
          <div>التوقيع : <span style={{ display: 'inline-block', width: 200, borderBottom: '1px solid #999' }} /></div>
          <div>التاريخ : <span style={{ display: 'inline-block', width: 160, borderBottom: '1px solid #999' }} /></div>
        </div>
      </div>

      <div style={{ marginTop: 20, textAlign: 'center', fontSize: 10, color: '#888', borderTop: '1px solid #eee', paddingTop: 12 }}>
        هذا المستند رسمي ويجب الاحتفاظ به
      </div>
    </div>
  )
}

export default function InventoryIssue({ items, settings, onIssueComplete, canRequest }) {
  const { t, lang } = useLanguage()
  const { userProfile } = usePermissions()
  const [step, setStep] = useState(1)
  const [recipient, setRecipient] = useState({
    sport: '', sportAr: '', sportOther: '', personName: '', role: 'player', roleAr: '', playerNames: '', notes: ''
  })
  const [selectedItems, setSelectedItems] = useState([])
  const [saving, setSaving] = useState(false)
  const [receipt, setReceipt] = useState(null)
  const [evidenceFiles, setEvidenceFiles] = useState([])
  const [submitError, setSubmitError] = useState('')

  const sports = settings?.sports || DEFAULT_SPORTS
  const roles = DEFAULT_ROLES
  const units = settings?.units || []

  /* "Other" is offered in the picker but never stored in inventory_sports —
     it is a one-off escape hatch for a discipline that isn't on the list yet,
     captured as free text on this issuance only. */
  const isOtherSport = recipient.sport === OTHER_SPORT.id
  const otherName = recipient.sportOther.trim()
  /* What the receipt, confirm step and movement records should display. */
  const sportLabel = isOtherSport
    ? otherName
    : getSportLabel(recipient.sport, lang, sports)

  const addItem = (item) => {
    if (selectedItems.find(r => r.item.id === item.id)) return
    setSelectedItems(prev => [...prev, { item, qty: 1 }])
  }

  const updateItemQty = (idx, qty) => {
    setSelectedItems(prev => prev.map((r, i) => i === idx ? { ...r, qty: Math.max(1, qty) } : r))
  }

  const removeItem = (idx) => setSelectedItems(prev => prev.filter((_, i) => i !== idx))

  // Choosing "Other" without naming the sport would record a useless entry.
  const step1Valid = recipient.sport && recipient.role && (!isOtherSport || !!otherName)
  const step2Valid = selectedItems.length > 0

  const hasOverstock = selectedItems.some(r => r.qty > r.item.currentStock)

  const handleConfirm = async () => {
    if (saving) return
    setSubmitError('')
    setSaving(true)
    try {
      const sport = sports.find(s => s.id === recipient.sport)
      const role = roles.find(r => r.id === recipient.role)
      const playerNames = recipient.role === 'coach' ? (recipient.playerNames.trim() || null) : null

      const receiptItems = selectedItems.map(r => {
        const unit = units.find(u => u.id === r.item.unit) || { ar: r.item.unit, en: r.item.unit }
        return {
          itemId: r.item.id,
          itemNameAr: r.item.nameAr,
          itemNameEn: r.item.nameEn,
          itemSku: r.item.sku,
          sku: r.item.sku,
          size: r.item.size || null,
          quantity: r.qty,
          unit: r.item.unit,
          unitAr: unit.ar || r.item.unit,
        }
      })

      const receiptData = {
        issuedTo: {
          sport: recipient.sport,
          /* For "Other" the free-text name is what identifies the discipline,
             so it becomes the display label in both languages; `sport` keeps
             the 'other' id so these can still be filtered as a group. */
          sportAr: isOtherSport ? otherName : (sport?.ar || recipient.sport),
          sportOther: isOtherSport ? otherName : null,
          personName: recipient.personName || null,
          role: recipient.role,
          roleAr: role?.ar || recipient.role,
          playerNames,
        },
        items: receiptItems,
        notes: recipient.notes || null,
      }

      const submitted = await submitInventoryRequest({
        type: 'stock_out',
        items: receiptItems,
        details: { issuedTo: receiptData.issuedTo },
        notes: receiptData.notes,
      }, evidenceFiles, userProfile)

      setReceipt({ ...receiptData, ...submitted, requestedAt: new Date() })
      setStep(4)
    } catch (err) {
      console.error(err)
      setSubmitError(err.message || t('Could not submit the issue request.', 'تعذر تقديم طلب الصرف.'))
    } finally {
      setSaving(false)
    }
  }

  const resetForm = () => {
    setStep(1)
    setRecipient({ sport: '', sportAr: '', sportOther: '', personName: '', role: 'player', roleAr: '', playerNames: '', notes: '' })
    setSelectedItems([])
    setEvidenceFiles([])
    setSubmitError('')
    setReceipt(null)
    onIssueComplete?.()
  }

  return (
    <div className="inv-issue">
      {!canRequest && (
        <div className="inv-workflow-guard">
          <ShieldAlert size={28} />
          <strong>{t('Issue requests are initiated by the Warehouse/Store Manager.', 'يتم تقديم طلبات الصرف من مدير المخزن.')}</strong>
          <span>{t('Use the Approvals tab to review requests assigned to your role.', 'استخدم تبويب الاعتمادات لمراجعة الطلبات المسندة إلى دورك.')}</span>
        </div>
      )}
      {canRequest && <>
      {step < 4 && <StepIndicator step={step} t={t} />}

      <AnimatePresence mode="wait">
        {/* Step 1 — Recipient */}
        {step === 1 && (
          <motion.div key="s1" className="inv-form-section"
            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}>
            <div className="inv-form-title">
              <User size={16} /> {t('Recipient Information', 'معلومات المستلم')}
            </div>

            <div className="inv-form-row">
              <label className="inv-label">{t('Sport', 'الرياضة')} *</label>
              <CustomSelect
                value={recipient.sport}
                onChange={(v) => setRecipient(p => ({
                  ...p, sport: v,
                  // Leaving "Other" clears whatever was typed, so a stale name
                  // can never ride along on a normal sport.
                  sportOther: v === OTHER_SPORT.id ? p.sportOther : '',
                }))}
                placeholder={t('Select sport…', 'اختر الرياضة…')}
                options={[
                  ...sports.map(s => ({ value: s.id, label: lang === 'ar' ? s.ar : s.en })),
                  { value: OTHER_SPORT.id, label: lang === 'ar' ? OTHER_SPORT.ar : OTHER_SPORT.en },
                ]}
              />
            </div>

            {isOtherSport && (
              <div className="inv-form-row">
                <label className="inv-label">{t('Specify sport', 'حدّد الرياضة')} *</label>
                <input
                  className="inv-input"
                  autoFocus
                  value={recipient.sportOther}
                  onChange={e => setRecipient(p => ({ ...p, sportOther: e.target.value }))}
                  placeholder={t('e.g. Wrestling', 'مثال: المصارعة')}
                  dir="auto"
                />
              </div>
            )}

            <div className="inv-form-row">
              <label className="inv-label">{t('Person Name', 'اسم الشخص')}</label>
              <input
                className="inv-input"
                placeholder={t('Optional', 'اختياري')}
                value={recipient.personName}
                onChange={e => setRecipient(p => ({ ...p, personName: e.target.value }))}
              />
            </div>

            <div className="inv-form-row">
              <label className="inv-label">{t('Role', 'الدور')} *</label>
              <div className="inv-role-grid">
                {roles.map(r => (
                  <button
                    key={r.id}
                    className={`inv-role-btn ${recipient.role === r.id ? 'active' : ''}`}
                    onClick={() => setRecipient(p => ({ ...p, role: r.id }))}
                  >
                    {lang === 'ar' ? r.ar : r.en}
                  </button>
                ))}
              </div>
            </div>

            {/* Coaches collect items for their players — capture who they're for */}
            {recipient.role === 'coach' && (
              <div className="inv-form-row">
                <label className="inv-label">{t('Player Name(s)', 'اسم/أسماء اللاعبين')}</label>
                <textarea
                  className="inv-textarea"
                  rows={2}
                  placeholder={t('Optional — players these items are for (one per line)', 'اختياري — اللاعبون المخصص لهم الأصناف (اسم في كل سطر)')}
                  value={recipient.playerNames}
                  onChange={e => setRecipient(p => ({ ...p, playerNames: e.target.value }))}
                />
              </div>
            )}

            <div className="inv-form-row">
              <label className="inv-label">{t('Notes', 'ملاحظات')}</label>
              <textarea
                className="inv-textarea"
                rows={2}
                value={recipient.notes}
                onChange={e => setRecipient(p => ({ ...p, notes: e.target.value }))}
              />
            </div>

            <InventoryEvidencePicker
              files={evidenceFiles}
              onChange={setEvidenceFiles}
              title={t('Issue authorisation evidence', 'إثبات أمر الصرف')}
              description={t('Attach the order, email, letter or other authorisation to issue these items.', 'أرفق الأمر أو البريد أو الخطاب أو أي تفويض آخر لصرف هذه الأصناف.')}
            />

            <div className="inv-form-actions">
              <button
                className="inv-btn inv-btn-primary"
                disabled={!step1Valid}
                onClick={() => setStep(2)}
              >
                {t('Next: Select Items', 'التالي: اختر الأصناف')} <ChevronRight size={15} />
              </button>
            </div>
          </motion.div>
        )}

        {/* Step 2 — Select Items */}
        {step === 2 && (
          <motion.div key="s2" className="inv-form-section"
            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}>
            <div className="inv-form-title">
              <Package size={16} /> {t('Select Items', 'اختر الأصناف')}
            </div>

            <ItemSearchDropdown items={items} lang={lang} onSelect={addItem} />

            {selectedItems.length > 0 && (
              <div className="inv-batch-table" style={{ marginTop: 16 }}>
                <table className="inv-table inv-table-compact">
                  <thead>
                    <tr>
                      <th>{t('Item', 'الصنف')}</th>
                      <th>{t('Available', 'متوفر')}</th>
                      <th>{t('Qty to Issue', 'الكمية المصروفة')}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedItems.map((r, idx) => {
                      const over = r.qty > r.item.currentStock
                      return (
                        <tr key={r.item.id} style={{ background: over ? 'rgba(244,63,94,0.05)' : undefined }}>
                          <td>
                            <div className="inv-name-cell">
                              <div className="inv-name-ar">{r.item.nameAr}</div>
                              <div className="inv-name-en">{r.item.sku}{r.item.size ? ` · ${r.item.size}` : ''}</div>
                            </div>
                          </td>
                          <td style={{ color: r.item.currentStock === 0 ? 'var(--status-risk)' : 'var(--theme-text-muted)' }}>
                            {r.item.currentStock}
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <input
                                className="inv-qty-input inv-qty-inline"
                                type="number" min={1}
                                value={r.qty}
                                onChange={e => updateItemQty(idx, parseInt(e.target.value) || 1)}
                                style={{ borderColor: over ? 'var(--status-risk)' : undefined }}
                              />
                              {over && <AlertTriangle size={14} style={{ color: 'var(--status-risk)', flexShrink: 0 }} />}
                            </div>
                          </td>
                          <td>
                            <button className="inv-icon-btn inv-icon-btn-danger" onClick={() => removeItem(idx)}>
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {hasOverstock && (
                  <div className="inv-warn-banner">
                    <AlertTriangle size={14} />
                    {t('Some items exceed available stock. Proceed only if intentional.', 'بعض الأصناف تتجاوز المخزون المتاح.')}
                  </div>
                )}
              </div>
            )}

            <div className="inv-form-actions">
              <button className="inv-btn inv-btn-ghost" onClick={() => setStep(1)}>
                <ChevronLeft size={15} /> {t('Back', 'رجوع')}
              </button>
              <button
                className="inv-btn inv-btn-primary"
                disabled={!step2Valid}
                onClick={() => setStep(3)}
              >
                {t('Next: Confirm', 'التالي: تأكيد')} <ChevronRight size={15} />
              </button>
            </div>
          </motion.div>
        )}

        {/* Step 3 — Confirm */}
        {step === 3 && (
          <motion.div key="s3" className="inv-form-section"
            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}>
            <div className="inv-form-title">
              <FileText size={16} /> {t('Confirm request', 'تأكيد الطلب')}
            </div>

            <div className="inv-confirm-block">
              <div className="inv-confirm-section-label">{t('Recipient', 'المستلم')}</div>
              <div className="inv-confirm-row">
                <span>{t('Sport', 'الرياضة')}</span>
                <span>{sportLabel}</span>
              </div>
              {recipient.personName && (
                <div className="inv-confirm-row">
                  <span>{t('Name', 'الاسم')}</span>
                  <span>{recipient.personName}</span>
                </div>
              )}
              <div className="inv-confirm-row">
                <span>{t('Role', 'الدور')}</span>
                <span>{getRoleLabel(recipient.role, lang)}</span>
              </div>
              {recipient.role === 'coach' && recipient.playerNames.trim() && (
                <div className="inv-confirm-row">
                  <span>{t('Players', 'اللاعبون')}</span>
                  <span style={{ whiteSpace: 'pre-line', textAlign: lang === 'ar' ? 'left' : 'right' }}>{recipient.playerNames.trim()}</span>
                </div>
              )}
            </div>

            <div className="inv-confirm-block">
              <div className="inv-confirm-section-label">{t('Items', 'الأصناف')} ({selectedItems.length})</div>
              {selectedItems.map(r => (
                <div key={r.item.id} className="inv-confirm-item-row">
                  <div>
                    <div>{lang === 'ar' ? r.item.nameAr : r.item.nameEn}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--theme-text-muted)' }}>
                      {r.item.sku}{r.item.size ? ` · ${r.item.size}` : ''}
                    </div>
                  </div>
                  <span className="inv-confirm-qty">×{r.qty}</span>
                </div>
              ))}
            </div>

            <div className="inv-form-actions">
              {submitError && <div className="inv-error-msg">{submitError}</div>}
              <button className="inv-btn inv-btn-ghost" onClick={() => setStep(2)}>
                <ChevronLeft size={15} /> {t('Back', 'رجوع')}
              </button>
              <button
                className="inv-btn inv-btn-accent"
                disabled={saving}
                onClick={handleConfirm}
              >
                {saving
                  ? <><RefreshCw size={15} className="inv-spin" /> {t('Processing…', 'جارٍ المعالجة…')}</>
                  : <><Check size={15} /> {t('Submit for approval', 'تقديم للاعتماد')}</>
                }
              </button>
            </div>
          </motion.div>
        )}

        {/* Step 4 — Receipt */}
        {step === 4 && receipt && (
          <motion.div key="s4" className="inv-form-section"
            initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.25 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: 'rgba(16,185,129,0.15)', display: 'flex', alignItems: 'center',
                justifyContent: 'center', color: 'var(--status-safe)', flexShrink: 0,
              }}>
                <Check size={18} />
              </div>
              <div>
                <div style={{ fontWeight: 700, color: 'var(--theme-text-main)' }}>
                  {t('Issue request submitted', 'تم تقديم طلب الصرف')}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--theme-text-muted)' }}>
                  {receipt.requestCode}
                </div>
              </div>
            </div>

            <div className="inv-request-submitted">
              <ShieldCheck size={22} />
              <div>
                <strong>{t('Awaiting Sports Activities Specialist', 'بانتظار أخصائي الأنشطة الرياضية')}</strong>
                <span>{t('No inventory was deducted. Stock changes only after final approval by Head of Operations.', 'لم يتم خصم أي مخزون. لا تُرحّل الكميات إلا بعد الاعتماد النهائي من رئيس العمليات.')}</span>
              </div>
            </div>

            <div className="inv-form-actions">
              <button className="inv-btn inv-btn-ghost" onClick={resetForm}>
                {t('New request', 'طلب جديد')}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      </>}
    </div>
  )
}
