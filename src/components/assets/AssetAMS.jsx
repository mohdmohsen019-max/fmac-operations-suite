import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronDown, Save, RefreshCw, Plus, Trash2, ShieldCheck, Check,
} from 'lucide-react'
import { db } from '../../firebase'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { DEFAULT_AMS_CONFIG, mergeAmsConfig, AMS_CATEGORIES, categoryAr } from './ams'
import { STRATEGIC_GOALS } from './shared'

// Deep clone so edits never mutate the live listener's object.
const clone = (o) => JSON.parse(JSON.stringify(o))

function Section({ title, sub, open, onToggle, children }) {
  return (
    <div className={`ams-sec ${open ? 'open' : ''}`}>
      <button className="ams-sec-head" onClick={onToggle}>
        <div>
          <span className="ams-sec-title">{title}</span>
          {sub && <span className="ams-sec-sub">{sub}</span>}
        </div>
        <ChevronDown size={18} className="ams-sec-chevron" />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div className="ams-sec-body"
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}>
            <div className="ams-sec-inner">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Field({ label, children }) {
  return <label className="ams-field"><span>{label}</span>{children}</label>
}

export default function AssetAMS({ amsConfig, canManage, t }) {
  const [form, setForm] = useState(() => clone(amsConfig || DEFAULT_AMS_CONFIG))
  const [openSec, setOpenSec] = useState('policy')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [dirty, setDirty] = useState(false)

  // Re-seed from the live config only while there are no unsaved edits.
  useEffect(() => {
    if (!dirty && amsConfig) setForm(clone(amsConfig))
  }, [amsConfig, dirty])

  const upd = (mut) => { setForm(f => { const n = clone(f); mut(n); return n }); setDirty(true); setSaved(false) }
  const toggle = (id) => setOpenSec(s => (s === id ? '' : id))

  const save = async () => {
    setSaving(true)
    try {
      await setDoc(doc(db, 'asset_ams', 'config'), { ...form, updated_at: serverTimestamp() }, { merge: true })
      setDirty(false); setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      console.error('[ams] save failed:', e)
      alert(t('Could not save. Please try again.', 'تعذّر الحفظ. حاول مرة أخرى.'))
    } finally {
      setSaving(false)
    }
  }

  const resetDefaults = () => {
    if (!window.confirm(t('Reset all AMS content to ISO defaults? Unsaved edits will be lost.', 'إعادة ضبط محتوى نظام الأصول إلى الإعدادات الافتراضية؟ ستُفقد التعديلات غير المحفوظة.'))) return
    setForm(clone(DEFAULT_AMS_CONFIG)); setDirty(true); setSaved(false)
  }

  if (!canManage) return null

  return (
    <div className="ast-page ams-page">
      <div className="ast-page-header">
        <div>
          <h2 className="ast-page-title">{t('Asset Management System', 'نظام إدارة الأصول')}</h2>
          <p className="ast-page-sub">
            {t('ISO 55001 content that feeds the strategic reports — policy, roles, objectives, risk, compliance, governance.',
               'محتوى ISO 55001 الذي يغذّي التقارير الاستراتيجية — السياسة، الأدوار، الأهداف، المخاطر، الالتزام، الحوكمة.')}
          </p>
        </div>
        <div className="ams-toolbar">
          <button className="ast-btn ast-btn-ghost ast-btn-sm" onClick={resetDefaults} disabled={saving}>
            {t('Reset to ISO defaults', 'الإعدادات الافتراضية')}
          </button>
          <button className="ast-btn ast-btn-primary ast-btn-sm" onClick={save} disabled={saving || !dirty}>
            {saving ? <><RefreshCw size={14} className="ast-spin" /> {t('Saving…', 'جارٍ الحفظ…')}</>
              : saved ? <><Check size={14} /> {t('Saved', 'تم الحفظ')}</>
              : <><Save size={14} /> {t('Save changes', 'حفظ التغييرات')}</>}
          </button>
        </div>
      </div>

      <div className="ams-banner" dir="rtl">
        <ShieldCheck size={16} />
        <span>الحقول المتروكة فارغة تظهر في التقارير كـ«قيد الإدخال» — هذه شفافية مقصودة تُبرز الفجوات بدل إخفائها.</span>
      </div>

      {/* ── Document control ── */}
      <Section title="ضبط الوثيقة والمراجعة" sub="الإصدار وتواريخ المراجعة" open={openSec === 'doc'} onToggle={() => toggle('doc')}>
        <div className="ams-grid-3">
          <Field label="رقم الإصدار"><input value={form.version} onChange={e => upd(n => n.version = e.target.value)} dir="ltr" /></Field>
          <Field label="آخر مراجعة"><input type="date" value={form.review.last} onChange={e => upd(n => n.review.last = e.target.value)} dir="ltr" /></Field>
          <Field label="المراجعة القادمة"><input type="date" value={form.review.next} onChange={e => upd(n => n.review.next = e.target.value)} dir="ltr" /></Field>
        </div>
      </Section>

      {/* ── Policy & scope ── */}
      <Section title="السياسة والنطاق" sub="سياسة إدارة الأصول ونطاق النظام" open={openSec === 'policy'} onToggle={() => toggle('policy')}>
        <Field label="بيان سياسة إدارة الأصول (عربي)">
          <textarea rows={4} dir="rtl" value={form.policy.statementAr} onChange={e => upd(n => n.policy.statementAr = e.target.value)} />
        </Field>
        <ListEditor label="المبادئ" items={form.policy.principlesAr}
          onChange={items => upd(n => n.policy.principlesAr = items)} />
        <Field label="بيان النطاق (عربي)">
          <textarea rows={3} dir="rtl" value={form.scope.statementAr} onChange={e => upd(n => n.scope.statementAr = e.target.value)} />
        </Field>
        <div className="ams-grid-2">
          <ListEditor label="ضمن النطاق" items={form.scope.inScopeAr} onChange={items => upd(n => n.scope.inScopeAr = items)} />
          <ListEditor label="خارج النطاق" items={form.scope.outOfScopeAr} onChange={items => upd(n => n.scope.outOfScopeAr = items)} />
        </div>
        <div className="ams-grid-2">
          <label className="ams-check">
            <input type="checkbox" checked={form.scope.digitalInScope} onChange={e => upd(n => n.scope.digitalInScope = e.target.checked)} />
            <span>الأصول الرقمية مشمولة ضمن النطاق</span>
          </label>
          <Field label="تاريخ الإدراج المستهدف للأصول الرقمية">
            <input type="date" value={form.scope.digitalTargetDate} onChange={e => upd(n => n.scope.digitalTargetDate = e.target.value)} dir="ltr" />
          </Field>
        </div>
      </Section>

      {/* ── Roles ── */}
      <Section title="الأدوار والمسؤوليات" sub="المالك / المدير / الحارس لكل فئة" open={openSec === 'roles'} onToggle={() => toggle('roles')}>
        <div className="ams-tablewrap">
          <table className="ams-table">
            <thead><tr><th>الفئة</th><th>المالك</th><th>المدير</th><th>الحارس</th></tr></thead>
            <tbody>
              {form.roles.map((r, i) => (
                <tr key={i}>
                  <td className="ams-td-cat">{categoryAr(r.category)}</td>
                  <td><input value={r.owner} dir="rtl" onChange={e => upd(n => n.roles[i].owner = e.target.value)} /></td>
                  <td><input value={r.manager} dir="rtl" onChange={e => upd(n => n.roles[i].manager = e.target.value)} /></td>
                  <td><input value={r.custodian} dir="rtl" onChange={e => upd(n => n.roles[i].custodian = e.target.value)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ── Objectives ── */}
      <Section title="أهداف إدارة الأصول" sub="مؤشرات قابلة للقياس لكل هدف استراتيجي" open={openSec === 'obj'} onToggle={() => toggle('obj')}>
        <div className="ams-tablewrap">
          <table className="ams-table">
            <thead><tr><th>الهدف</th><th>المؤشر</th><th>المرجعي</th><th>المستهدف</th><th>الوحدة</th><th>الموعد</th><th /></tr></thead>
            <tbody>
              {form.objectives.map((o, i) => (
                <tr key={i}>
                  <td>
                    <select value={o.goalCode} dir="rtl" onChange={e => upd(n => n.objectives[i].goalCode = e.target.value)}>
                      {STRATEGIC_GOALS.map(g => <option key={g.code} value={g.code}>{g.code} — {g.shortAr}</option>)}
                    </select>
                  </td>
                  <td><input value={o.metricAr} dir="rtl" onChange={e => upd(n => n.objectives[i].metricAr = e.target.value)} /></td>
                  <td className="ams-td-num"><input value={o.baseline ?? ''} dir="ltr" onChange={e => upd(n => n.objectives[i].baseline = e.target.value === '' ? null : Number(e.target.value))} /></td>
                  <td className="ams-td-num"><input value={o.target ?? ''} dir="ltr" onChange={e => upd(n => n.objectives[i].target = e.target.value === '' ? null : Number(e.target.value))} /></td>
                  <td className="ams-td-sm"><input value={o.unit} dir="rtl" onChange={e => upd(n => n.objectives[i].unit = e.target.value)} /></td>
                  <td className="ams-td-sm"><input type="date" value={o.targetDate} dir="ltr" onChange={e => upd(n => n.objectives[i].targetDate = e.target.value)} /></td>
                  <td><button className="ams-del" onClick={() => upd(n => n.objectives.splice(i, 1))}><Trash2 size={13} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button className="ams-add" onClick={() => upd(n => n.objectives.push({ goalCode: 'G1', metricAr: '', baseline: null, target: 100, unit: '%', targetDate: '2028-12-31', actualKey: null }))}>
          <Plus size={13} /> إضافة هدف
        </button>
      </Section>

      {/* ── Compliance ── */}
      <Section title="سجل الالتزام القانوني والتنظيمي" sub="المتطلبات وتواريخ التحقق" open={openSec === 'comp'} onToggle={() => toggle('comp')}>
        <div className="ams-tablewrap">
          <table className="ams-table">
            <thead><tr><th>الفئة/النطاق</th><th>المتطلب</th><th>التكرار</th><th>آخر تحقق</th><th>الاستحقاق القادم</th><th /></tr></thead>
            <tbody>
              {form.compliance.map((r, i) => (
                <tr key={i}>
                  <td className="ams-td-sm">
                    <select value={r.category} dir="rtl" onChange={e => upd(n => n.compliance[i].category = e.target.value)}>
                      <option value="All">جميع الفئات</option>
                      {AMS_CATEGORIES.map(c => <option key={c} value={c}>{categoryAr(c)}</option>)}
                    </select>
                  </td>
                  <td><input value={r.requirementAr} dir="rtl" onChange={e => upd(n => n.compliance[i].requirementAr = e.target.value)} /></td>
                  <td className="ams-td-sm"><input value={r.freqAr} dir="rtl" onChange={e => upd(n => n.compliance[i].freqAr = e.target.value)} /></td>
                  <td className="ams-td-sm"><input type="date" value={r.lastVerified} dir="ltr" onChange={e => upd(n => n.compliance[i].lastVerified = e.target.value)} /></td>
                  <td className="ams-td-sm"><input type="date" value={r.nextDue} dir="ltr" onChange={e => upd(n => n.compliance[i].nextDue = e.target.value)} /></td>
                  <td><button className="ams-del" onClick={() => upd(n => n.compliance.splice(i, 1))}><Trash2 size={13} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button className="ams-add" onClick={() => upd(n => n.compliance.push({ category: 'All', requirementAr: '', freqAr: 'سنوي', lastVerified: '', nextDue: '' }))}>
          <Plus size={13} /> إضافة متطلب
        </button>
      </Section>

      {/* ── Maintenance ── */}
      <Section title="استراتيجية الصيانة" sub="الأسلوب والدورية والمعيار لكل فئة" open={openSec === 'maint'} onToggle={() => toggle('maint')}>
        <div className="ams-tablewrap">
          <table className="ams-table">
            <thead><tr><th>الفئة</th><th>الأسلوب</th><th>الدورية</th><th>المعيار</th></tr></thead>
            <tbody>
              {form.maintenance.map((m, i) => (
                <tr key={i}>
                  <td className="ams-td-cat">{categoryAr(m.category)}</td>
                  <td><input value={m.approachAr} dir="rtl" onChange={e => upd(n => n.maintenance[i].approachAr = e.target.value)} /></td>
                  <td><input value={m.intervalAr} dir="rtl" onChange={e => upd(n => n.maintenance[i].intervalAr = e.target.value)} /></td>
                  <td><input value={m.standardAr} dir="rtl" onChange={e => upd(n => n.maintenance[i].standardAr = e.target.value)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Field label="قطع الغيار الحرجة وخطة الطوارئ">
          <textarea rows={2} dir="rtl" value={form.criticalSparesAr} onChange={e => upd(n => n.criticalSparesAr = e.target.value)} />
        </Field>
      </Section>

      {/* ── Investment weights ── */}
      <Section title="أوزان ترتيب أولويات الاستثمار" sub="معاملات معادلة النقاط" open={openSec === 'inv'} onToggle={() => toggle('inv')}>
        <Field label="معامل عقوبة التكلفة (0–1)">
          <input type="number" step="0.01" min="0" max="1" dir="ltr" value={form.investment.costPenalty}
            onChange={e => upd(n => n.investment.costPenalty = Number(e.target.value))} />
        </Field>
        <div className="ams-grid-3">
          {STRATEGIC_GOALS.map(g => (
            <Field key={g.code} label={`${g.code} — ${g.shortAr}`}>
              <input type="number" step="0.1" min="0" max="1" dir="ltr" value={form.investment.goalWeights[g.code] ?? 0.7}
                onChange={e => upd(n => { n.investment.goalWeights[g.code] = Number(e.target.value) })} />
            </Field>
          ))}
        </div>
      </Section>

      {/* ── Governance / nonconformity ── */}
      <Section title="الحوكمة وحالات عدم المطابقة" sub="دورة المراجعة والسجل التصحيحي" open={openSec === 'gov'} onToggle={() => toggle('gov')}>
        <Field label="المراجعة الإدارية"><textarea rows={2} dir="rtl" value={form.governance.managementReviewAr} onChange={e => upd(n => n.governance.managementReviewAr = e.target.value)} /></Field>
        <Field label="التدقيق الداخلي"><textarea rows={2} dir="rtl" value={form.governance.internalAuditAr} onChange={e => upd(n => n.governance.internalAuditAr = e.target.value)} /></Field>
        <div className="ams-sub-h">سجل حالات عدم المطابقة</div>
        <div className="ams-tablewrap">
          <table className="ams-table">
            <thead><tr><th>التاريخ</th><th>الملاحظة</th><th>الإجراء التصحيحي</th><th>المسؤول</th><th>الحالة</th><th /></tr></thead>
            <tbody>
              {(form.nonconformities || []).length === 0 ? (
                <tr><td colSpan={6} className="ams-empty-row">لا توجد حالات مسجّلة</td></tr>
              ) : form.nonconformities.map((r, i) => (
                <tr key={i}>
                  <td className="ams-td-sm"><input type="date" value={r.date} dir="ltr" onChange={e => upd(n => n.nonconformities[i].date = e.target.value)} /></td>
                  <td><input value={r.findingAr} dir="rtl" onChange={e => upd(n => n.nonconformities[i].findingAr = e.target.value)} /></td>
                  <td><input value={r.actionAr} dir="rtl" onChange={e => upd(n => n.nonconformities[i].actionAr = e.target.value)} /></td>
                  <td className="ams-td-sm"><input value={r.owner} dir="rtl" onChange={e => upd(n => n.nonconformities[i].owner = e.target.value)} /></td>
                  <td className="ams-td-sm"><input value={r.status} dir="rtl" onChange={e => upd(n => n.nonconformities[i].status = e.target.value)} /></td>
                  <td><button className="ams-del" onClick={() => upd(n => n.nonconformities.splice(i, 1))}><Trash2 size={13} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button className="ams-add" onClick={() => upd(n => { n.nonconformities = n.nonconformities || []; n.nonconformities.push({ date: new Date().toISOString().slice(0, 10), findingAr: '', actionAr: '', owner: '', status: 'مفتوح' }) })}>
          <Plus size={13} /> إضافة حالة
        </button>
      </Section>

      {/* ── Disposal & data quality ── */}
      <Section title="الاستبعاد وجودة البيانات" sub="سياسة التخلص والإفصاح المنهجي" open={openSec === 'disp'} onToggle={() => toggle('disp')}>
        <Field label="سياسة الاستبعاد والتخلص"><textarea rows={3} dir="rtl" value={form.disposal.statementAr} onChange={e => upd(n => n.disposal.statementAr = e.target.value)} /></Field>
        <div className="ams-grid-2">
          <Field label="أسلوب الفحص"><input value={form.dataQuality.inspectionMethodAr} dir="rtl" onChange={e => upd(n => n.dataQuality.inspectionMethodAr = e.target.value)} /></Field>
          <Field label="تاريخ الفحص"><input value={form.dataQuality.inspectionDate} dir="ltr" onChange={e => upd(n => n.dataQuality.inspectionDate = e.target.value)} /></Field>
          <Field label="مستوى الثقة بالتكاليف"><input value={form.dataQuality.costConfidenceAr} dir="rtl" onChange={e => upd(n => n.dataQuality.costConfidenceAr = e.target.value)} /></Field>
          <Field label="دورية تحديث السجل"><input value={form.dataQuality.refreshFrequencyAr} dir="rtl" onChange={e => upd(n => n.dataQuality.refreshFrequencyAr = e.target.value)} /></Field>
          <Field label="الجهة المسؤولة"><input value={form.dataQuality.accountableAr} dir="rtl" onChange={e => upd(n => n.dataQuality.accountableAr = e.target.value)} /></Field>
        </div>
      </Section>
    </div>
  )
}

/* String-list editor (add/remove rows). */
function ListEditor({ label, items, onChange }) {
  return (
    <div className="ams-listeditor">
      <span className="ams-field-label">{label}</span>
      {items.map((it, i) => (
        <div key={i} className="ams-list-row">
          <input value={it} dir="rtl" onChange={e => { const c = [...items]; c[i] = e.target.value; onChange(c) }} />
          <button className="ams-del" onClick={() => onChange(items.filter((_, j) => j !== i))}><Trash2 size={13} /></button>
        </div>
      ))}
      <button className="ams-add ams-add-sm" onClick={() => onChange([...items, ''])}><Plus size={12} /> إضافة</button>
    </div>
  )
}
