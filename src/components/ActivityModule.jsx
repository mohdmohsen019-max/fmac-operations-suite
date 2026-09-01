import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  History, RefreshCw, Package, Building2, LifeBuoy, Bus, Users as UsersIcon,
  ArrowUpFromLine, ArrowDownToLine, Wrench, Route, Download,
  Search, ExternalLink, CalendarDays, ClipboardCheck, FileSignature,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';
import { useLanguage } from '../contexts/LanguageContext';
import exportCsv from '../utils/exportCsv';
import { OpsDetailGrid, OpsDrawer, OpsEmptyState } from './shared/OperationalUI';
import './ActivityModule.css';

/* Module identity dots — the system's deep-accent family */
const MODULE_META = {
  inventory: { color: '#0c7a58', path: '/inventory' },
  assets:    { color: '#0e7490', path: '/assets' },
  help:      { color: '#2563eb', path: '/help' },
  fleet:     { color: '#8a6d1f', path: '/fleet/dashboard' },
  users:     { color: '#52525a', path: '/users/dashboard' },
  reports:   { color: '#6d4fc4', path: '/reports' },
};

const iconForAction = (action = '') => {
  if (action.includes('ridership')) return ClipboardCheck;
  if (action.includes('overtime')) return CalendarDays;
  if (action.includes('registration')) return FileSignature;
  if (action.includes('maintenance')) return Wrench;
  return History;
};

const toMillis = (ts) => {
  if (!ts) return 0;
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const ms = d.getTime();
  return isNaN(ms) ? 0 : ms;
};

const PAGE = 40;

