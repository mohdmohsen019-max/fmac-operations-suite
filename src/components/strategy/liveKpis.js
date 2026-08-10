/**
 * Live KPI calculators — every value is computed on demand from the data the
 * operations suite already produces (Firestore + the Cartrack fleet API).
 * One shared fetch pass feeds all calculators; each returns
 *   { value, num, den, noteEn, noteAr }  (value = null when unmeasurable).
 *
 * Growth/improvement values are clamped at 0 — the register never shows a
 * negative reading (per the excellence office's presentation rules).
 *
 * Firestore is read-only here. Cartrack usage: the same getLiveStatus the
 * dashboard/wallboard already use + one getTrips window for the breakdown
 * rate — no new endpoints.
 */
import { db } from '../../firebase'
import { collection, getDocs } from 'firebase/firestore'
import { format } from 'date-fns'
import { cartrackService } from '../../services/cartrackService'
import { periodRange, prevPeriodRange } from './kpiCatalog'

const FLEET_SIZE = 14 // registrations pinned in cartrackService.getLiveStatus

const toMillis = (v) => {
  if (!v) return 0
  if (typeof v.toDate === 'function') return v.toDate().getTime()
  if (typeof v.seconds === 'number') return v.seconds * 1000
  const t = new Date(v).getTime()
  return Number.isNaN(t) ? 0 : t
}

const inRange = (ms, [a, b]) => ms >= a.getTime() && ms <= b.getTime()

const pct = (num, den) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null)

