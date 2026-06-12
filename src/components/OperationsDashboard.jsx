import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Bus, Package2, LifeBuoy, Users, BarChart2, Package, ArrowRight,
  AlertTriangle, UserPlus, CheckCircle2, FileWarning, PackageX,
  ArrowUpRight, ArrowDownRight, Activity, ChevronRight, Timer,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { collection, getDocs, query } from 'firebase/firestore';
import { cartrackService } from '../services/cartrackService';
import { useLanguage } from '../contexts/LanguageContext';
import './OperationsDashboard.css';

const MODULE_CARDS_DEF = [
  { id: 'fleet',     en: 'Fleet Management',  ar: 'إدارة الأسطول',    icon: Bus,      accent: '#f59e0b', accentSoft: 'rgba(245,158,11,0.10)', accentBorder: 'rgba(245,158,11,0.25)', accentGlow: 'rgba(245,158,11,0.18)', path: '/fleet/dashboard' },
  { id: 'logistics', en: 'Logistics Hub',      ar: 'مركز اللوجستيات', icon: Package2, accent: '#3b82f6', accentSoft: 'rgba(59,130,246,0.10)', accentBorder: 'rgba(59,130,246,0.25)', accentGlow: 'rgba(59,130,246,0.18)', path: '/logistics/attendance' },
  { id: 'help',      en: 'Help Desk',          ar: 'مركز الدعم',       icon: LifeBuoy, accent: '#f43f5e', accentSoft: 'rgba(244,63,94,0.10)',  accentBorder: 'rgba(244,63,94,0.25)',  accentGlow: 'rgba(244,63,94,0.18)',  path: '/help' },
  { id: 'users',     en: 'User Management',    ar: 'إدارة المستخدمين', icon: Users,    accent: '#8b5cf6', accentSoft: 'rgba(139,92,246,0.10)', accentBorder: 'rgba(139,92,246,0.25)', accentGlow: 'rgba(139,92,246,0.18)', path: '/users/dashboard' },
  { id: 'reports',   en: 'Dept. Reports',      ar: 'تقارير الأقسام',  icon: BarChart2,accent: '#10b981', accentSoft: 'rgba(16,185,129,0.10)', accentBorder: 'rgba(16,185,129,0.25)', accentGlow: 'rgba(16,185,129,0.18)', path: '/reports' },
  { id: 'inventory', en: 'Inventory',           ar: 'المخزون',          icon: Package,  accent: '#f97316', accentSoft: 'rgba(249,115,22,0.10)', accentBorder: 'rgba(249,115,22,0.25)', accentGlow: 'rgba(249,115,22,0.18)', path: '/inventory' },
];

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

const timeAgo = (ts, lang) => {
  const ms = toMillis(ts);
  if (!ms) return '—';
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (lang === 'ar') {
    if (mins < 1) return 'الآن';
    if (mins < 60) return `منذ ${mins} د`;
    if (hours < 24) return `منذ ${hours} س`;
    return `منذ ${days} يوم`;
  }
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
};

const TICKET_STATUS = {
  new:      { en: 'New',         ar: 'جديد',        color: '#f43f5e' },
  progress: { en: 'In Progress', ar: 'قيد التنفيذ', color: '#f59e0b' },
  closed:   { en: 'Closed',      ar: 'مغلق',        color: '#10b981' },
};

