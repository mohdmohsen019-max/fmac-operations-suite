import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Activity, AlertCircle, User, ShieldAlert, PieChart as PieIcon, Zap,
  Receipt, Plus, Pencil, Trash2, Download, X, Check, Wallet, RotateCcw,
} from 'lucide-react';
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from 'recharts';
import {
  collection, getDocs, query, orderBy, addDoc, updateDoc, deleteDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { db, auth } from '../../firebase';
import { useLanguage } from '../../contexts/LanguageContext';
import { useFleetSettings } from './FleetSettingsContext';
import { useFleetScope } from './FleetScopeContext';
import { cartrackService } from '../../services/cartrackService';
import { getVehicleMeta } from '../../services/fleetMapping';
import CustomSelect from '../CustomSelect';
import { format } from 'date-fns';
import './FleetModule.css';
import './FleetFines.css';

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

      {tab === 'behavior' ? <BehaviorTab /> : <FinesTab canEdit={canEdit} />}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   TAB 1 — Behavior (existing scorecards / risk events, unchanged)
   ══════════════════════════════════════════════════════════════════ */

function BehaviorTab() {
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
  status: 'unpaid',
  referenceNo: '',
  notes: '',
});

function FinesTab({ canEdit }) {
  const { t, locale, lang } = useLanguage();
  const { inScope, displayName } = useFleetScope();

  const [fines, setFines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [vehicles, setVehicles] = useState([]);
  const [filterDriver, setFilterDriver] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterMonth, setFilterMonth] = useState('all');
  const [modal, setModal] = useState(null); // { mode: 'add'|'edit', id?, draft }
  const [modalError, setModalError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null); // fine object
  const [busyId, setBusyId] = useState(null);

  const fetchFines = useCallback(async () => {
    setLoading(true);
    try {
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

  // Scope: fines tied to a vehicle follow the global scope switch;
  // fines with no vehicle always show.
  const scoped = useMemo(
    () => fines.filter(f => !f.vehicleReg || inScope(f.vehicleReg)),
    [fines, inScope]
  );

  const driverOptions = useMemo(() => {
    const names = [...new Set(scoped.map(f => f.driverName).filter(Boolean))].sort();
    return [{ value: 'all', label: t('All drivers', 'كل السائقين') }, ...names.map(n => ({ value: n, label: n }))];
  }, [scoped, t]);

  const monthOptions = useMemo(() => {
    const months = [...new Set(scoped.map(f => (f.date || '').slice(0, 7)).filter(m => m.length === 7))].sort().reverse();
    const fmt = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' });
    return [
      { value: 'all', label: t('All months', 'كل الأشهر') },
      ...months.map(m => ({ value: m, label: fmt.format(new Date(`${m}-01T00:00:00`)) })),
    ];
  }, [scoped, locale, t]);

  const filtered = useMemo(() => {
    return scoped
      .filter(f => filterDriver === 'all' || f.driverName === filterDriver)
      .filter(f => filterStatus === 'all' || f.status === filterStatus)
      .filter(f => filterMonth === 'all' || (f.date || '').startsWith(filterMonth))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [scoped, filterDriver, filterStatus, filterMonth]);

  const totals = useMemo(() => {
    const amt = (f) => parseFloat(f.amountAed) || 0;
    const unpaid = filtered.filter(f => f.status !== 'paid');
    return {
      count: filtered.length,
      totalAed: filtered.reduce((s, f) => s + amt(f), 0),
      unpaidCount: unpaid.length,
      unpaidAed: unpaid.reduce((s, f) => s + amt(f), 0),
    };
  }, [filtered]);

  const vehicleOptions = useMemo(() => ([
    { value: '', label: t('— No vehicle —', '— بدون مركبة —') },
    ...vehicles.map(v => ({ value: v.registration, label: vehLabel(v.registration) })),
  ]), [vehicles, vehLabel, t]);

  const openAdd = () => { setModalError(''); setModal({ mode: 'add', draft: emptyFineDraft() }); };
  const openEdit = (f) => {
    setModalError('');
    setModal({
      mode: 'edit',
      id: f.id,
      draft: {
        driverName: f.driverName || '',
        vehicleReg: f.vehicleReg || '',
        date: f.date || format(new Date(), 'yyyy-MM-dd'),
        fineType: f.fineType || 'other',
        amountAed: f.amountAed ?? '',
        status: f.status === 'paid' ? 'paid' : 'unpaid',
        referenceNo: f.referenceNo || '',
        notes: f.notes || '',
      },
    });
  };

  const setDraft = (patch) => setModal(m => ({ ...m, draft: { ...m.draft, ...patch } }));

  const saveFine = async () => {
    if (!modal) return;
    const d = modal.draft;
    if (!d.driverName.trim()) { setModalError(t('Driver name is required.', 'اسم السائق مطلوب.')); return; }
    if (!d.date) { setModalError(t('Date is required.', 'التاريخ مطلوب.')); return; }
    const amount = parseFloat(d.amountAed);
    if (isNaN(amount) || amount < 0) { setModalError(t('Enter a valid amount in AED.', 'أدخل مبلغاً صحيحاً بالدرهم.')); return; }

    setSaving(true);
    try {
      const payload = {
        driverName: d.driverName.trim(),
        vehicleReg: d.vehicleReg || '',
        date: d.date,
        fineType: d.fineType,
        amountAed: amount,
        status: d.status === 'paid' ? 'paid' : 'unpaid',
        referenceNo: d.referenceNo.trim(),
        notes: d.notes.trim(),
      };
      if (modal.mode === 'add') {
        await addDoc(collection(db, 'fleet_fines'), {
          ...payload,
          createdAt: serverTimestamp(),
          createdBy: auth.currentUser?.email || '',
        });
      } else {
        await updateDoc(doc(db, 'fleet_fines', modal.id), payload);
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

  const togglePaid = async (f) => {
    setBusyId(f.id);
    try {
      await updateDoc(doc(db, 'fleet_fines', f.id), { status: f.status === 'paid' ? 'unpaid' : 'paid' });
      setFines(prev => prev.map(x => x.id === f.id ? { ...x, status: f.status === 'paid' ? 'unpaid' : 'paid' } : x));
    } catch (err) {
      console.error('Fine status toggle error:', err);
    } finally {
      setBusyId(null);
    }
  };

  const deleteFine = async () => {
    if (!confirmDelete) return;
    setBusyId(confirmDelete.id);
    try {
      await deleteDoc(doc(db, 'fleet_fines', confirmDelete.id));
      setFines(prev => prev.filter(x => x.id !== confirmDelete.id));
      setConfirmDelete(null);
    } catch (err) {
      console.error('Fine delete error:', err);
    } finally {
      setBusyId(null);
    }
  };

  const exportExcel = () => {
    if (filtered.length === 0) return;
    const typeAr = (id) => { const f = FINE_TYPES.find(x => x.id === id); return f ? f.ar : (id || ''); };
    const rows = filtered.map(f => ({
      'التاريخ': f.date || '',
      'اسم السائق': f.driverName || '',
      'المركبة': f.vehicleReg ? vehLabel(f.vehicleReg) : '',
      'رقم اللوحة': f.vehicleReg || '',
      'نوع المخالفة': typeAr(f.fineType),
      'المبلغ (د.إ)': parseFloat(f.amountAed) || 0,
      'الحالة': f.status === 'paid' ? 'مدفوعة' : 'غير مدفوعة',
      'الرقم المرجعي': f.referenceNo || '',
      'ملاحظات': f.notes || '',
    }));
    rows.push({
      'التاريخ': '', 'اسم السائق': 'الإجمالي', 'المركبة': '', 'رقم اللوحة': '',
      'نوع المخالفة': `${totals.count} مخالفة`, 'المبلغ (د.إ)': totals.totalAed,
      'الحالة': `غير مدفوع: ${totals.unpaidAed}`, 'الرقم المرجعي': '', 'ملاحظات': '',
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 12 }, { wch: 22 }, { wch: 24 }, { wch: 14 }, { wch: 18 }, { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 32 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'المخالفات المرورية');
    XLSX.writeFile(wb, `fleet-fines-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
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
          <div className="stat-header"><h3>{t('Unpaid Fines', 'مخالفات غير مدفوعة')}</h3><AlertCircle size={16} className="text-risk" /></div>
          <div className="stat-value text-risk">{totals.unpaidCount.toLocaleString(locale)}</div>
          <p className="stat-label">{t('Awaiting settlement', 'بانتظار السداد')}</p>
        </div>
        <div className="stat-card glass-panel">
          <div className="stat-header"><h3>{t('Unpaid Amount', 'المبلغ غير المدفوع')}</h3><ShieldAlert size={16} className="text-caution" /></div>
          <div className="stat-value text-caution">{totals.unpaidAed.toLocaleString(locale)}<span className="ffn-unit">{t('AED', 'د.إ')}</span></div>
          <p className="stat-label">{t('Outstanding balance', 'الرصيد المستحق')}</p>
        </div>
      </div>

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
            <div className="ffn-filter">
              <label>{t('Status', 'الحالة')}</label>
              <CustomSelect
                value={filterStatus}
                onChange={setFilterStatus}
                options={[
                  { value: 'all', label: t('All statuses', 'كل الحالات') },
                  { value: 'unpaid', label: t('Unpaid', 'غير مدفوعة') },
                  { value: 'paid', label: t('Paid', 'مدفوعة') },
                ]}
                ariaLabel={t('Filter by status', 'تصفية حسب الحالة')}
              />
            </div>
            <div className="ffn-filter">
              <label>{t('Month', 'الشهر')}</label>
              <CustomSelect value={filterMonth} onChange={setFilterMonth} options={monthOptions} ariaLabel={t('Filter by month', 'تصفية حسب الشهر')} />
            </div>
            <button className="ffn-btn ffn-btn-ghost" onClick={exportExcel} disabled={filtered.length === 0}>
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
                <th>{t('Violation', 'نوع المخالفة')}</th>
                <th>{t('Amount (AED)', 'المبلغ (د.إ)')}</th>
                <th>{t('Status', 'الحالة')}</th>
                <th>{t('Reference', 'الرقم المرجعي')}</th>
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
                  <td style={{ fontWeight: 800, color: 'var(--theme-text-main)' }}>{f.driverName}</td>
                  <td>
                    {f.vehicleReg ? (
                      <>
                        <span style={{ fontWeight: 600 }}>{vehLabel(f.vehicleReg)}</span>
                        <div style={{ fontSize: '0.7rem', color: 'var(--theme-text-muted)' }}>{f.vehicleReg}</div>
                      </>
                    ) : <span className="text-muted">—</span>}
                  </td>
                  <td style={{ fontWeight: 600 }}>{fineTypeLabel(f.fineType, t)}</td>
                  <td style={{ fontWeight: 800, color: 'var(--theme-accent)' }}>{(parseFloat(f.amountAed) || 0).toLocaleString(locale)}</td>
                  <td>
                    <span className={`status-badge ${f.status === 'paid' ? 'active' : 'risk'}`}>
                      {f.status === 'paid' ? t('Paid', 'مدفوعة') : t('Unpaid', 'غير مدفوعة')}
                    </span>
                  </td>
                  <td className="text-muted" style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{f.referenceNo || '—'}</td>
                  {canEdit && (
                    <td>
                      <div className="ffn-row-actions">
                        <button
                          className={`ffn-icon-btn ${f.status === 'paid' ? 'ffn-warn' : 'ffn-safe'}`}
                          title={f.status === 'paid' ? t('Mark unpaid', 'تحويل إلى غير مدفوعة') : t('Mark paid', 'تحويل إلى مدفوعة')}
                          disabled={busyId === f.id}
                          onClick={() => togglePaid(f)}
                        >
                          {f.status === 'paid' ? <RotateCcw size={14} /> : <Check size={14} />}
                        </button>
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
                  <label>{t('Driver name *', 'اسم السائق *')}</label>
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
                  <label>{t('Status', 'الحالة')}</label>
                  <CustomSelect
                    value={modal.draft.status}
                    onChange={v => setDraft({ status: v })}
                    options={[
                      { value: 'unpaid', label: t('Unpaid', 'غير مدفوعة') },
                      { value: 'paid', label: t('Paid', 'مدفوعة') },
                    ]}
                    ariaLabel={t('Status', 'الحالة')}
                  />
                </div>
                <div className="ffn-field">
                  <label>{t('Reference no. (optional)', 'الرقم المرجعي (اختياري)')}</label>
                  <input type="text" value={modal.draft.referenceNo} onChange={e => setDraft({ referenceNo: e.target.value })} placeholder={t('Gov. fine reference', 'مرجع المخالفة الحكومي')} />
                </div>
                <div className="ffn-field ffn-span2">
                  <label>{t('Notes', 'ملاحظات')}</label>
                  <textarea rows={2} value={modal.draft.notes} onChange={e => setDraft({ notes: e.target.value })} />
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
