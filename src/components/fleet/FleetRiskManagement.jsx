import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Activity, AlertCircle, User, ShieldAlert, PieChart as PieIcon, Zap,
  Receipt, Plus, Pencil, Trash2, Download, X, Wallet, Paperclip, ExternalLink,
  CalendarDays, FileText, ShieldCheck,
} from 'lucide-react';
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from 'recharts';
import {
  collection, getDocs, query, orderBy, setDoc, updateDoc, deleteDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, auth, storage } from '../../firebase';
import { useLanguage } from '../../contexts/LanguageContext';
import { useFleetSettings } from './FleetSettingsContext';
import { useFleetScope } from './FleetScopeContext';
import { cartrackService } from '../../services/cartrackService';
import { getVehicleMeta } from '../../services/fleetMapping';
import CustomSelect from '../CustomSelect';
import { format } from 'date-fns';
import './FleetModule.css';
import './FleetFines.css';
import DriverScores from './DriverScores';
import { ensureTrafficFinesImport } from './trafficFinesImport65';
import {
  buildFinesReportSummary, noFinesStatement, reportingPeriodLabel, scopeName,
} from './trafficFinesReportData';
import { exportTrafficFinesExcel, exportTrafficFinesPdf } from './trafficFinesReport';
import { sendNotification } from '../../utils/notify';

/* ══════════════════════════════════════════════════════════════════
   Safety & Behavior — two internal tabs:
     السلوك              → telemetry scorecards / risk events (Cartrack)
     المخالفات المرورية   → manually logged government traffic fines
   ══════════════════════════════════════════════════════════════════ */

