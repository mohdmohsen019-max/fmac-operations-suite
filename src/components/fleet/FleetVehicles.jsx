import React, { useState, useEffect } from 'react';
import { Truck, Search, RefreshCw, Filter, ChevronRight, Activity, MapPin, Loader2 } from 'lucide-react';
import { cartrackService } from '../../services/cartrackService';
import { getVehicleMeta } from '../../services/fleetMapping';
import { useLanguage } from '../../contexts/LanguageContext';
// Vision API — uncomment to re-enable live cameras:
// import LiveCameraModal from './LiveCameraModal';
import './FleetModule.css';

export default function FleetVehicles({ canEdit, isMasterAdmin, userProfile }) {
  const { t, locale } = useLanguage();
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isMounted, setIsMounted] = useState(false);
  // Vision API — uncomment to re-enable live cameras:
  // const [cameraVehicle, setCameraVehicle] = useState(null);

  useEffect(() => {
    fetchVehicles();
    const timer = setTimeout(() => setIsMounted(true), 600);
    return () => clearTimeout(timer);
  }, []);

  const fetchVehicles = async () => {
    setLoading(true);
    try {
      const data = await cartrackService.getVehicles();
      if (data) {
        // Enhance with internal mapping
        const enhanced = data.map(v => {
          const meta = getVehicleMeta(v.registration);
          return {
            ...v,
            bus_number: meta.busNumber,
            driver_name: meta.driverName,
            manufacturer: meta.manufacturer,
            model: meta.model
          };
        });
        setVehicles(enhanced);
      }
    } catch (err) {
      console.error('Fleet fetch error:', err);
    }
    setLoading(false);
  };

  const filteredVehicles = vehicles.filter(v => 
    v.registration?.toLowerCase().includes(search.toLowerCase()) ||
    v.bus_number?.toString().includes(search) ||
    v.driver_name?.toLowerCase().includes(search.toLowerCase())
  );

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
      <div className="fleet-registry-header">
        <div className="fleet-search-wrapper">
          <Search size={18} className="search-icon" />
          <input 
            type="text" 
            className="fleet-search-input" 
            placeholder={t('Search by plate, driver or bus number...', 'البحث حسب اللوحة أو السائق أو رقم الحافلة...')}
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
                <th>{t('Bus #', 'رقم الحافلة #')}</th>
                <th>{t('Assigned Driver', 'السائق المعين')}</th>
                <th>{t('Manufacturer', 'المصنع')}</th>
                <th>{t('Odometer', 'عداد المسافة')}</th>
                <th>{t('Operational Status', 'حالة التشغيل')}</th>
                {/* Vision API — uncomment to re-enable: <th>Live Camera</th> */}
              </tr>
            </thead>
            <tbody>
              {filteredVehicles.map((v) => (
                <tr key={v.registration}>
                  <td style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--theme-text-main)' }}>{v.registration}</td>
                  <td style={{ fontWeight: 600 }}>{t(`Bus ${v.bus_number}`, `حافلة ${v.bus_number}`)}</td>
                  <td style={{ fontWeight: 600 }}>{v.driver_name}</td>
                  <td style={{ color: 'var(--theme-text-muted)' }}>{v.manufacturer} {v.model}</td>
                  <td style={{ fontFamily: 'JetBrains Mono', fontSize: '0.9rem' }}>
                    {v.odometer?.toLocaleString(locale)} <span style={{ fontSize: '0.7rem', color: 'var(--theme-text-ghost)' }}>{t('KM', 'كم')}</span>
                  </td>
                  <td>
                    <span className={`status-badge ${v.is_under_maintenance ? 'maintenance' : 'active'}`}>
                      {v.is_under_maintenance ? t('In Service', 'تحت الصيانة') : t('Operational', 'تشغيلي')}
                    </span>
                  </td>
                  {/* Vision API — uncomment to re-enable:
                  <td onClick={(e) => { e.stopPropagation(); setCameraVehicle(v); }}>
                    <button className="watch-live-row-btn" title="Watch Live Cameras">
                      <Video size={13} /> Watch Live
                    </button>
                  </td> */}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
