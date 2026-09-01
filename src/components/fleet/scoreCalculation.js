export const SCORE_PERIOD_DAYS = 30;

export const SCORE_DEFAULTS = {
  safetyScoreTarget: 90,
  // Practical exposure-normalized allowances: sustained or repeated unsafe
  // behaviour is penalized without pretending routine urban driving is perfect.
  speedingTimeThresholdPercent: 3,
  harshAccelerationThreshold: 5,
  harshBrakingThreshold: 6,
  harshCorneringThreshold: 25,
  speedingPenaltyWeight: 0.3,
  harshAccelerationPenaltyWeight: 0.12,
  harshBrakingPenaltyWeight: 0.15,
  harshCorneringPenaltyWeight: 0.03,
};

export const scoreNumber = (value) => Number(value) || 0;

export function calculateTripMetrics(trips, scoreSettings = SCORE_DEFAULTS) {
  const distanceInKm = trips.reduce((sum, trip) => sum + scoreNumber(trip.trip_distance), 0) / 1000;
  const timeInSecond = trips.reduce((sum, trip) => sum + scoreNumber(trip.trip_duration_seconds), 0);
  const speedingSeconds = trips.reduce((sum, trip) => sum + scoreNumber(trip.road_speeding_duration_seconds), 0);
  const accelerationEvents = trips.reduce((sum, trip) => sum + scoreNumber(trip.harsh_acceleration_events), 0);
  const brakingEvents = trips.reduce((sum, trip) => sum + scoreNumber(trip.harsh_braking_events), 0);
  const corneringEvents = trips.reduce((sum, trip) => sum + scoreNumber(trip.harsh_cornering_events), 0);
  const harshEvents = accelerationEvents + brakingEvents + corneringEvents;
  const speedingPercent = timeInSecond > 0 ? (speedingSeconds / timeInSecond) * 100 : 0;
  const harshPerThousandKm = distanceInKm > 0 ? (harshEvents / distanceInKm) * 1000 : 0;
  const accelerationPerThousandKm = distanceInKm > 0 ? (accelerationEvents / distanceInKm) * 1000 : 0;
  const brakingPerThousandKm = distanceInKm > 0 ? (brakingEvents / distanceInKm) * 1000 : 0;
  const corneringPerThousandKm = distanceInKm > 0 ? (corneringEvents / distanceInKm) * 1000 : 0;
  const speedingExcess = Math.max(0, speedingPercent - scoreNumber(scoreSettings.speedingTimeThresholdPercent));
  const accelerationExcess = Math.max(0, accelerationPerThousandKm - scoreNumber(scoreSettings.harshAccelerationThreshold));
  const brakingExcess = Math.max(0, brakingPerThousandKm - scoreNumber(scoreSettings.harshBrakingThreshold));
  const corneringExcess = Math.max(0, corneringPerThousandKm - scoreNumber(scoreSettings.harshCorneringThreshold));
  const speedingPenalty = speedingExcess * scoreNumber(scoreSettings.speedingPenaltyWeight);
  const accelerationPenalty = accelerationExcess * scoreNumber(scoreSettings.harshAccelerationPenaltyWeight);
  const brakingPenalty = brakingExcess * scoreNumber(scoreSettings.harshBrakingPenaltyWeight);
  const corneringPenalty = corneringExcess * scoreNumber(scoreSettings.harshCorneringPenaltyWeight);
  const penalty = speedingPenalty + accelerationPenalty + brakingPenalty + corneringPenalty;
  const score = trips.length ? Math.max(0, Math.min(100, Math.round(100 - penalty))) : null;

  return {
    distanceInKm, timeInSecond, speedingSeconds, harshEvents, speedingPercent, harshPerThousandKm,
    accelerationEvents, brakingEvents, corneringEvents,
    accelerationPerThousandKm, brakingPerThousandKm, corneringPerThousandKm, penalty, score,
    speedingExcess, accelerationExcess, brakingExcess, corneringExcess,
    speedingPenalty, accelerationPenalty, brakingPenalty, corneringPenalty,
  };
}

export function scoreBand(score, target = SCORE_DEFAULTS.safetyScoreTarget) {
  if (score == null) return 'muted';
  if (score >= target) return 'good';
  if (score >= Math.max(60, target - 20)) return 'watch';
  return 'risk';
}
