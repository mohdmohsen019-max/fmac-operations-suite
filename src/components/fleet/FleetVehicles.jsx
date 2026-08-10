import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Bus, Car, Search, RefreshCw, Pencil } from 'lucide-react';
import { cartrackService } from '../../services/cartrackService';
import { useFleetScope } from './FleetScopeContext';
import { useLanguage } from '../../contexts/LanguageContext';
import VehicleEditModal from './VehicleEditModal';
// Vision API — uncomment to re-enable live cameras:
// import LiveCameraModal from './LiveCameraModal';
import './FleetModule.css';
import './FleetEcosystem.css';

export default function FleetVehicles({ canEdit, isMasterAdmin, userProfile }) {
  const { t, locale } = useLanguage();
  const { scope, metaOf, metaMap } = useFleetScope();
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isMounted, setIsMounted] = useState(false);
  const [editingReg, setEditingReg] = useState(null);
  // Vision API — uncomment to re-enable live cameras:
  // const [cameraVehicle, setCameraVehicle] = useState(null);

  const fetchVehicles = useCallback(async () => {
    setLoading(true);
    try {
      const data = await cartrackService.getVehicles(scope);
      if (data) setVehicles(data);
    } catch (err) {
      console.error('Fleet fetch error:', err);
    }
    setLoading(false);
  }, [scope]);

  useEffect(() => {
    fetchVehicles();
    const timer = setTimeout(() => setIsMounted(true), 600);
    return () => clearTimeout(timer);
  }, [fetchVehicles]);

  /* Enhance rows with the live Firestore-backed metadata. Deriving from
     metaMap means an edit saved in the modal (or by anyone else) refreshes
     the row the moment the subscription delivers it. */
  const enhanced = useMemo(() => vehicles.map(v => {
    const meta = metaOf(v.registration);
    return {
      ...v,
      vehicleClass: meta.vehicleClass === 'bus' ? 'bus' : 'other',
      bus_number: meta.busNumber,
      driver_name: meta.driverName,
      manufacturer: meta.manufacturer,
      model: meta.model,
      label: meta.label,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [vehicles, metaMap]);

  const filteredVehicles = enhanced.filter(v => {
    const term = search.toLowerCase();
    return v.registration?.toLowerCase().includes(term) ||
      v.bus_number?.toString().toLowerCase().includes(term) ||
      v.driver_name?.toLowerCase().includes(term) ||
      v.label?.toLowerCase().includes(term);
  });

  const editingVehicle = editingReg ? metaOf(editingReg) : null;

  if (loading || !isMounted) {
    return (
      <div className="view-loading">
        <div className="app-loader"><span /><span /><span /><span /><span /></div>
      </div>
    );
  }

  return (
    <div className="vehicles-view">
      {/* Vision API — uncomment to re-enable live cameras:
      {cameraVehicle && (
        <LiveCameraModal vehicle={cameraVehicle} onClose={() => setCameraVehicle(null)} />
      )} */}
      {editingVehicle && (
        <VehicleEditModal
          vehicle={editingVehicle}
          onClose={() => setEditingReg(null)}
          onSaved={() => {}}
        />
      )}
      <div className="fleet-registry-header">
        <div className="fleet-search-wrapper">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            className="fleet-search-input"
            placeholder={t('Search by plate, driver, bus number or label...', 'البحث حسب اللوحة أو السائق أو رقم الحافلة أو التسمية...')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {canEdit && (
          <button className="btn-refresh" onClick={fetchVehicles}>
            <RefreshCw size={16} />
            <span>{t('Sync Registry', 'مزامنة السجل')}</span>
          </button>
        )}
      </div>

      <div className="glass-panel" style={{ padding: '0', overflow: 'hidden' }}>
        <div className="fleet-table-container" style={{ borderRadius: '0', border: 'none' }}>
          <table className="fleet-table">
            <thead>
              <tr>
                <th>{t('Registration', 'التسجيل')}</th>
                <th>{t('Class', 'التصنيف')}</th>
                <th>{t('Bus # / Label', 'رقم الحافلة / التسمية')}</th>
                <th>{t('Assigned Driver', 'السائق المعين')}</th>
                <th>{t('Make & Model', 'الصنع والطراز')}</th>
                <th>{t('Odometer', 'عداد المسافة')}</th>
                <th>{t('Operational Status', 'حالة التشغيل')}</th>
                {canEdit && <th>{t('Actions', 'إجراءات')}</th>}
              </tr>
            </thead>
            <tbody>
              {filteredVehicles.map((v) => {
                const isBus = v.vehicleClass === 'bus';
                return (
                  <tr key={v.registration}>
                    <td style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--theme-text-main)' }}>{v.registration}</td>
                    <td>
                      {isBus ? (
                        <span className="eco-class-badge eco-bus">
                          <Bus size={12} strokeWidth={2.2} />
                          {t('Bus', 'حافلة')}
                        </span>
                      ) : (
                        <span
                          className="eco-class-badge eco-other"
                          title={t('Not part of the bus fleet', 'ليست ضمن أسطول الحافلات')}
                        >
                          <Car size={12} strokeWidth={2.2} />
                          {t('Other Vehicle', 'مركبة أخرى')}
                        </span>
                      )}
                    </td>
                    <td style={{ fontWeight: 600 }}>
                      {isBus
                        ? (v.bus_number ? t(`Bus ${v.bus_number}`, `حافلة ${v.bus_number}`) : '—')
                        : (v.label || [v.manufacturer, v.model].filter(Boolean).join(' ') || '—')}
                    </td>
                    <td style={{ fontWeight: 600 }}>{v.driver_name || '—'}</td>
                    <td style={{ color: 'var(--theme-text-muted)' }}>{[v.manufacturer, v.model].filter(Boolean).join(' ') || '—'}</td>
                    <td style={{ fontFamily: 'JetBrains Mono', fontSize: '0.9rem' }}>
                      {v.odometer?.toLocaleString(locale)} <span style={{ fontSize: '0.7rem', color: 'var(--theme-text-ghost)' }}>{t('KM', 'كم')}</span>
                    </td>
                    <td>
                      <span className={`status-badge ${v.is_under_maintenance ? 'maintenance' : 'active'}`}>
                        {v.is_under_maintenance ? t('In Service', 'تحت الصيانة') : t('Operational', 'تشغيلي')}
                      </span>
                    </td>
                    {canEdit && (
                      <td>
                        <button className="eco-edit-btn" onClick={() => setEditingReg(v.registration)}>
                          <Pencil size={13} />
                          <span>{t('Edit', 'تعديل')}</span>
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
              {filteredVehicles.length === 0 && (
                <tr>
                  <td colSpan={canEdit ? 8 : 7} style={{ textAlign: 'center', padding: '28px', color: 'var(--theme-text-muted)' }}>
                    {t('No vehicles found in this scope.', 'لم يتم العثور على مركبات في هذا النطاق.')}
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
