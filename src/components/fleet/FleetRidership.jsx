/**
 * Bus Ridership — ركاب الحافلات
 *
 * Staff manually record how many players rode the bus for each training
 * class, to evaluate the transport service over time.
 *
 *   fleet_ridership_classes → editable class schedule (full CRUD)
 *   fleet_ridership_counts  → one doc per class per date (`${classId}_${date}`)
 *
 * Three internal tabs: daily entry, insights (30-day / month stats +
 * Excel & PDF exports), and schedule management.
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Users, ClipboardList, BarChart3, CalendarCog, Plus, Pencil, Trash2, X,
  Check, Download, FileText, TrendingUp, TrendingDown, Minus, Crown, Moon,
  Gauge, Loader2, Bus,
} from 'lucide-react';
import {
  collection, onSnapshot, getDocs, query, where, doc, setDoc, addDoc,
  updateDoc, deleteDoc, serverTimestamp,
} from 'firebase/firestore';
import { format } from 'date-fns';
import { db, auth } from '../../firebase';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import CustomSelect from '../CustomSelect';
import { useFleetScope } from './FleetScopeContext';
import { buildBusRows, ensureRidershipSeed } from './ridershipSeed';
import { exportRidershipExcel, exportRidershipPdf } from './ridershipReport';
import { buildRidershipStats } from './ridershipAnalytics';
import { recordActivity } from '../../services/activityLog';
import './FleetModule.css';
import './FleetRidership.css';
import './FleetScopeViews.css';

/* ── Constants ─────────────────────────────────────────────────── */

// Weekday ids follow JS Date#getDay(): 0 = Sunday … 6 = Saturday.
const WEEKDAYS = [
  { id: 0, en: 'Sun', ar: 'الأحد' },
  { id: 1, en: 'Mon', ar: 'الاثنين' },
  { id: 2, en: 'Tue', ar: 'الثلاثاء' },
  { id: 3, en: 'Wed', ar: 'الأربعاء' },
  { id: 4, en: 'Thu', ar: 'الخميس' },
  { id: 5, en: 'Fri', ar: 'الجمعة' },
  { id: 6, en: 'Sat', ar: 'السبت' },
];

const todayStr = () => format(new Date(), 'yyyy-MM-dd');

const clsName = (cls, lang) =>
  (lang === 'ar' ? (cls?.nameAr || cls?.nameEn) : (cls?.nameEn || cls?.nameAr)) || '—';

const addDays = (dateStr, n) => {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + n);
  return format(d, 'yyyy-MM-dd');
};

/** Current + previous period date ranges (inclusive yyyy-mm-dd strings). */
function periodRange(period) {
  if (period === 'last30') {
    const end = todayStr();
    const start = addDays(end, -29);
    return { start, end, prevStart: addDays(start, -30), prevEnd: addDays(start, -1) };
  }
  // 'YYYY-MM'
  const [y, m] = period.split('-').map(Number);
  const start = `${period}-01`;
  const end = format(new Date(y, m, 0), 'yyyy-MM-dd'); // last day of month
  const prevEndDate = new Date(y, m - 1, 0);            // last day of previous month
  const prevStart = format(new Date(prevEndDate.getFullYear(), prevEndDate.getMonth(), 1), 'yyyy-MM-dd');
  const prevEnd = format(prevEndDate, 'yyyy-MM-dd');
  return { start, end, prevStart, prevEnd };
}

