import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Wrench, Receipt, Calendar, CreditCard, ChevronRight, Search, FileText, Loader2, Plus } from 'lucide-react';
import { db } from '../../firebase';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { useLanguage } from '../../contexts/LanguageContext';
import './FleetModule.css';

export default function FleetMaintenance({ canEdit, isMasterAdmin, userProfile }) {
  const { t, locale } = useLanguage();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalSpent: 0,
    monthSpent: 0,
    vatPaid: 0,
    pendingTasks: 4
  });

  useEffect(() => {
    fetchMaintenanceData();
  }, []);

  const fetchMaintenanceData = async () => {
    setLoading(true);
    try {
      // Reverting to Firestore as per user request (Cartrack API does not store internal FMAC receipts)
      const q = query(collection(db, 'maintenance'), orderBy('date', 'desc'), limit(50));
      const snap = await getDocs(q);
      
      const data = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      if (data.length > 0) {
        setRecords(data);
        const total = data.reduce((sum, r) => sum + (parseFloat(r.total) || 0), 0);
        const vat = data.reduce((sum, r) => sum + (parseFloat(r.vat) || 0), 0);
        
        // Calculate May 2026 spend
        const maySpend = data
          .filter(r => r.date?.startsWith('2026-05'))
          .reduce((sum, r) => sum + (parseFloat(r.total) || 0), 0);

        setStats(prev => ({
          ...prev,
          totalSpent: total,
          vatPaid: vat,
          monthSpent: maySpend
        }));
      }
    } catch (err) {
      console.error('Maintenance Firestore fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="view-loading">
        <div className="app-loader"><span /><span /><span /><span /><span /></div>
      </div>
    );
  }

  return (
    <div className="maintenance-view">
      <div className="stats-bento">
        <div className="stat-card glass-panel">
          <div className="stat-header"><h3>{t('Lifetime Expenditure', 'إجمالي النفقات')}</h3><CreditCard size={16} /></div>
          <div className="stat-value">{stats.totalSpent.toLocaleString(locale)}<span style={{fontSize: '0.9rem', marginLeft: locale === 'ar-SA' ? '0' : '4px', marginRight: locale === 'ar-SA' ? '4px' : '0'}}>{t('AED', 'د.إ')}</span></div>
          <p className="stat-label">{t('All-time maintenance cost (Firestore)', 'تكلفة الصيانة الإجمالية (فايرستور)')}</p>
        </div>
        <div className="stat-card glass-panel">
          <div className="stat-header"><h3>{t('Monthly Forecast', 'التوقعات الشهرية')}</h3><Calendar size={16} className="text-accent" /></div>
          <div className="stat-value text-accent">{stats.monthSpent.toLocaleString(locale)}<span style={{fontSize: '0.9rem', marginLeft: locale === 'ar-SA' ? '0' : '4px', marginRight: locale === 'ar-SA' ? '4px' : '0'}}>{t('AED', 'د.إ')}</span></div>
          <p className="stat-label">{t('Spending in May 2026', 'الإنفاق في مايو 2026')}</p>
        </div>
        <div className="stat-card glass-panel">
          <div className="stat-header"><h3>{t('Taxation', 'الضرائب')}</h3><Receipt size={16} className="text-muted" /></div>
          <div className="stat-value" style={{color: '#9ca3af'}}>{stats.vatPaid.toLocaleString(locale)}<span style={{fontSize: '0.9rem', marginLeft: locale === 'ar-SA' ? '0' : '4px', marginRight: locale === 'ar-SA' ? '4px' : '0'}}>{t('AED', 'د.إ')}</span></div>
          <p className="stat-label">{t('Total VAT accumulated', 'إجمالي ضريبة القيمة المضافة')} </p>
        </div>
        <div className="stat-card glass-panel">
          <div className="stat-header"><h3>{t('Pending Services', 'الخدمات المعلقة')}</h3><Wrench size={16} className="text-caution" /></div>
          <div className="stat-value text-caution">{stats.pendingTasks.toLocaleString(locale)}</div>
          <p className="stat-label">{t('Upcoming inspections', 'الفحوصات القادمة')}</p>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: '0', overflow: 'hidden' }}>
        <div style={{ padding: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="section-header" style={{ marginBottom: '0' }}>
            <h2>{t('Recent Service Logs', 'سجلات الخدمة الأخيرة')}</h2>
            <p>{t('Validated maintenance records from Firestore', 'سجلات صيانة معتمدة من فايرستور')}</p>
          </div>
          {canEdit && (
            <div style={{ display: 'flex', gap: '12px' }}>
              <button className="btn-refresh" style={{ display: 'flex', gap: '8px', alignItems: 'center', background: 'var(--theme-accent)', color: '#fff', border: 'none' }}>
                <Plus size={14} /> {t('Log Entry', 'إضافة سجل')}
              </button>
            </div>
          )}
        </div>

        <div className="fleet-table-container" style={{ borderRadius: '0', border: 'none' }}>
          <table className="fleet-table">
            <thead>
              <tr>
                <th>{t('Date', 'التاريخ')}</th>
                <th>{t('Vehicle', 'المركبة')}</th>
                <th>{t('Description of Service', 'وصف الخدمة')}</th>
                <th>{t('Subtotal', 'المجموع الفرعي')}</th>
                <th>{t('VAT', 'ضريبة القيمة المضافة')}</th>
                <th>{t('Total AED', 'الإجمالي د.إ')}</th>
                <th>{t('Reference', 'المرجع')}</th>
              </tr>
            </thead>
            <tbody>
              {records.length > 0 ? records.map((r, i) => (
                <tr key={r.id || i}>
                  <td style={{ color: '#9ca3af' }}>{r.date}</td>
                  <td style={{ fontWeight: 800, color: 'var(--theme-text-main)' }}>{r.plateNumber || r.registration}</td>
                  <td style={{ maxWidth: '400px', fontSize: '0.85rem', lineHeight: '1.4' }}>
                    {r.description}
                    <div style={{ fontSize: '0.7rem', color: '#6b7280', marginTop: '4px' }}>{t('Supplier:', 'المورد:')} {r.supplier}</div>
                  </td>
                  <td>{parseFloat(r.amount || 0).toLocaleString(locale)}</td>
                  <td className="text-muted">{parseFloat(r.vat || 0).toLocaleString(locale)}</td>
                  <td style={{ fontWeight: 700, color: 'var(--theme-accent)' }}>{parseFloat(r.total || 0).toLocaleString(locale)}</td>
                  <td className="text-muted" style={{ fontFamily: 'monospace' }}>#{r.invoiceNumber || r.invoice_no}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
                    {t('No maintenance records found in Firestore.', 'لم يتم العثور على سجلات صيانة في فايرستور.')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
