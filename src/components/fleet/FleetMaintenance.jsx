import React, { useState, useEffect } from 'react';
import {
  Wrench, Receipt, Calendar, CreditCard, Plus, Cog, Droplets, Siren,
} from 'lucide-react';
import { db } from '../../firebase';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { useLanguage } from '../../contexts/LanguageContext';
import { useFleetScope } from './FleetScopeContext';
import MaintenanceUploadModal from './MaintenanceUploadModal';
import { useMaintenanceSuite, useMaintenanceFiles, recordKeyOf } from './maintenance/maintenanceSuite';
import MaintenanceAttachments from './maintenance/MaintenanceAttachments';
import PartsHealth from './maintenance/PartsHealth';
import OilTracking from './maintenance/OilTracking';
import './FleetModule.css';
import './maintenance/FleetMaintenanceSuite.css';

/* ── Aggregated alerts strip: overdue oil + critical parts first ──────── */
function AlertsStrip({ suite, displayName, onJump }) {
  const { t, locale } = useLanguage();
  const { alerts } = suite;
  if (!alerts.length) return null;

  const hasCritical = alerts.some((a) => a.severity === 'critical');
  return (
    <div className={`fms-alerts${hasCritical ? ' fms-alerts--critical' : ''}`}>
      <span className="fms-alerts-title">
        <Siren size={14} />
        {t('Maintenance alerts', 'تنبيهات الصيانة')} ({alerts.length.toLocaleString(locale)})
      </span>
      {alerts.map((a) => (
        <button
          key={a.id}
          type="button"
          className={`fms-alert-chip${a.severity === 'critical' ? ' fms-alert-chip--critical' : ''}`}
          onClick={() => onJump(a.type === 'oil' ? 'oil' : 'parts')}
          title={t('Open details', 'فتح التفاصيل')}
        >
          {a.type === 'oil' ? <Droplets size={12} /> : <Cog size={12} />}
          <span className="fms-alert-reg">{displayName(a.reg, locale)}</span>
          {a.type === 'oil'
            ? (a.severity === 'critical'
              ? t(`oil overdue by ${Math.abs(a.remaining).toLocaleString(locale)} km`, `تأخر تغيير الزيت ${Math.abs(a.remaining).toLocaleString(locale)} كم`)
              : t('oil change approaching', 'اقترب موعد تغيير الزيت'))
            : `${t(a.part.nameEn, a.part.nameAr)} ${Math.round(a.pct * 100)}%`}
        </button>
      ))}
    </div>
  );
}

