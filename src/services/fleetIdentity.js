import { resolveKnownBusRegistration } from './fleetMapping.js'

export const normalizeFleetRegistration = (registration) =>
  String(registration || '').toUpperCase().replace(/\s+/g, '')

// Some physical vehicles have more than one Cartrack device row. These
// bindings select the single authoritative telemetry source while the
// Operations UI continues to use the canonical plate as its identity.
const DEFAULT_PREFERRED_TELEMETRY_SOURCES = new Map([
  ['C37072', 'C37072-CAM'],
])

// Cartrack exposes A33867's terminal counter as 451,557 km while the verified
// physical odometer is 467,720 km. Keep the 16,163 km calibration centralized
// so every consumer (Fleet, Maintenance, Oil Change, dashboards and reports)
// receives one continuously advancing corrected reading.
const DEFAULT_ODOMETER_OFFSETS_KM = new Map([
  ['A33867', 16163],
  ['M85756', -125520],
])

/**
 * One physical vehicle can be exposed by Cartrack under a parent registration
 * and one or more telemetry devices (for example C37072 and C37072-CAM).
 * Everything downstream must use the physical registration as its identity.
 */
export function canonicalFleetRegistration(registration, aliases = null) {
  const raw = normalizeFleetRegistration(registration)
  if (!raw) return ''

  if (aliases?.get) {
    const configured = normalizeFleetRegistration(aliases.get(raw))
    if (configured) return resolveKnownBusRegistration(configured)
  }

  const withoutCamera = raw.endsWith('-CAM') ? raw.slice(0, -4) : raw
  return resolveKnownBusRegistration(withoutCamera)
}

export function buildFleetAliasMap(metaMap) {
  const aliases = new Map()
  const preferredSources = new Map(DEFAULT_PREFERRED_TELEMETRY_SOURCES)
  const odometerOffsetsKm = new Map(DEFAULT_ODOMETER_OFFSETS_KM)
  metaMap?.forEach?.((meta, key) => {
    const canonical = canonicalFleetRegistration(
      meta.canonicalRegistration || meta.plateNumber || key,
    )
    const registrations = [
      key,
      meta.registration,
      meta.cartrackRegistration,
      ...(Array.isArray(meta.telemetryAliases) ? meta.telemetryAliases : []),
    ]
    registrations.forEach((registration) => {
      const alias = normalizeFleetRegistration(registration)
      if (alias && canonical) aliases.set(alias, canonical)
    })

    const preferredSource = normalizeFleetRegistration(
      meta.preferredTelemetryRegistration || meta.telemetrySource,
    )
    if (preferredSource && canonical) preferredSources.set(canonical, preferredSource)

    // Cartrack's Fleet API exposes the raw terminal counter even after a
    // manual odometer correction is saved in Cartrack's web UI. Preserve the
    // correction as an offset so the corrected reading continues to advance
    // with new terminal telemetry instead of becoming a frozen manual value.
    const configuredOffsetKm = Number(meta.odometerOffsetKm)
    if (Number.isFinite(configuredOffsetKm) && configuredOffsetKm !== 0 && canonical) {
      odometerOffsetsKm.set(canonical, configuredOffsetKm)
    }
  })
  Object.defineProperty(aliases, 'preferredSources', { value: preferredSources })
  Object.defineProperty(aliases, 'odometerOffsetsKm', { value: odometerOffsetsKm })
  return aliases
}

export function preferredTelemetryRegistration(registration, aliases = null) {
  const canonical = canonicalFleetRegistration(registration, aliases)
  if (!canonical) return ''
  return normalizeFleetRegistration(
    aliases?.preferredSources?.get?.(canonical)
      || DEFAULT_PREFERRED_TELEMETRY_SOURCES.get(canonical)
      || '',
  )
}

export function telemetryRegistrationsForVehicle(vehicle, aliases = null) {
  const canonical = canonicalFleetRegistration(vehicle?.registration, aliases)
  const preferred = preferredTelemetryRegistration(canonical, aliases)
  if (preferred) return [preferred]
  return [...new Set([
    normalizeFleetRegistration(vehicle?.registration),
    ...(vehicle?.telemetryAliases || []).map(normalizeFleetRegistration),
  ].filter(Boolean))]
}

