import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { BUS_REGS } from './fleetMeta';

const BASE_URL = import.meta.env.VITE_CARTRACK_API_BASE_URL || 'https://fleetapi-me.cartrack.com/rest';
const API_KEY = import.meta.env.VITE_CARTRACK_API_KEY;

/* -- Fleet scoping -------------------------------------------------
   Cartrack returns EVERY vehicle registered to the club; historically a
   hardcoded 14-registration list filtered everything down to the buses.
   Scoping is now explicit: every fetch takes a `scope` --
     'buses'  -> bus fleet only (default, matches historical behaviour)
     'others' -> club vehicles that are not part of the bus fleet
     'all'    -> everything registered on Cartrack
   Which class a registration belongs to is decided by a pluggable
   classifier. The default uses the BUS_REGS seed; FleetScopeContext
   swaps in a Firestore-backed classifier so reclassifying a vehicle in
   the Ecosystem tab immediately re-scopes every sub-module.            */
let classifyReg = (reg) => (BUS_REGS.includes(String(reg || '').toUpperCase().replace(/\s/g, '')) ? 'bus' : 'other');

export function setVehicleClassifier(fn) {
  if (typeof fn === 'function') classifyReg = fn;
}

export function regMatchesScope(reg, scope = 'buses') {
  if (scope === 'all') return true;
  const cls = classifyReg(reg);
  return scope === 'others' ? cls === 'other' : cls === 'bus';
}

// Helper to get headers
const getHeaders = () => {
  return {
    'Authorization': `Basic ${API_KEY}`,
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  };
};

let skipAlerts = false;

