import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GoogleMap, useJsApiLoader, Marker, InfoWindow } from '@react-google-maps/api';
import { cartrackService } from '../../services/cartrackService';
import { getVehicleMeta } from '../../services/fleetMapping';
import { useLanguage } from '../../contexts/LanguageContext';
import { Loader2, Search, Map as MapIcon } from 'lucide-react';
import { format } from 'date-fns';
import { useTheme } from '../../contexts/ThemeContext';
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
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#D4AF37' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#8888aa' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#1a2235' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#6b7280' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1a2235' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#252f4a' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#8888aa' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#252f4a' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#323f5f' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#D4AF37' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#252f4a' }] },
  { featureType: 'transit.station', elementType: 'labels.text.fill', stylers: [{ color: '#D4AF37' }] },
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

export default function FleetLiveMap() {
  const { theme } = useTheme();
  const { t, locale } = useLanguage();
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  });

  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  // Vision API — uncomment to re-enable live cameras:
  // const [cameraVehicle, setCameraVehicle] = useState(null);

  const mapRef = useRef(null);

  const fetchLiveStatus = useCallback(async () => {
    try {
      const data = await cartrackService.getLiveStatus();
      if (data) {
        const enhanced = data.map(v => {
          const meta = getVehicleMeta(v.registration);
          return {
            ...v,
            bus_number: meta.busNumber || v.registration,
            driver_name: meta.driverName || t('Unknown Driver', 'سائق غير معروف'),
            color: getMarkerColor(v),
            statusText: v.ignition ? (v.speed > 0 ? t('Moving', 'متحرك') : t('Idling', 'خامل')) : t('Parked', 'متوقف')
          };
        });
        
        // Sort by bus number naturally
        enhanced.sort((a, b) => {
          const numA = parseInt(a.bus_number.toString().replace(/\D/g, '')) || 999;
          const numB = parseInt(b.bus_number.toString().replace(/\D/g, '')) || 999;
          return numA - numB;
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
  }, [t]);

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

  const handleBusClick = (vehicle) => {
    setSelectedVehicle(vehicle);
    if (mapRef.current && vehicle.location) {
      mapRef.current.panTo({ lat: vehicle.location.latitude, lng: vehicle.location.longitude });
      mapRef.current.setZoom(15);
    }
  };

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
           (v.driver_name && v.driver_name.toLowerCase().includes(term)) ||
           (v.registration && v.registration.toLowerCase().includes(term));
  });

  if (!isLoaded || (loading && vehicles.length === 0)) {
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
          <span className="stat-item">{t('Total Buses:', 'إجمالي الحافلات:')}&nbsp;<strong className="text-gold">{vehicles.length.toLocaleString(locale)}</strong></span>
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
            <h3 className="selector-title">{t('Fleet Buses', 'أسطول الحافلات')}</h3>
            <p className="selector-subtitle">{t('Select to locate', 'اختر لتحديد الموقع')}</p>
            <div className="selector-search-wrapper">
              <Search size={14} className="search-icon" style={{ [locale === 'ar-SA' ? 'right' : 'left']: '12px' }} />
              <input 
                type="text" 
                className="selector-search" 
                placeholder={t('Search buses...', 'بحث عن حافلات...')}
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
                      <span className="bus-number">{t(`Bus ${v.bus_number}`, `حافلة ${v.bus_number}`)}</span>
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
              <div className="bus-list-empty">{t('No buses found.', 'لم يتم العثور على حافلات.')}</div>
            )}
          </div>
        </div>

        {/* MAP PORTION */}
        <div className="map-wrapper">
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
                  url: createMarkerIcon(vehicle.bus_number, vehicle.color),
                  anchor: new window.google.maps.Point(18, 18)
                }}
                onClick={() => setSelectedVehicle(vehicle)}
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
                  <h3>{t(`Bus ${selectedVehicle.bus_number}`, `حافلة ${selectedVehicle.bus_number}`)}</h3>
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
                  <p><strong>{t('Location:', 'الموقع:')}</strong> {selectedVehicle.location.position_description || t('Unknown', 'غير معروف')}</p>
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
      </div>
    </div>
    </div>
  );
}