const numify = (x) => {
  const n = parseFloat(String(x ?? '').replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

/* Growth clamped at zero — flat-or-declining periods read as 0, never negative. */
const growthPct = (cur, prev) =>
  prev > 0 ? Math.max(0, Math.round(((cur - prev) / prev) * 1000) / 10) : null

async function safeDocs(name) {
  try {
    const snap = await getDocs(collection(db, name))
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
  } catch {
    return null // collection unreadable — the KPI reports "no data", not zero
  }
}

const sessionMs = (d) => {
  const t = new Date(`${String(d.id).slice(0, 10)}T12:00:00`).getTime()
  return Number.isNaN(t) ? 0 : t
}

/**
 * Compute every live KPI in one pass.
 * Returns { [calcKey]: { value, num, den, noteEn, noteAr } }
 */
export async function computeLiveKpis() {
  const now = new Date()
  const [requests, assets, auditLog, maintenance, reports, sections,
         sessions, fuel, movements, trips] = await Promise.all([
    safeDocs('requests'),
    safeDocs('assets'),
    safeDocs('asset_audit_log'),
    safeDocs('maintenance'),
    safeDocs('monthly_reports'),
    safeDocs('report_sections'),
    safeDocs('sessions'),
    safeDocs('fuelStatements'),
    safeDocs('inventory_movements'),
    safeDocs('trip_logs'),
  ])

  let fleetLive = null
  try { fleetLive = await cartrackService.getLiveStatus() } catch { /* offline */ }

  const out = {}

  /* SLA readiness — closed tickets that beat their SLA deadline (quarter) */
  if (requests) {
    const range = periodRange('quarterly', now)
    const closed = requests.filter(r =>
      r.status === 'closed' && inRange(toMillis(r.updatedAt || r.createdAt), range))
    const onTime = closed.filter(r => {
      const dl = toMillis(r.slaDeadline)
      return !dl || toMillis(r.updatedAt || r.createdAt) <= dl
    })
    out.slaReadiness = closed.length === 0 ? {
      value: 100, num: 0, den: 0,
      noteEn: 'no tickets closed this quarter — counts as 100%',
      noteAr: 'لا تذاكر مغلقة هذا الربع — تُحتسب 100%',
    } : {
      value: pct(onTime.length, closed.length), num: onTime.length, den: closed.length,
      noteEn: 'closed tickets within SLA this quarter',
      noteAr: 'تذاكر أُغلقت ضمن SLA هذا الربع',
    }
  }

  /* Response rates by request type (quarter) — الاقتراحات / الشكاوى / الاستفسارات */
  if (requests) {
    const range = periodRange('quarterly', now)
    const typed = (type) => {
      const scope = requests.filter(r =>
        r.type === type && inRange(toMillis(r.createdAt), range))
      const answered = scope.filter(r => r.status === 'closed')
      return { scope, answered }
    }
    const defs = [
      ['responseSuggestions', 'suggestion', 'suggestions answered this quarter', 'اقتراحات أُجيب عليها هذا الربع'],
      ['responseComplaints',  'complaint',  'complaints closed this quarter',    'شكاوى أُغلقت هذا الربع'],
      ['responseInquiries',   'inquiry',    'inquiries answered this quarter',   'استفسارات أُجيب عليها هذا الربع'],
    ]
    defs.forEach(([key, type, noteEn, noteAr]) => {
      const { scope, answered } = typed(type)
      out[key] = scope.length === 0 ? {
        value: 100, num: 0, den: 0,
        noteEn: 'none received this quarter — counts as 100%',
        noteAr: 'لا واردات هذا الربع — تُحتسب 100%',
      } : {
        value: pct(answered.length, scope.length),
        num: answered.length, den: scope.length, noteEn, noteAr,
      }
    })
  }

  /* Player attendance rate — sessions this month (present ÷ enrolled) */
  if (sessions) {
    const range = periodRange('monthly', now)
    let present = 0, total = 0
    sessions.forEach(d => {
      if (!inRange(sessionMs(d), range)) return
      present += Number(d.presentCount) || 0
      total += Number(d.totalPlayers) || 0
    })
    out.attendanceRate = {
      value: pct(present, total), num: present, den: total,
      noteEn: 'players present vs enrolled this month',
      noteAr: 'الحاضرون مقابل المسجلين هذا الشهر',
    }
  }

  /* Unified asset registry completeness */
  if (assets) {
    const complete = assets.filter(a =>
      (a.name_en || a.name_ar) && a.location_room && a.status && a.category)
    out.assetRegistry = {
      value: pct(complete.length, assets.length), num: complete.length, den: assets.length,
      noteEn: 'assets with complete core data',
      noteAr: 'أصول مكتملة البيانات الأساسية',
    }
  }

  /* Semi-annual audit coverage — assets touched by the audit log this half */
  if (assets && auditLog) {
    const range = periodRange('semiannual', now)
    const audited = new Set(
      auditLog.filter(l => inRange(toMillis(l.timestamp), range))
              .map(l => l.asset_id || l.assetId || l.asset_name_en)
    )
    out.assetAudit = {
      value: pct(audited.size, assets.length), num: audited.size, den: assets.length,
      noteEn: 'assets audited this half-year',
      noteAr: 'أصول دُققت في النصف الحالي',
    }
  }

  /* Maintenance follow-up — vehicles serviced this quarter vs known vehicles */
  if (maintenance) {
    const known = new Set(maintenance.map(m => m.vehicle || m.plate).filter(Boolean))
    const range = periodRange('quarterly', now)
    const serviced = new Set(
      maintenance.filter(m => inRange(toMillis(m.date || m.createdAt), range))
                 .map(m => m.vehicle || m.plate).filter(Boolean)
    )
    out.maintenanceFollowup = {
      value: pct(serviced.size, known.size), num: serviced.size, den: known.size,
      noteEn: 'vehicles with maintenance this quarter',
      noteAr: 'مركبات لها صيانة هذا الربع',
    }
  }

  /* One month of trip telemetry feeds two KPIs (single Cartrack call) */
  try {
    const [start, end] = periodRange('monthly', now)
    const tripsData = (await cartrackService.getTrips(
      format(start, 'yyyy-MM-dd HH:mm:ss'), format(end, 'yyyy-MM-dd HH:mm:ss'))) || []
    const seen = new Set()
    const activeBuses = new Set()
    let km = 0
    tripsData.forEach(tr => {
      const dist = parseFloat(tr.trip_distance) || 0
      if (dist <= 0) return
      const key = tr.trip_id ? String(tr.trip_id) : `${tr.registration}-${tr.start_timestamp}-${dist}`
      if (seen.has(key)) return
      seen.add(key)
      km += dist / 1000
      if (tr.registration) activeBuses.add(tr.registration)
    })

    /* Breakdowns per 100k km — maintenance entries vs fleet km this month */
    if (maintenance) {
      const faults = maintenance.filter(m =>
        inRange(toMillis(m.date || m.createdAt), [start, end])).length
      out.breakdownsPer100k = km > 0 ? {
        value: Math.round((faults / km) * 100000 * 10) / 10,
        num: faults, den: Math.round(km),
        noteEn: 'faults vs fleet km this month',
        noteAr: 'أعطال مقابل كيلومترات الشهر',
      } : { value: null, num: faults, den: 0,
            noteEn: 'no fleet distance recorded yet this month',
            noteAr: 'لا مسافات مسجلة بعد هذا الشهر' }
    }

    /* Route compliance — one route per bus: buses running their route ÷ 14 */
    if (tripsData.length > 0) {
      const running = Math.min(activeBuses.size, FLEET_SIZE)
      out.routeCompliance = {
        value: pct(running, FLEET_SIZE), num: running, den: FLEET_SIZE,
        noteEn: 'buses operating on their route this month',
        noteAr: 'حافلات تعمل على مساراتها هذا الشهر',
      }
    }
  } catch { /* Cartrack offline — these KPIs stay unmeasured */ }

  /* Report discipline — current month's sections approved */
  if (reports && sections) {
    const mKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const current = reports.find(r => (r.monthId || r.id || '').startsWith(mKey))
    const secs = current ? sections.filter(s => s.reportId === current.id) : []
    const approved = secs.filter(s => s.status === 'approved')
    out.reportDiscipline = {
      value: pct(approved.length, secs.length), num: approved.length, den: secs.length,
      noteEn: 'sections approved in this month’s report',
      noteAr: 'أقسام معتمدة في تقرير الشهر',
    }
  }

  /* KPI measurement cadence — months of this year with a report */
  if (reports) {
    const y = String(now.getFullYear())
    const monthsElapsed = now.getMonth() + 1
    const monthsWithReport = new Set(
      reports.map(r => (r.monthId || r.id || ''))
             .filter(k => k.startsWith(y))
             .map(k => k.slice(0, 7))
    )
    out.kpiMeasurement = {
      value: pct(monthsWithReport.size, monthsElapsed),
      num: monthsWithReport.size, den: monthsElapsed,
      noteEn: 'months of the year with a filed report',
      noteAr: 'أشهر السنة التي لها تقرير',
    }
  }

  /* Bus fleet availability — operational buses of the 14 */
  if (fleetLive) {
    out.busOccupancy = {
      value: pct(fleetLive.length, FLEET_SIZE), num: fleetLive.length, den: FLEET_SIZE,
      noteEn: 'buses operational of the fleet',
      noteAr: 'حافلات جاهزة للتشغيل من الأسطول',
    }
  }

  /* Smart monitoring adoption — fleet units reporting telemetry right now */
  if (fleetLive) {
    out.smartMonitoring = {
      value: pct(fleetLive.length, FLEET_SIZE), num: fleetLive.length, den: FLEET_SIZE,
      noteEn: 'fleet vehicles reporting via Cartrack',
      noteAr: 'مركبات تُبلِّغ عبر نظام التتبع',
    }
  }

  /* Fuel efficiency improvement — km/L of the latest statement vs the average
     of all prior valid statements. Fields are coerced (strings/commas happen)
     and statements missing km or litres are skipped, so this never yields NaN. */
  if (fuel) {
    const valid = fuel
      .map(f => ({ ms: toMillis(f.createdAt), km: numify(f.totalKM), litres: numify(f.totalLitres) }))
      .filter(f => f.km > 0 && f.litres > 0)
      .sort((a, b) => b.ms - a.ms)
    if (valid.length >= 2) {
      const effL = valid[0].km / valid[0].litres
      const prior = valid.slice(1)
      const effP = prior.reduce((sum, f) => sum + f.km / f.litres, 0) / prior.length
      out.fuelEfficiency = {
        value: Math.max(0, Math.round(((effL - effP) / effP) * 1000) / 10),
        num: Math.round(effL * 100) / 100,
        den: Math.round(effP * 100) / 100,
        noteEn: 'km/L latest vs average of prior statements',
        noteAr: 'كم/لتر الأخير مقابل متوسط الكشوف السابقة',
      }
    }
  }

  /* Attendance growth — present players this quarter vs previous (≥ 0) */
  if (sessions) {
    const cur = periodRange('quarterly', now)
    const prev = prevPeriodRange('quarterly', now)
    let curSum = 0, prevSum = 0
    sessions.forEach(d => {
      const ms = sessionMs(d)
      const n = Number(d.presentCount) || 0
      if (inRange(ms, cur)) curSum += n
      else if (inRange(ms, prev)) prevSum += n
    })
    out.attendanceGrowth = {
      value: growthPct(curSum, prevSum),
      num: curSum, den: prevSum,
      noteEn: 'attendance this quarter vs last',
      noteAr: 'حضور الربع الحالي مقابل السابق',
    }
  }

  /* Digital adoption — automated workflows with real activity in 30 days */
  {
    const cutoff = Date.now() - 30 * 86400000
    const workflows = [
      { docs: movements,   ts: (d) => toMillis(d.createdAt) },              // warehouse issuance
      { docs: auditLog,    ts: (d) => toMillis(d.timestamp) },              // asset auditing
      { docs: requests,    ts: (d) => toMillis(d.createdAt) },              // help desk
      { docs: trips,       ts: (d) => toMillis(d.createdAt) },              // driver trip logging
      { docs: sessions,    ts: sessionMs },                                 // attendance
      { docs: maintenance, ts: (d) => toMillis(d.date || d.createdAt) },    // fleet maintenance
      { docs: reports,     ts: (d) => toMillis(d.createdAt || d.updatedAt) }, // dept reporting
      { docs: fuel,        ts: (d) => toMillis(d.createdAt) },              // fuel intelligence
    ]
    const active = workflows.filter(w =>
      Array.isArray(w.docs) && w.docs.some(d => w.ts(d) >= cutoff)).length
    out.digitalAdoption = {
      value: pct(active, workflows.length), num: active, den: workflows.length,
      noteEn: 'digital workflows active in the last 30 days',
      noteAr: 'عمليات رقمية نشطة خلال ٣٠ يوماً',
    }
  }

  return out
}
