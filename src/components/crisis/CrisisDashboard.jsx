/* ══════════════════════════════════════════════════════════════════════════
   Crisis module — Command Dashboard (§5)
   Executive overview with a full filter bar, live metrics, branch comparison,
   auto-computed KPIs, latest updates and quick actions.
   ════════════════════════════════════════════════════════════════════════ */
import { useState, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from 'recharts'
import {
  Siren, Zap, FlaskConical, Boxes, AlertTriangle, ShieldAlert, Timer,
  Activity, CheckCircle2, Gauge, Filter, RotateCcw, Wrench,
} from 'lucide-react'
import { StatCard, Section, Select, Empty } from './CrisisShared'
import {
  L, findById, toMillis, fmtDateTime, isOverdue, daysFromNow,
  INCIDENT_STATUSES, CRISIS_LEVELS, INCIDENT_CATEGORIES, INCIDENT_KINDS,
  LOCATIONS, ORG_UNITS, JOB_TITLES, ACTIVE_STATUSES, OPEN_STATUSES,
  riskScore, riskBand, computeCrisisKpis, KPIS, attainment,
  kpiStatusOf, TONE_HEX, WORKFLOW_STAGES,
} from './crisisData'

const CHART_COLORS = ['#dc2626', '#d97706', '#2563eb', '#16a34a', '#7c3aed', '#0891b2', '#db2777', '#65a30d']
const YEAR = new Date().getFullYear()

export default function CrisisDashboard(props) {
  const { lang, t, locale, incidents = [], actions = [], corrective = [], exercises = [],
    risks = [], services = [], plans = [], recovery = [], contacts = [], decisions = [], goTab } = props

  const [showFilters, setShowFilters] = useState(false)
  const [f, setF] = useState({ from: '', to: '', location: 'all', unit: 'all', category: 'all', level: 'all', status: 'all', kind: 'all', owner: 'all' })
  const setFilter = (k, v) => setF(s => ({ ...s, [k]: v }))
  const reset = () => setF({ from: '', to: '', location: 'all', unit: 'all', category: 'all', level: 'all', status: 'all', kind: 'all', owner: 'all' })

  const inc = useMemo(() => {
    const fromMs = f.from ? new Date(f.from).getTime() : null
    const toMs = f.to ? new Date(f.to).getTime() + 86400000 : null
    return incidents.filter(i => {
      const ts = toMillis(i.createdAt)
      if (fromMs && ts < fromMs) return false
      if (toMs && ts > toMs) return false
      if (f.location !== 'all' && !(i.locations || []).includes(f.location)) return false
      if (f.unit !== 'all' && i.unit !== f.unit) return false
      if (f.category !== 'all' && i.category !== f.category) return false
      if (f.level !== 'all' && i.level !== f.level) return false
      if (f.status !== 'all' && i.status !== f.status) return false
      if (f.kind !== 'all' && (i.kind || 'real') !== f.kind) return false
      return true
    })
  }, [incidents, f])

  const active = inc.filter(i => ACTIVE_STATUSES.includes(i.status))
  const open = inc.filter(i => OPEN_STATUSES.includes(i.status))

  const byLevel = CRISIS_LEVELS.map((l, idx) => ({ name: L(l, lang), value: inc.filter(i => i.level === l.id).length, fill: CHART_COLORS[idx] }))
  const byCategory = INCIDENT_CATEGORIES.map(c => ({ name: L(c, lang), value: inc.filter(i => i.category === c.id).length })).filter(x => x.value > 0)
  const byLocation = LOCATIONS.map((l, idx) => ({ id: l.id, name: L(l, lang), value: inc.filter(i => (i.locations || []).includes(l.id)).length, fill: CHART_COLORS[idx] }))

  const affectedServiceIds = new Set()
  active.forEach(i => (i.affectedServices || []).forEach(s => affectedServiceIds.add(s)))
  const svcOperational = services.filter(s => s.status === 'operational').length
  const svcDisrupted = services.filter(s => s.status === 'disrupted').length

  const overdueActions = actions.filter(a => isOverdue(a.dueDate, a.status)).length
  const overdueCapa = corrective.filter(a => isOverdue(a.dueDate, a.status)).length

  const soonMs = daysFromNow(30)
  const exercisesDue = exercises.filter(e => e.date && new Date(e.date).getTime() <= soonMs && e.status !== 'completed' && e.status !== 'cancelled').length
  const reviewsDue = [...services, ...plans].filter(x => x.nextReview && new Date(x.nextReview).getTime() <= soonMs).length

  const scoredRisks = risks.map(r => ({ ...r, _s: riskScore(r.probability, r.impact) }))
  const highRisks = scoredRisks.filter(r => ['high', 'crit'].includes(riskBand(r._s).id)).length

  // React Compiler auto-memoizes this; a manual useMemo here can't be preserved
  // because it depends on the already-memoized `inc`.
  const kpis = computeCrisisKpis({ incidents: inc, services, plans, exercises, corrective, contacts, recovery })

  const latestUpdates = useMemo(() => {
    const rows = []
    inc.forEach(i => {
      (i.statusLog || []).forEach(s => rows.push({ at: s.at, number: i.number, text: L(findById(INCIDENT_STATUSES, s.status), lang), by: s.by }))
      ;(i.stageLog || []).slice(-1).forEach(s => rows.push({ at: s.at, number: i.number, text: L(findById(WORKFLOW_STAGES, s.stage), lang), by: s.by }))
    })
    return rows.filter(r => r.at).sort((a, b) => b.at - a.at).slice(0, 8)
  }, [inc, lang])

  const recentDecisions = useMemo(() =>
    decisions.slice().sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt)).slice(0, 6), [decisions])

  const fmtKpi = (id) => {
    const k = findById(KPIS, id); const v = kpis[id]?.value
    if (v == null) return '—'
    return `${v}${k.ut === '%' ? '%' : k.ut === 'h' ? (lang === 'ar' ? ' س' : 'h') : ''}`
  }
  const kpiTone = (id) => {
    const k = findById(KPIS, id); const v = kpis[id]?.value
    if (v == null) return 'neutral'
    return kpiStatusOf(attainment(k, v, k.targets[YEAR])).tone
  }

  const QUICK = [
    { icon: Siren, label: { en: 'Report incident', ar: 'الإبلاغ عن حادث' }, go: 'incidents', tone: 'crit' },
    { icon: Zap, label: { en: 'Activate a plan', ar: 'تفعيل خطة' }, go: 'plans', tone: 'warn' },
    { icon: FlaskConical, label: { en: 'Start an exercise', ar: 'بدء تمرين' }, go: 'exercises', tone: 'info' },
    { icon: Boxes, label: { en: 'Service status update', ar: 'تحديث حالة خدمة' }, go: 'services', tone: 'good' },
  ]

  return (
    <div className="crs-dash">
      {/* quick actions */}
      <div className="crs-quick">
        {QUICK.map(q => (
          <button key={q.go} className="crs-quick-btn" onClick={() => goTab(q.go)} style={{ '--q': TONE_HEX[q.tone] }}>
            <q.icon size={16} /><span dir="auto">{L(q.label, lang)}</span>
          </button>
        ))}
      </div>

      {/* filter bar */}
      <div className="crs-dash-filterbar">
        <button className="crs-btn crs-btn-ghost crs-btn-sm" onClick={() => setShowFilters(v => !v)}>
          <Filter size={13} />{t('Filters', 'عوامل التصفية')}
        </button>
        <button className="crs-btn crs-btn-ghost crs-btn-sm" onClick={reset}><RotateCcw size={12} />{t('Reset', 'إعادة')}</button>
        <span className="crs-dash-filtercount" dir="auto">{inc.length} {t('incidents in view', 'حادث معروض')}</span>
      </div>
      {showFilters && (
        <div className="crs-dash-filters">
          <label className="crs-field crs-field--half"><span className="crs-field-label">{t('From', 'من')}</span>
            <input type="date" className="crs-input" value={f.from} onChange={e => setFilter('from', e.target.value)} dir="ltr" /></label>
          <label className="crs-field crs-field--half"><span className="crs-field-label">{t('To', 'إلى')}</span>
            <input type="date" className="crs-input" value={f.to} onChange={e => setFilter('to', e.target.value)} dir="ltr" /></label>
          <div className="crs-field crs-field--half"><span className="crs-field-label">{t('Location', 'الموقع')}</span>
            <Select value={f.location} onChange={v => setFilter('location', v)} lang={lang} options={[{ id: 'all', en: 'All', ar: 'الكل' }, ...LOCATIONS]} /></div>
          <div className="crs-field crs-field--half"><span className="crs-field-label">{t('Unit', 'الوحدة')}</span>
            <Select value={f.unit} onChange={v => setFilter('unit', v)} lang={lang} options={[{ id: 'all', en: 'All', ar: 'الكل' }, ...ORG_UNITS]} /></div>
          <div className="crs-field crs-field--half"><span className="crs-field-label">{t('Category', 'الفئة')}</span>
            <Select value={f.category} onChange={v => setFilter('category', v)} lang={lang} options={[{ id: 'all', en: 'All', ar: 'الكل' }, ...INCIDENT_CATEGORIES]} /></div>
          <div className="crs-field crs-field--half"><span className="crs-field-label">{t('Level', 'المستوى')}</span>
            <Select value={f.level} onChange={v => setFilter('level', v)} lang={lang} options={[{ id: 'all', en: 'All', ar: 'الكل' }, ...CRISIS_LEVELS]} /></div>
          <div className="crs-field crs-field--half"><span className="crs-field-label">{t('Status', 'الحالة')}</span>
            <Select value={f.status} onChange={v => setFilter('status', v)} lang={lang} options={[{ id: 'all', en: 'All', ar: 'الكل' }, ...INCIDENT_STATUSES]} /></div>
          <div className="crs-field crs-field--half"><span className="crs-field-label">{t('Real / simulation', 'فعلي / محاكاة')}</span>
            <Select value={f.kind} onChange={v => setFilter('kind', v)} lang={lang} options={[{ id: 'all', en: 'All', ar: 'الكل' }, ...INCIDENT_KINDS]} /></div>
        </div>
      )}

      {/* headline stats */}
      <div className="crs-stat-grid">
        <StatCard label={t('Active incidents', 'الحوادث النشطة')} value={active.length} icon={Siren} tone={active.length ? 'crit' : 'good'} accent onClick={() => goTab('incidents')} />
        <StatCard label={t('Open incidents', 'الحوادث المفتوحة')} value={open.length} icon={Activity} onClick={() => goTab('incidents')} />
        <StatCard label={t('Affected critical services', 'الخدمات الحيوية المتأثرة')} value={affectedServiceIds.size} icon={Boxes} tone={affectedServiceIds.size ? 'warn' : 'good'} />
        <StatCard label={t('Services disrupted', 'خدمات متوقفة')} value={svcDisrupted} sub={`${svcOperational} ${t('operational', 'تعمل')}`} icon={ShieldAlert} tone={svcDisrupted ? 'crit' : 'good'} accent onClick={() => goTab('services')} />
        <StatCard label={t('Overdue response actions', 'إجراءات استجابة متأخرة')} value={overdueActions} icon={Timer} tone={overdueActions ? 'crit' : 'good'} accent />
        <StatCard label={t('Overdue corrective actions', 'إجراءات تصحيحية متأخرة')} value={overdueCapa} icon={Wrench} tone={overdueCapa ? 'warn' : 'good'} onClick={() => goTab('corrective')} />
        <StatCard label={t('Exercises & reviews due', 'تمارين ومراجعات مستحقة')} value={exercisesDue + reviewsDue} sub={t('within 30 days', 'خلال 30 يوماً')} icon={FlaskConical} tone={(exercisesDue + reviewsDue) ? 'warn' : 'good'} />
        <StatCard label={t('Critical & high risks', 'مخاطر حرجة وعالية')} value={highRisks} icon={AlertTriangle} tone={highRisks ? 'crit' : 'good'} accent onClick={() => goTab('risks')} />
      </div>

      {/* KPI tiles */}
      <Section title={t('Readiness indicators', 'مؤشرات الجاهزية')} sub={t('Auto-calculated from live records · target year', 'محسوبة تلقائياً من السجلات الحية · سنة الهدف') + ` ${YEAR}`} icon={Gauge}>
        <div className="crs-stat-grid">
          <StatCard label={t('Avg response time', 'متوسط زمن الاستجابة')} value={fmtKpi('avg_response')} tone={kpiTone('avg_response')} icon={Timer} />
          <StatCard label={t('Avg recovery time', 'متوسط زمن التعافي')} value={fmtKpi('avg_recovery')} tone={kpiTone('avg_recovery')} icon={Timer} />
          <StatCard label={t('Services restored within RTO', 'ضمن زمن التعافي المستهدف')} value={fmtKpi('rto_met')} tone={kpiTone('rto_met')} icon={CheckCircle2} />
          <StatCard label={t('Approved plans tested', 'الخطط المعتمدة المختبَرة')} value={fmtKpi('plans_tested')} tone={kpiTone('plans_tested')} icon={CheckCircle2} />
          <StatCard label={t('Successful recovery tests', 'نجاح اختبارات التعافي')} value={fmtKpi('recovery_success')} tone={kpiTone('recovery_success')} icon={CheckCircle2} />
          <StatCard label={t('Services with approved plans', 'خدمات بخطط معتمدة')} value={fmtKpi('services_planned')} tone={kpiTone('services_planned')} icon={Boxes} />
          <StatCard label={t('Backup readiness', 'جاهزية النسخ الاحتياطية')} value={fmtKpi('backup_ready')} tone={kpiTone('backup_ready')} icon={CheckCircle2} />
          <StatCard label={t('Corrective actions on time', 'الإجراءات التصحيحية في الموعد')} value={fmtKpi('capa_ontime')} tone={kpiTone('capa_ontime')} icon={CheckCircle2} onClick={() => goTab('kpis')} />
        </div>
      </Section>

      {/* charts */}
      <div className="crs-dash-charts">
        <div className="crs-chart-card">
          <h3 dir="auto">{t('Incidents by level', 'الحوادث حسب المستوى')}</h3>
          {inc.length === 0 ? <Empty title={t('No data', 'لا بيانات')} /> : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={byLevel}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>{byLevel.map((e, i) => <Cell key={i} fill={e.fill} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="crs-chart-card">
          <h3 dir="auto">{t('Branch comparison', 'مقارنة الفروع')}</h3>
          {inc.length === 0 ? <Empty title={t('No data', 'لا بيانات')} /> : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={byLocation} layout="vertical" margin={{ left: 8 }}>
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11 }} />
                <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]}>{byLocation.map((e, i) => <Cell key={i} fill={e.fill} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="crs-chart-card">
          <h3 dir="auto">{t('By category', 'حسب الفئة')}</h3>
          {byCategory.length === 0 ? <Empty title={t('No data', 'لا بيانات')} /> : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={byCategory} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70}>
                  {byCategory.map((e, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Legend wrapperStyle={{ fontSize: 11 }} /><Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* latest updates + decisions */}
      <div className="crs-dash-feeds">
        <div className="crs-feed">
          <h3 dir="auto"><Activity size={14} />{t('Latest incident updates', 'آخر تحديثات الحوادث')}</h3>
          {latestUpdates.length === 0 ? <p className="crs-muted" dir="auto">{t('No updates yet', 'لا توجد تحديثات')}</p> : (
            <ul className="crs-feed-list">
              {latestUpdates.map((u, i) => (
                <li key={i}>
                  <b dir="ltr">{u.number}</b>
                  <span dir="auto">{u.text}</span>
                  <span className="crs-feed-meta" dir="auto">{[u.by, fmtDateTime(u.at, locale)].filter(Boolean).join(' · ')}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="crs-feed">
          <h3 dir="auto"><CheckCircle2 size={14} />{t('Recent decisions', 'أحدث القرارات')}</h3>
          {recentDecisions.length === 0 ? <p className="crs-muted" dir="auto">{t('No decisions yet', 'لا توجد قرارات')}</p> : (
            <ul className="crs-feed-list">
              {recentDecisions.map(d => (
                <li key={d.id}>
                  <b dir="ltr">{d.incidentNumber}</b>
                  <span dir="auto">{d.text}</span>
                  <span className="crs-feed-meta" dir="auto">{[d.maker && L(findById(JOB_TITLES, d.maker), lang), fmtDateTime(d.createdAt, locale)].filter(Boolean).join(' · ')}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
