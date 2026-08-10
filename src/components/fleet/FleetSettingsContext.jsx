import React, { createContext, useContext, useState, useCallback } from 'react';

const STORAGE_KEY = 'fmac_fleet_settings';

export const DEFAULT_SETTINGS = {
  // General
  currency: 'AED',
  measurementUnit: 'km',
  timezone: 'Asia/Dubai',

  // Risk Thresholds
  speedingLimit: 120,         // km/h — speeds above this penalize the risk score
  brakingSensitivity: 0.7,   // multiplier 0.5–2.0 on harsh-braking penalty weight
  enableRealTimeAlerts: true,

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
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    }
  } catch {
    // Corrupted storage — fall back to defaults
  }
  return { ...DEFAULT_SETTINGS };
}

const FleetSettingsContext = createContext(null);

export function FleetSettingsProvider({ children }) {
  const [settings, setSettings] = useState(loadSettings);

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
  }, []);

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
