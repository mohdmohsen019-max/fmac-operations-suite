import React, { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import { X, Maximize2, WifiOff, Video, RefreshCw } from 'lucide-react';
import { cartrackService } from '../../services/cartrackService';
import './LiveCameraModal.css';

function CameraTile({ camera, url }) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !url) {
      setStatus('error');
      return;
    }

    setStatus('loading');

    const cleanup = () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      video.src = '';
      video.oncanplay = null;
      video.onerror = null;
    };

    if (url.includes('.m3u8') && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true });
      hlsRef.current = hls;
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setStatus('live');
        video.play().catch(() => {});
      });
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) setStatus('error');
      });
    } else if (url.includes('.m3u8') && video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari native HLS
      video.src = url;
      video.oncanplay = () => {
        setStatus('live');
        video.play().catch(() => {});
      };
      video.onerror = () => setStatus('error');
    } else {
      video.src = url;
      video.oncanplay = () => {
        setStatus('live');
        video.play().catch(() => {});
      };
      video.onerror = () => setStatus('error');
    }

    return cleanup;
  }, [url]);

  const handleFullscreen = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.requestFullscreen) video.requestFullscreen();
    else if (video.webkitRequestFullscreen) video.webkitRequestFullscreen();
    else if (video.mozRequestFullScreen) video.mozRequestFullScreen();
  }, []);

  return (
    <div className="camera-tile">
      <div className="camera-label">CAM {camera}</div>
      <button className="camera-fullscreen-btn" onClick={handleFullscreen} title="Fullscreen">
        <Maximize2 size={13} />
      </button>

      {status === 'loading' && (
        <div className="camera-skeleton">
          <div className="skeleton-shimmer" />
          <span className="skeleton-text">CONNECTING...</span>
        </div>
      )}

      {status === 'error' && (
        <div className="camera-no-signal">
          <WifiOff size={28} />
          <span>No Signal</span>
        </div>
      )}

      <video
        ref={videoRef}
        muted
        playsInline
        className={`camera-video ${status === 'live' ? 'visible' : ''}`}
      />
    </div>
  );
}

export default function LiveCameraModal({ vehicle, onClose }) {
  const [cameras, setCameras] = useState([]);
  const [fetchStatus, setFetchStatus] = useState('loading');
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const fetchStreams = async () => {
      setFetchStatus('loading');
      setCameras([]);
      const result = await cartrackService.getLivestream(vehicle.registration);
      if (cancelled) return;

      if (result.error) {
        setFetchStatus(result.error);
      } else if (result.cameras.length === 0) {
        setFetchStatus('no_cameras');
      } else {
        setCameras(result.cameras);
        setFetchStatus('ready');
      }
    };

    fetchStreams();
    return () => { cancelled = true; };
  }, [vehicle.registration, retryKey]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const getGridClass = (count) => {
    if (count === 1) return 'cam-grid-1';
    if (count === 2) return 'cam-grid-2';
    if (count <= 4) return 'cam-grid-4';
    return 'cam-grid-8';
  };

  return (
    <div
      className="live-camera-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="live-camera-modal">
        {/* Header */}
        <div className="camera-modal-header">
          <div className="camera-modal-title">
            <div className="live-indicator">
              <span className="live-dot" />
              LIVE
            </div>
            <span className="modal-bus-label">Bus {vehicle.bus_number}</span>
            <span className="modal-plate">{vehicle.registration}</span>
            {vehicle.driver_name && (
              <span className="modal-driver">{vehicle.driver_name}</span>
            )}
          </div>
          <button className="camera-close-btn" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="camera-modal-body">
          {fetchStatus === 'loading' && (
            <div className="camera-fetch-state">
              <div className="cam-spinner" />
              <p>Fetching live streams...</p>
            </div>
          )}

          {fetchStatus === 'vision_disabled' && (
            <div className="camera-fetch-state">
              <Video size={48} className="fetch-icon" />
              <p>Live camera access is not enabled for this account.</p>
              <p className="fetch-sub">Contact Cartrack to enable Vision API.</p>
            </div>
          )}

          {fetchStatus === 'no_cameras' && (
            <div className="camera-fetch-state">
              <WifiOff size={48} className="fetch-icon" />
              <p>No cameras found for this vehicle.</p>
            </div>
          )}

          {fetchStatus === 'cors' && (
            <div className="camera-fetch-state">
              <WifiOff size={48} className="fetch-icon" />
              <p>Camera stream request was blocked (CORS).</p>
              <p className="fetch-sub">
                The Vision API requires server-side proxy access.<br />
                Contact your admin to configure a backend proxy for <code>fleetapi-au.cartrack.com</code>.
              </p>
            </div>
          )}

          {fetchStatus === 'generic' && (
            <div className="camera-fetch-state">
              <WifiOff size={48} className="fetch-icon" />
              <p>Unable to load camera streams.</p>
              <button className="cam-retry-btn" onClick={() => setRetryKey(k => k + 1)}>
                <RefreshCw size={14} /> Retry
              </button>
            </div>
          )}

          {fetchStatus === 'ready' && (
            <div className={`camera-grid ${getGridClass(cameras.length)}`}>
              {cameras.map(({ camera, url }) => (
                <CameraTile key={camera} camera={camera} url={url} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
