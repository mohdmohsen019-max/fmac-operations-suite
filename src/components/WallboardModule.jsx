import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Bus, LifeBuoy, Package, Users as UsersIcon, X, Maximize2, Minimize2, MapPin,
  Sun, CloudSun, Cloud, CloudFog, CloudRain, CloudLightning, MoonStar,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';
import { cartrackService } from '../services/cartrackService';
import { useLanguage } from '../contexts/LanguageContext';
import WallboardMap from './WallboardMap';
import './WallboardModule.css';

const toMillis = (ts) => {
  if (!ts) return 0;
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const ms = d.getTime();
  return isNaN(ms) ? 0 : ms;
};

/* WMO weather code → icon + label */
function weatherMeta(code, isNight, t) {
  if (code === 0) return { Icon: isNight ? MoonStar : Sun, label: t('Clear', 'صافٍ') };
  if (code <= 3) return { Icon: CloudSun, label: t('Partly cloudy', 'غائم جزئياً') };
  if (code === 45 || code === 48) return { Icon: CloudFog, label: t('Fog', 'ضباب') };
  if (code >= 95) return { Icon: CloudLightning, label: t('Storm', 'عاصفة') };
  if (code >= 51) return { Icon: CloudRain, label: t('Rain', 'أمطار') };
  return { Icon: Cloud, label: t('Cloudy', 'غائم') };
}

const PRAYERS = [
  ['Fajr', 'الفجر'], ['Dhuhr', 'الظهر'], ['Asr', 'العصر'],
  ['Maghrib', 'المغرب'], ['Isha', 'العشاء'],
];

