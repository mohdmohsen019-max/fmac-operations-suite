import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { db } from '../firebase';
import { useLanguage } from '../contexts/LanguageContext';
import { collection, query, writeBatch, doc, getDocs, where } from 'firebase/firestore';
import { exportToExcel, exportToCSV } from '../utils/exportEngine';
import ConfirmModal from './ConfirmModal';
import { resetTransportationOnly } from '../utils/systemUtils';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

import './AttendanceTable.css';
import './TransportationModule.css';
import CustomSelect from './CustomSelect';
import CustomDateInput from './CustomDateInput';

export default function TransportationModule() {
  const { t } = useLanguage();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [markingExported, setMarkingExported] = useState(false);
  
  const pdfRef = useRef(null);

  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  
  // Filters
  const [filterSport, setFilterSport] = useState('All');
  const [filterTiming, setFilterTiming] = useState('All');
  const [filterTransport, setFilterTransport] = useState('All');

  useEffect(() => {
    const fetchTransportData = async () => {
      setLoading(true);
      try {
        const qSessions = query(
          collection(db, "sessions"),
          where("date", ">=", startDate),
          where("date", "<=", endDate)
        );
        const sSnapshot = await getDocs(qSessions);
        
        const sessionsWithAtt = await Promise.all(sSnapshot.docs.map(async (sDoc) => {
          const sData = sDoc.data();
          const attSnap = await getDocs(collection(db, "sessions", sDoc.id, "attendance"));
          const attendance = attSnap.docs.map(ad => ad.data());
          return {
            id: sDoc.id,
            ...sData,
            attendance
          };
        }));
        
        setSessions(sessionsWithAtt);
      } catch (err) {
        console.error("Error fetching transport sessions:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchTransportData();
  }, [startDate, endDate]);

  const transportData = useMemo(() => {
    const instances = [];
    const distMap = {};
    const loadMap = {};
    const trendMap = {};
    const peakMap = {};

    sessions.forEach(session => {
      session.attendance.forEach(record => {
        if (record.status !== 'present') return;
        
        const transport = record.transportation || 'N/A';
        const sport = record.sport || 'N/A';
        const timing = session.classTiming;

        // Apply UI Filters
        const matchesSport = filterSport === 'All' || sport === filterSport;
        const matchesTiming = filterTiming === 'All' || timing === filterTiming;
        const matchesTransport = filterTransport === 'All' || transport === filterTransport;

        if (matchesSport && matchesTiming && matchesTransport) {
          instances.push({
            id: record.playerId,
            name: record.playerName,
            sport,
            timing,
            date: session.date,
            transport,
            sessionId: session.id
          });

          // Metrics (only for actual transport users)
          if (transport !== 'Own Transportation' && transport !== 'N/A') {
            distMap[transport] = (distMap[transport] || 0) + 1;
            loadMap[timing] = (loadMap[timing] || 0) + 1;
            trendMap[session.date] = (trendMap[session.date] || 0) + 1;
            
            const peakKey = `${session.date} @ ${timing}`;
            peakMap[peakKey] = (peakMap[peakKey] || 0) + 1;
          }
        }
      });
    });

    const peakEntry = Object.entries(peakMap).sort((a,b) => b[1] - a[1])[0];
    const peakLoad = peakEntry ? { label: peakEntry[0], count: peakEntry[1] } : null;

    return {
      instances,
      dist: distMap,
      load: loadMap,
      trend: trendMap,
      peak: peakLoad
    };
  }, [sessions, filterSport, filterTiming, filterTransport]);

  const sports = useMemo(() => Array.from(new Set(sessions.flatMap(s => s.attendance.map(a => a.sport)))).filter(Boolean).sort(), [sessions]);
  const timings = useMemo(() => Array.from(new Set(sessions.map(s => s.classTiming))).filter(Boolean).sort(), [sessions]);
  const transportMethods = useMemo(() => Array.from(new Set(sessions.flatMap(s => s.attendance.map(a => a.transportation)))).filter(m => m && m !== 'None').sort(), [sessions]);

  const stats = useMemo(() => {
    const totalPresent = transportData.instances.length;
    const transportUsers = transportData.instances.filter(i => i.transport !== 'Own Transportation' && i.transport !== 'N/A').length;
    const utilization = totalPresent > 0 ? Math.round((transportUsers / totalPresent) * 100) : 0;
    const methodSummary = Object.entries(transportData.dist).sort((a,b) => b[1] - a[1]).map(([method, count]) => ({ method, count }));
    return { totalPresent, transportUsers, utilization, methodSummary, peak: transportData.peak };
  }, [transportData]);

  const handleExport = (type) => {
    const exportFormat = transportData.instances.map(inst => ({
      "Player ID": inst.id,
      "Player Name": inst.name,
      "Sport": inst.sport,
      "Class Timing": inst.timing,
      "Date": inst.date,
      "Transportation Method": inst.transport
    }));
    const filename = `FMAC_Transport_Log_${startDate}_to_${endDate}`;
    if (type === 'excel') exportToExcel(exportFormat, filename);
    if (type === 'csv') exportToCSV(exportFormat, filename);
  };

  if (loading) {
     return <div className="loading-state">{t('Analyzing Transport Sessions...', 'جارٍ تحليل جلسات النقل...')}</div>;
  }

  return (
    <div className="tm-container">
      <div className="tm-header-row animate-fade-in">
        <div>
          <h2 className="view-title" style={{ fontSize: '1.5rem' }}>{t('Logistics Intelligence', 'ذكاء النقل')}</h2>
          <p className="tm-subtitle">{t('Demand analytics for unit deployment', 'تحليلات الطلب لنشر الوحدات')}</p>
        </div>
        <div className="tm-export-bar">
          <button className="tm-btn" onClick={() => handleExport('csv')}>{t('Export CSV', 'تصدير CSV')}</button>
          <button className="tm-btn primary" onClick={() => handleExport('excel')}>{t('Export Excel', 'تصدير Excel')}</button>
        </div>
      </div>

      <div className="tm-controls-card glass-panel animate-fade-in" style={{ animationDelay: '0.1s' }}>
        <div className="tm-date-range">
          <CustomDateInput
            label={t('Cycle Start', 'بداية الدورة')}
            value={startDate}
            onChange={setStartDate}
            className="tm-date-picker"
          />
          <CustomDateInput
            label={t('Cycle End', 'نهاية الدورة')}
            value={endDate} 
            onChange={setEndDate} 
            className="tm-date-picker"
          />
        </div>
        <div className="tm-quick-filters">
          <div className="filter-item">
            <label className="tm-filter-label">{t('Window', 'التوقيت')}</label>
            <CustomSelect 
              value={filterTiming} 
              onChange={setFilterTiming}
              options={['All', ...timings]}
            />
          </div>
          <div className="filter-item">
            <label className="tm-filter-label">{t('Unit', 'الوحدة')}</label>
            <CustomSelect 
              value={filterSport} 
              onChange={setFilterSport}
              options={['All', ...sports]}
            />
          </div>
          <div className="filter-item">
            <label className="tm-filter-label">{t('Logistics', 'النقل')}</label>
            <CustomSelect 
              value={filterTransport} 
              onChange={setFilterTransport}
              options={['All', ...transportMethods]}
            />
          </div>
        </div>
      </div>

      <div className="tm-bento-grid">
        <div className="tm-metric-card animate-fade-in" style={{ animationDelay: '0.2s' }}>
          <span className="tm-metric-label">{t('Active Operatives', 'المشغّلون النشطون')}</span>
          <span className="tm-metric-value">{stats.totalPresent}</span>
        </div>
        <div className="tm-metric-card animate-fade-in" style={{ animationDelay: '0.3s' }}>
          <span className="tm-metric-label">{t('Fleet Utilization', 'استخدام الأسطول')}</span>
          <span className="tm-metric-value accent">{stats.transportUsers}</span>
        </div>
        <div className="tm-metric-card animate-fade-in" style={{ animationDelay: '0.4s' }}>
          <span className="tm-metric-label">{t('Efficiency Rate', 'معدل الكفاءة')}</span>
          <span className="tm-metric-value">{stats.utilization}%</span>
        </div>
        <div className="tm-metric-card animate-fade-in" style={{ animationDelay: '0.5s' }}>
          <span className="tm-metric-label">{t('Peak Deployment', 'الذروة')}</span>
          <div className="p-peak-info">
            <span className="p-peak-lbl">{stats.peak?.label || 'N/A'}</span>
            <span className="p-peak-val">{stats.peak?.count || 0} active units</span>
          </div>
        </div>
      </div>

      <div className="tm-analytics-shelf">
        <div className="tm-chart-card glass-panel animate-fade-in" style={{ animationDelay: '0.6s' }}>
          <h3 className="tm-chart-title">{t('Load Density by Window', 'كثافة الحمل حسب التوقيت')}</h3>
          <div className="tm-simple-bar-list">
             {Object.entries(transportData.load).sort((a,b) => b[1]-a[1]).map(([time, count], index) => (
               <div key={time} className="tm-bar-item">
                 <div className="bar-info">
                   <span className="bar-lbl">{time}</span>
                   <span className="bar-val">{count} {t('units', 'وحدة')}</span>
                 </div>
                 <div className="bar-track">
                   <motion.div 
                    className="bar-fill" 
                    initial={{ width: 0 }}
                    animate={{ width: `${(count/Math.max(...Object.values(transportData.load),1))*100}%` }}
                    transition={{ duration: 1, delay: 0.8 + (index * 0.1) }}
                   />
                 </div>
               </div>
             ))}
          </div>
        </div>
        
        <div className="tm-chart-card glass-panel animate-fade-in" style={{ animationDelay: '0.7s' }}>
          <h3 className="tm-chart-title">{t('Logistics Distribution', 'توزيع وسائل النقل')}</h3>
          <div className="tm-donut-container">
            <svg viewBox="0 0 100 100" className="tm-donut-chart">
              {stats.methodSummary.reduce((acc, m, idx) => {
                const total = stats.transportUsers || 1;
                const percentage = (m.count / total) * 100;
                const offset = acc.totalOffset;
                const dashArray = `${percentage} ${100 - percentage}`;
                const colors = ['#0ea5e9', '#22d3ee', '#38bdf8', '#0284c7', '#0369a1'];
                const color = colors[idx % colors.length];
                
                acc.elements.push(
                  <motion.circle 
                    key={m.method}
                    cx="50" cy="50" r="40"
                    fill="transparent"
                    stroke={color}
                    strokeWidth="12"
                    strokeDasharray={dashArray}
                    initial={{ strokeDashoffset: 100 }}
                    animate={{ strokeDashoffset: -offset }}
                    transition={{ duration: 1, delay: 1 }}
                    transform="rotate(-90 50 50)"
                    className="donut-segment"
                  />
                );
                acc.totalOffset += percentage;
                return acc;
              }, { elements: [], totalOffset: 0 }).elements}
              <circle cx="50" cy="50" r="32" fill="var(--theme-bg)" />
              <text x="50" y="52" textAnchor="middle" className="donut-center-text">
                {stats.transportUsers}
              </text>
              <text x="50" y="62" textAnchor="middle" className="donut-center-sub">
                {t('LOGS', 'سجل')}
              </text>
            </svg>
            <div className="tm-donut-legend">
              {stats.methodSummary.slice(0, 5).map((m, idx) => {
                const colors = ['#0ea5e9', '#22d3ee', '#38bdf8', '#0284c7', '#0369a1'];
                return (
                  <div key={m.method} className="legend-item">
                    <span className="legend-dot" style={{ background: colors[idx % colors.length] }}></span>
                    <span className="legend-lbl">{m.method}</span>
                    <span className="legend-val">{m.count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="tm-table-card glass-panel animate-fade-in desktop-only" style={{ animationDelay: '0.8s' }}>
        <table className="tm-agg-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>{t('Operative Name', 'اسم المشغّل')}</th>
              <th>{t('Unit', 'الوحدة')}</th>
              <th>{t('Window', 'التوقيت')}</th>
              <th>{t('Date', 'التاريخ')}</th>
              <th>{t('Logistics Status', 'حالة النقل')}</th>
            </tr>
          </thead>
          <tbody>
            {transportData.instances.map((inst, idx) => (
              <motion.tr 
                key={idx}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.9 + (idx * 0.01) }}
              >
                <td style={{ fontFamily: 'JetBrains Mono', color: 'var(--theme-text-muted)' }}>#{inst.id}</td>
                <td style={{ fontWeight: '600' }}>{inst.name}</td>
                <td>{inst.sport}</td>
                <td>{inst.timing}</td>
                <td>{inst.date}</td>
                <td><span className="tm-transport-pill active">{inst.transport}</span></td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
