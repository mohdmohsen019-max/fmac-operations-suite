import React, { useMemo, useState } from 'react'
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, CheckCircle2, Download,
  FileSpreadsheet, FileText, Gauge, RefreshCw, ShieldCheck, Wrench,
} from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useLanguage } from '../../contexts/LanguageContext'
import { useFleetSettings } from './FleetSettingsContext'
import { SCORE_DEFAULTS } from './scoreCalculation'
import { useFleetPerformance } from './useFleetPerformance'
import { exportFleetPerformanceExcel, exportFleetPerformancePdf } from './fleetPerformanceExport'
import './FleetPerformanceReport.css'

const WINDOWS = { monthly: 1, quarterly: 3, halfYear: 6, annual: 12 }
const labels = {
  averageVehicleScore: ['Average vehicle rating', 'متوسط تقييم الأسطول'],
  maintenanceCompliance: ['Preventive maintenance compliance', 'الالتزام بالصيانة الوقائية'],
  safetyCoverage: ['Fleet safety indicator', 'مؤشر سلامة الأسطول'],
  fuelAttainment: ['Fuel consumption', 'استهلاك الوقود'],
  speedingReduction: ['Speeding reduction', 'انخفاض تجاوز السرعة'],
  fineFreeRate: ['Fine-free bus rate', 'نسبة الحافلات دون مخالفات'],
}

const formatValue = (value, locale, suffix = '%') => value == null
  ? 'Unavailable'
  : `${Number(value).toLocaleString(locale, { maximumFractionDigits: 1 })}${suffix}`

