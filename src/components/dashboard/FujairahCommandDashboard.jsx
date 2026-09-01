import React from 'react';
import { motion } from 'framer-motion';
import {
  Activity, AlertTriangle, ArrowUpRight, BarChart2, Bell, Boxes, Bus,
  ChevronRight, FileText, MonitorPlay, Package, Search,
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area } from 'recharts';
import LanguageToggle from '../shared/LanguageToggle';
import ThemeToggle from '../shared/ThemeToggle';
import operationalBeacon from '../../assets/fujairah-command/operational-beacon.webp';

const RED = '#c70017';
const RANGES = ['1D', '1W', '1M', '1Y'];

const toMillis = (ts) => {
  if (!ts) return 0;
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
};

const ageShort = (ts) => {
  const ms = toMillis(ts);
  if (!ms) return '—';
  const mins = Math.floor((Date.now() - ms) / 60000);
  if (mins < 60) return `${Math.max(mins, 0)}m`;
  const hours = Math.floor(mins / 60);
  return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
};

function IconButton({ label, onClick, children }) {
  return (
    <button className="fcmd-icon-button" aria-label={label} title={label} onClick={onClick}>
      {children}
    </button>
  );
}

export default function FujairahCommandDashboard({
  t, lang, locale, navigate, userProfile, displayName, firstName, greeting,
  printBrief, bellOpen, setBellOpen, bellRef, attentionCount, bellItems,
  urgency, signals, tripData, fleetRange, changeRange, rangeLabel,
  fleetStatus, reportStats, invStats, assetStats, movements, monthName, fmt,
}) {
  const loaded = Boolean(Object.keys(signals || {}).length);
  const allClear = loaded && attentionCount === 0;
  const fleetTelemetryReady = Number.isFinite(fleetStatus?.onRoute) && Number.isFinite(fleetStatus?.total);

  return (
    <motion.main
      className="odx fcmd"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
    >
      <header className="fcmd-head">
        <div>
          <h1>{greeting}{firstName ? `, ${firstName}` : ''}</h1>
          <p>{t('Live service health, exceptions and movement across every operational module.', 'الصحة التشغيلية والاستثناءات والحركة المباشرة عبر جميع الوحدات.')}</p>
        </div>
        <div className="fcmd-head-actions">
          <LanguageToggle />
          <ThemeToggle />
          <IconButton label={t('Search', 'بحث')} onClick={() => window.dispatchEvent(new CustomEvent('fmac:palette'))}>
            <Search size={16} />
          </IconButton>
          <IconButton label={t('Daily brief', 'الموجز اليومي')} onClick={printBrief}>
            <FileText size={16} />
          </IconButton>
          <IconButton label={t('Wallboard', 'شاشة العمليات')} onClick={() => navigate('/wallboard')}>
            <MonitorPlay size={16} />
          </IconButton>
          <div className="odx-bell-wrap" ref={bellRef}>
            <IconButton label={t('Notifications', 'الإشعارات')} onClick={() => setBellOpen(value => !value)}>
              <Bell size={16} />
              {attentionCount > 0 && <span className="odx-bell-dot" />}
            </IconButton>
            {bellOpen && (
              <div className="odx-bell-menu">
                {bellItems.length === 0 ? (
                  <div className="odx-bell-none">{t('All clear — nothing needs attention.', 'كل شيء على ما يرام.')}</div>
                ) : bellItems.map(item => (
                  <button key={item.key} className="odx-bell-item" onClick={() => { setBellOpen(false); navigate(item.path); }}>
                    <b dir="ltr">{item.n.toLocaleString(locale)}</b>
                    <span>{item.label}</span>
                    <ChevronRight size={13} />
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className="fcmd-user" onClick={() => navigate('/profile')}>
            <span>{userProfile?.photoURL ? <img src={userProfile.photoURL} alt="" /> : (displayName || 'A').charAt(0).toUpperCase()}</span>
            {firstName || t('Admin', 'مسؤول')}
          </button>
        </div>
      </header>

      <section className="fcmd-masthead">
        <div className="fcmd-masthead-copy">
          <span className={`fcmd-state ${fleetTelemetryReady ? 'is-healthy' : 'is-loading'}`}>
            {fleetTelemetryReady ? <Bus size={14} /> : <Activity size={14} />}
            {fleetTelemetryReady
              ? t('Live fleet status', 'حالة الأسطول المباشرة')
              : t('Fleet status updating', 'تحديث حالة الأسطول')}
          </span>
          <h2>{!fleetTelemetryReady
            ? t('Live fleet status is updating.', 'يتم تحديث حالة الأسطول المباشرة.')
            : t(`${fmt(fleetStatus.onRoute)} of ${fmt(fleetStatus.total)} tracked vehicles are currently active.`, `${fmt(fleetStatus.onRoute)} من أصل ${fmt(fleetStatus.total)} مركبات متتبعة نشطة حالياً.`)}</h2>
          <p>{!fleetTelemetryReady
            ? t('Cartrack telemetry is being refreshed. No unavailable vehicle is counted as zero.', 'يتم تحديث بيانات كارتراك، ولن تُحتسب المركبات غير المتاحة كقيمة صفرية.')
            : t('This is a live activity summary, not an exception or warning.', 'هذا ملخص مباشر للنشاط، وليس استثناءً أو تحذيراً.')}</p>
          <button className="fcmd-primary" onClick={() => navigate('/fleet/livemap')}>
            {t('Open live fleet', 'فتح الأسطول المباشر')}
            <ArrowUpRight size={15} />
          </button>
        </div>

        <div className="fcmd-live-stack" aria-label={t('Live operational measures', 'المؤشرات التشغيلية المباشرة')}>
          <button className="fcmd-live-tile" onClick={() => navigate('/fleet/dashboard')}>
            <span className="fcmd-tile-icon"><Bus size={17} /></span>
            <span className="fcmd-tile-label">{t('Fleet on route', 'الأسطول على الطريق')}</span>
            <strong dir="ltr">{fleetStatus ? `${fmt(fleetStatus.onRoute)} / ${fmt(fleetStatus.total)}` : '—'}</strong>
            <small>{t('Live Cartrack scope', 'نطاق كارتراك المباشر')}</small>
          </button>
          <button className="fcmd-live-tile" onClick={() => navigate('/inventory')}>
            <span className="fcmd-tile-icon"><Package size={17} /></span>
            <span className="fcmd-tile-label">{t('Stock position', 'وضع المخزون')}</span>
            <strong dir="ltr">{fmt(invStats?.total)}</strong>
            <small>{invStats?.out != null ? `${fmt(invStats.out)} ${t('out of stock', 'نافد')}` : t('Loading stock health', 'تحميل صحة المخزون')}</small>
          </button>
          <button className="fcmd-live-tile" onClick={() => navigate('/reports')}>
            <span className="fcmd-tile-icon"><BarChart2 size={17} /></span>
            <span className="fcmd-tile-label">{t('Monthly assurance', 'ضمان التقرير الشهري')}</span>
            <strong dir="ltr">{reportStats ? `${fmt(reportStats.approved)} / ${fmt(reportStats.total)}` : '—'}</strong>
            <small>{monthName}</small>
          </button>
        </div>
      </section>

      <section className="fcmd-workspace">
        <div className="fcmd-command-main">
          <article className="fcmd-panel fcmd-distance">
            <div className="fcmd-panel-head">
              <div>
                <span className="fcmd-panel-kicker">{t('Movement pulse', 'نبض الحركة')}</span>
                <h3>{t('Fleet distance', 'مسافة الأسطول')}</h3>
              </div>
              <strong dir="ltr">{tripData?.totalKm == null ? '—' : `${tripData.totalKm.toLocaleString(locale)} km`}</strong>
            </div>
            <p className="fcmd-caption">{rangeLabel}</p>
            <div className="fcmd-chart" dir="ltr">
              {tripData?.points?.length > 0 ? (
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={tripData.points} margin={{ top: 16, right: 8, left: 8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="fcmdTripFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={RED} stopOpacity={0.22} />
                        <stop offset="100%" stopColor={RED} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="v" stroke={RED} strokeWidth={2.5} fill="url(#fcmdTripFill)" isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : <div className="fcmd-chart-empty">{t('Distance telemetry is loading.', 'يتم تحميل بيانات المسافة.')}</div>}
            </div>
            <div className="fcmd-range-tabs" dir="ltr">
              {RANGES.map(range => (
                <button key={range} className={fleetRange === range ? 'active' : ''} onClick={() => changeRange(range)}>{range}</button>
              ))}
            </div>
          </article>

          <article className="fcmd-panel fcmd-assets">
            <div className="fcmd-panel-head">
              <div>
                <span className="fcmd-panel-kicker">{t('Asset footprint', 'بصمة الأصول')}</span>
                <h3>{assetStats == null ? '—' : `${fmt(assetStats.total)} ${t('assets', 'أصل')}`}</h3>
              </div>
              <button className="fcmd-text-link" onClick={() => navigate('/assets')}>{t('Open register', 'فتح السجل')}<ArrowUpRight size={14} /></button>
            </div>
            {assetStats?.rooms?.length ? (
              <div className="fcmd-asset-list">
                {assetStats.rooms.map((room, index) => {
                  const max = Math.max(...assetStats.rooms.map(item => item.count), 1);
                  return (
                    <button key={room.key} onClick={() => navigate('/assets')}>
                      <span className="fcmd-asset-rank">{String(index + 1).padStart(2, '0')}</span>
                      <span className="fcmd-asset-name" dir="auto">{lang === 'ar' ? room.ar : room.en}</span>
                      <span className="fcmd-asset-track"><i style={{ transform: `scaleX(${room.count / max})` }} /></span>
                      <b dir="ltr">{fmt(room.count)}</b>
                    </button>
                  );
                })}
              </div>
            ) : <div className="fcmd-empty"><Boxes size={22} />{t('No asset distribution available.', 'لا يتوفر توزيع للأصول.')}</div>}
          </article>
        </div>

        <div className="fcmd-command-side">
          <aside className={`fcmd-priority ${urgency ? 'has-issue' : ''}`}>
            <div className="fcmd-priority-top">
              <span>{t('Priority queue', 'قائمة الأولويات')}</span>
              <b dir="ltr">{attentionCount}</b>
            </div>
            {urgency ? (
              <>
                <div className="fcmd-priority-body">
                  <div className="fcmd-priority-mark"><AlertTriangle size={22} /></div>
                  <div className="fcmd-priority-copy">
                    <h3>{fmt(urgency.n)} {urgency.unit}</h3>
                    <p>{urgency.line2}</p>
                  </div>
                </div>
                <button onClick={() => navigate(urgency.path)}>{urgency.cta}<ArrowUpRight size={14} /></button>
              </>
            ) : (
              <>
                <img src={operationalBeacon} alt="" className="fcmd-beacon" />
                <h3>{allClear ? t('No immediate exceptions', 'لا توجد استثناءات فورية') : t('Command checks in progress', 'فحوصات القيادة قيد التنفيذ')}</h3>
                <p>{t('The beacon stays quiet until an operational signal needs a decision.', 'يبقى المنار هادئاً حتى تتطلب إشارة تشغيلية قراراً.')}</p>
              </>
            )}
          </aside>

          <article className="fcmd-panel fcmd-movements">
            <div className="fcmd-panel-head">
              <div>
                <span className="fcmd-panel-kicker">{t('Controlled flow', 'التدفق المنضبط')}</span>
                <h3>{t('Latest stock movements', 'أحدث حركات المخزون')}</h3>
              </div>
              <Activity size={18} />
            </div>
            <div className="fcmd-movement-list">
              {movements == null ? <div className="fcmd-empty">{t('Loading movements…', 'تحميل الحركات…')}</div> : movements.length === 0 ? (
                <div className="fcmd-empty">{t('No stock movement recorded.', 'لا توجد حركة مخزون مسجلة.')}</div>
              ) : movements.slice(0, 6).map((movement) => {
                const isIn = movement.type === 'IN';
                return (
                  <button key={movement.id} onClick={() => navigate('/inventory/history')}>
                    <span className={`fcmd-flow-icon ${isIn ? 'is-in' : 'is-out'}`}><ArrowUpRight size={14} /></span>
                    <span><b dir="auto">{movement.itemName || '—'}</b><small dir="auto">{movement.issuedTo?.personName || movement.performedByName || '—'}</small></span>
                    <strong className={isIn ? 'is-in' : 'is-out'} dir="ltr">{isIn ? '+' : '−'}{movement.quantity}</strong>
                    <time dir="ltr">{ageShort(movement.createdAt)}</time>
                  </button>
                );
              })}
            </div>
          </article>
        </div>
      </section>
    </motion.main>
  );
}
