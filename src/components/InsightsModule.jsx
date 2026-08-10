import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp, RefreshCw, LifeBuoy, Package, Users as UsersIcon,
  Building2, Bus,
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, AreaChart, Area, PieChart, Pie,
  Cell, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { db } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';
import { cartrackService } from '../services/cartrackService';
import { useLanguage } from '../contexts/LanguageContext';
import { usePermissions } from '../hooks/usePermissions';
import ModuleLock from './shared/ModuleLock';
import './InsightsModule.css';

const toMillis = (ts) => {
  if (!ts) return 0;
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const ms = d.getTime();
  return isNaN(ms) ? 0 : ms;
};

/* 8 trailing 7-day buckets, oldest → newest. Labels from bucket start. */
function weekBuckets(locale) {
  const buckets = [];
  for (let i = 7; i >= 0; i--) {
    const end = endOfDay(subDays(new Date(), i * 7));
    const start = startOfDay(subDays(new Date(), i * 7 + 6));
    buckets.push({
      start: start.getTime(),
      end: end.getTime(),
      label: new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(start),
    });
  }
  return buckets;
}

function monthBuckets(locale, n = 6) {
  const buckets = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: new Intl.DateTimeFormat(locale, { month: 'short' }).format(d),
    });
  }
  return buckets;
}

const TOOLTIP_STYLE = {
  backgroundColor: 'var(--theme-surface)',
  border: '1px solid var(--theme-border)',
  borderRadius: '12px',
  fontSize: '12px',
};

const ASSET_STATUS_COLORS = ['#0e7490', '#c23934', '#a17708', '#52525a', '#6d4fc4', '#2563eb'];

const hasData = (d) => Array.isArray(d) && d.some(row =>
  Object.values(row).some(v => typeof v === 'number' && v > 0)
);

function Card({ icon: Icon, color, title, sub, data, t, children }) {
  return (
    <section className="ins-card">
      <div className="ins-card-head">
        <span className="ins-card-icon" style={{ color }}><Icon size={15} strokeWidth={1.9} /></span>
        <div>
          <h2 className="ins-card-title">{title}</h2>
          <p className="ins-card-sub">{sub}</p>
        </div>
      </div>
      {data === undefined ? (
        <div className="ins-card-state">{t('Loading…', 'جارٍ التحميل…')}</div>
      ) : !hasData(data) ? (
        <div className="ins-card-state">{t('Nothing recorded in this window.', 'لا شيء مسجل في هذه الفترة.')}</div>
      ) : (
        children
      )}
    </section>
  );
}

