import React, { useState } from 'react';
import { X, Save, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import CustomSelect from '../CustomSelect';
import { saveVehicleMeta, VEHICLE_CLASSES } from '../../services/fleetMeta';
import { auth } from '../../firebase';
import { useLanguage } from '../../contexts/LanguageContext';
import './FleetEcosystem.css';

/*
 * VehicleEditModal — edits the Firestore-backed metadata of one vehicle
 * (fleet_vehicle_meta/{REG}): class, bus number, driver, make, model,
 * label and notes. The scope context's live subscription re-scopes every
 * fleet sub-module the moment the class changes.
 *
 * Props:
 *   vehicle          — effective meta object (must include .registration)
 *   onClose()        — close without saving
 *   onSaved(patch)   — called after a successful save, before closing
 */
export default function VehicleEditModal({ vehicle, onClose, onSaved }) {
  const navigate = useNavigate();
  const { t, lang } = useLanguage();
  const [form, setForm] = useState({
    vehicleClass: vehicle?.vehicleClass === 'other' ? 'other' : 'bus',
    busNumber: vehicle?.busNumber ?? '',
    driverName: vehicle?.driverName ?? '',
    manufacturer: vehicle?.manufacturer ?? '',
    model: vehicle?.model ?? '',
    plateNumber: vehicle?.plateNumber ?? vehicle?.registration ?? '',
    telemetryAliases: Array.isArray(vehicle?.telemetryAliases) ? vehicle.telemetryAliases.join(', ') : '',
    cartrackId: vehicle?.cartrackId ?? '',
    category: vehicle?.category ?? 'Passenger Transport',
    vehicleType: vehicle?.vehicleType ?? 'Bus',
    internalIdentifier: vehicle?.internalIdentifier ?? '',
    year: vehicle?.year ?? '',
    capacity: vehicle?.capacity ?? '',
    operationalStatus: vehicle?.operationalStatus ?? 'active',
    label: vehicle?.label ?? '',
    notes: vehicle?.notes ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  if (!vehicle) return null;

  const set = (field) => (e) =>
    setForm((f) => ({ ...f, [field]: e?.target ? e.target.value : e }));

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const patch = {
        vehicleClass: form.vehicleClass,
        busNumber: String(form.busNumber).trim(),
        manufacturer: form.manufacturer.trim(),
        model: form.model.trim(),
        plateNumber: form.plateNumber.trim(),
        canonicalRegistration: form.plateNumber.trim(),
        telemetryAliases: form.telemetryAliases.split(',').map((alias) => alias.trim().toUpperCase()).filter(Boolean),
        cartrackRegistration: vehicle.registration,
        cartrackId: String(form.cartrackId).trim(),
        category: form.category.trim(),
        vehicleType: form.vehicleType.trim(),
        internalIdentifier: form.internalIdentifier.trim(),
        year: form.year ? Number(form.year) : null,
        capacity: form.capacity ? Number(form.capacity) : null,
        operationalStatus: form.operationalStatus,
        label: form.label.trim(),
        notes: form.notes.trim(),
      };
      await saveVehicleMeta(vehicle.registration, patch, auth.currentUser?.email || '');
      onSaved?.(patch);
      onClose();
    } catch (err) {
      console.error('[VehicleEditModal] save failed:', err);
      setError(t('Could not save changes. Please try again.', 'تعذر حفظ التغييرات. يرجى المحاولة مرة أخرى.'));
      setSaving(false);
    }
  };

  const classOptions = VEHICLE_CLASSES.map((c) => ({
    value: c.id,
    label: lang === 'ar' ? c.ar : c.en,
  }));

  return (
    <div className="eco-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="eco-modal" role="dialog" aria-modal="true">
        <div className="eco-modal-header">
          <div>
            <h3 className="eco-modal-title">{t('Edit Vehicle', 'تعديل المركبة')}</h3>
            <span className="eco-modal-reg">{vehicle.registration}</span>
          </div>
          <button className="eco-modal-close" onClick={onClose} aria-label={t('Close', 'إغلاق')}>
            <X size={16} />
          </button>
        </div>

        <div className="eco-modal-body">
          <div className="eco-form-grid">
            <div className="eco-field">
              <label className="eco-field-label">{t('FMAC Plate Number', 'رقم اللوحة في FMAC')}</label>
              <input className="eco-input" type="text" value={form.plateNumber} onChange={set('plateNumber')} />
            </div>
            <div className="eco-field">
              <label className="eco-field-label">{t('Cartrack Registration', 'تسجيل كارتراك')}</label>
              <input className="eco-input" type="text" value={vehicle.registration} disabled />
            </div>
            <div className="eco-field eco-field-full">
              <label className="eco-field-label">{t('Telemetry aliases', 'الأسماء البديلة لبيانات التتبع')}</label>
              <input className="eco-input" type="text" value={form.telemetryAliases} onChange={set('telemetryAliases')} placeholder={t('Comma-separated, e.g. C37072-CAM', 'افصل بفاصلة، مثال C37072-CAM')} />
              <small className="eco-field-hint">{t('Aliases are merged into this plate and never counted as additional vehicles or odometers.', 'تُدمج الأسماء البديلة مع هذه اللوحة ولا تُحتسب كمركبات أو عدادات إضافية.')}</small>
            </div>
            <div className="eco-field">
              <label className="eco-field-label">{t('Cartrack Vehicle ID', 'معرف مركبة كارتراك')}</label>
              <input className="eco-input" type="text" value={form.cartrackId} onChange={set('cartrackId')} />
            </div>
            <div className="eco-field">
              <label className="eco-field-label">{t('Internal Identifier', 'المعرف الداخلي')}</label>
              <input className="eco-input" type="text" value={form.internalIdentifier} onChange={set('internalIdentifier')} />
            </div>
            <div className="eco-field">
              <label className="eco-field-label">{t('Vehicle Class', 'تصنيف المركبة')}</label>
              <CustomSelect
                value={form.vehicleClass}
                onChange={set('vehicleClass')}
                options={classOptions}
                ariaLabel={t('Vehicle Class', 'تصنيف المركبة')}
              />
            </div>
            <div className="eco-field">
              <label className="eco-field-label">{t('Bus Number', 'رقم الحافلة')}</label>
              <input
                className="eco-input"
                type="text"
                value={form.busNumber}
                onChange={set('busNumber')}
                placeholder={t('e.g. 7', 'مثال: 7')}
                disabled={form.vehicleClass !== 'bus'}
              />
            </div>
            <div className="eco-field eco-field-full">
              <label className="eco-field-label">{t('Current driver', 'السائق الحالي')}</label>
              <div className="eco-assignment-field">
                <div><strong>{form.driverName || vehicle.driver_name || t('No current driver', 'لا يوجد سائق حالي')}</strong><small>{t('Managed as a dated person-to-vehicle assignment.', 'يُدار كتعيين مؤرخ بين الشخص والمركبة.')}</small></div>
                {form.vehicleClass === 'bus' && <button type="button" onClick={() => { onClose(); navigate(`/fleet/drivers?vehicle=${encodeURIComponent(vehicle.registration)}`); }}>{t('Change driver', 'تغيير السائق')}</button>}
              </div>
            </div>
            <div className="eco-field">
              <label className="eco-field-label">{t('Vehicle Category', 'فئة المركبة')}</label>
              <input className="eco-input" type="text" value={form.category} onChange={set('category')} />
            </div>
            <div className="eco-field">
              <label className="eco-field-label">{t('Vehicle Type', 'نوع المركبة')}</label>
              <input className="eco-input" type="text" value={form.vehicleType} onChange={set('vehicleType')} />
            </div>
            <div className="eco-field">
              <label className="eco-field-label">{t('Manufacturer', 'المصنع')}</label>
              <input
                className="eco-input"
                type="text"
                value={form.manufacturer}
                onChange={set('manufacturer')}
                placeholder={t('e.g. Toyota', 'مثال: تويوتا')}
              />
            </div>
            <div className="eco-field">
              <label className="eco-field-label">{t('Model', 'الطراز')}</label>
              <input
                className="eco-input"
                type="text"
                value={form.model}
                onChange={set('model')}
                placeholder={t('e.g. Coaster', 'مثال: كوستر')}
              />
            </div>
            <div className="eco-field">
              <label className="eco-field-label">{t('Model Year', 'سنة الصنع')}</label>
              <input className="eco-input" type="number" min="1900" max="2100" value={form.year} onChange={set('year')} />
            </div>
            <div className="eco-field">
              <label className="eco-field-label">{t('Passenger Capacity', 'سعة الركاب')}</label>
              <input className="eco-input" type="number" min="0" value={form.capacity} onChange={set('capacity')} />
            </div>
            <div className="eco-field eco-field-full">
              <label className="eco-field-label">{t('Operational Status', 'الحالة التشغيلية')}</label>
              <CustomSelect
                value={form.operationalStatus}
                onChange={set('operationalStatus')}
                options={[
                  { value: 'active', label: t('Active', 'نشطة') },
                  { value: 'maintenance', label: t('In Maintenance', 'قيد الصيانة') },
                  { value: 'out_of_service', label: t('Out of Service', 'خارج الخدمة') },
                  { value: 'retired', label: t('Retired', 'متقاعدة') },
                ]}
                ariaLabel={t('Operational Status', 'الحالة التشغيلية')}
              />
            </div>
            <div className="eco-field eco-field-full">
              <label className="eco-field-label">{t('Label', 'التسمية')}</label>
              <input
                className="eco-input"
                type="text"
                value={form.label}
                onChange={set('label')}
                placeholder={t('Display name for non-bus vehicles', 'اسم العرض للمركبات غير الحافلات')}
              />
            </div>
            <div className="eco-field eco-field-full">
              <label className="eco-field-label">{t('Notes', 'ملاحظات')}</label>
              <textarea
                className="eco-textarea"
                value={form.notes}
                onChange={set('notes')}
                placeholder={t('Internal notes...', 'ملاحظات داخلية...')}
              />
            </div>
          </div>

          {error && <div className="eco-modal-error">{error}</div>}
        </div>

        <div className="eco-modal-footer">
          <button className="eco-btn-cancel" onClick={onClose} disabled={saving}>
            {t('Cancel', 'إلغاء')}
          </button>
          <button className="eco-btn-save" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            <span>{saving ? t('Saving...', 'جارٍ الحفظ...') : t('Save Changes', 'حفظ التغييرات')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
