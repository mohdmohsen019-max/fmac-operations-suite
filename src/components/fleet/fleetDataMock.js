// Realistic Dummy Data for FMAC Fleet Management Module

const mockTimestamp = (daysAgo = 0) => {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return {
    toDate: () => date,
    seconds: Math.floor(date.getTime() / 1000),
    nanoseconds: 0,
    toISOString: () => date.toISOString(),
  };
};

export const DUMMY_VEHICLES = [
  { id: 'v1', plateNumber: 'M99270', makeAndModel: 'Toyota Coaster', busNumber: '101', type: 'Bus', currentOdometer: 238974, status: 'Active', lastDrivenBy: 'Ahmed Ali' },
  { id: 'v2', plateNumber: 'M85756', makeAndModel: 'Toyota Coaster', busNumber: '102', type: 'Bus', currentOdometer: 227856, status: 'Active', lastDrivenBy: 'Saeed Khan' },
  { id: 'v3', plateNumber: 'C37074', makeAndModel: 'Toyota Coaster', busNumber: '103', type: 'Bus', currentOdometer: 282261, status: 'In Maintenance', lastDrivenBy: 'Mohamed Hassan' },
  { id: 'v4', plateNumber: 'C29769', makeAndModel: 'Toyota Coaster', busNumber: '104', type: 'Bus', currentOdometer: 282436, status: 'Active', lastDrivenBy: 'John Doe' },
  { id: 'v5', plateNumber: 'M85751', makeAndModel: 'Toyota Hiace', busNumber: '201', type: 'Van', currentOdometer: 162679, status: 'Out of Service', lastDrivenBy: 'Yusuf Idris' },
  { id: 'v6', plateNumber: 'D44210', makeAndModel: 'Nissan Urvan', busNumber: '202', type: 'Van', currentOdometer: 145200, status: 'Active', lastDrivenBy: 'Ahmed Ali' },
];

export const DUMMY_TRIPS = Array.from({ length: 25 }).map((_, i) => {
  const distance = 45 + (i % 7) * 12;
  const startOdo = 120500 + (i * 120);
  return {
    id: `t-${i}`,
    vehicleId: `v${(i % 6) + 1}`,
    driverId: `d${(i % 5) + 1}`,
    driverName: ['Ahmed Ali', 'Saeed Khan', 'Mohamed Hassan', 'John Doe', 'Yusuf Idris'][i % 5],
    date: mockTimestamp(i % 10),
    tripType: i % 4 === 0 ? 'External' : 'Internal',
    startOdometer: startOdo,
    endOdometer: startOdo + distance,
    distance: distance,
    notes: i % 12 === 0 ? 'Route optimization test' : '',
    createdAt: mockTimestamp(i % 10),
  };
});

export const DUMMY_USERS = [
  { uid: 'u1', displayName: 'Admin User', email: 'admin@fmac.ae', role: 'admin', status: 'Active' },
  { uid: 'u2', displayName: 'Ahmed Ali', email: 'ahmed@fmac.ae', role: 'driver', status: 'Active' },
  { uid: 'u3', displayName: 'Saeed Khan', email: 'saeed@fmac.ae', role: 'driver', status: 'Active' },
  { uid: 'u4', displayName: 'Mohamed Hassan', email: 'mohamed@fmac.ae', role: 'driver', status: 'Pending' },
  { uid: 'u5', displayName: 'Fleet Manager', email: 'manager@fmac.ae', role: 'admin', status: 'Active' },
];

export const DUMMY_MAINTENANCE = [
  { id: 'm1', vehicleId: 'v3', description: 'Full Engine Service & Oil Change', cost: 1250, date: mockTimestamp(2), recordedBy: 'u1' },
  { id: 'm2', vehicleId: 'v5', description: 'Brake Pad Replacement', cost: 850, date: mockTimestamp(5), recordedBy: 'u1' },
  { id: 'm3', vehicleId: 'v1', description: 'Tire Rotation', cost: 300, date: mockTimestamp(10), recordedBy: 'u5' },
  { id: 'm4', vehicleId: 'v2', description: 'Routine Inspection', cost: 150, date: mockTimestamp(15), recordedBy: 'u1' },
  { id: 'm5', vehicleId: 'v4', description: 'AC Repair', cost: 1200, date: mockTimestamp(20), recordedBy: 'u5' },
  { id: 'm6', vehicleId: 'v6', description: 'Battery Replacement', cost: 450, date: mockTimestamp(25), recordedBy: 'u1' },
  { id: 'm7', vehicleId: 'v3', description: 'Suspension Check', cost: 600, date: mockTimestamp(30), recordedBy: 'u5' },
  { id: 'm8', vehicleId: 'v1', description: 'Wiper Blade Replacement', cost: 100, date: mockTimestamp(35), recordedBy: 'u1' },
];

export const DUMMY_SCORECARDS = DUMMY_VEHICLES.map((v, i) => ({
  plate: v.plateNumber,
  vehicleName: v.makeAndModel,
  busId: v.busNumber,
  trips: 40 + i * 5,
  kms: 1200 + i * 200,
  braking: 2 + i,
  acceleration: 1 + i,
  cornering: i,
  speedingIndex: 2.5 - i * 0.3,
  idleRatio: 0.15 - i * 0.02,
  riskScore: 85 - i * 10,
  riskLevel: i === 0 ? 'high' : (i < 3 ? 'medium' : 'low'),
  relativeRisk: 1.5 - i * 0.2,
  alertsPerKm: (0.5 - i * 0.05).toFixed(3),
}));

export const DUMMY_VIOLATIONS = Array.from({ length: 10 }).map((_, i) => ({
  id: `v-${i}`,
  plate: DUMMY_VEHICLES[i % 6].plateNumber,
  type: i % 3 === 0 ? 'Harsh Braking' : (i % 3 === 1 ? 'Speeding' : 'Idle Violation'),
  severity: i % 4 === 0 ? 'Critical' : (i % 4 === 1 ? 'High' : 'Moderate'),
  timestamp: mockTimestamp(i),
  location: 'Sheikh Zayed Rd, Dubai',
  value: i % 3 === 1 ? `${100 + i * 5} km/h` : '-',
}));

export const DUMMY_STATEMENTS = [
  { id: 's1', month: 'April 2026', type: 'Operational Summary', date: mockTimestamp(5) },
  { id: 's2', month: 'March 2026', type: 'Maintenance Report', date: mockTimestamp(35) },
  { id: 's3', month: 'February 2026', type: 'Fleet Utilization', date: mockTimestamp(65) },
];
