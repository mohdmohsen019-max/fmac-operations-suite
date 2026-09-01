import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Bus, Car, Search, RefreshCw, Pencil, Radio, RadioTower, Gauge, UserRound, Fuel, Wrench, ShieldCheck, FileBadge2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cartrackService } from '../../services/cartrackService';
import { mergeCanonicalVehicles } from '../../services/fleetIdentity';
import { useFleetScope } from './FleetScopeContext';
import { useLanguage } from '../../contexts/LanguageContext';
import VehicleEditModal from './VehicleEditModal';
import { OpsDetailGrid, OpsDrawer, OpsSignalStrip } from '../shared/OperationalUI';
// Vision API — uncomment to re-enable live cameras:
// import LiveCameraModal from './LiveCameraModal';
import './FleetModule.css';
import './FleetEcosystem.css';

export default function FleetVehicles({ canEdit, isMasterAdmin, userProfile }) {
  const navigate = useNavigate();
  const { t, locale } = useLanguage();
  const { scope, metaOf, metaMap, aliasMap } = useFleetScope();
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isMounted, setIsMounted] = useState(false);
  const [editingReg, setEditingReg] = useState(null);
  const [selectedReg, setSelectedReg] = useState(null);
  // Vision API — uncomment to re-enable live cameras:
  // const [cameraVehicle, setCameraVehicle] = useState(null);

  const fetchVehicles = useCallback(async () => {
    setLoading(true);
    try {
      const data = await cartrackService.getVehicles(scope);
      if (data) setVehicles(mergeCanonicalVehicles(data, aliasMap));
    } catch (err) {
      console.error('Fleet fetch error:', err);
    }
    setLoading(false);
  }, [scope, aliasMap]);

  useEffect(() => {
    fetchVehicles();
    const timer = setTimeout(() => setIsMounted(true), 600);
    return () => clearTimeout(timer);
  }, [fetchVehicles]);

  /* Enhance rows with the live Firestore-backed metadata. Deriving from
     metaMap means an edit saved in the modal (or by anyone else) refreshes
     the row the moment the subscription delivers it. */
  const enhanced = useMemo(() => {
    const rowsByRegistration = new Map(vehicles.map((vehicle) => [vehicle.registration, {
      ...vehicle,
      trackingStatus: 'tracked',
    }]))

    // A club vehicle remains part of Fleet even when it has no Cartrack unit.
    // Firestore supplies a neutral placeholder instead of a false zero row.
    metaMap.forEach((stored, key) => {
      const meta = metaOf(key)
      if (meta.clubOwned === false) return
      const isBus = meta.vehicleClass === 'bus'
      if (scope === 'buses' && !isBus) return
      if (scope === 'others' && isBus) return
      const registration = meta.canonicalRegistration || meta.plateNumber || meta.registration || key
      if (!rowsByRegistration.has(registration)) {
        rowsByRegistration.set(registration, {
          registration,
          canonicalRegistration: registration,
          odometer: null,
          is_under_maintenance: meta.operationalStatus === 'maintenance',
          trackingStatus: meta.trackingStatus || 'not_tracked',
        })
      }
    })

    return [...rowsByRegistration.values()].map((vehicle) => {
      const meta = metaOf(vehicle.registration)
      return {
        ...vehicle,
        vehicleClass: meta.vehicleClass === 'bus' ? 'bus' : 'other',
        bus_number: meta.busNumber,
        driver_name: meta.driverName,
        manufacturer: meta.manufacturer,
        model: meta.model,
        label: meta.label,
        plateNumber: meta.plateNumber || vehicle.registration,
        canonicalRegistration: meta.canonicalRegistration || meta.plateNumber || vehicle.registration,
        telemetryAliases: meta.telemetryAliases || [],
        // Keep the Operations identity/plate canonical while exposing the
        // actual Cartrack unit selected by the identity resolver. C37072 is
        // therefore displayed as C37072, but its telemetry is sourced from
        // C37072-CAM.
        cartrackRegistration: vehicle.trackingStatus === 'tracked'
          ? (vehicle.telemetrySourceRegistration || vehicle.registration)
          : '',
        cartrackId: meta.cartrackId || vehicle.cartrackId || '',
        category: meta.category,
        vehicleType: meta.vehicleType,
        internalIdentifier: meta.internalIdentifier,
        year: meta.year,
        capacity: meta.capacity,
        operationalStatus: meta.operationalStatus,
        notes: meta.notes,
        trackingStatus: vehicle.trackingStatus === 'tracked' ? 'tracked' : (meta.trackingStatus || 'not_tracked'),
        trackingNote: meta.trackingNote || '',
      }
    }).sort((a, b) => {
      if (a.vehicleClass !== b.vehicleClass) return a.vehicleClass === 'bus' ? -1 : 1
      if (a.vehicleClass === 'bus') return Number(a.bus_number || 999) - Number(b.bus_number || 999)
      return String(a.plateNumber || a.registration).localeCompare(String(b.plateNumber || b.registration))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicles, metaMap, scope]);

  const filteredVehicles = enhanced.filter(v => {
    const term = search.toLowerCase();
    return v.registration?.toLowerCase().includes(term) ||
      v.bus_number?.toString().toLowerCase().includes(term) ||
      v.driver_name?.toLowerCase().includes(term) ||
      v.label?.toLowerCase().includes(term);
  });

  const editingVehicle = editingReg
    ? enhanced.find((v) => v.registration === editingReg) || metaOf(editingReg)
    : null;
  const selectedVehicle = selectedReg
    ? enhanced.find((v) => v.registration === selectedReg) || null
    : null;

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
      <OpsDrawer
        open={Boolean(selectedVehicle)}
        onClose={() => setSelectedReg(null)}
        eyebrow={t('Fleet vehicle profile', 'ملف مركبة الأسطول')}
        title={selectedVehicle?.plateNumber || selectedVehicle?.registration || '—'}
        subtitle={selectedVehicle?.vehicleClass === 'bus'
          ? t(`Bus ${selectedVehicle?.bus_number || '—'} · ${selectedVehicle?.driver_name || 'No driver assigned'}`, `الحافلة ${selectedVehicle?.bus_number || '—'} · ${selectedVehicle?.driver_name || 'لا يوجد سائق معيّن'}`)
          : (selectedVehicle?.label || [selectedVehicle?.manufacturer, selectedVehicle?.model].filter(Boolean).join(' ') || t('Other vehicle', 'مركبة أخرى'))}
        footer={selectedVehicle && canEdit ? (
          <button className="eco-edit-btn" onClick={() => { setEditingReg(selectedVehicle.registration); setSelectedReg(null); }}>
            <Pencil size={14} />{t('Edit vehicle', 'تعديل المركبة')}
          </button>
        ) : null}
      >
        {selectedVehicle && (
          <div className="fleet-profile-drawer">
            <OpsSignalStrip
              tone={selectedVehicle.trackingStatus === 'tracked' ? 'healthy' : 'info'}
              eyebrow={t('Cartrack connection', 'اتصال Cartrack')}
              title={selectedVehicle.trackingStatus === 'tracked' ? t('Live telemetry linked', 'القياس المباشر مرتبط') : t('Not tracked', 'غير متتبعة')}
              detail={selectedVehicle.trackingStatus === 'tracked'
                ? t('Odometer and operational status are sourced from the linked unit.', 'يتم جلب العداد والحالة التشغيلية من الوحدة المرتبطة.')
                : t('This club vehicle remains in the register without showing false telemetry.', 'تبقى مركبة النادي في السجل دون عرض بيانات تتبع غير صحيحة.')}
            />
            <OpsDetailGrid items={[
              { label: t('Vehicle class', 'تصنيف المركبة'), value: selectedVehicle.vehicleClass === 'bus' ? t('Bus', 'حافلة') : t('Other vehicle', 'مركبة أخرى') },
              { label: t('Operational status', 'الحالة التشغيلية'), value: selectedVehicle.is_under_maintenance ? t('In service', 'تحت الصيانة') : t('Operational', 'تشغيلية') },
              { label: t('Current driver', 'السائق الحالي'), value: selectedVehicle.driver_name || '—' },
              { label: t('Make and model', 'الصنع والطراز'), value: [selectedVehicle.manufacturer, selectedVehicle.model].filter(Boolean).join(' ') || '—' },
              { label: t('Odometer', 'عداد المسافة'), value: selectedVehicle.trackingStatus === 'tracked' && Number.isFinite(Number(selectedVehicle.odometer)) ? `${Math.round(Number(selectedVehicle.odometer) / 1000).toLocaleString(locale)} ${t('km', 'كم')}` : t('Unavailable', 'غير متاح'), dir: 'ltr' },
              { label: t('Model year', 'سنة الصنع'), value: selectedVehicle.year || '—', dir: 'ltr' },
              { label: t('Capacity', 'السعة'), value: selectedVehicle.capacity ? `${selectedVehicle.capacity} ${t('seats', 'مقعداً')}` : '—' },
              { label: t('Cartrack unit', 'وحدة Cartrack'), value: selectedVehicle.cartrackId || selectedVehicle.cartrackRegistration || '—', dir: 'ltr' },
              { label: t('Telemetry aliases', 'أسماء القياس البديلة'), value: selectedVehicle.telemetryAliases?.length ? selectedVehicle.telemetryAliases.join(', ') : '—', dir: 'ltr', wide: true },
              { label: t('Notes', 'ملاحظات'), value: selectedVehicle.notes || selectedVehicle.trackingNote || '—', wide: true },
            ]} />
            <div className="fleet-profile-links" aria-label={t('Vehicle record areas', 'أقسام سجل المركبة')}>
              {[
                [Gauge, t('Telemetry', 'القياس')], [UserRound, t('Driver', 'السائق')],
                [Fuel, t('Fuel', 'الوقود')], [Wrench, t('Maintenance', 'الصيانة')],
                [ShieldCheck, t('Safety', 'السلامة')], [FileBadge2, t('Registration', 'التسجيل')],
              ].map(([Icon, label]) => <span key={label}><Icon size={14} />{label}</span>)}
            </div>
          </div>
        )}
      </OpsDrawer>
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
                  <tr key={v.registration} className={selectedReg === v.registration ? 'is-selected' : ''} onClick={() => setSelectedReg(v.registration)}>
                    <td style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--theme-text-main)' }}>
                      {v.plateNumber || v.registration}
                      {v.plateNumber && v.plateNumber !== v.registration && <div className="eco-source-id">Cartrack: {v.registration}</div>}
                    </td>
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
                      {v.trackingStatus === 'tracked' && Number.isFinite(Number(v.odometer))
                        ? <>{Math.round(Number(v.odometer) / 1000).toLocaleString(locale)} <span style={{ fontSize: '0.7rem', color: 'var(--theme-text-ghost)' }}>{t('KM', 'كم')}</span></>
                        : <span className="eco-no-telemetry"><Radio size={13} />{t('No Cartrack data', 'لا توجد بيانات Cartrack')}</span>}
                    </td>
                    <td>
                      {v.trackingStatus === 'not_tracked' ? (
                        <div className="eco-tracking-state">
                          <span className="status-badge untracked"><RadioTower size={12} />{t('Not tracked', 'غير متتبعة')}</span>
                          <small>{t('No Cartrack device linked', 'لا يوجد جهاز Cartrack مرتبط')}</small>
                        </div>
                      ) : (
                        <span className={`status-badge ${v.is_under_maintenance ? 'maintenance' : 'active'}`}>
                          {v.is_under_maintenance ? t('In Service', 'تحت الصيانة') : t('Operational', 'تشغيلي')}
                        </span>
                      )}
                    </td>
                    {canEdit && (
                      <td>
                        <div className="eco-row-actions">
                          {isBus && <button className="eco-driver-btn" onClick={(event) => { event.stopPropagation(); navigate(`/fleet/drivers?vehicle=${encodeURIComponent(v.registration)}`); }}><UserRound size={13} /><span>{t('Change driver', 'تغيير السائق')}</span></button>}
                          <button className="eco-edit-btn" onClick={(event) => { event.stopPropagation(); setEditingReg(v.registration); }}>
                            <Pencil size={13} />
                            <span>{t('Edit', 'تعديل')}</span>
                          </button>
                        </div>
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
