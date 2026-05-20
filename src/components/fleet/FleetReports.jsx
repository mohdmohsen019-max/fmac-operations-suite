import React, { useState, useRef, useEffect } from 'react';
import {
  FileText, Download, TrendingUp, DollarSign,
  Calendar, Loader2, AlertTriangle, RefreshCw,
  ChevronDown, BarChart2, Truck, Shield, Award,
  Gauge, Clock, Users
} from 'lucide-react';
import {
  format, subDays, startOfMonth, getWeek, getYear,
} from 'date-fns';
import { arSA } from 'date-fns/locale';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Cell
} from 'recharts';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { db } from '../../firebase';
import { collection, getDocs } from 'firebase/firestore';
import { cartrackService } from '../../services/cartrackService';
import { FLEET_MAPPING, getVehicleMeta } from '../../services/fleetMapping';
import { pdfService } from '../../services/pdfService';
import { useLanguage } from '../../contexts/LanguageContext';
import './FleetModule.css';

// ── Constants ──────────────────────────────────────────────────────────────
const FLEET_REGS = [
  'A21248', 'A33867', 'A33876', 'C29769', 'C37069',
  'C37072', 'C37074', 'C37075', 'M85750', 'M85751',
  'M85756', 'M85759', 'M99268', 'M99270'
];

const todayStr   = () => format(new Date(), 'yyyy-MM-dd');
const daysAgoStr = (n) => format(subDays(new Date(), n), 'yyyy-MM-dd');
const monthStart = () => format(startOfMonth(new Date()), 'yyyy-MM-dd');
const toApiTs    = (d, end = false) => `${d} ${end ? '23:59:59' : '00:00:00'}`;
// Cartrack returns dates like "2026-05-01 07:27:31+04". The +04 breaks JS Date parsers.
const toUAE = (ts) => {
  if (!ts) return new Date(NaN);
  const clean = ts.substring(0, 19).replace(' ', 'T');
  return new Date(clean);
};

const VEHICLE_OPTIONS = Object.entries(FLEET_MAPPING)
  .map(([reg, meta]) => ({ value: reg, label: `Bus ${meta.busNumber} — ${meta.driverName}` }))
  .sort((a, b) => parseInt(a.label.split(' ')[1]) - parseInt(b.label.split(' ')[1]));

// ── Helpers ────────────────────────────────────────────────────────────────
function getRiskLevel(speeding, braking, maxSpeed, t) {
  if (speeding > 10 || braking > 5 || maxSpeed > 120) return t('High', 'مرتفع');
  if ((speeding >= 5 && speeding <= 10) || (braking >= 3 && braking <= 5)) return t('Medium', 'متوسط');
  return t('Low', 'منخفض');
}

function calcScore(trips, speeding, braking, cornering, accel, idleSeconds) {
  const t = Math.max(1, Number(trips) || 1);
  const penalty =
    Math.sqrt(Number(speeding)  / t) * 7 +
    Math.sqrt(Number(braking)   / t) * 8 +
    Math.sqrt(Number(cornering) / t) * 5 +
    Math.sqrt(Number(accel)     / t) * 5 +
    Math.floor((Number(idleSeconds) || 0) / 300);
  return Math.max(0, Math.round(100 - penalty));
}

function getScoreBadge(score, t) {
  if (score >= 80) return { label: t('Excellent', 'ممتاز'), color: 'var(--status-safe)',    bg: 'var(--status-safe-bg)',    border: 'var(--status-safe-border)'    };
  if (score >= 60) return { label: t('Good', 'جيد'),      color: 'var(--status-warn)',    bg: 'var(--status-warn-bg)',    border: 'var(--status-warn-border)'    };
  if (score >= 40) return { label: t('Fair', 'مقبول'),      color: 'var(--status-caution)', bg: 'var(--status-caution-bg)', border: 'var(--status-caution-border)' };
  return              { label: t('Poor', 'ضعيف'),      color: 'var(--status-risk)',    bg: 'var(--status-risk-bg)',    border: 'var(--status-risk-border)'    };
}

function getRiskBadge(level, t) {
  if (level === t('High', 'مرتفع'))   return { color: 'var(--status-risk)', bg: 'var(--status-risk-bg)', border: 'var(--status-risk-border)' };
  if (level === t('Medium', 'متوسط')) return { color: 'var(--status-warn)', bg: 'var(--status-warn-bg)', border: 'var(--status-warn-border)' };
  return                         { color: 'var(--status-safe)', bg: 'var(--status-safe-bg)', border: 'var(--status-safe-border)' };
}

// ── Shared UI atoms ────────────────────────────────────────────────────────
function SkeletonRows({ cols = 7, rows = 6 }) {
  return Array.from({ length: rows }).map((_, i) => (
    <tr key={i}>
      {Array.from({ length: cols }).map((_, j) => (
        <td key={j} style={{ padding: '16px 20px' }}>
          <div className="rpt-skeleton-cell" style={{ width: j === 0 ? 56 : j === cols - 1 ? 72 : 100 }} />
        </td>
      ))}
    </tr>
  ));
}

