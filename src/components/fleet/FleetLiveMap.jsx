import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GoogleMap, useJsApiLoader, Marker, InfoWindow } from '@react-google-maps/api';
import { cartrackService } from '../../services/cartrackService';
import { useFleetScope } from './FleetScopeContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { Search, Map as MapIcon, AlertTriangle, Bus, Car } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import './FleetEcosystem.css';
// Vision API — uncomment to re-enable live cameras:
// import LiveCameraModal from './LiveCameraModal';
// import './LiveCameraModal.css';

const containerStyle = {
  width: '100%',
  height: '100%'
};

const center = {
  lat: 25.1288,
  lng: 56.3265
};

// Dark Navy Theme matching Logistics Hub
const mapStyles = [
  { elementType: 'geometry', stylers: [{ color: '#0B1021' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0B1021' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8888aa' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#c9a84c' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#8888aa' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#1a2235' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#6b7280' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1a2235' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#252f4a' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#8888aa' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#252f4a' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#323f5f' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#c9a84c' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#252f4a' }] },
  { featureType: 'transit.station', elementType: 'labels.text.fill', stylers: [{ color: '#c9a84c' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#050a18' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#4b5563' }] },
  { featureType: 'water', elementType: 'labels.text.stroke', stylers: [{ color: '#050a18' }] }
];

const getMarkerColor = (status) => {
  if (status.ignition && status.speed > 0) return '#10B981'; // Green
  if (status.ignition && status.speed === 0) return '#F59E0B'; // Yellow
  return '#EF4444'; // Red
};

const createMarkerIcon = (busNumber, color) => {
  const svg = `<svg width="36" height="36" xmlns="http://www.w3.org/2000/svg">
    <circle cx="18" cy="18" r="16" fill="${color}" stroke="#FFFFFF" stroke-width="2" />
    <text x="18" y="23" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="#FFFFFF" text-anchor="middle">${busNumber}</text>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};

/* Non-bus vehicles: amber rounded square with a car glyph, plus a small
   status dot carrying the moving/idling/parked colour. Visually distinct
   from the bus circles at a glance. */
const createOtherMarkerIcon = (statusColor) => {
  const svg = `<svg width="36" height="36" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="3" width="30" height="30" rx="9" fill="#F97316" stroke="#FFFFFF" stroke-width="2" />
    <path d="M12 19 L14.5 13.5 Q15 12.5 16 12.5 L20 12.5 Q21 12.5 21.5 13.5 L24 19 Z" fill="#FFFFFF" />
    <rect x="10" y="18.5" width="16" height="6" rx="2" fill="#FFFFFF" />
    <circle cx="13.5" cy="25" r="2.4" fill="#F97316" stroke="#FFFFFF" stroke-width="1.6" />
    <circle cx="22.5" cy="25" r="2.4" fill="#F97316" stroke="#FFFFFF" stroke-width="1.6" />
    <circle cx="29.5" cy="6.5" r="5" fill="${statusColor}" stroke="#FFFFFF" stroke-width="1.6" />
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};

export default function FleetLiveMap() {
  const { theme } = useTheme();
  const { t, locale, lang } = useLanguage();
  const { scope, metaOf, displayName } = useFleetScope();
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  });

  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  // Google calls window.gm_authFailure on hard key failures — swap the broken
  // map for a designed panel.
  const [mapAuthFailed, setMapAuthFailed] = useState(false);
  // BillingNotEnabledMapError keeps the map alive in "development purposes"
  // mode and injects a blocking dialog instead of firing gm_authFailure:
  // auto-dismiss that dialog and show a slim in-app notice.
  const [mapRestricted, setMapRestricted] = useState(false);

  useEffect(() => {
    window.gm_authFailure = () => setMapAuthFailed(true);
    const obs = new MutationObserver(() => {
      const btn = document.querySelector('.dismissButton');
      if (btn) {
        btn.click();
        setMapRestricted(true);
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    return () => {
      window.gm_authFailure = undefined;
      obs.disconnect();
    };
  }, []);
  // Vision API — uncomment to re-enable live cameras:
  // const [cameraVehicle, setCameraVehicle] = useState(null);

  const mapRef = useRef(null);
  const geocoderRef = useRef(null);

  const isLocationError = (desc) => !desc || /^location\s*error$/i.test(desc.trim());

  const reverseGeocode = useCallback((vehicle) => {
    if (!vehicle.location?.latitude || !window.google) return;
    if (!geocoderRef.current) geocoderRef.current = new window.google.maps.Geocoder();
    geocoderRef.current.geocode(
      { location: { lat: vehicle.location.latitude, lng: vehicle.location.longitude } },
      (results, status) => {
        if (status === 'OK' && results[0]) {
          setSelectedVehicle(prev =>
            prev?.registration === vehicle.registration
              ? { ...prev, location: { ...prev.location, position_description: results[0].formatted_address } }
              : prev
          );
        }
      }
    );
  }, []);

  const selectVehicle = useCallback((vehicle) => {
    setSelectedVehicle(vehicle);
    if (mapRef.current && vehicle.location) {
      mapRef.current.panTo({ lat: vehicle.location.latitude, lng: vehicle.location.longitude });
      mapRef.current.setZoom(15);
    }
    if (isLocationError(vehicle.location?.position_description)) {
      reverseGeocode(vehicle);
    }
  }, [reverseGeocode]);

  const fetchLiveStatus = useCallback(async () => {
    try {
      const data = await cartrackService.getLiveStatus(scope);
      if (data) {
        const enhanced = data.map(v => {
          const meta = metaOf(v.registration);
          const isBus = meta.vehicleClass === 'bus';
          return {
            ...v,
            vehicleClass: isBus ? 'bus' : 'other',
            bus_number: meta.busNumber || v.registration,
            display_name: displayName(v.registration, lang),
            driver_name: meta.driverName || t('Unknown Driver', 'سائق غير معروف'),
            color: getMarkerColor(v),
            statusText: v.ignition ? (v.speed > 0 ? t('Moving', 'متحرك') : t('Idling', 'خامل')) : t('Parked', 'متوقف')
          };
        });

        // Buses first sorted by bus number, then other vehicles by name
        enhanced.sort((a, b) => {
          if (a.vehicleClass !== b.vehicleClass) return a.vehicleClass === 'bus' ? -1 : 1;
          if (a.vehicleClass === 'bus') {
            const numA = parseInt(a.bus_number.toString().replace(/\D/g, '')) || 999;
            const numB = parseInt(b.bus_number.toString().replace(/\D/g, '')) || 999;
            return numA - numB;
          }
          return a.display_name.localeCompare(b.display_name);
        });

        setVehicles(enhanced);
        // Do not reset selectedVehicle on refresh to keep it highlighted
        setLastUpdated(new Date());
      }
    } catch (err) {
      console.error('Failed to fetch live status:', err);
    } finally {
      setLoading(false);
    }
  }, [t, lang, scope, metaOf, displayName]);

  useEffect(() => {
    fetchLiveStatus();
    const interval = setInterval(fetchLiveStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchLiveStatus]);

  const onLoad = useCallback(function callback(map) {
    mapRef.current = map;
  }, []);

  const onUnmount = useCallback(function callback(map) {
    mapRef.current = null;
  }, []);

  const handleBusClick = selectVehicle;

  const handleShowAll = () => {
    setSelectedVehicle(null);
    if (mapRef.current) {
      mapRef.current.panTo(center);
      mapRef.current.setZoom(11);
    }
  };

  const filteredVehicles = vehicles.filter(v => {
    const term = searchTerm.toLowerCase();
    return (v.bus_number && v.bus_number.toString().toLowerCase().includes(term)) ||
           (v.display_name && v.display_name.toLowerCase().includes(term)) ||
           (v.driver_name && v.driver_name.toLowerCase().includes(term)) ||
           (v.registration && v.registration.toLowerCase().includes(term));
  });

  // loadError / auth failure must NOT hang on the spinner — fall through so the
  // bus list renders alongside the designed map-unavailable panel.
  if ((!isLoaded && !loadError && !mapAuthFailed) || (loading && vehicles.length === 0)) {
    return (
      <div className="view-loading">
        <div className="app-loader"><span /><span /><span /><span /><span /></div>
      </div>
    );
  }

  const movingCount = vehicles.filter(v => v.statusText === t('Moving', 'متحرك')).length;
  const idlingCount = vehicles.filter(v => v.statusText === t('Idling', 'خامل')).length;
  const parkedCount = vehicles.filter(v => v.statusText === t('Parked', 'متوقف')).length;

  return (
    <div className="live-map-container">
      {/* Vision API — uncomment to re-enable live cameras:
      {cameraVehicle && (
        <LiveCameraModal vehicle={cameraVehicle} onClose={() => setCameraVehicle(null)} />
      )} */}
      <div className="live-map-stats-bar glass-panel" style={{ flexDirection: locale === 'ar-SA' ? 'row-reverse' : 'row' }}>
        <div className="stats-left" style={{ flexDirection: locale === 'ar-SA' ? 'row-reverse' : 'row', gap: '20px' }}>
          <span className="stat-item">{scope === 'buses' ? t('Total Buses:', 'إجمالي الحافلات:') : t('Total Vehicles:', 'إجمالي المركبات:')}&nbsp;<strong className="text-gold">{vehicles.length.toLocaleString(locale)}</strong></span>
          <span className="stat-item"><span className="dot green"></span> {t('Moving:', 'متحرك:')}&nbsp;<strong className="text-gold">{movingCount.toLocaleString(locale)}</strong></span>
          <span className="stat-item"><span className="dot yellow"></span> {t('Idling:', 'خامل:')}&nbsp;<strong className="text-gold">{idlingCount.toLocaleString(locale)}</strong></span>
          <span className="stat-item"><span className="dot red"></span> {t('Parked:', 'متوقف:')}&nbsp;<strong className="text-gold">{parkedCount.toLocaleString(locale)}</strong></span>
        </div>
        <div className="stats-right text-muted">
          {t('Last updated:', 'آخر تحديث:')} {lastUpdated ? new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(lastUpdated) : '--:--:--'}
        </div>
      </div>
      
      <div className="map-body-container" style={{ flexDirection: locale === 'ar-SA' ? 'row-reverse' : 'row' }}>
        {/* BUS SELECTOR PANEL */}
        <div className="bus-selector-panel">
          <div className="selector-header">
            <h3 className="selector-title">{scope === 'buses' ? t('Fleet Buses', 'أسطول الحافلات') : t('Fleet Vehicles', 'مركبات الأسطول')}</h3>
            <p className="selector-subtitle">{t('Select to locate', 'اختر لتحديد الموقع')}</p>
            <div className="selector-search-wrapper">
              <Search size={14} className="search-icon" style={{ [locale === 'ar-SA' ? 'right' : 'left']: '12px' }} />
              <input
                type="text"
                className="selector-search"
                placeholder={t('Search vehicles...', 'بحث عن مركبات...')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ [locale === 'ar-SA' ? 'paddingRight' : 'paddingLeft']: '36px', textAlign: locale === 'ar-SA' ? 'right' : 'left' }}
              />
            </div>
            <button className="btn-show-all" onClick={handleShowAll} style={{ flexDirection: locale === 'ar-SA' ? 'row-reverse' : 'row' }}>
              <MapIcon size={14} /> {t('Show All', 'عرض الكل')}
            </button>
          </div>
          
          <div className="bus-list">
            {filteredVehicles.map(v => {
              const hasSignal = v.location && v.location.latitude;
              const isSelected = selectedVehicle?.registration === v.registration;
              return (
                <div 
                  key={v.registration} 
                  className={`bus-list-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => handleBusClick(v)}
                  style={{ flexDirection: locale === 'ar-SA' ? 'row-reverse' : 'row' }}
                >
                  <div className="bus-item-left" style={{ flexDirection: locale === 'ar-SA' ? 'row-reverse' : 'row' }}>
                    <span className="bus-dot" style={{ background: hasSignal ? v.color : (theme === 'dark' ? '#4b5563' : '#9ca3af'), boxShadow: hasSignal && isSelected ? `0 0 8px ${v.color}` : 'none' }}></span>
                    <div className="bus-item-info" style={{ textAlign: locale === 'ar-SA' ? 'right' : 'left' }}>
                      <span className="bus-number">{v.display_name}</span>
                      <span className="bus-driver">{v.driver_name}</span>
                    </div>
                  </div>
                  <div className="bus-item-right">
                    {hasSignal ? (
                      <span className="bus-speed" style={{ color: v.color }}>
                        {v.speed > 0 ? `${v.speed} ${t('km/h', 'كم/س')}` : v.statusText}
                      </span>
                    ) : (
                      <span className="bus-speed no-signal">{t('No Signal', 'لا توجد إشارة')}</span>
                    )}
                  </div>
                </div>
              );
            })}
            {filteredVehicles.length === 0 && (
              <div className="bus-list-empty">{t('No vehicles found.', 'لم يتم العثور على مركبات.')}</div>
            )}
          </div>
        </div>

        {/* MAP PORTION */}
        <div className="map-wrapper">
        {mapRestricted && !mapAuthFailed && !loadError && (
          <div className="map-restricted-chip">
            <AlertTriangle size={12} strokeWidth={2.2} />
            {t('Maps in restricted mode — enable billing on the Google Cloud project of the API key.',
               'الخرائط في وضع مقيد — فعّل الفوترة في مشروع Google Cloud الخاص بمفتاح الواجهة.')}
          </div>
        )}
        {(mapAuthFailed || loadError) ? (
          <div className="map-fallback">
            <span className="map-fallback-icon"><MapIcon size={26} strokeWidth={1.5} /></span>
            <h3>{t('Live map unavailable', 'الخريطة المباشرة غير متاحة')}</h3>
            <p>
              {t(
                'Google Maps rejected the API key — billing is not enabled on its Google Cloud project. Vehicle telemetry is unaffected; use the bus list to track status.',
                'رفضت خرائط Google مفتاح الواجهة — الفوترة غير مفعّلة في مشروع Google Cloud. بيانات المركبات تعمل بشكل طبيعي؛ استخدم قائمة الحافلات لمتابعة الحالة.'
              )}
            </p>
            <code className="map-fallback-hint">console.cloud.google.com → Billing → Link a billing account</code>
          </div>
        ) : (
        <GoogleMap
          mapContainerStyle={containerStyle}
          center={center}
          zoom={11}
          onLoad={onLoad}
          onUnmount={onUnmount}
          options={{
            styles: theme === 'dark' ? mapStyles : [],
            disableDefaultUI: true,
            zoomControl: true,
            fullscreenControl: true
          }}
        >
          {vehicles.map(vehicle => {
            if (!vehicle.location || !vehicle.location.latitude) return null;

            return (
              <Marker
                key={vehicle.registration}
                position={{ lat: vehicle.location.latitude, lng: vehicle.location.longitude }}
                icon={{
                  url: vehicle.vehicleClass === 'bus'
                    ? createMarkerIcon(vehicle.bus_number, vehicle.color)
                    : createOtherMarkerIcon(vehicle.color),
                  anchor: new window.google.maps.Point(18, 18)
                }}
                title={vehicle.display_name}
                onClick={() => selectVehicle(vehicle)}
              />
            );
          })}

          {selectedVehicle && selectedVehicle.location && (
            <InfoWindow
              position={{ lat: selectedVehicle.location.latitude, lng: selectedVehicle.location.longitude }}
              onCloseClick={() => setSelectedVehicle(null)}
              options={{
                pixelOffset: new window.google.maps.Size(0, -20)
              }}
            >
              <div className="map-info-window" style={{ textAlign: locale === 'ar-SA' ? 'right' : 'left' }}>
                <div className="info-header">
                  <h3>{selectedVehicle.display_name}</h3>
                  <span className="info-plate">{selectedVehicle.registration}</span>
                </div>
                <div className="info-body">
                  <p><strong>{t('Driver:', 'السائق:')}</strong> {selectedVehicle.driver_name}</p>
                  <p><strong>{t('Speed:', 'السرعة:')}</strong> {selectedVehicle.speed} {t('km/h', 'كم/س')}</p>
                  <p>
                    <strong>{t('Status:', 'الحالة:')}</strong> 
                    <span style={{ color: selectedVehicle.color, marginLeft: '4px', marginRight: '4px', fontWeight: 'bold' }}>
                      {selectedVehicle.statusText}
                    </span>
                  </p>
                  <p><strong>{t('Location:', 'الموقع:')}</strong> {
                    isLocationError(selectedVehicle.location.position_description)
                      ? `${selectedVehicle.location.latitude.toFixed(5)}, ${selectedVehicle.location.longitude.toFixed(5)}`
                      : (selectedVehicle.location.position_description || t('Unknown', 'غير معروف'))
                  }</p>
                </div>
                <div className="info-footer">
                  {t('Updated:', 'تحديث:')} {selectedVehicle.location.timestamp ? new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(selectedVehicle.location.timestamp)) : new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(lastUpdated)}
                </div>
                {/* Vision API — uncomment to re-enable:
                <button className="watch-live-btn" onClick={() => setCameraVehicle(selectedVehicle)}>
                  <span className="watch-live-dot" /> Watch Live
                </button> */}
              </div>
            </InfoWindow>
          )}
        </GoogleMap>
        )}
        {!mapAuthFailed && !loadError && scope !== 'buses' && (
          <div className="eco-map-legend">
            <div className="eco-legend-row">
              <span className="eco-legend-marker eco-legend-bus"><Bus size={10} strokeWidth={2.4} /></span>
              {t('Bus fleet', 'أسطول الحافلات')}
            </div>
            <div className="eco-legend-row">
              <span className="eco-legend-marker eco-legend-other"><Car size={10} strokeWidth={2.4} /></span>
              {t('Other vehicles (not part of the bus fleet)', 'مركبات أخرى (ليست ضمن أسطول الحافلات)')}
            </div>
          </div>
        )}
      </div>
    </div>
    </div>
  );
}
