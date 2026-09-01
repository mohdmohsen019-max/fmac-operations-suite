/**
 * Fleet Maintenance Suite — shared data layer for the Maintenance tab.
 *
 * Firestore collections owned by this suite:
 *   fleet_maintenance_files   attachments (invoices / photos) hanging off
 *                             maintenance records. Records may come from a
 *                             read-only source, so files live in their own
 *                             collection keyed by a stable recordKey.
 *   fleet_part_catalog        part types + expected lifespans. Seeded IN CODE
 *                             when the collection is empty (never auto-written);
 *                             the first admin write materialises the seeds.
 *   fleet_part_installs       per-vehicle "part installed/replaced at km X".
 *   fleet_oil_tracking/{REG}  per-vehicle oil-change tracking. The special doc
 *                             '_default' stores the global interval default.
 */
import { useState, useEffect, useMemo } from 'react'
import { collection, onSnapshot, writeBatch, doc } from 'firebase/firestore'
import { db } from '../../../firebase'
import { cartrackService } from '../../../services/cartrackService'
import { normReg } from '../../../services/fleetMeta'
import { canonicalFleetRegistration, deduplicateCanonicalTrips, mergeCanonicalVehicles } from '../../../services/fleetIdentity'
import { componentLifecycle, oilStatusOf } from './maintenanceCalculations'
import { DEFAULT_MAINTENANCE_TEMPLATES } from './preventiveMaintenance'

export const OIL_DEFAULT_INTERVAL_KM = 10000
export const OIL_GLOBAL_DOC_ID = '_default'

/* Seed catalog — shown when fleet_part_catalog is empty. NOT auto-written:
   the first catalog/install write materialises all of them with these ids. */
export const DEFAULT_PARTS = [
  { id: 'seed_tires',              nameEn: 'Tires',              nameAr: 'إطارات',           lifespanKm: 50000, active: true, sortOrder: 1 },
  { id: 'seed_brake_pads',         nameEn: 'Brake Pads',         nameAr: 'تيل الفرامل',      lifespanKm: 30000, active: true, sortOrder: 2 },
  { id: 'seed_battery',            nameEn: 'Battery',            nameAr: 'البطارية',         lifespanKm: 40000, active: true, sortOrder: 3 },
  { id: 'seed_air_filter',         nameEn: 'Air Filter',         nameAr: 'فلتر الهواء',      lifespanKm: 20000, active: true, sortOrder: 4 },
  { id: 'seed_drive_belt',         nameEn: 'Drive Belt',         nameAr: 'سير المحرك',       lifespanKm: 60000, active: true, sortOrder: 5 },
  { id: 'seed_shock_absorbers',    nameEn: 'Shock Absorbers',    nameAr: 'ممتص الصدمات',     lifespanKm: 80000, active: true, sortOrder: 6 },
  { id: 'seed_transmission_fluid', nameEn: 'Transmission Fluid', nameAr: 'زيت ناقل الحركة',  lifespanKm: 60000, active: true, sortOrder: 7 },
]

/* Stable identifier for a maintenance record regardless of source.
   Firestore records carry doc.id; anything else falls back to a
   deterministic composite of its identifying fields. */
export function recordKeyOf(r) {
  if (r?.id) return String(r.id)
  return ['rec', r?.date, r?.plateNumber || r?.registration, r?.invoiceNumber || r?.invoice_no]
    .map((s) => String(s ?? '').replace(/[^\w-]/g, ''))
    .join('_')
}

/* Cartrack getVehicles() reports the odometer in metres
   (see FleetDriverLog which divides by 1000). */
export const odoKmOf = (v) => Math.round((parseFloat(v?.odometer) || 0) / 1000)

/* When the live catalog is still the in-code seed, stage all seed docs into
   the batch (deterministic ids) so a partial write never hides the rest. */
export function stageSeedCatalog(batch, catalogIsSeed) {
  if (!catalogIsSeed) return
  DEFAULT_PARTS.forEach((p) => {
    const { id, ...data } = p
    batch.set(doc(db, 'fleet_part_catalog', id), data)
  })
}

/* ── Attachments: live map recordKey → files[] ─────────────────────────── */
export function useMaintenanceFiles() {
  const [files, setFiles] = useState([])

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'fleet_maintenance_files'),
      (snap) => setFiles(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error('fleet_maintenance_files subscription error:', err),
    )
    return unsub
  }, [])

  return useMemo(() => {
    const map = new Map()
    files.forEach((f) => {
      const key = f.recordKey
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(f)
    })
    map.forEach((list) => list.sort((a, b) => (b.uploadedAt?.seconds || 0) - (a.uploadedAt?.seconds || 0)))
    return map
  }, [files])
}