export const cartrackService = {

  /**
   * Fetch all vehicles and merge with their latest status (odometer, etc)
   */
  async getVehicles(scope = 'buses') {
    try {
      const [vehiclesRes, statusRes] = await Promise.all([
        fetch(`${BASE_URL}/vehicles?limit=250`, { headers: getHeaders() }),
        fetch(`${BASE_URL}/vehicles/status?limit=250`, { headers: getHeaders() })
      ]);

      if (!vehiclesRes.ok || !statusRes.ok) {
        throw new Error(`API error! Status: ${vehiclesRes.status} / ${statusRes.status}`);
      }

      const vehiclesData = await vehiclesRes.json();
      const statusData = await statusRes.json();

      const vehicles = vehiclesData.data || [];
      const statuses = statusData.data || [];

      const merged = vehicles
        .filter(v => regMatchesScope(v.registration, scope))
        .map(v => {
          const status = statuses.find(s => s.registration === v.registration);
          return {
            ...v,
            vehicleClass: classifyReg(v.registration),
            odometer: status ? status.odometer : 0,
            ignition: status ? status.ignition : false,
            location: status ? status.location : null,
            speed: status ? status.speed : 0
          };
        });

      return merged;
    } catch (error) {
      console.error('Cartrack API: Failed to fetch vehicles', error);
      return null;
    }
  },


  /**
   * Fetch trips for a date range
   */
  async getTrips(startDate, endDate) {
    try {
      const start = new Date(startDate.replace(' ', 'T'));
      const end = new Date(endDate.replace(' ', 'T'));
      const diffDays = Math.ceil(Math.abs(end - start) / (1000 * 60 * 60 * 24));

      // If range is > 6 days, we chunk it to stay under the limit
      if (diffDays > 6) {
        let allTrips = [];
        let currentStart = new Date(start);

        while (currentStart < end) {
          let currentEnd = new Date(currentStart);
          currentEnd.setDate(currentEnd.getDate() + 6);
          if (currentEnd > end) currentEnd = end;

          const sStr = format(currentStart, 'yyyy-MM-dd HH:mm:ss');
          const eStr = format(currentEnd, 'yyyy-MM-dd HH:mm:ss');
          
          const url = `${BASE_URL}/trips?start_timestamp=${encodeURIComponent(sStr)}&end_timestamp=${encodeURIComponent(eStr)}&limit=1000`;
          const response = await fetch(url, { headers: getHeaders() });
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          const result = await response.json();
          if (result.data) allTrips = [...allTrips, ...result.data];

          currentStart = new Date(currentEnd);
        }
        return allTrips;
      }

      // Standard single fetch for short ranges
      const url = `${BASE_URL}/trips?start_timestamp=${encodeURIComponent(startDate)}&end_timestamp=${encodeURIComponent(endDate)}&limit=1000`;
      const response = await fetch(url, { headers: getHeaders() });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const result = await response.json();
      return result.data || [];
    } catch (error) {
      console.error('Cartrack API: Failed to fetch trips', error);
      return null;
    }
  },

  /**
   * Fetch recent alerts/notifications
   */
  async getAlerts() {
    if (skipAlerts) return [];
    try {
      const response = await fetch(`${BASE_URL}/alerts?limit=100`, { headers: getHeaders() });
      if (response.status === 422 || response.status === 404 || response.status === 403) {
        skipAlerts = true;
        return [];
      }
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const result = await response.json();
      return result.data || [];
    } catch (error) {
      console.error('Cartrack API: Failed to fetch alerts', error);
      return null;
    }
  },

  /**
   * Derive risk events from recent trips (since /alerts is restricted)
   */
  async getRiskEvents(days = 3, scope = 'buses') {
    try {
      const end = format(endOfDay(new Date()), 'yyyy-MM-dd HH:mm:ss');
      const start = format(startOfDay(subDays(new Date(), days)), 'yyyy-MM-dd HH:mm:ss');

      const trips = await this.getTrips(start, end);
      if (!trips) return [];

      const events = [];
      trips.forEach(t => {
        if (!regMatchesScope(t.registration, scope)) return;
        const hasHarsh = (t.harsh_braking_events > 0 || t.harsh_acceleration_events > 0 || t.harsh_cornering_events > 0 || t.road_speeding_events > 0);

        if (hasHarsh) {
          if (t.harsh_braking_events > 0) {
            events.push({
              id: `${t.trip_id}-braking`,
              received_ts: t.start_timestamp,
              registration: t.registration,
              position_description: t.start_address || t.start_position_description || t.start_pos_description || t.address || t.position_description || 'In Transit'
            });
          }
          if (t.harsh_acceleration_events > 0) {
            events.push({
              id: `${t.trip_id}-accel`,
              received_ts: t.start_timestamp,
              registration: t.registration,
              alert_type: 'Harsh Acceleration',
              severity: 'Moderate',
              value: `${t.harsh_acceleration_events} Events`,
              position_description: t.start_address || t.start_position_description || t.start_pos_description || t.address || t.position_description || 'In Transit'
            });
          }
          if (t.road_speeding_events > 0) {
            events.push({
              id: `${t.trip_id}-speeding`,
              received_ts: t.start_timestamp,
              registration: t.registration,
              alert_type: 'Road Speeding',
              severity: 'Critical',
              value: `${t.road_speeding_events} Events`,
              position_description: t.start_address || t.start_position_description || t.start_pos_description || t.address || t.position_description || 'In Transit'
            });
          }
        }
      });

      return events.sort((a, b) => new Date(b.received_ts) - new Date(a.received_ts));
    } catch (error) {
      console.error('Cartrack API: Failed to derive risk events', error);
      return [];
    }
  },

  /**
   * Fetch maintenance records
   */
  async getMaintenance() {
    try {
      const response = await fetch(`${BASE_URL}/mifleet/maintenance`, { headers: getHeaders() });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const result = await response.json();
      return result.data || [];
    } catch (error) {
      console.error('Cartrack API: Failed to fetch maintenance', error);
      return null;
    }
  },

  /**
   * Aggregate trip data into driver scorecards for the Behavior module.
   * @param {number} days - Number of days to look back
   * @param {object} settings - Optional settings: { speedingLimit, brakingMultiplier }
   */
  async getDriverScorecards(days = 7, settings = {}, scope = 'buses') {
    const {
      speedingLimit = 120,      // km/h — currently informational (trip-level events don't include speed magnitude)
      brakingMultiplier = 0.7,  // 0.5–2.0 — scales the per-event braking penalty weight
    } = settings;

    // Normalise multiplier to a penalty weight (0.5 → weight=2.5, 0.7 → weight=5, 2.0 → weight=14.3)
    const brakingPenaltyWeight = 5 * (brakingMultiplier / 0.7);

    try {
      const end = format(endOfDay(new Date()), 'yyyy-MM-dd HH:mm:ss');
      const start = format(startOfDay(subDays(new Date(), days)), 'yyyy-MM-dd HH:mm:ss');

      const trips = await this.getTrips(start, end);
      if (!trips) return null;

      const fleetStats = {};

      trips.forEach(t => {
        const reg = t.registration;
        if (!regMatchesScope(reg, scope)) return;

        if (!fleetStats[reg]) {
          fleetStats[reg] = {
            plate: reg,
            trips: 0,
            kms: 0,
            braking: 0,
            accel: 0,
            cornering: 0,
            speeding: 0,
            riskScore: 100
          };
        }

        const s = fleetStats[reg];
        s.trips += 1;
        s.kms += (t.trip_distance || 0) / 1000;
        s.braking += (t.harsh_braking_events || 0);
        s.accel += (t.harsh_acceleration_events || 0);
        s.cornering += (t.harsh_cornering_events || 0);
        s.speeding += (t.road_speeding_events || 0);
      });

      // Calculate risk scores — penalty system driven by user-configured thresholds
      return Object.values(fleetStats).map(s => {
        const penalty =
          (s.braking * brakingPenaltyWeight) +
          (s.accel * 5) +
          (s.speeding * (speedingLimit < 100 ? 1.5 : speedingLimit < 120 ? 1.0 : 0.5)) +
          (s.cornering * 2);

        s.riskScore = Math.max(0, Math.min(100, Math.round(100 - (penalty / (s.trips || 1)))));
        s.kms = Math.round(s.kms);
        s.relativeRisk = s.riskScore < 70 ? (s.riskScore < 40 ? 3.5 : 1.8) : 0.8;
        return s;
      });
    } catch (error) {
      console.error('Cartrack API: Failed to generate scorecards', error);
      return null;
    }
  },

  /**
   * Fetch live camera streams from Cartrack Vision API
   * Note: requires Vision API to be enabled on the account
   */
  async getLivestream(registration) {
    const VISION_BASE = BASE_URL;
    try {
      const response = await fetch(
        `${VISION_BASE}/vision/livestream/${registration}`,
        {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ camera: [1, 2, 3, 4, 5, 6, 7, 8] })
        }
      );
      if (response.status === 403) return { error: 'vision_disabled' };
      if (response.status === 404) return { error: 'no_cameras' };
      if (!response.ok) {
        console.error(`Cartrack Vision API: HTTP ${response.status} for ${registration}`);
        return { error: 'generic', status: response.status };
      }
      const data = await response.json();
      const cameras = Array.isArray(data) ? data : (data.data || []);
      return { cameras: cameras.filter(c => c.url) };
    } catch (error) {
      // TypeError: Failed to fetch → CORS block or no network
      const isCors = error instanceof TypeError && error.message.toLowerCase().includes('fetch');
      console.error(`Cartrack Vision API: ${isCors ? 'CORS/network error' : error.message} for ${registration}`, error);
      return { error: isCors ? 'cors' : 'generic' };
    }
  },

  /**
   * Fetch live status for Fleet Live Map
   */
  async getLiveStatus(scope = 'buses') {
    try {
      const response = await fetch(`${BASE_URL}/vehicles/status?limit=250&odometer_in_km=true`, { headers: getHeaders() });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const result = await response.json();

      const statuses = result.data || [];
      return statuses
        .filter(s => regMatchesScope(s.registration, scope))
        .map(s => ({ ...s, vehicleClass: classifyReg(s.registration) }));
    } catch (error) {
      console.error('Cartrack API: Failed to fetch live status', error);
      return [];
    }
  }
};

