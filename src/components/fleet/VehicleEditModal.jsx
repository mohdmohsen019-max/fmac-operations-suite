import React, { useState } from 'react';
import { X, Save, Loader2 } from 'lucide-react';
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
  const { t, lang } = useLanguage();
  const [form, setForm] = useState({
    vehicleClass: vehicle?.vehicleClass === 'bus' ? 'bus' : 'other',
    busNumber: vehicle?.busNumber ?? '',
    driverName: vehicle?.driverName ?? '',
    manufacturer: vehicle?.manufacturer ?? '',
    model: vehicle?.model ?? '',
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
        driverName: form.driverName.trim(),
        manufacturer: form.manufacturer.trim(),
        model: form.model.trim(),
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
              <label className="eco-field-label">{t('Assigned Driver', 'السائق المعين')}</label>
              <input
                className="eco-input"
                type="text"
                value={form.driverName}
                onChange={set('driverName')}
                placeholder={t('Driver name', 'اسم السائق')}
              />
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
