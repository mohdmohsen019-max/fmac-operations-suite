import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell
} from 'recharts';
import { Truck, Activity, ShieldAlert, Navigation, Clock, Zap, AlertTriangle, Car, Fuel, Wrench, Receipt, Users } from 'lucide-react';
import { useFleetSettings, convertDistance } from './FleetSettingsContext';
import { calculateTripMetrics, SCORE_DEFAULTS, SCORE_PERIOD_DAYS, scoreBand } from './scoreCalculation';
import { useFleetScope } from './FleetScopeContext';
import { cartrackService } from '../../services/cartrackService';
import { deduplicateCanonicalTrips, mergeCanonicalVehicles } from '../../services/fleetIdentity';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { useMaintenanceSuite } from './maintenance/maintenanceSuite';
import FleetPerformanceScorecard from './FleetPerformanceScorecard';
import { useLanguage } from '../../contexts/LanguageContext';
import useIsMobile from '../../hooks/useIsMobile';
import { format, subDays, startOfDay, endOfDay, eachDayOfInterval } from 'date-fns';
import './FleetDashboard.css';
import './FleetScopeViews.css';

export default function FleetDashboard({ canEdit = false }) {
  const { settings } = useFleetSettings();
  const { t, locale } = useLanguage();
  const { scope, inScope, classOf, displayName, metaOf, metaMap, aliasMap } = useFleetScope();
  const isMobile = useIsMobile();
  const unit = settings.measurementUnit;
  const lang = locale === 'ar-SA' ? 'ar' : 'en';
  const scoreSettingsKey = [
    settings.safetyScoreTarget,
    settings.speedingTimeThresholdPercent,
    settings.harshAccelerationThreshold,
    settings.harshBrakingThreshold,
    settings.harshCorneringThreshold,
    settings.speedingPenaltyWeight,
    settings.harshAccelerationPenaltyWeight,
    settings.harshBrakingPenaltyWeight,
    settings.harshCorneringPenaltyWeight,
  ].join('|');

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
  const [management, setManagement] = useState({ fuelCost: null, fineCount30d: 0, fineValue30d: 0, riders: 0 });
  const maintenanceSuite = useMaintenanceSuite(scope, inScope, aliasMap);

  useEffect(() => {
    fetchDashboardData();
    const timer = setTimeout(() => setIsMounted(true), 600);
    return () => clearTimeout(timer);
  }, [locale, scope, scoreSettingsKey, aliasMap]); // Refresh when scope, aliases or shared score calibration changes

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
        vehicles = mergeCanonicalVehicles(await cartrackService.getVehicles(scope) || [], aliasMap);
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
      const allTrips = deduplicateCanonicalTrips(rawTrips, aliasMap).filter((t) => {
        const reg = t.registration;
        const dist = parseFloat(t.trip_distance) || 0;
        return reg && inScope(reg) && dist > 0;
      });

      // 5. Registration count comes from the complete club roster; operational
      // transponders continue to come only from live Cartrack rows.
      const registeredVehicles = [...metaMap.keys()]
        .map((registration) => metaOf(registration))
        .filter((meta) => meta.clubOwned !== false)
        .filter((meta) => scope === 'all' || (scope === 'buses' ? meta.vehicleClass === 'bus' : meta.vehicleClass !== 'bus'))
      const registeredCount = new Set(registeredVehicles.map((meta) => meta.canonicalRegistration || meta.plateNumber || meta.registration)).size
      const activeUnits = vehicles.filter(v => !v.is_under_maintenance).length;
      const inMaintenance = registeredVehicles.filter((meta) => meta.operationalStatus === 'maintenance').length
        || vehicles.filter(v => v.is_under_maintenance).length;

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

      // 8. Vehicle safety scores — same 30-day rate model and settings used by
      // Safety & Behavior. Keeping one shared calculation prevents dashboard
      // bars from contradicting the detailed ranking.
      let scorecards = [];
      try {
        const scoreEnd = endOfDay(subDays(new Date(), 1));
        const scoreStart = startOfDay(subDays(scoreEnd, SCORE_PERIOD_DAYS - 1));
        const scoreTripsRaw = await cartrackService.getTrips(
          format(scoreStart, 'yyyy-MM-dd HH:mm:ss'),
          format(scoreEnd, 'yyyy-MM-dd HH:mm:ss'),
        ) || [];
        const byVehicle = new Map();
        deduplicateCanonicalTrips(scoreTripsRaw, aliasMap).forEach((trip) => {
          const registration = trip.registration;
          if (!registration || !inScope(registration)) return;
          if (!byVehicle.has(registration)) byVehicle.set(registration, []);
          byVehicle.get(registration).push(trip);
        });
        const scoreSettings = { ...SCORE_DEFAULTS, ...settings };
        scorecards = [...byVehicle.entries()].map(([plate, trips]) => ({
          plate,
          ...calculateTripMetrics(trips, scoreSettings),
        }));
      } catch (e) { console.error("FleetDashboard: Scorecards fetch failed", e); }
      scorecards = scorecards.map(s => ({
        ...s,
        label: displayName(s.plate, lang),
        vClass: classOf(s.plate),
      })).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

      // 9. Actionable management signals from the existing Firestore records.
      // These are calculated, not generated, and respect the active fleet scope.
      try {
        const [fuelSnap, finesSnap, ridersSnap] = await Promise.all([
          getDocs(collection(db, 'fuelStatements')),
          getDocs(collection(db, 'fleet_fines')),
          getDocs(collection(db, 'fleet_ridership_counts')),
        ]);
        const now = new Date();
        const currentMonth = now.getMonth() + 1;
        const currentYear = now.getFullYear();
        const currentFuel = fuelSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((s) => Number(s.month) === currentMonth && Number(s.year) === currentYear)
          .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))[0];
        let fuelCost = null;
        if (currentFuel) {
          const allocations = Array.isArray(currentFuel.vehicleAllocations) ? currentFuel.vehicleAllocations : [];
          fuelCost = allocations.length
            ? allocations.filter((a) => inScope(a.plate)).reduce((sum, a) => sum + (Number(a.cost) || 0), 0)
            : scope === 'all' ? Number(currentFuel.totalCost) || 0 : null;
        }
        const fineCutoff = format(new Date(now.getTime() - 30 * 86400000), 'yyyy-MM-dd');
        const recentFines = finesSnap.docs
          .map((d) => d.data())
          .filter((f) => String(f.date || '') >= fineCutoff)
          .filter((f) => scope === 'all' ? true : f.vehicleReg && inScope(f.vehicleReg));
        const fineCount30d = recentFines.length;
        const fineValue30d = recentFines.reduce((sum, f) => sum + (Number(f.amountAed) || 0), 0);
        const monthPrefix = format(now, 'yyyy-MM');
        const riders = scope === 'others' ? 0 : ridersSnap.docs
          .map((d) => d.data())
          .filter((r) => String(r.date || '').startsWith(monthPrefix))
          .reduce((sum, r) => sum + (Number(r.riders) || 0), 0);
        setManagement({ fuelCost, fineCount30d, fineValue30d, riders });
      } catch (err) {
        console.error('FleetDashboard: management signals failed', err);
      }

      setStats({
        totalVehicles: registeredCount || vehicles.length || (scope === 'buses' ? 14 : 0),
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

  const activePct = stats.totalVehicles > 0 ? Math.round((stats.activeUnits / stats.totalVehicles) * 100) : 0;

  return (
    <div className="fleet-dashboard">
      {scope === 'others' && (
        <div className="fsv-scope-note">
          <Car size={14} />
          <span>{t('Other Vehicles — not part of the bus fleet', 'مركبات أخرى — ليست ضمن أسطول الحافلات')}</span>
        </div>
      )}
      <motion.section
        className="fleet-command-board"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="fleet-command-copy">
          <span className="fleet-command-kicker">{t('Live fleet control', 'التحكم المباشر بالأسطول')}</span>
          <div className="fleet-command-title-row">
            <h1>{scope === 'buses' ? t('Bus command', 'قيادة الحافلات') : scope === 'others' ? t('Vehicle command', 'قيادة المركبات') : t('Fleet command', 'قيادة الأسطول')}</h1>
          </div>
          <p>{t('One operational picture for coverage, movement, maintenance exposure and service demand.', 'صورة تشغيلية موحدة للتغطية والحركة والتعرض للصيانة وطلب الخدمة.')}</p>
          <div className="fleet-command-primary">
            <strong dir="ltr">{stats.activeUnits.toLocaleString(locale)}<small> / {stats.totalVehicles.toLocaleString(locale)}</small></strong>
            <span>{t('tracked and responding', 'متتبعة وتستجيب')}</span>
          </div>
          <div className="fleet-coverage-rail" aria-label={`${activePct}%`}>
            <i style={{ transform: `scaleX(${Math.min(activePct, 100) / 100})` }} />
          </div>
          <div className="fleet-command-coverage">
            <span>{activePct.toLocaleString(locale)}% {t('telemetry coverage', 'تغطية التتبع')}</span>
            <span>{Math.max(stats.totalVehicles - stats.activeUnits, 0).toLocaleString(locale)} {t('not responding', 'لا تستجيب')}</span>
          </div>
        </div>

        <div className="fleet-command-matrix">
          <div className="fleet-matrix-cell">
            <span><Truck size={15} />{t('Registered', 'مسجلة')}</span>
            <strong>{stats.totalVehicles.toLocaleString(locale)}</strong>
            <small>{t('canonical fleet identities', 'هويات الأسطول الأساسية')}</small>
          </div>
          <div className="fleet-matrix-cell is-gold">
            <span><Navigation size={15} />{t('7-day range', 'مدى 7 أيام')}</span>
            <strong dir="ltr">{(unit === 'mi' ? Math.round(convertDistance(stats.totalDistance7D, 'mi')) : stats.totalDistance7D).toLocaleString(locale)}</strong>
            <small>{t(unit, unit === 'km' ? 'كم' : 'ميل')}</small>
          </div>
          <div className={`fleet-matrix-cell ${stats.inMaintenance ? 'is-alert' : ''}`}>
            <span><Wrench size={15} />{t('Workshop exposure', 'التعرض للورشة')}</span>
            <strong>{stats.inMaintenance.toLocaleString(locale)}</strong>
            <small>{stats.inMaintenance ? t('units require attention', 'وحدات تتطلب الانتباه') : t('no units in drydock', 'لا توجد وحدات في الورشة')}</small>
          </div>
          <div className="fleet-matrix-cell">
            <span><Activity size={15} />{t('Daily average', 'المتوسط اليومي')}</span>
            <strong dir="ltr">{Math.round(stats.totalDistance7D / 7).toLocaleString(locale)}</strong>
            <small>{t('km across selected scope', 'كم ضمن النطاق المحدد')}</small>
          </div>
        </div>
      </motion.section>
      {scope === 'buses' && <FleetPerformanceScorecard canEdit={canEdit} />}

      <section className={`fleet-action-grid${scope === 'others' ? ' fleet-action-grid--three' : ''}`} aria-label={t('Management priorities', 'أولويات الإدارة')}>
        <div className="fleet-action-card glass-panel"><Fuel size={17} /><div><span>{t('Fuel cost · current month', 'تكلفة الوقود · الشهر الحالي')}</span><strong>{management.fuelCost == null ? '—' : `${Math.round(management.fuelCost).toLocaleString(locale)} ${t('AED', 'د.إ')}`}</strong></div></div>
        <div className={`fleet-action-card glass-panel${maintenanceSuite.summary.critical || maintenanceSuite.summary.oilOverdue ? ' has-alert' : ''}`}><Wrench size={17} /><div><span>{t('Maintenance due / overdue', 'الصيانة المستحقة / المتأخرة')}</span><strong>{(maintenanceSuite.summary.critical + maintenanceSuite.summary.oilOverdue).toLocaleString(locale)}</strong></div></div>
        <div className="fleet-action-card glass-panel"><Receipt size={17} /><div><span>{t('Traffic fines · last 30 days', 'المخالفات المرورية · آخر 30 يوماً')}</span><strong>{management.fineCount30d.toLocaleString(locale)} {t('fines', 'مخالفة')} · {Math.round(management.fineValue30d).toLocaleString(locale)} {t('AED', 'د.إ')}</strong></div></div>
        {scope !== 'others' && <div className="fleet-action-card glass-panel"><Users size={17} /><div><span>{t('Bus riders · current month', 'ركاب الحافلات · الشهر الحالي')}</span><strong>{management.riders.toLocaleString(locale)}</strong></div></div>}
      </section>

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
              <h3 className="chart-title"><ShieldAlert size={18} /> {t('Vehicle Safety Scores', 'درجات سلامة المركبات')}</h3>
              <p className="panel-subtitle">{t('Same calibrated 30-day score used in Safety & Behavior', 'نفس درجة الثلاثين يوماً المعايرة والمستخدمة في السلامة والسلوك')}</p>
            </div>
            <div className="legend">
              <span className="legend-item"><div className="dot safe"></div> {t('Target or above', 'عند الهدف أو أعلى')}</span>
              <span className="legend-item"><div className="dot caution"></div> {t('Watch', 'مراقبة')}</span>
              <span className="legend-item"><div className="dot risk"></div> {t('High risk', 'خطر مرتفع')}</span>
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
                <Bar dataKey="score" radius={[99, 99, 99, 99]} maxBarSize={18}>
                  {stats.scorecards.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={scoreBand(entry.score, settings.safetyScoreTarget) === 'risk' ? 'var(--status-risk)' : scoreBand(entry.score, settings.safetyScoreTarget) === 'watch' ? 'var(--status-warn)' : 'var(--status-safe)'} />
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