export default function FleetRiskManagement({ canEdit }) {
  const { t } = useLanguage();
  const [tab, setTab] = useState('behavior');

  return (
    <div className="risk-management-view">
      <div className="ffn-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === 'behavior'}
          className={`ffn-tab${tab === 'behavior' ? ' active' : ''}`}
          onClick={() => setTab('behavior')}
        >
          <Activity size={14} /> {t('Behavior', 'السلوك')}
        </button>
        <button
          role="tab"
          aria-selected={tab === 'fines'}
          className={`ffn-tab${tab === 'fines' ? ' active' : ''}`}
          onClick={() => setTab('fines')}
        >
          <Receipt size={14} /> {t('Traffic Fines', 'المخالفات المرورية')}
        </button>
      </div>

      {tab === 'behavior' ? <DriverScores /> : <FinesTab canEdit={canEdit} />}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   TAB 1 — Behavior (existing scorecards / risk events, unchanged)
   ══════════════════════════════════════════════════════════════════ */

// Kept temporarily as a rollback reference while the native-style scorecard
// replaces the former seven-day violation dashboard.
// eslint-disable-next-line no-unused-vars
function LegacyBehaviorTab() {
  const { settings } = useFleetSettings();
  const { t, locale } = useLanguage();
  const [violations, setViolations] = useState([]);
  const [scorecards, setScorecards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isMounted, setIsMounted] = useState(false);
  const [avgFleetScore, setAvgFleetScore] = useState(0);

  useEffect(() => {
    fetchData();
    const timer = setTimeout(() => setIsMounted(true), 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [events, scData] = await Promise.all([
        cartrackService.getRiskEvents(7),
        cartrackService.getDriverScorecards(7, {
          speedingLimit: settings.speedingLimit,
          brakingMultiplier: settings.brakingSensitivity,
        })
      ]);

      if (events) {
        setViolations(events.map(v => ({
          id: v.id || Math.random().toString(),
          timestamp: v.received_ts || new Date().toISOString(),
          plate: v.registration || 'N/A',
          type: v.alert_type || 'System Alert',
          severity: v.severity || 'Moderate',
          value: v.value || '-',
          location: v.position_description || 'Unknown Location'
        })));
      }

      if (scData) {
        setScorecards(scData);
        if (scData.length > 0) {
          const avg = Math.round(scData.reduce((acc, s) => acc + s.riskScore, 0) / scData.length);
          setAvgFleetScore(avg);
        }
      }
    } catch (err) {
      console.error('Risk Data Fetch Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const COLORS = {
    critical: 'var(--status-risk)',
    high: 'var(--status-warn)',
    moderate: 'var(--theme-ink)',
    low: 'var(--accent)'
  };

  const pieData = [
    { name: t('Critical', 'حرج'), value: violations.filter(v => v.severity === 'Critical').length, color: COLORS.critical },
    { name: t('High', 'مرتفع'), value: violations.filter(v => v.severity === 'High').length, color: COLORS.high },
    { name: t('Moderate', 'متوسط'), value: violations.filter(v => v.severity === 'Moderate').length, color: COLORS.moderate },
  ].filter(d => d.value > 0);

  const radarData = [
    { subject: t('Braking', 'الكبح'), A: avgFleetScore, fullMark: 100 },
    { subject: t('Speeding', 'السرعة'), A: 94, fullMark: 100 },
    { subject: t('Cornering', 'الانعطاف'), A: 88, fullMark: 100 },
    { subject: t('Accel', 'التسارع'), A: 82, fullMark: 100 },
    { subject: t('Stability', 'الثبات'), A: 91, fullMark: 100 },
  ];

  if (loading || !isMounted) {
    return (
      <div className="view-loading">
        <div className="app-loader"><span /><span /><span /><span /><span /></div>
      </div>
    );
  }

  return (
    <>
      <div className="stats-bento">
        <div className="stat-card glass-panel">
          <div className="stat-header"><h3>{t('Fleet Safety Index', 'مؤشر سلامة الأسطول')}</h3><Activity size={16} /></div>
          <div className={`stat-value ${avgFleetScore > 80 ? 'text-safe' : 'text-caution'}`}>{avgFleetScore}</div>
          <p className="stat-label">{t('Avg. Performance Score', 'متوسط درجة الأداء')}</p>
        </div>
        <div className="stat-card glass-panel">
          <div className="stat-header"><h3>{t('Total Violations', 'إجمالي المخالفات')}</h3><AlertCircle size={16} className="text-risk" /></div>
          <div className="stat-value text-risk">{violations.length.toLocaleString(locale)}</div>
          <p className="stat-label">{t('Detected (Last 7 Days)', 'تم اكتشافها (آخر 7 أيام)')}</p>
        </div>
        <div className="stat-card glass-panel">
          <div className="stat-header"><h3>{t('Safe Units', 'الوحدات الآمنة')}</h3><User size={16} className="text-safe" /></div>
          <div className="stat-value text-safe">{scorecards.filter(s => s.riskScore >= 80).length.toLocaleString(locale)}</div>
          <p className="stat-label">{t('Operating in Optimal Range', 'تعمل في النطاق الأمثل')}</p>
        </div>
        <div className="stat-card glass-panel">
          <div className="stat-header"><h3>{t('High Risk', 'مخاطر عالية')}</h3><ShieldAlert size={16} className="text-caution" /></div>
          <div className="stat-value text-caution">{scorecards.filter(s => s.riskScore < 60).length.toLocaleString(locale)}</div>
          <p className="stat-label">{t('Urgent Intervention Required', 'مطلوب تدخل عاجل')}</p>
        </div>
      </div>

      <div className="fleet-charts-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
        <div className="glass-panel" style={{ minHeight: '400px' }}>
          <h3 className="chart-title" style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '20px', fontSize: '1rem', color: 'var(--theme-text-muted)' }}>
            <PieIcon size={18} /> {t('Severity Distribution', 'توزيع الخطورة')}
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={pieData} innerRadius={80} outerRadius={110} paddingAngle={5} dataKey="value" stroke="none">
                {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
              </Pie>
              <Tooltip
                contentStyle={{ backgroundColor: 'var(--theme-surface)', border: '1px solid var(--theme-border)', borderRadius: '12px', textAlign: locale === 'ar-SA' ? 'right' : 'left' }}
                itemStyle={{ color: 'var(--theme-text-main)' }}
              />
              <Legend verticalAlign="bottom" height={36}/>
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-panel">
          <h3 className="chart-title" style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '20px', fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--theme-text-muted)' }}>
            <Zap size={16} color="var(--theme-accent)" /> {t('Safety Performance Radar', 'رادار أداء السلامة')}
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <RadarChart cx="50%" cy="50%" outerRadius="72%" data={radarData}>
              <PolarGrid stroke="var(--theme-border)" gridType="polygon" />
              <PolarAngleAxis
                dataKey="subject"
                tick={{ fill: 'var(--theme-text-muted)', fontSize: 11, fontWeight: 600 }}
              />
              <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
              <Radar
                name={t('Fleet Avg', 'متوسط الأسطول')}
                dataKey="A"
                stroke="var(--theme-accent)"
                strokeWidth={2}
                fill="var(--theme-accent)"
                fillOpacity={0.18}
                dot={{ fill: 'var(--theme-accent)', r: 3 }}
              />
              <Tooltip
                contentStyle={{ backgroundColor: 'var(--theme-surface)', border: '1px solid var(--theme-accent-border)', borderRadius: '10px', fontSize: '0.8rem', textAlign: locale === 'ar-SA' ? 'right' : 'left' }}
                itemStyle={{ color: 'var(--theme-accent)', fontWeight: 700 }}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: '0', overflow: 'hidden' }}>
        <div style={{ padding: '24px', borderBottom: '1px solid var(--theme-border-light)' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>{t('Recent Safety Incidents', 'حوادث السلامة الأخيرة')}</h3>
          <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--theme-text-muted)' }}>{t('Real-time telemetry breach logs (Last 7 Days)', 'سجلات خرق القياس عن بعد في الوقت الفعلي (آخر 7 أيام)')}</p>
        </div>
        <div className="fleet-table-container" style={{ borderRadius: 0, border: 'none' }}>
          <table className="fleet-table">
            <thead>
              <tr>
                <th>{t('Vehicle', 'المركبة')}</th>
                <th>{t('Incident', 'الحادث')}</th>
                <th>{t('Severity', 'الخطورة')}</th>
              </tr>
            </thead>
            <tbody>
              {violations.slice(0, 15).map((v) => (
                <tr key={v.id}>
                  <td style={{ fontWeight: 800, color: 'var(--theme-text-main)' }}>
                    {v.plate}
                    <div style={{ fontSize: '0.7rem', color: 'var(--theme-text-muted)', fontWeight: 400 }}>{getVehicleMeta(v.plate).driverName}</div>
                  </td>
                  <td style={{ fontWeight: 600 }}>{t(v.type, v.type === 'Speeding' ? 'تجاوز السرعة' : v.type === 'Harsh Braking' ? 'فرملة شديدة' : v.type)}</td>
                  <td>
                    <span className={`status-badge ${v.severity === 'Critical' ? 'risk' : v.severity === 'High' ? 'maintenance' : 'active'}`}>
                      {v.severity === 'Critical' ? t('Critical', 'حرج') : v.severity === 'High' ? t('High', 'مرتفع') : t('Moderate', 'متوسط')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════
   TAB 2 — Driver Traffic Fines (fleet_fines collection)
   ══════════════════════════════════════════════════════════════════ */

const FINE_TYPES = [
  { id: 'unknown',   en: 'Not specified',        ar: 'غير محدد' },
  { id: 'speeding',  en: 'Speeding',            ar: 'تجاوز السرعة' },
  { id: 'parking',   en: 'Illegal Parking',     ar: 'وقوف خاطئ' },
  { id: 'red_light', en: 'Running a Red Light', ar: 'تجاوز إشارة' },
  { id: 'phone',     en: 'Phone Use',           ar: 'استخدام الهاتف' },
  { id: 'seatbelt',  en: 'Seatbelt',            ar: 'حزام الأمان' },
  { id: 'other',     en: 'Other',               ar: 'أخرى' },
];

const fineTypeLabel = (id, t) => {
  const f = FINE_TYPES.find(x => x.id === id);
  return f ? t(f.en, f.ar) : (id || '—');
};

const emptyFineDraft = () => ({
  driverName: '',
  vehicleReg: '',
  date: format(new Date(), 'yyyy-MM-dd'),
  fineType: 'speeding',
  amountAed: '',
  referenceNo: '',
  notes: '',
  details: '',
});

function FinesTab({ canEdit }) {
  const { t, locale, lang } = useLanguage();
  const { scope, inScope, displayName, metaOf, metaMap, classOf } = useFleetScope();

  const [fines, setFines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [vehicles, setVehicles] = useState([]);
  const [filterDriver, setFilterDriver] = useState('all');
  const [filterMonth, setFilterMonth] = useState('all');
  const [modal, setModal] = useState(null); // { mode: 'add'|'edit', id?, draft }
  const [modalError, setModalError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null); // fine object
  const [busyId, setBusyId] = useState(null);
  const [evidenceFile, setEvidenceFile] = useState(null);
  const [exporting, setExporting] = useState('');

  const fetchFines = useCallback(async () => {
    setLoading(true);
    try {
      try {
        await ensureTrafficFinesImport(db, auth.currentUser?.email || '');
      } catch (importError) {
        console.warn('Traffic fines workbook import was not permitted:', importError);
      }
      const snap = await getDocs(query(collection(db, 'fleet_fines'), orderBy('date', 'desc')));
      setFines(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error('Fines fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchFines(); }, [fetchFines]);

  useEffect(() => {
    let alive = true;
    cartrackService.getVehicles('all').then(list => {
      if (alive && Array.isArray(list)) setVehicles(list);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const vehLabel = useCallback(
    (reg) => displayName(reg, lang) || reg,
    [displayName, lang]
  );

  const resolvedDriver = useCallback((fine) => fine.driverName || metaOf(fine.vehicleReg).driverName || '', [metaOf]);

  const scopeDriverNames = useMemo(() => {
    if (scope === 'all') return new Set();
    const names = new Set();
    metaMap.forEach((_, registration) => {
      const meta = metaOf(registration);
      const matches = scope === 'buses' ? classOf(registration) === 'bus' : classOf(registration) === 'other';
      if (matches && meta.driverName) names.add(String(meta.driverName).trim().toLowerCase());
    });
    return names;
  }, [scope, metaMap, metaOf, classOf]);

  // Vehicle-linked fines follow the classified fleet scope. A driver-only
  // record is included only when that named driver belongs to the scope.
  const scoped = useMemo(
    () => fines.filter((fine) => {
      if (fine.vehicleReg) return inScope(fine.vehicleReg);
      if (scope === 'all') return true;
      const driver = String(fine.driverName || '').trim().toLowerCase();
      return !!driver && scopeDriverNames.has(driver);
    }),
    [fines, inScope, scope, scopeDriverNames]
  );

  const driverOptions = useMemo(() => {
    const names = [...new Set(scoped.map(resolvedDriver).filter(Boolean))].sort();
    return [{ value: 'all', label: t('All drivers', 'كل السائقين') }, ...names.map(n => ({ value: n, label: n }))];
  }, [scoped, resolvedDriver, t]);

  const filtered = useMemo(() => {
    return scoped
      .filter(f => filterDriver === 'all' || resolvedDriver(f) === filterDriver)
      .filter(f => filterMonth === 'all' || (f.date || '').startsWith(filterMonth))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [scoped, filterDriver, filterMonth, resolvedDriver]);

  const totals = useMemo(() => {
    const amt = (f) => parseFloat(f.amountAed) || 0;
    const ranked = (key, value = () => 1) => {
      const values = new Map();
      filtered.forEach((f) => { const group = key(f); if (group) values.set(group, (values.get(group) || 0) + value(f)); });
      return [...values.entries()].sort((a, b) => b[1] - a[1])[0] || null;
    };
    const vehicleCounts = new Map();
    filtered.forEach((f) => { if (f.vehicleReg) vehicleCounts.set(f.vehicleReg, (vehicleCounts.get(f.vehicleReg) || 0) + 1); });
    const affectedVehicles = vehicleCounts.size;
    const recentCutoff = format(new Date(Date.now() - 30 * 86400000), 'yyyy-MM-dd');
    const recent = filtered.filter((f) => (f.date || '') >= recentCutoff);
    const areaOf = (f) => (f.details || '').split('-')[0]?.trim();
    return {
      count: filtered.length,
      totalAed: filtered.reduce((s, f) => s + amt(f), 0),
      averageAed: filtered.length ? filtered.reduce((s, f) => s + amt(f), 0) / filtered.length : 0,
      affectedVehicles,
      repeatVehicles: [...vehicleCounts.values()].filter((count) => count > 1).length,
      topVehicle: ranked((f) => f.vehicleReg),
      costliestVehicle: ranked((f) => f.vehicleReg, amt),
      peakMonth: ranked((f) => (f.date || '').slice(0, 7)),
      topArea: ranked(areaOf),
      recentCount: recent.length,
      recentAed: recent.reduce((sum, fine) => sum + amt(fine), 0),
    };
  }, [filtered]);

  const vehicleOptions = useMemo(() => ([
    { value: '', label: t('— No vehicle —', '— بدون مركبة —') },
    ...vehicles.map(v => ({ value: v.registration, label: vehLabel(v.registration) })),
  ]), [vehicles, vehLabel, t]);

  const selectedPeriodLabel = useMemo(
    () => filterMonth === 'all'
      ? t('All recorded dates', 'كل التواريخ المسجلة')
      : reportingPeriodLabel(filterMonth, locale),
    [filterMonth, locale, t]
  );

  const emptyStatement = useMemo(() => noFinesStatement({
    scope,
    driver: filterDriver,
    periodLabel: reportingPeriodLabel(filterMonth === 'all' ? '' : filterMonth, 'en-AE'),
  }), [scope, filterDriver, filterMonth]);

  const openAdd = () => { setModalError(''); setEvidenceFile(null); setModal({ mode: 'add', draft: emptyFineDraft() }); };
  const openEdit = (f) => {
    setModalError('');
    setEvidenceFile(null);
    setModal({
      mode: 'edit',
      id: f.id,
      draft: {
        driverName: f.driverName || '',
        vehicleReg: f.vehicleReg || '',
        date: f.date || format(new Date(), 'yyyy-MM-dd'),
        fineType: f.fineType || 'other',
        amountAed: f.amountAed ?? '',
        referenceNo: f.referenceNo || '',
        notes: f.notes || '',
        details: f.details || '',
      },
    });
  };

  const setDraft = (patch) => setModal(m => ({ ...m, draft: { ...m.draft, ...patch } }));

  const saveFine = async () => {
    if (!modal) return;
    const d = modal.draft;
    if (!d.date) { setModalError(t('Date is required.', 'التاريخ مطلوب.')); return; }
    const amount = parseFloat(d.amountAed);
    if (isNaN(amount) || amount < 0) { setModalError(t('Enter a valid amount in AED.', 'أدخل مبلغاً صحيحاً بالدرهم.')); return; }

    if (evidenceFile && (evidenceFile.size > 10 * 1024 * 1024 || !/^(application\/pdf|image\/(jpeg|png|webp))$/.test(evidenceFile.type))) {
      setModalError(t('Evidence must be PDF, JPG, PNG or WEBP and no larger than 10MB.', 'يجب أن يكون الدليل PDF أو JPG أو PNG أو WEBP وألا يتجاوز 10 ميجابايت.'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        driverName: d.driverName.trim(),
        vehicleReg: d.vehicleReg || '',
        date: d.date,
        fineType: d.fineType,
        amountAed: amount,
        referenceNo: d.referenceNo.trim(),
        notes: d.notes.trim(),
        details: d.details.trim(),
      };
      const fineRef = modal.mode === 'add' ? doc(collection(db, 'fleet_fines')) : doc(db, 'fleet_fines', modal.id);
      if (evidenceFile) {
        const safeName = evidenceFile.name.replace(/[^\w.\-()\s]/g, '_');
        const path = `fleet_fines/${fineRef.id}/${Date.now()}_${safeName}`;
        await uploadBytes(storageRef(storage, path), evidenceFile, { contentType: evidenceFile.type });
        payload.evidence = { name: evidenceFile.name, path, url: await getDownloadURL(storageRef(storage, path)), contentType: evidenceFile.type, size: evidenceFile.size };
      }
      if (modal.mode === 'add') {
        await setDoc(fineRef, {
          ...payload,
          createdAt: serverTimestamp(),
          createdBy: auth.currentUser?.email || '',
        });
        await sendNotification('fleet_fine_logged', {
          registration: payload.vehicleReg,
          driverName: payload.driverName,
          date: payload.date,
          amountAed: payload.amountAed,
          referenceNo: payload.referenceNo,
        });
      } else {
        await updateDoc(fineRef, payload);
      }
      setModal(null);
      await fetchFines();
    } catch (err) {
      console.error('Fine save error:', err);
      setModalError(t('Failed to save. Please try again.', 'فشل الحفظ. يرجى المحاولة مرة أخرى.'));
    } finally {
      setSaving(false);
    }
  };

  const deleteFine = async () => {
    if (!confirmDelete) return;
    setBusyId(confirmDelete.id);
    try {
      if (confirmDelete.evidence?.path) {
        try { await deleteObject(storageRef(storage, confirmDelete.evidence.path)); } catch (err) { console.warn('Fine evidence delete failed:', err); }
      }
      await deleteDoc(doc(db, 'fleet_fines', confirmDelete.id));
      setFines(prev => prev.filter(x => x.id !== confirmDelete.id));
      setConfirmDelete(null);
    } catch (err) {
      console.error('Fine delete error:', err);
    } finally {
      setBusyId(null);
    }
  };

  const finesExportPayload = useMemo(() => {
    const reportMonth = filterMonth === 'all' ? '' : filterMonth;
    const summary = buildFinesReportSummary({
      scope, month: reportMonth, driver: filterDriver, count: totals.count,
      totalAed: totals.totalAed, generatedAt: new Date().toISOString(),
    });
    return {
      fines: filtered, totals, scope, driver: filterDriver,
      periodLabel: selectedPeriodLabel, from: summary.from, to: summary.to, locale,
      resolveDriver: resolvedDriver, vehicleLabel: vehLabel,
    };
  }, [filterDriver, filterMonth, filtered, locale, resolvedDriver, scope, selectedPeriodLabel, totals, vehLabel]);

  const runFinesExport = async (type) => {
    if (exporting) return;
    setExporting(type);
    try {
      if (type === 'pdf') await exportTrafficFinesPdf(finesExportPayload);
      else await exportTrafficFinesExcel(finesExportPayload);
    } catch (exportError) {
      console.error(`Traffic-fines ${type} export failed:`, exportError);
    } finally {
      setExporting('');
    }
  };

  if (loading) {
    return (
      <div className="view-loading">
        <div className="app-loader"><span /><span /><span /><span /><span /></div>
      </div>
    );
  }

  return (
    <div className="ffn-view">
      <div className="ffn-period-bar glass-panel">
        <div className="ffn-period-copy">
          <span className="ffn-period-icon"><CalendarDays size={18} /></span>
          <div><strong>{t('Reporting period', 'فترة التقرير')}</strong><small>{scopeName(scope)} · {selectedPeriodLabel}</small></div>
        </div>
        <div className="ffn-period-controls">
          <label>
            <span>{t('Select month', 'اختر الشهر')}</span>
            <input type="month" value={filterMonth === 'all' ? '' : filterMonth} onChange={(event) => setFilterMonth(event.target.value || 'all')} />
          </label>
          <button type="button" className="ffn-btn ffn-btn-ghost" onClick={() => setFilterMonth('all')} disabled={filterMonth === 'all'}>{t('All dates', 'كل التواريخ')}</button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="stats-bento">
        <div className="stat-card glass-panel">
          <div className="stat-header"><h3>{t('Total Fines', 'إجمالي المخالفات')}</h3><Receipt size={16} /></div>
          <div className="stat-value">{totals.count.toLocaleString(locale)}</div>
          <p className="stat-label">{t('Matching current filters', 'حسب الفلاتر الحالية')}</p>
        </div>
        <div className="stat-card glass-panel">
          <div className="stat-header"><h3>{t('Total Amount', 'إجمالي المبالغ')}</h3><Wallet size={16} className="text-accent" /></div>
          <div className="stat-value text-accent">{totals.totalAed.toLocaleString(locale)}<span className="ffn-unit">{t('AED', 'د.إ')}</span></div>
          <p className="stat-label">{t('All fines value', 'قيمة جميع المخالفات')}</p>
        </div>
        <div className="stat-card glass-panel">
          <div className="stat-header"><h3>{t('Average Fine', 'متوسط المخالفة')}</h3><Activity size={16} /></div>
          <div className="stat-value">{Math.round(totals.averageAed).toLocaleString(locale)}<span className="ffn-unit">{t('AED', 'د.إ')}</span></div>
          <p className="stat-label">{t('Average cost per recorded fine', 'متوسط تكلفة المخالفة المسجلة')}</p>
        </div>
        <div className="stat-card glass-panel">
          <div className="stat-header"><h3>{t('Vehicles Affected', 'المركبات المتأثرة')}</h3><User size={16} /></div>
          <div className="stat-value">{totals.affectedVehicles.toLocaleString(locale)}</div>
          <p className="stat-label">{t(`${totals.repeatVehicles} vehicles have repeat fines`, `${totals.repeatVehicles} مركبات لديها مخالفات متكررة`)}</p>
        </div>
      </div>

      {filtered.length > 0 && (
        <div className="ffn-insight-strip glass-panel">
          <span><strong>{t('Highest frequency vehicle', 'المركبة الأكثر مخالفة')}</strong>{totals.topVehicle ? `${vehLabel(totals.topVehicle[0])} · ${totals.topVehicle[1]} ${t('fines', 'مخالفة')}` : '—'}</span>
          <span><strong>{t('Highest cost vehicle', 'المركبة الأعلى تكلفة')}</strong>{totals.costliestVehicle ? `${vehLabel(totals.costliestVehicle[0])} · ${totals.costliestVehicle[1].toLocaleString(locale)} ${t('AED', 'د.إ')}` : '—'}</span>
          <span><strong>{t('Peak month', 'الشهر الأعلى')}</strong>{totals.peakMonth ? `${totals.peakMonth[0]} · ${totals.peakMonth[1]} ${t('fines', 'مخالفة')}` : '—'}</span>
          <span><strong>{t('Most frequent area', 'المنطقة الأكثر تكراراً')}</strong>{totals.topArea ? `${totals.topArea[0]} · ${totals.topArea[1]}` : '—'}</span>
          <span><strong>{t('Last 30 days', 'آخر 30 يوماً')}</strong>{`${totals.recentCount} ${t('fines', 'مخالفة')} · ${totals.recentAed.toLocaleString(locale)} ${t('AED', 'د.إ')}`}</span>
        </div>
      )}

      {filtered.length === 0 && filterMonth !== 'all' && (
        <div className="ffn-no-fines-proof glass-panel">
          <span className="ffn-proof-icon"><ShieldCheck size={24} /></span>
          <div>
            <span>{t('Period verification', 'التحقق من الفترة')}</span>
            <h3>{t('No fines for the selected period', 'لا توجد مخالفات في الفترة المحددة')}</h3>
            <p>{emptyStatement}</p>
            <small>{t('Based on the current FMAC Traffic Fines Register.', 'استناداً إلى سجل المخالفات المرورية الحالي في FMAC.')}</small>
          </div>
          <div className="ffn-proof-actions">
            <button type="button" className="ffn-btn ffn-btn-ghost" onClick={() => runFinesExport('pdf')} disabled={Boolean(exporting)}><FileText size={14} /> {t('PDF proof', 'إثبات PDF')}</button>
            <button type="button" className="ffn-btn ffn-btn-ghost" onClick={() => runFinesExport('excel')} disabled={Boolean(exporting)}><Download size={14} /> {t('Excel proof', 'إثبات إكسل')}</button>
          </div>
        </div>
      )}

      {/* Table panel */}
      <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="ffn-toolbar">
          <div className="section-header" style={{ marginBottom: 0 }}>
            <h2>{t('Traffic Fines Register', 'سجل المخالفات المرورية')}</h2>
            <p>{t('Manually logged government traffic fines', 'مخالفات مرورية حكومية مسجلة يدوياً')}</p>
          </div>
          <div className="ffn-toolbar-actions">
            <div className="ffn-filter">
              <label>{t('Driver', 'السائق')}</label>
              <CustomSelect value={filterDriver} onChange={setFilterDriver} options={driverOptions} ariaLabel={t('Filter by driver', 'تصفية حسب السائق')} />
            </div>
            <button className="ffn-btn ffn-btn-ghost" onClick={() => runFinesExport('pdf')} disabled={Boolean(exporting)}>
              <FileText size={14} /> PDF
            </button>
            <button className="ffn-btn ffn-btn-ghost" onClick={() => runFinesExport('excel')} disabled={Boolean(exporting)}>
              <Download size={14} /> {t('Excel', 'إكسل')}
            </button>
            {canEdit && (
              <button className="ffn-btn ffn-btn-primary" onClick={openAdd}>
                <Plus size={14} /> {t('Log Fine', 'تسجيل مخالفة')}
              </button>
            )}
          </div>
        </div>

        <div className="fleet-table-container" style={{ borderRadius: 0, border: 'none' }}>
          <table className="fleet-table">
            <thead>
              <tr>
                <th>{t('Date', 'التاريخ')}</th>
                <th>{t('Driver', 'السائق')}</th>
                <th>{t('Vehicle', 'المركبة')}</th>
                <th>{t('Details / Violation', 'التفاصيل / المخالفة')}</th>
                <th>{t('Amount (AED)', 'المبلغ (د.إ)')}</th>
                <th>{t('Reference', 'الرقم المرجعي')}</th>
                <th>{t('Evidence', 'الدليل')}</th>
                {canEdit && <th>{t('Actions', 'إجراءات')}</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={canEdit ? 8 : 7} style={{ textAlign: 'center', padding: '40px', color: 'var(--theme-text-muted)' }}>
                    {t('No fines match the current filters.', 'لا توجد مخالفات مطابقة للفلاتر الحالية.')}
                  </td>
                </tr>
              ) : filtered.map(f => (
                <tr key={f.id}>
                  <td style={{ color: 'var(--theme-text-muted)', whiteSpace: 'nowrap' }}>{f.date}</td>
                  <td style={{ fontWeight: 800, color: 'var(--theme-text-main)' }}>{resolvedDriver(f) || t('Unassigned', 'غير معيّن')}</td>
                  <td>
                    {f.vehicleReg ? (
                      <>
                        <span style={{ fontWeight: 600 }}>{vehLabel(f.vehicleReg)}</span>
                        <div style={{ fontSize: '0.7rem', color: 'var(--theme-text-muted)' }}>{f.vehicleReg}</div>
                      </>
                    ) : <span className="text-muted">—</span>}
                  </td>
                  <td className="ffn-details-cell"><span dir={f.details ? 'rtl' : undefined}>{f.details || fineTypeLabel(f.fineType, t)}</span></td>
                  <td style={{ fontWeight: 800, color: 'var(--theme-accent)' }}>{(parseFloat(f.amountAed) || 0).toLocaleString(locale)}</td>
                  <td className="text-muted" style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{f.referenceNo || '—'}</td>
                  <td>{f.evidence?.url ? <a className="ffn-evidence-link" href={f.evidence.url} target="_blank" rel="noreferrer"><Paperclip size={13} /><ExternalLink size={11} /></a> : <span className="text-muted">—</span>}</td>
                  {canEdit && (
                    <td>
                      <div className="ffn-row-actions">
                        <button className="ffn-icon-btn" title={t('Edit', 'تعديل')} onClick={() => openEdit(f)}>
                          <Pencil size={14} />
                        </button>
                        <button className="ffn-icon-btn ffn-danger" title={t('Delete', 'حذف')} disabled={busyId === f.id} onClick={() => setConfirmDelete(f)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit modal */}
      {modal && (
        <div className="ffn-modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) setModal(null); }}>
          <div className="ffn-modal glass-panel">
            <div className="ffn-modal-head">
              <h3>{modal.mode === 'add' ? t('Log Traffic Fine', 'تسجيل مخالفة مرورية') : t('Edit Traffic Fine', 'تعديل مخالفة مرورية')}</h3>
              <button className="ffn-icon-btn" onClick={() => setModal(null)} disabled={saving}><X size={16} /></button>
            </div>
            <div className="ffn-modal-body">
              <div className="ffn-grid2">
                <div className="ffn-field">
                  <label>{t('Driver name (optional)', 'اسم السائق (اختياري)')}</label>
                  <input type="text" value={modal.draft.driverName} onChange={e => setDraft({ driverName: e.target.value })} placeholder={t('e.g. Ahmed Ali', 'مثال: أحمد علي')} />
                </div>
                <div className="ffn-field">
                  <label>{t('Vehicle (optional)', 'المركبة (اختياري)')}</label>
                  <CustomSelect value={modal.draft.vehicleReg} onChange={v => setDraft({ vehicleReg: v })} options={vehicleOptions} ariaLabel={t('Vehicle', 'المركبة')} />
                </div>
                <div className="ffn-field">
                  <label>{t('Date *', 'التاريخ *')}</label>
                  <input type="date" value={modal.draft.date} onChange={e => setDraft({ date: e.target.value })} />
                </div>
                <div className="ffn-field">
                  <label>{t('Violation type', 'نوع المخالفة')}</label>
                  <CustomSelect
                    value={modal.draft.fineType}
                    onChange={v => setDraft({ fineType: v })}
                    options={FINE_TYPES.map(f => ({ value: f.id, label: t(f.en, f.ar) }))}
                    ariaLabel={t('Violation type', 'نوع المخالفة')}
                  />
                </div>
                <div className="ffn-field">
                  <label>{t('Amount (AED) *', 'المبلغ (د.إ) *')}</label>
                  <input type="number" min="0" step="0.01" value={modal.draft.amountAed} onChange={e => setDraft({ amountAed: e.target.value })} placeholder="0.00" />
                </div>
                <div className="ffn-field">
                  <label>{t('Reference no. (optional)', 'الرقم المرجعي (اختياري)')}</label>
                  <input type="text" value={modal.draft.referenceNo} onChange={e => setDraft({ referenceNo: e.target.value })} placeholder={t('Gov. fine reference', 'مرجع المخالفة الحكومي')} />
                </div>
                <div className="ffn-field ffn-span2">
                  <label>{t('Government fine details / location', 'تفاصيل / موقع المخالفة الحكومية')}</label>
                  <textarea dir="auto" rows={3} value={modal.draft.details} onChange={e => setDraft({ details: e.target.value })} />
                </div>
                <div className="ffn-field ffn-span2">
                  <label>{t('Notes', 'ملاحظات')}</label>
                  <textarea rows={2} value={modal.draft.notes} onChange={e => setDraft({ notes: e.target.value })} />
                </div>
                <div className="ffn-field ffn-span2">
                  <label>{t('Attachment / evidence', 'المرفق / الدليل')}</label>
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={e => setEvidenceFile(e.target.files?.[0] || null)} />
                  {modal.mode === 'edit' && fines.find(f => f.id === modal.id)?.evidence?.url && !evidenceFile && <a className="ffn-evidence-link" href={fines.find(f => f.id === modal.id).evidence.url} target="_blank" rel="noreferrer">{t('View current evidence', 'عرض الدليل الحالي')} <ExternalLink size={11} /></a>}
                </div>
              </div>
              {modalError && <p className="ffn-error">{modalError}</p>}
            </div>
            <div className="ffn-modal-foot">
              <button className="ffn-btn ffn-btn-ghost" onClick={() => setModal(null)} disabled={saving}>{t('Cancel', 'إلغاء')}</button>
              <button className="ffn-btn ffn-btn-primary" onClick={saveFine} disabled={saving}>
                {saving ? t('Saving…', 'جارٍ الحفظ…') : modal.mode === 'add' ? t('Save Fine', 'حفظ المخالفة') : t('Save Changes', 'حفظ التعديلات')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="ffn-modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirmDelete(null); }}>
          <div className="ffn-modal ffn-modal-sm glass-panel">
            <div className="ffn-modal-head">
              <h3>{t('Delete fine?', 'حذف المخالفة؟')}</h3>
              <button className="ffn-icon-btn" onClick={() => setConfirmDelete(null)}><X size={16} /></button>
            </div>
            <div className="ffn-modal-body">
              <p className="ffn-confirm-text">
                {t('This will permanently remove the fine for', 'سيؤدي هذا إلى حذف المخالفة نهائياً للسائق')}{' '}
                <strong>{confirmDelete.driverName}</strong>{' '}
                ({confirmDelete.date} — {(parseFloat(confirmDelete.amountAed) || 0).toLocaleString(locale)} {t('AED', 'د.إ')}).
              </p>
            </div>
            <div className="ffn-modal-foot">
              <button className="ffn-btn ffn-btn-ghost" onClick={() => setConfirmDelete(null)}>{t('Cancel', 'إلغاء')}</button>
              <button className="ffn-btn ffn-btn-danger" onClick={deleteFine} disabled={busyId === confirmDelete.id}>
                <Trash2 size={14} /> {t('Delete', 'حذف')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
