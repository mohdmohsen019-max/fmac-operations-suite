/**
 * Internal FMAC Fleet Mapping
 * Maps Cartrack Registration Numbers to internal Bus Numbers, Drivers, and Metadata.
 */
export const FLEET_MAPPING = {
  'C37069': { busNumber: '5', driverName: 'Fouad', manufacturer: 'Toyota', model: 'Hi-Ace' },
  'M99270': { busNumber: '11', driverName: 'Tafeel Khan', manufacturer: 'Toyota', model: 'Coaster' },
  'C29769': { busNumber: '14', driverName: 'Ziaullah', manufacturer: 'Toyota', model: 'Coaster' },
  'C37072': { busNumber: '10', driverName: 'Uzair', manufacturer: 'Toyota', model: 'Coaster' },
  'C37075': { busNumber: '7', driverName: 'Kashif', manufacturer: 'Toyota', model: 'Coaster' },
  'A33876': { busNumber: '9', driverName: 'Abdulnawaz', manufacturer: 'Toyota', model: 'Coaster' },
  'C37074': { busNumber: '12', driverName: 'Shah Fahad', manufacturer: 'Toyota', model: 'Coaster' },
  'A21248': { busNumber: '6', driverName: 'Manzoor', manufacturer: 'Toyota', model: 'Coaster' },
  'A33867': { busNumber: '8', driverName: 'Abdulmalik', manufacturer: 'Toyota', model: 'Coaster' },
  'M85759': { busNumber: '3', driverName: 'Jamshid', manufacturer: 'Toyota', model: 'Coaster' },
  'M85751': { busNumber: '2', driverName: 'Saif Al Rahman', manufacturer: 'Toyota', model: 'Coaster' },
  'M85756': { busNumber: '13', driverName: 'Mohamed Noor', manufacturer: 'Toyota', model: 'Coaster' },
  'M85750': { busNumber: '1', driverName: 'Zahid', manufacturer: 'Toyota', model: 'Coaster' },
  'M99268': { busNumber: '4', driverName: 'Mohamed Khalifa', manufacturer: 'Toyota', model: 'Coaster' }
};

const normalizeRegistration = (registration) =>
  String(registration || '').toUpperCase().replace(/\s/g, '');

/**
 * Resolve historical records that contain only the numeric portion of a bus
 * plate (for example `85750`) to the known full registration (`M85750`).
 * A suffix is accepted only when it identifies exactly one bus.
 */
export const resolveKnownBusRegistration = (registration) => {
  const raw = normalizeRegistration(registration);
  const reg = raw.endsWith('-CAM') ? raw.slice(0, -4) : raw;
  if (FLEET_MAPPING[reg]) return reg;
  if (!/^\d+$/.test(reg)) return reg;

  const matches = Object.keys(FLEET_MAPPING).filter((knownReg) =>
    knownReg.replace(/^\D+/, '') === reg
  );
  return matches.length === 1 ? matches[0] : reg;
};

/** True only for registrations in the confirmed FMAC bus registry. */
export const isKnownBusRegistration = (registration) =>
  Boolean(FLEET_MAPPING[resolveKnownBusRegistration(registration)]);

export const getVehicleMeta = (registration) => {
  const reg = resolveKnownBusRegistration(registration);
  return FLEET_MAPPING[reg] || { 
    busNumber: '--', 
    driverName: 'Unassigned', 
    manufacturer: 'Unknown', 
    model: 'Vehicle' 
  };
};