export default function ActivityModule() {
  const { t, lang, locale } = useLanguage();
  const navigate = useNavigate();

  const [events, setEvents] = useState(null); // null = loading
  const [filter, setFilter] = useState('all');
  const [visible, setVisible] = useState(PAGE);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [selectedEvent, setSelectedEvent] = useState(null);
  // Day-reference strings captured at fetch time (keeps renders pure)
  const [dayRefs, setDayRefs] = useState({ today: '', yesterday: '' });

  /* No synchronous setState here — the first state write happens after
     the fetches settle, so this is safe to call from an effect. */
  const load = useCallback(async () => {
    const out = [];
    let userDirectoryDocs = [];
    const userNameByEmail = new Map();

    try {
      const userDirectorySnap = await getDocs(collection(db, 'users'));
      userDirectoryDocs = userDirectorySnap.docs;
      userDirectoryDocs.forEach((userDoc) => {
        const profile = userDoc.data();
        const email = String(profile.email || '').trim().toLowerCase();
        if (email) userNameByEmail.set(email, profile.displayName || profile.email);
      });
    } catch (error) {
      console.warn('[activity] user directory unavailable:', error);
    }

    await Promise.allSettled([
      /* Normalized audit stream used by all newly implemented workflows. */
      (async () => {
        const snap = await getDocs(collection(db, 'activity_events'));
        snap.docs.forEach(d => {
          const a = d.data();
          const ts = toMillis(a.createdAt || a.timestamp);
          if (!ts) return;
          out.push({
            id: `ev-${d.id}`, ts, module: MODULE_META[a.module] ? a.module : 'fleet',
            icon: iconForAction(a.action),
            title: lang === 'ar' ? (a.titleAr || a.titleEn) : (a.titleEn || a.titleAr),
            sub: [
              lang === 'ar' ? (a.detailAr || a.detailEn) : (a.detailEn || a.detailAr),
              a.actorName || a.actorEmail ? `${t('by', 'بواسطة')} ${a.actorName || a.actorEmail}` : '',
            ].filter(Boolean).join(' · '),
            path: a.path || MODULE_META[a.module]?.path,
            recordId: a.recordId || d.id,
            actor: a.actorName || a.actorEmail || '',
            submodule: a.submodule || '',
          });
        });
      })(),

      /* Inventory movements */
      (async () => {
        const snap = await getDocs(collection(db, 'inventory_movements'));
        snap.docs.forEach(d => {
          const m = d.data();
          const ts = toMillis(m.createdAt);
          if (!ts) return;
          const isIn = m.type === 'stock_in';
          out.push({
            id: `mv-${d.id}`, ts, module: 'inventory',
            icon: isIn ? ArrowDownToLine : ArrowUpFromLine,
            title: `${isIn ? '+' : '−'}${m.quantity ?? '?'} · ${m.itemNameAr || m.itemNameEn || m.itemSku || '—'}`,
            sub: isIn
              ? t('Stock received', 'استلام مخزون')
              : `${t('Issued to', 'صُرف إلى')} ${m.issuedTo?.personName || m.performedByName || '—'}`,
          });
        });
      })(),

      /* Asset audit log */
      (async () => {
        const snap = await getDocs(collection(db, 'asset_audit_log'));
        snap.docs.forEach(d => {
          const a = d.data();
          const ts = toMillis(a.timestamp || a.createdAt || a.updatedAt);
          if (!ts) return;
          const type = (a.change_type || 'edited').replace(/_/g, ' ');
          out.push({
            id: `aa-${d.id}`, ts, module: 'assets',
            icon: Building2,
            title: `${a.asset_name_en || t('Asset', 'أصل')} · ${type}`,
            sub: [
              a.previous_value && a.new_value ? `${a.previous_value} → ${a.new_value}` : (a.new_value || ''),
              a.changed_by_name ? `${t('by', 'بواسطة')} ${a.changed_by_name}` : '',
            ].filter(Boolean).join(' · ') || t('Registry change', 'تغيير في السجل'),
          });
        });
      })(),

      /* Fleet overtime (historical adapter; new writes also use activity_events). */
      (async () => {
        const snap = await getDocs(collection(db, 'fleet_driver_overtime'));
        snap.docs.forEach(d => {
          const a = d.data();
          const ts = toMillis(a.updatedAt || a.createdAt);
          if (!ts) return;
          out.push({
            id: `ot-${d.id}`, ts, module: 'fleet', icon: CalendarDays,
            title: `${t('Overtime', 'العمل الإضافي')} · ${a.driverName || '—'}`,
            sub: [a.date, a.durationMinutes ? `${Math.round(a.durationMinutes / 6) / 10} h` : '', a.reason].filter(Boolean).join(' · '),
            path: '/fleet/overtime', recordId: d.id,
          });
        });
      })(),

      /* Ridership entries retain their latest recorded update. */
      (async () => {
        const snap = await getDocs(collection(db, 'fleet_ridership_counts'));
        snap.docs.forEach(d => {
          const a = d.data();
          const ts = toMillis(a.updatedAt || a.createdAt);
          if (!ts) return;
          const actorEmail = a.recordedByEmail || a.recordedBy || '';
          const actor = a.recordedByName
            || userNameByEmail.get(String(actorEmail).trim().toLowerCase())
            || actorEmail;
          out.push({
            id: `rd-${d.id}`, ts, module: 'fleet', icon: ClipboardCheck,
            title: `${t('Ridership recorded', 'تم تسجيل الركاب')} · ${a.classSnapshot?.registration || '—'}`,
            sub: [
              `${a.date || '—'} · ${Number(a.riders || 0).toLocaleString(locale)} ${t('riders', 'راكب')}`,
              actor ? `${t('by', 'بواسطة')} ${actor}` : t('Actor unavailable for this older record', 'منفذ التغيير غير متوفر لهذا السجل القديم'),
            ].join(' · '),
            path: '/fleet/ridership', recordId: d.id, actor,
          });
        });
      })(),

      /* Vehicle-registration edits and card attachments. */
      (async () => {
        const snap = await getDocs(collection(db, 'fleet_vehicle_registrations'));
        snap.docs.forEach(d => {
          const a = d.data();
          const ts = toMillis(a.detailsUpdatedAt || a.registrationCardUpdatedAt || a.updatedAt);
          if (!ts) return;
          out.push({
            id: `vr-${d.id}`, ts, module: 'fleet', icon: FileSignature,
            title: `${t('Vehicle registration updated', 'تم تحديث تسجيل المركبة')} · ${a.registration || d.id}`,
            sub: a.registrationCard?.name || t('Registration details changed', 'تم تعديل بيانات التسجيل'),
            path: '/fleet/vehicle-registration', recordId: d.id,
          });
        });
      })(),

      /* Help desk tickets (submissions) */
      (async () => {
        const snap = await getDocs(collection(db, 'requests'));
        snap.docs.forEach(d => {
          const r = d.data();
          const ts = toMillis(r.createdAt);
          if (!ts) return;
          out.push({
            id: `tk-${d.id}`, ts, module: 'help',
            icon: LifeBuoy,
            title: `${r.ticketNumber || d.id.slice(0, 10)} · ${r.type || t('request', 'طلب')}`,
            sub: `${t('Submitted by', 'قدّمه')} ${r.userInfo?.name || '—'}${r.status === 'closed' ? ` · ${t('now closed', 'مغلق الآن')}` : ''}`,
            path: `/help/requests/${d.id}`,
          });
        });
      })(),

      /* Fleet: maintenance entries */
      (async () => {
        const snap = await getDocs(collection(db, 'maintenance'));
        snap.docs.forEach(d => {
          const m = d.data();
          const ts = toMillis(m.createdAt) || toMillis(m.date);
          if (!ts) return;
          out.push({
            id: `mt-${d.id}`, ts, module: 'fleet',
            icon: Wrench,
            title: `${t('Maintenance', 'صيانة')} · ${m.vehicle || m.plate || m.reference || '—'}`,
            sub: `${(m.description || '').toString().slice(0, 90) || t('Service entry logged', 'تم تسجيل خدمة')}${m.total ? ` · ${m.total} AED` : ''}`,
          });
        });
      })(),

      /* Fleet: manual trip logs */
      (async () => {
        const snap = await getDocs(collection(db, 'trip_logs'));
        snap.docs.forEach(d => {
          const tr = d.data();
          const ts = toMillis(tr.createdAt);
          if (!ts) return;
          const dist = tr.endOdo && tr.startOdo ? Math.max(tr.endOdo - tr.startOdo, 0) : null;
          out.push({
            id: `tr-${d.id}`, ts, module: 'fleet',
            icon: Route,
            title: `${t('Trip', 'رحلة')} · ${t('Bus', 'حافلة')} ${tr.busNumber || tr.plateNumber || '—'}`,
            sub: [
              tr.tripType ? (tr.tripType === 'Internal' ? t('Internal', 'داخلية') : t('External', 'خارجية')) : '',
              tr.destination || '',
              dist != null ? `${dist.toLocaleString(locale)} ${t('km', 'كم')}` : '',
            ].filter(Boolean).join(' · ') || t('Trip logged', 'تم تسجيل رحلة'),
          });
        });
      })(),

      /* User accounts */
      (async () => {
        userDirectoryDocs.forEach(d => {
          const u = d.data();
          const ts = toMillis(u.createdAt);
          if (!ts) return;
          out.push({
            id: `us-${d.id}`, ts, module: 'users',
            icon: UsersIcon,
            title: u.displayName || u.email || t('Account', 'حساب'),
            sub: u.status === 'pending'
              ? t('Signed up — awaiting approval', 'سجّل حسابًا — بانتظار الموافقة')
              : t('Account created', 'تم إنشاء الحساب'),
          });
        });
      })(),
    ]);

    const streamedRecords = new Set(out
      .filter(event => event.id.startsWith('ev-') && event.recordId)
      .map(event => `${event.module}:${event.recordId}`));
    const merged = out.filter(event => event.id.startsWith('ev-')
      || !event.recordId
      || !streamedRecords.has(`${event.module}:${event.recordId}`));
    merged.sort((a, b) => b.ts - a.ts);
    setDayRefs({
      today: new Date().toDateString(),
      yesterday: new Date(Date.now() - 86400000).toDateString(),
    });
    setEvents(merged);
    setRefreshing(false);
  }, [t, locale, lang]);

  // All state writes in load() happen after its fetches settle (async),
  // never synchronously — same pattern/waiver as useIsMobile.js.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => {
    const c = { all: events?.length || 0 };
    (events || []).forEach(e => { c[e.module] = (c[e.module] || 0) + 1; });
    return c;
  }, [events]);

  const filtered = useMemo(
    () => (events || []).filter(e => {
      if (filter !== 'all' && e.module !== filter) return false;
      if (dateFilter && new Date(e.ts).toISOString().slice(0, 10) !== dateFilter) return false;
      const needle = search.trim().toLowerCase();
      if (needle && !`${e.title} ${e.sub} ${e.module}`.toLowerCase().includes(needle)) return false;
      return true;
    }),
    [events, filter, dateFilter, search]
  );

  /* Group by day (day refs come from fetch-time state — pure render) */
  const groups = useMemo(() => {
    const g = [];
    let currentKey = null;
    filtered.slice(0, visible).forEach(e => {
      const d = new Date(e.ts);
      const dayKey = d.toDateString();
      if (dayKey !== currentKey) {
        currentKey = dayKey;
        const label = dayKey === dayRefs.today
          ? t('Today', 'اليوم')
          : dayKey === dayRefs.yesterday
            ? t('Yesterday', 'أمس')
            : new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
        g.push({ type: 'day', key: `day-${dayKey}`, label });
      }
      g.push({ type: 'event', key: e.id, event: e });
    });
    return g;
  }, [filtered, visible, dayRefs, t, locale]);

  const exportTimeline = () => {
    exportCsv(
      `fmac-activity-${new Date().toISOString().slice(0, 10)}`,
      ['Timestamp', 'Module', 'Event', 'Details'],
      filtered.map(e => [new Date(e.ts).toISOString(), e.module, e.title, e.sub])
    );
  };

  const FILTERS = [
    { id: 'all',       label: t('All', 'الكل') },
    { id: 'inventory', label: t('Inventory', 'المخزون') },
    { id: 'assets',    label: t('Assets', 'الأصول') },
    { id: 'help',      label: t('Help Desk', 'الدعم') },
    { id: 'fleet',     label: t('Fleet', 'الأسطول') },
    { id: 'users',     label: t('Users', 'المستخدمون') },
    { id: 'reports',   label: t('Reports', 'التقارير') },
  ];

  return (
    <motion.div className="act" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
      <OpsDrawer
        open={Boolean(selectedEvent)}
        onClose={() => setSelectedEvent(null)}
        eyebrow={selectedEvent ? t(`${selectedEvent.module} activity`, `نشاط ${selectedEvent.module}`) : ''}
        title={selectedEvent?.title || '—'}
        subtitle={selectedEvent?.sub}
        footer={selectedEvent ? (
          <button className="act-refresh" onClick={() => navigate(selectedEvent.path || MODULE_META[selectedEvent.module].path)}>
            {t('Open related module', 'فتح الوحدة المرتبطة')}<ExternalLink size={14} />
          </button>
        ) : null}
      >
        {selectedEvent && <OpsDetailGrid items={[
          { label: t('Module', 'الوحدة'), value: FILTERS.find(item => item.id === selectedEvent.module)?.label || selectedEvent.module },
          { label: t('Date and time', 'التاريخ والوقت'), value: new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeStyle: 'short' }).format(new Date(selectedEvent.ts)) },
          { label: t('Action', 'الإجراء'), value: selectedEvent.title, wide: true },
          { label: t('Context', 'السياق'), value: selectedEvent.sub, wide: true },
          { label: t('Record ID', 'معرّف السجل'), value: selectedEvent.recordId || selectedEvent.id, dir: 'ltr', wide: true },
          ...(selectedEvent.actor ? [{ label: t('Performed by', 'نفذه'), value: selectedEvent.actor, wide: true }] : []),
        ]} />}
      </OpsDrawer>
      <div className="act-head">
        <div>
          <h1 className="act-title">{t('Activity Log', 'سجل النشاط')}</h1>
          <p className="act-sub">
            {t('Everything that happened across the operation, in one timeline.', 'كل ما حدث في العمليات، في خطٍّ زمنيٍّ واحد.')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="act-refresh" onClick={exportTimeline} disabled={!filtered.length}>
            <Download size={13} />
            CSV
          </button>
          <button className="act-refresh" onClick={() => { setRefreshing(true); load(); }} disabled={refreshing}>
            <RefreshCw size={13} className={refreshing ? 'act-spin' : undefined} />
            {t('Refresh', 'تحديث')}
          </button>
        </div>
      </div>

      <div className="act-filters">
        {FILTERS.map(f => (
          <button
            key={f.id}
            className={`act-chip${filter === f.id ? ' active' : ''}`}
            onClick={() => { setFilter(f.id); setVisible(PAGE); }}
          >
            {f.label}
            <span className="act-chip-n" dir="ltr">{(counts[f.id] || 0).toLocaleString(locale)}</span>
          </button>
        ))}
      </div>

      <div className="act-querybar">
        <label className="act-search">
          <Search size={14} aria-hidden="true" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('Search actor, action or record…', 'ابحث عن مستخدم أو إجراء أو سجل…')} />
        </label>
        <label className="act-date">
          <span>{t('Date', 'التاريخ')}</span>
          <input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} />
        </label>
        {(search || dateFilter) && <button className="act-clear" onClick={() => { setSearch(''); setDateFilter(''); }}>{t('Clear', 'مسح')}</button>}
      </div>

      {events == null ? (
        <div className="act-empty">{t('Loading the timeline…', 'جارٍ تحميل الخط الزمني…')}</div>
      ) : filtered.length === 0 ? (
        <OpsEmptyState icon={History} title={t('No matching activity', 'لا يوجد نشاط مطابق')} detail={t('Change the module, date, or search terms to widen the timeline.', 'غيّر الوحدة أو التاريخ أو كلمات البحث لتوسيع الخط الزمني.')} />
      ) : (
        <div className="act-list">
          {groups.map(g =>
            g.type === 'day' ? (
              <div key={g.key} className="act-day">{g.label}</div>
            ) : (
              <button
                key={g.key}
                className="act-row"
                onClick={() => setSelectedEvent(g.event)}
              >
                <span className="act-dot" style={{ background: MODULE_META[g.event.module].color }} />
                <g.event.icon size={14} strokeWidth={1.9} className="act-icon" />
                <span className="act-main">
                  <span className="act-row-title" dir="auto">{g.event.title}</span>
                  <span className="act-row-sub" dir="auto">{g.event.sub}</span>
                </span>
                <span className="act-time" dir="ltr">
                  {new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(g.event.ts))}
                </span>
              </button>
            )
          )}
          {filtered.length > visible && (
            <button className="act-more" onClick={() => setVisible(v => v + PAGE)}>
              {t('Load more', 'تحميل المزيد')} · {(filtered.length - visible).toLocaleString(locale)} {t('older', 'أقدم')}
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
}
