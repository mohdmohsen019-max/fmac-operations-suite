import React, { useState, useEffect, useRef } from 'react';
import { db } from '../../firebase';
import { collection, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import { useLanguage } from '../../contexts/LanguageContext';
import { cartrackService } from '../../services/cartrackService';

export default function FleetDriverLog() {
  const { t, locale } = useLanguage();
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const [formData, setFormData] = useState({
    vehicle: null,
    startOdo: 0,
    endOdo: '',
    tripType: 'Internal',
    destination: '',
    notes: '',
    date: format(new Date(), 'yyyy-MM-dd')
  });

  async function fetchVehicles() {
    setLoading(true);
    try {
      const [liveData, firestoreSnap] = await Promise.all([
        cartrackService.getVehicles(),
        getDocs(collection(db, 'vehicles'))
      ]);
      
      const firestoreVehicles = firestoreSnap.docs.map(doc => doc.data());

      if (liveData) {
        const mapped = liveData.map(v => {
          const fsData = firestoreVehicles.find(f => f.plateNumber === v.registration);
          return {
            plateNumber: v.registration,
            busNumber: fsData?.busNumber || v.vehicle_id.toString().slice(-3),
            driverName: fsData?.driverName || t('Unassigned', 'غير معين'),
            currentOdometer: Math.round((v.odometer || 0) / 1000)
          };
        });
        setVehicles(mapped);
      }
    } catch (err) {
      console.error('Error fetching vehicles:', err);
    }
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchVehicles();
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectVehicle = (v) => {
    setFormData({
      ...formData,
      vehicle: v,
      startOdo: v.currentOdometer,
      endOdo: ''
    });
    setIsOpen(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.vehicle || !formData.endOdo) return;
    
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'trip_logs'), {
        ...formData,
        vehicleId: formData.vehicle.id,
        plateNumber: formData.vehicle.plateNumber,
        busNumber: formData.vehicle.busNumber,
        createdAt: serverTimestamp()
      });
      alert(t('Trip logged successfully!', 'تم تسجيل الرحلة بنجاح!'));
      setFormData({
        ...formData,
        vehicle: null,
        startOdo: 0,
        endOdo: '',
        destination: '',
        notes: ''
      });
    } catch (err) {
      console.error('Error logging trip:', err);
    }
    setSubmitting(false);
  };

  return (
    <div className="fleet-view-container" style={{ alignItems: 'center' }}>
      <div className="fleet-form-container" style={{ maxWidth: '600px', width: '100%', textAlign: locale === 'ar-SA' ? 'right' : 'left' }}>
        <SectionTitle title={t('Log New Trip', 'تسجيل رحلة جديدة')} icon={Navigation} />
        <p style={{ color: 'var(--theme-text-muted)', fontSize: '0.85rem', marginBottom: '32px' }}>
          {t('Please ensure all odometer readings are accurate before submitting.', 'يرجى التأكد من أن جميع قراءات عداد المسافة دقيقة قبل الإرسال.')}
        </p>

        <form onSubmit={handleSubmit}>
          <div className="fleet-input-group" ref={dropdownRef}>
            <label className="fleet-label">{t('Select Vehicle', 'اختر المركبة')}</label>
            <div 
              className={`fleet-input ${isOpen ? 'active' : ''}`}
              style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', flexDirection: locale === 'ar-SA' ? 'row-reverse' : 'row' }}
              onClick={() => setIsOpen(!isOpen)}
            >
              <span style={{ color: formData.vehicle ? '#FFFFFF' : 'var(--theme-text-muted)' }}>
                {formData.vehicle ? `${formData.vehicle.busNumber} — ${formData.vehicle.plateNumber}` : t('Select a vehicle...', 'اختر مركبة...')}
              </span>
              <ChevronDown size={16} style={{ color: 'var(--theme-text-muted)' }} />
              
              {isOpen && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 8px)', left: 0, right: 0,
                  background: '#1A1A2E', border: '1px solid var(--fleet-border)',
                  borderRadius: '12px', zIndex: 100, maxHeight: '250px', overflowY: 'auto',
                  boxShadow: '0 10px 30px rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)'
                }}>
                  {loading ? (
                    <div style={{ padding: '20px', display: 'flex', justifyContent: 'center' }}><div className="app-loader"><span /><span /><span /><span /><span /></div></div>
                  ) : vehicles.map(v => (
                    <div 
                      key={v.id}
                      className="dropdown-item"
                      style={{
                        padding: '12px 16px', display: 'flex', justifyContent: 'space-between',
                        alignItems: 'center', transition: '0.2s', borderBottom: '1px solid rgba(255,255,255,0.05)',
                        flexDirection: locale === 'ar-SA' ? 'row-reverse' : 'row',
                        textAlign: locale === 'ar-SA' ? 'right' : 'left'
                      }}
                      onClick={(e) => { e.stopPropagation(); handleSelectVehicle(v); }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 700, color: '#FFFFFF' }}>{v.busNumber} — {v.plateNumber}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--theme-text-muted)' }}>{v.driverName}</span>
                      </div>
                      {formData.vehicle?.id === v.id && <Check size={16} color="var(--theme-accent)" />}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
            <div className="fleet-input-group">
              <label className="fleet-label">{t('Start Odometer (km)', 'بداية عداد المسافة (كم)')}</label>
              <input 
                type="text" 
                className="fleet-input" 
                value={formData.startOdo > 0 ? `${formData.startOdo.toLocaleString(locale)} ${t('km', 'كم')}` : t('Select Bus...', 'اختر الحافلة...')} 
                readOnly 
                style={{ background: 'rgba(255,255,255,0.02)', color: 'var(--theme-text-muted)', cursor: 'not-allowed', textAlign: locale === 'ar-SA' ? 'right' : 'left' }}
              />
            </div>
            <div className="fleet-input-group">
              <label className="fleet-label">{t('End Odometer (km)', 'نهاية عداد المسافة (كم)')}</label>
              <input 
                type="number" 
                className="fleet-input" 
                placeholder={t('Enter final reading', 'أدخل القراءة النهائية')}
                value={formData.endOdo}
                onChange={(e) => setFormData({...formData, endOdo: e.target.value})}
                required
                style={{ textAlign: locale === 'ar-SA' ? 'right' : 'left' }}
              />
            </div>
          </div>

          <div className="fleet-input-group">
            <label className="fleet-label">{t('Trip Type', 'نوع الرحلة')}</label>
            <div style={{ display: 'flex', gap: '12px', background: 'rgba(255,255,255,0.03)', padding: '6px', borderRadius: '12px', border: '1px solid var(--fleet-border)', flexDirection: locale === 'ar-SA' ? 'row-reverse' : 'row' }}>
              <button 
                type="button"
                className="fleet-btn-primary" 
                style={{ 
                  flex: 1, 
                  background: formData.tripType === 'Internal' ? 'var(--theme-accent-soft)' : 'transparent', 
                  color: formData.tripType === 'Internal' ? 'var(--theme-accent)' : 'var(--theme-text-muted)', 
                  border: formData.tripType === 'Internal' ? '1px solid var(--theme-accent)' : '1px solid transparent',
                  height: '40px'
                }}
                onClick={() => setFormData({...formData, tripType: 'Internal'})}
              >{t('Internal', 'داخلي')}</button>
              <button 
                type="button"
                className="fleet-btn-primary" 
                style={{ 
                  flex: 1, 
                  background: formData.tripType === 'External' ? 'var(--theme-accent-soft)' : 'transparent', 
                  color: formData.tripType === 'External' ? 'var(--theme-accent)' : 'var(--theme-text-muted)', 
                  border: formData.tripType === 'External' ? '1px solid var(--theme-accent)' : '1px solid transparent',
                  height: '40px'
                }}
                onClick={() => setFormData({...formData, tripType: 'External'})}
              >{t('External', 'خارجي')}</button>
            </div>
          </div>

          {formData.tripType === 'External' && (
            <div className="fleet-input-group animate-in">
              <label className="fleet-label">{t('Destination / Location', 'الوجهة / الموقع')}</label>
              <div style={{ position: 'relative' }}>
                <MapPin style={{ position: 'absolute', [locale === 'ar-SA' ? 'right' : 'left']: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--theme-text-muted)' }} size={16} />
                <input 
                  type="text" 
                  className="fleet-input" 
                  placeholder={t('Where did you go?', 'إلى أين ذهبت؟')} 
                  style={{ [locale === 'ar-SA' ? 'paddingRight' : 'paddingLeft']: '40px', textAlign: locale === 'ar-SA' ? 'right' : 'left' }}
                  value={formData.destination}
                  onChange={(e) => setFormData({...formData, destination: e.target.value})}
                  required={formData.tripType === 'External'}
                />
              </div>
            </div>
          )}

          <div className="fleet-input-group">
            <label className="fleet-label">{t('Date of Trip', 'تاريخ الرحلة')}</label>
            <input 
              type="text" 
              className="fleet-input" 
              value={new Intl.DateTimeFormat(locale, { dateStyle: 'full' }).format(new Date())} 
              readOnly 
              style={{ background: 'rgba(255,255,255,0.02)', color: 'var(--theme-text-muted)', cursor: 'not-allowed', textAlign: locale === 'ar-SA' ? 'right' : 'left' }}
            />
          </div>

          <div className="fleet-input-group">
            <label className="fleet-label">{t('Notes / Purpose', 'ملاحظات / الغرض')}</label>
            <textarea 
              className="fleet-input" 
              rows="3" 
              placeholder={t('Describe the trip purpose...', 'صف غرض الرحلة...')}
              style={{ resize: 'none', textAlign: locale === 'ar-SA' ? 'right' : 'left' }}
              value={formData.notes}
              onChange={(e) => setFormData({...formData, notes: e.target.value})}
            ></textarea>
          </div>

          <button 
            type="submit"
            className="fleet-btn-primary" 
            disabled={submitting || !formData.vehicle || !formData.endOdo}
            style={{ 
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', 
              gap: '12px', height: '52px', fontSize: '1rem',
              opacity: (submitting || !formData.vehicle || !formData.endOdo) ? 0.6 : 1,
              flexDirection: locale === 'ar-SA' ? 'row-reverse' : 'row'
            }}
          >
            {submitting ? <Loader2 className="animate-spin" /> : <Save size={20} />} 
            {t('Submit Trip Log', 'إرسال سجل الرحلة')}
          </button>
        </form>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .dropdown-item:hover {
          background: var(--theme-accent-soft) !important;
          cursor: pointer;
        }
        .animate-in {
          animation: slideDown 0.3s ease-out;
        }
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}} />
    </div>
  );
}