function EmptyState({ onRetry }) {
  const { t } = useLanguage();
  return (
    <tr>
      <td colSpan={99} style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--theme-text-ghost)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <BarChart2 size={32} style={{ opacity: 0.3 }} />
          <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{t('No data found for the selected date range.', 'لم يتم العثور على بيانات للفترة الزمنية المحددة.')}</span>
          <span style={{ fontSize: '0.78rem', color: 'var(--theme-text-ghost)' }}>{t('Try widening the date range or selecting a different vehicle.', 'حاول توسيع نطاق التاريخ أو اختيار مركبة مختلفة.')}</span>
          {onRetry && (
            <button className="rpt-retry-btn" onClick={onRetry}>
              <RefreshCw size={13} /> {t('Retry', 'إعادة المحاولة')}
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

function ErrorState({ message, onRetry }) {
  const { t } = useLanguage();
  return (
    <tr>
      <td colSpan={99} style={{ textAlign: 'center', padding: '48px 20px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, color: 'var(--status-risk)' }}>
          <AlertTriangle size={32} style={{ opacity: 0.6 }} />
          <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{message || t('Failed to fetch report. Please try again.', 'فشل جلب التقرير. يرجى المحاولة مرة أخرى.')}</span>
          {onRetry && (
            <button className="rpt-retry-btn" onClick={onRetry}>
              <RefreshCw size={13} /> {t('Retry', 'إعادة المحاولة')}
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

function ExportDropdown({ onExcel, onPDF, disabled }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  return (
    <div className="rpt-export-wrap" ref={ref}>
      <button className="rpt-export-btn" disabled={disabled} onClick={() => !disabled && setOpen(o => !o)}>
        <Download size={14} /> {t('Export', 'تصدير')} <ChevronDown size={12} />
      </button>
      {open && (
        <div className="rpt-export-menu" style={{ right: useLanguage().locale === 'ar-SA' ? 'auto' : 0, left: useLanguage().locale === 'ar-SA' ? 0 : 'auto' }}>
          <button onClick={() => { onExcel(); setOpen(false); }}><FileText size={13} /> {t('Excel (.xlsx)', 'إكسل (.xlsx)')}</button>
          <button onClick={() => { onPDF();   setOpen(false); }}><FileText size={13} /> {t('PDF', 'بي دي إف (PDF)')}</button>
        </div>
      )}
    </div>
  );
}

function KpiCard({ icon, label, value, sub, color }) {
  return (
    <div className="rpt-kpi-card glass-panel">
      <div className="rpt-kpi-header">
        <span className="rpt-kpi-label">{label}</span>
        <span style={{ color: color || 'var(--theme-accent)' }}>{icon}</span>
      </div>
      <div className="rpt-kpi-value" style={{ color: color || 'var(--theme-text-main)' }}>{value}</div>
      {sub && <div className="rpt-kpi-sub">{sub}</div>}
    </div>
  );
}

// ── MAIN COMPONENT ─────────────────────────────────────────────────────────
export default function FleetReports() {
  const { t, locale } = useLanguage();
  const [activeReport, setActiveReport] = useState('odometer');

  const DATE_PRESETS = [
    { label: t('Today', 'اليوم'),       getStart: () => todayStr(),   getEnd: () => todayStr() },
    { label: t('Last 7 Days', 'آخر 7 أيام'), getStart: () => daysAgoStr(7),  getEnd: () => todayStr() },
    { label: t('Last 30 Days', 'آخر 30 يوماً'),getStart: () => daysAgoStr(30), getEnd: () => todayStr() },
    { label: t('This Month', 'هذا الشهر'),  getStart: () => monthStart(),   getEnd: () => todayStr() },
  ];

  // Shared date range (new reports)
  const [startDate, setStartDate] = useState(daysAgoStr(7));
  const [endDate,   setEndDate]   = useState(todayStr());
  const [activePreset, setActivePreset] = useState(t('Last 7 Days', 'آخر 7 أيام'));

  // ── Maintenance Cost state (original) ──────────────────────────────────
  const [maintData,        setMaintData]        = useState([]);
  const [maintLoading,     setMaintLoading]     = useState(false);
  const [maintGenerating,  setMaintGenerating]  = useState(false);
  const [maintTotalSpent,  setMaintTotalSpent]  = useState(0);
  const [maintQueryStatus, setMaintQueryStatus] = useState('');
  const [maintStartDate,   setMaintStartDate]   = useState('2026-04-01');
  const [maintEndDate,     setMaintEndDate]     = useState('2026-04-30');
  const [maintLoaded,      setMaintLoaded]      = useState(false);

  // ── Odometer state ──────────────────────────────────────────────────────
  const [odomData,    setOdomData]    = useState([]);
  const [odomLoading, setOdomLoading] = useState(false);
  const [odomError,   setOdomError]   = useState(null);
  const [odomGroupBy, setOdomGroupBy] = useState('daily');
  const [odomVehicle, setOdomVehicle] = useState('all');
  const [odomFetched, setOdomFetched] = useState(false);

  // ── Risk state ──────────────────────────────────────────────────────────
  const [riskData,    setRiskData]    = useState([]);
  const [riskLoading, setRiskLoading] = useState(false);
  const [riskError,   setRiskError]   = useState(null);
  const [riskVehicle, setRiskVehicle] = useState('all');
  const [riskFilter,  setRiskFilter]  = useState('all');
  const [riskFetched, setRiskFetched] = useState(false);

  // ── Scorecard state ─────────────────────────────────────────────────────
  const [scData,    setScData]    = useState([]);
  const [scLoading, setScLoading] = useState(false);
  const [scError,   setScError]   = useState(null);
  const [scVehicle, setScVehicle] = useState('all');
  const [scFetched, setScFetched] = useState(false);

  // Load maintenance on first visit to that tab
  useEffect(() => {
    if (activeReport === 'maintenance' && !maintLoaded) fetchMaintenance();
  }, [activeReport]);

  // ── Maintenance fetch (original logic) ────────────────────────────────
  const fetchMaintenance = async (sDate = maintStartDate, eDate = maintEndDate) => {
    setMaintLoading(true);
    setMaintQueryStatus(t('Analyzing field data...', 'تحليل بيانات الميدان...'));
    try {
      const snap = await getDocs(collection(db, 'maintenance'));
      let records = snap.docs.map(d => d.data());
      if (sDate && eDate) {
        records = records.filter(r => {
          const d = r.date?.seconds
            ? new Date(r.date.seconds * 1000).toISOString().split('T')[0]
            : r.date;
          return d >= sDate && d <= eDate;
        });
      }
      if (records.length === 0) {
        setMaintData([]);
        setMaintTotalSpent(0);
        setMaintQueryStatus(t('No records found for selected range.', 'لم يتم العثور على سجلات للنطاق المحدد.'));
      } else {
        const agg = {};
        records.forEach(r => {
          const reg = r.plateNumber || r.registration;
          if (reg) agg[reg] = (agg[reg] || 0) + (parseFloat(r.total) || 0);
        });
        const chartData = Object.entries(agg)
          .map(([plate, spend]) => ({ plate, spend }))
          .sort((a, b) => b.spend - a.spend);
        setMaintData(chartData);
        setMaintTotalSpent(chartData.reduce((s, i) => s + i.spend, 0));
        setMaintQueryStatus(t(`Query complete: ${records.length} records analyzed.`, `اكتمل الاستعلام: تم تحليل ${records.length} سجل.`));
      }
    } catch (err) {
      console.error('Report fetch error:', err);
      setMaintQueryStatus(t('Error executing intelligence query.', 'خطأ في تنفيذ استعلام الذكاء.'));
    } finally {
      setMaintLoading(false);
      setMaintLoaded(true);
      setTimeout(() => setMaintQueryStatus(prev => prev.includes(t('analyzed', 'تحليل')) ? '' : prev), 3000);
    }
  };

  const handleExportMaintPDF = async () => {
    setMaintGenerating(true);
    await pdfService.generateMaintenanceReport?.(maintData);
    setMaintGenerating(false);
  };

  // ── Odometer fetch ─────────────────────────────────────────────────────
  const fetchOdometer = async (s = startDate, e = endDate) => {
    setOdomLoading(true);
    setOdomError(null);
    setOdomFetched(true);
    try {
      const trips = await cartrackService.getTrips(toApiTs(s), toApiTs(e, true));
      if (!trips) throw new Error('No data returned');

      const groups = {};
      trips
        .filter(t => FLEET_REGS.includes(t.registration))
        .forEach(t => {
          if (odomVehicle !== 'all' && t.registration !== odomVehicle) return;
          if (!t.start_timestamp) return;

          const meta = getVehicleMeta(t.registration);
          const uae  = toUAE(t.start_timestamp);
          if (isNaN(uae.getTime())) return;

          let period;
          if (odomGroupBy === 'daily') {
            period = format(uae, 'yyyy-MM-dd');
          } else if (odomGroupBy === 'weekly') {
            const wk = getWeek(uae, { weekStartsOn: 0 });
            period = `${getYear(uae)}-W${String(wk).padStart(2, '0')}`;
          } else {
            period = format(uae, 'yyyy-MM');
          }

          const key = `${t.registration}::${period}`;
          if (!groups[key]) {
            groups[key] = {
              period,
              registration: t.registration,
              busNumber: meta.busNumber,
              driverName: meta.driverName,
              distance: 0,
              trips: 0,
              startOdo: t.start_odometer ?? null,
              endOdo:   t.end_odometer   ?? null,
            };
          }
          groups[key].distance += (t.trip_distance || 0) / 1000;
          groups[key].trips    += 1;
          if (t.start_odometer != null && groups[key].startOdo != null) {
            groups[key].startOdo = Math.min(groups[key].startOdo, t.start_odometer);
          }
          if (t.end_odometer != null) {
            groups[key].endOdo = groups[key].endOdo != null
              ? Math.max(groups[key].endOdo, t.end_odometer)
              : t.end_odometer;
          }
        });

      const result = Object.values(groups)
        .map(g => {
           let dist = g.distance;
           if (g.startOdo != null && g.endOdo != null && g.endOdo >= g.startOdo) {
             dist = (g.endOdo - g.startOdo) / 1000;
           }
           return { 
             ...g, 
             distance: Math.round(dist * 10) / 10,
             startOdo: g.startOdo != null ? Math.round(g.startOdo / 1000) : null,
             endOdo:   g.endOdo   != null ? Math.round(g.endOdo / 1000) : null,
           };
        })
        .sort((a, b) => {
          const d = a.period.localeCompare(b.period);
          return d !== 0 ? d : parseInt(a.busNumber) - parseInt(b.busNumber);
        });

      setOdomData(result);
    } catch (err) {
      setOdomError(err.message || t('Failed to fetch report. Please try again.', 'فشل جلب التقرير. يرجى المحاولة مرة أخرى.'));
      console.error('Odometer fetch error:', err);
    } finally {
      setOdomLoading(false);
    }
  };

  // ── Risk fetch ─────────────────────────────────────────────────────────
  const fetchRisk = async (s = startDate, e = endDate) => {
    setRiskLoading(true);
    setRiskError(null);
    setRiskFetched(true);
    try {
      const trips = await cartrackService.getTrips(toApiTs(s), toApiTs(e, true));
      if (!trips) throw new Error('No data returned');

      const agg = {};
      trips
        .filter(t => FLEET_REGS.includes(t.registration))
        .forEach(t => {
          if (riskVehicle !== 'all' && t.registration !== riskVehicle) return;
          const meta = getVehicleMeta(t.registration);
          if (!agg[t.registration]) {
            agg[t.registration] = {
              registration: t.registration,
              busNumber: meta.busNumber,
              driverName: meta.driverName,
              speeding: 0, braking: 0, cornering: 0, accel: 0, maxSpeed: 0, trips: 0,
            };
          }
          const s2 = agg[t.registration];
          s2.speeding  += (t.road_speeding_events        || 0);
          s2.braking   += (t.harsh_braking_events         || 0);
          s2.cornering += (t.harsh_cornering_events       || 0);
          s2.accel     += (t.harsh_acceleration_events    || 0);
          s2.maxSpeed   = Math.max(s2.maxSpeed, t.max_speed || 0);
          s2.trips     += 1;
        });

      const riskOrder = { [t('High', 'مرتفع')]: 0, [t('Medium', 'متوسط')]: 1, [t('Low', 'منخفض')]: 2 };
      const result = Object.values(agg)
        .map(s2 => ({ ...s2, riskLevel: getRiskLevel(s2.speeding, s2.braking, s2.maxSpeed, t) }))
        .filter(s2 => riskFilter === 'all' || s2.riskLevel === riskFilter)
        .sort((a, b) => riskOrder[a.riskLevel] - riskOrder[b.riskLevel]);

      setRiskData(result);
    } catch (err) {
      setRiskError(err.message || t('Failed to fetch report. Please try again.', 'فشل جلب التقرير. يرجى المحاولة مرة أخرى.'));
      console.error('Risk fetch error:', err);
    } finally {
      setRiskLoading(false);
    }
  };

  // ── Scorecard fetch ────────────────────────────────────────────────────
  const fetchScorecard = async (s = startDate, e = endDate) => {
    setScLoading(true);
    setScError(null);
    setScFetched(true);
    try {
      const trips = await cartrackService.getTrips(toApiTs(s), toApiTs(e, true));
      if (!trips) throw new Error('No data returned');

      const agg = {};
      trips
        .filter(t => FLEET_REGS.includes(t.registration))
        .forEach(t => {
          if (scVehicle !== 'all' && t.registration !== scVehicle) return;
          const meta = getVehicleMeta(t.registration);
          if (!agg[t.registration]) {
            agg[t.registration] = {
              registration: t.registration,
              busNumber: meta.busNumber,
              driverName: meta.driverName,
              trips: 0, totalKm: 0, speedSum: 0,
              maxSpeed: 0, speeding: 0, braking: 0, cornering: 0, accel: 0, idleTime: 0,
            };
          }
          const s2 = agg[t.registration];
          s2.trips    += 1;
          s2.totalKm  += (t.trip_distance || 0) / 1000;
          s2.speedSum += (t.average_speed  || 0);
          s2.maxSpeed  = Math.max(s2.maxSpeed, t.max_speed || 0);
          s2.speeding  += (t.road_speeding_events     || 0);
          s2.braking   += (t.harsh_braking_events      || 0);
          s2.cornering += (t.harsh_cornering_events    || 0);
          s2.accel     += (t.harsh_acceleration_events || 0);
          s2.idleTime  += (Number(t.idle_time) || 0);
        });

      const result = Object.values(agg)
        .map(s2 => {
          const avgSpeed = s2.trips > 0 ? Math.round(s2.speedSum / s2.trips) : 0;
          const score    = calcScore(s2.trips, s2.speeding, s2.braking, s2.cornering, s2.accel, s2.idleTime);
          return {
            ...s2,
            totalKm:  Math.round(s2.totalKm * 10) / 10,
            avgSpeed,
            score,
            scoreBadge: getScoreBadge(score, t),
            idleMins:   Math.round(Math.max(0, Number(s2.idleTime) || 0) / 60),
          };
        })
        .sort((a, b) => b.score - a.score)
        .map((s2, i) => ({ ...s2, rank: i + 1 }));

      setScData(result);
    } catch (err) {
      setScError(err.message || t('Failed to fetch report. Please try again.', 'فشل جلب التقرير. يرجى المحاولة مرة أخرى.'));
      console.error('Scorecard fetch error:', err);
    } finally {
      setScLoading(false);
    }
  };

  // ── Preset selector ────────────────────────────────────────────────────
  const applyPreset = (preset) => {
    const s = preset.getStart();
    const e = preset.getEnd();
    setStartDate(s);
    setEndDate(e);
    setActivePreset(preset.label);
    if (activeReport === 'odometer')  fetchOdometer(s, e);
    if (activeReport === 'risk')      fetchRisk(s, e);
    if (activeReport === 'scorecard') fetchScorecard(s, e);
  };

  // ── Date range display ─────────────────────────────────────────────────
  const dateRangeStr = `${startDate} ${t('to', 'إلى')} ${endDate}`;

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER — ODOMETER REPORT
  // ══════════════════════════════════════════════════════════════════════════
  const renderOdometer = () => {
    const totalKm    = odomData.reduce((s, r) => s + r.distance, 0);
    const totalTrips = odomData.reduce((s, r) => s + r.trips, 0);
    const busiestBus = odomData.length
      ? [...odomData].sort((a, b) => b.distance - a.distance)[0]
      : null;

    const isDailyView = odomGroupBy === 'daily';
    const colCount    = isDailyView ? 8 : 6;

    const excelHeaders = isDailyView
      ? [t('Date', 'التاريخ'), t('Bus #', 'رقم الحافلة'), t('Plate', 'اللوحة'), t('Driver', 'السائق'), t('Trips', 'الرحلات'), t('Start Odo (km)', 'عداد البداية (كم)'), t('End Odo (km)', 'عداد النهاية (كم)'), t('Distance (km)', 'المسافة (كم)')]
      : [odomGroupBy === 'weekly' ? t('Week', 'الأسبوع') : t('Month', 'الشهر'), t('Bus #', 'رقم الحافلة'), t('Plate', 'اللوحة'), t('Driver', 'السائق'), t('Trips', 'الرحلات'), t('Total Distance (km)', 'إجمالي المسافة (كم)')];

    const excelRows = odomData.map(r =>
      isDailyView
        ? [r.period, `${t('Bus', 'حافلة')} ${r.busNumber}`, r.registration, r.driverName, r.trips,
           r.startOdo ?? '--', r.endOdo ?? '--', r.distance]
        : [r.period, `${t('Bus', 'حافلة')} ${r.busNumber}`, r.registration, r.driverName, r.trips, r.distance]
    );
    const excelFooter = isDailyView
      ? [t('TOTAL', 'الإجمالي'), '', '', '', totalTrips, '', '', Math.round(totalKm * 10) / 10]
      : [t('TOTAL', 'الإجمالي'), '', '', '', totalTrips, Math.round(totalKm * 10) / 10];

    return (
      <div className="rpt-panel">
        {/* Date presets */}
        <div className="rpt-presets-row">
          {DATE_PRESETS.map(p => (
            <button
              key={p.label}
              className={`rpt-preset-btn ${activePreset === p.label ? 'active' : ''}`}
              onClick={() => applyPreset(p)}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Controls */}
        <div className="rpt-controls glass-panel">
          <div className="rpt-controls-row">
            <div className="rpt-field">
              <label>{t('Start Date', 'تاريخ البدء')}</label>
              <input type="date" className="fleet-search-input rpt-date-input" value={startDate}
                onChange={e => { setStartDate(e.target.value); setActivePreset(''); }} />
            </div>
            <div className="rpt-field">
              <label>{t('End Date', 'تاريخ الانتهاء')}</label>
              <input type="date" className="fleet-search-input rpt-date-input" value={endDate}
                onChange={e => { setEndDate(e.target.value); setActivePreset(''); }} />
            </div>
            <div className="rpt-field">
              <label>{t('Group By', 'تجميع حسب')}</label>
              <div className="rpt-toggle-group">
                {['daily', 'weekly', 'monthly'].map(g => (
                  <button key={g}
                    className={`rpt-toggle-btn ${odomGroupBy === g ? 'active' : ''}`}
                    onClick={() => setOdomGroupBy(g)}>
                    {g === 'daily' ? t('Daily', 'يومي') : g === 'weekly' ? t('Weekly', 'أسبوعي') : t('Monthly', 'شهري')}
                  </button>
                ))}
              </div>
            </div>
            <div className="rpt-field">
              <label>{t('Vehicle', 'المركبة')}</label>
              <select className="fleet-search-input rpt-select" value={odomVehicle}
                onChange={e => setOdomVehicle(e.target.value)}>
                <option value="all">{t('All Buses', 'جميع الحافلات')}</option>
                {VEHICLE_OPTIONS.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
              </select>
            </div>
            <button className="rpt-generate-btn" onClick={() => fetchOdometer()} disabled={odomLoading}>
              {odomLoading ? <Loader2 size={15} className="animate-spin" /> : <BarChart2 size={15} />}
              {odomLoading ? t('Fetching...', 'جاري الجلب...') : t('Generate Report', 'إنشاء التقرير')}
            </button>
          </div>
        </div>

        {/* KPI cards */}
        {odomFetched && !odomLoading && odomData.length > 0 && (
          <div className="rpt-kpi-row">
            <KpiCard icon={<Truck size={16} />}  label={t('Total Fleet Distance', 'إجمالي مسافة الأسطول')} value={`${Math.round(totalKm).toLocaleString(locale)} ${t('km', 'كم')}`} sub={t(`${odomData.length} vehicle–period groups`, `${odomData.length} مجموعات المركبات والفترات`)} />
            <KpiCard icon={<Award size={16} />}  label={t('Busiest Vehicle', 'المركبة الأكثر انشغالاً')}      value={busiestBus ? `${t('Bus', 'حافلة')} ${busiestBus.busNumber}` : '--'} sub={busiestBus ? `${busiestBus.distance.toLocaleString(locale)} ${t('km', 'كم')}` : ''} color="var(--status-warn)" />
            <KpiCard icon={<Gauge size={16} />}  label={t('Avg per Bus', 'المعدل لكل حافلة')}          value={`${Math.round(totalKm / Math.max(1, new Set(odomData.map(r => r.registration)).size)).toLocaleString(locale)} ${t('km', 'كم')}`} sub={t('Average distance per vehicle', 'متوسط المسافة لكل مركبة')} />
            <KpiCard icon={<Calendar size={16} />} label={t('Total Trips', 'إجمالي الرحلات')}         value={totalTrips.toLocaleString(locale)} sub={`${startDate} → ${endDate}`} />
          </div>
        )}

        {/* Table */}
        <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="rpt-table-header">
            <div>
              <h3 className="rpt-table-title">{t('Odometer Report', 'تقرير عداد المسافات')}</h3>
              <p className="rpt-table-sub">{odomFetched ? t(`${odomData.length} rows • ${dateRangeStr}`, `${odomData.length} صفوف • ${dateRangeStr}`) : t('Select a date range and generate the report', 'حدد نطاق التاريخ وأنشئ التقرير')}</p>
            </div>
            <ExportDropdown
              disabled={!odomData.length}
              onExcel={() => doExcelExport(t('Odometer Report', 'تقرير عداد المسافات'), excelHeaders, excelRows, dateRangeStr)}
              onPDF={()   => doPDFExport(t('Odometer Report', 'تقرير عداد المسافات'), excelHeaders, excelRows, dateRangeStr, excelFooter)}
            />
          </div>
          <div className="fleet-table-container" style={{ borderRadius: 0, border: 'none' }}>
            <table className="fleet-table">
              <thead>
                <tr>
                  {isDailyView ? (
                    <><th>{t('Date', 'التاريخ')}</th><th>{t('Bus #', 'رقم الحافلة')}</th><th>{t('Plate', 'اللوحة')}</th><th>{t('Driver', 'السائق')}</th><th>{t('Trips', 'الرحلات')}</th><th>{t('Start Odo', 'بداية العداد')}</th><th>{t('End Odo', 'نهاية العداد')}</th><th>{t('Distance (km)', 'المسافة (كم)')}</th></>
                  ) : (
                    <><th>{odomGroupBy === 'weekly' ? t('Week', 'الأسبوع') : t('Month', 'الشهر')}</th><th>{t('Bus #', 'رقم الحافلة')}</th><th>{t('Plate', 'اللوحة')}</th><th>{t('Driver', 'السائق')}</th><th>{t('Trips', 'الرحلات')}</th><th>{t('Total Distance (km)', 'إجمالي المسافة (كم)')}</th></>
                  )}
                </tr>
              </thead>
              <tbody>
                {odomLoading     ? <SkeletonRows cols={colCount} /> :
                 odomError       ? <ErrorState message={odomError} onRetry={() => fetchOdometer()} /> :
                 !odomFetched    ? <EmptyState /> :
                 odomData.length === 0 ? <EmptyState /> :
                 odomData.map((r, i) => (
                  <tr key={i}>
                    <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.82rem' }}>{r.period}</td>
                    <td style={{ fontWeight: 800 }}>{t('Bus', 'حافلة')} {r.busNumber}</td>
                    <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.82rem' }}>{r.registration}</td>
                    <td>{r.driverName}</td>
                    <td style={{ color: 'var(--theme-text-muted)' }}>{r.trips.toLocaleString(locale)}</td>
                    {isDailyView && <>
                      <td style={{ color: 'var(--theme-text-muted)', fontSize: '0.82rem' }}>{r.startOdo != null ? r.startOdo.toLocaleString(locale) : '--'}</td>
                      <td style={{ color: 'var(--theme-text-muted)', fontSize: '0.82rem' }}>{r.endOdo   != null ? r.endOdo.toLocaleString(locale)   : '--'}</td>
                    </>}
                    <td style={{ fontWeight: 800, color: 'var(--theme-accent)' }}>{r.distance.toLocaleString(locale)}</td>
                  </tr>
                ))}
              </tbody>
              {odomData.length > 0 && (
                <tfoot>
                  <tr className="rpt-total-row">
                    <td colSpan={isDailyView ? 4 : 4} style={{ fontWeight: 800 }}>{t('TOTAL', 'الإجمالي')}</td>
                    <td style={{ fontWeight: 700 }}>{totalTrips.toLocaleString(locale)}</td>
                    {isDailyView && <><td>—</td><td>—</td></>}
                    <td style={{ fontWeight: 900, color: 'var(--theme-accent)' }}>{Math.round(totalKm * 10) / 10} {t('km', 'كم')}</td>
                  </tr>
                  <tr>
                    <td colSpan={99} style={{ padding: '8px 20px 14px', fontSize: '0.75rem', color: 'var(--theme-text-muted)', fontWeight: 600 }}>
                      {t(`${new Set(odomData.map(r => r.registration)).size} buses`, `${new Set(odomData.map(r => r.registration)).size} حافلات`)} &nbsp;•&nbsp; {Math.round(totalKm * 10) / 10} {t('total km', 'إجمالي كم')} &nbsp;•&nbsp; {dateRangeStr}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>
    );
  };

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER — RISK MANAGEMENT REPORT
  // ══════════════════════════════════════════════════════════════════════════
  const renderRisk = () => {
    const filtered    = riskFilter === 'all' ? riskData : riskData.filter(r => r.riskLevel === riskFilter);
    const highCount   = riskData.filter(r => r.riskLevel === t('High', 'مرتفع')).length;
    const medCount    = riskData.filter(r => r.riskLevel === t('Medium', 'متوسط')).length;
    const lowCount    = riskData.filter(r => r.riskLevel === t('Low', 'منخفض')).length;
    const totalSpeeding = riskData.reduce((s, r) => s + r.speeding, 0);
    const totalBraking  = riskData.reduce((s, r) => s + r.braking, 0);
    const fleetRiskScore = riskData.length
      ? Math.round((lowCount * 100 + medCount * 50 + highCount * 10) / riskData.length)
      : 0;

    const excelHeaders = [t('Bus #', 'رقم الحافلة'), t('Plate', 'اللوحة'), t('Driver', 'السائق'), t('Speeding Events', 'تجاوز السرعة'), t('Harsh Braking', 'فرملة قاسية'), t('Harsh Cornering', 'انعطاف حاد'), t('Harsh Accel', 'تسارع قاسي'), t('Max Speed (km/h)', 'أقصى سرعة (كم/س)'), t('Risk Level', 'مستوى المخاطر')];
    const excelRows    = filtered.map(r => [`${t('Bus', 'حافلة')} ${r.busNumber}`, r.registration, r.driverName, r.speeding, r.braking, r.cornering, r.accel, r.maxSpeed, r.riskLevel]);
    const excelFooter  = [`${highCount} ${t('High', 'مرتفع')} / ${medCount} ${t('Medium', 'متوسط')} / ${lowCount} ${t('Low', 'منخفض')}`, '', '', totalSpeeding, totalBraking, '', '', '', ''];

    return (
      <div className="rpt-panel">
        <div className="rpt-presets-row">
          {DATE_PRESETS.map(p => (
            <button key={p.label} className={`rpt-preset-btn ${activePreset === p.label ? 'active' : ''}`}
              onClick={() => applyPreset(p)}>{p.label}</button>
          ))}
        </div>

        <div className="rpt-controls glass-panel">
          <div className="rpt-controls-row">
            <div className="rpt-field">
              <label>{t('Start Date', 'تاريخ البدء')}</label>
              <input type="date" className="fleet-search-input rpt-date-input" value={startDate}
                onChange={e => setStartDate(e.target.value)} />
            </div>
            <div className="rpt-field">
              <label>{t('End Date', 'تاريخ الانتهاء')}</label>
              <input type="date" className="fleet-search-input rpt-date-input" value={endDate}
                onChange={e => setEndDate(e.target.value)} />
            </div>
            <div className="rpt-field">
              <label>{t('Vehicle', 'المركبة')}</label>
              <select className="fleet-search-input rpt-select" value={riskVehicle}
                onChange={e => setRiskVehicle(e.target.value)}>
                <option value="all">{t('All Buses', 'جميع الحافلات')}</option>
                {VEHICLE_OPTIONS.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
              </select>
            </div>
            <div className="rpt-field">
              <label>{t('Risk Level', 'مستوى المخاطر')}</label>
              <select className="fleet-search-input rpt-select" value={riskFilter}
                onChange={e => setRiskFilter(e.target.value)}>
                <option value="all">{t('All Levels', 'جميع المستويات')}</option>
                <option value={t('High', 'مرتفع')}>{t('High Risk', 'مخاطر عالية')}</option>
                <option value={t('Medium', 'متوسط')}>{t('Medium Risk', 'مخاطر متوسطة')}</option>
                <option value={t('Low', 'منخفض')}>{t('Low Risk', 'مخاطر منخفضة')}</option>
              </select>
            </div>
            <button className="rpt-generate-btn" onClick={() => fetchRisk()} disabled={riskLoading}>
              {riskLoading ? <Loader2 size={15} className="animate-spin" /> : <Shield size={15} />}
              {riskLoading ? t('Fetching...', 'جاري الجلب...') : t('Generate Report', 'إنشاء التقرير')}
            </button>
          </div>
        </div>

        {riskFetched && !riskLoading && riskData.length > 0 && (
          <div className="rpt-kpi-row">
            <KpiCard icon={<AlertTriangle size={16} />} label={t('High Risk Vehicles', 'مركبات عالية المخاطر')} value={highCount.toLocaleString(locale)}          color="var(--status-risk)"    sub={t('Exceeds safety thresholds', 'تتجاوز حدود السلامة')} />
            <KpiCard icon={<Gauge size={16} />}         label={t('Total Speeding', 'إجمالي تجاوز السرعة')}     value={totalSpeeding.toLocaleString(locale)}      color="var(--status-caution)" sub={t('Road speeding events', 'أحداث تجاوز السرعة على الطريق')} />
            <KpiCard icon={<Shield size={16} />}        label={t('Total Harsh Braking', 'إجمالي الفرملة القاسية')} value={totalBraking.toLocaleString(locale)}     color="var(--status-warn)"    sub={t('Harsh braking events', 'أحداث الفرملة القاسية')} />
            <KpiCard icon={<Award size={16} />}         label={t('Fleet Risk Score', 'درجة مخاطر الأسطول')}   value={`${fleetRiskScore.toLocaleString(locale)}%`} color={fleetRiskScore >= 70 ? 'var(--status-safe)' : 'var(--status-warn)'} sub={t('Weighted composite score', 'الدرجة المركبة الموزونة')} />
          </div>
        )}

        <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="rpt-table-header">
            <div>
              <h3 className="rpt-table-title">{t('Risk Management Report', 'تقرير إدارة المخاطر')}</h3>
              <p className="rpt-table-sub">{riskFetched ? t(`${filtered.length} vehicles • ${dateRangeStr}`, `${filtered.length} مركبات • ${dateRangeStr}`) : t('Select a date range and generate the report', 'حدد نطاق التاريخ وأنشئ التقرير')}</p>
            </div>
            <ExportDropdown
              disabled={!filtered.length}
              onExcel={() => doExcelExport(t('Risk Management Report', 'تقرير إدارة المخاطر'), excelHeaders, excelRows, dateRangeStr)}
              onPDF={()   => doPDFExport(t('Risk Management Report', 'تقرير إدارة المخاطر'), excelHeaders, excelRows, dateRangeStr, excelFooter)}
            />
          </div>
          <div className="fleet-table-container" style={{ borderRadius: 0, border: 'none' }}>
            <table className="fleet-table">
              <thead>
                <tr>
                  <th>{t('Bus #', 'رقم الحافلة')}</th><th>{t('Plate', 'اللوحة')}</th><th>{t('Driver', 'السائق')}</th>
                  <th>{t('Speeding', 'السرعة')}</th><th>{t('Harsh Braking', 'فرملة قاسية')}</th><th>{t('Harsh Cornering', 'انعطاف حاد')}</th><th>{t('Harsh Accel', 'تسارع قاسي')}</th>
                  <th>{t('Max Speed', 'أقصى سرعة')}</th><th>{t('Risk Level', 'مستوى المخاطر')}</th>
                </tr>
              </thead>
              <tbody>
                {riskLoading     ? <SkeletonRows cols={9} /> :
                 riskError       ? <ErrorState message={riskError} onRetry={() => fetchRisk()} /> :
                 !riskFetched    ? <EmptyState /> :
                 filtered.length === 0 ? <EmptyState /> :
                 filtered.map((r, i) => {
                  const badge = getRiskBadge(r.riskLevel, t);
                  return (
                    <tr key={i}>
                      <td style={{ fontWeight: 800 }}>{t('Bus', 'حافلة')} {r.busNumber}</td>
                      <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.82rem' }}>{r.registration}</td>
                      <td>{r.driverName}</td>
                      <td style={{ color: r.speeding > 10 ? 'var(--status-risk)' : r.speeding > 0 ? 'var(--status-caution)' : 'var(--theme-text-muted)', fontWeight: r.speeding > 0 ? 700 : 400 }}>{r.speeding.toLocaleString(locale)}</td>
                      <td style={{ color: r.braking  > 5  ? 'var(--status-risk)' : r.braking  > 0 ? 'var(--status-warn)' : 'var(--theme-text-muted)', fontWeight: r.braking  > 0 ? 700 : 400 }}>{r.braking.toLocaleString(locale)}</td>
                      <td style={{ color: r.cornering > 0 ? 'var(--status-warn)' : 'var(--theme-text-muted)' }}>{r.cornering.toLocaleString(locale)}</td>
                      <td style={{ color: r.accel     > 0 ? 'var(--status-warn)' : 'var(--theme-text-muted)' }}>{r.accel.toLocaleString(locale)}</td>
                      <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.82rem', color: r.maxSpeed > 120 ? 'var(--status-risk)' : 'var(--theme-text-main)' }}>
                        {r.maxSpeed > 0 ? `${r.maxSpeed.toLocaleString(locale)} ${t('km/h', 'كم/س')}` : '--'}
                      </td>
                      <td>
                        <span className="status-badge" style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}>
                          {r.riskLevel}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {filtered.length > 0 && (
                <tfoot>
                  <tr className="rpt-total-row">
                    <td colSpan={3} style={{ fontWeight: 800 }}>{t('FLEET TOTALS', 'إجمالي الأسطول')}</td>
                    <td style={{ fontWeight: 800, color: 'var(--status-risk)' }}>{totalSpeeding.toLocaleString(locale)}</td>
                    <td style={{ fontWeight: 800, color: 'var(--status-warn)' }}>{totalBraking.toLocaleString(locale)}</td>
                    <td style={{ fontWeight: 700 }}>{riskData.reduce((s, r) => s + r.cornering, 0).toLocaleString(locale)}</td>
                    <td style={{ fontWeight: 700 }}>{riskData.reduce((s, r) => s + r.accel, 0).toLocaleString(locale)}</td>
                    <td>—</td>
                    <td style={{ fontSize: '0.72rem', color: 'var(--theme-text-muted)', fontWeight: 600 }}>
                      {highCount}H / {medCount}M / {lowCount}L
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={99} style={{ padding: '8px 20px 14px', fontSize: '0.75rem', color: 'var(--theme-text-muted)', fontWeight: 600 }}>
                      {t(`${highCount} High`, `${highCount} مرتفع`)} &nbsp;•&nbsp; {t(`${medCount} Medium`, `${medCount} متوسط`)} &nbsp;•&nbsp; {t(`${lowCount} Low`, `${lowCount} منخفض`)} &nbsp;•&nbsp; {t('Fleet risk score:', 'درجة مخاطر الأسطول:')} {fleetRiskScore.toLocaleString(locale)}%
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>
    );
  };

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER — DRIVER SCORECARD REPORT
  // ══════════════════════════════════════════════════════════════════════════
  const renderScorecard = () => {
    const fleetAvgScore = scData.length
      ? Math.round(scData.reduce((s, r) => s + (Number(r.score) || 0), 0) / scData.length)
      : 0;
    const totalTrips = scData.reduce((s, r) => s + r.trips, 0);
    const totalKm    = scData.reduce((s, r) => s + r.totalKm, 0);
    const best  = scData.length ? scData[0] : null;
    const worst = scData.length ? scData[scData.length - 1] : null;

    const excelHeaders = [t('Rank', 'الرتبة'), t('Bus #', 'رقم الحافلة'), t('Driver', 'السائق'), t('Trips', 'الرحلات'), t('Total km', 'إجمالي كم'), t('Avg Speed', 'متوسط السرعة'), t('Max Speed', 'أقصى سرعة'), t('Speeding', 'السرعة'), t('Harsh Braking', 'فرملة قاسية'), t('Harsh Cornering', 'انعطاف حاد'), t('Harsh Accel', 'تسارع قاسي'), t('Idle Time (min)', 'وقت الخمول (دقيقة)'), t('Score', 'الدرجة'), t('Grade', 'التقييم')];
    const excelRows    = scData.map(r => [r.rank, `${t('Bus', 'حافلة')} ${r.busNumber}`, r.driverName, r.trips, r.totalKm, r.avgSpeed, r.maxSpeed, r.speeding, r.braking, r.cornering, r.accel, r.idleMins, r.score, r.scoreBadge.label]);
    const excelFooter  = ['', t('FLEET AVG', 'متوسط الأسطول'), '', totalTrips, Math.round(totalKm * 10) / 10, '', '', '', '', '', '', '', fleetAvgScore, ''];

    return (
      <div className="rpt-panel">
        <div className="rpt-presets-row">
          {DATE_PRESETS.map(p => (
            <button key={p.label} className={`rpt-preset-btn ${activePreset === p.label ? 'active' : ''}`}
              onClick={() => applyPreset(p)}>{p.label}</button>
          ))}
        </div>

        <div className="rpt-controls glass-panel">
          <div className="rpt-controls-row">
            <div className="rpt-field">
              <label>{t('Start Date', 'تاريخ البدء')}</label>
              <input type="date" className="fleet-search-input rpt-date-input" value={startDate}
                onChange={e => setStartDate(e.target.value)} />
            </div>
            <div className="rpt-field">
              <label>{t('End Date', 'تاريخ الانتهاء')}</label>
              <input type="date" className="fleet-search-input rpt-date-input" value={endDate}
                onChange={e => setEndDate(e.target.value)} />
            </div>
            <div className="rpt-field">
              <label>{t('Driver / Vehicle', 'السائق / المركبة')}</label>
              <select className="fleet-search-input rpt-select" value={scVehicle}
                onChange={e => setScVehicle(e.target.value)}>
                <option value="all">{t('All Drivers', 'جميع السائقين')}</option>
                {VEHICLE_OPTIONS.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
              </select>
            </div>
            <button className="rpt-generate-btn" onClick={() => fetchScorecard()} disabled={scLoading}>
              {scLoading ? <Loader2 size={15} className="animate-spin" /> : <Award size={15} />}
              {scLoading ? t('Fetching...', 'جاري الجلب...') : t('Generate Report', 'إنشاء التقرير')}
            </button>
          </div>
        </div>

        {scFetched && !scLoading && scData.length > 0 && (
          <div className="rpt-kpi-row">
            <KpiCard icon={<Award size={16} />}  label={t('Best Driver', 'أفضل سائق')}      value={best ? `${t('Bus', 'حافلة')} ${best.busNumber}` : '--'} sub={best ? `${best.driverName} — ${best.score.toLocaleString(locale)}/100` : ''} color="var(--status-safe)" />
            <KpiCard icon={<AlertTriangle size={16} />} label={t('Needs Attention', 'يحتاج للانتباه')} value={worst ? `${t('Bus', 'حافلة')} ${worst.busNumber}` : '--'} sub={worst ? `${worst.driverName} — ${worst.score.toLocaleString(locale)}/100` : ''} color="var(--status-risk)" />
            <KpiCard icon={<Gauge size={16} />}  label={t('Fleet Avg Score', 'متوسط درجة الأسطول')}  value={`${fleetAvgScore.toLocaleString(locale)}/100`} color={fleetAvgScore >= 80 ? 'var(--status-safe)' : fleetAvgScore >= 60 ? 'var(--status-warn)' : 'var(--status-risk)'} sub={t('Weighted fleet-wide score', 'الدرجة الموزونة لكامل الأسطول')} />
            <KpiCard icon={<Users size={16} />}  label={t('Total Trips', 'إجمالي الرحلات')}      value={totalTrips.toLocaleString(locale)} sub={t(`${Math.round(totalKm).toLocaleString(locale)} km total distance`, `إجمالي المسافة ${Math.round(totalKm).toLocaleString(locale)} كم`)} />
          </div>
        )}

        <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="rpt-table-header">
            <div>
              <h3 className="rpt-table-title">{t('Driver Scorecard Report', 'تقرير سجل أداء السائقين')}</h3>
              <p className="rpt-table-sub">{scFetched ? t(`${scData.length} drivers • ${dateRangeStr}`, `${scData.length} سائقين • ${dateRangeStr}`) : t('Select a date range and generate the report', 'حدد نطاق التاريخ وأنشئ التقرير')}</p>
            </div>
            <ExportDropdown
              disabled={!scData.length}
              onExcel={() => doExcelExport(t('Driver Scorecard Report', 'تقرير سجل أداء السائقين'), excelHeaders, excelRows, dateRangeStr)}
              onPDF={()   => doPDFExport(t('Driver Scorecard Report', 'تقرير سجل أداء السائقين'), excelHeaders, excelRows, dateRangeStr, excelFooter)}
            />
          </div>
          <div className="fleet-table-container" style={{ borderRadius: 0, border: 'none' }}>
            <table className="fleet-table">
              <thead>
                <tr>
                  <th>{t('Rank', 'الرتبة')}</th><th>{t('Bus #', 'رقم الحافلة')}</th><th>{t('Driver', 'السائق')}</th><th>{t('Trips', 'الرحلات')}</th>
                  <th>{t('Total km', 'إجمالي كم')}</th><th>{t('Avg Speed', 'متوسط السرعة')}</th><th>{t('Max Speed', 'أقصى سرعة')}</th>
                  <th>{t('Speeding', 'السرعة')}</th><th>{t('Braking', 'فرملة')}</th><th>{t('Cornering', 'انعطاف')}</th><th>{t('Accel', 'تسارع')}</th>
                  <th>{t('Idle (min)', 'خمول (د)')}</th><th>{t('Score', 'الدرجة')}</th>
                </tr>
              </thead>
              <tbody>
                {scLoading       ? <SkeletonRows cols={13} /> :
                 scError         ? <ErrorState message={scError} onRetry={() => fetchScorecard()} /> :
                 !scFetched      ? <EmptyState /> :
                 scData.length === 0 ? <EmptyState /> :
                 scData.map((r, i) => {
                  const badge  = r.scoreBadge;
                  const isTop  = r.rank === 1;
                  return (
                    <tr key={i} style={isTop ? { background: 'var(--theme-accent-glow)', borderLeft: locale === 'ar-SA' ? 'none' : '3px solid var(--theme-accent-border)', borderRight: locale === 'ar-SA' ? '3px solid var(--theme-accent-border)' : 'none' } : {}}>
                      <td style={{ fontWeight: 900, fontSize: '1rem', color: isTop ? 'var(--theme-accent)' : 'var(--theme-text-muted)' }}>
                        {isTop ? '🥇' : `#${r.rank.toLocaleString(locale)}`}
                      </td>
                      <td style={{ fontWeight: 800 }}>{t('Bus', 'حافلة')} {r.busNumber}</td>
                      <td style={{ fontWeight: 600 }}>{r.driverName}</td>
                      <td style={{ color: 'var(--theme-text-muted)' }}>{r.trips.toLocaleString(locale)}</td>
                      <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.82rem' }}>{r.totalKm.toLocaleString(locale)}</td>
                      <td style={{ color: 'var(--theme-text-muted)', fontSize: '0.82rem' }}>{r.avgSpeed > 0 ? `${r.avgSpeed.toLocaleString(locale)} ${t('km/h', 'كم/س')}` : '--'}</td>
                      <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.82rem', color: r.maxSpeed > 120 ? 'var(--status-risk)' : 'var(--theme-text-main)' }}>
                        {r.maxSpeed > 0 ? `${r.maxSpeed.toLocaleString(locale)} ${t('km/h', 'كم/س')}` : '--'}
                      </td>
                      <td style={{ color: r.speeding  > 0 ? 'var(--status-caution)' : 'var(--theme-text-muted)' }}>{r.speeding.toLocaleString(locale)}</td>
                      <td style={{ color: r.braking   > 0 ? 'var(--status-warn)' : 'var(--theme-text-muted)' }}>{r.braking.toLocaleString(locale)}</td>
                      <td style={{ color: r.cornering > 0 ? 'var(--status-warn)' : 'var(--theme-text-muted)' }}>{r.cornering.toLocaleString(locale)}</td>
                      <td style={{ color: r.accel     > 0 ? 'var(--status-warn)' : 'var(--theme-text-muted)' }}>{r.accel.toLocaleString(locale)}</td>
                      <td style={{ color: 'var(--theme-text-muted)', fontSize: '0.82rem' }}>{r.idleMins.toLocaleString(locale)}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: 900, fontSize: '1rem', color: badge.color }}>{r.score.toLocaleString(locale)}</span>
                          <span className="status-badge" style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`, fontSize: '0.65rem' }}>
                            {badge.label}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {scData.length > 0 && (
                <tfoot>
                  <tr className="rpt-total-row">
                    <td>—</td>
                    <td colSpan={2} style={{ fontWeight: 800 }}>{t('FLEET AVERAGE', 'متوسط الأسطول')}</td>
                    <td style={{ fontWeight: 700 }}>{totalTrips.toLocaleString(locale)}</td>
                    <td style={{ fontWeight: 700 }}>{Math.round(totalKm * 10) / 10}</td>
                    <td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td>
                    <td>
                      <span style={{ fontWeight: 900, fontSize: '1rem', color: fleetAvgScore >= 80 ? 'var(--status-safe)' : fleetAvgScore >= 60 ? 'var(--status-warn)' : 'var(--status-risk)' }}>{fleetAvgScore.toLocaleString(locale)}</span>
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={99} style={{ padding: '8px 20px 14px', fontSize: '0.75rem', color: 'var(--theme-text-muted)', fontWeight: 600 }}>
                      {t(`${scData.length} drivers`, `${scData.length} سائقين`)} &nbsp;•&nbsp; {t('Fleet avg score:', 'متوسط درجة الأسطول:')} {fleetAvgScore.toLocaleString(locale)}/100 &nbsp;•&nbsp; {dateRangeStr}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>
    );
  };

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER — MAINTENANCE COST (original)
  // ══════════════════════════════════════════════════════════════════════════
  const AMBER_SCALE = ['#f59e0b', '#fb923c', '#f97316', '#ea580c', '#dc2626', '#c2410c'];

  const renderMaintenance = () => (
    <div className="reports-view">
      <div className="stats-bento">
        <div className="stat-card glass-panel">
          <div className="stat-header"><h3>{t('Total Fleet Spend', 'إجمالي إنفاق الأسطول')}</h3><DollarSign size={16} /></div>
          <div className="stat-value">{maintTotalSpent.toLocaleString(locale)} <span style={{ fontSize: '0.9rem' }}>{t('AED', 'د.إ')}</span></div>
          <p className="stat-label">{t('Accumulated maintenance cost (Firestore)', 'تكلفة الصيانة المتراكمة (فايرستور)')}</p>
        </div>
        <div className="stat-card glass-panel">
          <div className="stat-header"><h3>{t('High-Cost Asset', 'الأصول عالية التكلفة')}</h3><TrendingUp size={16} style={{ color: 'var(--status-risk)' }} /></div>
          <div className="stat-value" style={{ color: 'var(--status-risk)' }}>{maintData[0]?.plate || '---'}</div>
          <p className="stat-label">{t('Maximum expenditure recorded', 'أقصى إنفاق مسجل')}</p>
        </div>
        <div className="stat-card glass-panel">
          <div className="stat-header"><h3>{t('Report Ready', 'التقرير جاهز')}</h3><FileText size={16} style={{ color: 'var(--status-safe)' }} /></div>
          <div className="stat-value" style={{ color: 'var(--status-safe)' }}>{maintData.length.toLocaleString(locale)}</div>
          <p className="stat-label">{t('Units analyzed in this cycle', 'الوحدات التي تم تحليلها في هذه الدورة')}</p>
        </div>
      </div>

      <div className="fleet-charts-grid" style={{ gridTemplateColumns: '1fr', marginBottom: '32px' }}>
        <div className="glass-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
            <div className="section-header" style={{ marginBottom: 0 }}>
              <h2>{t('Expenditure Distribution', 'توزيع النفقات')}</h2>
              <p>{t(`Asset-level financial analysis from internal service logs (${maintStartDate} to ${maintEndDate})`, `تحليل مالي على مستوى الأصول من سجلات الخدمة الداخلية (${maintStartDate} إلى ${maintEndDate})`)}</p>
            </div>
            <button
              onClick={handleExportMaintPDF}
              disabled={maintGenerating || maintData.length === 0}
              className="btn-premium"
              style={{
                display: 'flex', gap: '8px', alignItems: 'center', padding: '10px 24px',
                background: (maintGenerating || maintData.length === 0) ? 'var(--theme-surface-hover)' : 'var(--theme-accent)',
                color: (maintGenerating || maintData.length === 0) ? 'var(--theme-text-ghost)' : '#000',
                border: '1px solid',
                borderColor: (maintGenerating || maintData.length === 0) ? 'var(--theme-border-light)' : 'var(--theme-accent)',
                borderRadius: '12px', fontWeight: 800, fontSize: '0.85rem', letterSpacing: '0.04em',
                cursor: (maintGenerating || maintData.length === 0) ? 'not-allowed' : 'pointer',
                transition: 'all 0.3s var(--ease-spring)',
                boxShadow: (maintGenerating || maintData.length === 0) ? 'none' : '0 0 24px var(--theme-accent-glow)',
              }}
            >
              {maintGenerating ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
              {maintData.length === 0 ? t('No Data to Export', 'لا توجد بيانات للتصدير') : maintGenerating ? t('Generating...', 'جاري الإنشاء...') : t('Export Intelligence PDF', 'تصدير ذكاء PDF')}
            </button>
          </div>

          <div style={{ height: '450px' }}>
            {maintData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={maintData} layout="vertical" margin={{ left: locale === 'ar-SA' ? 0 : 40, right: locale === 'ar-SA' ? 40 : 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} stroke="var(--theme-border)" />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: 'var(--theme-text-muted)', fontSize: 12 }} />
                  <YAxis dataKey="plate" type="category" axisLine={false} tickLine={false} orientation={locale === 'ar-SA' ? 'right' : 'left'} tick={{ fill: 'var(--theme-text-main)', fontSize: 12, fontWeight: 700 }} />
                  <Tooltip
                    cursor={{ fill: 'var(--theme-accent-glow)' }}
                    contentStyle={{ backgroundColor: 'var(--theme-surface)', border: '1px solid var(--theme-accent-border)', borderRadius: '12px' }}
                    itemStyle={{ color: 'var(--theme-accent)', fontWeight: 700 }}
                  />
                  <Bar dataKey="spend" radius={[0, 4, 4, 0]} barSize={30}>
                    {maintData.map((_, index) => <Cell key={index} fill={AMBER_SCALE[index % AMBER_SCALE.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--theme-text-muted)' }}>
                {t('No expenditure data available for the selected range.', 'لا توجد بيانات نفقات متاحة للنطاق المحدد.')}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="glass-panel">
        <div className="section-header">
          <h2>{t('Custom Data Intelligence Export', 'تصدير ذكاء البيانات المخصص')}</h2>
          <p>{t('Configure parameters for granular fleet analytics', 'تكوين المعلمات لتحليلات الأسطول التفصيلية')}</p>
        </div>
        <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-end', marginTop: '24px' }}>
          <div className="fleet-search-group" style={{ maxWidth: '200px', marginBottom: 0 }}>
            <label style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--theme-text-muted)', display: 'block', marginBottom: '8px', textTransform: 'uppercase' }}>{t('Start Date', 'تاريخ البدء')}</label>
            <input type="date" className="fleet-search-input" style={{ paddingLeft: '16px' }}
              value={maintStartDate} onChange={e => setMaintStartDate(e.target.value)} />
          </div>
          <div className="fleet-search-group" style={{ maxWidth: '200px', marginBottom: 0 }}>
            <label style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--theme-text-muted)', display: 'block', marginBottom: '8px', textTransform: 'uppercase' }}>{t('End Date', 'تاريخ الانتهاء')}</label>
            <input type="date" className="fleet-search-input" style={{ paddingLeft: '16px' }}
              value={maintEndDate} onChange={e => setMaintEndDate(e.target.value)} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button
              onClick={() => fetchMaintenance()}
              disabled={maintLoading}
              style={{
                padding: '10px 20px', opacity: maintLoading ? 0.5 : 1,
                cursor: maintLoading ? 'wait' : 'pointer',
                background: maintLoading ? 'var(--theme-accent-glow)' : 'var(--theme-accent)',
                border: '1px solid var(--theme-accent-border)', borderRadius: '10px',
                color: maintLoading ? 'var(--theme-accent)' : '#000',
                fontWeight: 800, fontSize: '0.8rem', letterSpacing: '0.04em',
                transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '8px',
              }}
            >
              {maintLoading && <Loader2 className="animate-spin" size={14} />}
              {maintLoading ? t('Analyzing...', 'تحليل...') : t('Run Intelligence Query', 'تشغيل استعلام الذكاء')}
            </button>
            {maintQueryStatus && (
              <span style={{ fontSize: '0.65rem', fontWeight: 700, color: maintQueryStatus.includes(t('No', 'لا')) ? 'var(--status-risk)' : 'var(--theme-accent)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {maintQueryStatus}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════════
  // MAIN RENDER
  // ══════════════════════════════════════════════════════════════════════════
  const REPORT_TABS = [
    { id: 'odometer',    label: t('Odometer', 'عداد المسافات'),        icon: <Gauge   size={14} /> },
    { id: 'risk',        label: t('Risk Management', 'إدارة المخاطر'), icon: <Shield  size={14} /> },
    { id: 'scorecard',   label: t('Driver Scorecard', 'سجل أداء السائق'),icon: <Award   size={14} /> },
    { id: 'maintenance', label: t('Maintenance Cost', 'تكلفة الصيانة'), icon: <DollarSign size={14} /> },
  ];

  return (
    <div className="reports-view">
      {/* Sub-tab selector */}
      <div className="rpt-sub-tabs glass-panel">
        {REPORT_TABS.map(tab => (
          <button
            key={tab.id}
            className={`rpt-sub-tab-btn ${activeReport === tab.id ? 'active' : ''}`}
            onClick={() => setActiveReport(tab.id)}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Active report content */}
      {activeReport === 'odometer'    && renderOdometer()}
      {activeReport === 'risk'        && renderRisk()}
      {activeReport === 'scorecard'   && renderScorecard()}
      {activeReport === 'maintenance' && renderMaintenance()}
    </div>
  );
}
