/**
 * Wallboard live map — a display-only Google Map for the TV wallboard.
 * No controls, no interaction: it just plots the fleet's live positions on a
 * dark map that matches the wallboard. Fed by the same getLiveStatus() vehicles
 * the wallboard already polls, so it adds no extra Cartrack calls.
 *
 * Guards the same billing/auth failure the fleet map handles: on a hard key
 * failure it shows a dark fallback panel instead of a broken/gray map, and it
 * auto-dismisses Google's "development purposes" billing dialog.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GoogleMap, useJsApiLoader, Marker } from '@react-google-maps/api';
import { MapPinOff, Loader2 } from 'lucide-react';
import { getVehicleMeta } from '../services/fleetMapping';
import { useLanguage } from '../contexts/LanguageContext';

const CENTER = { lat: 25.1288, lng: 56.3265 }; // Fujairah
const containerStyle = { width: '100%', height: '100%' };

/* Dark navy map theme — matches the fleet live map + the wallboard. */
const mapStyles = [
  { elementType: 'geometry', stylers: [{ color: '#0B1021' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0B1021' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8888aa' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#d9b45c' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1a2235' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#252f4a' }] },
  { featureType: 'road', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#252f4a' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#323f5f' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#050a18' }] },
];

const markerColor = (v) => {
  if (v.ignition && v.speed > 0) return '#4ecf9a'; // moving
  if (v.ignition && v.speed === 0) return '#d9b45c'; // idling
  return '#e58a82'; // parked
};

const markerIcon = (label, color) => {
  const svg = `<svg width="30" height="30" xmlns="http://www.w3.org/2000/svg">
    <circle cx="15" cy="15" r="12" fill="${color}" stroke="#0a0a0a" stroke-width="2.5" />
    <text x="15" y="19.5" font-family="Arial, sans-serif" font-size="12" font-weight="700" fill="#0a0a0a" text-anchor="middle">${label}</text>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};

export default function WallboardMap({ vehicles }) {
  const { t } = useLanguage();
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
  });
  const [authFailed, setAuthFailed] = useState(false);
  const mapRef = useRef(null);

  useEffect(() => {
    window.gm_authFailure = () => setAuthFailed(true);
    // Billing-not-enabled injects a blocking dialog instead of firing
    // gm_authFailure — auto-dismiss it so it never sits on the wallboard.
    const obs = new MutationObserver(() => {
      const btn = document.querySelector('.dismissButton');
      if (btn) btn.click();
    });
    obs.observe(document.body, { childList: true, subtree: true });
    return () => { window.gm_authFailure = undefined; obs.disconnect(); };
  }, []);

  const onLoad = useCallback((map) => { mapRef.current = map; }, []);

  // Keep every bus in frame.
  useEffect(() => {
    if (!mapRef.current || !window.google || !vehicles?.length) return;
    const located = vehicles.filter(v => v.location?.latitude);
    if (!located.length) return;
    const bounds = new window.google.maps.LatLngBounds();
    located.forEach(v => bounds.extend({ lat: v.location.latitude, lng: v.location.longitude }));
    if (located.length === 1) {
      mapRef.current.setCenter(bounds.getCenter());
      mapRef.current.setZoom(14);
    } else {
      mapRef.current.fitBounds(bounds, 56);
    }
  }, [vehicles]);

  if (loadError || authFailed) {
    return (
      <div className="wb-map-fallback">
        <MapPinOff size={30} strokeWidth={1.6} />
        <span>{t('Live map unavailable', 'الخريطة المباشرة غير متاحة')}</span>
        <small>{t('Check the Google Maps billing / API key.', 'تحقق من فوترة خرائط Google أو مفتاح الواجهة.')}</small>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="wb-map-fallback">
        <Loader2 size={26} className="wb-map-spin" />
        <span>{t('Loading map…', 'جارٍ تحميل الخريطة…')}</span>
      </div>
    );
  }

  const located = (vehicles || []).filter(v => v.location?.latitude);

  return (
    <GoogleMap
      mapContainerStyle={containerStyle}
      center={CENTER}
      zoom={11}
      onLoad={onLoad}
      options={{
        styles: mapStyles,
        disableDefaultUI: true,
        gestureHandling: 'none',
        keyboardShortcuts: false,
        backgroundColor: '#0B1021',
        clickableIcons: false,
      }}
    >
      {located.map(v => {
        const meta = getVehicleMeta(v.registration);
        const label = String(meta.busNumber || v.registration || '?');
        return (
          <Marker
            key={v.registration}
            position={{ lat: v.location.latitude, lng: v.location.longitude }}
            icon={{
              url: markerIcon(label, markerColor(v)),
              scaledSize: new window.google.maps.Size(30, 30),
              anchor: new window.google.maps.Point(15, 15),
            }}
          />
        );
      })}
    </GoogleMap>
  );
}