/* ── The suite: vehicles in scope + catalog + installs + oil + alerts ──── */
export function useMaintenanceSuite(scope, inScope, aliasMap = null) {
  const [vehState, setVehState] = useState({ list: [], loading: true })
  const [catalogDocs, setCatalogDocs] = useState(null) // null = first snapshot pending
  const [installs, setInstalls] = useState([])
  const [oilState, setOilState] = useState({ map: new Map(), globalInterval: OIL_DEFAULT_INTERVAL_KM })
  const [templateDocs, setTemplateDocs] = useState(null)
  const [preventivePlans, setPreventivePlans] = useState([])

  /* Vehicles with live odometer — re-fetched whenever scope/classification
     changes. The previous list stays visible while the new one loads. */
  useEffect(() => {
    let cancelled = false
    const end = new Date()
    const start = new Date(end.getTime() - 30 * 86400000)
    const timestamp = (date, final = false) => `${date.toISOString().slice(0, 10)} ${final ? '23:59:59' : '00:00:00'}`
    Promise.all([
      cartrackService.getVehicles(scope),
      cartrackService.getTrips(timestamp(start), timestamp(end, true)).catch(() => []),
    ])
      .then(([list, tripRows]) => {
        if (cancelled) return
        const distanceByVehicle = new Map()
        deduplicateCanonicalTrips(tripRows || [], aliasMap).forEach((trip) => {
          const reg = canonicalFleetRegistration(trip.registration, aliasMap)
          if (!inScope(reg)) return
          distanceByVehicle.set(reg, (distanceByVehicle.get(reg) || 0) + (Number(trip.trip_distance) || 0) / 1000)
        })
        const filtered = mergeCanonicalVehicles(
          (list || []).filter((v) => v?.registration && inScope(v.registration)),
          aliasMap,
        ).map((v) => {
          const reg = canonicalFleetRegistration(v.registration, aliasMap)
          return { ...v, reg, odoKm: odoKmOf(v), avgDailyKm: (distanceByVehicle.get(reg) || 0) / 30 }
        })
          .sort((a, b) => a.reg.localeCompare(b.reg))
        setVehState({ list: filtered, loading: false })
      })
      .catch((err) => {
        console.error('Maintenance suite vehicles fetch error:', err)
        if (!cancelled) setVehState((prev) => ({ list: prev.list, loading: false }))
      })
    return () => { cancelled = true }
  }, [scope, inScope, aliasMap])

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'fleet_part_catalog'),
      (snap) => setCatalogDocs(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => { console.error('fleet_part_catalog subscription error:', err); setCatalogDocs([]) },
    )
    return unsub
  }, [])

  useEffect(() => onSnapshot(
    collection(db, 'fleet_maintenance_templates'),
    (snap) => setTemplateDocs(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => { console.error('fleet_maintenance_templates subscription error:', err); setTemplateDocs([]) },
  ), [])

  useEffect(() => onSnapshot(
    collection(db, 'fleet_maintenance_plans'),
    (snap) => setPreventivePlans(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => console.error('fleet_maintenance_plans subscription error:', err),
  ), [])

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'fleet_part_installs'),
      (snap) => setInstalls(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error('fleet_part_installs subscription error:', err),
    )
    return unsub
  }, [])

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'fleet_oil_tracking'),
      (snap) => {
        const map = new Map()
        let globalInterval = OIL_DEFAULT_INTERVAL_KM
        snap.docs.forEach((d) => {
          if (d.id === OIL_GLOBAL_DOC_ID) {
            const v = parseFloat(d.data()?.intervalKm)
            if (v > 0) globalInterval = v
          } else {
            map.set(normReg(d.id), { id: d.id, ...d.data() })
          }
        })
        setOilState({ map, globalInterval })
      },
      (err) => console.error('fleet_oil_tracking subscription error:', err),
    )
    return unsub
  }, [])

  const catalogIsSeed = catalogDocs !== null && catalogDocs.length === 0
  const catalog = useMemo(() => {
    if (catalogDocs === null) return null
    const list = catalogDocs.length ? catalogDocs : DEFAULT_PARTS
    return [...list].sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999))
  }, [catalogDocs])

  const activeParts = useMemo(
    () => (catalog || []).filter((p) => p.active !== false),
    [catalog],
  )

  const preventiveTemplatesAreSeed = templateDocs !== null && templateDocs.length === 0
  const preventiveTemplates = useMemo(() => {
    if (templateDocs === null) return null
    const rows = templateDocs.length ? templateDocs : DEFAULT_MAINTENANCE_TEMPLATES
    return [...rows].sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999))
  }, [templateDocs])

  /* Latest install per vehicle × part (highest installedAtKm wins —
     the most recent replacement is by definition the furthest one). */
  const latestInstalls = useMemo(() => {
    const map = new Map()
    installs.forEach((inst) => {
      const key = `${normReg(inst.vehicleReg)}|${inst.partId}`
      const km = parseFloat(inst.installedAtKm) || 0
      const prev = map.get(key)
      const prevKm = parseFloat(prev?.installedAtKm) || 0
      const installedTime = Date.parse(inst.installedDate || '') || 0
      const prevTime = Date.parse(prev?.installedDate || '') || 0
      if (!prev || km > prevKm || (km === prevKm && installedTime >= prevTime)) map.set(key, inst)
    })
    return map
  }, [installs])

  /* Health matrix: every vehicle in scope × every active part. */
  const partsHealth = useMemo(() => vehState.list.map((v) => ({
    vehicle: v,
    parts: activeParts.map((p) => {
      const install = latestInstalls.get(`${v.reg}|${p.id}`) || null
      if (!install) return { part: p, install: null, status: 'none', pct: 0, usedKm: 0, usedDays: 0 }
      const lifecyclePart = install.lifecycleBasis === 'time'
        ? { ...p, lifecycleBasis: 'time', lifespanDays: install.lifespanDays || p.lifespanDays }
        : p
      return { part: p, install, ...componentLifecycle({
        currentKm: v.odoKm,
        installedAtKm: install.installedAtKm,
        installedDate: install.installedDate,
        part: lifecyclePart,
      }) }
    }),
  })), [vehState.list, activeParts, latestInstalls])

  /* Oil rows: every vehicle in scope. */
  const oilRows = useMemo(() => vehState.list.map((v) => {
    const rec = oilState.map.get(v.reg) || null
    const ownInterval = parseFloat(rec?.intervalKm)
    const interval = ownInterval > 0 ? ownInterval : oilState.globalInterval
    const lastKm = parseFloat(rec?.lastChangeKm)
    if (rec === null || Number.isNaN(lastKm)) {
      return { vehicle: v, rec, interval, hasOwnInterval: ownInterval > 0, status: 'none' }
    }
    const nextDueKm = lastKm + interval
    const remaining = nextDueKm - v.odoKm
    return {
      vehicle: v, rec, interval, hasOwnInterval: ownInterval > 0,
      lastChangeKm: lastKm, lastChangeDate: rec.lastChangeDate || null,
      nextDueKm, remaining,
      odometerGap: lastKm - v.odoKm,
      status: oilStatusOf(remaining, interval, v.odoKm, lastKm),
    }
  }), [vehState.list, oilState])

  /* Aggregated alerts, most urgent first:
     overdue oil → critical parts → due-soon oil → attention parts. */
  const alerts = useMemo(() => {
    const list = []
    oilRows.forEach((row) => {
      if (row.status === 'invalid' || row.status === 'overdue' || row.status === 'due-soon') {
        list.push({
          id: `oil_${row.vehicle.reg}`, type: 'oil', reg: row.vehicle.reg,
          status: row.status, odometerGap: row.odometerGap,
          severity: row.status === 'invalid' || row.status === 'overdue' ? 'critical' : 'attention',
          rank: row.status === 'invalid' || row.status === 'overdue' ? 0 : 2,
          urgency: -row.remaining, remaining: row.remaining,
        })
      }
    })
    partsHealth.forEach(({ vehicle, parts }) => {
      parts.forEach((ph) => {
        if (ph.status === 'overdue' || ph.status === 'due' || ph.status === 'due-soon') {
          list.push({
            id: `part_${vehicle.reg}_${ph.part.id}`, type: 'part', reg: vehicle.reg,
            part: ph.part, severity: ph.status === 'overdue' || ph.status === 'due' ? 'critical' : 'attention',
            rank: ph.status === 'overdue' ? 1 : ph.status === 'due' ? 2 : 3,
            urgency: ph.pct, pct: ph.pct,
          })
        }
      })
    })
    return list.sort((a, b) => a.rank - b.rank || b.urgency - a.urgency)
  }, [oilRows, partsHealth])

  const summary = useMemo(() => {
    let warnings = 0; let critical = 0
    partsHealth.forEach(({ parts }) => parts.forEach((ph) => {
      if (ph.status === 'overdue' || ph.status === 'due') { critical += 1; warnings += 1 }
      else if (ph.status === 'due-soon') warnings += 1
    }))
    const oilOverdue = oilRows.filter((r) => r.status === 'overdue').length
    const oilDueSoon = oilRows.filter((r) => r.status === 'due-soon').length
    return { warnings, critical, oilOverdue, oilDueSoon }
  }, [partsHealth, oilRows])

  return {
    vehicles: vehState.list,
    vehiclesLoading: vehState.loading,
    catalog, catalogIsSeed, activeParts,
    latestInstalls,
    oilMap: oilState.map,
    globalOilInterval: oilState.globalInterval,
    preventiveTemplates, preventiveTemplatesAreSeed, preventivePlans,
    partsHealth, oilRows, alerts, summary,
  }
}

/* Materialise-then-write helper: returns a batch with seeds staged. */
export function newCatalogBatch(catalogIsSeed) {
  const batch = writeBatch(db)
  stageSeedCatalog(batch, catalogIsSeed)
  return batch
}