export default function OperationsDashboard({ userProfile }) {
  const navigate = useNavigate();
  const { t, lang, locale } = useLanguage();
  const MODULE_CARDS = MODULE_CARDS_DEF.map(mod => ({ ...mod, label: t(mod.en, mod.ar) }));

  const [moduleData, setModuleData] = useState({
    fleet:     { loading: true },
    logistics: { loading: true },
    help:      { loading: true },
    users:     { loading: true },
    reports:   { loading: true },
    inventory: { loading: true },
  });

  // Raw signals that drive the "Needs Attention" strip.
  const [signals, setSignals] = useState({});
  // Live feeds
  const [ticketFeed, setTicketFeed] = useState(null);   // null = loading
  const [movementFeed, setMovementFeed] = useState(null);

  const displayName =
    userProfile?.displayName ||
    userProfile?.email?.split('@')[0] ||
    t('there', 'هناك');

  useEffect(() => {
    Promise.allSettled([
      fetchFleetData(),
      fetchLogisticsData(),
      fetchHelpData(),
      fetchUsersData(),
      fetchReportsData(),
      fetchInventoryData(),
      fetchMovements(),
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setData = (id, data) =>
    setModuleData(prev => ({ ...prev, [id]: { loading: false, ...data } }));

  const mergeSignals = (patch) => setSignals(prev => ({ ...prev, ...patch }));

  const fetchFleetData = async () => {
    try {
      const [vehicles, maintSnap] = await Promise.all([
        cartrackService.getVehicles(),
        getDocs(query(collection(db, 'maintenance'))),
      ]);
      const active = vehicles ? vehicles.filter(v => v.ignition).length : 0;
      setData('fleet', {
        kpis: [
          { label: t('On Route', 'في الطريق'),          value: active, hero: true },
          { label: t('Total Fleet', 'إجمالي الأسطول'), value: vehicles ? vehicles.length : 14 },
          { label: t('Maint. Jobs', 'مهام الصيانة'),    value: maintSnap.size },
        ],
      });
    } catch {
      setData('fleet', {
        kpis: [
          { label: t('On Route', 'في الطريق'),          value: '—', hero: true },
          { label: t('Total Fleet', 'إجمالي الأسطول'), value: 14 },
          { label: t('Maint. Jobs', 'مهام الصيانة'),    value: '—' },
        ],
      });
    }
  };

  const fetchLogisticsData = async () => {
    try {
      const today = new Date().toLocaleDateString('en-CA');
      const [playersSnap, sessionsSnap] = await Promise.all([
        getDocs(collection(db, 'players_v2')),
        getDocs(collection(db, 'sessions')),
      ]);
      const todaySessions = sessionsSnap.docs.filter(d => d.id.startsWith(today));
      setData('logistics', {
        kpis: [
          { label: t('Sessions Today', 'جلسات اليوم'), value: todaySessions.length, hero: true },
          { label: t('Players Registered', 'لاعب مسجّل'), value: playersSnap.size },
        ],
      });
    } catch {
      setData('logistics', {
        kpis: [
          { label: t('Sessions Today', 'جلسات اليوم'),    value: '—', hero: true },
          { label: t('Players Registered', 'لاعب مسجّل'), value: '—' },
        ],
      });
    }
  };

  const fetchHelpData = async () => {
    try {
      const snap = await getDocs(collection(db, 'requests'));
      const requests = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const open = requests.filter(r => r.status === 'new' || r.status === 'progress').length;
      const overdue = requests.filter(
        r => r.slaDeadline?.toDate && r.slaDeadline.toDate() < new Date() && r.status !== 'closed'
      ).length;

      setData('help', {
        kpis: [
          { label: t('Open', 'مفتوح'),    value: open, hero: true },
          { label: t('Overdue', 'متأخر'), value: overdue, alert: overdue > 0 },
          { label: t('Total', 'الإجمالي'), value: requests.length },
        ],
      });
      mergeSignals({ openTickets: open, overdueTickets: overdue });

      // Latest 5 tickets for the feed
      const latest = [...requests]
        .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))
        .slice(0, 5);
      setTicketFeed(latest);
    } catch {
      setData('help', {
        kpis: [
          { label: t('Open', 'مفتوح'),     value: '—', hero: true },
          { label: t('Overdue', 'متأخر'),  value: '—' },
          { label: t('Total', 'الإجمالي'), value: '—' },
        ],
      });
      setTicketFeed([]);
    }
  };

  const fetchUsersData = async () => {
    try {
      const snap = await getDocs(collection(db, 'users'));
      const users = snap.docs.map(d => d.data());
      // "Active" matches the login check + User Management badge:
      // approved flag OR approved/active status.
      const active = users.filter(u =>
        u.approved === true || u.status === 'approved' || u.status === 'active'
      ).length;
      const pending = users.filter(u => u.status === 'pending').length;
      setData('users', {
        kpis: [
          { label: t('Active', 'نشط'),     value: active, hero: true },
          { label: t('Pending', 'معلق'),   value: pending, alert: pending > 0 },
          { label: t('Total', 'الإجمالي'), value: users.length },
        ],
      });
      mergeSignals({ pendingUsers: pending });
    } catch {
      setData('users', {
        kpis: [
          { label: t('Active', 'نشط'),     value: '—', hero: true },
          { label: t('Pending', 'معلق'),   value: '—' },
          { label: t('Total', 'الإجمالي'), value: '—' },
        ],
      });
    }
  };

  const fetchReportsData = async () => {
    try {
      // Sections live in their own collection keyed by reportId 'YYYY-MM'.
      const now = new Date();
      const monthId = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const [reportsSnap, sectionsSnap] = await Promise.all([
        getDocs(collection(db, 'monthly_reports')),
        getDocs(query(collection(db, 'report_sections'))),
      ]);
      const reportsThisYear = reportsSnap.docs.filter(d => d.id.startsWith(String(now.getFullYear()))).length;
      const monthSections = sectionsSnap.docs.map(d => d.data()).filter(s => s.reportId === monthId);
      const approved = monthSections.filter(s => s.status === 'approved').length;
      const total = monthSections.length;

      setData('reports', {
        kpis: [
          {
            label: t('This Month Approved', 'المعتمد هذا الشهر'),
            value: total ? `${approved}/${total}` : t('Not started', 'لم يبدأ'),
            hero: true,
          },
          { label: t('Reports This Year', 'تقارير هذا العام'), value: reportsThisYear },
        ],
      });
      mergeSignals({ reportApproved: approved, reportTotal: total });
    } catch {
      setData('reports', {
        kpis: [
          { label: t('This Month Approved', 'المعتمد هذا الشهر'), value: '—', hero: true },
          { label: t('Reports This Year', 'تقارير هذا العام'),    value: '—' },
        ],
      });
    }
  };

  const fetchInventoryData = async () => {
    try {
      const snap = await getDocs(query(collection(db, 'inventory_items')));
      const items = snap.docs.map(d => d.data()).filter(i => i.isActive !== false);
      const lowStock = items.filter(i => i.currentStock > 0 && i.currentStock <= (i.minThreshold ?? 5)).length;
      const outStock = items.filter(i => i.currentStock === 0).length;
      setData('inventory', {
        kpis: [
          { label: t('Total Items', 'إجمالي الأصناف'), value: items.length, hero: true },
          { label: t('Low Stock', 'مخزون منخفض'),      value: lowStock, alert: lowStock > 0 },
          { label: t('Out of Stock', 'نفذ المخزون'),   value: outStock, alert: outStock > 0 },
        ],
      });
      mergeSignals({ lowStock, outStock });
    } catch {
      setData('inventory', {
        kpis: [
          { label: t('Total Items', 'إجمالي الأصناف'), value: '—', hero: true },
          { label: t('Low Stock', 'مخزون منخفض'),      value: '—' },
          { label: t('Out of Stock', 'نفذ المخزون'),   value: '—' },
        ],
      });
    }
  };

  const fetchMovements = async () => {
    try {
      const snap = await getDocs(collection(db, 'inventory_movements'));
      const latest = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))
        .slice(0, 5);
      setMovementFeed(latest);
    } catch {
      setMovementFeed([]);
    }
  };

  /* ── Needs-Attention items derived from signals ── */
  const attention = [];
  if (signals.overdueTickets > 0) {
    attention.push({
      key: 'overdue', urgent: true, icon: Timer, color: '#f43f5e', path: '/help',
      count: signals.overdueTickets,
      label: t('tickets past their SLA deadline', 'تذكرة تجاوزت موعد الحل'),
    });
  }
  if (signals.pendingUsers > 0) {
    attention.push({
      key: 'pending-users', icon: UserPlus, color: '#8b5cf6', path: '/users/dashboard',
      count: signals.pendingUsers,
      label: t('account requests waiting for approval', 'طلب حساب بانتظار الموافقة'),
    });
  }
  if (signals.outStock > 0) {
    attention.push({
      key: 'out-stock', icon: PackageX, color: '#f97316', path: '/inventory',
      count: signals.outStock,
      label: t('inventory items out of stock', 'صنف نفذ من المخزون'),
    });
  }
  if (signals.openTickets > 0 && !signals.overdueTickets) {
    attention.push({
      key: 'open-tickets', icon: LifeBuoy, color: '#f59e0b', path: '/help',
      count: signals.openTickets,
      label: t('open support tickets to handle', 'تذكرة دعم مفتوحة للمعالجة'),
    });
  }
  if (signals.reportTotal > 0 && signals.reportApproved < signals.reportTotal) {
    attention.push({
      key: 'report', icon: FileWarning, color: '#10b981', path: '/reports',
      count: signals.reportTotal - signals.reportApproved,
      label: t('report sections still unapproved this month', 'قسم تقرير غير معتمد هذا الشهر'),
    });
  }
  const signalsReady = ['openTickets', 'pendingUsers', 'lowStock'].every(k => k in signals);

  const dateString = new Date().toLocaleDateString(locale, {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <div className="ops-dash">
      {/* ── Header ── */}
      <motion.div
        className="ops-dash-header"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="ops-dash-greeting">
          <span className="ops-dash-greeting-text">
            {getGreeting(t)}, {displayName}
          </span>
          <span className="ops-dash-date">{dateString}</span>
        </div>
        <span className="ops-dash-tagline">{t('Operations Overview', 'نظرة عامة على العمليات')}</span>
      </motion.div>

      {/* ── Needs Attention strip ── */}
      {signalsReady && (
        <motion.section
          className="ops-attn"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        >
          {attention.length === 0 ? (
            <div className="ops-attn-clear">
              <CheckCircle2 size={18} />
              <span>{t('All clear — nothing needs your attention right now.', 'كل شيء على ما يرام — لا يوجد ما يتطلب انتباهك حالياً.')}</span>
            </div>
          ) : (
            <>
              <div className="ops-attn-title">
                <AlertTriangle size={14} />
                {t('Needs attention', 'يتطلب انتباهك')}
                <span className="ops-attn-count">{attention.length}</span>
              </div>
              <div className="ops-attn-row">
                {attention.map((a, i) => {
                  const Icon = a.icon;
                  return (
                    <motion.button
                      key={a.key}
                      className={`ops-attn-item${a.urgent ? ' urgent' : ''}`}
                      style={{ '--attn-color': a.color }}
                      onClick={() => navigate(a.path)}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05, duration: 0.3 }}
                    >
                      <span className="ops-attn-icon"><Icon size={15} strokeWidth={2} /></span>
                      <span className="ops-attn-num">{a.count}</span>
                      <span className="ops-attn-label">{a.label}</span>
                      <ChevronRight size={14} className="ops-attn-go" />
                    </motion.button>
                  );
                })}
              </div>
            </>
          )}
        </motion.section>
      )}

      {/* ── Module cards ── */}
      <div className="ops-dash-grid">
        {MODULE_CARDS.map((mod, i) => {
          const data = moduleData[mod.id];
          const isLoading = data?.loading;
          const kpis = data?.kpis || [];

          return (
            <motion.div
              key={mod.id}
              className="ops-dash-card"
              style={{
                '--card-accent':        mod.accent,
                '--card-accent-soft':   mod.accentSoft,
                '--card-accent-border': mod.accentBorder,
                '--card-accent-glow':   mod.accentGlow,
              }}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.05, duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
              onClick={() => navigate(mod.path)}
            >
              <div className="ops-dash-card-header">
                <div className="ops-dash-card-icon">
                  <mod.icon size={22} strokeWidth={1.75} />
                </div>
                <div className="ops-dash-card-title">
                  <span className="ops-dash-card-name">{mod.label}</span>
                  <span className="ops-dash-card-badge live">{t('Live', 'مباشر')}</span>
                </div>
                <div className="ops-dash-card-arrow">
                  <ArrowRight size={15} strokeWidth={2} />
                </div>
              </div>

              {isLoading ? (
                <div className="ops-dash-card-loading">
                  <div className="app-loader">
                    <span /><span /><span /><span /><span />
                  </div>
                </div>
              ) : (
                <div className="ops-dash-card-kpis">
                  {kpis.map((kpi, j) => (
                    <div key={j} className={`ops-dash-kpi${kpi.alert ? ' alert' : ''}${kpi.hero ? ' hero' : ''}`}>
                      <span className="ops-dash-kpi-value">{kpi.value}</span>
                      <span className="ops-dash-kpi-label">{kpi.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* ── Activity feeds ── */}
      <div className="ops-feeds">
        {/* Help Desk feed */}
        <motion.section
          className="ops-feed"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="ops-feed-head">
            <h3><LifeBuoy size={15} /> {t('Latest Tickets', 'أحدث التذاكر')}</h3>
            <button className="ops-feed-link" onClick={() => navigate('/help')}>
              {t('View all', 'عرض الكل')} <ChevronRight size={13} />
            </button>
          </div>
          {ticketFeed === null ? (
            <div className="ops-feed-loading"><div className="app-loader"><span /><span /><span /><span /><span /></div></div>
          ) : ticketFeed.length === 0 ? (
            <div className="ops-feed-empty">{t('No tickets yet.', 'لا توجد تذاكر بعد.')}</div>
          ) : (
            <div className="ops-feed-list">
              {ticketFeed.map(r => {
                const sm = TICKET_STATUS[r.status] || TICKET_STATUS.new;
                return (
                  <button key={r.id} className="ops-feed-item" onClick={() => navigate(`/help/requests/${r.id}`)}>
                    <span className="ops-feed-dot" style={{ background: sm.color }} />
                    <div className="ops-feed-main">
                      <span className="ops-feed-title">
                        {r.ticketNumber || r.id.slice(0, 8)}
                        <em>{(r.type || '').toUpperCase()}</em>
                      </span>
                      <span className="ops-feed-sub">{r.userInfo?.name || '—'}</span>
                    </div>
                    <span className="ops-feed-pill" style={{ color: sm.color, background: `${sm.color}14`, borderColor: `${sm.color}35` }}>
                      {lang === 'ar' ? sm.ar : sm.en}
                    </span>
                    <span className="ops-feed-time">{timeAgo(r.createdAt, lang)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </motion.section>

        {/* Inventory movements feed */}
        <motion.section
          className="ops-feed"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.42, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="ops-feed-head">
            <h3><Activity size={15} /> {t('Latest Stock Movements', 'أحدث حركات المخزون')}</h3>
            <button className="ops-feed-link" onClick={() => navigate('/inventory')}>
              {t('View all', 'عرض الكل')} <ChevronRight size={13} />
            </button>
          </div>
          {movementFeed === null ? (
            <div className="ops-feed-loading"><div className="app-loader"><span /><span /><span /><span /><span /></div></div>
          ) : movementFeed.length === 0 ? (
            <div className="ops-feed-empty">{t('No stock movements yet.', 'لا توجد حركات مخزون بعد.')}</div>
          ) : (
            <div className="ops-feed-list">
              {movementFeed.map(mv => {
                const isIn = mv.type === 'stock_in';
                const color = isIn ? '#10b981' : '#f43f5e';
                const MvIcon = isIn ? ArrowUpRight : ArrowDownRight;
                return (
                  <button key={mv.id} className="ops-feed-item" onClick={() => navigate('/inventory')}>
                    <span className="ops-feed-mv-icon" style={{ color, background: `${color}14` }}>
                      <MvIcon size={13} strokeWidth={2.5} />
                    </span>
                    <div className="ops-feed-main">
                      <span className="ops-feed-title" dir="auto">{mv.itemNameAr || mv.itemNameEn || mv.itemSku}</span>
                      <span className="ops-feed-sub">
                        {mv.issuedTo?.personName || mv.performedByName || '—'}
                      </span>
                    </div>
                    <span className="ops-feed-qty" style={{ color }}>
                      {isIn ? '+' : '−'}{mv.quantity}
                    </span>
                    <span className="ops-feed-time">{timeAgo(mv.createdAt, lang)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </motion.section>
      </div>
    </div>
  );
}
