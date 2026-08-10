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
  Gauge, Loader2,
} from 'lucide-react';
import {
  collection, onSnapshot, getDocs, query, where, doc, setDoc, addDoc,
  updateDoc, deleteDoc, serverTimestamp,
} from 'firebase/firestore';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { db, auth } from '../../firebase';
import { useLanguage } from '../../contexts/LanguageContext';
import CustomSelect from '../CustomSelect';
import { CairoRegularBase64, CairoBoldBase64 } from '../../utils/cairoFont';
import { reshapeArabic } from '../../utils/arabicReshaper';
import './FleetModule.css';
import './FleetRidership.css';

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

/** Aggregate a set of count docs into per-class + overall stats. */
function buildStats(entries, classes) {
  const byClass = new Map();
  let totalRiders = 0;
  for (const e of entries) {
    const riders = Number(e.riders) || 0;
    totalRiders += riders;
    if (!byClass.has(e.classId)) byClass.set(e.classId, { sessions: 0, riders: 0 });
    const b = byClass.get(e.classId);
    b.sessions += 1;
    b.riders += riders;
  }
  const perClass = [...byClass.entries()].map(([classId, b]) => {
    const cls = classes.find(c => c.id === classId) || null;
    const capacity = cls && Number(cls.capacity) > 0 ? Number(cls.capacity) : null;
    return {
      classId,
      cls,
      sessions: b.sessions,
      riders: b.riders,
      avg: b.sessions > 0 ? b.riders / b.sessions : 0,
      capacity,
      utilization: capacity ? (b.riders / (capacity * b.sessions)) * 100 : null,
    };
  }).sort((a, b) => b.avg - a.avg);

  // Overall utilization across sessions of capacity-bearing classes only
  let capRiders = 0, capSeats = 0;
  for (const p of perClass) {
    if (p.capacity) { capRiders += p.riders; capSeats += p.capacity * p.sessions; }
  }

  return {
    perClass,
    totalRiders,
    sessions: entries.length,
    avgPerSession: entries.length > 0 ? totalRiders / entries.length : 0,
    busiest: perClass[0] || null,
    quietest: perClass.length > 0 ? perClass[perClass.length - 1] : null,
    utilization: capSeats > 0 ? (capRiders / capSeats) * 100 : null,
  };
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
  const [tab, setTab] = useState('entry');
  const [classes, setClasses] = useState([]);
  const [classesReady, setClassesReady] = useState(false);

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

      {tab === 'entry' && <EntryTab classes={classes} canEdit={canEdit} />}
      {tab === 'insights' && <InsightsTab classes={classes} />}
      {tab === 'classes' && <ClassesTab classes={classes} canEdit={canEdit} />}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   TAB 1 — Daily entry
   ══════════════════════════════════════════════════════════════════ */

function EntryTab({ classes, canEdit }) {
  const { t, locale, lang } = useLanguage();
  const [date, setDate] = useState(todayStr());
  const [drafts, setDrafts] = useState({});   // classId → { riders, notes }
  const [saved, setSaved] = useState({});     // classId → true (persisted for this date)
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [flashId, setFlashId] = useState(null);

  const activeClasses = useMemo(() => classes.filter(c => c.active !== false), [classes]);
  const weekday = useMemo(() => new Date(`${date}T00:00:00`).getDay(), [date]);

  const loadDay = useCallback(async (d) => {
    setLoading(true);
    try {
      const entries = await fetchCounts(d, d);
      const nextDrafts = {};
      const nextSaved = {};
      for (const e of entries) {
        nextDrafts[e.classId] = { riders: String(e.riders ?? ''), notes: e.notes || '' };
        nextSaved[e.classId] = true;
      }
      setDrafts(nextDrafts);
      setSaved(nextSaved);
    } catch (err) {
      console.error('Ridership counts fetch error:', err);
      setDrafts({});
      setSaved({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDay(date); }, [date, loadDay]);

  const setDraft = (classId, patch) => {
    setDrafts(prev => ({ ...prev, [classId]: { riders: '', notes: '', ...prev[classId], ...patch } }));
    setSaved(prev => ({ ...prev, [classId]: false }));
  };

  const saveCount = async (cls) => {
    const d = drafts[cls.id] || {};
    const riders = parseInt(d.riders, 10);
    if (isNaN(riders) || riders < 0) return;
    setSavingId(cls.id);
    try {
      // Idempotent per class+date: corrections simply overwrite the same doc.
      await setDoc(doc(db, 'fleet_ridership_counts', `${cls.id}_${date}`), {
        classId: cls.id,
        date,
        riders,
        notes: (d.notes || '').trim(),
        recordedBy: auth.currentUser?.email || '',
        createdAt: serverTimestamp(),
      });
      setSaved(prev => ({ ...prev, [cls.id]: true }));
      setFlashId(cls.id);
      setTimeout(() => setFlashId(f => (f === cls.id ? null : f)), 1600);
    } catch (err) {
      console.error('Ridership count save error:', err);
    } finally {
      setSavingId(null);
    }
  };

  const scheduledCount = activeClasses.filter(c => Array.isArray(c.days) && c.days.includes(weekday)).length;
  const recordedCount = Object.values(saved).filter(Boolean).length;

  return (
    <div>
      <div className="glass-panel frd-entry-head">
        <div className="section-header" style={{ marginBottom: 0 }}>
          <h2>{t('Record Bus Riders', 'تسجيل ركاب الحافلة')}</h2>
          <p>{t('How many players rode the bus for each class on this date', 'كم لاعباً ركب الحافلة لكل حصة في هذا التاريخ')}</p>
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
      ) : activeClasses.length === 0 ? (
        <div className="glass-panel frd-empty">
          <Users size={34} strokeWidth={1.2} />
          <p>{t('No active classes yet. Add classes in the Class Schedule tab.', 'لا توجد حصص نشطة بعد. أضف الحصص من تبويب جدول الحصص.')}</p>
        </div>
      ) : (
        <div className="frd-entry-list">
          {activeClasses.map(cls => {
            const isScheduled = Array.isArray(cls.days) && cls.days.includes(weekday);
            const d = drafts[cls.id] || { riders: '', notes: '' };
            const isSaved = !!saved[cls.id];
            const riders = parseInt(d.riders, 10);
            const validRiders = !isNaN(riders) && riders >= 0;
            const capacity = Number(cls.capacity) > 0 ? Number(cls.capacity) : null;
            return (
              <div key={cls.id} className={`glass-panel frd-entry-row${isScheduled ? ' frd-scheduled' : ''}${flashId === cls.id ? ' frd-flash' : ''}`}>
                <div className="frd-entry-info">
                  <div className="frd-entry-name">
                    {clsName(cls, lang)}
                    {isScheduled && <span className="frd-chip frd-chip-accent">{t('Scheduled today', 'مجدولة اليوم')}</span>}
                    {isSaved && <span className="frd-chip frd-chip-safe"><Check size={11} /> {t('Recorded', 'مسجلة')}</span>}
                  </div>
                  <div className="frd-entry-meta">
                    {cls.sport && <span>{cls.sport}</span>}
                    {cls.branch && <span>{cls.branch}</span>}
                    {cls.time && <span dir="ltr">{cls.time}</span>}
                    {capacity && <span>{t(`Capacity ${capacity}`, `السعة ${capacity}`)}</span>}
                  </div>
                </div>
                <div className="frd-entry-inputs">
                  <div className="frd-field frd-field-riders">
                    <label>{t('Riders', 'الركاب')}</label>
                    <input
                      type="number" min="0" step="1" inputMode="numeric"
                      value={d.riders}
                      disabled={!canEdit}
                      onChange={e => setDraft(cls.id, { riders: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                  <div className="frd-field frd-field-notes">
                    <label>{t('Notes', 'ملاحظات')}</label>
                    <input
                      type="text"
                      value={d.notes}
                      disabled={!canEdit}
                      onChange={e => setDraft(cls.id, { notes: e.target.value })}
                      placeholder={t('Optional', 'اختياري')}
                    />
                  </div>
                  {capacity && validRiders && (
                    <span className={`frd-util${riders > capacity ? ' frd-util-over' : ''}`} dir="ltr">
                      {Math.round((riders / capacity) * 100).toLocaleString(locale)}%
                    </span>
                  )}
                  {canEdit && (
                    <button
                      className="frd-btn frd-btn-primary"
                      disabled={!validRiders || savingId === cls.id || isSaved}
                      onClick={() => saveCount(cls)}
                    >
                      {savingId === cls.id
                        ? <Loader2 size={14} className="frd-spin" />
                        : isSaved ? <Check size={14} /> : null}
                      {isSaved ? t('Saved', 'محفوظ') : t('Save', 'حفظ')}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
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

  const stats = useMemo(() => buildStats(entries, classes), [entries, classes]);
  const prevStats = useMemo(() => buildStats(prevEntries, classes), [prevEntries, classes]);

  const trendPct = prevStats.totalRiders > 0
    ? ((stats.totalRiders - prevStats.totalRiders) / prevStats.totalRiders) * 100
    : null;

  const maxAvg = stats.perClass.length > 0 ? Math.max(...stats.perClass.map(p => p.avg)) : 0;
  const num = (v, digits = 1) => Number(v.toFixed(digits)).toLocaleString(locale);

  const nameOf = useCallback(
    (p) => p?.cls ? clsName(p.cls, lang) : t('Deleted class', 'حصة محذوفة'),
    [lang, t]
  );

  /* ── Excel export: sheet 1 per-class summary, sheet 2 raw entries ── */
  const exportExcel = () => {
    if (entries.length === 0) return;
    const nameAr = (p) => p.cls ? (p.cls.nameAr || p.cls.nameEn || '') : 'حصة محذوفة';
    const summaryRows = stats.perClass.map(p => ({
      'الحصة': nameAr(p),
      'الرياضة': p.cls?.sport || '',
      'الفرع': p.cls?.branch || '',
      'عدد الجلسات': p.sessions,
      'إجمالي الركاب': p.riders,
      'متوسط الركاب': Number(p.avg.toFixed(1)),
      'السعة': p.capacity ?? '',
      'نسبة الاستخدام %': p.utilization != null ? Number(p.utilization.toFixed(1)) : '',
    }));
    summaryRows.push({
      'الحصة': 'الإجمالي', 'الرياضة': '', 'الفرع': '',
      'عدد الجلسات': stats.sessions, 'إجمالي الركاب': stats.totalRiders,
      'متوسط الركاب': Number(stats.avgPerSession.toFixed(1)), 'السعة': '',
      'نسبة الاستخدام %': stats.utilization != null ? Number(stats.utilization.toFixed(1)) : '',
    });
    const clsById = new Map(classes.map(c => [c.id, c]));
    const rawRows = entries.map(e => ({
      'التاريخ': e.date || '',
      'الحصة': clsById.get(e.classId) ? (clsById.get(e.classId).nameAr || clsById.get(e.classId).nameEn || '') : 'حصة محذوفة',
      'عدد الركاب': Number(e.riders) || 0,
      'ملاحظات': e.notes || '',
      'سُجل بواسطة': e.recordedBy || '',
    }));

    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(summaryRows);
    ws1['!cols'] = [{ wch: 26 }, { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'ملخص الحصص');
    const ws2 = XLSX.utils.json_to_sheet(rawRows);
    ws2['!cols'] = [{ wch: 12 }, { wch: 26 }, { wch: 12 }, { wch: 30 }, { wch: 26 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'السجل اليومي');
    XLSX.writeFile(wb, `ridership-${period}-${todayStr()}.xlsx`);
  };

  /* ── PDF export: A4, white page, ink/hairline/crimson (literal hexes) ── */
  const exportPdf = () => {
    if (entries.length === 0) return;

    // Literal palette: ink #141419, hairline #e4e1da, crimson #c70017
    const INK = [20, 20, 25];
    const HAIR = [228, 225, 218];
    const CRIMSON = [199, 0, 23];
    const MUTED = [117, 114, 107];
    const ALT = [250, 249, 246];

    const AR_RE = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFEFC]/;
    // Reshape then flip to visual order so Arabic renders correctly without
    // jsPDF's global R2L mode (which would also reverse digits).
    const rtl = (s) => {
      if (s == null) return '';
      const str = String(s);
      if (!AR_RE.test(str)) return str;
      return reshapeArabic(str)
        .split(' ')
        .reverse()
        .map(tok => AR_RE.test(tok) ? Array.from(tok).reverse().join('') : tok)
        .join(' ');
    };

    const docPdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    docPdf.addFileToVFS('Cairo-Regular.ttf', CairoRegularBase64);
    docPdf.addFont('Cairo-Regular.ttf', 'Cairo', 'normal');
    docPdf.addFileToVFS('Cairo-Bold.ttf', CairoBoldBase64);
    docPdf.addFont('Cairo-Bold.ttf', 'Cairo', 'bold');
    docPdf.setFont('Cairo', 'normal');

    const W = 210;
    const M = 14;
    const R = W - M; // right edge for RTL-aligned text

    // Header
    docPdf.setFillColor(...CRIMSON);
    docPdf.rect(0, 0, W, 3, 'F');
    docPdf.setFont('Cairo', 'bold');
    docPdf.setFontSize(19);
    docPdf.setTextColor(...INK);
    docPdf.text(rtl('تقرير ركاب الحافلات'), R, 18, { align: 'right' });
    docPdf.setFont('Cairo', 'normal');
    docPdf.setFontSize(10);
    docPdf.setTextColor(...MUTED);
    docPdf.text(rtl(`الفترة: ${periodLabel}`), R, 26, { align: 'right' });
    docPdf.setFontSize(8);
    docPdf.text(rtl(`تاريخ الإصدار: ${todayStr()}`), M, 26, { align: 'left' });
    docPdf.setDrawColor(...HAIR);
    docPdf.setLineWidth(0.3);
    docPdf.line(M, 31, R, 31);

    // Summary cards row
    const cards = [
      { label: 'إجمالي الركاب', value: String(stats.totalRiders) },
      { label: 'الجلسات المسجلة', value: String(stats.sessions) },
      { label: 'متوسط الركاب / جلسة', value: stats.avgPerSession.toFixed(1) },
      {
        label: 'نسبة الاستخدام',
        value: stats.utilization != null ? `${stats.utilization.toFixed(0)}%` : '—',
      },
    ];
    const gap = 5;
    const cardW = (W - 2 * M - 3 * gap) / 4;
    const cardY = 36;
    const cardH = 22;
    cards.forEach((c, i) => {
      // Rightmost card first (RTL reading order)
      const x = R - cardW - i * (cardW + gap);
      docPdf.setDrawColor(...HAIR);
      docPdf.setLineWidth(0.35);
      docPdf.roundedRect(x, cardY, cardW, cardH, 2, 2, 'S');
      docPdf.setFillColor(...CRIMSON);
      docPdf.rect(x + cardW - 7, cardY + 3.2, 4, 1.1, 'F');
      docPdf.setFont('Cairo', 'bold');
      docPdf.setFontSize(13);
      docPdf.setTextColor(...INK);
      docPdf.text(rtl(c.value), x + cardW / 2, cardY + 12.5, { align: 'center' });
      docPdf.setFont('Cairo', 'normal');
      docPdf.setFontSize(7);
      docPdf.setTextColor(...MUTED);
      docPdf.text(rtl(c.label), x + cardW / 2, cardY + 18.5, { align: 'center' });
    });

    const sectionTitle = (title, y) => {
      docPdf.setFont('Cairo', 'bold');
      docPdf.setFontSize(11);
      docPdf.setTextColor(...INK);
      docPdf.text(rtl(title), R, y, { align: 'right' });
      docPdf.setFillColor(...CRIMSON);
      docPdf.rect(R - 12, y + 1.6, 12, 0.8, 'F');
    };

    const tableTheme = {
      styles: {
        font: 'Cairo', fontStyle: 'normal', fontSize: 8, cellPadding: 2.2,
        textColor: INK, lineColor: HAIR, lineWidth: 0.15, halign: 'center',
      },
      headStyles: { font: 'Cairo', fontStyle: 'bold', fillColor: INK, textColor: [255, 255, 255], halign: 'center' },
      alternateRowStyles: { fillColor: ALT },
      margin: { left: M, right: M },
      didDrawPage: () => {
        const page = docPdf.internal.getNumberOfPages();
        docPdf.setDrawColor(...HAIR);
        docPdf.setLineWidth(0.3);
        docPdf.line(M, 288, R, 288);
        docPdf.setFont('Cairo', 'normal');
        docPdf.setFontSize(7.5);
        docPdf.setTextColor(...MUTED);
        docPdf.text(rtl(`صفحة ${page}`), W / 2, 293, { align: 'center' });
        docPdf.setTextColor(...CRIMSON);
        docPdf.text(rtl('نادي الفجيرة للفنون القتالية — قسم النقل'), R, 293, { align: 'right' });
      },
    };

    // Table 1 — per-class summary (columns laid out right-to-left)
    sectionTitle('ملخص الحصص', 68);
    const nameArOf = (p) => p.cls ? (p.cls.nameAr || p.cls.nameEn || '') : 'حصة محذوفة';
    autoTable(docPdf, {
      ...tableTheme,
      startY: 72,
      head: [[
        rtl('نسبة الاستخدام'), rtl('السعة'), rtl('متوسط الركاب'),
        rtl('إجمالي الركاب'), rtl('الجلسات'), rtl('الفرع'), rtl('الرياضة'), rtl('الحصة'),
      ]],
      body: stats.perClass.map(p => ([
        p.utilization != null ? `${p.utilization.toFixed(0)}%` : '—',
        p.capacity ?? '—',
        p.avg.toFixed(1),
        p.riders,
        p.sessions,
        rtl(p.cls?.branch || '—'),
        rtl(p.cls?.sport || '—'),
        rtl(nameArOf(p)),
      ])),
      columnStyles: { 7: { halign: 'right', fontStyle: 'bold' } },
    });

    // Table 2 — raw daily entries
    const afterY = (docPdf.lastAutoTable?.finalY || 100) + 12;
    sectionTitle('السجل اليومي', afterY);
    const clsById = new Map(classes.map(c => [c.id, c]));
    autoTable(docPdf, {
      ...tableTheme,
      startY: afterY + 4,
      head: [[rtl('ملاحظات'), rtl('عدد الركاب'), rtl('الحصة'), rtl('التاريخ')]],
      body: entries.map(e => {
        const c = clsById.get(e.classId);
        return [
          rtl(e.notes || '—'),
          Number(e.riders) || 0,
          rtl(c ? (c.nameAr || c.nameEn || '') : 'حصة محذوفة'),
          e.date || '',
        ];
      }),
      columnStyles: { 0: { halign: 'right' }, 2: { halign: 'right', fontStyle: 'bold' } },
    });

    docPdf.save(`ridership-report-${period}.pdf`);
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
          <button className="frd-btn frd-btn-ghost" onClick={exportExcel} disabled={entries.length === 0}>
            <Download size={14} /> {t('Excel', 'إكسل')}
          </button>
          <button className="frd-btn frd-btn-primary" onClick={exportPdf} disabled={entries.length === 0}>
            <FileText size={14} /> {t('PDF Report', 'تقرير PDF')}
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
      if (modal.mode === 'add') {
        await addDoc(collection(db, 'fleet_ridership_classes'), { ...payload, createdAt: serverTimestamp() });
      } else {
        await updateDoc(doc(db, 'fleet_ridership_classes', modal.id), payload);
      }
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
                <div className="frd-field">
                  <label>{t('Time', 'الوقت')}</label>
                  <input type="time" value={modal.draft.time} onChange={e => setDraft({ time: e.target.value })} />
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
