import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Search, Bell, Bus, Package, BarChart2, ChevronRight, MonitorPlay, FileText,
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area } from 'recharts';
import { useNavigate } from 'react-router-dom';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { db } from '../firebase';
import { collection, getDocs, query } from 'firebase/firestore';
import { cartrackService } from '../services/cartrackService';
import { useLanguage } from '../contexts/LanguageContext';
import LanguageToggle from './shared/LanguageToggle';
import ThemeToggle from './shared/ThemeToggle';
import './OperationsDashboard.css';

/* Brand red — the ONLY place this hex exists in this file (chart line + dot). */
const RED = '#c70017';

/* Camera-group plates (mirrors the fleet module's registration filter). */
const FLEET_PLATES = [
  'A21248', 'A33867', 'A33876', 'C29769', 'C37069',
  'C37072', 'C37074', 'C37075', 'M85750', 'M85751',
  'M85756', 'M85759', 'M99268', 'M99270',
];

const isFleetPlate = (registration) => {
  const reg = (registration || '').trim().toUpperCase().replace(/\s/g, '');
  return FLEET_PLATES.some(p => reg === p || reg === p.replace(/\s/g, ''));
};

const getGreeting = (t) => {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return t('Good morning', 'صباح الخير');
  if (h >= 12 && h < 17) return t('Good afternoon', 'مساء الخير');
  return t('Good evening', 'مساء الخير');
};

const toMillis = (ts) => {
  if (!ts) return 0;
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const ms = d.getTime();
  return isNaN(ms) ? 0 : ms;
};

