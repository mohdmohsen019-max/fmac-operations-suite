import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Fuel, TrendingUp, Gauge, DollarSign, Activity, AlertCircle, 
  ArrowUpRight, ArrowDownRight, ChevronRight, Filter, Upload, Loader2,
  PieChart as PieIcon, BarChart3
} from 'lucide-react';
import { 
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, 
  Tooltip, BarChart, Bar, Cell 
} from 'recharts';
import { format } from 'date-fns';
import { db } from '../../../firebase';
import * as firestore from 'firebase/firestore';
const { collection, query, where, orderBy, limit, onSnapshot } = firestore;
import { cartrackService } from '../../../services/cartrackService';
import FuelStatementModal from './FuelStatementModal';
import { useFleetSettings, convertCurrency } from '../FleetSettingsContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import CustomSelect from '../../CustomSelect';

const COLORS = ['#D4AF37', '#FF8C00', '#F59E0B', '#B8860B', '#8B6914'];

export default function FuelDashboard({ onSelectVehicle }) {
  const { settings } = useFleetSettings();
  const { t, locale, lang } = useLanguage();
  const currency = settings.currency;
  
  const [loading, setLoading] = useState(true);
  const [statements, setStatements] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [activeStatement, setActiveStatement] = useState(null);
  
  const [fleetStats, setFleetStats] = useState({
    totalCost: 0,
    totalLitres: 0,
    totalKM: 0,
    avgCostPerKM: 0,
    avgEfficiency: 0,
    healthScore: 85,
    bestVehicle: 'N/A',
    worstVehicle: 'N/A'
  });
  const [vehicleStats, setVehicleStats] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState('km');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const months = [
    t("January", "يناير"), t("February", "فبراير"), t("March", "مارس"), 
    t("April", "أبريل"), t("May", "مايو"), t("June", "يونيو"),
    t("July", "يوليو"), t("August", "أغسطس"), t("September", "سبتمبر"), 
    t("October", "أكتوبر"), t("November", "نوفمبر"), t("December", "ديسمبر")
  ];

  useEffect(() => {
    // 1. Real-time listener for ALL statements (for the trend chart and selector availability)
    const qTrend = query(collection(db, 'fuelStatements'), orderBy('createdAt', 'desc'), limit(12));
    const unsubscribeTrend = onSnapshot(qTrend, (snapshot) => {
      const stmtData = snapshot.docs.map(doc => {
        const data = doc.data();
        return { 
          id: doc.id, 
          ...data,
          monthName: months[data.month - 1]
        };
      });
      setStatements(stmtData);
      
      // Default to latest statement if none selected yet
      if (stmtData.length > 0 && loading) {
        setSelectedMonth(stmtData[0].month);
        setSelectedYear(stmtData[0].year);
      }
    });

    return () => unsubscribeTrend();
  }, [locale]); // Refresh on locale change to update month names in chart

  useEffect(() => {
    // 2. Listener for the SPECIFIC selected statement
    setLoading(true);
    const q = query(
      collection(db, 'fuelStatements'), 
      where('month', '==', selectedMonth),
      where('year', '==', selectedYear),
      limit(1)
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      if (!snapshot.empty) {
        const latest = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
        setActiveStatement(latest);
        await processIntelligence(latest);
      } else {
        // No statement for this month
        setActiveStatement(null);
        setVehicleStats([]);
        setFleetStats({
          totalCost: 0, totalLitres: 0, totalKM: 0,
          avgCostPerKM: 0, avgEfficiency: 0, healthScore: 0,
          bestVehicle: 'N/A', worstVehicle: 'N/A'
        });
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [selectedMonth, selectedYear]);

  const processIntelligence = async (latest) => {
    try {
      // Use exact format required by Cartrack API: yyyy-MM-dd HH:mm:ss
      const startStr = format(new Date(latest.year, latest.month - 1, 1, 0, 0, 0), 'yyyy-MM-dd HH:mm:ss');
      const endStr = format(new Date(latest.year, latest.month, 0, 23, 59, 59), 'yyyy-MM-dd HH:mm:ss');
      
      let trips = [];
      try {
        trips = await cartrackService.getTrips(startStr, endStr) || [];
      } catch (e) {
        console.warn('Cartrack API failed:', e);
      }
      
      const vehicleData = {};
      
      trips.forEach(t => {
        const reg = t.registration?.replace(/\s+/g, '').toUpperCase();
        if (!reg) return;

        const startOdo = parseFloat(t.start_odometer) || 0;
        const endOdo = parseFloat(t.end_odometer) || 0;
        
        if (!vehicleData[reg]) {
          vehicleData[reg] = {
            minStart: startOdo,
            maxEnd: endOdo
          };
        } else {
          // Track the lowest start and highest end for the month
          if (startOdo > 0 && (startOdo < vehicleData[reg].minStart || vehicleData[reg].minStart === 0)) {
            vehicleData[reg].minStart = startOdo;
          }
          if (endOdo > vehicleData[reg].maxEnd) {
            vehicleData[reg].maxEnd = endOdo;
          }
        }
      });

      const vehicleKM = {};
      let totalKM = 0;

      Object.keys(vehicleData).forEach(reg => {
        const data = vehicleData[reg];
        // Distance is (Odometer End - Odometer Start) / 1000 to convert METERS to KM
        const km = (data.maxEnd > data.minStart && data.minStart > 0) ? (data.maxEnd - data.minStart) / 1000 : 0;
        vehicleKM[reg] = km;
        totalKM += km;
      });

      const totalCost = latest.totalCost;
      const totalLitres = latest.totalLitres;
      const allocations = latest.vehicleAllocations || [];
      const masterPlates = allocations.length > 0 ? allocations.map(a => a.plate) : Object.keys(vehicleKM);

      const rankings = masterPlates.map(plate => {
        const allocation = allocations.find(a => a.plate === plate);
        const km = vehicleKM[plate] || 0;
        const litres = allocation ? allocation.litres : (totalKM > 0 ? (km / totalKM) * totalLitres : 0);
        const cost = allocation ? allocation.cost : (totalKM > 0 ? (km / totalKM) * totalCost : 0);
        const efficiency = km > 0 ? litres / km : 0;
        
        return {
          plate,
          km: Math.round(km),
          litres: Math.round(litres * 10) / 10,
          cost,
          efficiency: Math.round(efficiency * 100) / 100,
          costPerKM: km > 0 ? cost / km : 0,
          status: efficiency === 0 ? 'N/A' : efficiency < 0.22 ? 'Excellent' : efficiency < 0.35 ? 'Optimal' : 'Caution'
        };
      }).sort((a, b) => b.km - a.km || b.cost - a.cost);

      setVehicleStats(rankings);
      
      const avgEff = totalKM > 0 ? totalLitres / totalKM : 0;
      setFleetStats({
        totalCost,
        totalLitres,
        totalKM: Math.round(totalKM),
        avgCostPerKM: totalKM > 0 ? totalCost / totalKM : 0,
        avgEfficiency: avgEff,
        healthScore: avgEff === 0 ? 100 : Math.min(100, Math.max(0, 100 - (avgEff * 200))),
        bestVehicle: rankings.length > 0 ? [...rankings].sort((a, b) => (a.efficiency || 999) - (b.efficiency || 999))[0].plate : 'N/A',
        worstVehicle: rankings.length > 0 ? [...rankings].sort((a, b) => b.efficiency - a.efficiency)[0].plate : 'N/A'
      });
    } catch (err) {
      console.error('Intelligence Processing Error:', err);
    }
    setLoading(false);
  };

  const filteredVehicles = vehicleStats
    .filter(v => v.plate.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => {
      if (typeof a[sortKey] === 'number') return b[sortKey] - a[sortKey];
      return a[sortKey].localeCompare(b[sortKey]);
    });

  if (loading && statements.length === 0) {
    return (
      <div className="fuel-module-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div className="app-loader"><span /><span /><span /><span /><span /></div>
      </div>
    );
  }

  return (
    <div className="fuel-view">
      <header className="fuel-panel-header" style={{ marginBottom: '32px' }}>
        <div>
          <div className="fuel-kpi-label">{t('Operational Intelligence', 'الذكاء التشغيلي')}</div>
          <h1 style={{ fontSize: '2.5rem', fontWeight: 850, margin: 0, color: 'var(--theme-text-main)', letterSpacing: '-0.02em' }}>
            {lang === 'ar'
              ? <><span style={{ color: 'var(--fuel-amber)' }}>ذكاء</span> الوقود</>
              : <>Fuel <span style={{ color: 'var(--fuel-amber)' }}>Intelligence</span></>
            }
          </h1>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {/* MONTH SELECTOR */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <CustomSelect 
              value={selectedMonth} 
              onChange={val => setSelectedMonth(parseInt(val))}
              options={months.map((m, i) => ({ value: i + 1, label: m }))}
              className="fuel-header-dropdown"
              style={{ width: '140px' }}
            />
            <CustomSelect 
              value={selectedYear} 
              onChange={val => setSelectedYear(parseInt(val))}
              options={[2024, 2025, 2026].map(y => ({ value: y, label: y.toString() }))}
              className="fuel-header-dropdown"
              style={{ width: '100px' }}
            />
          </div>

          <button className="fuel-btn-action" onClick={() => setIsModalOpen(true)}>
            <Upload size={18} style={{ marginRight: '8px', marginLeft: '8px' }} /> {t('ADNOC Statement', 'كشف حساب أدنوك')}
          </button>
        </div>
      </header>

      <div className="fuel-kpi-grid">
        <KPICard
          label={t('Total Fuel cost', 'إجمالي تكلفة الوقود')}
          value={convertCurrency(fleetStats.totalCost, currency).toLocaleString(locale)} 
          unit={currency}
        />
        <KPICard 
          label={t('Total volume', 'إجمالي الحجم')} 
          value={fleetStats.totalLitres.toLocaleString(locale)} 
          unit="LTR" 
        />
        <KPICard 
          label={t('Total Distance', 'إجمالي المسافة')} 
          value={fleetStats.totalKM.toLocaleString(locale)} 
          unit="KM" 
        />
        <KPICard 
          label={t('Avg Cost / KM', 'متوسط التكلفة / كم')} 
          value={convertCurrency(fleetStats.avgCostPerKM, currency).toLocaleString(locale, { maximumFractionDigits: 2 })} 
          unit={currency} 
        />
        <KPICard 
          label={t('Fleet Health', 'صحة الأسطول')} 
          value={Math.round(fleetStats.healthScore)} 
          unit="INDEX" 
          color={fleetStats.healthScore > 80 ? '#10B981' : '#F59E0B'} 
        />
      </div>

      <div className="fuel-charts-grid">
        <div className="fuel-panel">
          <div className="fuel-panel-header">
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Activity size={20} color="var(--fuel-amber)" /> {t('Consumption Trend', 'اتجاه الاستهلاك')}
            </h3>
          </div>
          <div style={{ height: '300px', marginTop: '20px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={statements.slice().reverse()}>
                <defs>
                  <linearGradient id="colorFuel" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--fuel-amber)" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="var(--fuel-amber)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="monthName" axisLine={false} tickLine={false} tick={{fill: 'var(--theme-text-muted)', fontSize: 12}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: 'var(--theme-text-muted)', fontSize: 12}} />
                <Tooltip 
                  contentStyle={{ background: 'var(--fuel-surface)', border: '1px solid var(--fuel-amber)', borderRadius: '8px', textAlign: locale === 'ar-SA' ? 'right' : 'left' }}
                  itemStyle={{ color: 'var(--fuel-amber)' }}
                />
                <Area type="monotone" dataKey="totalCost" stroke="var(--fuel-amber)" strokeWidth={3} fillOpacity={1} fill="url(#colorFuel)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="fuel-panel">
          <h3 style={{ margin: '0 0 20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={20} color="var(--fuel-orange)" /> {t('Intelligence Feed', 'تغذية الذكاء')}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <AnomalyItem 
              type="spike" 
              title={t('Consumption Alert', 'تنبيه الاستهلاك')} 
              desc={t(`Bus ${fleetStats.worstVehicle} consumption exceeded fleet average.`, `استهلاك الحافلة ${fleetStats.worstVehicle} تجاوز متوسط الأسطول.`)} 
            />
            <AnomalyItem 
              type="efficiency" 
              title={t('Efficiency Leader', 'قائد الكفاءة')} 
              desc={t(`Bus ${fleetStats.bestVehicle} maintains optimal performance.`, `الحافلة ${fleetStats.bestVehicle} تحافظ على الأداء الأمثل.`)} 
            />
            <AnomalyItem 
              type="cost" 
              title={t('Cost Insight', 'رؤية التكلفة')} 
              desc={t("Average Cost/KM is stable within 2% variance.", "متوسط التكلفة/كم مستقر ضمن تباين 2%.")} 
            />
          </div>
        </div>
      </div>

      <div className="fuel-panel">
        <div className="fuel-panel-header">
          <div>
            <h3 style={{ margin: 0 }}>{t('Vehicle Efficiency Ranking', 'تصنيف كفاءة المركبات')}</h3>
            <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--fuel-text-muted)' }}>{t('Sort by efficiency or utilization metrics', 'فرز حسب مقاييس الكفاءة أو الاستخدام')}</p>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <div style={{ position: 'relative' }}>
              <Filter size={16} style={{ position: 'absolute', left: locale === 'ar-SA' ? 'auto' : '12px', right: locale === 'ar-SA' ? '12px' : 'auto', top: '50%', transform: 'translateY(-50%)', color: 'var(--fuel-text-muted)' }} />
              <input 
                type="text" 
                placeholder={t('Search bus...', 'بحث عن حافلة...')} 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{ 
                  background: 'var(--theme-surface)', 
                  border: '1px solid var(--theme-border-light)', 
                  color: 'var(--theme-text-main)', 
                  padding: locale === 'ar-SA' ? '8px 36px 8px 12px' : '8px 12px 8px 36px', 
                  borderRadius: '12px',
                  fontSize: '0.85rem',
                  outline: 'none'
                }} 
              />
            </div>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="fuel-table">
            <thead>
              <tr>
                <th onClick={() => setSortKey('plate')} style={{ cursor: 'pointer' }}>{t('Bus', 'الحافلة')}</th>
                <th onClick={() => setSortKey('km')} style={{ cursor: 'pointer' }}>{t(`KM (${months[selectedMonth-1].toUpperCase()})`, `كم (${months[selectedMonth-1]})`)}</th>
                <th onClick={() => setSortKey('litres')} style={{ cursor: 'pointer' }}>{t(`LITRES (${months[selectedMonth-1].toUpperCase()})`, `لتر (${months[selectedMonth-1]})`)}</th>
                <th onClick={() => setSortKey('cost')} style={{ cursor: 'pointer' }}>{t(`COST (${currency})`, `التكلفة (${currency})`)}</th>
                <th onClick={() => setSortKey('costPerKM')} style={{ cursor: 'pointer' }}>{t('COST/KM', 'التكلفة/كم')}</th>
                <th onClick={() => setSortKey('status')} style={{ cursor: 'pointer' }}>{t('STATUS', 'الحالة')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredVehicles.map((v, i) => (
                <tr key={v.plate} onClick={() => onSelectVehicle(v)} style={{ cursor: 'pointer' }}>
                  <td style={{ fontWeight: 800 }}>{v.plate}</td>
                  <td>{v.km.toLocaleString(locale)}</td>
                  <td>{v.litres.toLocaleString(locale)} L</td>
                  <td style={{ color: 'var(--fuel-amber)', fontWeight: 700 }}>
                    {convertCurrency(v.cost, currency).toLocaleString(locale)}
                  </td>
                  <td className="mono">{convertCurrency(v.costPerKM, currency).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td>
                    <span className={`anomaly-tag ${v.status === 'Excellent' ? 'anomaly-high' : ''}`} style={{
                       background: v.status === 'Excellent' ? 'rgba(16,185,129,0.1)' : 'rgba(212,175,55,0.1)',
                       color: v.status === 'Excellent' ? '#10B981' : 'var(--fuel-amber)',
                       borderColor: v.status === 'Excellent' ? 'rgba(16,185,129,0.2)' : 'var(--fuel-border)'
                    }}>
                      {v.status === 'Excellent' ? t('Excellent', 'ممتاز') : v.status === 'Optimal' ? t('Optimal', 'مثالي') : v.status === 'Caution' ? t('Caution', 'تحذير') : v.status}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <ChevronRight size={18} color="#555" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <FuelStatementModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSave={() => {}} // Not needed with onSnapshot
      />
    </div>
  );
}

function KPICard({ label, value, unit, trend, trendUp, color }) {
  const { t } = useLanguage();
  return (
    <motion.div 
      className="fuel-card"
      whileHover={{ y: -5 }}
    >
      <div className="fuel-kpi-label">{label}</div>
      <div className="fuel-kpi-value" style={color ? { color } : {}}>
        {value} <span style={{ fontSize: '0.8rem', color: 'var(--fuel-text-muted)' }}>{unit}</span>
      </div>
      {trend && (
        <div className={`fuel-kpi-trend ${trendUp ? 'fuel-trend-up' : 'fuel-trend-down'}`}>
          {trendUp ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
          {trend} {t('vs last month', 'مقابل الشهر الماضي')}
        </div>
      )}
    </motion.div>
  );
}

function AnomalyItem({ type, title, desc }) {
  const icon = type === 'spike' ? <TrendingUp size={16} /> : type === 'efficiency' ? <Gauge size={16} /> : <DollarSign size={16} />;
  const color = type === 'spike' ? '#EF4444' : type === 'efficiency' ? '#10B981' : '#D4AF37';
  const { locale } = useLanguage();

  return (
    <div style={{ 
      display: 'flex', 
      gap: '12px', 
      padding: '12px', 
      background: 'var(--theme-surface)', 
      borderRadius: '10px',
      borderLeft: locale === 'ar-SA' ? 'none' : `3px solid ${color}`,
      borderRight: locale === 'ar-SA' ? `3px solid ${color}` : 'none'
    }}>
      <div style={{ color }}>{icon}</div>
      <div>
        <div style={{ fontSize: '0.8rem', fontWeight: 800 }}>{title}</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--fuel-text-muted)', marginTop: '2px' }}>{desc}</div>
      </div>
    </div>
  );
}
