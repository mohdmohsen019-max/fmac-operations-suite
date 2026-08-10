import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Fuel, TrendingUp, Gauge, DollarSign, Activity, AlertCircle,
  ArrowUpRight, ArrowDownRight, ChevronRight, Filter, Upload, Loader2,
  PieChart as PieIcon, BarChart3, Pencil, Check, X, Download,
  FileSpreadsheet, FileText, ChevronDown, Minus
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, BarChart, Bar, Cell
} from 'recharts';
import { format } from 'date-fns';
import { db } from '../../../firebase';
import * as firestore from 'firebase/firestore';
const { collection, query, where, orderBy, limit, onSnapshot, getDocs, doc, updateDoc } = firestore;
import { cartrackService } from '../../../services/cartrackService';
import FuelStatementModal from './FuelStatementModal';
import { useFleetSettings, convertCurrency } from '../FleetSettingsContext';
import { useFleetScope } from '../FleetScopeContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { usePermissions } from '../../../hooks/usePermissions';
import CustomSelect from '../../CustomSelect';
import {
  compareFleet, compareVehicles, decomposeCostDelta, generateInsights,
  rowsToTotals, previousPeriod,
} from './fuelAnalytics';
import { exportFuelExcel, exportFuelPdf } from './fuelReportExport';
import './FuelAnalytics.css';

const COLORS = ['#c9a84c', '#8a6d1f', '#111114', '#6b541a', '#e5d3a1'];

/* Per-vehicle rows for one statement: ADNOC allocations + a Cartrack km map.
   Pure — the same builder serves the selected month and the comparison month. */
function buildStatementRows(statement, vehicleKM = {}) {
  const totalCost = statement.totalCost || 0;
  const totalLitres = statement.totalLitres || 0;
  const allocations = statement.vehicleAllocations || [];
  const totalKM = Object.values(vehicleKM).reduce((s, v) => s + v, 0);
  const masterPlates = allocations.length > 0 ? allocations.map(a => a.plate) : Object.keys(vehicleKM);

  return masterPlates.map(plate => {
    const allocation = allocations.find(a => a.plate === plate);
    const km = vehicleKM[plate] || 0;
    const litres = allocation ? allocation.litres : (totalKM > 0 ? (km / totalKM) * totalLitres : 0);
    const cost = allocation ? allocation.cost : (totalKM > 0 ? (km / totalKM) * totalCost : 0);
    const efficiency = km > 0 ? litres / km : 0;

    return {
      plate,
      km: Math.round(km),
      litres: Math.round(litres * 10) / 10,
      cost,
      efficiency: Math.round(efficiency * 100) / 100,
      costPerKM: km > 0 ? cost / km : 0,
      status: efficiency === 0 ? 'N/A' : efficiency < 0.22 ? 'Excellent' : efficiency < 0.35 ? 'Optimal' : 'Caution'
    };
  }).sort((a, b) => b.km - a.km || b.cost - a.cost);
}

