import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  AlertTriangle, Bus, Calculator, Download, FileText, Fuel, Gauge, Medal,
  Receipt, RefreshCw, Search, TrendingUp, Wrench,
} from 'lucide-react'
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '../../firebase'
import { cartrackService } from '../../services/cartrackService'
import { FLEET_MAPPING } from '../../services/fleetMapping'
import { canonicalFleetRegistration, deduplicateCanonicalTrips } from '../../services/fleetIdentity'
import { useFleetScope } from './FleetScopeContext'
import { useLanguage } from '../../contexts/LanguageContext'
import CustomSelect from '../CustomSelect'
import { buildOperatingCostRows, latestFuelStatements, operatingCostMonthRange } from './operatingCost'
import { exportOperatingCostExcel, exportOperatingCostPdf } from './operatingCostReport'
import './FleetOperatingCost.css'

const money = (value, locale, digits = 0) => (
  value == null ? '—' : Number(value).toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })
)
const km = (value, locale) => (
  value == null ? '—' : Number(value).toLocaleString(locale, { maximumFractionDigits: 0 })
)
const monthEnd = (year, month) => new Date(Number(year), Number(month), 0).getDate()
const periodApiRange = ({ monthKeys = [] }) => {
  const first = monthKeys[0]
  const last = monthKeys.at(-1)
  if (!first || !last) return null
  const [startYear, startMonth] = first.split('-').map(Number)
  const [endYear, endMonth] = last.split('-').map(Number)
  return {
    start: `${startYear}-${String(startMonth).padStart(2, '0')}-01 00:00:00`,
    end: `${endYear}-${String(endMonth).padStart(2, '0')}-${String(monthEnd(endYear, endMonth)).padStart(2, '0')} 23:59:59`,
  }
}

const periodDefinition = (id, type, monthKeys, extra = {}) => ({
  id, type, monthKeys, startKey: monthKeys[0], endKey: monthKeys.at(-1), ...extra,
})

function buildPeriodDefinitions(type, availablePeriods) {
  if (type === 'month') {
    return availablePeriods.map((period) => periodDefinition(period.key, type, [period.key], {
      year: period.year, month: period.month,
    }))
  }
  const years = [...new Set(availablePeriods.map((period) => period.year))].sort((a, b) => b - a)
  if (type === 'quarter') {
    const groups = new Map()
    availablePeriods.forEach(({ year, month }) => {
      const quarter = Math.ceil(month / 3)
      const id = `${year}-Q${quarter}`
      if (!groups.has(id)) {
        const startMonth = ((quarter - 1) * 3) + 1
        groups.set(id, periodDefinition(id, type, operatingCostMonthRange(
          `${year}-${String(startMonth).padStart(2, '0')}`,
          `${year}-${String(startMonth + 2).padStart(2, '0')}`,
        ), { year, quarter }))
      }
    })
    return [...groups.values()].sort((a, b) => b.startKey.localeCompare(a.startKey))
  }
  if (type === 'half-year') {
    const groups = new Map()
    availablePeriods.forEach(({ year, month }) => {
      const half = month <= 6 ? 1 : 2
      const id = `${year}-H${half}`
      if (!groups.has(id)) {
        const startMonth = half === 1 ? 1 : 7
        groups.set(id, periodDefinition(id, type, operatingCostMonthRange(
          `${year}-${String(startMonth).padStart(2, '0')}`,
          `${year}-${String(startMonth + 5).padStart(2, '0')}`,
        ), { year, half }))
      }
    })
    return [...groups.values()].sort((a, b) => b.startKey.localeCompare(a.startKey))
  }
  if (type === 'year-to-date') {
    return years.map((year) => {
      const latestMonth = Math.max(...availablePeriods.filter((period) => period.year === year).map((period) => period.month))
      return periodDefinition(`${year}-YTD`, type, operatingCostMonthRange(
        `${year}-01`, `${year}-${String(latestMonth).padStart(2, '0')}`,
      ), { year, latestMonth })
    })
  }
  if (type === 'year') {
    return years.map((year) => periodDefinition(`${year}`, type, operatingCostMonthRange(`${year}-01`, `${year}-12`), { year }))
  }
  return []
}