export default function FleetMaintenance({ canEdit, isMasterAdmin }) {
  const { t, locale } = useLanguage();
  const { scope, inScope, displayName } = useFleetScope();
  const [section, setSection] = useState('records'); // records | parts | oil
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [stats, setStats] = useState({
    totalSpent: 0,
    monthSpent: 0,
    vatPaid: 0,
    pendingTasks: 4
  });

  /* Suite data: vehicles in scope (live odometer), part catalog + installs,
     oil tracking — shared by the alerts strip and the sub-sections. */
  const suite = useMaintenanceSuite(scope, inScope);
  const filesByRecord = useMaintenanceFiles();

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

  const SECTIONS = [
    { id: 'records', icon: Receipt, en: 'Records', ar: 'السجلات' },
    { id: 'parts', icon: Cog, en: 'Parts Health', ar: 'صحة القطع', badge: suite.summary.critical },
    { id: 'oil', icon: Droplets, en: 'Oil Change', ar: 'تغيير الزيت', badge: suite.summary.oilOverdue },
  ];

  return (
    <div className="maintenance-view" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <AlertsStrip suite={suite} displayName={displayName} onJump={setSection} />

      <div className="fms-pills" role="tablist">
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          return (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={section === s.id}
              className={`fms-pill${section === s.id ? ' active' : ''}`}
              onClick={() => setSection(s.id)}
            >
              <Icon size={14} />
              <span>{t(s.en, s.ar)}</span>
              {s.badge > 0 && <span className="fms-pill-badge">{s.badge.toLocaleString(locale)}</span>}
            </button>
          );
        })}
      </div>

      {section === 'parts' && (
        <PartsHealth suite={suite} canEdit={canEdit} displayName={displayName} />
      )}

      {section === 'oil' && (
        <OilTracking suite={suite} canEdit={canEdit} displayName={displayName} />
      )}

      {section === 'records' && (<>
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
          <div className="stat-value" style={{color: 'var(--theme-text-muted)'}}>{stats.vatPaid.toLocaleString(locale)}<span style={{fontSize: '0.9rem', marginLeft: locale === 'ar-SA' ? '0' : '4px', marginRight: locale === 'ar-SA' ? '4px' : '0'}}>{t('AED', 'د.إ')}</span></div>
          <p className="stat-label">{t('Total VAT accumulated', 'إجمالي ضريبة القيمة المضافة')} </p>
        </div>
        <div className="stat-card glass-panel">
          <div className="stat-header"><h3>{t('Pending Services', 'الخدمات المعلقة')}</h3><Wrench size={16} className="text-caution" /></div>
          <div className="stat-value text-caution">{stats.pendingTasks.toLocaleString(locale)}</div>
          <p className="stat-label">{t('Upcoming inspections', 'الفحوصات القادمة')}</p>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: '0', overflow: 'hidden' }}>
        <div style={{ padding: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--theme-border-light)' }}>
          <div className="section-header" style={{ marginBottom: '0' }}>
            <h2>{t('Recent Service Logs', 'سجلات الخدمة الأخيرة')}</h2>
            <p>{t('Validated maintenance records from Firestore', 'سجلات صيانة معتمدة من فايرستور')}</p>
          </div>
          {canEdit && (
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                className="btn-refresh"
                style={{ display: 'flex', gap: '8px', alignItems: 'center', background: 'var(--theme-ink)', color: 'var(--theme-ink-text)', border: 'none', borderRadius: '999px' }}
                onClick={() => setShowUploadModal(true)}
              >
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
                <th>{t('Files', 'المرفقات')}</th>
              </tr>
            </thead>
            <tbody>
              {records.length > 0 ? records.map((r, i) => (
                <tr key={r.id || i}>
                  <td style={{ color: 'var(--theme-text-muted)' }}>{r.date}</td>
                  <td style={{ fontWeight: 800, color: 'var(--theme-text-main)' }}>{r.plateNumber || r.registration}</td>
                  <td style={{ maxWidth: '400px', fontSize: '0.85rem', lineHeight: '1.4' }}>
                    {r.description}
                    <div style={{ fontSize: '0.7rem', color: 'var(--theme-text-muted)', marginTop: '4px' }}>{t('Supplier:', 'المورد:')} {r.supplier}</div>
                  </td>
                  <td>{parseFloat(r.amount || 0).toLocaleString(locale)}</td>
                  <td className="text-muted">{parseFloat(r.vat || 0).toLocaleString(locale)}</td>
                  <td style={{ fontWeight: 700, color: 'var(--theme-accent)' }}>{parseFloat(r.total || 0).toLocaleString(locale)}</td>
                  <td className="text-muted" style={{ fontFamily: 'monospace' }}>#{r.invoiceNumber || r.invoice_no}</td>
                  <td>
                    <MaintenanceAttachments
                      record={r}
                      files={filesByRecord.get(recordKeyOf(r)) || []}
                      isMasterAdmin={isMasterAdmin}
                    />
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '40px', color: 'var(--theme-text-muted)' }}>
                    {t('No maintenance records found in Firestore.', 'لم يتم العثور على سجلات صيانة في فايرستور.')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      </>)}

      <MaintenanceUploadModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onImportComplete={() => {
          setShowUploadModal(false);
          fetchMaintenanceData();
        }}
      />
    </div>
  );
}