export default function FleetPerformanceReport({ canEdit = false }) {
  const { t, locale } = useLanguage()
  const { settings: fleetSettings } = useFleetSettings()
  const scoreSettings = useMemo(() => ({ ...SCORE_DEFAULTS, ...fleetSettings }), [fleetSettings])
  const performance = useFleetPerformance({ scoreSettings })
  const [period, setPeriod] = useState('monthly')
  const data = performance.data
  const history = performance.snapshots.slice(-WINDOWS[period]).map((snapshot) => ({
    period: snapshot.period || snapshot.id,
    score: snapshot.overallScore == null ? null : Math.round(snapshot.overallScore * 10) / 10,
    target: snapshot.overallTarget,
    coverage: snapshot.availableWeight,
  }))
  const ranking = (data?.vehicleScores || []).slice().sort((a, b) => b.score - a.score)
  const priorities = (data?.preventiveInsights || []).slice(0, 8)
  const dueWork = (data?.planRows || []).filter((row) => ['overdue', 'due', 'due-soon'].includes(row.status))
  const targetFor = (key) => ({
    averageVehicleScore: data?.settings.vehicleSafetyTarget,
    maintenanceCompliance: data?.settings.maintenanceComplianceTarget,
    safetyCoverage: data?.settings.safetyCoverageTarget,
    fuelAttainment: data?.settings.fuelConsumptionTargetL100km,
    speedingReduction: data?.settings.speedingReductionTarget,
    fineFreeRate: data?.settings.fineFreeTarget,
  })[key]
  const varianceFor = (key, actual) => {
    const target = targetFor(key)
    if (actual == null || target == null) return null
    return key === 'fuelAttainment' ? Number(target) - Number(actual) : Number(actual) - Number(target)
  }

  if (performance.loading) return <div className="fpr-loading"><div /><div /><div /><div /></div>
  if (performance.error && !data) return <div className="fpr-error"><AlertTriangle /><div><strong>{t('Fleet performance report is unavailable', 'تقرير أداء الأسطول غير متاح')}</strong><span>{performance.error}</span></div><button onClick={() => performance.refresh()}><RefreshCw size={14} />{t('Retry', 'إعادة المحاولة')}</button></div>

  return <section className="fpr-report">
    <header className="fpr-hero">
      <div><span>{t('Management intelligence · confirmed buses only', 'مؤشرات الإدارة · الحافلات المعتمدة فقط')}</span><h2>{t('Fleet Performance Report', 'تقرير أداء الأسطول')}</h2><p>{t('Targets, actual results, variance, history and preventive action from one calculation source.', 'المستهدفات والنتائج الفعلية والانحراف والسجل والإجراءات الوقائية من مصدر حساب واحد.')}</p></div>
      <div className="fpr-actions"><select value={period} onChange={(event) => setPeriod(event.target.value)} aria-label={t('Comparison period', 'فترة المقارنة')}><option value="monthly">{t('Monthly', 'شهري')}</option><option value="quarterly">{t('Quarterly', 'ربع سنوي')}</option><option value="halfYear">{t('Half-year', 'نصف سنوي')}</option><option value="annual">{t('Annual', 'سنوي')}</option></select><button onClick={() => performance.refresh({ persist: canEdit })} disabled={performance.refreshing}><RefreshCw size={14} className={performance.refreshing ? 'fms-spin' : ''} />{t('Refresh indicators', 'تحديث المؤشرات')}</button><button onClick={() => exportFleetPerformanceExcel({ data, snapshots: performance.snapshots, locale, periodLabel: period })}><FileSpreadsheet size={14} />Excel</button><button onClick={() => exportFleetPerformancePdf({ data, snapshots: performance.snapshots, locale, periodLabel: period })}><FileText size={14} />PDF</button></div>
    </header>

    {data && <>
      <div className="fpr-overview">
        <article className={`fpr-score ${data.overallScore == null ? 'unavailable' : data.overallScore >= data.overallTarget ? 'on-target' : 'below-target'}`}><div><Gauge size={18} /><span>{t('Composite fleet score', 'الدرجة المركبة للأسطول')}</span></div><strong>{data.overallScore == null ? '—' : Math.round(data.overallScore)}<small>/100</small></strong><p>{data.overallScore == null ? t('Withheld: less than 80% weighted data is available.', 'محجوبة: أقل من 80٪ من وزن البيانات متاح.') : data.provisional ? t(`Provisional · ${data.availableWeight}% weighted coverage`, `مؤقتة · تغطية موزونة ${data.availableWeight}٪`) : t(`Verified · year-end target ${data.overallTarget}`, `موثقة · مستهدف نهاية السنة ${data.overallTarget}`)}</p></article>
        <article><div><ShieldCheck size={18} /><span>{t('Scored fleet coverage', 'تغطية تقييم الأسطول')}</span></div><strong>{Math.round(data.scoreDataCoverage)}<small>%</small></strong><p>{data.coverage.scoredBuses}/{data.coverage.registeredBuses} {t('canonical buses', 'حافلة معتمدة')}</p></article>
        <article><div><Wrench size={18} /><span>{t('Preventive work requiring action', 'الأعمال الوقائية التي تتطلب إجراء')}</span></div><strong>{dueWork.length}</strong><p>{dueWork.filter((row) => row.status === 'overdue').length} {t('overdue', 'متأخرة')}</p></article>
        <article><div><AlertTriangle size={18} /><span>{t('Half-year violations', 'مخالفات نصف السنة')}</span></div><strong>{data.trafficViolations.count}</strong><p>{data.trafficViolations.affectedVehicles} {t('affected buses', 'حافلات متأثرة')}</p></article>
      </div>

      <div className="fpr-main-grid">
        <article className="fpr-panel fpr-kpi-table"><header><div><h3>{t('Target performance', 'الأداء مقابل المستهدف')}</h3><p>{t('Snapshot-safe values; later target edits do not rewrite history.', 'قيم محفوظة كلقطة؛ تعديل المستهدف لاحقاً لا يعيد كتابة السجل.')}</p></div><span>{data.calculationVersion ? `v${data.calculationVersion}` : ''}</span></header><div className="fpr-table-scroll"><table><thead><tr><th>{t('Indicator', 'المؤشر')}</th><th>{t('Actual', 'الفعلي')}</th><th>{t('Target', 'المستهدف')}</th><th>{t('Variance', 'الانحراف')}</th><th>{t('Weight', 'الوزن')}</th></tr></thead><tbody>{Object.entries(labels).map(([key, [en, ar]]) => { const actual = data.metrics[key]?.value; const target = targetFor(key); const variance = varianceFor(key, actual); const suffix = key === 'fuelAttainment' ? ' L/100km' : '%'; return <tr key={key}><td><strong>{t(en, ar)}</strong><small>{data.metrics[key]?.subscore == null ? t('Unavailable', 'غير متاح') : t('Included in composite', 'مدرج في الدرجة المركبة')}</small></td><td>{formatValue(actual, locale, suffix)}</td><td>{formatValue(target, locale, suffix)}</td><td>{variance == null ? '—' : <span className={variance >= 0 ? 'positive' : 'negative'}>{variance >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{formatValue(variance, locale, suffix)}</span>}</td><td>{data.metrics[key]?.weight}%</td></tr> })}</tbody></table></div></article>
        <article className="fpr-panel fpr-history"><header><div><h3>{t('Immutable KPI history', 'السجل الثابت للمؤشرات')}</h3><p>{t(`${history.length} saved monthly snapshot(s) in this view`, `${history.length} لقطة شهرية محفوظة في هذا العرض`)}</p></div></header>{history.length ? <ResponsiveContainer width="100%" height={230}><AreaChart data={history}><defs><linearGradient id="fprFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--theme-accent)" stopOpacity={.28}/><stop offset="100%" stopColor="var(--theme-accent)" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="var(--theme-border)" strokeDasharray="3 5" vertical={false}/><XAxis dataKey="period" tick={{ fontSize: 11 }} /><YAxis domain={[0, 100]} tick={{ fontSize: 11 }} /><Tooltip /><Area type="monotone" dataKey="score" stroke="var(--theme-accent)" strokeWidth={2} fill="url(#fprFill)" connectNulls /></AreaChart></ResponsiveContainer> : <div className="fpr-empty"><Download size={20}/><strong>{t('No saved comparison yet', 'لا توجد مقارنة محفوظة بعد')}</strong><span>{t('Use Refresh indicators to save the current monthly snapshot.', 'استخدم تحديث المؤشرات لحفظ اللقطة الشهرية الحالية.')}</span></div>}</article>
      </div>

      <div className="fpr-bottom-grid">
        <article className="fpr-panel"><header><div><h3>{t('Bus ranking', 'ترتيب الحافلات')}</h3><p>{t('Canonical parent and camera telemetry is deduplicated.', 'تم منع تكرار بيانات الأصل والكاميرا للحافلة المعتمدة.')}</p></div></header><div className="fpr-ranking">{ranking.length ? ranking.map((vehicle, index) => <div key={vehicle.registration}><span>{index + 1}</span><strong>{vehicle.registration}</strong><small>{Math.round(vehicle.distanceKm || 0).toLocaleString(locale)} km</small><b>{Math.round(vehicle.score)}</b></div>) : <div className="fpr-empty compact">{t('No scored buses in this period.', 'لا توجد حافلات مقيمة في هذه الفترة.')}</div>}</div></article>
        <article className="fpr-panel"><header><div><h3>{t('Preventive recommendations', 'التوصيات الوقائية')}</h3><p>{t('Every recommendation includes the evidence that triggered it.', 'كل توصية تعرض الدليل الذي أدى إليها.')}</p></div></header><div className="fpr-priorities">{priorities.length ? priorities.map((item) => <div key={item.id} className={item.severity}><span>{item.severity === 'critical' ? <AlertTriangle size={15}/> : <CheckCircle2 size={15}/>}</span><div><strong>{item.vehicleReg} · {t(item.categoryEn || item.category, item.categoryAr || item.category)}</strong><p>{t(item.evidenceEn || item.evidence, item.evidenceAr || item.evidence)}</p><small>{t(item.recommendationEn || item.recommendation, item.recommendationAr || item.recommendation)}</small></div></div>) : <div className="fpr-empty compact">{t('No preventive exceptions in the available history.', 'لا توجد استثناءات وقائية في السجل المتاح.')}</div>}</div></article>
      </div>
    </>}
  </section>
}
