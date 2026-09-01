import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../../firebase';

const STORAGE_KEY = 'fmac_fleet_settings';
const SCORE_CALIBRATION_VERSION = 3;

// Calibrated against FMAC's actual 12 Jul–10 Aug 2026 bus telemetry. The
// allowances sit near the lower-middle of observed rates, while weights keep
// normal urban operation healthy and preserve genuine outliers.
const CALIBRATED_SCORE_SETTINGS = {
  scoreCalibrationVersion: SCORE_CALIBRATION_VERSION,
  safetyScoreTarget: 90,
  speedingTimeThresholdPercent: 3,
  harshAccelerationThreshold: 5,
  harshBrakingThreshold: 6,
  harshCorneringThreshold: 25,
  speedingPenaltyWeight: 0.3,
  harshAccelerationPenaltyWeight: 0.12,
  harshBrakingPenaltyWeight: 0.15,
  harshCorneringPenaltyWeight: 0.03,
};

// eslint-disable-next-line react-refresh/only-export-components
export const DEFAULT_SETTINGS = {
  // General
  currency: 'AED',
  measurementUnit: 'km',
  timezone: 'Asia/Dubai',

  // Risk Thresholds
  speedingLimit: 120,         // km/h — speeds above this penalize the risk score
  brakingSensitivity: 0.7,   // multiplier 0.5–2.0 on harsh-braking penalty weight
  enableRealTimeAlerts: true,

  // Vehicle safety score thresholds and penalty weights
  ...CALIBRATED_SCORE_SETTINGS,

  // Notifications (stored as preferences)
  emailNotifications: true,
  smsAlerts: true,
  whatsappIntegration: false,

  // Sync metadata
  lastSyncedAt: null,
};

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const stored = JSON.parse(raw);
      const next = stored.scoreCalibrationVersion === SCORE_CALIBRATION_VERSION
        ? { ...DEFAULT_SETTINGS, ...stored }
        : { ...DEFAULT_SETTINGS, ...stored, ...CALIBRATED_SCORE_SETTINGS };
      if (stored.scoreCalibrationVersion !== SCORE_CALIBRATION_VERSION) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      }
      return next;
    }
  } catch {
    // Corrupted storage — fall back to defaults
  }
  return { ...DEFAULT_SETTINGS };
}

const FleetSettingsContext = createContext(null);

export function FleetSettingsProvider({ children }) {
  const [settings, setSettings] = useState(loadSettings);

  useEffect(() => onSnapshot(doc(db, 'fleet_kpi_settings', 'current'), (snapshot) => {
    if (!snapshot.exists()) return;
    const central = snapshot.data();
    const storedScoreSettings = central.scoreSettings || {};
    const centralCalibrationVersion = Number(
      central.scoreCalibrationVersion ?? storedScoreSettings.scoreCalibrationVersion ?? 0,
    );
    const scoreSettings = centralCalibrationVersion >= SCORE_CALIBRATION_VERSION
      ? storedScoreSettings
      : CALIBRATED_SCORE_SETTINGS;
    setSettings((previous) => ({
      ...previous,
      ...scoreSettings,
      safetyScoreTarget: Number(central.vehicleSafetyTarget ?? scoreSettings.safetyScoreTarget ?? previous.safetyScoreTarget),
    }));
  }, (error) => console.error('Central fleet score settings subscription failed:', error)), []);

  const updateSettings = useCallback((partial) => {
    setSettings(prev => ({ ...prev, ...partial }));
  }, []);

  const saveSettings = useCallback((partial) => {
    setSettings(prev => {
      const next = { ...prev, ...partial };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch { /* quota exceeded — silently ignore */ }
      return next;
    });
    const scoreKeys = Object.keys(CALIBRATED_SCORE_SETTINGS).filter((key) => key !== 'scoreCalibrationVersion');
    if (scoreKeys.some((key) => Object.hasOwn(partial, key))) {
      setDoc(doc(db, 'fleet_kpi_settings', 'current'), {
        vehicleSafetyTarget: Number(partial.safetyScoreTarget ?? settings.safetyScoreTarget),
        scoreCalibrationVersion: SCORE_CALIBRATION_VERSION,
        scoreSettings: {
          scoreCalibrationVersion: SCORE_CALIBRATION_VERSION,
          ...Object.fromEntries(scoreKeys.map((key) => [key, Number(partial[key] ?? settings[key])])),
        },
        updatedAt: serverTimestamp(), updatedBy: auth.currentUser?.email || '',
      }, { merge: true }).catch((error) => console.error('Central fleet score settings save failed:', error));
    }
  }, [settings]);

  const resetSettings = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch { /* ignore */ }
    setSettings({ ...DEFAULT_SETTINGS });
  }, []);

  return (
    <FleetSettingsContext.Provider value={{ settings, updateSettings, saveSettings, resetSettings }}>
      {children}
    </FleetSettingsContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useFleetSettings() {
  const ctx = useContext(FleetSettingsContext);
  if (!ctx) throw new Error('useFleetSettings must be used inside <FleetSettingsProvider>');
  return ctx;
}

/**
 * Converts a distance value between km and mi.
 * @param {number} valueInKm  – always pass the raw km value
 * @param {string} unit        – 'km' | 'mi'
 * @returns {number}
 */
// eslint-disable-next-line react-refresh/only-export-components
export function convertDistance(valueInKm, unit) {
  if (unit === 'mi') return Math.round(valueInKm * 0.621371 * 100) / 100;
  return valueInKm;
}

/**
 * Converts a monetary value from AED to target currency.
 * @param {number} valueInAED 
 * @param {string} targetCurrency 
 * @returns {number}
 */
// eslint-disable-next-line react-refresh/only-export-components
export function convertCurrency(valueInAED, targetCurrency) {
  if (!valueInAED) return 0;
  if (targetCurrency === 'USD') return Math.round((valueInAED / 3.6725) * 100) / 100;
  if (targetCurrency === 'EUR') return Math.round((valueInAED / 4.01) * 100) / 100;
  if (targetCurrency === 'GBP') return Math.round((valueInAED / 4.72) * 100) / 100;
  return Math.round(valueInAED * 100) / 100;
}
