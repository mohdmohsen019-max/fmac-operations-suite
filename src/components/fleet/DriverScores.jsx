import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, CalendarDays, ChevronDown, ChevronRight, Gauge, MapPin, RotateCcw, Save, Search, SlidersHorizontal, Trophy, X } from 'lucide-react';
import {
  CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { endOfDay, format, startOfDay, subDays } from 'date-fns';
import { useLanguage } from '../../contexts/LanguageContext';
import { cartrackService, regMatchesScope } from '../../services/cartrackService';
import { isKnownBusRegistration } from '../../services/fleetMapping';
import { canonicalFleetRegistration, deduplicateCanonicalTrips, mergeCanonicalVehicles, telemetryRegistrationsForVehicle } from '../../services/fleetIdentity';
import { useFleetScope } from './FleetScopeContext';
import { useFleetSettings } from './FleetSettingsContext';
import { calculateTripMetrics, SCORE_DEFAULTS, SCORE_PERIOD_DAYS, scoreBand, scoreNumber as number } from './scoreCalculation';
import './DriverScores.css';

const PERIOD_DAYS = SCORE_PERIOD_DAYS;

const SCORE_PERIOD_OPTIONS = [
  { days: 7, en: 'Last 7 days', ar: 'آخر 7 أيام' },
  { days: 14, en: 'Last 14 days', ar: 'آخر 14 يوماً' },
  { days: 30, en: 'Last 30 days', ar: 'آخر 30 يوماً' },
  { days: 90, en: 'Last 90 days', ar: 'آخر 90 يوماً' },
];

const SCORE_FIELDS = [
  { key: 'safetyScoreTarget', label: 'Safety score target', suffix: '/ 100', min: 0, max: 100, step: 1 },
  { key: 'speedingTimeThresholdPercent', label: 'Speeding time allowance', suffix: '% of driving time', min: 0, max: 100, step: 0.1 },
  { key: 'speedingPenaltyWeight', label: 'Speeding penalty weight', suffix: 'points / excess %', min: 0, max: 20, step: 0.01 },
  { key: 'harshAccelerationThreshold', label: 'Harsh acceleration allowance', suffix: 'events / 1,000 km', min: 0, max: 1000, step: 1 },
  { key: 'harshAccelerationPenaltyWeight', label: 'Acceleration penalty weight', suffix: 'points / excess rate', min: 0, max: 10, step: 0.001 },
  { key: 'harshBrakingThreshold', label: 'Harsh braking allowance', suffix: 'events / 1,000 km', min: 0, max: 1000, step: 1 },
  { key: 'harshBrakingPenaltyWeight', label: 'Braking penalty weight', suffix: 'points / excess rate', min: 0, max: 10, step: 0.001 },
  { key: 'harshCorneringThreshold', label: 'Harsh cornering allowance', suffix: 'events / 1,000 km', min: 0, max: 1000, step: 1 },
  { key: 'harshCorneringPenaltyWeight', label: 'Cornering penalty weight', suffix: 'points / excess rate', min: 0, max: 10, step: 0.001 },
];

const vehicleKey = (trip) => String(trip.registration || trip.vehicle_id || 'Unknown vehicle')
  .toUpperCase()
  .replace(/\s/g, '');

function matchesScoreScope(registration, scope) {
  if (scope === 'all') return true;

  // The confirmed registry is authoritative for these 14 buses. This also
  // repairs stale Firestore metadata left by earlier bulk reclassification.
  if (isKnownBusRegistration(registration)) return scope === 'buses';
  return regMatchesScope(registration, scope);
}

function buildPeriod(trips, from, registeredVehicles = [], scoreSettings = SCORE_DEFAULTS, days = PERIOD_DAYS) {
  const metrics = calculateTripMetrics(trips, scoreSettings);
  const byVehicle = new Map();

  registeredVehicles.forEach((vehicle) => {
    const registration = vehicleKey(vehicle);
    if (registration && registration !== 'UNKNOWNVEHICLE') byVehicle.set(registration, []);
  });

  trips.forEach((trip) => {
    const registration = vehicleKey(trip);
    if (!byVehicle.has(registration)) byVehicle.set(registration, []);
    byVehicle.get(registration).push(trip);
  });

  const vehicles = Array.from(byVehicle.entries()).map(([registration, rows]) => ({
    id: registration,
    registration,
    telemetryAliases: registeredVehicles.find((vehicle) => canonicalFleetRegistration(vehicle.registration) === registration)?.telemetryAliases || [],
    ...calculateTripMetrics(rows, scoreSettings),
  })).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

  const daily = Array.from({ length: days }, (_, index) => {
    const date = subDays(from, days - 1 - index);
    const key = format(date, 'yyyy-MM-dd');
    const rows = trips.filter((trip) => String(trip.start_timestamp || '').slice(0, 10) === key);
    return { date: format(date, 'dd MMM'), score: calculateTripMetrics(rows, scoreSettings).score };
  });

  return { ...metrics, vehicles, daily, trips };
}

function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours} h ${minutes} m`;
}

function scoreTone(score, target = SCORE_DEFAULTS.safetyScoreTarget) {
  return scoreBand(score, target);
}

function ScoreTooltip({ active, payload, label }) {
  if (!active || !payload?.length || payload[0]?.value == null) return null;
  return <div className="driver-chart-tooltip"><strong>{label}</strong><span>Vehicle score · {payload[0].value}</span></div>;
}

const RISK_EVENT_NAMES = new Set([
  'HARSH_ACCELERATION', 'HARSH_BRAKING', 'HARSH_CORNERING',
  'SPEEDING_START', 'ROAD_SPEEDING_START', 'SPEEDING', 'ROAD_SPEEDING',
]);

function riskEventType(event) {
  const value = String(event.event_description || '').toUpperCase();
  return RISK_EVENT_NAMES.has(value) ? value : '';
}

function eventLabel(type, t) {
  const labels = {
    HARSH_ACCELERATION: t('Harsh acceleration', 'تسارع حاد'),
    HARSH_BRAKING: t('Harsh braking', 'فرملة حادة'),
    HARSH_CORNERING: t('Harsh cornering', 'انعطاف حاد'),
    SPEEDING_START: t('Speeding', 'تجاوز السرعة'),
    ROAD_SPEEDING_START: t('Road speeding', 'تجاوز سرعة الطريق'),
    SPEEDING: t('Speeding', 'تجاوز السرعة'),
    ROAD_SPEEDING: t('Road speeding', 'تجاوز سرعة الطريق'),
  };
  return labels[type] || type.replaceAll('_', ' ');
}

function eventTimestamp(event, locale) {
  const raw = event.event_ts || event.received_ts;
  if (!raw) return '—';
  const parsed = new Date(String(raw).replace(' ', 'T'));
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
}

export default function DriverScores() {
  const { t, locale } = useLanguage();
  const { scope, metaOf, displayName, aliasMap } = useFleetScope();
  const { settings, saveSettings } = useFleetSettings();
  const scoreSettings = useMemo(() => ({ ...SCORE_DEFAULTS, ...settings }), [settings]);
  const [tab, setTab] = useState('overview');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState(scoreSettings);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [detailEvents, setDetailEvents] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [periodDays, setPeriodDays] = useState(PERIOD_DAYS);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const currentEnd = endOfDay(subDays(new Date(), 1));
      const currentStart = startOfDay(subDays(currentEnd, periodDays - 1));
      const previousEnd = endOfDay(subDays(currentStart, 1));
      const previousStart = startOfDay(subDays(previousEnd, periodDays - 1));
      const [trips, registry] = await Promise.all([
        cartrackService.getTrips(
          format(previousStart, 'yyyy-MM-dd HH:mm:ss'),
          format(currentEnd, 'yyyy-MM-dd HH:mm:ss'),
        ),
        cartrackService.getVehicles('all'),
      ]);
      if (!trips) throw new Error('Cartrack trip data was unavailable.');

      const scoped = deduplicateCanonicalTrips(trips, aliasMap)
        .filter((trip) => matchesScoreScope(trip.registration, scope));
      const scopedRegistry = mergeCanonicalVehicles(registry || [], aliasMap)
        .filter((vehicle) => matchesScoreScope(vehicle.registration, scope));
      const currentStartKey = format(currentStart, 'yyyy-MM-dd');
      const currentEndKey = format(currentEnd, 'yyyy-MM-dd');
      const previousStartKey = format(previousStart, 'yyyy-MM-dd');
      const previousEndKey = format(previousEnd, 'yyyy-MM-dd');
      const currentRows = scoped.filter((trip) => {
        const day = String(trip.start_timestamp || trip.clock_start || '').slice(0, 10);
        return day >= currentStartKey && day <= currentEndKey;
      });
      const previousRows = scoped.filter((trip) => {
        const day = String(trip.start_timestamp || trip.clock_start || '').slice(0, 10);
        return day >= previousStartKey && day <= previousEndKey;
      });

      setData({
        current: buildPeriod(currentRows, currentEnd, scopedRegistry, scoreSettings, periodDays),
        previous: buildPeriod(previousRows, previousEnd, scopedRegistry, scoreSettings, periodDays),
        dateLabel: `${format(currentStart, 'dd MMM yyyy')} – ${format(currentEnd, 'dd MMM yyyy')}`,
        currentStart: format(currentStart, 'yyyy-MM-dd HH:mm:ss'),
        currentEnd: format(currentEnd, 'yyyy-MM-dd HH:mm:ss'),
      });
    } catch (err) {
      console.error('Driver scores fetch error:', err);
      setError(err.message || 'Unable to load driver scores.');
    } finally {
      setLoading(false);
    }
  }, [scope, scoreSettings, aliasMap, periodDays]);

  useEffect(() => { load(); }, [load]);

  const current = data?.current;
  const previous = data?.previous;
  const change = current?.score != null && previous?.score != null ? current.score - previous.score : null;
  const vehicles = useMemo(() => (current?.vehicles || []).map((vehicle) => {
    const meta = metaOf(vehicle.registration);
    return {
      ...vehicle,
      driverName: meta.driverName || t('Unassigned', 'غير معيّن'),
      vehicleName: displayName(vehicle.registration),
    };
  }).filter((vehicle) =>
    `${vehicle.driverName} ${vehicle.vehicleName} ${vehicle.registration}`.toLowerCase().includes(query.trim().toLowerCase())),
  [current, query, metaOf, displayName, t]);

  const openSettings = () => {
    setSettingsDraft(scoreSettings);
    setSettingsOpen(true);
  };

  const updateScoreField = (key, value) => {
    const field = SCORE_FIELDS.find((item) => item.key === key);
    const parsed = Number(value);
    setSettingsDraft((previousValue) => ({
      ...previousValue,
      [key]: Number.isFinite(parsed) ? Math.min(field.max, Math.max(field.min, parsed)) : 0,
    }));
  };

  const commitSettings = () => {
    saveSettings(Object.fromEntries(SCORE_FIELDS.map((field) => [field.key, number(settingsDraft[field.key])])));
    setSettingsOpen(false);
  };

  const openVehicleDetails = async (vehicle) => {
    setSelectedVehicle(vehicle);
    setDetailEvents([]);
    setDetailError('');
    setDetailLoading(true);
    try {
      const registrations = telemetryRegistrationsForVehicle(vehicle, aliasMap);
      const eventGroups = await Promise.all(registrations.map((registration) =>
        cartrackService.getVehicleEvents(registration, data.currentStart, data.currentEnd).catch(() => [])));
      const seenEvents = new Set();
      setDetailEvents(eventGroups.flat()
        .filter((event) => {
          const key = event.event_id || event.id || `${event.event_ts || event.received_ts}|${event.event_description}|${event.latitude}|${event.longitude}`;
          if (seenEvents.has(key)) return false;
          seenEvents.add(key);
          return true;
        })
        .map((event) => ({ ...event, riskType: riskEventType(event) }))
        .filter((event) => event.riskType)
        .sort((a, b) => new Date(b.event_ts || b.received_ts) - new Date(a.event_ts || a.received_ts)));
    } catch (err) {
      setDetailError(err.message || 'Unable to load Cartrack event evidence.');
    } finally {
      setDetailLoading(false);
    }
  };

  const scoreFactors = selectedVehicle ? [
    { key: 'speeding', label: t('Speeding time', 'مدة تجاوز السرعة'), observed: `${selectedVehicle.speedingPercent.toFixed(2)}%`, allowance: `${number(scoreSettings.speedingTimeThresholdPercent).toFixed(2)}%`, weight: number(scoreSettings.speedingPenaltyWeight), deduction: selectedVehicle.speedingPenalty },
    { key: 'acceleration', label: t('Harsh acceleration', 'التسارع الحاد'), observed: `${selectedVehicle.accelerationPerThousandKm.toFixed(1)} / 1,000 km`, allowance: `${number(scoreSettings.harshAccelerationThreshold).toFixed(1)} / 1,000 km`, weight: number(scoreSettings.harshAccelerationPenaltyWeight), deduction: selectedVehicle.accelerationPenalty },
    { key: 'braking', label: t('Harsh braking', 'الفرملة الحادة'), observed: `${selectedVehicle.brakingPerThousandKm.toFixed(1)} / 1,000 km`, allowance: `${number(scoreSettings.harshBrakingThreshold).toFixed(1)} / 1,000 km`, weight: number(scoreSettings.harshBrakingPenaltyWeight), deduction: selectedVehicle.brakingPenalty },
    { key: 'cornering', label: t('Harsh cornering', 'الانعطاف الحاد'), observed: `${selectedVehicle.corneringPerThousandKm.toFixed(1)} / 1,000 km`, allowance: `${number(scoreSettings.harshCorneringThreshold).toFixed(1)} / 1,000 km`, weight: number(scoreSettings.harshCorneringPenaltyWeight), deduction: selectedVehicle.corneringPenalty },
  ] : [];

  if (loading) {
    return <div className="driver-score-loading" aria-label={t('Loading driver scores', 'جارٍ تحميل درجات السائقين')}><div /><div /><div /></div>;
  }

  if (error) {
    return (
      <div className="driver-score-empty driver-score-empty--error">
        <Activity size={28} />
        <strong>{t('Driver scores could not be loaded', 'تعذر تحميل درجات السائقين')}</strong>
        <span>{error}</span>
        <button type="button" onClick={load}>{t('Try again', 'إعادة المحاولة')}</button>
      </div>
    );
  }

  return (
    <section className="driver-scores">
      <header className="driver-score-toolbar">
        <div>
          <span className="driver-score-eyebrow">{t('Cartrack vehicle scorecard', 'بطاقة أداء مركبات كارتراك')}</span>
          <h2>{t('Vehicle Safety Scores', 'درجات سلامة المركبات')}</h2>
          <p>{t('Vehicles are scored from Cartrack trips and linked to the current driver in Fleet.', 'يتم تقييم المركبات من رحلات كارتراك وربطها بالسائق الحالي في الأسطول.')}</p>
        </div>
        <div className="driver-score-actions">
          <label className="driver-period">
            <CalendarDays size={16} aria-hidden="true" />
            <select
              value={periodDays}
              onChange={(event) => setPeriodDays(Number(event.target.value))}
              aria-label={t('Score period', 'فترة التقييم')}
            >
              {SCORE_PERIOD_OPTIONS.map((option) => (
                <option key={option.days} value={option.days}>{t(option.en, option.ar)}</option>
              ))}
            </select>
            <ChevronDown size={14} aria-hidden="true" />
          </label>
          <button className="driver-score-settings-btn" type="button" onClick={openSettings}><SlidersHorizontal size={15} /> {t('Score thresholds', 'حدود التقييم')}</button>
        </div>
      </header>

      <div className="driver-score-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'overview'} onClick={() => setTab('overview')} className={tab === 'overview' ? 'active' : ''}>{t('Overview', 'نظرة عامة')}</button>
        <button type="button" role="tab" aria-selected={tab === 'ranking'} onClick={() => setTab('ranking')} className={tab === 'ranking' ? 'active' : ''}>{t('Ranking', 'الترتيب')}</button>
      </div>

      {tab === 'overview' ? (
        <>
          <article className="driver-score-overview">
            <div className="driver-score-card-head">
              <strong>{t('Score overview', 'ملخص الدرجة')}</strong>
              <span>{data?.dateLabel}</span>
            </div>
            {current?.score == null ? (
              <div className="driver-score-empty">
                <Gauge size={30} />
                <strong>{t('No vehicle trips in this scope', 'لا توجد رحلات مركبات في هذا النطاق')}</strong>
                <span>{t('A score will appear when Cartrack returns trips for the selected fleet scope.', 'ستظهر الدرجة عند توفر رحلات كارتراك لنطاق الأسطول المحدد.')}</span>
              </div>
            ) : (
              <>
                <div className="driver-score-kpis">
                  <div><span>{t('This period', 'الفترة الحالية')}</span><strong className={scoreTone(current.score, scoreSettings.safetyScoreTarget)}>{current.score}</strong>{change != null && <em className={change >= 0 ? 'up' : 'down'}>{change > 0 ? '+' : ''}{change} pts</em>}</div>
                  <div><span>{t('Previous period', 'الفترة السابقة')}</span><strong className="previous">{previous?.score ?? '—'}</strong></div>
                </div>
                <div className="driver-score-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={current.daily} margin={{ top: 10, right: 20, left: -20, bottom: 4 }}>
                      <CartesianGrid vertical={false} stroke="var(--theme-border-light)" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--theme-text-muted)' }} interval={4} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--theme-text-muted)' }} axisLine={false} tickLine={false} />
                      <Tooltip content={<ScoreTooltip />} isAnimationActive={false} cursor={{ stroke: 'var(--theme-border-strong)', strokeWidth: 1 }} wrapperStyle={{ pointerEvents: 'none', transition: 'none' }} />
                      <ReferenceLine y={scoreSettings.safetyScoreTarget} stroke="var(--status-info, #3b82f6)" strokeDasharray="6 4" />
                      <Line type="monotone" dataKey="score" stroke="var(--theme-accent)" strokeWidth={2.25} dot={false} activeDot={{ r: 4 }} connectNulls isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="driver-score-summary">
                  <div><span>{t('Distance driven', 'المسافة المقطوعة')}</span><strong>{Math.round(current.distanceInKm).toLocaleString(locale)} km</strong></div>
                  <div><span>{t('Time driven', 'مدة القيادة')}</span><strong>{formatDuration(current.timeInSecond)}</strong></div>
                  <div className="driver-score-legend"><i /> {t('Safety score target', 'الدرجة المستهدفة')} <i /> {t('Selected fleet scope', 'نطاق الأسطول المحدد')}</div>
                </div>
              </>
            )}
          </article>

          <article className="driver-risk-breakdown">
            <div className="driver-score-card-head"><strong>{t('Risk events', 'أحداث المخاطر')}</strong><span>{data?.dateLabel}</span></div>
            <div className="driver-risk-grid">
              <div><span>{t('Speeding time', 'مدة تجاوز السرعة')}</span><strong>{formatDuration(current?.speedingSeconds || 0)}</strong><small>{(current?.speedingPercent || 0).toFixed(2)}% {t('of driving time', 'من مدة القيادة')}</small></div>
              <div><span>{t('Harsh driving events', 'أحداث القيادة العنيفة')}</span><strong>{Math.round(current?.harshEvents || 0).toLocaleString(locale)}</strong><small>{(current?.harshPerThousandKm || 0).toFixed(1)} / 1,000 km</small></div>
              <div><span>{t('Registered vehicles', 'المركبات المسجلة')}</span><strong>{current?.vehicles.length || 0}</strong><small>{t('in the selected Cartrack scope', 'في نطاق كارتراك المحدد')}</small></div>
            </div>
          </article>
        </>
      ) : (
        <article className="driver-ranking">
          <div className="driver-score-card-head"><div><strong>{t('Vehicle ranking', 'ترتيب المركبات')}</strong><span>{data?.dateLabel}</span></div><label><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('Search vehicle or current driver', 'ابحث عن مركبة أو السائق الحالي')} /></label></div>
          {vehicles.length ? (
            <div className="driver-ranking-table"><table><thead><tr><th>#</th><th>{t('Vehicle', 'المركبة')}</th><th>{t('Current Fleet Driver', 'سائق الأسطول الحالي')}</th><th>{t('Distance', 'المسافة')}</th><th>{t('Score', 'الدرجة')}</th><th><span className="sr-only">{t('Details', 'التفاصيل')}</span></th></tr></thead><tbody>{vehicles.map((vehicle, index) => <tr key={vehicle.id} className={vehicle.score == null ? 'driver-ranking-inactive' : ''}><td>{vehicle.score == null ? <span className="driver-rank driver-rank--inactive">—</span> : <span className="driver-rank"><Trophy size={13} />{index + 1}</span>}</td><td><strong>{vehicle.vehicleName}</strong><small className="driver-vehicle-reg">{vehicle.registration}</small></td><td>{vehicle.driverName}</td><td>{Math.round(vehicle.distanceInKm).toLocaleString(locale)} km</td><td>{vehicle.score == null ? <span className="driver-no-activity">{t('No activity', 'لا يوجد نشاط')}</span> : <b className={scoreTone(vehicle.score, scoreSettings.safetyScoreTarget)}>{vehicle.score}</b>}</td><td><button type="button" className="driver-audit-btn" onClick={() => openVehicleDetails(vehicle)}>{t('Explain score', 'شرح الدرجة')} <ChevronRight size={14} /></button></td></tr>)}</tbody></table></div>
          ) : <div className="driver-score-empty"><Search size={28} /><strong>{t('No matching scored vehicles', 'لا توجد مركبات مطابقة')}</strong></div>}
        </article>
      )}
      {settingsOpen && (
        <div className="driver-score-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false); }}>
          <section className="driver-score-settings-modal" role="dialog" aria-modal="true" aria-labelledby="score-settings-title">
            <header>
              <div><span>{t('Calculation controls', 'عناصر التحكم بالحساب')}</span><h3 id="score-settings-title">{t('Score thresholds', 'حدود التقييم')}</h3><p>{t('Only values above an allowance reduce the vehicle score.', 'فقط القيم التي تتجاوز الحد المسموح تقلل درجة المركبة.')}</p></div>
              <button type="button" onClick={() => setSettingsOpen(false)} aria-label={t('Close', 'إغلاق')}><X size={17} /></button>
            </header>
            <div className="driver-score-settings-grid">
              {SCORE_FIELDS.map((field) => (
                <label key={field.key}>
                  <span>{field.label}</span>
                  <div><input type="number" min={field.min} max={field.max} step={field.step} value={settingsDraft[field.key] ?? 0} onChange={(event) => updateScoreField(field.key, event.target.value)} /><small>{field.suffix}</small></div>
                </label>
              ))}
            </div>
            <footer>
              <button type="button" className="driver-score-reset" onClick={() => setSettingsDraft({ ...settingsDraft, ...SCORE_DEFAULTS })}><RotateCcw size={14} /> {t('Reset defaults', 'استعادة الافتراضي')}</button>
              <button type="button" className="driver-score-save" onClick={commitSettings}><Save size={14} /> {t('Save and recalculate', 'حفظ وإعادة الحساب')}</button>
            </footer>
          </section>
        </div>
      )}
      {selectedVehicle && (
        <div className="driver-audit-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedVehicle(null); }}>
          <aside className="driver-audit-drawer" role="dialog" aria-modal="true" aria-labelledby="driver-audit-title">
            <header>
              <div><span>{t('Cartrack evidence', 'أدلة كارتراك')}</span><h3 id="driver-audit-title">{selectedVehicle.vehicleName}</h3><p>{selectedVehicle.registration} · {selectedVehicle.driverName} · {data.dateLabel}</p></div>
              <button type="button" onClick={() => setSelectedVehicle(null)} aria-label={t('Close', 'إغلاق')}><X size={17} /></button>
            </header>
            <div className="driver-audit-body">
              <section className="driver-audit-formula">
                <div><span>{t('Starting score', 'الدرجة الابتدائية')}</span><strong>100</strong></div><i>−</i>
                <div><span>{t('Total deductions', 'إجمالي الخصومات')}</span><strong>{selectedVehicle.penalty.toFixed(1)}</strong></div><i>=</i>
                <div className={scoreTone(selectedVehicle.score, scoreSettings.safetyScoreTarget)}><span>{t('Final score', 'الدرجة النهائية')}</span><strong>{selectedVehicle.score ?? '—'}</strong></div>
              </section>

              <section className="driver-audit-section">
                <div className="driver-audit-heading"><div><span>01</span><h4>{t('What impacted the score', 'ما الذي أثر على الدرجة')}</h4></div><small>{t('Observed rate − allowance × weight', 'المعدل المرصود − السماح × الوزن')}</small></div>
                <div className="driver-factor-table"><div className="driver-factor-head"><span>{t('Factor', 'العامل')}</span><span>{t('Observed', 'المرصود')}</span><span>{t('Allowance', 'السماح')}</span><span>{t('Weight', 'الوزن')}</span><span>{t('Deduction', 'الخصم')}</span></div>{scoreFactors.map((factor) => <div key={factor.key} className={factor.deduction > 0 ? 'has-impact' : ''}><strong>{factor.label}</strong><span>{factor.observed}</span><span>{factor.allowance}</span><span>× {factor.weight}</span><b>−{factor.deduction.toFixed(1)}</b></div>)}</div>
              </section>

              <section className="driver-audit-section">
                <div className="driver-audit-heading"><div><span>02</span><h4>{t('When, what and where', 'متى وماذا وأين')}</h4></div><small>{detailEvents.length} {t('Cartrack risk events', 'حدث مخاطر من كارتراك')}</small></div>
                {detailLoading ? <div className="driver-event-loading"><div /><div /><div /></div> : detailError ? <div className="driver-event-empty error"><Activity size={22} /><strong>{t('Event evidence could not be loaded', 'تعذر تحميل أدلة الأحداث')}</strong><span>{detailError}</span><button type="button" onClick={() => openVehicleDetails(selectedVehicle)}>{t('Try again', 'إعادة المحاولة')}</button></div> : detailEvents.length ? <div className="driver-event-list">{detailEvents.map((event) => {
                  const hasCoordinates = Number.isFinite(Number(event.latitude)) && Number.isFinite(Number(event.longitude));
                  const mapUrl = hasCoordinates ? `https://www.google.com/maps?q=${Number(event.latitude)},${Number(event.longitude)}` : '';
                  return <article key={event.event_id || `${event.event_ts}-${event.riskType}`}>
                    <div className={`driver-event-icon ${event.riskType.includes('SPEED') ? 'speeding' : ''}`}><Activity size={15} /></div>
                    <div className="driver-event-copy"><div><strong>{eventLabel(event.riskType, t)}</strong><time>{eventTimestamp(event, locale)}</time></div><p>{event.position_description || t('Location not supplied by Cartrack', 'لم يزود كارتراك بالموقع')}</p><small>{Number(event.speed) > 0 ? `${t('Vehicle speed', 'سرعة المركبة')}: ${Math.round(Number(event.speed))} km/h` : ''}{Number(event.road_speed) > 0 ? ` · ${t('Road limit', 'حد الطريق')}: ${Math.round(Number(event.road_speed))} km/h` : ''}{Number(event.odometer) > 0 ? ` · ${t('Odometer', 'العداد')}: ${Math.round(Number(event.odometer) / 1000).toLocaleString(locale)} km` : ''}</small></div>
                    {mapUrl && <a href={mapUrl} target="_blank" rel="noreferrer" aria-label={t('Open location in Google Maps', 'فتح الموقع في خرائط جوجل')}><MapPin size={15} /></a>}
                  </article>;
                })}</div> : <div className="driver-event-empty"><Activity size={22} /><strong>{t('No individual risk events returned', 'لم يتم إرجاع أحداث مخاطر فردية')}</strong><span>{t('The score can still include trip-level totals. Cartrack did not return matching point events for this period.', 'قد تظل الدرجة تتضمن إجماليات على مستوى الرحلة، لكن كارتراك لم يُرجع أحداث نقاط مطابقة لهذه الفترة.')}</span></div>}
              </section>
              <p className="driver-audit-note">{t('Score = 100 minus deductions. Speeding is measured as a percentage of driving time; harsh events are normalized per 1,000 km so higher-mileage vehicles are compared fairly. Event rows are the raw Cartrack GPS evidence.', 'الدرجة = 100 ناقص الخصومات. يُقاس تجاوز السرعة كنسبة من وقت القيادة، وتُوحّد الأحداث الحادة لكل 1,000 كم للمقارنة العادلة. صفوف الأحداث هي أدلة GPS الخام من كارتراك.')}</p>
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}