/* Compact age like Image B: "65d" / "3h" / "12m" */
const ageShort = (ts) => {
  const ms = toMillis(ts);
  if (!ms) return '—';
  const mins = Math.floor((Date.now() - ms) / 60000);
  if (mins < 60) return `${Math.max(mins, 0)}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
};

const RANGES = ['1D', '1W', '1M', '1Y'];

export default function OperationsDashboard({ userProfile }) {
  const navigate = useNavigate();
  const { t, lang, locale } = useLanguage();

  /* ── State ── */
  const [fleetStatus, setFleetStatus] = useState(null);      // { onRoute, total }
  const [reportStats, setReportStats] = useState(null);      // { approved, total }
  const [invStats, setInvStats] = useState(null);            // { total, out, low, topCats }
  const [signals, setSignals] = useState({});                // bell + dark-card urgency
  const [assetStats, setAssetStats] = useState(null);        // { total, missing, rooms }
  const [movements, setMovements] = useState(null);
  const [fleetRange, setFleetRange] = useState('1W');
  const [tripData, setTripData] = useState(null);            // { points, totalKm } | null
  const [bellOpen, setBellOpen] = useState(false);
  const bellRef = useRef(null);

  /* Close the bell dropdown on outside click */
  useEffect(() => {
    if (!bellOpen) return;
    const onDown = (e) => {
      if (bellRef.current && !bellRef.current.contains(e.target)) setBellOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [bellOpen]);

  const mergeSignals = (patch) => setSignals(prev => ({ ...prev, ...patch }));

  /* Real name only — placeholder accounts ("ADMIN", "ADMIN ADMIN ADMIN", empty)
     greet with no name at all rather than rendering placeholder text. */
  const rawName = (userProfile?.displayName || '').trim();
  const isPlaceholderName =
    !rawName || rawName.split(/\s+/).every(w => w.toLowerCase() === 'admin');
  const displayName = isPlaceholderName ? null : rawName;
  const firstName = displayName ? displayName.split(' ')[0] : null;

  useEffect(() => {
    Promise.allSettled([
      fetchFleetStatus(),
      fetchTripActivity('1W'),
      fetchReportsData(),
      fetchInventoryData(),
      fetchUsersData(),
      fetchHelpData(),
      fetchAssetsData(),
      fetchMovements(),
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Fleet status (gold card) ── */
  const fetchFleetStatus = async () => {
    try {
      const vehicles = await cartrackService.getVehicles();
      const onRoute = vehicles ? vehicles.filter(v => v.ignition).length : 0;
      setFleetStatus({ onRoute, total: vehicles ? vehicles.length : 14 });
    } catch {
      setFleetStatus({ onRoute: null, total: 14 });
    }
  };

  /* ── Trip activity (red chart card) ──
     SUM of trip_distance divided by 1000, camera-group plates only, bucketed on the
     trip's local (Asia/Dubai) start timestamp as returned by the API. */
  const fetchTripActivity = async (range) => {
    setTripData(null);
    try {
      const now = new Date();
      const daysBack = range === '1D' ? 0 : range === '1W' ? 6 : range === '1M' ? 29 : 364;
      const start = format(startOfDay(subDays(now, daysBack)), 'yyyy-MM-dd HH:mm:ss');
      const end = format(endOfDay(now), 'yyyy-MM-dd HH:mm:ss');
      const raw = (await cartrackService.getTrips(start, end)) || [];

      const seen = new Set();
      const trips = raw.filter(trip => {
        if (!isFleetPlate(trip.registration)) return false;
        const dist = parseFloat(trip.trip_distance) || 0;
        if (dist <= 0) return false;
        const key = trip.trip_id
          ? String(trip.trip_id)
          : `${trip.registration}-${trip.start_timestamp}-${dist}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      /* Bucket keys from the API's local-time strings */
      const bucketOf = (ts) => {
        if (!ts) return null;
        if (range === '1D') return ts.substring(11, 13);   // hour
        if (range === '1Y') return ts.substring(0, 7);     // month
        return ts.substring(0, 10);                        // day
      };
      const keys = [];
      if (range === '1D') {
        for (let h = 0; h <= now.getHours(); h++) keys.push(String(h).padStart(2, '0'));
      } else if (range === '1Y') {
        for (let m = 11; m >= 0; m--) {
          const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
          keys.push(format(d, 'yyyy-MM'));
        }
      } else {
        for (let d = daysBack; d >= 0; d--) keys.push(format(subDays(now, d), 'yyyy-MM-dd'));
      }

      const sums = Object.fromEntries(keys.map(k => [k, 0]));
      let totalMeters = 0;
      trips.forEach(trip => {
        const dist = parseFloat(trip.trip_distance) || 0;
        totalMeters += dist;
        const b = bucketOf(trip.start_timestamp);
        if (b != null && b in sums) sums[b] += dist;
      });

      setTripData({
        points: keys.map(k => ({ k, v: Math.round(sums[k] / 1000) })),
        totalKm: Math.round(totalMeters / 1000),
      });
    } catch {
      setTripData({ points: [], totalKm: null });
    }
  };

  const changeRange = (r) => {
    if (r === fleetRange) return;
    setFleetRange(r);
    fetchTripActivity(r);
  };

  /* ── Dept reports (purple card) ── */
  const fetchReportsData = async () => {
    try {
      const now = new Date();
      const monthId = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const sectionsSnap = await getDocs(query(collection(db, 'report_sections')));
      const monthSections = sectionsSnap.docs.map(d => d.data()).filter(s => s.reportId === monthId);
      const approved = monthSections.filter(s => s.status === 'approved').length;
      const total = monthSections.length;
      setReportStats({ approved, total });
      mergeSignals({ unapproved: Math.max(total - approved, 0) });
    } catch {
      setReportStats({ approved: null, total: null });
    }
  };

  /* ── Inventory (green card + dark anchor) ── */
  const fetchInventoryData = async () => {
    try {
      const snap = await getDocs(query(collection(db, 'inventory_items')));
      const items = snap.docs.map(d => d.data()).filter(i => i.isActive !== false);
      const low = items.filter(i => i.currentStock > 0 && i.currentStock <= (i.minThreshold ?? 5)).length;
      const outItems = items.filter(i => i.currentStock === 0);

      const catCount = {};
      outItems.forEach(i => {
        const c = (i.category || '').toString().trim();
        if (c) catCount[c] = (catCount[c] || 0) + 1;
      });
      const topCats = Object.entries(catCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([c]) => c);

      setInvStats({ total: items.length, out: outItems.length, low, topCats });
      mergeSignals({ outStock: outItems.length });
    } catch {
      setInvStats({ total: null, out: null, low: null, topCats: [] });
    }
  };

  /* ── Users (bell signal only) ── */
  const fetchUsersData = async () => {
    try {
      const snap = await getDocs(collection(db, 'users'));
      const pending = snap.docs.map(d => d.data()).filter(u => u.status === 'pending').length;
      mergeSignals({ pendingUsers: pending });
    } catch { /* signal stays unset */ }
  };

  /* ── Help desk (bell + dark-card signals) ── */
  const fetchHelpData = async () => {
    try {
      const snap = await getDocs(collection(db, 'requests'));
      const requests = snap.docs.map(d => d.data());
      const overdue = requests.filter(
        r => r.slaDeadline?.toDate && r.slaDeadline.toDate() < new Date() && r.status !== 'closed'
      ).length;
      mergeSignals({ overdueTickets: overdue });
    } catch { /* signal stays unset */ }
  };

  /* ── Assets (row-2 overview) ── */
  const fetchAssetsData = async () => {
    try {
      const [assetsSnap, roomsSnap] = await Promise.all([
        getDocs(collection(db, 'assets')),
        getDocs(collection(db, 'asset_rooms')),
      ]);
      const roomNames = Object.fromEntries(roomsSnap.docs.map(d => [d.id, d.data()]));
      const assets = assetsSnap.docs.map(d => d.data());
      const missing = assets.filter(a => a.status === 'Missing').length;

      const byRoom = {};
      assets.forEach(a => {
        if (a.location_room) byRoom[a.location_room] = (byRoom[a.location_room] || 0) + 1;
      });
      const rooms = Object.entries(byRoom)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([id, count]) => ({
          key: id,
          en: roomNames[id]?.name_en || roomNames[id]?.name_ar || '—',
          ar: roomNames[id]?.name_ar || roomNames[id]?.name_en || '—',
          count,
        }));

      setAssetStats({ total: assets.length, missing, rooms });
    } catch {
      setAssetStats({ total: null, missing: null, rooms: [] });
    }
  };

  /* ── Stock movements ── */
  const fetchMovements = async () => {
    try {
      const snap = await getDocs(collection(db, 'inventory_movements'));
      const latest = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))
        .slice(0, 5);
      setMovements(latest);
    } catch {
      setMovements([]);
    }
  };


  /* ── Daily Brief printout — composed from already-loaded dashboard state ── */
  const printBrief = () => {
    const w = window.open('', '_blank', 'width=780,height=920');
    if (!w) return;
    const rtl = lang === 'ar';
    const dateLine = new Intl.DateTimeFormat(locale, {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    }).format(new Date());
    const row = (label, value) =>
      `<tr><td class="l">${label}</td><td class="v" dir="ltr">${value}</td></tr>`;

    const opsRows = [
      fleetStatus && row(t('Buses on route', 'حافلات في الخدمة'), `${fleetStatus.onRoute} / ${fleetStatus.total}`),
      invStats && row(t('Inventory items', 'أصناف المخزون'), invStats.total),
      invStats && row(t('Out of stock', 'نفذ من المخزون'), invStats.out),
      invStats && row(t('Low stock', 'مخزون منخفض'), invStats.low),
      assetStats?.total != null && row(t('Registered assets', 'الأصول المسجلة'), assetStats.total),
      assetStats?.missing > 0 && row(t('Assets flagged missing', 'أصول مفقودة'), assetStats.missing),
      reportStats && row(t('Report sections approved', 'أقسام التقرير المعتمدة'), `${reportStats.approved} / ${reportStats.total}`),
    ].filter(Boolean).join('');

    const flagRows = [
      signals.overdueTickets > 0 && row(t('Overdue tickets', 'تذاكر متأخرة'), signals.overdueTickets),
      signals.pendingUsers > 0 && row(t('Accounts awaiting approval', 'حسابات بانتظار الموافقة'), signals.pendingUsers),
      signals.outStock > 0 && row(t('Items at zero stock', 'أصناف رصيدها صفر'), signals.outStock),
      signals.unapproved > 0 && row(t('Unapproved report sections', 'أقسام غير معتمدة'), signals.unapproved),
    ].filter(Boolean).join('');

    const moveRows = (movements || []).map(mv => {
      const name = mv.itemNameAr || mv.itemNameEn || mv.itemSku || '—';
      const who = mv.issuedTo?.personName || mv.performedByName || '—';
      const qty = `${mv.type === 'stock_in' ? '+' : '−'}${mv.quantity ?? ''}`;
      const when = new Date(toMillis(mv.createdAt)).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
      return `<tr><td class="l" dir="auto">${name}</td><td dir="auto">${who}</td><td class="v" dir="ltr">${qty}</td><td class="v">${when}</td></tr>`;
    }).join('');

    w.document.write(`<!doctype html><html dir="${rtl ? 'rtl' : 'ltr'}" lang="${lang}"><head>
      <meta charset="utf-8"><title>FMAC — ${t('Daily Brief', 'الموجز اليومي')}</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, sans-serif; color: #111114; margin: 36px 42px; }
        h1 { font-size: 21px; margin: 0 0 2px; letter-spacing: -0.01em; }
        .date { color: #6f6f78; font-size: 13px; margin-bottom: 26px; }
        h2 { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em;
             color: #6f6f78; margin: 26px 0 8px; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        td { padding: 7px 4px; border-bottom: 1px solid #ececec; }
        td.l { color: #111114; }
        td.v { font-weight: 600; white-space: nowrap; }
        .empty { color: #6f6f78; font-size: 13px; padding: 6px 4px; }
        .foot { margin-top: 34px; color: #9a9aa2; font-size: 11px; }
        @media print { body { margin: 18px 22px; } }
      </style></head><body>
      <h1>FMAC — ${t('Daily Operations Brief', 'موجز العمليات اليومي')}</h1>
      <div class="date">${dateLine}</div>
      <h2>${t('Operations snapshot', 'لمحة العمليات')}</h2>
      <table>${opsRows || `<tr><td class="empty">${t('Data still loading — reopen in a moment.', 'البيانات قيد التحميل — أعد المحاولة بعد لحظة.')}</td></tr>`}</table>
      <h2>${t('Needs attention', 'يتطلب الانتباه')}</h2>
      <table>${flagRows || `<tr><td class="empty">${t('All clear — nothing needs attention.', 'كل شيء على ما يرام.')}</td></tr>`}</table>
      <h2>${t('Latest stock movements', 'أحدث حركات المخزون')}</h2>
      <table>${moveRows || `<tr><td class="empty">${t('No stock movements yet.', 'لا توجد حركات مخزون بعد.')}</td></tr>`}</table>
      <div class="foot">${t('Generated from the live dashboard', 'أُنشئ من لوحة المعلومات المباشرة')} · ${new Date().toLocaleString(locale)}</div>
      </body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 350);
  };

  /* ── Derived ── */
  const attentionCount =
    (signals.overdueTickets > 0 ? 1 : 0) +
    (signals.pendingUsers > 0 ? 1 : 0) +
    (signals.outStock > 0 ? 1 : 0) +
    (signals.unapproved > 0 ? 1 : 0);

  /* Bell dropdown items — every live attention signal, tap-through */
  const bellItems = [
    signals.outStock > 0 && {
      key: 'stock', n: signals.outStock,
      label: t('items out of stock', 'صنف نفذ مخزونه'), path: '/inventory',
    },
    signals.unapproved > 0 && {
      key: 'sections', n: signals.unapproved,
      label: t('report sections unapproved', 'قسم تقرير غير معتمد'), path: '/reports',
    },
    signals.overdueTickets > 0 && {
      key: 'overdue', n: signals.overdueTickets,
      label: t('tickets past SLA', 'تذكرة تجاوزت الموعد'), path: '/help',
    },
    signals.pendingUsers > 0 && {
      key: 'pending', n: signals.pendingUsers,
      label: t('accounts awaiting approval', 'حساب بانتظار الموافقة'), path: '/users/dashboard',
    },
  ].filter(Boolean);

  const rangeLabel = {
    '1D': t('Distance today', 'المسافة اليوم'),
    '1W': t('Distance this week', 'المسافة هذا الأسبوع'),
    '1M': t('Distance this month', 'المسافة هذا الشهر'),
    '1Y': t('Distance this year', 'المسافة هذه السنة'),
  }[fleetRange];

  const monthName = new Date().toLocaleDateString(locale, { month: 'long' });

  /* Dark anchor card — single most urgent state, fixed priority order. */
  const urgency = (() => {
    if (signals.outStock > 0) {
      const cats = invStats?.topCats || [];
      return {
        n: signals.outStock,
        unit: t('items', 'صنفاً'),
        pill: t('out of stock', 'نفذ مخزونها'),
        line2: t('need reordering', 'بحاجة لإعادة الطلب'),
        body: cats.length >= 2
          ? t(`${cats[0]} and ${cats[1]} are the most affected categories this month.`,
              `${cats[0]} و${cats[1]} هما الفئتان الأكثر تأثراً هذا الشهر.`)
          : cats.length === 1
            ? t(`${cats[0]} is the most affected category this month.`,
                `${cats[0]} هي الفئة الأكثر تأثراً هذا الشهر.`)
            : t('Restock is needed across the warehouse.', 'المستودع بحاجة لإعادة تعبئة المخزون.'),
        cta: t('Review stock', 'مراجعة المخزون'),
        path: '/inventory',
      };
    }
    if (signals.unapproved > 0) {
      return {
        n: signals.unapproved,
        unit: t('sections', 'أقسام'),
        pill: t('unapproved', 'غير معتمدة'),
        line2: t('block this month’s report', 'تعطّل تقرير هذا الشهر'),
        body: t(`The ${monthName} report can only compile once every section is approved.`,
                `لا يمكن تجميع تقرير ${monthName} إلا بعد اعتماد جميع الأقسام.`),
        cta: t('Open reports', 'فتح التقارير'),
        path: '/reports',
      };
    }
    if (signals.overdueTickets > 0) {
      return {
        n: signals.overdueTickets,
        unit: t('tickets', 'تذاكر'),
        pill: t('overdue', 'متأخرة'),
        line2: t('are past their SLA deadline', 'تجاوزت الموعد المحدد للحل'),
        body: t('Overdue requests erode response-time commitments — clear them first.',
                'الطلبات المتأخرة تضعف الالتزام بزمن الاستجابة — عالجها أولاً.'),
        cta: t('Open help desk', 'فتح مركز الدعم'),
        path: '/help',
      };
    }
    return null;
  })();

  const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString(locale));

  /* ── Render ── */
  return (
    <motion.div className="odx" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
      {/* ── Header ── */}
      <header className="odx-head">
        <h1 className="odx-title">
          {getGreeting(t)}{firstName ? `, ${firstName}` : ''}
        </h1>
        <div className="odx-head-right">
          <div className="odx-toggles">
            <LanguageToggle />
            <ThemeToggle />
          </div>
          <div className="odx-head-icons">
            <button
              className="odx-icon-circle"
              aria-label={t('Search (Ctrl+K)', 'بحث (Ctrl+K)')}
              title="Ctrl+K"
              onClick={() => window.dispatchEvent(new CustomEvent('fmac:palette'))}
            >
              <Search size={15} strokeWidth={2} />
            </button>
            <button
              className="odx-icon-circle"
              aria-label={t('Print the daily brief', 'طباعة الموجز اليومي')}
              title={t('Daily brief', 'الموجز اليومي')}
              onClick={printBrief}
            >
              <FileText size={15} strokeWidth={2} />
            </button>
            <button
              className="odx-icon-circle"
              aria-label={t('Open the ops wallboard (TV mode)', 'فتح شاشة العمليات (وضع TV)')}
              title={t('Wallboard', 'شاشة العمليات')}
              onClick={() => navigate('/wallboard')}
            >
              <MonitorPlay size={15} strokeWidth={2} />
            </button>
            <div className="odx-bell-wrap" ref={bellRef}>
              <button
                className="odx-icon-circle"
                aria-label={t('Notifications', 'الإشعارات')}
                onClick={() => setBellOpen(v => !v)}
              >
                <Bell size={15} strokeWidth={2} />
                {attentionCount > 0 && <span className="odx-bell-dot" aria-hidden="true" />}
              </button>
              {bellOpen && (
                <div className="odx-bell-menu">
                  {bellItems.length === 0 ? (
                    <div className="odx-bell-none">
                      {t('All clear — nothing needs attention.', 'كل شيء على ما يرام.')}
                    </div>
                  ) : bellItems.map(item => (
                    <button
                      key={item.key}
                      className="odx-bell-item"
                      onClick={() => { setBellOpen(false); navigate(item.path); }}
                    >
                      <b dir="ltr">{item.n.toLocaleString(locale)}</b>
                      <span>{item.label}</span>
                      <ChevronRight size={13} strokeWidth={2} />
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button className="odx-user-pill" onClick={() => navigate('/profile')} aria-label={t('My Profile', 'ملفي الشخصي')}>
              <span className="odx-user-avatar">
                {userProfile?.photoURL ? (
                  <img src={userProfile.photoURL} alt="" />
                ) : (
                  (displayName || 'A').trim().charAt(0).toUpperCase()
                )}
              </span>
              <span className="odx-user-name">{firstName || t('Admin', 'مسؤول')}</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── Row 1 — tinted stat cards ── */}
      <div className="odx-row1">
        <div className="odx-col">
          <h2 className="odx-sec">{t('Fleet activity', 'نشاط الأسطول')}</h2>
          <div className="odx-card odx-card--red">
            <div className="odx-value" dir="ltr">
              {tripData?.totalKm == null ? '—' : `${tripData.totalKm.toLocaleString(locale)} ${t('km', 'كم')}`}
            </div>
            <div className="odx-label">{rangeLabel}</div>
            <div className="odx-chart" dir="ltr">
              {tripData && tripData.points.length > 0 && (
                <ResponsiveContainer width="100%" height={130}>
                  <AreaChart data={tripData.points} margin={{ top: 36, right: 10, left: 4, bottom: 2 }}>
                    <defs>
                      {/* The single permitted gradient: chart area fill */}
                      <linearGradient id="odxTripFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f7d6da" stopOpacity={1} />
                        <stop offset="100%" stopColor="#f7d6da" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area
                      type="monotone"
                      dataKey="v"
                      stroke={RED}
                      strokeWidth={2}
                      fill="url(#odxTripFill)"
                      isAnimationActive={false}
                      dot={(p) => {
                        const last = tripData.points.length - 1;
                        if (p.index !== last || p.cx == null) return <g key={`d-${p.index}`} />;
                        const label = `${tripData.points[last].v.toLocaleString(locale)} km`;
                        const w = label.length * 6.5 + 16;
                        const bx = p.cx - w - 10 < 0 ? p.cx + 10 : p.cx - w - 10;
                        return (
                          <g key={`d-${p.index}`}>
                            <rect x={bx} y={p.cy - 30} width={w} height={20} rx={10} fill="#0a0a0a" />
                            <text x={bx + w / 2} y={p.cy - 16} textAnchor="middle" fill="#ffffff" fontSize={10} fontWeight={600}>
                              {label}
                            </text>
                            <circle cx={p.cx} cy={p.cy} r={4} fill={RED} stroke="#ffffff" strokeWidth={2} />
                          </g>
                        );
                      }}
                      activeDot={{ r: 3.5, fill: RED, stroke: '#fdeef0', strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="odx-range-tabs" dir="ltr">
              {RANGES.map(r => (
                <button
                  key={r}
                  className={`odx-range-tab${fleetRange === r ? ' active' : ''}`}
                  onClick={() => changeRange(r)}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="odx-col">
          <h2 className="odx-sec">{t('Modules', 'الوحدات')}</h2>
          <button className="odx-card odx-card--purple" onClick={() => navigate('/reports')}>
            <div>
              <div className="odx-value" dir="ltr">
                {reportStats ? `${fmt(reportStats.approved)} / ${fmt(reportStats.total)}` : '—'}
              </div>
              <div className="odx-label">{t('Sections approved', 'الأقسام المعتمدة')}</div>
            </div>
            <div className="odx-card-foot">
              <span className="odx-chip odx-chip--purple"><BarChart2 size={16} strokeWidth={2} /></span>
              <span className="odx-sub odx-sub--purple">{monthName}</span>
            </div>
          </button>
        </div>

        <div className="odx-col">
          <div className="odx-sec-spacer" aria-hidden="true" />
          <button className="odx-card odx-card--green" onClick={() => navigate('/inventory')}>
            <div>
              <div className="odx-value" dir="ltr">{fmt(invStats?.total)}</div>
              <div className="odx-label">{t('Items in stock', 'أصناف في المخزون')}</div>
            </div>
            <div className="odx-card-foot">
              <span className="odx-chip odx-chip--green"><Package size={16} strokeWidth={2} /></span>
              <span className="odx-sub odx-sub--green">
                {invStats?.out != null ? `${fmt(invStats.out)} ${t('out', 'نفذ')}` : '—'}
              </span>
            </div>
          </button>
        </div>

        <div className="odx-col">
          <div className="odx-sec-spacer" aria-hidden="true" />
          <button className="odx-card odx-card--gold" onClick={() => navigate('/fleet/dashboard')}>
            <div>
              <div className="odx-value" dir="ltr">
                {fleetStatus ? `${fmt(fleetStatus.onRoute)} / ${fmt(fleetStatus.total)}` : '—'}
              </div>
              <div className="odx-label">{t('Buses on route', 'حافلات في الطريق')}</div>
            </div>
            <div className="odx-card-foot">
              <span className="odx-chip odx-chip--gold"><Bus size={16} strokeWidth={2} /></span>
              <span className="odx-sub odx-sub--gold">{t('Live', 'مباشر')}</span>
            </div>
          </button>
        </div>
      </div>

      {/* ── Row 2 — naked tickets table + dark anchor card ── */}
      <div className="odx-row2">
        <div className="odx-assetsblock">
          <div className="odx-table-head">
            <h2 className="odx-table-title" dir="ltr">
              {assetStats == null
                ? '—'
                : `${(assetStats.total ?? 0).toLocaleString(locale)} ${t('assets', 'أصلاً')} · ${(assetStats.missing ?? 0).toLocaleString(locale)} ${t('missing', 'مفقود')}`}
            </h2>
            <button className="odx-window-pill" onClick={() => navigate('/assets')}>
              {t('Open assets', 'فتح الأصول')} <ChevronRight size={12} strokeWidth={2} />
            </button>
          </div>

          {assetStats == null ? (
            <div className="odx-empty">—</div>
          ) : assetStats.rooms.length === 0 ? (
            <div className="odx-empty">{t('No assets registered yet', 'لا توجد أصول مسجلة بعد')}</div>
          ) : (
            <div className="odx-asset-rows">
              {(() => {
                const max = Math.max(...assetStats.rooms.map(r => r.count), 1);
                return assetStats.rooms.map(room => (
                  <button
                    key={room.key}
                    className="odx-asset-row"
                    onClick={() => navigate('/assets')}
                  >
                    <span className="odx-asset-name" dir="auto">
                      {lang === 'ar' ? room.ar : room.en}
                    </span>
                    <span className="odx-asset-track" dir="ltr">
                      <span className="odx-asset-fill" style={{ width: `${Math.max((room.count / max) * 100, 4)}%` }} />
                    </span>
                    <span className="odx-asset-count" dir="ltr">{room.count.toLocaleString(locale)}</span>
                  </button>
                ));
              })()}
            </div>
          )}
        </div>

        {/* Dark anchor card — the single most urgent operational state */}
        <div className="odx-dark">
          {urgency ? (
            <>
              <div className="odx-dark-line1" dir="ltr">
                <span>{fmt(urgency.n)} {urgency.unit}</span>
                <span className="odx-dark-pill">{urgency.pill}</span>
              </div>
              <div className="odx-dark-line2">{urgency.line2}</div>
              <p className="odx-dark-body">{urgency.body}</p>
              <button className="odx-dark-cta" onClick={() => navigate(urgency.path)}>
                {urgency.cta}
              </button>
            </>
          ) : (
            <>
              <div className="odx-dark-line2">{t('All clear', 'كل شيء على ما يرام')}</div>
              <p className="odx-dark-body">
                {t('No urgent operational state right now.', 'لا توجد حالة تشغيلية عاجلة حالياً.')}
              </p>
            </>
          )}
        </div>
      </div>

      {/* ── Stock movements — naked table, full width ── */}
      <div className="odx-moves">
        <h2 className="odx-table-title">{t('Latest stock movements', 'أحدث حركات المخزون')}</h2>
        <table className="odx-table">
          <thead>
            <tr>
              <th className="odx-th">{t('Item', 'الصنف')}</th>
              <th className="odx-th">{t('By', 'بواسطة')}</th>
              <th className="odx-th odx-th--end">{t('Qty', 'الكمية')}</th>
              <th className="odx-th odx-th--end">{t('Age', 'العمر')}</th>
            </tr>
          </thead>
          <tbody>
            {movements == null ? (
              <tr><td className="odx-td odx-td--empty" colSpan={4}>—</td></tr>
            ) : movements.length === 0 ? (
              <tr><td className="odx-td odx-td--empty" colSpan={4}>{t('No stock movements yet.', 'لا توجد حركات مخزون بعد.')}</td></tr>
            ) : movements.map(mv => {
              const isIn = mv.type === 'stock_in';
              return (
                <tr key={mv.id} className="odx-tr" onClick={() => navigate('/inventory')}>
                  <td className="odx-td">
                    <span className="odx-move-name" dir="auto">
                      {mv.itemNameAr || mv.itemNameEn || mv.itemSku}
                    </span>
                  </td>
                  <td className="odx-td odx-td--muted" dir="auto">
                    {mv.issuedTo?.personName || mv.performedByName || '—'}
                  </td>
                  <td className={`odx-td odx-td--end odx-qty ${isIn ? 'odx-qty--in' : 'odx-qty--out'}`} dir="ltr">
                    {isIn ? '+' : '−'}{mv.quantity}
                  </td>
                  <td className="odx-td odx-td--muted odx-td--end" dir="ltr">{ageShort(mv.createdAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
