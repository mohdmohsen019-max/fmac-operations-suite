import React, { useState, useEffect, useCallback } from 'react';
import {
  Wrench, Receipt, Calendar, CreditCard, Plus, Cog, Droplets, Siren, ShieldCheck,
  DatabaseZap, Loader2, CheckCircle2, AlertCircle,
} from 'lucide-react';
import { db } from '../../firebase';
import { collection, doc, getDoc, getDocs, query, orderBy } from 'firebase/firestore';
import { useLanguage } from '../../contexts/LanguageContext';
import { useFleetScope } from './FleetScopeContext';
import MaintenanceUploadModal from './MaintenanceUploadModal';
import { useMaintenanceSuite, useMaintenanceFiles, recordKeyOf } from './maintenance/maintenanceSuite';
import MaintenanceAttachments from './maintenance/MaintenanceAttachments';
import PartsHealth from './maintenance/PartsHealth';
import OilTracking from './maintenance/OilTracking';
import PreventivePlan from './maintenance/PreventivePlan';
import { MAINTENANCE_ARCHIVE_ID, replaceMaintenanceWithInvoiceArchive } from '../../services/maintenanceArchiveImport';
import './FleetModule.css';
import './maintenance/FleetMaintenanceSuite.css';

/* ── Aggregated alerts strip: overdue oil + critical parts first ──────── */
function AlertsStrip({ suite, onJump }) {
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
          <span className="fms-alert-reg">{a.reg}</span>
          {a.type === 'oil'
            ? (a.status === 'invalid'
              ? t(
                `oil record exceeds the current odometer by ${a.odometerGap.toLocaleString(locale)} km`,
                `قراءة سجل الزيت أعلى من العداد الحالي بمقدار ${a.odometerGap.toLocaleString(locale)} كم`,
              )
              : a.severity === 'critical'
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
  const { scope, inScope, displayName, metaOf, metaReady, aliasMap } = useFleetScope();
  const [section, setSection] = useState('records'); // records | parts | oil
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [archiveReady, setArchiveReady] = useState(false);
  const [archiveImport, setArchiveImport] = useState({ running: false, message: '', result: null, error: '' });
  const [stats, setStats] = useState({
    totalSpent: 0,
    monthSpent: 0,
    vatPaid: 0,
    pendingTasks: 0
  });

  /* Suite data: vehicles in scope (live odometer), part catalog + installs,
     oil tracking — shared by the alerts strip and the sub-sections. */
  const suite = useMaintenanceSuite(scope, inScope, aliasMap);
  const filesByRecord = useMaintenanceFiles();

  const fetchMaintenanceData = useCallback(async () => {
    setLoading(true);
    try {
      // Reverting to Firestore as per user request (Cartrack API does not store internal FMAC receipts)
      const q = query(collection(db, 'maintenance'), orderBy('date', 'desc'));
      const snap = await getDocs(q);

      const allData = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      const data = allData.filter((r) => inScope(r.plateNumber || r.registration));
      setRecords(data);

      if (data.length > 0) {
        const total = data.reduce((sum, r) => sum + (parseFloat(r.total) || 0), 0);
        const vat = data.reduce((sum, r) => sum + (parseFloat(r.vat) || 0), 0);

        const currentPrefix = new Date().toISOString().slice(0, 7);
        const currentSpend = data
          .filter(r => r.date?.startsWith(currentPrefix))
          .reduce((sum, r) => sum + (parseFloat(r.total) || 0), 0);
        const pendingTasks = data.filter((r) => ['pending', 'scheduled', 'due'].includes(String(r.status || '').toLowerCase())).length;

        setStats({
          totalSpent: total,
          vatPaid: vat,
          monthSpent: currentSpend,
          pendingTasks,
        });
      } else {
        setStats({ totalSpent: 0, monthSpent: 0, vatPaid: 0, pendingTasks: 0 });
      }
    } catch (err) {
      console.error('Maintenance Firestore fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [inScope]);

  useEffect(() => {
    if (metaReady) fetchMaintenanceData();
  }, [fetchMaintenanceData, metaReady]);

  useEffect(() => {
    if (scope !== 'buses' && section === 'plan') setSection('records');
  }, [scope, section]);

  useEffect(() => {
    getDoc(doc(db, 'fleet_imports', MAINTENANCE_ARCHIVE_ID))
      .then((snapshot) => setArchiveReady(snapshot.exists()))
      .catch((error) => console.error('Maintenance archive status check failed:', error));
  }, []);

  const importInvoiceArchive = async () => {
    const confirmed = window.confirm(t(
      'Replace every current maintenance record with the verified 90 Abu Thahnun invoices from January–July 2026? A recoverable backup of the old records will be created first.',
      'استبدال جميع سجلات الصيانة الحالية بفواتير أبو طحنون التسعين المعتمدة من يناير إلى يوليو 2026؟ سيتم إنشاء نسخة احتياطية قابلة للاسترجاع أولاً.'
    ));
    if (!confirmed) return;
    setArchiveImport({ running: true, message: t('Starting secure import…', 'بدء الاستيراد الآمن…'), result: null, error: '' });
    try {
      const result = await replaceMaintenanceWithInvoiceArchive((message) => {
        setArchiveImport((current) => ({ ...current, message }));
      });
      setArchiveImport({ running: false, message: '', result, error: '' });
      setArchiveReady(true);
      await fetchMaintenanceData();
    } catch (error) {
      console.error('Maintenance archive import failed:', error);
      setArchiveImport({ running: false, message: '', result: null, error: error.message || String(error) });
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
    ...(scope === 'buses' ? [{ id: 'plan', icon: ShieldCheck, en: 'Preventive Plan', ar: 'الخطة الوقائية', badge: suite.summary.preventiveOverdue || 0 }] : []),
    { id: 'records', icon: Receipt, en: 'Records', ar: 'السجلات' },
    { id: 'parts', icon: Cog, en: 'Parts Health', ar: 'صحة القطع', badge: suite.summary.critical },
    { id: 'oil', icon: Droplets, en: 'Oil Change', ar: 'تغيير الزيت', badge: suite.summary.oilOverdue },
  ];

  return (
    <div className="maintenance-view" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <AlertsStrip suite={suite} onJump={setSection} />

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

      {section === 'plan' && (
        <PreventivePlan suite={suite} records={records} canEdit={canEdit} displayName={displayName} onRecordsChanged={fetchMaintenanceData} />
      )}

      {section === 'records' && (<>
      {(archiveImport.running || archiveImport.result || archiveImport.error) && (
        <div className={`fms-import-status${archiveImport.error ? ' is-error' : archiveImport.result ? ' is-success' : ''}`} role="status">
          {archiveImport.running ? <Loader2 size={16} className="fms-spin" /> : archiveImport.result ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <div>
            <strong>{archiveImport.running
              ? t('Importing verified invoice archive', 'جارٍ استيراد أرشيف الفواتير المعتمد')
              : archiveImport.result
                ? t('Invoice archive imported', 'تم استيراد أرشيف الفواتير')
                : t('Import stopped', 'توقف الاستيراد')}</strong>
            <span>{archiveImport.running
              ? archiveImport.message
              : archiveImport.result
                ? t(`${archiveImport.result.invoiceCount} invoices, ${archiveImport.result.registrationCount} registration cards and ${archiveImport.result.partInstallCount} component replacements were written.`, `تمت كتابة ${archiveImport.result.invoiceCount} فاتورة و${archiveImport.result.registrationCount} بطاقة مركبة و${archiveImport.result.partInstallCount} عملية استبدال قطع.`)
                : archiveImport.error}</span>
          </div>
        </div>
      )}
      <div className="stats-bento">
        <div className="stat-card glass-panel">
          <div className="stat-header"><h3>{t('Lifetime Expenditure', 'إجمالي النفقات')}</h3><CreditCard size={16} /></div>
          <div className="stat-value">{stats.totalSpent.toLocaleString(locale)}<span style={{fontSize: '0.9rem', marginLeft: locale === 'ar-SA' ? '0' : '4px', marginRight: locale === 'ar-SA' ? '4px' : '0'}}>{t('AED', 'د.إ')}</span></div>
          <p className="stat-label">{t('All-time maintenance cost (Firestore)', 'تكلفة الصيانة الإجمالية (فايرستور)')}</p>
        </div>
        <div className="stat-card glass-panel">
          <div className="stat-header"><h3>{t('Monthly Forecast', 'التوقعات الشهرية')}</h3><Calendar size={16} className="text-accent" /></div>
          <div className="stat-value text-accent">{stats.monthSpent.toLocaleString(locale)}<span style={{fontSize: '0.9rem', marginLeft: locale === 'ar-SA' ? '0' : '4px', marginRight: locale === 'ar-SA' ? '4px' : '0'}}>{t('AED', 'د.إ')}</span></div>
          <p className="stat-label">{t('Spending in the current month', 'الإنفاق في الشهر الحالي')}</p>
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
                className="fms-btn fms-btn--archive"
                onClick={importInvoiceArchive}
                disabled={archiveImport.running || archiveReady}
                title={t('Back up old records, then replace them with the verified January–July invoice archive', 'نسخ السجلات القديمة احتياطياً ثم استبدالها بأرشيف فواتير يناير إلى يوليو المعتمد')}
              >
                {archiveImport.running ? <Loader2 size={14} className="fms-spin" /> : archiveReady ? <CheckCircle2 size={14} /> : <DatabaseZap size={14} />}
                {archiveReady ? t('Jan–Jul archive loaded', 'تم تحميل أرشيف يناير–يوليو') : t('Import Jan–Jul invoices', 'استيراد فواتير يناير–يوليو')}
              </button>
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
                  <td style={{ fontWeight: 800, color: 'var(--theme-text-main)' }}>
                    {metaOf(r.plateNumber || r.registration).plateNumber || r.plateNumber || r.registration}
                  </td>
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