const vehicleOdometer = (vehicle) => Number(
  vehicle?.telemetryRawOdometer ?? vehicle?.odometer,
) || 0

/** Merge device rows into exactly one row per physical vehicle. */
export function mergeCanonicalVehicles(vehicles = [], aliases = null) {
  const merged = new Map()
  const sourceRows = vehicles.map((vehicle) => {
    const sourceRegistration = normalizeFleetRegistration(vehicle?.registration)
    const canonicalRegistration = canonicalFleetRegistration(sourceRegistration, aliases)
    return { vehicle, sourceRegistration, canonicalRegistration }
  }).filter((row) => row.canonicalRegistration)
  const preferredRowsAvailable = new Set(sourceRows
    .filter(({ sourceRegistration, canonicalRegistration }) => (
      sourceRegistration === preferredTelemetryRegistration(canonicalRegistration, aliases)
    ))
    .map(({ canonicalRegistration }) => canonicalRegistration))

  sourceRows.forEach(({ vehicle, sourceRegistration, canonicalRegistration }) => {
    const preferredSource = preferredTelemetryRegistration(canonicalRegistration, aliases)
    if (preferredSource && preferredRowsAvailable.has(canonicalRegistration) && sourceRegistration !== preferredSource) return

    const previous = merged.get(canonicalRegistration)
    const telemetryAliases = new Set([
      ...(previous?.telemetryAliases || []),
      ...(vehicle?.telemetryAliases || []).map(normalizeFleetRegistration),
    ])
    if (sourceRegistration && sourceRegistration !== canonicalRegistration) {
      telemetryAliases.add(sourceRegistration)
    }

    // Odometers are alternate readings for one vehicle, never additive. Keep
    // the freshest/highest plausible reading while retaining every alias.
    const preferred = !previous || vehicleOdometer(vehicle) >= vehicleOdometer(previous)
      ? { ...(previous || {}), ...vehicle }
      : { ...vehicle, ...previous }
    const telemetryRawOdometer = Math.max(vehicleOdometer(previous), vehicleOdometer(vehicle))
    const odometerOffsetKm = Number(
      aliases?.odometerOffsetsKm?.get?.(canonicalRegistration)
        ?? DEFAULT_ODOMETER_OFFSETS_KM.get(canonicalRegistration),
    ) || 0
    merged.set(canonicalRegistration, {
      ...preferred,
      registration: canonicalRegistration,
      canonicalRegistration,
      telemetrySourceRegistration: sourceRegistration,
      telemetryAliases: [...telemetryAliases].sort(),
      telemetryRawOdometer,
      odometerOffsetKm,
      odometer: telemetryRawOdometer + (odometerOffsetKm * 1000),
    })
  })
  return [...merged.values()].sort((a, b) => a.registration.localeCompare(b.registration))
}

const tripSignature = (trip, canonical) => [
  canonical,
  trip.start_timestamp || trip.clock_start || '',
  trip.end_timestamp || trip.clock_end || '',
  Math.round(Number(trip.trip_distance) || 0),
  Math.round(Number(trip.trip_duration_seconds) || 0),
].join('|')

/**
 * Deduplicate trips across parent/-CAM rows. Both the upstream trip id and a
 * deterministic trip signature are tracked because duplicate device rows can
 * occasionally receive different API ids.
 */
export function deduplicateCanonicalTrips(trips = [], aliases = null) {
  const ids = new Set()
  const signatures = new Set()
  const result = []

  trips.forEach((trip) => {
    const sourceRegistration = normalizeFleetRegistration(trip?.registration)
    const canonical = canonicalFleetRegistration(sourceRegistration, aliases)
    if (!canonical) return
    const preferredSource = preferredTelemetryRegistration(canonical, aliases)
    if (preferredSource && sourceRegistration !== preferredSource) return
    const id = String(trip.trip_id || trip.id || '').trim()
    const signature = tripSignature(trip, canonical)
    if ((id && ids.has(id)) || signatures.has(signature)) return
    if (id) ids.add(id)
    signatures.add(signature)
    result.push({
      ...trip,
      sourceRegistration,
      registration: canonical,
      canonicalRegistration: canonical,
    })
  })
  return result
}
