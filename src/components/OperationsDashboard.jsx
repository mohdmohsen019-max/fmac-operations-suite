import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { db } from '../firebase';
import { collection, getDocs, query } from 'firebase/firestore';
import { cartrackService } from '../services/cartrackService';
import { canonicalFleetRegistration, deduplicateCanonicalTrips, mergeCanonicalVehicles } from '../services/fleetIdentity';
import { useLanguage } from '../contexts/LanguageContext';
import FujairahCommandDashboard from './dashboard/FujairahCommandDashboard';
import './OperationsDashboard.css';

/* Camera-group plates (mirrors the fleet module's registration filter). */
const FLEET_PLATES = [
  'A21248', 'A33867', 'A33876', 'C29769', 'C37069',
  'C37072', 'C37074', 'C37075', 'M85750', 'M85751',
  'M85756', 'M85759', 'M99268', 'M99270',
];

const isFleetPlate = (registration) => {
  const reg = canonicalFleetRegistration(registration);
  return FLEET_PLATES.includes(reg);
};

const toMillis = (timestamp) => {
  if (!timestamp) return 0;
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
};

const getGreeting = (t) => {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return t('Good morning', 'صباح الخير');
  if (h >= 12 && h < 17) return t('Good afternoon', 'مساء الخير');
  return t('Good evening', 'مساء الخير');
};


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
      const vehicles = mergeCanonicalVehicles((await cartrackService.getVehicles()) || []);
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

      const trips = deduplicateCanonicalTrips(raw).filter(trip => {
        if (!isFleetPlate(trip.registration)) return false;
        const dist = parseFloat(trip.trip_distance) || 0;
        if (dist <= 0) return false;
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

  /* Render */
  return (
    <FujairahCommandDashboard
      t={t}
      lang={lang}
      locale={locale}
      navigate={navigate}
      userProfile={userProfile}
      displayName={displayName}
      firstName={firstName}
      greeting={getGreeting(t)}
      printBrief={printBrief}
      bellOpen={bellOpen}
      setBellOpen={setBellOpen}
      bellRef={bellRef}
      attentionCount={attentionCount}
      bellItems={bellItems}
      urgency={urgency}
      signals={signals}
      tripData={tripData}
      fleetRange={fleetRange}
      changeRange={changeRange}
      rangeLabel={rangeLabel}
      fleetStatus={fleetStatus}
      reportStats={reportStats}
      invStats={invStats}
      assetStats={assetStats}
      movements={movements}
      monthName={monthName}
      fmt={fmt}
    />
  );
}
