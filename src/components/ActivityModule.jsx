import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  History, RefreshCw, Package, Building2, LifeBuoy, Bus, Users as UsersIcon,
  ArrowUpFromLine, ArrowDownToLine, Wrench, Route, Download,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';
import { useLanguage } from '../contexts/LanguageContext';
import exportCsv from '../utils/exportCsv';
import './ActivityModule.css';

/* Module identity dots — the system's deep-accent family */
const MODULE_META = {
  inventory: { color: '#0c7a58', path: '/inventory' },
  assets:    { color: '#0e7490', path: '/assets' },
  help:      { color: '#2563eb', path: '/help' },
  fleet:     { color: '#8a6d1f', path: '/fleet/dashboard' },
  users:     { color: '#52525a', path: '/users/dashboard' },
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
  // Day-reference strings captured at fetch time (keeps renders pure)
  const [dayRefs, setDayRefs] = useState({ today: '', yesterday: '' });

  /* No synchronous setState here — the first state write happens after
     the fetches settle, so this is safe to call from an effect. */
  const load = useCallback(async () => {
    const out = [];

    await Promise.allSettled([
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
          const ts = toMillis(a.timestamp);
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
        const snap = await getDocs(collection(db, 'users'));
        snap.docs.forEach(d => {
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

    out.sort((a, b) => b.ts - a.ts);
    setDayRefs({
      today: new Date().toDateString(),
      yesterday: new Date(Date.now() - 86400000).toDateString(),
    });
    setEvents(out.slice(0, 400));
    setRefreshing(false);
  }, [t, locale]);

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
    () => (events || []).filter(e => filter === 'all' || e.module === filter),
    [events, filter]
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
  ];

  return (
    <motion.div className="act" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
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

      {events == null ? (
        <div className="act-empty">{t('Loading the timeline…', 'جارٍ تحميل الخط الزمني…')}</div>
      ) : filtered.length === 0 ? (
        <div className="act-empty">
          <History size={26} strokeWidth={1.5} />
          <p>{t('No recorded activity for this filter.', 'لا يوجد نشاط مسجل لهذا التصنيف.')}</p>
        </div>
      ) : (
        <div className="act-list">
          {groups.map(g =>
            g.type === 'day' ? (
              <div key={g.key} className="act-day">{g.label}</div>
            ) : (
              <button
                key={g.key}
                className="act-row"
                onClick={() => navigate(g.event.path || MODULE_META[g.event.module].path)}
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
