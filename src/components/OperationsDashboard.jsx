import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Bus, Package2, LifeBuoy, Users, BarChart2, Package, ArrowRight, Wrench } from 'lucide-react';
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

export default function OperationsDashboard({ userProfile }) {
  const navigate = useNavigate();
  const { t, locale } = useLanguage();
  const MODULE_CARDS = MODULE_CARDS_DEF.map(mod => ({ ...mod, label: t(mod.en, mod.ar) }));
  const [moduleData, setModuleData] = useState({
    fleet:     { loading: true },
    logistics: { loading: true },
    help:      { loading: true },
    users:     { loading: true },
    reports:   { loading: true },
    inventory: { loading: true },
  });

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
    ]);
  }, []);

  const setData = (id, data) =>
    setModuleData(prev => ({ ...prev, [id]: { loading: false, ...data } }));

  const fetchFleetData = async () => {
    try {
      const [vehicles, maintSnap] = await Promise.all([
        cartrackService.getVehicles(),
        getDocs(query(collection(db, 'maintenance'))),
      ]);
      const active = vehicles ? vehicles.filter(v => v.ignition).length : 0;
      setData('fleet', {
        kpis: [
          { label: t('Total Fleet', 'إجمالي الأسطول'),   value: vehicles ? vehicles.length : 14 },
          { label: t('On Route', 'في الطريق'),            value: active },
          { label: t('Maint. Jobs', 'مهام الصيانة'),     value: maintSnap.size },
        ],
      });
    } catch {
      setData('fleet', {
        kpis: [
          { label: t('Total Fleet', 'إجمالي الأسطول'), value: 14 },
          { label: t('On Route', 'في الطريق'),          value: '—' },
          { label: t('Maint. Jobs', 'مهام الصيانة'),   value: '—' },
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
          { label: t('Registered', 'مسجّل'),           value: playersSnap.size },
          { label: t('Sessions Today', 'جلسات اليوم'), value: todaySessions.length },
        ],
      });
    } catch {
      setData('logistics', {
        kpis: [
          { label: t('Registered', 'مسجّل'),           value: '—' },
          { label: t('Sessions Today', 'جلسات اليوم'), value: '—' },
        ],
      });
    }
  };

  const fetchHelpData = async () => {
    try {
      const snap = await getDocs(collection(db, 'requests'));
      const requests = snap.docs.map(d => d.data());
      const open = requests.filter(r => r.status === 'new' || r.status === 'progress').length;
      const overdue = requests.filter(
        r => r.slaDeadline?.toDate && r.slaDeadline.toDate() < new Date() && r.status !== 'closed'
      ).length;
      setData('help', {
        kpis: [
          { label: t('Total', 'الإجمالي'),   value: requests.length },
          { label: t('Open', 'مفتوح'),       value: open },
          { label: t('Overdue', 'متأخر'),    value: overdue, alert: overdue > 0 },
        ],
      });
    } catch {
      setData('help', {
        kpis: [
          { label: t('Total', 'الإجمالي'), value: '—' },
          { label: t('Open', 'مفتوح'),     value: '—' },
          { label: t('Overdue', 'متأخر'),  value: '—' },
        ],
      });
    }
  };

  const fetchUsersData = async () => {
    try {
      const snap = await getDocs(collection(db, 'users'));
      const users = snap.docs.map(d => d.data());
      const active  = users.filter(u => u.status === 'active').length;
      const pending = users.filter(u => u.status === 'pending' || u.role === 'pending').length;
      setData('users', {
        kpis: [
          { label: t('Total', 'الإجمالي'),   value: users.length },
          { label: t('Active', 'نشط'),        value: active },
          { label: t('Pending', 'معلق'),      value: pending, alert: pending > 0 },
        ],
      });
    } catch {
      setData('users', {
        kpis: [
          { label: t('Total', 'الإجمالي'), value: '—' },
          { label: t('Active', 'نشط'),     value: '—' },
          { label: t('Pending', 'معلق'),   value: '—' },
        ],
      });
    }
  };

  const fetchReportsData = async () => {
    try {
      const snap = await getDocs(collection(db, 'monthly_reports'));
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      if (!docs.length) {
        setData('reports', {
          kpis: [
            { label: t('Reports This Year', 'التقارير هذا العام'), value: t('No Reports Yet', 'لا توجد تقارير') },
            { label: t('Approved Sections (Last)', 'أقسام معتمدة (آخر تقرير)'), value: '—' },
          ],
        });
        return;
      }

      const currentYear = new Date().getFullYear();
      const reportsThisYear = docs.filter(d => d.year === currentYear).length;

      // Most recent report by year+month descending
      const sorted = [...docs].sort((a, b) =>
        (b.year * 100 + (b.month ?? 0)) - (a.year * 100 + (a.month ?? 0))
      );
      const latest = sorted[0];
      const sections = Array.isArray(latest?.report_sections) ? latest.report_sections : [];
      const approved = sections.filter(s => s.status === 'approved').length;

      setData('reports', {
        kpis: [
          { label: t('Reports This Year', 'التقارير هذا العام'),               value: reportsThisYear },
          { label: t('Approved Sections (Last)', 'أقسام معتمدة (آخر تقرير)'), value: `${approved} / 9` },
        ],
      });
    } catch {
      setData('reports', {
        kpis: [
          { label: t('Reports This Year', 'التقارير هذا العام'),               value: '—' },
          { label: t('Approved Sections (Last)', 'أقسام معتمدة (آخر تقرير)'), value: '—' },
        ],
      });
    }
  };

  const fetchInventoryData = async () => {
    try {
      const snap = await getDocs(query(collection(db, 'inventory_items')));
      const items = snap.docs.map(d => d.data()).filter(i => i.isActive !== false);
      const lowStock  = items.filter(i => i.currentStock > 0 && i.currentStock <= (i.minThreshold ?? 5)).length;
      const outStock  = items.filter(i => i.currentStock === 0).length;
      setData('inventory', {
        kpis: [
          { label: t('Total Items', 'إجمالي الأصناف'),   value: items.length },
          { label: t('Low Stock', 'مخزون منخفض'),        value: lowStock, alert: lowStock > 0 },
          { label: t('Out of Stock', 'نفذ المخزون'),     value: outStock, alert: outStock > 0 },
        ],
      });
    } catch {
      setData('inventory', {
        kpis: [
          { label: t('Total Items', 'إجمالي الأصناف'), value: '—' },
          { label: t('Low Stock', 'مخزون منخفض'),      value: '—' },
          { label: t('Out of Stock', 'نفذ المخزون'),   value: '—' },
        ],
      });
    }
  };

  const dateString = new Date().toLocaleDateString(locale, {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <div className="ops-dash">
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
              transition={{ delay: i * 0.06, duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
              onClick={() => navigate(mod.path)}
            >
              <div className="ops-dash-card-header">
                <div className="ops-dash-card-icon">
                  <mod.icon size={22} strokeWidth={1.75} />
                </div>
                <div className="ops-dash-card-title">
                  <span className="ops-dash-card-name">{mod.label}</span>
                  {mod.maintenance ? (
                    <span className="ops-dash-card-badge maint">
                      <Wrench size={9} strokeWidth={2.5} />
                      {t('Under Dev.', 'تحت التطوير')}
                    </span>
                  ) : (
                    <span className="ops-dash-card-badge live">{t('Live', 'مباشر')}</span>
                  )}
                </div>
                <div className="ops-dash-card-arrow">
                  <ArrowRight size={15} strokeWidth={2} />
                </div>
              </div>

              {mod.maintenance ? (
                <div className="ops-dash-card-placeholder">
                  <p>{t('Module coming soon', 'الوحدة قادمة قريباً')}</p>
                </div>
              ) : isLoading ? (
                <div className="ops-dash-card-loading">
                  <div className="app-loader">
                    <span /><span /><span /><span /><span />
                  </div>
                </div>
              ) : (
                <div className="ops-dash-card-kpis">
                  {kpis.map((kpi, j) => (
                    <div key={j} className={`ops-dash-kpi${kpi.alert ? ' alert' : ''}`}>
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
    </div>
  );
}