async function fetchCounts(start, end) {
  const snap = await getDocs(query(
    collection(db, 'fleet_ridership_counts'),
    where('date', '>=', start),
    where('date', '<=', end),
  ));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/* ══════════════════════════════════════════════════════════════════
   Root component
   ══════════════════════════════════════════════════════════════════ */

export default function FleetRidership({ canEdit }) {
  const { t } = useLanguage();
  const { metaOf } = useFleetScope();
  const [tab, setTab] = useState('entry');
  const [classes, setClasses] = useState([]);
  const [classesReady, setClassesReady] = useState(false);
  const [importState, setImportState] = useState(canEdit ? 'importing' : 'idle');

  useEffect(() => {
    if (!canEdit) return undefined;
    let active = true;
    ensureRidershipSeed(db, auth.currentUser?.email || '')
      .then((imported) => { if (active) setImportState(imported ? 'imported' : 'ready'); })
      .catch((err) => {
        console.error('Ridership seed import error:', err);
        if (active) setImportState('error');
      });
    return () => { active = false; };
  }, [canEdit]);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'fleet_ridership_classes'),
      (snap) => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        list.sort((a, b) =>
          ((a.sortOrder ?? 999) - (b.sortOrder ?? 999)) ||
          String(a.nameEn || '').localeCompare(String(b.nameEn || ''))
        );
        setClasses(list);
        setClassesReady(true);
      },
      (err) => { console.error('Ridership classes subscription error:', err); setClassesReady(true); }
    );
    return unsub;
  }, []);

  if (!classesReady) {
    return (
      <div className="view-loading">
        <div className="app-loader"><span /><span /><span /><span /><span /></div>
      </div>
    );
  }

  return (
    <div className="frd-view">
      <div className="fsv-scope-note"><Bus size={14} /><span>{t('Bus Service only — other club vehicles are intentionally excluded.', 'خدمة الحافلات فقط — المركبات الأخرى للنادي مستبعدة عمداً.')}</span></div>
      {importState === 'importing' && <div className="frd-import-note"><Loader2 size={14} className="frd-spin" /> {t('Importing the official Fujairah bus tables…', 'جارٍ استيراد جداول حافلات الفجيرة الرسمية…')}</div>}
      {importState === 'imported' && <div className="frd-import-note frd-import-ok"><Check size={14} /> {t('22 dated Fujairah tables imported.', 'تم استيراد 22 جدولاً مؤرخاً لفرع الفجيرة.')}</div>}
      {importState === 'error' && <div className="frd-import-note frd-import-error">{t('The historical import could not be completed. Reload while signed in with edit access.', 'تعذر إكمال استيراد السجل. أعد التحميل بحساب يملك صلاحية التعديل.')}</div>}
      <div className="frd-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'entry'} className={`frd-tab${tab === 'entry' ? ' active' : ''}`} onClick={() => setTab('entry')}>
          <ClipboardList size={14} /> {t('Daily Entry', 'التسجيل اليومي')}
        </button>
        <button role="tab" aria-selected={tab === 'insights'} className={`frd-tab${tab === 'insights' ? ' active' : ''}`} onClick={() => setTab('insights')}>
          <BarChart3 size={14} /> {t('Insights', 'الإحصائيات')}
        </button>
        <button role="tab" aria-selected={tab === 'classes'} className={`frd-tab${tab === 'classes' ? ' active' : ''}`} onClick={() => setTab('classes')}>
          <CalendarCog size={14} /> {t('Class Schedule', 'جدول الحصص')}
        </button>
      </div>

      {tab === 'entry' && <EntryTab classes={classes} canEdit={canEdit} metaOf={metaOf} />}
      {tab === 'insights' && <InsightsTab classes={classes} />}
      {tab === 'classes' && <ClassesTab classes={classes} canEdit={canEdit} />}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   TAB 1 — Daily entry
   ══════════════════════════════════════════════════════════════════ */

function EntryTab({ classes, canEdit, metaOf }) {
  const { t, locale, lang } = useLanguage();
  const { user, userProfile } = useAuth();
  const [date, setDate] = useState(todayStr());
  const [drafts, setDrafts] = useState({});
  const [busNotes, setBusNotes] = useState({});
  const [saved, setSaved] = useState({});
  const [dirtyRows, setDirtyRows] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [flashId, setFlashId] = useState(null);

  const branchTables = useMemo(() => buildBusRows(classes, metaOf), [classes, metaOf]);
  const weekday = useMemo(() => new Date(`${date}T00:00:00`).getDay(), [date]);

  const loadDay = useCallback(async (d) => {
    setLoading(true);
    try {
      const entries = await fetchCounts(d, d);
      const nextDrafts = {};
      const nextSaved = {};
      const nextNotes = {};
      for (const e of entries) {
        nextDrafts[e.classId] = String(e.riders ?? '');
        nextSaved[e.classId] = true;
        const registration = e.classSnapshot?.registration;
        if (registration && e.notes && !nextNotes[registration]) nextNotes[registration] = e.notes;
      }
      setDrafts(nextDrafts);
      setSaved(nextSaved);
      setBusNotes(nextNotes);
      setDirtyRows({});
    } catch (err) {
      console.error('Ridership counts fetch error:', err);
      setDrafts({});
      setSaved({});
      setBusNotes({});
      setDirtyRows({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDay(date); }, [date, loadDay]);

  const setDraft = (registration, classId, value) => {
    setDrafts(prev => ({ ...prev, [classId]: value }));
    setSaved(prev => ({ ...prev, [classId]: false }));
    setDirtyRows(prev => ({ ...prev, [registration]: true }));
  };

  const setNote = (registration, value) => {
    setBusNotes(prev => ({ ...prev, [registration]: value }));
    setDirtyRows(prev => ({ ...prev, [registration]: true }));
  };

  const saveBus = async (branch, bus) => {
    const actor = {
      uid: user?.uid || auth.currentUser?.uid || '',
      email: user?.email || auth.currentUser?.email || '',
      name: userProfile?.displayName || user?.displayName || user?.email || auth.currentUser?.email || '',
    };
    const numericSessions = bus.sessions.filter((session) => {
      const riders = Number(drafts[session.id]);
      return drafts[session.id] !== '' && Number.isInteger(riders) && riders >= 0;
    });
    if (numericSessions.length === 0) return;
    setSavingId(bus.registration);
    try {
      await Promise.all(bus.sessions.map(async (session) => {
        const raw = drafts[session.id];
        const riders = Number(raw);
        const countRef = doc(db, 'fleet_ridership_counts', `${session.id}_${date}`);
        if (raw === '' || !Number.isInteger(riders) || riders < 0) {
          if (saved[session.id]) await deleteDoc(countRef);
          return;
        }
        await setDoc(countRef, {
          classId: session.id,
          date,
          riders,
          notes: (busNotes[bus.registration] || '').trim(),
          classSnapshot: {
            nameEn: `Bus ${bus.busNumber}`,
            nameAr: `الحافلة ${bus.busNumber}`,
            registration: bus.registration,
            busNumber: bus.busNumber,
            driverEn: bus.driverEn || '',
            driverAr: bus.driverAr || '',
            areaAr: bus.areaAr || '',
            branch: branch.nameEn,
            branchId: branch.id,
            sessionIndex: session.sessionIndex,
            time: session.time || '',
            capacity: Number(session.capacity) || null,
          },
          recordedBy: actor.email,
          recordedByUid: actor.uid,
          recordedByEmail: actor.email,
          recordedByName: actor.name,
          updatedAt: serverTimestamp(),
        });
      }));
      setSaved(prev => {
        const next = { ...prev };
        bus.sessions.forEach((session) => { next[session.id] = drafts[session.id] !== ''; });
        return next;
      });
      setDirtyRows(prev => ({ ...prev, [bus.registration]: false }));
      await recordActivity({
        module: 'fleet', submodule: 'ridership', action: 'ridership_saved',
        titleEn: `Ridership saved · ${bus.registration}`,
        titleAr: `تم حفظ الركاب · ${bus.registration}`,
        detailEn: `${date} · ${numericSessions.reduce((sum, session) => sum + Number(drafts[session.id] || 0), 0)} riders across ${numericSessions.length} sessions`,
        detailAr: `${date} · ${numericSessions.reduce((sum, session) => sum + Number(drafts[session.id] || 0), 0)} راكب عبر ${numericSessions.length} حصص`,
        recordId: `${bus.registration}_${date}`, path: '/fleet/ridership',
        actor,
      });
      setFlashId(bus.registration);
      setTimeout(() => setFlashId(f => (f === bus.registration ? null : f)), 1600);
    } catch (err) {
      console.error('Ridership bus-row save error:', err);
    } finally {
      setSavingId(null);
    }
  };

  const allBuses = branchTables.flatMap(branch => branch.buses);
  const scheduledCount = allBuses.length;
  const recordedCount = allBuses.filter(bus => bus.sessions.some(session => saved[session.id])).length;

  return (
    <div>
      <div className="glass-panel frd-entry-head">
        <div className="section-header" style={{ marginBottom: 0 }}>
          <h2>{t('Record Bus Riders', 'تسجيل ركاب الحافلة')}</h2>
          <p>{t('One row per bus, with each trip recorded separately', 'صف مستقل لكل حافلة مع تسجيل كل حصة بشكل منفصل')}</p>
        </div>
        <div className="frd-entry-controls">
          <div className="frd-field">
            <label>{t('Date', 'التاريخ')}</label>
            <input type="date" value={date} max={todayStr()} onChange={e => e.target.value && setDate(e.target.value)} />
          </div>
          <div className="frd-day-chip">
            <span className="frd-day-name">{t(WEEKDAYS[weekday].en, WEEKDAYS[weekday].ar)}</span>
            <span className="frd-day-meta">
              {t(`${scheduledCount} scheduled · ${recordedCount} recorded`, `${scheduledCount} مجدولة · ${recordedCount} مسجلة`)}
            </span>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="view-loading"><div className="app-loader"><span /><span /><span /><span /><span /></div></div>
      ) : (
        <div className="frd-branch-stack">
          {branchTables.map(branch => (
            <section key={branch.id} className="glass-panel frd-branch-card">
              <div className="frd-branch-head">
                <div>
                  <span className="frd-branch-kicker">{t('Branch table', 'جدول الفرع')}</span>
                  <h3>{t(branch.nameEn, branch.nameAr)}</h3>
                </div>
                <span className="frd-branch-count"><Bus size={14} /> {branch.buses.length.toLocaleString(locale)} {t('buses', 'حافلات')}</span>
              </div>
              <div className="frd-bus-table-wrap">
                <table className="frd-bus-table">
                  <thead>
                    <tr>
                      <th>{t('Bus', 'الحافلة')}</th>
                      <th>{t('Driver & route', 'السائق والمنطقة')}</th>
                      {[1, 2, 3, 4].map(i => <th key={i}>{t(`Session ${i}`, `الحصة ${i}`)}</th>)}
                      <th>{t('Total', 'الإجمالي')}</th>
                      <th>{t('Notes', 'ملاحظات')}</th>
                      {canEdit && <th aria-label={t('Actions', 'الإجراءات')} />}
                    </tr>
                  </thead>
                  <tbody>
                    {branch.buses.map(bus => {
                      const sessionSlots = [1, 2, 3, 4].map(index =>
                        bus.sessions.find(session => session.sessionIndex === index) || null
                      );
                      const values = sessionSlots.map(session => session ? (drafts[session.id] ?? '') : '');
                      const total = values.reduce((sum, value) => sum + (value === '' ? 0 : Number(value) || 0), 0);
                      const hasValue = values.some(value => value !== '' && Number.isInteger(Number(value)) && Number(value) >= 0);
                      const isRecorded = bus.sessions.some(session => saved[session.id]);
                      const isDirty = !!dirtyRows[bus.registration];
                      return (
                        <tr key={bus.registration} className={flashId === bus.registration ? 'frd-flash' : ''}>
                          <td>
                            <div className="frd-bus-identity">
                              <span className="frd-bus-number">{bus.busNumber}</span>
                              <span className="frd-bus-reg" dir="ltr">{bus.registration}</span>
                              {isRecorded && !isDirty && <Check size={13} className="frd-recorded-check" />}
                            </div>
                          </td>
                          <td>
                            <strong>{lang === 'ar' ? (bus.driverAr || bus.driverEn) : (bus.driverEn || bus.driverAr)}</strong>
                            {bus.areaAr && <span className="frd-route" dir="rtl">{bus.areaAr}</span>}
                          </td>
                          {sessionSlots.map((session, index) => session ? (
                            <td key={session.id} className="frd-session-cell">
                              <input
                                type="number"
                                min="0"
                                step="1"
                                inputMode="numeric"
                                aria-label={`${bus.registration} ${t(`session ${index + 1}`, `الحصة ${index + 1}`)}`}
                                value={values[index]}
                                disabled={!canEdit}
                                onChange={e => setDraft(bus.registration, session.id, e.target.value)}
                                placeholder="—"
                              />
                            </td>
                          ) : (
                            <td key={`not-applicable-${index + 1}`} className="frd-session-cell frd-session-na" aria-label={t('Not applicable', 'غير مطبق')}>—</td>
                          ))}
                          <td><span className="frd-row-total">{total.toLocaleString(locale)}</span></td>
                          <td>
                            <input
                              className="frd-table-note"
                              type="text"
                              value={busNotes[bus.registration] || ''}
                              disabled={!canEdit}
                              onChange={e => setNote(bus.registration, e.target.value)}
                              placeholder={t('Optional', 'اختياري')}
                            />
                          </td>
                          {canEdit && (
                            <td>
                              <button
                                className="frd-btn frd-btn-primary frd-row-save"
                                disabled={!hasValue || savingId === bus.registration || (!isDirty && isRecorded)}
                                onClick={() => saveBus(branch, bus)}
                              >
                                {savingId === bus.registration
                                  ? <Loader2 size={14} className="frd-spin" />
                                  : isRecorded && !isDirty ? <Check size={14} /> : null}
                                {isRecorded && !isDirty ? t('Saved', 'محفوظ') : t('Save', 'حفظ')}
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   TAB 2 — Insights + exports
   ══════════════════════════════════════════════════════════════════ */

function InsightsTab({ classes }) {
  const { t, locale, lang } = useLanguage();
  const [period, setPeriod] = useState('last30');
  const [entries, setEntries] = useState([]);
  const [prevEntries, setPrevEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState('');

  const monthFmt = useMemo(() => new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }), [locale]);

  const periodOptions = useMemo(() => {
    const opts = [{ value: 'last30', label: t('Last 30 days', 'آخر 30 يوماً') }];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      opts.push({ value: format(d, 'yyyy-MM'), label: monthFmt.format(d) });
    }
    return opts;
  }, [monthFmt, t]);

  const periodLabel = period === 'last30'
    ? t('Last 30 days', 'آخر 30 يوماً')
    : monthFmt.format(new Date(`${period}-01T00:00:00`));

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const { start, end, prevStart, prevEnd } = periodRange(period);
        const [cur, prev] = await Promise.all([fetchCounts(start, end), fetchCounts(prevStart, prevEnd)]);
        if (!alive) return;
        setEntries(cur.sort((a, b) => (b.date || '').localeCompare(a.date || '')));
        setPrevEntries(prev);
      } catch (err) {
        console.error('Ridership stats fetch error:', err);
        if (alive) { setEntries([]); setPrevEntries([]); }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [period]);

  const stats = useMemo(() => buildRidershipStats(entries, classes), [entries, classes]);
  const prevStats = useMemo(() => buildRidershipStats(prevEntries, classes), [prevEntries, classes]);

  const trendPct = prevStats.totalRiders > 0
    ? ((stats.totalRiders - prevStats.totalRiders) / prevStats.totalRiders) * 100
    : null;

  const maxAvg = stats.perClass.length > 0 ? Math.max(...stats.perClass.map(p => p.avg)) : 0;
  const num = (v, digits = 1) => Number(v.toFixed(digits)).toLocaleString(locale);

  const nameOf = useCallback(
    (p) => p?.cls ? clsName(p.cls, lang) : t('Deleted class', 'حصة محذوفة'),
    [lang, t]
  );

  const runExport = async (type) => {
    if (!entries.length || exporting) return;
    setExporting(type);
    const payload = { periodKey: period, periodLabel, entries, stats, previousStats: prevStats, classes, locale };
    try {
      if (type === 'pdf') await exportRidershipPdf(payload);
      else await exportRidershipExcel(payload);
    } catch (exportError) {
      console.error(`Ridership ${type} export failed:`, exportError);
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

  const TrendIcon = trendPct == null ? Minus : trendPct >= 0 ? TrendingUp : TrendingDown;

  return (
    <div>
      <div className="glass-panel frd-entry-head">
        <div className="section-header" style={{ marginBottom: 0 }}>
          <h2>{t('Ridership Insights', 'إحصائيات الركاب')}</h2>
          <p>{t('Service performance for the selected period', 'أداء خدمة النقل خلال الفترة المحددة')}</p>
        </div>
        <div className="frd-entry-controls">
          <div className="frd-field" style={{ minWidth: 180 }}>
            <label>{t('Period', 'الفترة')}</label>
            <CustomSelect value={period} onChange={setPeriod} options={periodOptions} ariaLabel={t('Period', 'الفترة')} />
          </div>
          <button className="frd-btn frd-btn-ghost" onClick={() => runExport('excel')} disabled={entries.length === 0 || Boolean(exporting)}>
            <Download size={14} /> {exporting === 'excel' ? t('Preparing…', 'جارٍ التجهيز…') : t('Excel', 'إكسل')}
          </button>
          <button className="frd-btn frd-btn-primary" onClick={() => runExport('pdf')} disabled={entries.length === 0 || Boolean(exporting)}>
            <FileText size={14} /> {exporting === 'pdf' ? t('Preparing…', 'جارٍ التجهيز…') : t('PDF Report', 'تقرير PDF')}
          </button>
        </div>
      </div>

      <div className="stats-bento">
        <div className="stat-card glass-panel">
          <div className="stat-header"><h3>{t('Total Riders', 'إجمالي الركاب')}</h3><Users size={16} className="text-accent" /></div>
          <div className="stat-value text-accent">{stats.totalRiders.toLocaleString(locale)}</div>
          <p className="stat-label">{t(`Across ${stats.sessions} recorded sessions`, `عبر ${stats.sessions} جلسة مسجلة`)}</p>
        </div>
        <div className="stat-card glass-panel">
          <div className="stat-header"><h3>{t('Avg / Session', 'المتوسط لكل جلسة')}</h3><Gauge size={16} /></div>
          <div className="stat-value">{num(stats.avgPerSession)}</div>
          <p className="stat-label">
            {stats.utilization != null
              ? t(`Utilization ${Math.round(stats.utilization)}% where capacity is set`, `نسبة الاستخدام ${Math.round(stats.utilization)}٪ حيث حُددت السعة`)
              : t('No class capacities set', 'لم تُحدد سعة للحصص')}
          </p>
        </div>
        <div className="stat-card glass-panel">
          <div className="stat-header"><h3>{t('Busiest Class', 'الأكثر ازدحاماً')}</h3><Crown size={16} className="text-safe" /></div>
          <div className="stat-value frd-stat-name">{stats.busiest ? nameOf(stats.busiest) : '—'}</div>
          <p className="stat-label">{stats.busiest ? t(`Avg ${num(stats.busiest.avg)} riders`, `متوسط ${num(stats.busiest.avg)} راكباً`) : t('No data yet', 'لا توجد بيانات بعد')}</p>
        </div>
        <div className="stat-card glass-panel">
          <div className="stat-header"><h3>{t('Trend', 'الاتجاه')}</h3><TrendIcon size={16} className={trendPct == null ? 'text-muted' : trendPct >= 0 ? 'text-safe' : 'text-risk'} /></div>
          <div className={`stat-value ${trendPct == null ? '' : trendPct >= 0 ? 'text-safe' : 'text-risk'}`} dir="ltr">
            {trendPct == null ? '—' : `${trendPct >= 0 ? '+' : ''}${num(trendPct, 0)}%`}
          </div>
          <p className="stat-label">
            {trendPct == null
              ? t('No previous period data', 'لا توجد بيانات للفترة السابقة')
              : t('Total riders vs previous period', 'إجمالي الركاب مقارنة بالفترة السابقة')}
          </p>
        </div>
      </div>

      {stats.quietest && stats.perClass.length > 1 && (
        <div className="glass-panel frd-quiet-note">
          <Moon size={15} />
          <span>
            {t('Quietest class:', 'الحصة الأكثر هدوءاً:')}{' '}
            <strong>{nameOf(stats.quietest)}</strong>{' '}
            ({t(`avg ${num(stats.quietest.avg)} riders over ${stats.quietest.sessions} sessions`, `متوسط ${num(stats.quietest.avg)} راكباً خلال ${stats.quietest.sessions} جلسة`)})
          </span>
        </div>
      )}

      {/* Per-class bar comparison */}
      <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '22px 24px', borderBottom: '1px solid var(--theme-border-light)' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>{t('Average Riders by Class', 'متوسط الركاب حسب الحصة')}</h3>
          <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--theme-text-muted)' }}>{periodLabel}</p>
        </div>
        {stats.perClass.length === 0 ? (
          <div className="frd-empty" style={{ border: 'none' }}>
            <BarChart3 size={30} strokeWidth={1.2} />
            <p>{t('No rider counts recorded in this period.', 'لا توجد أعداد ركاب مسجلة في هذه الفترة.')}</p>
          </div>
        ) : (
          <div className="frd-bars">
            {stats.perClass.map(p => (
              <div key={p.classId} className="frd-bar-row">
                <div className="frd-bar-label">
                  <span className="frd-bar-name">{nameOf(p)}</span>
                  <span className="frd-bar-sub">
                    {[p.cls?.sport, p.cls?.branch].filter(Boolean).join(' · ')}
                    {' — '}{t(`${p.sessions} sessions`, `${p.sessions} جلسة`)}
                  </span>
                </div>
                <div className="frd-bar-track">
                  <div className="frd-bar-fill" style={{ width: `${maxAvg > 0 ? Math.max(4, (p.avg / maxAvg) * 100) : 0}%` }} />
                </div>
                <div className="frd-bar-value">
                  {num(p.avg)}
                  {p.utilization != null && <span className="frd-bar-util" dir="ltr">{Math.round(p.utilization)}%</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   TAB 3 — Class schedule CRUD
   ══════════════════════════════════════════════════════════════════ */

const emptyClassDraft = (nextOrder) => ({
  nameEn: '', nameAr: '', sport: '', branch: '',
  days: [], time: '', capacity: '', active: true, sortOrder: nextOrder,
});

function ClassesTab({ classes, canEdit }) {
  const { t, locale, lang } = useLanguage();
  const [modal, setModal] = useState(null); // { mode, id?, draft }
  const [modalError, setModalError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const openAdd = () => {
    setModalError('');
    const nextOrder = classes.length > 0 ? Math.max(...classes.map(c => Number(c.sortOrder) || 0)) + 1 : 1;
    setModal({ mode: 'add', draft: emptyClassDraft(nextOrder) });
  };

  const openEdit = (cls) => {
    setModalError('');
    setModal({
      mode: 'edit',
      id: cls.id,
      draft: {
        nameEn: cls.nameEn || '', nameAr: cls.nameAr || '',
        sport: cls.sport || '', branch: cls.branch || '',
        days: Array.isArray(cls.days) ? [...cls.days] : [],
        time: cls.time || '',
        capacity: cls.capacity ?? '',
        active: cls.active !== false,
        sortOrder: cls.sortOrder ?? 0,
      },
    });
  };

  const setDraft = (patch) => setModal(m => ({ ...m, draft: { ...m.draft, ...patch } }));

  const toggleDay = (id) => {
    setModal(m => {
      const days = m.draft.days.includes(id)
        ? m.draft.days.filter(d => d !== id)
        : [...m.draft.days, id].sort((a, b) => a - b);
      return { ...m, draft: { ...m.draft, days } };
    });
  };

  const saveClass = async () => {
    if (!modal) return;
    const d = modal.draft;
    if (!d.nameEn.trim() && !d.nameAr.trim()) {
      setModalError(t('Enter a class name (English or Arabic).', 'أدخل اسم الحصة (بالإنجليزية أو العربية).'));
      return;
    }
    const capacity = d.capacity === '' ? null : parseInt(d.capacity, 10);
    if (capacity != null && (isNaN(capacity) || capacity < 0)) {
      setModalError(t('Capacity must be a positive number.', 'يجب أن تكون السعة رقماً موجباً.'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        nameEn: d.nameEn.trim(),
        nameAr: d.nameAr.trim(),
        sport: d.sport.trim(),
        branch: d.branch.trim(),
        days: d.days,
        time: d.time,
        capacity: capacity,
        active: !!d.active,
        sortOrder: parseInt(d.sortOrder, 10) || 0,
      };
      let recordId = modal.id;
      if (modal.mode === 'add') {
        const created = await addDoc(collection(db, 'fleet_ridership_classes'), { ...payload, createdAt: serverTimestamp() });
        recordId = created.id;
      } else {
        await updateDoc(doc(db, 'fleet_ridership_classes', modal.id), payload);
      }
      await recordActivity({
        module: 'fleet', submodule: 'ridership', action: modal.mode === 'add' ? 'ridership_class_created' : 'ridership_class_updated',
        titleEn: `${modal.mode === 'add' ? 'Class created' : 'Class updated'} · ${payload.nameEn || payload.nameAr}`,
        titleAr: `${modal.mode === 'add' ? 'تم إنشاء الحصة' : 'تم تحديث الحصة'} · ${payload.nameAr || payload.nameEn}`,
        detailEn: `${payload.branch || 'No branch'} · ${payload.time || 'No fixed time'}`,
        detailAr: `${payload.branch || 'بدون فرع'} · ${payload.time || 'بدون وقت ثابت'}`,
        recordId, path: '/fleet/ridership',
      });
      setModal(null);
    } catch (err) {
      console.error('Class save error:', err);
      setModalError(t('Failed to save. Please try again.', 'فشل الحفظ. يرجى المحاولة مرة أخرى.'));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (cls) => {
    setBusyId(cls.id);
    try {
      await updateDoc(doc(db, 'fleet_ridership_classes', cls.id), { active: cls.active === false });
      await recordActivity({
        module: 'fleet', submodule: 'ridership', action: 'ridership_class_status_changed',
        titleEn: `Class ${cls.active === false ? 'activated' : 'deactivated'} · ${cls.nameEn || cls.nameAr}`,
        titleAr: `تم ${cls.active === false ? 'تفعيل' : 'إيقاف'} الحصة · ${cls.nameAr || cls.nameEn}`,
        recordId: cls.id, path: '/fleet/ridership',
      });
    } catch (err) {
      console.error('Class toggle error:', err);
    } finally {
      setBusyId(null);
    }
  };

  const deleteClass = async () => {
    if (!confirmDelete) return;
    setBusyId(confirmDelete.id);
    try {
      await deleteDoc(doc(db, 'fleet_ridership_classes', confirmDelete.id));
      await recordActivity({
        module: 'fleet', submodule: 'ridership', action: 'ridership_class_deleted',
        titleEn: `Class deleted · ${confirmDelete.nameEn || confirmDelete.nameAr}`,
        titleAr: `تم حذف الحصة · ${confirmDelete.nameAr || confirmDelete.nameEn}`,
        recordId: confirmDelete.id, path: '/fleet/ridership',
      });
      setConfirmDelete(null);
    } catch (err) {
      console.error('Class delete error:', err);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="frd-toolbar">
          <div className="section-header" style={{ marginBottom: 0 }}>
            <h2>{t('Class Schedule', 'جدول الحصص')}</h2>
            <p>{t('Training classes served by the bus — fully editable, nothing is fixed', 'الحصص التدريبية المشمولة بخدمة الحافلة — قابلة للتعديل بالكامل')}</p>
          </div>
          {canEdit && (
            <button className="frd-btn frd-btn-primary" onClick={openAdd}>
              <Plus size={14} /> {t('Add Class', 'إضافة حصة')}
            </button>
          )}
        </div>

        <div className="fleet-table-container" style={{ borderRadius: 0, border: 'none' }}>
          <table className="fleet-table">
            <thead>
              <tr>
                <th>{t('Class', 'الحصة')}</th>
                <th>{t('Sport', 'الرياضة')}</th>
                <th>{t('Branch', 'الفرع')}</th>
                <th>{t('Days', 'الأيام')}</th>
                <th>{t('Time', 'الوقت')}</th>
                <th>{t('Capacity', 'السعة')}</th>
                <th>{t('Status', 'الحالة')}</th>
                {canEdit && <th>{t('Actions', 'إجراءات')}</th>}
              </tr>
            </thead>
            <tbody>
              {classes.length === 0 ? (
                <tr>
                  <td colSpan={canEdit ? 8 : 7} style={{ textAlign: 'center', padding: '40px', color: 'var(--theme-text-muted)' }}>
                    {t('No classes yet. Add the first training class to start tracking.', 'لا توجد حصص بعد. أضف أول حصة تدريبية لبدء التتبع.')}
                  </td>
                </tr>
              ) : classes.map(cls => (
                <tr key={cls.id} style={cls.active === false ? { opacity: 0.55 } : undefined}>
                  <td>
                    <span style={{ fontWeight: 800, color: 'var(--theme-text-main)' }}>{clsName(cls, lang)}</span>
                    <div style={{ fontSize: '0.7rem', color: 'var(--theme-text-muted)' }}>{lang === 'ar' ? cls.nameEn : cls.nameAr}</div>
                  </td>
                  <td>{cls.sport || '—'}</td>
                  <td>{cls.branch || '—'}</td>
                  <td>
                    <div className="frd-days-cell">
                      {Array.isArray(cls.days) && cls.days.length > 0
                        ? cls.days.map(d => {
                            const wd = WEEKDAYS.find(w => w.id === d);
                            return wd ? <span key={d} className="frd-chip">{t(wd.en, wd.ar)}</span> : null;
                          })
                        : <span className="text-muted">—</span>}
                    </div>
                  </td>
                  <td dir="ltr">{cls.time || '—'}</td>
                  <td>{Number(cls.capacity) > 0 ? Number(cls.capacity).toLocaleString(locale) : '—'}</td>
                  <td>
                    <span className={`status-badge ${cls.active !== false ? 'active' : 'maintenance'}`}>
                      {cls.active !== false ? t('Active', 'نشطة') : t('Inactive', 'موقوفة')}
                    </span>
                  </td>
                  {canEdit && (
                    <td>
                      <div className="frd-row-actions">
                        <button
                          className="frd-icon-btn"
                          title={cls.active !== false ? t('Deactivate', 'إيقاف') : t('Activate', 'تفعيل')}
                          disabled={busyId === cls.id}
                          onClick={() => toggleActive(cls)}
                        >
                          {cls.active !== false ? <X size={14} /> : <Check size={14} />}
                        </button>
                        <button className="frd-icon-btn" title={t('Edit', 'تعديل')} onClick={() => openEdit(cls)}>
                          <Pencil size={14} />
                        </button>
                        <button className="frd-icon-btn frd-danger" title={t('Delete', 'حذف')} disabled={busyId === cls.id} onClick={() => setConfirmDelete(cls)}>
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

      {/* Add / Edit class modal */}
      {modal && (
        <div className="frd-modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) setModal(null); }}>
          <div className="frd-modal glass-panel">
            <div className="frd-modal-head">
              <h3>{modal.mode === 'add' ? t('Add Class', 'إضافة حصة') : t('Edit Class', 'تعديل حصة')}</h3>
              <button className="frd-icon-btn" onClick={() => setModal(null)} disabled={saving}><X size={16} /></button>
            </div>
            <div className="frd-modal-body">
              <div className="frd-grid2">
                <div className="frd-field">
                  <label>{t('Name (English)', 'الاسم (إنجليزي)')}</label>
                  <input type="text" value={modal.draft.nameEn} onChange={e => setDraft({ nameEn: e.target.value })} placeholder="U14 Football" />
                </div>
                <div className="frd-field">
                  <label>{t('Name (Arabic)', 'الاسم (عربي)')}</label>
                  <input type="text" dir="rtl" value={modal.draft.nameAr} onChange={e => setDraft({ nameAr: e.target.value })} placeholder="كرة القدم تحت 14" />
                </div>
                <div className="frd-field">
                  <label>{t('Sport', 'الرياضة')}</label>
                  <input type="text" value={modal.draft.sport} onChange={e => setDraft({ sport: e.target.value })} placeholder={t('e.g. Jiu-Jitsu', 'مثال: جوجيتسو')} />
                </div>
                <div className="frd-field">
                  <label>{t('Branch', 'الفرع')}</label>
                  <input type="text" value={modal.draft.branch} onChange={e => setDraft({ branch: e.target.value })} placeholder={t('e.g. Main Branch', 'مثال: الفرع الرئيسي')} />
                </div>
                <div className="frd-field frd-span2">
                  <label>{t('Training days', 'أيام التدريب')}</label>
                  <div className="frd-day-picker">
                    {WEEKDAYS.map(wd => (
                      <button
                        key={wd.id}
                        type="button"
                        className={`frd-day-btn${modal.draft.days.includes(wd.id) ? ' active' : ''}`}
                        onClick={() => toggleDay(wd.id)}
                      >
                        {t(wd.en, wd.ar)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="frd-field frd-span2">
                  <label>{t('Time', 'الوقت')}</label>
                  <input type="text" value={modal.draft.time} onChange={e => setDraft({ time: e.target.value })} placeholder={t('e.g. 10:00 AM to 12:00 PM', 'مثال: 10:00 صباحاً إلى 12:00 ظهراً')} />
                </div>
                <div className="frd-field">
                  <label>{t('Bus capacity (optional)', 'سعة الحافلة (اختياري)')}</label>
                  <input type="number" min="0" step="1" value={modal.draft.capacity} onChange={e => setDraft({ capacity: e.target.value })} placeholder={t('Seats', 'المقاعد')} />
                </div>
                <div className="frd-field">
                  <label>{t('Sort order', 'ترتيب العرض')}</label>
                  <input type="number" step="1" value={modal.draft.sortOrder} onChange={e => setDraft({ sortOrder: e.target.value })} />
                </div>
                <div className="frd-field">
                  <label>{t('Status', 'الحالة')}</label>
                  <CustomSelect
                    value={modal.draft.active ? 'active' : 'inactive'}
                    onChange={v => setDraft({ active: v === 'active' })}
                    options={[
                      { value: 'active', label: t('Active', 'نشطة') },
                      { value: 'inactive', label: t('Inactive', 'موقوفة') },
                    ]}
                    ariaLabel={t('Status', 'الحالة')}
                  />
                </div>
              </div>
              {modalError && <p className="frd-error">{modalError}</p>}
            </div>
            <div className="frd-modal-foot">
              <button className="frd-btn frd-btn-ghost" onClick={() => setModal(null)} disabled={saving}>{t('Cancel', 'إلغاء')}</button>
              <button className="frd-btn frd-btn-primary" onClick={saveClass} disabled={saving}>
                {saving ? t('Saving…', 'جارٍ الحفظ…') : t('Save Class', 'حفظ الحصة')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="frd-modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirmDelete(null); }}>
          <div className="frd-modal frd-modal-sm glass-panel">
            <div className="frd-modal-head">
              <h3>{t('Delete class?', 'حذف الحصة؟')}</h3>
              <button className="frd-icon-btn" onClick={() => setConfirmDelete(null)}><X size={16} /></button>
            </div>
            <div className="frd-modal-body">
              <p className="frd-confirm-text">
                {t('This will permanently remove', 'سيؤدي هذا إلى الحذف النهائي للحصة')}{' '}
                <strong>{clsName(confirmDelete, lang)}</strong>.{' '}
                {t('Past rider counts are kept but will show as "Deleted class" in reports. To hide a class temporarily, deactivate it instead.', 'ستبقى أعداد الركاب السابقة لكنها ستظهر باسم "حصة محذوفة" في التقارير. لإخفاء الحصة مؤقتاً، أوقفها بدلاً من حذفها.')}
              </p>
            </div>
            <div className="frd-modal-foot">
              <button className="frd-btn frd-btn-ghost" onClick={() => setConfirmDelete(null)}>{t('Cancel', 'إلغاء')}</button>
              <button className="frd-btn frd-btn-danger" onClick={deleteClass} disabled={busyId === confirmDelete.id}>
                <Trash2 size={14} /> {t('Delete', 'حذف')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