export default function WallboardModule() {
  const navigate = useNavigate();
  const { t, locale } = useLanguage();
  const rootRef = useRef(null);

  const [now, setNow] = useState(() => Date.now());
  const [fleet, setFleet] = useState(null);      // { moving, idling, parked }
  const [fleetVehicles, setFleetVehicles] = useState([]); // raw live vehicles for the map
  const [tickets, setTickets] = useState(null);  // { open, overdue }
  const [stock, setStock] = useState(null);      // { out, low }
  const [today, setToday] = useState(null);      // { sessions, present }
  const [feed, setFeed] = useState([]);
  const [weather, setWeather] = useState(null);  // { temp, code }
  const [prayer, setPrayer] = useState(null);    // { name, nameAr, time }
  const [isFull, setIsFull] = useState(false);

  /* ── Clock ── */
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  /* ── Live fleet status — every 60s ── */
  const loadFleet = useCallback(async () => {
    try {
      const data = await cartrackService.getLiveStatus();
      if (!data) return;
      setFleet({
        moving: data.filter(v => v.ignition && v.speed > 0).length,
        idling: data.filter(v => v.ignition && v.speed === 0).length,
        parked: data.filter(v => !v.ignition).length,
        total: data.length,
      });
      setFleetVehicles(data);
    } catch { /* keep last */ }
  }, []);

  /* ── Firestore snapshots — every 5 min ── */
  const loadOps = useCallback(async () => {
    await Promise.allSettled([
      (async () => {
        const snap = await getDocs(collection(db, 'requests'));
        const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setTickets({
          open: rows.filter(r => r.status !== 'closed').length,
          overdue: rows.filter(r => r.slaDeadline?.toDate && r.slaDeadline.toDate() < new Date() && r.status !== 'closed').length,
        });
        const latestTickets = rows
          .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))
          .slice(0, 4)
          .map(r => ({
            id: `tk-${r.id}`, ts: toMillis(r.createdAt), color: '#7ba6f7',
            text: `${r.ticketNumber || ''} · ${r.userInfo?.name || t('New ticket', 'تذكرة جديدة')}`,
          }));
        setFeed(prev => {
          const rest = prev.filter(e => !e.id.startsWith('tk-'));
          return [...rest, ...latestTickets].sort((a, b) => b.ts - a.ts).slice(0, 9);
        });
      })(),
      (async () => {
        const snap = await getDocs(collection(db, 'inventory_items'));
        const items = snap.docs.map(d => d.data()).filter(i => i.isActive !== false);
        setStock({
          out: items.filter(i => i.currentStock === 0).length,
          low: items.filter(i => i.currentStock > 0 && i.currentStock <= (i.minThreshold ?? 5)).length,
        });
      })(),
      (async () => {
        const key = new Date().toLocaleDateString('en-CA');
        const snap = await getDocs(collection(db, 'sessions'));
        const todays = snap.docs.filter(d => d.id.startsWith(key));
        setToday({
          sessions: todays.length,
          present: todays.reduce((s, d) => s + (Number(d.data().presentCount) || 0), 0),
        });
      })(),
      (async () => {
        const snap = await getDocs(collection(db, 'inventory_movements'));
        const latest = snap.docs.map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))
          .slice(0, 5)
          .map(m => ({
            id: `mv-${m.id}`, ts: toMillis(m.createdAt), color: m.type === 'stock_in' ? '#4ecf9a' : '#e58a82',
            text: `${m.type === 'stock_in' ? '+' : '−'}${m.quantity} · ${m.itemNameAr || m.itemNameEn || m.itemSku || ''}`,
          }));
        setFeed(prev => {
          const rest = prev.filter(e => !e.id.startsWith('mv-'));
          return [...rest, ...latest].sort((a, b) => b.ts - a.ts).slice(0, 9);
        });
      })(),
    ]);
  }, [t]);

  /* ── Weather + next prayer — hourly ── */
  const loadAmbient = useCallback(async () => {
    const timeout = (ms) => {
      const c = new AbortController();
      setTimeout(() => c.abort(), ms);
      return c.signal;
    };
    try {
      const r = await fetch(
        'https://api.open-meteo.com/v1/forecast?latitude=25.1288&longitude=56.3265&current_weather=true',
        { signal: timeout(6000) }
      );
      const j = await r.json();
      if (j?.current_weather) {
        setWeather({ temp: Math.round(j.current_weather.temperature), code: j.current_weather.weathercode });
      }
    } catch { /* strip hides itself */ }
    try {
      const r = await fetch(
        'https://api.aladhan.com/v1/timingsByCity?city=Fujairah&country=AE&method=8',
        { signal: timeout(6000) }
      );
      const j = await r.json();
      const timings = j?.data?.timings;
      if (timings) {
        const nowD = new Date();
        let next = null;
        for (const [en, ar] of PRAYERS) {
          const [h, m] = (timings[en] || '').split(':').map(Number);
          if (Number.isNaN(h)) continue;
          const at = new Date(nowD.getFullYear(), nowD.getMonth(), nowD.getDate(), h, m);
          if (at > nowD) { next = { en, ar, at: at.getTime() }; break; }
        }
        if (!next) {
          const [h, m] = (timings.Fajr || '5:00').split(':').map(Number);
          const at = new Date(nowD.getFullYear(), nowD.getMonth(), nowD.getDate() + 1, h, m);
          next = { en: 'Fajr', ar: 'الفجر', at: at.getTime() };
        }
        setPrayer(next);
      }
    } catch { /* strip hides itself */ }
  }, []);

  useEffect(() => {
    // All state writes in these loaders happen after fetches settle —
    // same pattern/waiver as useIsMobile.js.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadFleet(); loadOps(); loadAmbient();
    const a = setInterval(loadFleet, 60 * 1000);
    const b = setInterval(loadOps, 5 * 60 * 1000);
    const c = setInterval(loadAmbient, 60 * 60 * 1000);
    return () => { clearInterval(a); clearInterval(b); clearInterval(c); };
  }, [loadFleet, loadOps, loadAmbient]);

  /* ── Fullscreen ── */
  const toggleFull = () => {
    if (!document.fullscreenElement) {
      rootRef.current?.requestFullscreen?.().then(() => setIsFull(true)).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => setIsFull(false)).catch(() => {});
    }
  };
  useEffect(() => {
    const onChange = () => setIsFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const d = new Date(now);
  const timeStr = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  const secStr = String(d.getSeconds()).padStart(2, '0');
  const dateStr = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d);

  const wx = weather ? weatherMeta(weather.code, d.getHours() >= 19 || d.getHours() < 6, t) : null;
  const prayerLeft = prayer ? Math.max(prayer.at - now, 0) : null;
  const prayerH = prayerLeft != null ? Math.floor(prayerLeft / 3600000) : 0;
  const prayerM = prayerLeft != null ? Math.floor((prayerLeft % 3600000) / 60000) : 0;

  const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString(locale));

  return (
    <div className="wb" ref={rootRef}>
      <div className="wb-top">
        <div className="wb-brand">
          <img src="/fmac-logo-new.png" alt="FMAC" />
          <span>{t('FMAC Operations', 'عمليات نادي الفجيرة')}</span>
        </div>
        <div className="wb-ambient">
          {wx && (
            <span className="wb-wx">
              <wx.Icon size={16} strokeWidth={1.8} />
              {weather.temp}° · {wx.label}
            </span>
          )}
          {prayer && (
            <span className="wb-prayer">
              {t(prayer.en, prayer.ar)} · {prayerH > 0 ? `${prayerH}${t('h', 'س')} ` : ''}{prayerM}{t('m', 'د')}
            </span>
          )}
          <button className="wb-ctl" onClick={toggleFull} aria-label={t('Fullscreen', 'ملء الشاشة')}>
            {isFull ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
          <button className="wb-ctl" onClick={() => navigate('/dashboard')} aria-label={t('Exit', 'خروج')}>
            <X size={15} />
          </button>
        </div>
      </div>

      <div className="wb-clockzone">
        <div className="wb-clock" dir="ltr">
          {timeStr}<span className="wb-sec">:{secStr}</span>
        </div>
        <div className="wb-date">{dateStr}</div>
      </div>

      <div className="wb-main">
        <div className="wb-kpis">
          <div className="wb-tile">
            <div className="wb-tile-head" style={{ color: '#d9b45c' }}>
              <Bus size={16} strokeWidth={1.8} /> {t('Fleet', 'الأسطول')}
            </div>
            <div className="wb-tile-num" dir="ltr">{fmt(fleet?.moving)}</div>
            <div className="wb-tile-label">{t('buses moving now', 'حافلة تتحرك الآن')}</div>
            <div className="wb-tile-sub" dir="ltr">
              {fmt(fleet?.idling)} {t('idling', 'خاملة')} · {fmt(fleet?.parked)} {t('parked', 'متوقفة')}
            </div>
          </div>

          <div className="wb-tile">
            <div className="wb-tile-head" style={{ color: '#e58a82' }}>
              <UsersIcon size={16} strokeWidth={1.8} /> {t('Today', 'اليوم')}
            </div>
            <div className="wb-tile-num" dir="ltr">{fmt(today?.present)}</div>
            <div className="wb-tile-label">{t('players present today', 'لاعب حاضر اليوم')}</div>
            <div className="wb-tile-sub" dir="ltr">
              {fmt(today?.sessions)} {t('sessions recorded', 'جلسة مسجلة')}
            </div>
          </div>

          <div className="wb-tile">
            <div className="wb-tile-head" style={{ color: '#7ba6f7' }}>
              <LifeBuoy size={16} strokeWidth={1.8} /> {t('Help Desk', 'الدعم')}
            </div>
            <div className="wb-tile-num" dir="ltr">{fmt(tickets?.open)}</div>
            <div className="wb-tile-label">{t('tickets open', 'تذكرة مفتوحة')}</div>
            <div className={`wb-tile-sub${tickets?.overdue > 0 ? ' wb-alert' : ''}`} dir="ltr">
              {fmt(tickets?.overdue)} {t('past SLA', 'متأخرة')}
            </div>
          </div>

          <div className="wb-tile">
            <div className="wb-tile-head" style={{ color: '#4ecf9a' }}>
              <Package size={16} strokeWidth={1.8} /> {t('Warehouse', 'المستودع')}
            </div>
            <div className="wb-tile-num" dir="ltr">{fmt(stock?.out)}</div>
            <div className="wb-tile-label">{t('items out of stock', 'صنف نفذ')}</div>
            <div className="wb-tile-sub" dir="ltr">
              {fmt(stock?.low)} {t('running low', 'منخفض')}
            </div>
          </div>
        </div>

        <div className="wb-map-panel">
          <div className="wb-map-head">
            <span className="wb-map-title">
              <MapPin size={15} strokeWidth={1.9} /> {t('Live fleet map', 'خريطة الأسطول المباشرة')}
            </span>
            <div className="wb-map-legend">
              <span><i style={{ background: '#4ecf9a' }} />{t('Moving', 'متحرك')}</span>
              <span><i style={{ background: '#d9b45c' }} />{t('Idling', 'خامل')}</span>
              <span><i style={{ background: '#e58a82' }} />{t('Parked', 'متوقف')}</span>
            </div>
          </div>
          <div className="wb-map-canvas">
            <WallboardMap vehicles={fleetVehicles} />
          </div>
        </div>
      </div>

      <div className="wb-feed">
        <div className="wb-feed-title">{t('Latest activity', 'أحدث النشاط')}</div>
        <div className="wb-feed-list">
          {feed.length === 0 ? (
            <span className="wb-feed-empty">{t('Listening…', 'بانتظار النشاط…')}</span>
          ) : feed.map(e => (
            <span key={e.id} className="wb-feed-item" dir="auto">
              <span className="wb-feed-dot" style={{ background: e.color }} />
              {e.text}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