export default function InsightsModule() {
  const { t, locale } = useLanguage();
  const { isMasterAdmin, isHOD, userProfile } = usePermissions();
  // Absent key = legacy account from before insights joined the permission grid.
  const insightsAllowed = isMasterAdmin || isHOD || userProfile?.permissions?.insights !== 'none';

  /* Each chart loads independently: undefined = loading, [] = empty/failed */
  const [tickets, setTickets] = useState();
  const [stockFlow, setStockFlow] = useState();
  const [attendance, setAttendance] = useState();
  const [assetStatus, setAssetStatus] = useState();
  const [fleetKm, setFleetKm] = useState();
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const weeks = weekBuckets(locale);
    const months = monthBuckets(locale);

    await Promise.allSettled([
      /* Tickets per month (6 months) */
      (async () => {
        try {
          const snap = await getDocs(collection(db, 'requests'));
          const byMonth = Object.fromEntries(months.map(m => [m.key, { opened: 0, closed: 0 }]));
          snap.docs.forEach(d => {
            const r = d.data();
            const ms = toMillis(r.createdAt);
            if (!ms) return;
            const dd = new Date(ms);
            const key = `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, '0')}`;
            if (key in byMonth) {
              byMonth[key].opened += 1;
              if (r.status === 'closed') byMonth[key].closed += 1;
            }
          });
          setTickets(months.map(m => ({ label: m.label, ...byMonth[m.key] })));
        } catch { setTickets([]); }
      })(),

      /* Stock in vs out per week (8 weeks) */
      (async () => {
        try {
          const snap = await getDocs(collection(db, 'inventory_movements'));
          const rows = weeks.map(w => ({ label: w.label, in: 0, out: 0 }));
          snap.docs.forEach(d => {
            const m = d.data();
            const ms = toMillis(m.createdAt);
            const idx = weeks.findIndex(w => ms >= w.start && ms <= w.end);
            if (idx === -1) return;
            const qty = Number(m.quantity) || 0;
            if (m.type === 'stock_in') rows[idx].in += qty;
            else rows[idx].out += qty;
          });
          setStockFlow(rows);
        } catch { setStockFlow([]); }
      })(),

      /* Attendance per week (sessions.presentCount, doc ids YYYY-MM-DD…) */
      (async () => {
        try {
          const snap = await getDocs(collection(db, 'sessions'));
          const rows = weeks.map(w => ({ label: w.label, present: 0 }));
          snap.docs.forEach(d => {
            const dateStr = d.id.slice(0, 10);
            const ms = new Date(`${dateStr}T12:00:00`).getTime();
            if (isNaN(ms)) return;
            const idx = weeks.findIndex(w => ms >= w.start && ms <= w.end);
            if (idx === -1) return;
            rows[idx].present += Number(d.data().presentCount) || 0;
          });
          setAttendance(rows);
        } catch { setAttendance([]); }
      })(),

      /* Assets by status (donut) */
      (async () => {
        try {
          const snap = await getDocs(collection(db, 'assets'));
          const byStatus = {};
          snap.docs.forEach(d => {
            const s = d.data().status || 'Unknown';
            byStatus[s] = (byStatus[s] || 0) + 1;
          });
          setAssetStatus(
            Object.entries(byStatus)
              .sort((a, b) => b[1] - a[1])
              .map(([name, value], i) => ({ name, value, fill: ASSET_STATUS_COLORS[i % ASSET_STATUS_COLORS.length] }))
          );
        } catch { setAssetStatus([]); }
      })(),

      /* Fleet distance per week — one Cartrack call over the 8-week span */
      (async () => {
        try {
          const start = format(new Date(weeks[0].start), 'yyyy-MM-dd HH:mm:ss');
          const end = format(new Date(weeks[weeks.length - 1].end), 'yyyy-MM-dd HH:mm:ss');
          const trips = (await cartrackService.getTrips(start, end)) || [];
          const rows = weeks.map(w => ({ label: w.label, km: 0 }));
          const seen = new Set();
          trips.forEach(tr => {
            const dist = parseFloat(tr.trip_distance) || 0;
            if (dist <= 0 || !tr.start_timestamp) return;
            const key = tr.trip_id ? String(tr.trip_id) : `${tr.registration}-${tr.start_timestamp}-${dist}`;
            if (seen.has(key)) return;
            seen.add(key);
            const ms = new Date(tr.start_timestamp.replace(' ', 'T')).getTime();
            const idx = weeks.findIndex(w => ms >= w.start && ms <= w.end);
            if (idx === -1) return;
            rows[idx].km += dist / 1000;
          });
          setFleetKm(rows.map(r => ({ ...r, km: Math.round(r.km) })));
        } catch { setFleetKm([]); }
      })(),
    ]);

    setRefreshing(false);
  }, [locale]);

  // All state writes in load() happen after fetches settle (async) —
  // same pattern/waiver as useIsMobile.js.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  if (!insightsAllowed) return <ModuleLock />;

  return (
    <motion.div className="ins" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
      <div className="ins-head">
        <div>
          <h1 className="ins-title">{t('Executive Insights', 'الرؤى التنفيذية')}</h1>
          <p className="ins-sub">
            {t('Cross-module trends — the operation at a glance, over time.', 'اتجاهات عبر الوحدات — العمليات في لمحة، عبر الزمن.')}
          </p>
        </div>
        <button
          className="ins-refresh"
          onClick={() => { setRefreshing(true); setTickets(); setStockFlow(); setAttendance(); setAssetStatus(); setFleetKm(); load(); }}
          disabled={refreshing}
        >
          <RefreshCw size={13} className={refreshing ? 'ins-spin' : undefined} />
          {t('Refresh', 'تحديث')}
        </button>
      </div>

      <div className="ins-grid">
        <Card t={t} icon={Bus} color="#8a6d1f" data={fleetKm}
          title={t('Fleet distance', 'مسافة الأسطول')}
          sub={t('km per week — camera group, last 8 weeks', 'كم أسبوعياً — آخر 8 أسابيع')}>
          <ResponsiveContainer width="100%" height={190}>
            <AreaChart data={fleetKm || []} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--theme-border)" />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: 'var(--theme-text-ghost)', fontSize: 10.5 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--theme-text-ghost)', fontSize: 10.5 }} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${Number(v).toLocaleString(locale)} km`, t('Distance', 'المسافة')]} />
              <Area type="monotone" dataKey="km" stroke="#8a6d1f" strokeWidth={2} fill="#f8f3e6" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <Card t={t} icon={UsersIcon} color="#a32d2d" data={attendance}
          title={t('Attendance', 'الحضور')}
          sub={t('players present per week, last 8 weeks', 'لاعب حاضر أسبوعياً — آخر 8 أسابيع')}>
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={attendance || []} barCategoryGap="30%" margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--theme-border)" />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: 'var(--theme-text-ghost)', fontSize: 10.5 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--theme-text-ghost)', fontSize: 10.5 }} />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'var(--theme-surface-hover)' }} formatter={(v) => [v, t('present', 'حاضر')]} />
              <Bar dataKey="present" fill="#fdeef0" stroke="#a32d2d" strokeWidth={1} radius={[99, 99, 99, 99]} maxBarSize={18} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card t={t} icon={Package} color="#0c7a58" data={stockFlow}
          title={t('Stock flow', 'حركة المخزون')}
          sub={t('units in vs out per week, last 8 weeks', 'وحدات واردة/صادرة أسبوعياً — آخر 8 أسابيع')}>
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={stockFlow || []} barCategoryGap="26%" margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--theme-border)" />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: 'var(--theme-text-ghost)', fontSize: 10.5 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--theme-text-ghost)', fontSize: 10.5 }} />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'var(--theme-surface-hover)' }} />
              <Bar dataKey="in" name={t('In', 'وارد')} fill="#0c7a58" radius={[99, 99, 99, 99]} maxBarSize={10} isAnimationActive={false} />
              <Bar dataKey="out" name={t('Out', 'صادر')} fill="#c23934" radius={[99, 99, 99, 99]} maxBarSize={10} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card t={t} icon={LifeBuoy} color="#2563eb" data={tickets}
          title={t('Help desk volume', 'حجم مركز الدعم')}
          sub={t('tickets opened vs closed per month, last 6 months', 'تذاكر مفتوحة/مغلقة شهرياً — آخر 6 أشهر')}>
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={tickets || []} barCategoryGap="30%" margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--theme-border)" />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: 'var(--theme-text-ghost)', fontSize: 10.5 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--theme-text-ghost)', fontSize: 10.5 }} />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'var(--theme-surface-hover)' }} />
              <Bar dataKey="opened" name={t('Opened', 'فُتحت')} fill="#2563eb" radius={[99, 99, 99, 99]} maxBarSize={10} isAnimationActive={false} />
              <Bar dataKey="closed" name={t('Closed', 'أُغلقت')} fill="#e8f0fd" stroke="#2563eb" strokeWidth={1} radius={[99, 99, 99, 99]} maxBarSize={10} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card t={t} icon={Building2} color="#0e7490" data={assetStatus}
          title={t('Asset condition', 'حالة الأصول')}
          sub={t('registry split by status', 'توزيع السجل حسب الحالة')}>
          <div className="ins-donut-wrap">
            <ResponsiveContainer width="100%" height={190}>
              <PieChart>
                <Pie
                  data={assetStatus || []}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={52}
                  outerRadius={78}
                  paddingAngle={2}
                  isAnimationActive={false}
                >
                  {(assetStatus || []).map(s => <Cell key={s.name} fill={s.fill} />)}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} />
              </PieChart>
            </ResponsiveContainer>
            <div className="ins-legend">
              {(assetStatus || []).map(s => (
                <span key={s.name} className="ins-legend-item">
                  <span className="ins-legend-dot" style={{ background: s.fill }} />
                  {s.name} <b dir="ltr">{s.value.toLocaleString(locale)}</b>
                </span>
              ))}
            </div>
          </div>
        </Card>
      </div>

      <p className="ins-foot">
        <TrendingUp size={12} strokeWidth={2} />
        {t('Weekly buckets are trailing 7-day windows ending today.', 'الفترات الأسبوعية هي نوافذ 7 أيام تنتهي اليوم.')}
      </p>
    </motion.div>
  );
}
