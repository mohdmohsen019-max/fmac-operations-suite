import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell
} from 'recharts';
import { Truck, Activity, ShieldAlert, Navigation, Clock, Zap, AlertTriangle, Car } from 'lucide-react';
import { useFleetSettings, convertDistance } from './FleetSettingsContext';
import { useFleetScope } from './FleetScopeContext';
import { cartrackService } from '../../services/cartrackService';
import { useLanguage } from '../../contexts/LanguageContext';
import useIsMobile from '../../hooks/useIsMobile';
import { format, subDays, startOfDay, endOfDay, eachDayOfInterval } from 'date-fns';
import './FleetDashboard.css';
import './FleetScopeViews.css';

export default function FleetDashboard() {
  const { settings } = useFleetSettings();
  const { t, locale } = useLanguage();
  const { scope, inScope, classOf, displayName, metaOf } = useFleetScope();
  const isMobile = useIsMobile();
  const unit = settings.measurementUnit;
  const lang = locale === 'ar-SA' ? 'ar' : 'en';

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalVehicles: 14,
    activeUnits: 0,
    inMaintenance: 0,
    totalDistance7D: 0,
    mileageTrend: [],
    recentActivity: [],
    scorecards: []
  });
  const [isMounted, setIsMounted] = useState(false);
  const [feedExpanded, setFeedExpanded] = useState(false);

  useEffect(() => {
    fetchDashboardData();
    const timer = setTimeout(() => setIsMounted(true), 600);
    return () => clearTimeout(timer);
  }, [locale, scope]); // Refresh on locale change (chart names) and on fleet-scope change

  const safeFormat = (dateStr, formatStr) => {
    if (!dateStr) return '';
    try {
      let d;
      const now = new Date();
      const todayStr = format(now, 'yyyy-MM-dd');

      if (typeof dateStr === 'number') {
        d = new Date(dateStr > 100000000000 ? dateStr : dateStr * 1000);
      } else if (typeof dateStr === 'string') {
        // Handle "14:30" or "14:30:00"
        if (/^\d{2}:\d{2}(:\d{2})?$/.test(dateStr)) {
          d = new Date(`${todayStr}T${dateStr}`);
        }
        // Handle "DD-MM-YYYY"
        else if (dateStr.includes('-') && dateStr.split('-')[0].length <= 2) {
          const parts = dateStr.split(' ');
          const dateParts = parts[0].split('-');
          const timeParts = parts[1] || '00:00:00';
          d = new Date(`${dateParts[2]}-${dateParts[1]}-${dateParts[0]}T${timeParts}`);
        } else {
          const cleanStr = dateStr.length > 19 ? dateStr.substring(0, 19) : dateStr;
          d = new Date(cleanStr.replace(' ', 'T'));
        }
      } else if (dateStr instanceof Date) {
        d = dateStr;
      }

      if (!d || isNaN(d.getTime())) return '';
      
      // Use Intl for localized time
      if (formatStr === 'HH:mm') {
        return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
      }
      
      return format(d, formatStr);
    } catch (e) {
      return '';
    }
  };

  const fetchDashboardData = async () => {
    setLoading(true);

    try {
      // 1. Fetch Vehicles (already filtered to the active fleet scope)
      let vehicles = [];
      try {
        vehicles = await cartrackService.getVehicles(scope) || [];
      } catch (e) { console.error("FleetDashboard: Vehicles fetch failed", e); }

      // 2. Define Time Range
      const today = format(new Date(), 'yyyy-MM-dd');
      const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
      const days = eachDayOfInterval({
        start: subDays(new Date(), 6),
        end: new Date()
      });

      const rangeStart = format(startOfDay(days[0]), 'yyyy-MM-dd HH:mm:ss');
      const rangeEnd = format(endOfDay(days[days.length - 1]), 'yyyy-MM-dd HH:mm:ss');

      // 3. Fetch Trips
      let rawTrips = [];
      try {
        rawTrips = await cartrackService.getTrips(rangeStart, rangeEnd) || [];
      } catch (e) { console.error("FleetDashboard: Trips fetch failed", e); }

      // 4. Map Trips (scope-filtered via the shared classifier)
      const tripMap = new Map();
      rawTrips.forEach(t => {
        const reg = t.registration?.trim().toUpperCase().replace(/\s/g, '');
        const dist = parseFloat(t.trip_distance) || 0;
        if (!reg || !inScope(reg) || dist <= 0) return;
        const key = t.trip_id ? String(t.trip_id) : `${reg}-${t.start_timestamp}-${dist}`;
        if (!tripMap.has(key)) tripMap.set(key, t);
      });
      const allTrips = Array.from(tripMap.values());

      // 5. Calculate Stats — `vehicles` is already the scoped set
      const activeUnits = vehicles.filter(v => !v.is_under_maintenance).length;
      const inMaintenance = vehicles.filter(v => v.is_under_maintenance).length;

      const totalDistance7D = Math.round(allTrips.reduce((sum, t) => sum + (t.trip_distance || 0), 0) / 1000);

      // 6. Mileage Trend
      const mileageTrend = days.map(day => {
        const dayStr = format(day, 'yyyy-MM-dd');
        const isRecent = (dayStr === today || dayStr === yesterday);
        const dayTrips = allTrips.filter(t => {
          if (!t.start_timestamp) return false;
          const startDate = t.start_timestamp.substring(0, 10);
          if (startDate !== dayStr) return false;
          if (isRecent) {
            const endDate = t.end_timestamp?.substring(0, 10);
            return endDate === dayStr;
          }
          return true;
        });
        const distKm = dayTrips.reduce((sum, t) => sum + (t.trip_distance || 0), 0) / 1000;
        return {
          name: new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(day),
          date: new Intl.DateTimeFormat(locale, { month: 'numeric', day: 'numeric' }).format(day),
          distance: Math.round(distKm * 100) / 100
        };
      });

      // 7. Recent Activity
      const recentActivity = [...allTrips]
        .sort((a, b) => (b.start_timestamp || '').localeCompare(a.start_timestamp || ''))
        .slice(0, 6)
        .map(trip => {
          const meta = metaOf(trip.registration);
          return {
            distance: Math.round((trip.trip_distance || 0) / 1000),
            plate: trip.registration,
            name: displayName(trip.registration, lang),
            vClass: classOf(trip.registration),
            driver: meta.driverName || trip.driver_name || t('System Driver', 'سائق النظام'),
            time: safeFormat(trip.start_timestamp, 'HH:mm')
          };
        });

      // 8. Scorecards (scoped)
      let scorecards = [];
      try {
        scorecards = await cartrackService.getDriverScorecards(7, {
          speedingLimit: settings.speedingLimit,
          brakingMultiplier: settings.brakingSensitivity,
        }, scope) || [];
      } catch (e) { console.error("FleetDashboard: Scorecards fetch failed", e); }
      scorecards = scorecards.map(s => ({
        ...s,
        label: displayName(s.plate, lang),
        vClass: classOf(s.plate),
      }));

      setStats({
        totalVehicles: vehicles.length || (scope === 'buses' ? 14 : 0),
        activeUnits: activeUnits || 0,
        inMaintenance: inMaintenance || 0,
        totalDistance7D,
        mileageTrend,
        recentActivity,
        scorecards
      });
    } catch (error) {
      console.error('FleetDashboard: Critical error in data mapping', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !isMounted) {
    return (
      <div className="view-loading">
        <div className="app-loader">
          <span /><span /><span /><span /><span />
        </div>
      </div>
    );
  }

  const capsuleCount = Math.min(stats.totalVehicles, 14);
  const activePct = stats.totalVehicles > 0 ? Math.round((stats.activeUnits / stats.totalVehicles) * 100) : 0;
  const renderCapsules = (filled, warn = false) => (
    <div className="stat-capsules">
      {Array.from({ length: capsuleCount }).map((_, i) => (
        <span key={i} className={`stat-capsule${i < filled ? ' filled' : ''}${warn && i < filled ? ' warn' : ''}`} />
      ))}
    </div>
  );

  return (
    <div className="fleet-dashboard">
      {scope === 'others' && (
        <div className="fsv-scope-note">
          <Car size={14} />
          <span>{t('Other Vehicles — not part of the bus fleet', 'مركبات أخرى — ليست ضمن أسطول الحافلات')}</span>
        </div>
      )}
      <div className="stats-bento">
        <motion.div className="stat-card glass-panel" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <div className="stat-header">
            <h3>{t('Fleet Scale', 'حجم الأسطول')}</h3>
            <Truck size={16} />
          </div>
          <div className="stat-value">{stats.totalVehicles.toLocaleString(locale)}</div>
          <p className="stat-label">{t('Total Registrations', 'إجمالي التسجيلات')}</p>
          {renderCapsules(capsuleCount)}
        </motion.div>

        <motion.div className="stat-card glass-panel" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <div className="stat-header">
            <h3>{t('Operational', 'تشغيلي')}</h3>
            <Zap size={16} />
          </div>
          <div className="stat-value">
            {stats.activeUnits.toLocaleString(locale)}
            <span className="stat-badge">{activePct.toLocaleString(locale)}%</span>
          </div>
          <p className="stat-label">{t('Active Transponders', 'أجهزة الإرسال النشطة')}</p>
          {renderCapsules(Math.round((stats.activeUnits / Math.max(stats.totalVehicles, 1)) * capsuleCount))}
        </motion.div>

        <motion.div className="stat-card glass-panel" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <div className="stat-header">
            <h3>{t('Maintenance', 'الصيانة')}</h3>
            <AlertTriangle size={16} />
          </div>
          <div className="stat-value">{stats.inMaintenance.toLocaleString(locale)}</div>
          <p className="stat-label">{t('Units in Drydock', 'وحدات في الصيانة')}</p>
          {renderCapsules(Math.round((stats.inMaintenance / Math.max(stats.totalVehicles, 1)) * capsuleCount), true)}
        </motion.div>

        <motion.div className="stat-card stat-card-accent glass-panel" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
          <div className="stat-header">
            <h3>{t('Deployment', 'الانتشار')}</h3>
            <Navigation size={16} />
          </div>
          <div className="stat-value">
            {(unit === 'mi' ? Math.round(convertDistance(stats.totalDistance7D, 'mi')) : stats.totalDistance7D).toLocaleString(locale)}
            <span className="unit-label">{t(unit, unit === 'km' ? 'كم' : 'ميل')}</span>
          </div>
          <p className="stat-label">{t('Total Range (7D)', 'إجمالي المدى (7 أيام)')}</p>
        </motion.div>
      </div>

      <div className="fleet-charts-grid">
        <div className="fleet-chart-panel medium glass-panel">
          <h3 className="chart-title"><Activity size={18} /> {t('Mileage Velocity Trend', 'اتجاه سرعة المسافة')}</h3>
          <div className="chart-container" style={{ minHeight: '240px' }}>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={stats.mileageTrend} barCategoryGap="30%" margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--theme-border)" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: 'var(--theme-text-muted)', fontSize: 12}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: 'var(--theme-text-muted)', fontSize: 12}} />
                <Tooltip
                  cursor={{ fill: 'var(--theme-surface-hover)' }}
                  contentStyle={{ backgroundColor: 'var(--theme-surface)', border: '1px solid var(--theme-border)', borderRadius: '14px', boxShadow: 'var(--shadow-md)', textAlign: locale === 'ar-SA' ? 'right' : 'left' }}
                  itemStyle={{ color: 'var(--theme-text-main)', fontWeight: 700 }}
                />
                <Bar dataKey="distance" radius={[99, 99, 99, 99]} maxBarSize={22}>
                  {(() => {
                    const peak = stats.mileageTrend.reduce((m, d, i) => (d.distance > stats.mileageTrend[m].distance ? i : m), 0);
                    return stats.mileageTrend.map((d, i) => (
                      <Cell key={`mile-${i}`} fill={i === peak ? 'var(--theme-ink)' : 'var(--accent)'} />
                    ));
                  })()}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid var(--theme-border)' }}>
            <p style={{ fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.12em', color: 'var(--theme-text-ghost)', textTransform: 'uppercase', margin: '0 0 12px 0' }}>{t('Weekly Summary', 'ملخص أسبوعي')}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', flexDirection: locale === 'ar-SA' ? 'row-reverse' : 'row' }}>
              {[
                { label: t('Total', 'الإجمالي'), value: `${(unit === 'mi' ? Math.round(convertDistance(stats.totalDistance7D, 'mi')) : stats.totalDistance7D).toLocaleString(locale)} ${t(unit, unit === 'km' ? 'كم' : 'ميل')}` },
                { label: t('Daily Avg', 'متوسط يومي'), value: `${((unit === 'mi' ? Math.round(convertDistance(stats.totalDistance7D, 'mi')) : stats.totalDistance7D) / 7).toLocaleString(locale, { maximumFractionDigits: 1 })} ${t(unit, unit === 'km' ? 'كم' : 'ميل')}` },
                { label: t('Peak Day', 'يوم الذروة'), value: [...stats.mileageTrend].sort((a, b) => b.distance - a.distance)[0]?.name || '—' }
              ].map((s, i) => (
                <div key={i} style={{ padding: '12px', background: 'var(--theme-surface-pearl)', borderRadius: '12px', border: '1px solid var(--theme-border)', textAlign: locale === 'ar-SA' ? 'right' : 'left' }}>
                  <div style={{ fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.1em', color: 'var(--theme-text-ghost)', textTransform: 'uppercase', marginBottom: '6px' }}>{s.label}</div>
                  <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--theme-accent)', direction: 'ltr' }}>{s.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="fleet-chart-panel small glass-panel">
          <div className="feed-panel-header">
            <h3 className="chart-title"><Clock size={18} /> {t('System Feed', 'تغذية النظام')}</h3>
            {stats.recentActivity.length > 5 && (
              <button className="feed-expand-btn" onClick={() => setFeedExpanded(v => !v)}>
                {feedExpanded ? t('Show less', 'عرض أقل') : t(`+${stats.recentActivity.length - 5} more`, `+${stats.recentActivity.length - 5} المزيد`)}
              </button>
            )}
          </div>
          <div className="activity-feed">
            {stats.recentActivity.length > 0 ? (feedExpanded ? stats.recentActivity : stats.recentActivity.slice(0, 5)).map((act, i) => (
              <div key={i} className="feed-item">
                <div className="feed-time">{act.time}</div>
                <div className="feed-info">
                  <span className="feed-plate">
                    {act.name}
                    {scope === 'all' && (
                      <span className={`fsv-class-badge ${act.vClass === 'bus' ? 'fsv-badge-bus' : 'fsv-badge-other'}`}>
                        {act.vClass === 'bus' ? t('Bus', 'حافلة') : t('Vehicle', 'مركبة')}
                      </span>
                    )}
                  </span>
                  <span className="feed-dist">{t(`+${act.distance}km Trip Logged`, `+${act.distance}كم رحلة مسجلة`)}</span>
                </div>
              </div>
            )) : (
              <p className="text-muted" style={{fontSize: '0.8rem', textAlign: 'center', padding: '20px'}}>{t('No recent telemetry logs.', 'لا توجد سجلات تتبع حديثة.')}</p>
            )}
          </div>
        </div>

        <div className="fleet-chart-panel glass-panel">
          <div className="panel-header">
            <div>
              <h3 className="chart-title"><ShieldAlert size={18} /> {t('Risk Score Distribution', 'توزيع درجات المخاطر')}</h3>
              <p className="panel-subtitle">{t('Operational safety index across active units (7-day average)', 'مؤشر السلامة التشغيلية عبر الوحدات النشطة (متوسط 7 أيام)')}</p>
            </div>
            <div className="legend">
              <span className="legend-item"><div className="dot safe"></div> {t('Safe', 'آمن')}</span>
              <span className="legend-item"><div className="dot caution"></div> {t('Caution', 'تحذير')}</span>
              <span className="legend-item"><div className="dot risk"></div> {t('High Risk', 'خطر مرتفع')}</span>
            </div>
          </div>
          <div className="chart-container" style={{ minHeight: isMobile ? '200px' : '240px' }}>
            <ResponsiveContainer width="100%" height={isMobile ? 200 : 240}>
              <BarChart data={stats.scorecards} barCategoryGap="35%" margin={{ top: 10, right: 10, left: -20, bottom: isMobile ? 18 : 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--theme-border)" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} interval={0} angle={isMobile ? -45 : 0} textAnchor={isMobile ? 'end' : 'middle'} height={isMobile ? 44 : 30} tick={{fill: 'var(--theme-text-muted)', fontSize: 10}} />
                <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{fill: 'var(--theme-text-muted)', fontSize: 10}} width={30} />
                <Tooltip
                  cursor={{fill: 'var(--theme-surface-hover)'}}
                  contentStyle={{ backgroundColor: 'var(--theme-surface)', border: '1px solid var(--theme-border)', borderRadius: '14px', boxShadow: 'var(--shadow-md)', textAlign: locale === 'ar-SA' ? 'right' : 'left' }}
                />
                <Bar dataKey="riskScore" radius={[99, 99, 99, 99]} maxBarSize={18}>
                  {stats.scorecards.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.riskScore < 60 ? 'var(--status-risk)' : entry.riskScore < 80 ? 'var(--status-warn)' : 'var(--status-safe)'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