const sourceLabel = (id, t) => ({
  fuel: t('Fuel', 'الوقود'),
  maintenance: t('Maintenance', 'الصيانة'),
  fines: t('Traffic fines', 'المخالفات المرورية'),
}[id] || '—')

export default function FleetOperatingCost() {
  const { t, locale } = useLanguage()
  const { metaMap, metaOf, aliasMap, classOf } = useFleetScope()
  const [loading, setLoading] = useState(true)
  const [distanceLoading, setDistanceLoading] = useState(false)
  const [error, setError] = useState('')
  const [distanceError, setDistanceError] = useState('')
  const [fuelStatements, setFuelStatements] = useState([])
  const [maintenanceRecords, setMaintenanceRecords] = useState([])
  const [fines, setFines] = useState([])
  const [trips, setTrips] = useState([])
  const [reportType, setReportType] = useState('month')
  const [selectedPeriod, setSelectedPeriod] = useState('')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [rankingMode, setRankingMode] = useState('totalCost')
  const [search, setSearch] = useState('')
  const [exporting, setExporting] = useState('')

  const busRegistrations = useMemo(() => {
    const candidates = new Set(Object.keys(FLEET_MAPPING))
    metaMap.forEach((_, registration) => candidates.add(registration))
    const buses = new Set()
    candidates.forEach((registration) => {
      const canonical = canonicalFleetRegistration(registration, aliasMap)
      if (canonical && classOf(canonical) === 'bus') buses.add(canonical)
    })
    return [...buses].sort()
  }, [aliasMap, classOf, metaMap])

  const periods = useMemo(() => latestFuelStatements(fuelStatements), [fuelStatements])
  const statementByKey = useMemo(() => new Map(periods.map((period) => [period.key, period.statement])), [periods])
  const periodDefinitions = useMemo(() => buildPeriodDefinitions(reportType, periods), [periods, reportType])
  const activePeriod = useMemo(() => {
    if (reportType === 'custom') {
      const monthKeys = operatingCostMonthRange(customStart, customEnd)
      if (!monthKeys.length) return null
      return periodDefinition(`custom-${customStart}-${customEnd}`, reportType, monthKeys)
    }
    return periodDefinitions.find((period) => period.id === selectedPeriod) || periodDefinitions[0] || null
  }, [customEnd, customStart, periodDefinitions, reportType, selectedPeriod])
  const activeStatements = useMemo(() => (
    activePeriod?.monthKeys.map((key) => statementByKey.get(key)).filter(Boolean) || []
  ), [activePeriod, statementByKey])

  const loadCostSources = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [fuelSnapshot, maintenanceSnapshot, finesSnapshot] = await Promise.all([
        getDocs(collection(db, 'fuelStatements')),
        getDocs(collection(db, 'maintenance')),
        getDocs(collection(db, 'fleet_fines')),
      ])
      const statementRows = fuelSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
      setFuelStatements(statementRows)
      setMaintenanceRecords(maintenanceSnapshot.docs.map((item) => ({ id: item.id, ...item.data() })))
      setFines(finesSnapshot.docs.map((item) => ({ id: item.id, ...item.data() })))
      const available = latestFuelStatements(statementRows)
      setSelectedPeriod((current) => available.some((item) => item.key === current) ? current : (available[0]?.key || ''))
      setCustomStart((current) => current || available[0]?.key || '')
      setCustomEnd((current) => current || available[0]?.key || '')
    } catch (loadError) {
      console.error('Operating cost sources failed:', loadError)
      setError('load-failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadCostSources() }, [loadCostSources])

  useEffect(() => {
    if (reportType === 'custom' || !periodDefinitions.length) return
    if (!periodDefinitions.some((period) => period.id === selectedPeriod)) setSelectedPeriod(periodDefinitions[0].id)
  }, [periodDefinitions, reportType, selectedPeriod])

  useEffect(() => {
    let cancelled = false
    if (!activePeriod) {
      setTrips([])
      return undefined
    }
    setDistanceLoading(true)
    setDistanceError('')
    const range = periodApiRange(activePeriod)
    if (!range) return undefined
    cartrackService.getTrips(range.start, range.end)
      .then((rawTrips) => {
        if (cancelled) return
        setTrips(deduplicateCanonicalTrips(rawTrips || [], aliasMap))
      })
      .catch((tripError) => {
        if (cancelled) return
        console.error('Operating cost distance fetch failed:', tripError)
        setTrips([])
        setDistanceError('distance-unavailable')
      })
      .finally(() => { if (!cancelled) setDistanceLoading(false) })
    return () => { cancelled = true }
  }, [activePeriod, aliasMap])

  const result = useMemo(() => buildOperatingCostRows({
    busRegistrations,
    statements: activeStatements,
    periodKeys: activePeriod?.monthKeys || [],
    maintenanceRecords,
    fines,
    trips,
    canonicalize: (registration) => canonicalFleetRegistration(registration, aliasMap),
    metadataFor: metaOf,
  }), [activePeriod, activeStatements, aliasMap, busRegistrations, fines, maintenanceRecords, metaOf, trips])

  const rankedRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    const rows = result.rows.filter((row) => (
      !query || row.registration.toLowerCase().includes(query) || row.driverName.toLowerCase().includes(query)
    ))
    const value = (row) => row[rankingMode]
    return [...rows].sort((a, b) => {
      const left = value(a)
      const right = value(b)
      if (left == null && right == null) return a.registration.localeCompare(b.registration)
      if (left == null) return 1
      if (right == null) return -1
      return right - left || a.registration.localeCompare(b.registration)
    }).map((row, index) => ({ ...row, viewRank: value(row) == null ? null : index + 1 }))
  }, [rankingMode, result.rows, search])

  const monthLabel = useCallback((key) => {
    const [year, month] = key.split('-').map(Number)
    const formatter = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' })
    return formatter.format(new Date(year, month - 1, 1))
  }, [locale])

  const periodOptions = useMemo(() => periodDefinitions.map((period) => {
    let label = monthLabel(period.startKey)
    if (period.type === 'quarter') label = t(`Q${period.quarter} ${period.year}`, `الربع ${period.quarter} · ${period.year}`)
    if (period.type === 'half-year') label = t(`${period.half === 1 ? 'First' : 'Second'} half ${period.year}`, `${period.half === 1 ? 'النصف الأول' : 'النصف الثاني'} · ${period.year}`)
    if (period.type === 'year-to-date') label = t(`Year to date ${period.year}`, `منذ بداية ${period.year}`)
    if (period.type === 'year') label = String(period.year)
    return { value: period.id, label }
  }), [monthLabel, periodDefinitions, t])

  const activePeriodLabel = useMemo(() => {
    if (!activePeriod) return ''
    if (reportType === 'custom') return `${monthLabel(activePeriod.startKey)} — ${monthLabel(activePeriod.endKey)}`
    return periodOptions.find((option) => option.value === activePeriod.id)?.label || activePeriod.id
  }, [activePeriod, monthLabel, periodOptions, reportType])

  const reportTypeOptions = [
    { value: 'month', label: t('Month', 'شهر') },
    { value: 'quarter', label: t('Quarter', 'ربع سنة') },
    { value: 'half-year', label: t('Half-year', 'نصف سنة') },
    { value: 'year-to-date', label: t('Year to date', 'منذ بداية السنة') },
    { value: 'year', label: t('Full year', 'سنة كاملة') },
    { value: 'custom', label: t('Custom month range', 'نطاق أشهر مخصص') },
  ]

  const customMonthOptions = useMemo(() => periods.map((period) => ({
    value: period.key, label: monthLabel(period.key),
  })), [monthLabel, periods])

  const changeCustomStart = (value) => {
    setCustomStart(value)
    if (!customEnd || value > customEnd) setCustomEnd(value)
  }
  const changeCustomEnd = (value) => {
    setCustomEnd(value)
    if (!customStart || value < customStart) setCustomStart(value)
  }

  const rankingOptions = [
    { value: 'totalCost', label: t('Highest total cost', 'أعلى تكلفة إجمالية') },
    { value: 'costPerKm', label: t('Highest cost / km', 'أعلى تكلفة / كم') },
    { value: 'fuelCost', label: t('Highest fuel cost', 'أعلى تكلفة وقود') },
    { value: 'maintenanceCost', label: t('Highest maintenance cost', 'أعلى تكلفة صيانة') },
    { value: 'fineCost', label: t('Highest fines cost', 'أعلى تكلفة مخالفات') },
  ]

  const exportPayload = useMemo(() => ({
    result,
    periodLabel: activePeriodLabel,
    locale,
    includedMonthLabels: result.summary.includedPeriodKeys.map(monthLabel),
    missingMonthLabels: result.summary.missingPeriodKeys.map(monthLabel),
    distanceError: Boolean(distanceError),
  }), [activePeriodLabel, distanceError, locale, monthLabel, result])

  const runExport = async (type) => {
    if (!activePeriod || !result.summary.fuelAvailable || exporting) return
    setExporting(type)
    try {
      if (type === 'pdf') await exportOperatingCostPdf(exportPayload)
      else await exportOperatingCostExcel(exportPayload)
    } catch (exportError) {
      console.error(`Operating-cost ${type} export failed:`, exportError)
    } finally {
      setExporting('')
    }
  }

  if (loading) {
    return (
      <div className="opc-loading" aria-label={t('Loading operating costs', 'تحميل تكاليف التشغيل')}>
        <div className="opc-skeleton opc-skeleton-title" />
        <div className="opc-skeleton-grid">{Array.from({ length: 4 }).map((_, index) => <div className="opc-skeleton opc-skeleton-card" key={index} />)}</div>
        <div className="opc-skeleton opc-skeleton-panel" />
      </div>
    )
  }

  if (error) {
    const errorMessage = t(
      'Operating-cost data could not be loaded. Please retry.',
      'تعذر تحميل بيانات تكلفة التشغيل. يرجى إعادة المحاولة.',
    )
    return (
      <div className="opc-state glass-panel">
        <AlertTriangle size={34} />
        <strong>{errorMessage}</strong>
        <button type="button" onClick={loadCostSources}><RefreshCw size={14} /> {t('Retry', 'إعادة المحاولة')}</button>
      </div>
    )
  }

  if (!periods.length) {
    return (
      <div className="opc-state glass-panel">
        <Calculator size={38} />
        <strong>{t('No monthly fuel statement is available.', 'لا يتوفر كشف وقود شهري.')}</strong>
        <span>{t('Upload an official fuel statement first; it provides the per-bus fuel cost needed for a fair ranking.', 'ارفع كشف الوقود الرسمي أولاً؛ فهو يوفر تكلفة الوقود لكل حافلة اللازمة لترتيب عادل.')}</span>
      </div>
    )
  }

  const { summary } = result
  const primaryCategory = summary.primaryCostCategory

  return (
    <div className="opc-view">
      <header className="opc-hero">
        <div>
          <span className="opc-eyebrow"><Calculator size={13} /> {t('Bus fleet · verified operating cost', 'أسطول الحافلات · تكلفة تشغيل موثقة')}</span>
          <h2>{t('Operating Cost Ranking', 'ترتيب تكلفة التشغيل')}</h2>
          <p>{t('Tracked operating cost = fuel + maintenance + traffic fines. Salaries, insurance and depreciation are not included.', 'تكلفة التشغيل المتتبعة = الوقود + الصيانة + المخالفات المرورية. الرواتب والتأمين والإهلاك غير مشمولة.')}</p>
        </div>
        <div className="opc-hero-actions">
          <div className="opc-control">
            <label>{t('Report by', 'نوع الفترة')}</label>
            <CustomSelect value={reportType} onChange={setReportType} options={reportTypeOptions} ariaLabel={t('Select reporting frequency', 'اختر نوع الفترة')} />
          </div>
          {reportType === 'custom' ? <>
            <div className="opc-control">
              <label>{t('From month', 'من شهر')}</label>
              <CustomSelect value={customStart} onChange={changeCustomStart} options={customMonthOptions} ariaLabel={t('Select first month', 'اختر شهر البداية')} />
            </div>
            <div className="opc-control">
              <label>{t('To month', 'إلى شهر')}</label>
              <CustomSelect value={customEnd} onChange={changeCustomEnd} options={customMonthOptions} ariaLabel={t('Select last month', 'اختر شهر النهاية')} />
            </div>
          </> : <div className="opc-control">
            <label>{t('Reporting period', 'فترة التقرير')}</label>
            <CustomSelect value={activePeriod?.id || ''} onChange={setSelectedPeriod} options={periodOptions} ariaLabel={t('Select reporting period', 'اختر فترة التقرير')} />
          </div>}
          <button className="opc-btn opc-btn-ghost" type="button" onClick={loadCostSources}><RefreshCw size={14} /> {t('Refresh', 'تحديث')}</button>
          <button className="opc-btn opc-btn-ghost" type="button" onClick={() => runExport('pdf')} disabled={!summary.fuelAvailable || Boolean(exporting)}><FileText size={14} /> {exporting === 'pdf' ? t('Preparing…', 'جارٍ التجهيز…') : 'PDF'}</button>
          <button className="opc-btn opc-btn-primary" type="button" onClick={() => runExport('excel')} disabled={!summary.fuelAvailable || Boolean(exporting)}><Download size={14} /> {exporting === 'excel' ? t('Preparing…', 'جارٍ التجهيز…') : t('Excel', 'إكسل')}</button>
        </div>
      </header>

      {!summary.fuelAvailable && (
        <div className="opc-warning"><AlertTriangle size={16} /><span>{t('No monthly fuel allocation is available inside this period. Fuel, total cost and ranking are unavailable instead of being shown as false zeros.', 'لا يتوفر توزيع شهري للوقود ضمن هذه الفترة. لذلك لا تتوفر تكلفة الوقود أو الإجمالي أو الترتيب بدلاً من عرض أصفار غير صحيحة.')}</span></div>
      )}
      {summary.fuelAvailable && !summary.fuelComplete && (
        <div className="opc-warning"><AlertTriangle size={16} /><span>{t(
          `Partial period: ${summary.includedPeriodKeys.length} of ${summary.expectedPeriodKeys.length} months are included. Missing months (${summary.missingPeriodKeys.map(monthLabel).join(', ')}) are excluded from fuel, maintenance, fines and distance so the totals remain comparable.`,
          `فترة جزئية: تم تضمين ${summary.includedPeriodKeys.length} من أصل ${summary.expectedPeriodKeys.length} شهر. الأشهر غير المتوفرة (${summary.missingPeriodKeys.map(monthLabel).join('، ')}) مستبعدة من الوقود والصيانة والمخالفات والمسافة للمحافظة على عدالة المقارنة.`,
        )}</span></div>
      )}
      {distanceError && <div className="opc-warning opc-warning-muted"><Gauge size={16} /><span>{t('Distance is unavailable; total-cost ranking remains valid, but AED/km is withheld.', 'المسافة غير متاحة؛ يظل ترتيب التكلفة الإجمالية صالحاً، لكن تكلفة الكيلومتر محجوبة.')}</span></div>}

      <div className="opc-kpis">
        <CostKpi icon={<Calculator size={17} />} label={t('Fleet operating cost', 'تكلفة تشغيل الأسطول')} value={summary.totalCost == null ? '—' : `${money(summary.totalCost, locale)} ${t('AED', 'د.إ')}`} sub={activePeriodLabel} delay={0.05} />
        <CostKpi icon={<Bus size={17} />} label={t('Average per bus', 'المتوسط لكل حافلة')} value={summary.averagePerBus == null ? '—' : `${money(summary.averagePerBus, locale)} ${t('AED', 'د.إ')}`} sub={t(`${summary.comparableBusCount} buses ranked`, `تم ترتيب ${summary.comparableBusCount} حافلة`)} delay={0.1} />
        <CostKpi icon={<TrendingUp size={17} />} label={t('Highest-cost bus', 'الحافلة الأعلى تكلفة')} value={summary.highestCostBus?.registration || '—'} sub={summary.highestCostBus ? `${money(summary.highestCostBus.totalCost, locale)} ${t('AED', 'د.إ')}` : t('Unavailable', 'غير متاح')} tone="risk" delay={0.15} />
        <CostKpi icon={<Receipt size={17} />} label={t('Largest cost source', 'أكبر مصدر للتكلفة')} value={primaryCategory ? sourceLabel(primaryCategory.id, t) : '—'} sub={primaryCategory ? `${money(primaryCategory.value, locale)} ${t('AED', 'د.إ')}` : '—'} tone="accent" delay={0.2} />
      </div>

      <section className="opc-coverage" aria-label={t('Data coverage', 'تغطية البيانات')}>
        <span><Fuel size={14} /><strong>{t('Fuel coverage', 'تغطية الوقود')}</strong>{summary.fuelAvailable ? `${summary.includedPeriodKeys.length}/${summary.expectedPeriodKeys.length} ${t('months verified', 'شهر موثق')}` : t('Allocation unavailable', 'التوزيع غير متاح')}</span>
        <span><Wrench size={14} /><strong>{t('Maintenance', 'الصيانة')}</strong>{t('Completed invoices in covered months', 'الفواتير المنجزة في الأشهر المشمولة')}</span>
        <span><Receipt size={14} /><strong>{t('Fines', 'المخالفات')}</strong>{t('All amounts; payment status ignored', 'جميع المبالغ؛ حالة الدفع مستبعدة')}</span>
        <span><Gauge size={14} /><strong>{t('Distance coverage', 'تغطية المسافة')}</strong>{distanceLoading ? t('Loading…', 'جارٍ التحميل…') : `${summary.distanceCoveredBusCount}/${summary.busCount} ${t('buses', 'حافلة')}`}</span>
      </section>

      {summary.fuelAvailable && (
        <section className="opc-chart-panel glass-panel">
          <div className="opc-section-head">
            <div><h3>{t('Cost composition by bus', 'تكوين التكلفة حسب الحافلة')}</h3><p>{t('Highest total operating cost first', 'أعلى تكلفة تشغيل إجمالية أولاً')}</p></div>
            <div className="opc-chart-total">{money(summary.totalCost, locale)} <small>{t('AED', 'د.إ')}</small></div>
          </div>
          <div className="opc-chart-wrap">
            <ResponsiveContainer width="100%" height={Math.max(410, result.rows.length * 38)}>
              <BarChart data={result.rows} layout="vertical" margin={{ top: 8, right: 22, left: 12, bottom: 8 }}>
                <CartesianGrid stroke="var(--theme-border-light)" horizontal={false} />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: 'var(--theme-text-muted)', fontSize: 11 }} tickFormatter={(value) => Number(value).toLocaleString(locale)} />
                <YAxis dataKey="registration" type="category" width={74} axisLine={false} tickLine={false} tick={{ fill: 'var(--theme-text-main)', fontSize: 11, fontWeight: 800 }} />
                <Tooltip content={<OperatingCostTooltip locale={locale} t={t} />} cursor={{ fill: 'var(--theme-surface-hover)' }} />
                <Legend wrapperStyle={{ fontSize: 12, color: 'var(--theme-text-muted)' }} />
                <Bar dataKey="fuelCost" name={t('Fuel', 'الوقود')} stackId="cost" fill="var(--opc-fuel)" radius={[5, 0, 0, 5]} />
                <Bar dataKey="maintenanceCost" name={t('Maintenance', 'الصيانة')} stackId="cost" fill="var(--opc-maintenance)" />
                <Bar dataKey="fineCost" name={t('Fines', 'المخالفات')} stackId="cost" fill="var(--opc-fines)" radius={[0, 5, 5, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      <section className="opc-ranking-panel glass-panel">
        <div className="opc-ranking-tools">
          <div><h3>{t('Bus cost ranking', 'ترتيب تكلفة الحافلات')}</h3><p>{t('Plate number is the vehicle identity; the current Fleet driver is shown for context.', 'رقم اللوحة هو هوية المركبة؛ ويظهر سائق الأسطول الحالي للسياق.')}</p></div>
          <div className="opc-ranking-actions">
            <div className="opc-search"><Search size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('Search plate or driver', 'البحث باللوحة أو السائق')} /></div>
            <div className="opc-sort"><CustomSelect value={rankingMode} onChange={setRankingMode} options={rankingOptions} ariaLabel={t('Select ranking method', 'اختر طريقة الترتيب')} /></div>
          </div>
        </div>
        <div className="opc-table-wrap">
          <table className="opc-table">
            <thead><tr>
              <th>#</th><th>{t('Plate / current driver', 'اللوحة / السائق الحالي')}</th><th>{t('Distance', 'المسافة')}</th><th>{t('Fuel', 'الوقود')}</th><th>{t('Maintenance', 'الصيانة')}</th><th>{t('Fines', 'المخالفات')}</th><th>{t('Total cost', 'إجمالي التكلفة')}</th><th>{t('AED / km', 'درهم / كم')}</th>
            </tr></thead>
            <tbody>
              {rankedRows.length ? rankedRows.map((row) => (
                <tr key={row.registration}>
                  <td><RankBadge rank={row.viewRank} /></td>
                  <td><strong className="opc-plate">{row.registration}</strong><span className="opc-driver">{row.driverName || t('No current driver', 'لا يوجد سائق حالي')}</span></td>
                  <td>{distanceLoading ? <span className="opc-cell-skeleton" /> : row.distanceKm == null ? '—' : `${km(row.distanceKm, locale)} ${t('km', 'كم')}`}</td>
                  <td><CostCell amount={row.fuelCost} meta={row.fuelLitres == null ? '' : `${money(row.fuelLitres, locale, 1)} ${t('L', 'لتر')}`} locale={locale} t={t} /></td>
                  <td><CostCell amount={row.maintenanceCost} meta={`${row.maintenanceEvents} ${t('jobs', 'عمل')}`} locale={locale} t={t} /></td>
                  <td><CostCell amount={row.fineCost} meta={`${row.fineCount} ${t('fines', 'مخالفة')}`} locale={locale} t={t} /></td>
                  <td className="opc-total-cell">{row.totalCost == null ? '—' : <><strong>{money(row.totalCost, locale)}</strong><span>{t('AED', 'د.إ')}</span></>}</td>
                  <td className="opc-rate">{row.costPerKm == null ? '—' : money(row.costPerKm, locale, 2)}</td>
                </tr>
              )) : <tr><td colSpan="8"><div className="opc-empty"><Search size={26} /><strong>{t('No buses match this search.', 'لا توجد حافلات تطابق البحث.')}</strong></div></td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function CostKpi({ icon, label, value, sub, tone = '', delay = 0 }) {
  return (
    <motion.div className={`opc-kpi ${tone ? `opc-kpi-${tone}` : ''}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay }}>
      <div className="opc-kpi-head"><span>{label}</span>{icon}</div>
      <strong>{value}</strong>
      <small>{sub}</small>
    </motion.div>
  )
}

function RankBadge({ rank }) {
  if (rank == null) return <span className="opc-rank opc-rank-muted">—</span>
  return <span className={`opc-rank${rank <= 3 ? ` opc-rank-${rank}` : ''}`}>{rank <= 3 && <Medal size={13} />}{rank}</span>
}

function CostCell({ amount, meta, locale, t }) {
  if (amount == null) return <span className="opc-unavailable">{t('Unavailable', 'غير متاح')}</span>
  return <span className="opc-cost-cell"><strong>{money(amount, locale)}</strong><small>{t('AED', 'د.إ')} · {meta}</small></span>
}

function OperatingCostTooltip({ active, payload, label, locale, t }) {
  if (!active || !payload?.length) return null
  const total = payload.reduce((sum, item) => sum + (Number(item.value) || 0), 0)
  return (
    <div className="opc-tooltip">
      <strong>{label}</strong>
      {payload.map((item) => <span key={item.dataKey}><i style={{ background: item.color }} />{item.name}<b>{money(item.value, locale)} {t('AED', 'د.إ')}</b></span>)}
      <span className="opc-tooltip-total">{t('Total', 'الإجمالي')}<b>{money(total, locale)} {t('AED', 'د.إ')}</b></span>
    </div>
  )
}
