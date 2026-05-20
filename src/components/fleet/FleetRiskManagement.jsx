import { useState, useEffect } from 'react';
import { Activity, AlertCircle, User, ShieldAlert, PieChart as PieIcon, Zap } from 'lucide-react';
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from 'recharts';
import { useLanguage } from '../../contexts/LanguageContext';
import { useFleetSettings } from './FleetSettingsContext';
import { cartrackService } from '../../services/cartrackService';
import { getVehicleMeta } from '../../services/fleetMapping';
import { format } from 'date-fns';
import './FleetModule.css';

export default function FleetRiskManagement() {
  const { settings } = useFleetSettings();
  const { t, locale } = useLanguage();
  const [violations, setViolations] = useState([]);
  const [scorecards, setScorecards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isMounted, setIsMounted] = useState(false);
  const [avgFleetScore, setAvgFleetScore] = useState(0);

  useEffect(() => {
    fetchData();
    const timer = setTimeout(() => setIsMounted(true), 600);
    return () => clearTimeout(timer);
  }, []);

  const safeFormat = (dateStr, formatStr) => {
    if (!dateStr) return '';
    try {
      let d;
      const now = new Date();
      const todayStr = format(now, 'yyyy-MM-dd');

      if (typeof dateStr === 'number') {
        d = new Date(dateStr > 100000000000 ? dateStr : dateStr * 1000);
      } else if (typeof dateStr === 'string') {
        if (/^\d{2}:\d{2}(:\d{2})?$/.test(dateStr)) {
          d = new Date(`${todayStr}T${dateStr}`);
        }
        else if (dateStr.includes('-') && dateStr.split('-')[0].length <= 2) {
          const parts = dateStr.split(' ');
          const dateParts = parts[0].split('-');
          const timeParts = parts[1] || '00:00:00';
          d = new Date(`${dateParts[2]}-${dateParts[1]}-${dateParts[0]}T${timeParts}`);
        } else {
          d = new Date(dateStr.replace(' ', 'T'));
        }
      } else if (dateStr instanceof Date) {
        d = dateStr;
      }

      if (!d || isNaN(d.getTime())) return '';

      if (formatStr === 'HH:mm') {
        return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
      }
      if (formatStr === 'MMM d') {
        return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(d);
      }

      return format(d, formatStr);
    } catch (e) {
      return '';
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [events, scData] = await Promise.all([
        cartrackService.getRiskEvents(7),
        cartrackService.getDriverScorecards(7, {
          speedingLimit: settings.speedingLimit,
          brakingMultiplier: settings.brakingSensitivity,
        })
      ]);

      if (events) {
        setViolations(events.map(v => ({
          id: v.id || Math.random().toString(),
          timestamp: v.received_ts || new Date().toISOString(),
          plate: v.registration || 'N/A',
          type: v.alert_type || 'System Alert',
          severity: v.severity || 'Moderate',
          value: v.value || '-',
          location: v.position_description || 'Unknown Location'
        })));
      }

      if (scData) {
        setScorecards(scData);
        if (scData.length > 0) {
          const avg = Math.round(scData.reduce((acc, s) => acc + s.riskScore, 0) / scData.length);
          setAvgFleetScore(avg);
        }
      }
    } catch (err) {
      console.error('Risk Data Fetch Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const COLORS = {
    critical: 'var(--status-risk)',
    high: 'var(--status-safe)',
    moderate: '#064e3b',
    low: '#065f46'
  };

  const pieData = [
    { name: t('Critical', 'حرج'), value: violations.filter(v => v.severity === 'Critical').length, color: COLORS.critical },
    { name: t('High', 'مرتفع'), value: violations.filter(v => v.severity === 'High').length, color: COLORS.high },
    { name: t('Moderate', 'متوسط'), value: violations.filter(v => v.severity === 'Moderate').length, color: COLORS.moderate },
  ].filter(d => d.value > 0);
  
  const radarData = [
    { subject: t('Braking', 'الكبح'), A: avgFleetScore, fullMark: 100 },
    { subject: t('Speeding', 'السرعة'), A: 94, fullMark: 100 },
    { subject: t('Cornering', 'الانعطاف'), A: 88, fullMark: 100 },
    { subject: t('Accel', 'التسارع'), A: 82, fullMark: 100 },
    { subject: t('Stability', 'الثبات'), A: 91, fullMark: 100 },
  ];

  if (loading || !isMounted) {
    return (
      <div className="view-loading">
        <div className="app-loader"><span /><span /><span /><span /><span /></div>
      </div>
    );
  }

  return (
    <div className="risk-management-view">
      <div className="stats-bento">
        <div className="stat-card glass-panel">
          <div className="stat-header"><h3>{t('Fleet Safety Index', 'مؤشر سلامة الأسطول')}</h3><Activity size={16} /></div>
          <div className={`stat-value ${avgFleetScore > 80 ? 'text-safe' : 'text-caution'}`}>{avgFleetScore}</div>
          <p className="stat-label">{t('Avg. Performance Score', 'متوسط درجة الأداء')}</p>
        </div>
        <div className="stat-card glass-panel">
          <div className="stat-header"><h3>{t('Total Violations', 'إجمالي المخالفات')}</h3><AlertCircle size={16} className="text-risk" /></div>
          <div className="stat-value text-risk">{violations.length.toLocaleString(locale)}</div>
          <p className="stat-label">{t('Detected (Last 7 Days)', 'تم اكتشافها (آخر 7 أيام)')}</p>
        </div>
        <div className="stat-card glass-panel">
          <div className="stat-header"><h3>{t('Safe Units', 'الوحدات الآمنة')}</h3><User size={16} className="text-safe" /></div>
          <div className="stat-value text-safe">{scorecards.filter(s => s.riskScore >= 80).length.toLocaleString(locale)}</div>
          <p className="stat-label">{t('Operating in Optimal Range', 'تعمل في النطاق الأمثل')}</p>
        </div>
        <div className="stat-card glass-panel">
          <div className="stat-header"><h3>{t('High Risk', 'مخاطر عالية')}</h3><ShieldAlert size={16} className="text-caution" /></div>
          <div className="stat-value text-caution">{scorecards.filter(s => s.riskScore < 60).length.toLocaleString(locale)}</div>
          <p className="stat-label">{t('Urgent Intervention Required', 'مطلوب تدخل عاجل')}</p>
        </div>
      </div>

      <div className="fleet-charts-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
        <div className="glass-panel" style={{ minHeight: '400px' }}>
          <h3 className="chart-title" style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '20px', fontSize: '1rem', color: 'var(--theme-text-muted)' }}>
            <PieIcon size={18} /> {t('Severity Distribution', 'توزيع الخطورة')}
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={pieData} innerRadius={80} outerRadius={110} paddingAngle={5} dataKey="value" stroke="none">
                {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
              </Pie>
              <Tooltip
                contentStyle={{ backgroundColor: 'var(--theme-surface)', border: '1px solid var(--theme-border)', borderRadius: '12px', textAlign: locale === 'ar-SA' ? 'right' : 'left' }}
                itemStyle={{ color: 'var(--theme-text-main)' }}
              />
              <Legend verticalAlign="bottom" height={36}/>
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-panel">
          <h3 className="chart-title" style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '20px', fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--theme-text-muted)' }}>
            <Zap size={16} color="var(--theme-accent)" /> {t('Safety Performance Radar', 'رادار أداء السلامة')}
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <RadarChart cx="50%" cy="50%" outerRadius="72%" data={radarData}>
              <PolarGrid stroke="var(--theme-border)" gridType="polygon" />
              <PolarAngleAxis
                dataKey="subject"
                tick={{ fill: 'var(--theme-text-muted)', fontSize: 11, fontWeight: 600 }}
              />
              <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
              <Radar
                name={t('Fleet Avg', 'متوسط الأسطول')}
                dataKey="A"
                stroke="var(--theme-accent)"
                strokeWidth={2}
                fill="var(--theme-accent)"
                fillOpacity={0.18}
                dot={{ fill: 'var(--theme-accent)', r: 3 }}
              />
              <Tooltip
                contentStyle={{ backgroundColor: 'var(--theme-surface)', border: '1px solid var(--theme-accent-border)', borderRadius: '10px', fontSize: '0.8rem', textAlign: locale === 'ar-SA' ? 'right' : 'left' }}
                itemStyle={{ color: 'var(--theme-accent)', fontWeight: 700 }}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: '0', overflow: 'hidden' }}>
        <div style={{ padding: '24px', borderBottom: '1px solid var(--theme-border-light)' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>{t('Recent Safety Incidents', 'حوادث السلامة الأخيرة')}</h3>
          <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--theme-text-muted)' }}>{t('Real-time telemetry breach logs (Last 7 Days)', 'سجلات خرق القياس عن بعد في الوقت الفعلي (آخر 7 أيام)')}</p>
        </div>
        <div className="fleet-table-container" style={{ borderRadius: 0, border: 'none' }}>
          <table className="fleet-table">
            <thead>
              <tr>
                <th>{t('Vehicle', 'المركبة')}</th>
                <th>{t('Incident', 'الحادث')}</th>
                <th>{t('Severity', 'الخطورة')}</th>
              </tr>
            </thead>
            <tbody>
              {violations.slice(0, 15).map((v) => (
                <tr key={v.id}>
                  <td style={{ fontWeight: 800, color: 'var(--theme-text-main)' }}>
                    {v.plate}
                    <div style={{ fontSize: '0.7rem', color: 'var(--theme-text-muted)', fontWeight: 400 }}>{getVehicleMeta(v.plate).driverName}</div>
                  </td>
                  <td style={{ fontWeight: 600 }}>{t(v.type, v.type === 'Speeding' ? 'تجاوز السرعة' : v.type === 'Harsh Braking' ? 'فرملة شديدة' : v.type)}</td>
                  <td>
                    <span className={`status-badge ${v.severity === 'Critical' ? 'risk' : v.severity === 'High' ? 'maintenance' : 'active'}`}>
                      {v.severity === 'Critical' ? t('Critical', 'حرج') : v.severity === 'High' ? t('High', 'مرتفع') : t('Moderate', 'متوسط')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
