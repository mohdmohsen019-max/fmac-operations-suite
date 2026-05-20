import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  ArrowLeft, Fuel, Activity, Clock, ShieldCheck, Gauge, 
  TrendingUp, DollarSign, Calendar, MapPin, Truck
} from 'lucide-react';
import { 
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, 
  Tooltip, BarChart, Bar, Cell 
} from 'recharts';
import { useFleetSettings, convertCurrency } from '../FleetSettingsContext';
import { useLanguage } from '../../../contexts/LanguageContext';

export default function FuelVehicleDetail({ vehicle, onBack }) {
  const { settings } = useFleetSettings();
  const { t, locale } = useLanguage();
  const currency = settings.currency;
  
  if (!vehicle) return null;

  // Mock trend data for the specific vehicle
  const monthlyTrend = [
    { month: t('Jan', 'يناير'), cost: vehicle.cost * 0.9, km: vehicle.km * 0.85 },
    { month: t('Feb', 'فبراير'), cost: vehicle.cost * 1.1, km: vehicle.km * 1.05 },
    { month: t('Mar', 'مارس'), cost: vehicle.cost, km: vehicle.km },
  ];

  return (
    <div className="fuel-detail-view">
      <button 
        onClick={onBack}
        style={{ 
          background: 'transparent', 
          border: 'none', 
          color: 'var(--fuel-text-muted)', 
          display: 'flex', 
          alignItems: 'center', 
          gap: '8px',
          cursor: 'pointer',
          marginBottom: '24px',
          padding: '0'
        }}
      >
        <ArrowLeft size={18} style={{ transform: locale === 'ar-SA' ? 'rotate(180deg)' : 'none' }} /> {t('Back to Fuel Analytics', 'العودة إلى تحليلات الوقود')}
      </button>

      <header className="fuel-panel-header" style={{ alignItems: 'flex-start', marginBottom: '32px' }}>
        <div>
          <div className="fuel-kpi-label">{t('Vehicle Intelligence Profile', 'ملف ذكاء المركبة')}</div>
          <h1 style={{ fontSize: '2.5rem', fontWeight: 800, margin: 0, color: 'white' }}>
            {t('Bus', 'حافلة')} <span style={{ color: 'var(--fuel-amber)' }}>{vehicle.plate}</span>
          </h1>
          <div style={{ display: 'flex', gap: '16px', marginTop: '8px' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--fuel-text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <MapPin size={14} /> {t('Fujairah Base', 'قاعدة الفجيرة')}
            </span>
            <span style={{ fontSize: '0.85rem', color: 'var(--fuel-text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Truck size={14} /> {t('Active Logistics', 'الخدمات اللوجستية النشطة')}
            </span>
          </div>
        </div>
        <div style={{ textAlign: locale === 'ar-SA' ? 'left' : 'right' }}>
          <div className="fuel-kpi-label">{t('Efficiency Status', 'حالة الكفاءة')}</div>
          <div className="anomaly-tag anomaly-high" style={{ fontSize: '0.9rem', padding: '6px 16px' }}>
            <Gauge size={16} /> {vehicle.status} {t('PERFORMANCE', 'الأداء')}
          </div>
        </div>
      </header>

      {/* KPI Stats */}
      <div className="fuel-kpi-grid">
        <KPICard 
          label={t('Monthly Operating cost', 'تكلفة التشغيل الشهرية')} 
          value={convertCurrency(vehicle.cost, currency).toLocaleString(locale)} 
          unit={currency} 
          icon={DollarSign}
        />
        <KPICard 
          label={t('Estimated consumption', 'الاستهلاك المقدر')} 
          value={vehicle.litres.toLocaleString(locale)} 
          unit="LTR" 
          icon={Fuel}
        />
        <KPICard 
          label={t('Monthly Utilization', 'الاستخدام الشهري')} 
          value={vehicle.km.toLocaleString(locale)} 
          unit="KM" 
          icon={Activity}
        />
        <KPICard 
          label={t('Intelligence Index', 'مؤشر الذكاء')} 
          value="94" 
          unit="/ 100" 
          icon={ShieldCheck}
          color="#10B981"
        />
      </div>

      <div className="fuel-charts-grid">
        {/* Cost vs Utilization */}
        <div className="fuel-panel">
          <SectionTitle title={t('Operating Cost vs. Utilization', 'تكلفة التشغيل مقابل الاستخدام')} icon={TrendingUp} />
          <div style={{ height: '300px', marginTop: '20px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyTrend}>
                <defs>
                  <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--fuel-amber)" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="var(--fuel-amber)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{fill: '#8888AA', fontSize: 12}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#8888AA', fontSize: 12}} />
                <Tooltip 
                  contentStyle={{ background: 'var(--fuel-surface)', border: '1px solid var(--fuel-amber)', borderRadius: '8px', textAlign: locale === 'ar-SA' ? 'right' : 'left' }}
                />
                <Area type="monotone" dataKey="cost" stroke="var(--fuel-amber)" strokeWidth={3} fillOpacity={1} fill="url(#colorCost)" />
                <Area type="monotone" dataKey="km" stroke="#3B82F6" strokeWidth={3} fill="transparent" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Intelligence Details */}
        <div className="fuel-panel">
          <SectionTitle title={t('Intelligence Indicators', 'مؤشرات الذكاء')} icon={Activity} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '20px' }}>
            <DetailItem label={t('Efficiency Ratio', 'نسبة الكفاءة')} value={`${vehicle.efficiency} L/KM`} />
            <DetailItem label={t('Maintenance Status', 'حالة الصيانة')} value={t('Healthy', 'سليمة')} color="#10B981" />
            <DetailItem label={t('Cost Variance', 'تباين التكلفة')} value={t('-4.2% Monthly', '-4.2% شهرياً')} color="#10B981" />
            <DetailItem label={t('Risk Profile', 'ملف المخاطر')} value={t('Minimal', 'أدنى حد')} />
            <div style={{ marginTop: '12px', padding: '16px', background: 'rgba(212,175,55,0.05)', border: '1px solid var(--fuel-border)', borderRadius: '12px', fontSize: '0.8rem', lineHeight: 1.6, color: 'var(--fuel-text-muted)' }}>
              <strong style={{ color: 'var(--fuel-amber)' }}>{t('AI INSIGHT:', 'رؤية الذكاء الاصطناعي:')}</strong> {t('This vehicle is currently operating at peak efficiency. Fuel consumption matches historical utilization patterns within 5% tolerance.', 'هذه المركبة تعمل حالياً بأقصى كفاءة. استهلاك الوقود يطابق أنماط الاستخدام التاريخية ضمن تفاوت 5%.')}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ title, icon: Icon }) {
  return (
    <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem' }}>
      <Icon size={18} color="var(--fuel-amber)" /> {title}
    </h3>
  );
}

function KPICard({ label, value, unit, icon: Icon, color }) {
  const { locale } = useLanguage();
  return (
    <div className="fuel-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div className="fuel-kpi-label">{label}</div>
        <Icon size={16} color="var(--fuel-text-muted)" />
      </div>
      <div className="fuel-kpi-value" style={color ? { color } : {}}>
        {value} <span style={{ fontSize: '0.8rem', color: 'var(--fuel-text-muted)' }}>{unit}</span>
      </div>
    </div>
  );
}

function DetailItem({ label, value, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <span style={{ fontSize: '0.85rem', color: 'var(--fuel-text-muted)' }}>{label}</span>
      <span style={{ fontSize: '0.85rem', fontWeight: 700, color: color || 'white' }}>{value}</span>
    </div>
  );
}
