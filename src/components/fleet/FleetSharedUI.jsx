import React from 'react';
import { motion } from 'framer-motion';

export const KPICard = ({ label, value, unit, icon: Icon, trend, color }) => (
  <motion.div
    className="fleet-kpi-card"
    whileHover={{ y: -4 }}
  >
    <div className="fleet-kpi-label">{label}</div>
    <div className="fleet-kpi-value">
      {value}
      {unit && <span className="unit">{unit}</span>}
    </div>
    {trend && (
      <div className="fleet-kpi-trend" style={{ color: trend.startsWith('+') ? 'var(--status-safe)' : 'var(--status-risk)' }}>
        {trend} vs last month
      </div>
    )}
    {Icon && (
      <div style={{ position: 'absolute', right: '20px', bottom: '20px', opacity: 0.12, color: color || 'var(--theme-accent)' }}>
        <Icon size={48} />
      </div>
    )}
  </motion.div>
);

export const StatusBadge = ({ status }) => {
  const getCls = () => {
    switch (status.toLowerCase()) {
      case 'active': return 'badge-active';
      case 'in maintenance': return 'badge-maintenance';
      case 'out of service': return 'badge-out';
      default: return '';
    }
  };
  return <span className={`fleet-badge ${getCls()}`}>{status}</span>;
};

export const SectionTitle = ({ title, icon: Icon }) => (
  <h2 className="fleet-chart-title">
    {Icon && <Icon size={20} className="text-gold" />}
    {title}
  </h2>
);

export const FleetTable = ({ headers, data, renderRow }) => (
  <div className="fleet-table-container">
    <table className="fleet-table">
      <thead>
        <tr>
          {headers.map((h, i) => <th key={i}>{h}</th>)}
        </tr>
      </thead>
      <tbody>
        {data.map((item, i) => renderRow(item, i))}
      </tbody>
    </table>
  </div>
);
