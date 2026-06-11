import React, { useState, useCallback } from 'react';
import { Settings, Bell, Shield, Database, Save, CheckCircle, RefreshCw, AlertTriangle, Loader2, Lock } from 'lucide-react';
import { useFleetSettings, DEFAULT_SETTINGS } from './FleetSettingsContext';
import { cartrackService } from '../../services/cartrackService';
import { useLanguage } from '../../contexts/LanguageContext';
import { usePermissions } from '../../hooks/usePermissions';
import CustomSelect from '../CustomSelect';
import './FleetModule.css';

function sensitivityLabel(val, t) {
  if (val < 0.6) return t('Low', 'منخفض');
  if (val < 1.0) return t('Medium', 'متوسط');
  if (val < 1.5) return t('High', 'عالي');
  return t('Very High', 'عالي جداً');
}
function sensitivityColor(val) {
  if (val < 0.6) return '#10B981';
  if (val < 1.0) return '#F59E0B';
  if (val < 1.5) return '#EF4444';
  return '#DC2626';
}

function Toggle({ label, checked, onChange, badge, t }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div 
          onClick={onChange} 
          style={{ 
            width: '44px', 
            height: '24px', 
            borderRadius: '12px', 
            background: checked ? 'var(--theme-accent)' : 'rgba(255,255,255,0.1)', 
            position: 'relative', 
            cursor: 'pointer', 
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', 
            flexShrink: 0 
          }}
        >
          <div style={{ 
            position: 'absolute', 
            top: '3px', 
            left: checked ? '23px' : '3px', 
            width: '18px', 
            height: '18px', 
            borderRadius: '50%', 
            background: 'white', 
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', 
            boxShadow: '0 2px 4px rgba(0,0,0,0.3)' 
          }} />
        </div>
        <label style={{ margin: 0, cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' }} onClick={onChange}>{label}</label>
      </div>
      {badge && (
        <span className={`status-badge ${checked ? 'active' : 'muted'}`} style={{ opacity: checked ? 1 : 0.5 }}>
          {checked ? t('Online', 'متصل') : t('Offline', 'غير متصل')}
        </span>
      )}
    </div>
  );
}

export default function FleetSettings() {
  const { t, locale } = useLanguage();
  const { can } = usePermissions();
  const canEdit = can('fleet', 'edit');
  const { settings, saveSettings, resetSettings } = useFleetSettings();
  const [draft, setDraft] = useState({ ...settings });
  const [saveState, setSaveState] = useState('idle');
  const [syncState, setSyncState] = useState('idle');
  const [lastSynced, setLastSynced] = useState(settings.lastSyncedAt ? new Date(settings.lastSyncedAt) : null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const set = useCallback((key, value) => setDraft(prev => ({ ...prev, [key]: value })), []);

  const handleSave = () => {
    saveSettings(draft);
    setSaveState('saved');
    setTimeout(() => setSaveState('idle'), 2500);
  };

  const handleSyncNow = async () => {
    setSyncState('syncing');
    try {
      const result = await cartrackService.getVehicles();
      if (result && result.length > 0) {
        const now = new Date();
        setLastSynced(now);
        saveSettings({ ...draft, lastSyncedAt: now.toISOString() });
        setSyncState('ok');
      } else {
        setSyncState('error');
      }
    } catch { setSyncState('error'); }
    setTimeout(() => setSyncState('idle'), 4000);
  };

  const handleReset = () => {
    resetSettings();
    setDraft({ ...DEFAULT_SETTINGS });
    setShowResetConfirm(false);
  };

  const formatLastSync = () => {
    if (!lastSynced) return t('Never', 'أبداً');
    const diff = Math.round((Date.now() - lastSynced.getTime()) / 60000);
    if (diff < 1) return t('Just now', 'الآن');
    if (diff === 1) return t('1 minute ago', 'منذ دقيقة واحدة');
    if (diff < 60) return t(`${diff} minutes ago`, `منذ ${diff} دقيقة`);
    return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(lastSynced);
  };

  return (
    <div className="fleet-settings-view">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', flexDirection: locale === 'ar-SA' ? 'row-reverse' : 'row' }}>
        <div className="section-header" style={{ marginBottom: 0, textAlign: locale === 'ar-SA' ? 'right' : 'left' }}>
          <h2>{t('System Control', 'التحكم في النظام')}</h2>
          <p>{t('Global configuration for telemetry and risk parameters', 'التكوين العالمي لمعلمات القياس عن بعد والمخاطر')}</p>
        </div>
        {canEdit && (
          <button
            className="top-nav-item active"
            onClick={handleSave}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', fontSize: '0.9rem', flexDirection: locale === 'ar-SA' ? 'row-reverse' : 'row' }}
          >
            {saveState === 'saved' ? <><CheckCircle size={16} /> {t('Configuration Saved', 'تم حفظ التكوين')}</> : <><Save size={16} /> {t('Commit Changes', 'تطبيق التغييرات')}</>}
          </button>
        )}
      </div>

      <div className="fleet-charts-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px' }}>
        
        {/* General */}
        <div className="glass-panel">
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '24px', flexDirection: locale === 'ar-SA' ? 'row-reverse' : 'row' }}>
            <Settings size={20} className="text-accent" />
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>{t('General Parameters', 'المعلمات العامة')}</h3>
          </div>
          
          <div className="fleet-input-group" style={{ marginBottom: '24px', textAlign: locale === 'ar-SA' ? 'right' : 'left' }}>
            <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', marginBottom: '8px' }}>{t('Regional Currency', 'العملة الإقليمية')}</label>
            <CustomSelect value={draft.currency} onChange={(v) => canEdit && set('currency', v)} disabled={!canEdit}
              options={[
                { value: 'AED', label: t('AED — United Arab Emirates Dirham', 'درهم — درهم الإمارات العربية المتحدة') },
                { value: 'USD', label: t('USD — United States Dollar', 'دولار — دولار أمريكي') },
                { value: 'EUR', label: t('EUR — Euro Member State', 'يورو — يورو') },
              ]} />
          </div>

          <div className="fleet-input-group" style={{ marginBottom: '24px', textAlign: locale === 'ar-SA' ? 'right' : 'left' }}>
            <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', marginBottom: '8px' }}>{t('Measurement Standard', 'معيار القياس')}</label>
            <CustomSelect value={draft.measurementUnit} onChange={(v) => canEdit && set('measurementUnit', v)} disabled={!canEdit}
              options={[
                { value: 'km', label: t('Metric (Kilometers)', 'متري (كيلومترات)') },
                { value: 'mi', label: t('Imperial (Miles)', 'إمبراطوري (أميال)') },
              ]} />
          </div>

          <div className="fleet-input-group" style={{ textAlign: locale === 'ar-SA' ? 'right' : 'left' }}>
            <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', marginBottom: '8px' }}>{t('Operational Timezone', 'المنطقة الزمنية للتشغيل')}</label>
            <CustomSelect value={draft.timezone} onChange={(v) => canEdit && set('timezone', v)} disabled={!canEdit}
              options={[
                { value: 'Asia/Dubai', label: t('(GMT+04:00) Gulf Standard Time', '(GMT+04:00) توقيت الخليج القياسي') },
                { value: 'Europe/London', label: t('(GMT+00:00) Greenwich Mean Time', '(GMT+00:00) توقيت غرينتش') },
              ]} />
          </div>
        </div>

        {/* Risk Thresholds */}
        <div className="glass-panel">
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '24px', flexDirection: locale === 'ar-SA' ? 'row-reverse' : 'row' }}>
            <Shield size={20} className="text-risk" />
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>{t('Risk Intelligence Thresholds', 'عتبات استخبارات المخاطر')}</h3>
          </div>
          
          <div className="fleet-input-group" style={{ marginBottom: '24px', textAlign: locale === 'ar-SA' ? 'right' : 'left' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', flexDirection: locale === 'ar-SA' ? 'row-reverse' : 'row' }}>
              <label style={{ fontSize: '0.7rem', fontWeight: 800, color: '#6b7280', textTransform: 'uppercase' }}>{t('Speeding Violation Limit', 'حد مخالفة السرعة')}</label>
              <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--theme-accent)' }}>{draft.speedingLimit.toLocaleString(locale)} {t('KM/H', 'كم/س')}</span>
            </div>
            <input 
              type="range" 
              min={60} 
              max={160} 
              step={5}
              style={{ width: '100%', accentColor: 'var(--theme-accent)' }}
              value={draft.speedingLimit}
              disabled={!canEdit}
              onChange={e => canEdit && set('speedingLimit', Number(e.target.value))}
            />
          </div>

          <div className="fleet-input-group" style={{ marginBottom: '24px', textAlign: locale === 'ar-SA' ? 'right' : 'left' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', flexDirection: locale === 'ar-SA' ? 'row-reverse' : 'row' }}>
              <label style={{ fontSize: '0.7rem', fontWeight: 800, color: '#6b7280', textTransform: 'uppercase' }}>{t('Harsh Braking Sensitivity', 'حساسية الفرملة الشديدة')}</label>
              <span className="status-badge" style={{ background: `${sensitivityColor(draft.brakingSensitivity)}22`, color: sensitivityColor(draft.brakingSensitivity), border: 'none' }}>
                {sensitivityLabel(draft.brakingSensitivity, t)}
              </span>
            </div>
            <input 
              type="range" 
              min={0.5} 
              max={2.0} 
              step={0.1}
              style={{ width: '100%', accentColor: sensitivityColor(draft.brakingSensitivity) }}
              value={draft.brakingSensitivity}
              disabled={!canEdit}
              onChange={e => canEdit && set('brakingSensitivity', parseFloat(e.target.value))}
            />
          </div>

          <Toggle
            label={t('Real-time Violation Alerts', 'تنبيهات المخالفات في الوقت الفعلي')}
            checked={draft.enableRealTimeAlerts}
            onChange={() => canEdit && set('enableRealTimeAlerts', !draft.enableRealTimeAlerts)}
            badge
            t={t}
          />
        </div>

        {/* Notifications */}
        <div className="glass-panel">
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '24px', flexDirection: locale === 'ar-SA' ? 'row-reverse' : 'row' }}>
            <Bell size={20} className="text-caution" />
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>{t('Notification Dispatch', 'إرسال الإشعارات')}</h3>
          </div>
          <Toggle label={t('Email Security Summaries', 'ملخصات أمان البريد الإلكتروني')} checked={draft.emailNotifications} onChange={() => canEdit && set('emailNotifications', !draft.emailNotifications)} t={t} />
          <Toggle label={t('SMS Critical Alerting', 'تنبيهات SMS الحرجة')} checked={draft.smsAlerts} onChange={() => canEdit && set('smsAlerts', !draft.smsAlerts)} t={t} />
          <Toggle label={t('WhatsApp Operations Sync', 'مزامنة عمليات واتساب')} checked={draft.whatsappIntegration} onChange={() => canEdit && set('whatsappIntegration', !draft.whatsappIntegration)} t={t} />
          
          <div style={{ marginTop: '24px', padding: '16px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', textAlign: locale === 'ar-SA' ? 'right' : 'left' }}>
            <p style={{ margin: 0, fontSize: '0.75rem', color: '#6b7280', lineHeight: 1.6 }}>
              <strong style={{ color: 'var(--theme-accent)' }}>{t('PROTOCOL:', 'بروتوكول:')}</strong> {t('Dispatch preferences are synchronized across the operational cloud. Critical alerts bypass these settings during security breaches.', 'تتم مزامنة تفضيلات الإرسال عبر السحابة التشغيلية. تتجاوز التنبيهات الحرجة هذه الإعدادات أثناء الاختراقات الأمنية.')}
            </p>
          </div>
        </div>

        {/* Connectivity */}
        <div className="glass-panel">
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '24px', flexDirection: locale === 'ar-SA' ? 'row-reverse' : 'row' }}>
            <Database size={20} className="text-safe" />
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>{t('Telematics Connectivity', 'اتصال تكنولوجيا المعلومات والاتصالات')}</h3>
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexDirection: locale === 'ar-SA' ? 'row-reverse' : 'row' }}>
             <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>{t('Satellite Link Status:', 'حالة رابط القمر الصناعي:')}</span>
             <span style={{ fontSize: '0.85rem', fontWeight: 800, color: lastSynced ? 'var(--theme-accent)' : '#ef4444' }}>
               {lastSynced ? t('CONNECTED', 'متصل') : t('DISCONNECTED', 'غير متصل')}
             </span>
          </div>

          <div style={{ padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', marginBottom: '24px', textAlign: locale === 'ar-SA' ? 'right' : 'left' }}>
             <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '8px', flexDirection: locale === 'ar-SA' ? 'row-reverse' : 'row' }}>
               <span style={{ color: '#6b7280' }}>{t('LAST SYNC SEQUENCE:', 'آخر تسلسل مزامنة:')}</span>
               <span style={{ fontWeight: 700 }}>{formatLastSync()}</span>
             </div>
             {syncState === 'error' && (
               <div style={{ color: '#ef4444', fontSize: '0.7rem', fontWeight: 600, marginTop: '8px' }}>
                 <AlertTriangle size={12} style={{ verticalAlign: 'middle', marginRight: '4px' }} /> {t('HANDSHAKE FAILED: RETRYING...', 'فشل الاتصال: جارٍ إعادة المحاولة...')}
               </div>
             )}
          </div>

          {canEdit && (
            <button
              className="top-nav-item"
              style={{ width: '100%', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--theme-accent)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onClick={handleSyncNow}
              disabled={syncState === 'syncing'}
            >
              {syncState === 'syncing' ? <Loader2 size={16} className="animate-spin" /> : <><RefreshCw size={14} style={{ marginRight: locale === 'ar-SA' ? '0' : '8px', marginLeft: locale === 'ar-SA' ? '8px' : '0' }} /> {t('RE-INITIALIZE SYNC', 'إعادة تهيئة المزامنة')}</>}
            </button>
          )}

          {canEdit && (!showResetConfirm ? (
            <button
              style={{ width: '100%', background: 'transparent', border: 'none', color: '#ef4444', fontSize: '0.75rem', fontWeight: 700, marginTop: '16px', cursor: 'pointer', textDecoration: 'underline' }}
              onClick={() => setShowResetConfirm(true)}
            >
              {t('PURGE LOCAL CONFIGURATION', 'تطهير التكوين المحلي')}
            </button>
          ) : (
            <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(239,68,68,0.05)', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.1)', textAlign: locale === 'ar-SA' ? 'right' : 'left' }}>
              <p style={{ margin: '0 0 12px', fontSize: '0.75rem', color: 'var(--theme-text-main)' }}>{t('Are you sure? This will wipe all local settings.', 'هل أنت متأكد؟ سيؤدي هذا إلى مسح جميع الإعدادات المحلية.')}</p>
              <div style={{ display: 'flex', gap: '8px', flexDirection: locale === 'ar-SA' ? 'row-reverse' : 'row' }}>
                <button onClick={handleReset} style={{ flex: 1, background: '#ef4444', color: 'white', border: 'none', padding: '6px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 800 }}>{t('WIPE', 'مسح')}</button>
                <button onClick={() => setShowResetConfirm(false)} style={{ flex: 1, background: 'var(--theme-surface-pearl)', color: 'var(--theme-text-main)', border: '1px solid var(--theme-border)', padding: '6px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 600 }}>{t('CANCEL', 'إلغاء')}</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