export default function FuelDashboard({ onSelectVehicle }) {
  const { settings } = useFleetSettings();
  const { t, locale, lang } = useLanguage();
  const { can } = usePermissions();
  const canEdit = can('fleet', 'edit');
  const { inScope, displayName } = useFleetScope();
  const currency = settings.currency;

  const [loading, setLoading] = useState(true);
  const [statements, setStatements] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [activeStatement, setActiveStatement] = useState(null);

  const [vehicleStats, setVehicleStats] = useState([]);
  const [prevStatement, setPrevStatement] = useState(null);
  const [prevRowsRaw, setPrevRowsRaw] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState('km');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [editingPrice, setEditingPrice] = useState(false);
  const [priceDraft, setPriceDraft] = useState('');
  const [savingPrice, setSavingPrice] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef(null);
  const kmCache = useRef(new Map());

  const months = [
    t("January", "يناير"), t("February", "فبراير"), t("March", "مارس"),
    t("April", "أبريل"), t("May", "مايو"), t("June", "يونيو"),
    t("July", "يوليو"), t("August", "أغسطس"), t("September", "سبتمبر"),
    t("October", "أكتوبر"), t("November", "نوفمبر"), t("December", "ديسمبر")
  ];

  /* Trend series — one point per calendar month, in true chronological order.
     The raw list is ordered by upload time and may hold several statements for
     the same month (a re-upload or a correction), which put duplicate and
     out-of-sequence labels on the axis ("…June, July, August, July"). Here each
     period is collapsed to its most recently uploaded statement and the series
     is sorted by year then month, so re-uploading a month replaces its point
     instead of appending another one. */
  const trendData = useMemo(() => {
    const stamp = (s) => {
      const c = s?.createdAt;
      const d = c?.toDate ? c.toDate() : (c ? new Date(c) : null);
      const v = d ? d.getTime() : 0;
      return Number.isNaN(v) ? 0 : v;
    };
    /* A month still in progress must not be plotted. Its total only covers the
       days elapsed so far, so charting it beside completed months reads as a
       collapse in consumption that never happened. The current month joins the
       trend automatically once it ends — no clean-up needed. */
    const today = new Date();
    const firstOpenPeriod = today.getFullYear() * 12 + today.getMonth();

    const latestPerPeriod = new Map();
    statements.forEach((s) => {
      const month = Number(s?.month), year = Number(s?.year);
      /* A month outside 1–12 has no name in the array and would render as a
         blank tick, so such rows are dropped rather than plotted. */
      if (!Number.isFinite(month) || month < 1 || month > 12) return;
      if (!Number.isFinite(year) || year < 2000) return;
      // Skip the in-progress month and anything dated ahead of it.
      if (year * 12 + (month - 1) >= firstOpenPeriod) return;
      const key = `${year}-${String(month).padStart(2, '0')}`;
      const prev = latestPerPeriod.get(key);
      // Normalised copy so sorting and labelling never depend on the stored type.
      if (!prev || stamp(s) >= stamp(prev)) latestPerPeriod.set(key, { ...s, month, year });
    });

    const ordered = [...latestPerPeriod.values()]
      .sort((a, b) => (a.year - b.year) || (a.month - b.month));

    // Only show the year on the axis when the series actually spans more than
    // one — otherwise it is noise on a single-year chart.
    const multiYear = new Set(ordered.map((s) => s.year)).size > 1;
    return ordered.map((s) => ({
      ...s,
      monthName: multiYear ? `${months[s.month - 1]} ${s.year}` : months[s.month - 1],
    }));
  }, [statements, months]);

  useEffect(() => {
    // 1. Real-time listener for ALL statements (for the trend chart and selector availability)
    const qTrend = query(collection(db, 'fuelStatements'), orderBy('createdAt', 'desc'), limit(12));
    const unsubscribeTrend = onSnapshot(qTrend, (snapshot) => {
      const stmtData = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          monthName: months[data.month - 1]
        };
      });
      setStatements(stmtData);

      // Default to latest statement if none selected yet
      if (stmtData.length > 0 && loading) {
        setSelectedMonth(stmtData[0].month);
        setSelectedYear(stmtData[0].year);
      }
    });

    return () => unsubscribeTrend();
  }, [locale]); // Refresh on locale change to update month names in chart

  /* Km per vehicle for one period, derived from Cartrack odometer sweeps.
     Cached per period so the previous-month comparison never re-hits the API. */
  async function deriveKmMap(year, month) {
    const cacheKey = `${year}-${month}`;
    if (kmCache.current.has(cacheKey)) return kmCache.current.get(cacheKey);

    // Use exact format required by Cartrack API: yyyy-MM-dd HH:mm:ss
    const startStr = format(new Date(year, month - 1, 1, 0, 0, 0), 'yyyy-MM-dd HH:mm:ss');
    const endStr = format(new Date(year, month, 0, 23, 59, 59), 'yyyy-MM-dd HH:mm:ss');

    let trips = [];
    try {
      trips = await cartrackService.getTrips(startStr, endStr) || [];
    } catch (e) {
      console.warn('Cartrack API failed:', e);
    }

    const vehicleData = {};
    trips.forEach(t => {
      const reg = t.registration?.replace(/\s+/g, '').toUpperCase();
      if (!reg) return;

      const startOdo = parseFloat(t.start_odometer) || 0;
      const endOdo = parseFloat(t.end_odometer) || 0;

      if (!vehicleData[reg]) {
        vehicleData[reg] = { minStart: startOdo, maxEnd: endOdo };
      } else {
        // Track the lowest start and highest end for the month
        if (startOdo > 0 && (startOdo < vehicleData[reg].minStart || vehicleData[reg].minStart === 0)) {
          vehicleData[reg].minStart = startOdo;
        }
        if (endOdo > vehicleData[reg].maxEnd) {
          vehicleData[reg].maxEnd = endOdo;
        }
      }
    });

    const vehicleKM = {};
    Object.keys(vehicleData).forEach(reg => {
      const data = vehicleData[reg];
      // Distance is (Odometer End - Odometer Start) / 1000 to convert METERS to KM
      vehicleKM[reg] = (data.maxEnd > data.minStart && data.minStart > 0) ? (data.maxEnd - data.minStart) / 1000 : 0;
    });

    // Only cache real fetches — an empty map from a failed call may recover later.
    if (trips.length > 0) kmCache.current.set(cacheKey, vehicleKM);
    return vehicleKM;
  }

  useEffect(() => {
    // 2. Listener for the SPECIFIC selected statement
    setLoading(true);
    setEditingPrice(false);
    const q = query(
      collection(db, 'fuelStatements'),
      where('month', '==', selectedMonth),
      where('year', '==', selectedYear),
      limit(1)
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      if (!snapshot.empty) {
        const latest = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
        setActiveStatement(latest);
        try {
          // eslint-disable-next-line react-hooks/immutability
          const kmMap = await deriveKmMap(latest.year, latest.month);
          setVehicleStats(buildStatementRows(latest, kmMap));
        } catch (err) {
          console.error('Intelligence Processing Error:', err);
          setVehicleStats(buildStatementRows(latest, {}));
        }
      } else {
        // No statement for this month
        setActiveStatement(null);
        setVehicleStats([]);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [selectedMonth, selectedYear]);

  useEffect(() => {
    // 3. Previous month statement + rows — powers every MoM comparison.
    let cancelled = false;
    setPrevStatement(null);
    setPrevRowsRaw(null);

    (async () => {
      const { month: pm, year: py } = previousPeriod(selectedMonth, selectedYear);
      try {
        const snap = await getDocs(query(
          collection(db, 'fuelStatements'),
          where('month', '==', pm),
          where('year', '==', py),
          limit(1)
        ));
        if (cancelled || snap.empty) return;
        const stmt = { id: snap.docs[0].id, ...snap.docs[0].data() };
        setPrevStatement(stmt);
        // eslint-disable-next-line react-hooks/immutability
        const kmMap = await deriveKmMap(py, pm);
        if (!cancelled) setPrevRowsRaw(buildStatementRows(stmt, kmMap));
      } catch (e) {
        console.warn('Previous month fetch failed:', e);
      }
    })();

    return () => { cancelled = true; };
  }, [selectedMonth, selectedYear]);

  // Close the export menu on any outside click.
  useEffect(() => {
    const onDocClick = (e) => {
      if (exportRef.current && !exportRef.current.contains(e.target)) setExportOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  /* ── Scope-aware derived state ─────────────────────────────────────── */
  const scopedRows = useMemo(
    () => vehicleStats.filter(v => inScope(v.plate)),
    [vehicleStats, inScope]
  );
  const scopedPrevRows = useMemo(
    () => (prevRowsRaw || []).filter(v => inScope(v.plate)),
    [prevRowsRaw, inScope]
  );

  const fleetStats = useMemo(() => {
    if (scopedRows.length === 0) {
      // Statement exists but no per-vehicle rows could be derived at all
      // (no allocations + Cartrack down): fall back to the raw statement totals.
      if (activeStatement && vehicleStats.length === 0) {
        return {
          totalCost: activeStatement.totalCost || 0,
          totalLitres: activeStatement.totalLitres || 0,
          totalKM: Math.round(activeStatement.totalKm || 0),
          avgCostPerKM: 0, avgEfficiency: 0, healthScore: 100,
          bestVehicle: 'N/A', worstVehicle: 'N/A'
        };
      }
      return {
        totalCost: 0, totalLitres: 0, totalKM: 0,
        avgCostPerKM: 0, avgEfficiency: 0, healthScore: 0,
        bestVehicle: 'N/A', worstVehicle: 'N/A'
      };
    }
    const totals = rowsToTotals(scopedRows);
    const avgEff = totals.totalKm > 0 ? totals.totalLitres / totals.totalKm : 0;
    return {
      totalCost: totals.totalCost,
      totalLitres: totals.totalLitres,
      totalKM: Math.round(totals.totalKm),
      avgCostPerKM: totals.totalKm > 0 ? totals.totalCost / totals.totalKm : 0,
      avgEfficiency: avgEff,
      healthScore: avgEff === 0 ? 100 : Math.min(100, Math.max(0, 100 - (avgEff * 200))),
      bestVehicle: [...scopedRows].sort((a, b) => (a.efficiency || 999) - (b.efficiency || 999))[0].plate,
      worstVehicle: [...scopedRows].sort((a, b) => b.efficiency - a.efficiency)[0].plate
    };
  }, [scopedRows, vehicleStats.length, activeStatement]);

  const currentTotals = useMemo(() => (
    activeStatement ? {
      totalCost: fleetStats.totalCost,
      totalLitres: fleetStats.totalLitres,
      totalKm: fleetStats.totalKM,
      pricePerLitre: activeStatement.pricePerLitre,
    } : null
  ), [activeStatement, fleetStats]);

  const prevTotals = useMemo(() => {
    if (!prevStatement) return null;
    if (scopedPrevRows.length > 0) return rowsToTotals(scopedPrevRows, prevStatement.pricePerLitre);
    if ((prevRowsRaw || []).length === 0) {
      return {
        totalCost: prevStatement.totalCost || 0,
        totalLitres: prevStatement.totalLitres || 0,
        totalKm: prevStatement.totalKm || 0,
        pricePerLitre: prevStatement.pricePerLitre,
      };
    }
    return null; // rows exist but the current scope excludes them all
  }, [prevStatement, scopedPrevRows, prevRowsRaw]);

  const fleetComparison = useMemo(
    () => (currentTotals ? compareFleet(currentTotals, prevTotals) : null),
    [currentTotals, prevTotals]
  );
  const vehicleComparison = useMemo(
    () => compareVehicles(scopedRows, scopedPrevRows),
    [scopedRows, scopedPrevRows]
  );
  const costDecomposition = useMemo(
    () => (currentTotals && prevTotals ? decomposeCostDelta(currentTotals, prevTotals) : null),
    [currentTotals, prevTotals]
  );
  const insights = useMemo(
    () => (fleetComparison
      ? generateInsights({
          fleet: fleetComparison,
          vehicles: vehicleComparison,
          decomposition: costDecomposition,
          currency: 'AED',
          names: (p) => displayName(p, lang),
        })
      : []),
    [fleetComparison, vehicleComparison, costDecomposition, displayName, lang]
  );

  // Efficiency table rows: legacy fields + MoM comparison, index-aligned merge.
  const tableRows = useMemo(
    () => scopedRows.map((v, i) => ({ ...v, ...vehicleComparison[i] })),
    [scopedRows, vehicleComparison]
  );

  const filteredVehicles = tableRows
    .filter(v => v.plate.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => {
      if (sortKey === 'deltaPct') {
        return ((b.deltaL100?.pct ?? -Infinity)) - ((a.deltaL100?.pct ?? -Infinity));
      }
      const av = a[sortKey], bv = b[sortKey];
      if (typeof av === 'number' || typeof bv === 'number') return (bv ?? 0) - (av ?? 0);
      return String(av ?? '').localeCompare(String(bv ?? ''));
    });

  /* ── Actions ───────────────────────────────────────────────────────── */
  const savePrice = async () => {
    if (!activeStatement || savingPrice) return;
    const v = parseFloat(priceDraft);
    setSavingPrice(true);
    try {
      await updateDoc(doc(db, 'fuelStatements', activeStatement.id), {
        pricePerLitre: Number.isFinite(v) && v > 0 ? Math.round(v * 1000) / 1000 : null,
      });
      setEditingPrice(false);
    } catch (e) {
      console.error('Price update failed:', e);
    }
    setSavingPrice(false);
  };

  const buildExportPayload = () => ({
    month: selectedMonth,
    year: selectedYear,
    fleet: fleetComparison,
    vehicles: [...vehicleComparison].sort((a, b) => b.km - a.km),
    decomposition: costDecomposition,
    insights,
    trend: trendData,
  });

  const handleExport = (kind) => {
    setExportOpen(false);
    if (!fleetComparison) return;
    try {
      if (kind === 'excel') exportFuelExcel(buildExportPayload());
      else exportFuelPdf(buildExportPayload());
    } catch (e) {
      console.error('Export failed:', e);
    }
  };

  const prevPeriodInfo = previousPeriod(selectedMonth, selectedYear);
  const prevMonthLabel = `${months[prevPeriodInfo.month - 1]}${prevPeriodInfo.year !== selectedYear ? ` ${prevPeriodInfo.year}` : ''}`;
  const price = fleetComparison?.current?.pricePerLitre;
  const priceSource = fleetComparison?.current?.priceSource;
  const priceDeltaPct = fleetComparison?.deltas?.pricePerLitre?.pct;

  if (loading && statements.length === 0) {
    return (
      <div className="fuel-module-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div className="app-loader"><span /><span /><span /><span /><span /></div>
      </div>
    );
  }

  return (
    <div className="fuel-view">
      <header className="fuel-panel-header" style={{ marginBottom: '32px' }}>
        <div>
          <div className="fuel-kpi-label">{t('Operational Intelligence', 'الذكاء التشغيلي')}</div>
          <h1 style={{ fontSize: '2.5rem', fontWeight: 850, margin: 0, color: 'var(--theme-text-main)', letterSpacing: '-0.02em' }}>
            {lang === 'ar'
              ? <><span style={{ color: 'var(--fuel-amber)' }}>ذكاء</span> الوقود</>
              : <>Fuel <span style={{ color: 'var(--fuel-amber)' }}>Intelligence</span></>
            }
          </h1>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {/* MONTH SELECTOR */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <CustomSelect
              value={selectedMonth}
              onChange={val => setSelectedMonth(parseInt(val))}
              options={months.map((m, i) => ({ value: i + 1, label: m }))}
              className="fuel-header-dropdown"
              style={{ width: '140px' }}
            />
            <CustomSelect
              value={selectedYear}
              onChange={val => setSelectedYear(parseInt(val))}
              options={[2024, 2025, 2026].map(y => ({ value: y, label: y.toString() }))}
              className="fuel-header-dropdown"
              style={{ width: '100px' }}
            />
          </div>

          {/* EXPORT */}
          <div className="fan-export" ref={exportRef}>
            <button
              className="fuel-btn-action fan-export-btn"
              onClick={() => setExportOpen(o => !o)}
              disabled={!activeStatement}
              style={{ opacity: activeStatement ? 1 : 0.5 }}
            >
              <Download size={18} /> {t('Export', 'تصدير')} <ChevronDown size={15} style={{ transform: exportOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
            </button>
            {exportOpen && (
              <div className="fan-export-menu">
                <button onClick={() => handleExport('excel')}>
                  <FileSpreadsheet size={16} />
                  <span>
                    {t('Excel Workbook', 'ملف إكسل')}
                    <small>{t('Summary · vehicles · trend', 'ملخص · مركبات · اتجاه')}</small>
                  </span>
                </button>
                <button onClick={() => handleExport('pdf')}>
                  <FileText size={16} />
                  <span>
                    {t('PDF Report (Arabic)', 'تقرير PDF (عربي)')}
                    <small>{t('Print-ready A4 briefing', 'موجز A4 جاهز للطباعة')}</small>
                  </span>
                </button>
              </div>
            )}
          </div>

          <button className="fuel-btn-action" onClick={() => setIsModalOpen(true)}>
            <Upload size={18} style={{ marginRight: '8px', marginLeft: '8px' }} /> {t('ADNOC Statement', 'كشف حساب أدنوك')}
          </button>
        </div>
      </header>

      <div className="fuel-kpi-grid">
        <KPICard
          label={t('Total Fuel cost', 'إجمالي تكلفة الوقود')}
          value={convertCurrency(fleetStats.totalCost, currency).toLocaleString(locale)}
          unit={currency}
        />
        <KPICard
          label={t('Total volume', 'إجمالي الحجم')}
          value={fleetStats.totalLitres.toLocaleString(locale)}
          unit="LTR"
        />
        <KPICard
          label={t('Total Distance', 'إجمالي المسافة')}
          value={fleetStats.totalKM.toLocaleString(locale)}
          unit="KM"
        />
        <KPICard
          label={t('Avg Cost / KM', 'متوسط التكلفة / كم')}
          value={convertCurrency(fleetStats.avgCostPerKM, currency).toLocaleString(locale, { maximumFractionDigits: 2 })}
          unit={currency}
        />

        {/* PRICE PER LITRE — the month's one manual market input */}
        <motion.div className="fuel-card fan-price-card" whileHover={{ y: -5 }}>
          <div className="fuel-kpi-label fan-price-head">
            <span>{t('Price / Litre', 'سعر اللتر')}</span>
            {canEdit && activeStatement && !editingPrice && (
              <button
                className="fan-icon-btn"
                title={t('Edit price per litre', 'تعديل سعر اللتر')}
                onClick={() => { setPriceDraft(activeStatement.pricePerLitre ?? ''); setEditingPrice(true); }}
              >
                <Pencil size={12} />
              </button>
            )}
          </div>
          {editingPrice ? (
            <div className="fan-price-edit">
              <input
                type="number"
                min="0"
                step="0.001"
                className="fuel-input fan-price-input"
                value={priceDraft}
                onChange={e => setPriceDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') savePrice(); if (e.key === 'Escape') setEditingPrice(false); }}
                autoFocus
              />
              <button className="fan-icon-btn fan-icon-confirm" onClick={savePrice} disabled={savingPrice}>
                {savingPrice ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              </button>
              <button className="fan-icon-btn" onClick={() => setEditingPrice(false)}>
                <X size={14} />
              </button>
            </div>
          ) : (
            <div className="fuel-kpi-value">
              {price != null
                ? convertCurrency(price, currency).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 3 })
                : '—'}{' '}
              <span style={{ fontSize: '0.8rem', color: 'var(--fuel-text-muted)' }}>{currency}/L</span>
            </div>
          )}
          {!editingPrice && priceDeltaPct != null && (
            <div className={`fuel-kpi-trend ${priceDeltaPct > 0 ? 'fuel-trend-up' : 'fuel-trend-down'}`}>
              {priceDeltaPct > 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
              {`${priceDeltaPct > 0 ? '+' : ''}${priceDeltaPct.toLocaleString(locale, { maximumFractionDigits: 1 })}%`} {t('vs last month', 'مقابل الشهر الماضي')}
            </div>
          )}
          {!editingPrice && priceSource === 'implied' && (
            <div className="fan-price-src">{t('Implied from cost ÷ litres', 'مستنتج من التكلفة ÷ اللترات')}</div>
          )}
        </motion.div>

        <KPICard
          label={t('Fleet Health', 'صحة الأسطول')}
          value={Math.round(fleetStats.healthScore)}
          unit="INDEX"
          color={fleetStats.healthScore > 80 ? 'var(--status-safe)' : 'var(--status-warn)'}
        />
      </div>

      {/* ── MONTHLY COMPARISON ─────────────────────────────────────────── */}
      {fleetComparison?.previous && (
        <div className="fuel-panel fan-comparison">
          <div className="fuel-panel-header" style={{ marginBottom: '4px' }}>
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <BarChart3 size={20} color="var(--fuel-amber)" /> {t('Monthly Comparison', 'المقارنة الشهرية')}
            </h3>
            <span className="fan-compare-sub">
              {months[selectedMonth - 1]} {t('vs', 'مقابل')} {prevMonthLabel}
            </span>
          </div>
          <div className="fan-compare-grid">
            <DeltaTile
              label={t('Total Cost', 'إجمالي التكلفة')}
              value={convertCurrency(fleetComparison.current.totalCost, currency).toLocaleString(locale, { maximumFractionDigits: 0 })}
              unit={currency}
              pct={fleetComparison.deltas.totalCost.pct}
              lowerIsBetter
            />
            <DeltaTile
              label={t('Volume', 'الحجم')}
              value={fleetComparison.current.totalLitres.toLocaleString(locale, { maximumFractionDigits: 0 })}
              unit="LTR"
              pct={fleetComparison.deltas.totalLitres.pct}
              lowerIsBetter
            />
            <DeltaTile
              label={t('Distance', 'المسافة')}
              value={fleetComparison.current.totalKm.toLocaleString(locale, { maximumFractionDigits: 0 })}
              unit="KM"
              pct={fleetComparison.deltas.totalKm.pct}
              lowerIsBetter={null}
            />
            <DeltaTile
              label={t('Cost / KM', 'التكلفة / كم')}
              value={fleetComparison.current.costPerKm != null
                ? convertCurrency(fleetComparison.current.costPerKm, currency).toLocaleString(locale, { maximumFractionDigits: 2 })
                : '—'}
              unit={currency}
              pct={fleetComparison.deltas.costPerKm.pct}
              lowerIsBetter
            />
            <DeltaTile
              label={t('Consumption', 'الاستهلاك')}
              value={fleetComparison.current.litresPer100km != null
                ? fleetComparison.current.litresPer100km.toLocaleString(locale, { maximumFractionDigits: 1 })
                : '—'}
              unit={t('L/100KM', 'لتر/100كم')}
              pct={fleetComparison.deltas.litresPer100km.pct}
              lowerIsBetter
            />
            <DeltaTile
              label={t('Price / Litre', 'سعر اللتر')}
              value={fleetComparison.current.pricePerLitre != null
                ? convertCurrency(fleetComparison.current.pricePerLitre, currency).toLocaleString(locale, { maximumFractionDigits: 3 })
                : '—'}
              unit={`${currency}/L`}
              pct={fleetComparison.deltas.pricePerLitre.pct}
              lowerIsBetter
            />
          </div>

          {costDecomposition?.priceEffect != null && Math.abs(costDecomposition.totalDelta) > 0.5 && (
            <div className="fan-decomp">
              <div className="fan-decomp-title">
                {t('What moved the fuel bill', 'ما الذي حرّك فاتورة الوقود')}
                <span className="fan-decomp-total">
                  {costDecomposition.totalDelta > 0 ? '+' : '−'}
                  {convertCurrency(Math.abs(costDecomposition.totalDelta), currency).toLocaleString(locale, { maximumFractionDigits: 0 })} {currency}
                </span>
              </div>
              <DecompRow
                label={t('Pump price change', 'تغيّر سعر اللتر')}
                value={costDecomposition.priceEffect}
                peer={costDecomposition.volumeEffect}
                currency={currency}
                locale={locale}
              />
              <DecompRow
                label={t('Consumption change', 'تغيّر الاستهلاك')}
                value={costDecomposition.volumeEffect}
                peer={costDecomposition.priceEffect}
                currency={currency}
                locale={locale}
              />
            </div>
          )}
        </div>
      )}

      <div className="fuel-charts-grid">
        <div className="fuel-panel">
          <div className="fuel-panel-header">
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Activity size={20} color="var(--fuel-amber)" /> {t('Consumption Trend', 'اتجاه الاستهلاك')}
            </h3>
          </div>
          <div style={{ height: '300px', marginTop: '20px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="colorFuel" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--fuel-amber)" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="var(--fuel-amber)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="monthName" axisLine={false} tickLine={false} tick={{fill: 'var(--theme-text-muted)', fontSize: 12}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: 'var(--theme-text-muted)', fontSize: 12}} />
                <Tooltip
                  contentStyle={{ background: 'var(--fuel-surface)', border: '1px solid var(--fuel-amber)', borderRadius: '8px', textAlign: locale === 'ar-SA' ? 'right' : 'left' }}
                  itemStyle={{ color: 'var(--fuel-amber)' }}
                />
                <Area type="monotone" dataKey="totalCost" stroke="var(--fuel-amber)" strokeWidth={3} fillOpacity={1} fill="url(#colorFuel)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="fuel-panel">
          <h3 style={{ margin: '0 0 20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={20} color="var(--fuel-orange)" /> {t('Intelligence Feed', 'تغذية الذكاء')}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {insights.length > 0 ? (
              insights.slice(0, 5).map(ins => (
                <InsightItem key={ins.id} tone={ins.tone} text={t(ins.en, ins.ar)} />
              ))
            ) : (
              <div className="fan-empty">
                {t(
                  'Not enough history yet — upload two consecutive monthly statements to unlock month-over-month insights.',
                  'لا يوجد سجل كافٍ بعد — حمّل كشفين شهريين متتاليين لتفعيل رؤى المقارنة الشهرية.'
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="fuel-panel">
        <div className="fuel-panel-header">
          <div>
            <h3 style={{ margin: 0 }}>{t('Vehicle Efficiency Ranking', 'تصنيف كفاءة المركبات')}</h3>
            <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--fuel-text-muted)' }}>{t('Sort by efficiency, utilization or month-over-month change', 'فرز حسب الكفاءة أو الاستخدام أو التغير الشهري')}</p>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <div style={{ position: 'relative' }}>
              <Filter size={16} style={{ position: 'absolute', left: locale === 'ar-SA' ? 'auto' : '12px', right: locale === 'ar-SA' ? '12px' : 'auto', top: '50%', transform: 'translateY(-50%)', color: 'var(--fuel-text-muted)' }} />
              <input
                type="text"
                placeholder={t('Search bus...', 'بحث عن حافلة...')}
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{
                  background: 'var(--theme-surface)',
                  border: '1px solid var(--theme-border-light)',
                  color: 'var(--theme-text-main)',
                  padding: locale === 'ar-SA' ? '8px 36px 8px 12px' : '8px 12px 8px 36px',
                  borderRadius: '12px',
                  fontSize: '0.85rem',
                  outline: 'none'
                }}
              />
            </div>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="fuel-table">
            <thead>
              <tr>
                <th onClick={() => setSortKey('plate')} style={{ cursor: 'pointer' }}>{t('Bus', 'الحافلة')}</th>
                <th onClick={() => setSortKey('km')} style={{ cursor: 'pointer' }}>{t(`KM (${months[selectedMonth-1].toUpperCase()})`, `كم (${months[selectedMonth-1]})`)}</th>
                <th onClick={() => setSortKey('litres')} style={{ cursor: 'pointer' }}>{t(`LITRES (${months[selectedMonth-1].toUpperCase()})`, `لتر (${months[selectedMonth-1]})`)}</th>
                <th onClick={() => setSortKey('litresPer100km')} style={{ cursor: 'pointer' }}>{t('L/100KM', 'لتر/100كم')}</th>
                <th onClick={() => setSortKey('cost')} style={{ cursor: 'pointer' }}>{t(`COST (${currency})`, `التكلفة (${currency})`)}</th>
                <th onClick={() => setSortKey('costPerKM')} style={{ cursor: 'pointer' }}>{t('COST/KM', 'التكلفة/كم')}</th>
                <th onClick={() => setSortKey('deltaPct')} style={{ cursor: 'pointer' }}>{t('MOM Δ%', 'التغير %')}</th>
                <th>{t('VERDICT', 'الحكم')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredVehicles.map((v) => (
                <tr key={v.plate} onClick={() => onSelectVehicle(v)} style={{ cursor: 'pointer' }}>
                  <td style={{ fontWeight: 800 }}>{v.plate}</td>
                  <td>{v.km.toLocaleString(locale)}</td>
                  <td>{v.litres.toLocaleString(locale)} L</td>
                  <td className="mono">
                    {v.litresPer100km != null
                      ? v.litresPer100km.toLocaleString(locale, { maximumFractionDigits: 1 })
                      : '—'}
                  </td>
                  <td style={{ color: 'var(--fuel-amber)', fontWeight: 700 }}>
                    {convertCurrency(v.cost, currency).toLocaleString(locale)}
                  </td>
                  <td className="mono">
                    {v.costPerKm != null
                      ? convertCurrency(v.costPerKm, currency).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                      : '—'}
                  </td>
                  <td className={`mono ${v.deltaL100?.pct != null ? (v.deltaL100.pct > 2 ? 'fan-delta-bad' : v.deltaL100.pct < -2 ? 'fan-delta-good' : 'fan-delta-neutral') : 'fan-delta-neutral'}`}>
                    {v.deltaL100?.pct != null
                      ? `${v.deltaL100.pct > 0 ? '+' : ''}${v.deltaL100.pct.toLocaleString(locale, { maximumFractionDigits: 1 })}%`
                      : '—'}
                  </td>
                  <td><VerdictBadge verdict={v.verdict} /></td>
                  <td style={{ textAlign: 'right' }}>
                    <ChevronRight size={18} color="#555" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <FuelStatementModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={() => {}} // Not needed with onSnapshot
      />
    </div>
  );
}

function KPICard({ label, value, unit, trend, trendUp, color }) {
  const { t } = useLanguage();
  return (
    <motion.div
      className="fuel-card"
      whileHover={{ y: -5 }}
    >
      <div className="fuel-kpi-label">{label}</div>
      <div className="fuel-kpi-value" style={color ? { color } : {}}>
        {value} <span style={{ fontSize: '0.8rem', color: 'var(--fuel-text-muted)' }}>{unit}</span>
      </div>
      {trend && (
        <div className={`fuel-kpi-trend ${trendUp ? 'fuel-trend-up' : 'fuel-trend-down'}`}>
          {trendUp ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
          {trend} {t('vs last month', 'مقابل الشهر الماضي')}
        </div>
      )}
    </motion.div>
  );
}

/* One KPI tile in the Monthly Comparison band.
   lowerIsBetter: true → a drop is green; null → direction is informational. */
function DeltaTile({ label, value, unit, pct, lowerIsBetter = true }) {
  const { t, locale } = useLanguage();
  const moved = pct != null && Math.abs(pct) >= 0.05;
  let cls = 'fan-delta-neutral';
  if (moved && lowerIsBetter != null) {
    cls = (lowerIsBetter ? pct < 0 : pct > 0) ? 'fan-delta-good' : 'fan-delta-bad';
  }
  const Icon = !moved ? Minus : pct > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <div className="fan-tile">
      <div className="fan-tile-label">{label}</div>
      <div className="fan-tile-value">
        {value} <span>{unit}</span>
      </div>
      <div className={`fan-tile-delta ${cls}`}>
        <Icon size={13} />
        {pct == null
          ? '—'
          : `${pct > 0 ? '+' : ''}${pct.toLocaleString(locale, { maximumFractionDigits: 1 })}%`}
        <span className="fan-tile-vs">{t('vs prev', 'مقابل السابق')}</span>
      </div>
    </div>
  );
}

/* One bar of the price-vs-volume cost decomposition. */
function DecompRow({ label, value, peer, currency, locale }) {
  const max = Math.max(Math.abs(value || 0), Math.abs(peer || 0), 1);
  const widthPct = Math.max(4, (Math.abs(value) / max) * 100);
  const adverse = value > 0; // added cost
  return (
    <div className="fan-decomp-row">
      <span className="fan-decomp-label">{label}</span>
      <div className="fan-decomp-track">
        <div
          className={`fan-decomp-bar ${adverse ? 'fan-decomp-bar-bad' : 'fan-decomp-bar-good'}`}
          style={{ width: `${widthPct}%` }}
        />
      </div>
      <span className={`fan-decomp-value ${adverse ? 'fan-delta-bad' : 'fan-delta-good'}`}>
        {value > 0 ? '+' : '−'}
        {convertCurrency(Math.abs(value), currency).toLocaleString(locale, { maximumFractionDigits: 0 })} {currency}
      </span>
    </div>
  );
}

function VerdictBadge({ verdict }) {
  const { t } = useLanguage();
  if (!verdict) return <span className="fan-verdict fan-verdict-none">—</span>;
  const meta = {
    improving: { label: t('Improved', 'تحسّن'), cls: 'fan-verdict-good', Icon: ArrowDownRight },
    worsening: { label: t('Declined', 'تراجع'), cls: 'fan-verdict-bad', Icon: ArrowUpRight },
    stable: { label: t('Stable', 'مستقر'), cls: 'fan-verdict-stable', Icon: Minus },
  }[verdict];
  const Icon = meta.Icon;
  return (
    <span className={`fan-verdict ${meta.cls}`}>
      <Icon size={11} /> {meta.label}
    </span>
  );
}

/* One generated insight in the Intelligence Feed. */
function InsightItem({ tone, text }) {
  const icon = tone === 'good' ? <Gauge size={16} /> : tone === 'bad' ? <TrendingUp size={16} /> : <DollarSign size={16} />;
  const color = tone === 'good' ? 'var(--status-safe)' : tone === 'bad' ? 'var(--status-risk)' : 'var(--theme-accent)';
  const { locale } = useLanguage();

  return (
    <div style={{
      display: 'flex',
      gap: '12px',
      padding: '12px',
      background: 'var(--theme-surface)',
      borderRadius: '10px',
      borderLeft: locale === 'ar-SA' ? 'none' : `3px solid ${color}`,
      borderRight: locale === 'ar-SA' ? `3px solid ${color}` : 'none'
    }}>
      <div style={{ color, flexShrink: 0, marginTop: '1px' }}>{icon}</div>
      <div style={{ fontSize: '0.78rem', color: 'var(--theme-text-main)', lineHeight: 1.55 }}>{text}</div>
    </div>
  );
}
