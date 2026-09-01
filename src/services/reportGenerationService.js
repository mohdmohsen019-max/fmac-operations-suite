import { db } from '../firebase'
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore'
import { cartrackService } from './cartrackService'
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns'
import { FLEET_MAPPING } from './fleetMapping'

/**
 * Service to aggregate data for automated report sections
 */
export const reportGenerationService = {

  /**
   * 1. Bus Odometers & Trips (Cartrack API)
   */
  async generateBusTrips(monthStr) {
    const start = format(startOfMonth(parseISO(`${monthStr}-01`)), 'yyyy-MM-dd HH:mm:ss')
    const end = format(endOfMonth(parseISO(`${monthStr}-01`)), 'yyyy-MM-dd HH:mm:ss')
    
    const trips = await cartrackService.getTrips(start, end)
    if (!trips) throw new Error('Failed to fetch trips from Cartrack')

    const fleetRegs = Object.keys(FLEET_MAPPING)
    const fleetStats = {}
    let totalKm = 0
    let totalTrips = 0

    trips.forEach(t => {
      const reg = t.registration?.replace(/\s/g, '').toUpperCase()
      if (!fleetRegs.includes(reg)) return // Master Filter: Only FMAC vehicles

      if (!fleetStats[reg]) {
        fleetStats[reg] = { registration: reg, kms: 0, trips: 0 }
      }
      fleetStats[reg].kms += (t.trip_distance || 0) / 1000
      fleetStats[reg].trips += 1
      totalKm += (t.trip_distance || 0) / 1000
      totalTrips += 1
    })

    const summary = `Fleet covered a total of ${Math.round(totalKm).toLocaleString()} km across ${totalTrips.toLocaleString()} trips during this period.`
    const summaryAr = `قطع الأسطول مسافة إجمالية قدرها ${Math.round(totalKm).toLocaleString()} كم عبر ${totalTrips.toLocaleString()} رحلة خلال هذه الفترة.`

    const rows = Object.values(fleetStats).map(s => [
      s.registration,
      s.trips.toLocaleString(),
      Math.round(s.kms).toLocaleString() + ' km'
    ])

    return {
      summary,
      summaryAr,
      keyPoints: [
        `Average distance per vehicle: ${Math.round(totalKm / Object.keys(fleetStats).length || 1)} km`,
        `Most active vehicle: ${Object.values(fleetStats).sort((a,b) => b.kms - a.kms)[0]?.registration || 'N/A'}`
      ],
      keyPointsAr: [
        `متوسط المسافة لكل مركبة: ${Math.round(totalKm / Object.keys(fleetStats).length || 1)} كم`,
        `المركبة الأكثر نشاطاً: ${Object.values(fleetStats).sort((a,b) => b.kms - a.kms)[0]?.registration || 'غير متوفر'}`
      ],
      tables: [{
        title: 'Vehicle Usage Summary',
        headers: ['Registration', 'Total Trips', 'Total Distance'],
        rows
      }],
      numbers: {
        totalKm: Math.round(totalKm),
        totalTrips,
        vehicleCount: Object.keys(fleetStats).length
      }
    }
  },

  /**
   * 2. Maintenance (Firestore)
   */
  async generateMaintenance(monthStr) {
    const start = startOfMonth(parseISO(`${monthStr}-01`))
    const end = endOfMonth(parseISO(`${monthStr}-01`))
    
    const snap = await getDocs(query(collection(db, 'maintenance'), orderBy('date', 'desc')))
    const records = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(r => {
        const d = r.date?.seconds ? new Date(r.date.seconds * 1000) : new Date(r.date)
        return d >= start && d <= end
      })

    const totalCost = records.reduce((sum, r) => sum + (parseFloat(r.total) || 0), 0)
    
    const summary = `Total maintenance expenditure for the month is AED ${totalCost.toLocaleString()}. A total of ${records.length} maintenance tasks were completed.`
    const summaryAr = `بلغ إجمالي مصروفات الصيانة لهذا الشهر ${totalCost.toLocaleString()} درهم إماراتي. تم إنجاز إجمالي ${records.length} مهمة صيانة.`

    const rows = records.map(r => [
      r.date?.seconds ? format(new Date(r.date.seconds * 1000), 'yyyy-MM-dd') : r.date,
      r.plateNumber || r.registration || 'N/A',
      r.type || 'Repair',
      `AED ${parseFloat(r.total || 0).toLocaleString()}`
    ])

    return {
      summary,
      summaryAr,
      keyPoints: [
        `Total tasks: ${records.length}`,
        `Highest cost item: AED ${Math.max(...records.map(r => parseFloat(r.total || 0)), 0).toLocaleString()}`
      ],
      keyPointsAr: [
        `إجمالي المهام: ${records.length}`,
        `أعلى تكلفة لبند: ${Math.max(...records.map(r => parseFloat(r.total || 0)), 0).toLocaleString()} درهم`
      ],
      tables: [{
        title: 'Maintenance Log',
        headers: ['Date', 'Vehicle', 'Type', 'Cost'],
        rows // Show all rows, no slice
      }],
      numbers: {
        totalSpent: totalCost,
        taskCount: records.length
      }
    }
  },

  /**
   * 3. Complaints (Firestore)
   */
  async generateComplaints(monthStr) {
    const start = startOfMonth(parseISO(`${monthStr}-01`))
    const end = endOfMonth(parseISO(`${monthStr}-01`))
    
    // Helpdesk source is 'requests' collection
    const snap = await getDocs(query(collection(db, 'requests'), where('type', '==', 'complaint')))
    const records = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(r => {
        const d = r.createdAt?.toDate ? r.createdAt.toDate() : (r.createdAt?.seconds ? new Date(r.createdAt.seconds * 1000) : new Date(r.createdAt))
        return d >= start && d <= end
      })

    const closed = records.filter(r => r.status === 'closed' || r.status === 'resolved').length
    const open = records.length - closed

    const summary = `Received ${records.length} complaints via Helpdesk this month. ${closed} resolved, ${open} currently pending.`
    const summaryAr = `تم استلام ${records.length} شكوى عبر مركز المساعدة هذا الشهر. تم حل ${closed} منها، ولا تزال ${open} قيد الانتظار.`

    return {
      summary,
      summaryAr,
      keyPoints: [
        `Resolution rate: ${Math.round((closed / (records.length || 1)) * 100)}%`,
        `Total tickets logged: ${records.length}`
      ],
      keyPointsAr: [
        `معدل الحل: ${Math.round((closed / (records.length || 1)) * 100)}%`,
        `إجمالي التذاكر المسجلة: ${records.length}`
      ],
      numbers: {
        total: records.length,
        closed,
        open
      }
    }
  },

  /**
   * 4. Fuel (Firestore fuelStatements)
   */
  async generateFuel(monthStr) {
    const [year, month] = monthStr.split('-').map(Number)
    
    // Fetch the specific statement for this month/year (Fuel Intelligence logic)
    const snap = await getDocs(query(
      collection(db, 'fuelStatements'),
      where('month', '==', month),
      where('year', '==', year)
    ))
    
    if (snap.empty) {
      return {
        summary: "No fuel statement found for this period in Fuel Intelligence.",
        summaryAr: "لم يتم العثور على كشف حساب وقود لهذه الفترة في ذكاء الوقود.",
        numbers: { totalCost: 0, totalLiters: 0, avgPrice: 0 }
      }
    }

    const statement = snap.docs[0].data()
    const totalCost = parseFloat(statement.totalCost) || 0
    const totalLiters = parseFloat(statement.totalLitres) || 0 // Correct field name is 'totalLitres' in Firestore
    const avgPrice = totalLiters > 0 ? (totalCost / totalLiters).toFixed(2) : 0

    // Fetch trips to get KM context (mimic FuelDashboard processIntelligence)
    const startStr = format(startOfMonth(parseISO(`${monthStr}-01`)), 'yyyy-MM-dd HH:mm:ss')
    const endStr = format(endOfMonth(parseISO(`${monthStr}-01`)), 'yyyy-MM-dd HH:mm:ss')
    const trips = await cartrackService.getTrips(startStr, endStr) || []
    
    const fleetRegs = Object.keys(FLEET_MAPPING)
    const vehicleKM = {}
    let totalKm = 0
    
    trips.forEach(t => {
      const reg = t.registration?.replace(/\s/g, '').toUpperCase()
      if (fleetRegs.includes(reg)) {
        const km = (t.trip_distance || 0) / 1000
        vehicleKM[reg] = (vehicleKM[reg] || 0) + km
        totalKm += km
      }
    })

    // Calculate vehicle rankings/breakdown (mimic FuelDashboard logic)
    const allocations = statement.vehicleAllocations || []
    const breakdown = fleetRegs.map(plate => {
      const km = vehicleKM[plate] || 0
      const allocation = allocations.find(a => a.plate === plate)
      
      // If system has exact allocation, use it; otherwise distribute by KM %
      const litres = allocation ? (parseFloat(allocation.litres) || 0) : (totalKm > 0 ? (km / totalKm) * totalLiters : 0)
      const cost = allocation ? (parseFloat(allocation.cost) || 0) : (totalKm > 0 ? (km / totalKm) * totalCost : 0)
      
      return {
        plate,
        km: Math.round(km),
        litres: Math.round(litres * 10) / 10,
        cost: Math.round(cost * 100) / 100
      }
    }).filter(v => v.km > 0 || v.cost > 0) // Only show active vehicles
      .sort((a, b) => b.cost - a.cost)

    const summary = `Total fuel consumption: ${totalLiters.toLocaleString()} Liters. Expenditure: AED ${totalCost.toLocaleString()}. Distance covered: ${Math.round(totalKm).toLocaleString()} KM.`
    const summaryAr = `إجمالي استهلاك الوقود: ${totalLiters.toLocaleString()} لتر. المصروفات: ${totalCost.toLocaleString()} درهم. المسافة المقطوعة: ${Math.round(totalKm).toLocaleString()} كم.`

    const rows = breakdown.map(v => [
      v.plate,
      `${v.km.toLocaleString()} KM`,
      `${v.litres.toLocaleString()} L`,
      `AED ${v.cost.toLocaleString()}`
    ])

    return {
      summary,
      summaryAr,
      keyPoints: [
        `Average cost per liter: AED ${avgPrice}`,
        `Fleet efficiency: ${(totalKm / (totalLiters || 1)).toFixed(2)} KM/L`,
        `Top consumer: ${breakdown[0]?.plate || 'N/A'} (AED ${breakdown[0]?.cost.toLocaleString()})`
      ],
      keyPointsAr: [
        `متوسط التكلفة للتر: ${avgPrice} درهم`,
        `كفاءة الأسطول: ${(totalKm / (totalLiters || 1)).toFixed(2)} كم/لتر`,
        `الأكثر استهلاكاً: ${breakdown[0]?.plate || 'غير متوفر'} (${breakdown[0]?.cost.toLocaleString()} درهم)`
      ],
      tables: [{
        title: 'Vehicle Fuel Breakdown',
        headers: ['Registration', 'Distance', 'Volume', 'Estimated Cost'],
        rows
      }],
      numbers: {
        totalCost,
        totalLiters,
        totalKm: Math.round(totalKm),
        avgPrice
      }
    }
  },

  async generateRidership(monthStr) {
    const snap = await getDocs(collection(db, 'fleet_ridership_counts'))
    const records = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(r => String(r.date || '').startsWith(monthStr))
    const totalRiders = records.reduce((sum, r) => sum + (Number(r.riders) || 0), 0)
    const byBus = new Map()
    records.forEach(r => {
      const plate = r.classSnapshot?.registration || 'Unassigned'
      const current = byBus.get(plate) || { plate, riders: 0, sessions: 0 }
      current.riders += Number(r.riders) || 0
      current.sessions += 1
      byBus.set(plate, current)
    })
    const ranking = [...byBus.values()].sort((a, b) => b.riders - a.riders)
    return {
      summary: `${totalRiders.toLocaleString()} riders were recorded across ${records.length.toLocaleString()} bus sessions during the month.`,
      summaryAr: `تم تسجيل ${totalRiders.toLocaleString()} راكباً عبر ${records.length.toLocaleString()} حصة حافلة خلال الشهر.`,
      keyPoints: [`Active buses with saved ridership: ${byBus.size}`, `Highest ridership: ${ranking[0]?.plate || 'N/A'} (${ranking[0]?.riders || 0})`],
      keyPointsAr: [`الحافلات ذات سجلات ركاب: ${byBus.size}`, `أعلى عدد ركاب: ${ranking[0]?.plate || 'غير متوفر'} (${ranking[0]?.riders || 0})`],
      tables: [{ title: 'Ridership by Bus', headers: ['Registration', 'Recorded Sessions', 'Riders'], rows: ranking.map(r => [r.plate, r.sessions, r.riders]) }],
      numbers: { totalRiders, recordedSessions: records.length, activeBuses: byBus.size },
    }
  },

  async generateExternalTransportation(monthStr) {
    const snap = await getDocs(collection(db, 'fleet_external_transportation'))
    const records = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(r => String(r.date || '').startsWith(monthStr))
    const grouped = new Map()
    records.forEach(r => {
      const key = r.personName || 'Unassigned'
      const current = grouped.get(key) || { name: key, requests: 0, vehicles: new Set() }
      current.requests += 1
      if (r.vehicleRegistration) current.vehicles.add(r.vehicleRegistration)
      grouped.set(key, current)
    })
    const ranking = [...grouped.values()].sort((a, b) => b.requests - a.requests)
    const vehicles = new Set(records.map(r => r.vehicleRegistration).filter(Boolean))
    return {
      summary: `${records.length} external transportation requests were recorded during the month.`,
      summaryAr: `تم تسجيل ${records.length} طلب نقل خارجي خلال الشهر.`,
      keyPoints: [`Drivers/staff involved: ${grouped.size}`, `Most active person: ${ranking[0]?.name || 'N/A'} (${ranking[0]?.requests || 0})`],
      keyPointsAr: [`عدد السائقين والموظفين المشاركين: ${grouped.size}`, `الأكثر نشاطاً: ${ranking[0]?.name || 'غير متوفر'} (${ranking[0]?.requests || 0})`],
      tables: [{ title: 'External Transportation by Person', headers: ['Driver / Staff', 'Requests', 'Vehicles Used'], rows: ranking.map(r => [r.name, r.requests, [...r.vehicles].join(', ') || '—']) }],
      numbers: { requestCount: records.length, driverCount: grouped.size, vehicleCount: vehicles.size },
    }
  },

  async generateDriverOvertime(monthStr) {
    const snap = await getDocs(collection(db, 'fleet_driver_overtime'))
    const records = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(r => String(r.date || '').startsWith(monthStr))
    const grouped = new Map()
    records.forEach(r => {
      const name = r.driverName || 'Unassigned'
      const current = grouped.get(name) || { name, minutes: 0, entries: 0 }
      current.minutes += Number(r.durationMinutes) || 0
      current.entries += 1
      grouped.set(name, current)
    })
    const ranking = [...grouped.values()].sort((a, b) => b.minutes - a.minutes)
    const totalMinutes = records.reduce((sum, r) => sum + (Number(r.durationMinutes) || 0), 0)
    return {
      summary: `${(totalMinutes / 60).toFixed(2)} overtime hours were recorded in ${records.length} entries.`,
      summaryAr: `تم تسجيل ${(totalMinutes / 60).toFixed(2)} ساعة عمل إضافي ضمن ${records.length} سجلاً.`,
      keyPoints: [`People with overtime: ${grouped.size}`, `Highest total: ${ranking[0]?.name || 'N/A'} (${((ranking[0]?.minutes || 0) / 60).toFixed(2)} h)`],
      keyPointsAr: [`الأشخاص ذوو العمل الإضافي: ${grouped.size}`, `أعلى إجمالي: ${ranking[0]?.name || 'غير متوفر'} (${((ranking[0]?.minutes || 0) / 60).toFixed(2)} ساعة)`],
      tables: [{ title: 'Overtime by Person', headers: ['Driver / Staff', 'Entries', 'Hours'], rows: ranking.map(r => [r.name, r.entries, (r.minutes / 60).toFixed(2)]) }],
      numbers: { totalHours: Number((totalMinutes / 60).toFixed(2)), entryCount: records.length, driverCount: grouped.size },
    }
  },

  async generateTrafficFines(monthStr) {
    const snap = await getDocs(collection(db, 'fleet_fines'))
    const records = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(r => String(r.date || '').startsWith(monthStr))
    const totalAmount = records.reduce((sum, r) => sum + (Number(r.amountAed) || 0), 0)
    const vehicles = new Set(records.map(r => r.vehicleReg).filter(Boolean))
    return {
      summary: records.length ? `${records.length} traffic fines totalling AED ${totalAmount.toLocaleString()} were recorded.` : 'No traffic fines were recorded for the selected month.',
      summaryAr: records.length ? `تم تسجيل ${records.length} مخالفة مرورية بقيمة إجمالية ${totalAmount.toLocaleString()} درهم.` : 'لم يتم تسجيل أي مخالفات مرورية خلال الشهر المحدد.',
      keyPoints: [`Vehicles affected: ${vehicles.size}`, records.length ? `Average fine: AED ${(totalAmount / records.length).toFixed(2)}` : 'Fine-free period confirmed by the register.'],
      keyPointsAr: [`المركبات المتأثرة: ${vehicles.size}`, records.length ? `متوسط المخالفة: ${(totalAmount / records.length).toFixed(2)} درهم` : 'تؤكد السجلات أن الفترة خالية من المخالفات.'],
      tables: [{ title: 'Traffic Fine Register', headers: ['Date', 'Registration', 'Driver', 'Amount'], rows: records.map(r => [r.date, r.vehicleReg || '—', r.driverName || '—', `AED ${Number(r.amountAed || 0).toLocaleString()}`]) }],
      numbers: { fineCount: records.length, totalAmount, vehicleCount: vehicles.size },
    }
  },

  async generateRegistrationCompliance(monthStr) {
    const snap = await getDocs(collection(db, 'fleet_vehicle_registrations'))
    const records = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    const periodEnd = endOfMonth(parseISO(`${monthStr}-01`))
    const followUpEnd = new Date(periodEnd); followUpEnd.setDate(followUpEnd.getDate() + 60)
    const stateOf = (record) => {
      const dates = [record.registrationExpiry, record.insuranceExpiry].filter(Boolean).map(v => new Date(`${v}T00:00:00`)).filter(d => !isNaN(d))
      if (!dates.length) return 'missing'
      if (dates.some(d => d <= periodEnd)) return 'expired'
      if (dates.some(d => d <= followUpEnd)) return 'expiring'
      return 'valid'
    }
    const statusCounts = { valid: 0, expiring: 0, expired: 0, missing: 0 }
    records.forEach(r => { statusCounts[stateOf(r)] += 1 })
    return {
      summary: `${statusCounts.valid} vehicle records are valid; ${statusCounts.expiring} require renewal follow-up and ${statusCounts.expired} are expired as of month end.`,
      summaryAr: `${statusCounts.valid} سجلاً سارياً، و${statusCounts.expiring} سجلاً يحتاج متابعة التجديد، و${statusCounts.expired} سجلاً منتهياً حتى نهاية الشهر.`,
      keyPoints: [`Records missing renewal dates: ${statusCounts.missing}`, `Follow-up window: 60 days after month end`],
      keyPointsAr: [`السجلات التي تنقصها تواريخ التجديد: ${statusCounts.missing}`, 'نافذة المتابعة: 60 يوماً بعد نهاية الشهر'],
      tables: [{ title: 'Registration Compliance', headers: ['Registration', 'Registration Expiry', 'Insurance Expiry', 'Status'], rows: records.map(r => [r.registration || r.id, r.registrationExpiry || '—', r.insuranceExpiry || '—', stateOf(r)]) }],
      numbers: statusCounts,
    }
  },

  _getTopCategory(records) {
    const cats = {}
    records.forEach(r => { if (r.category) cats[r.category] = (cats[r.category] || 0) + 1 })
    return Object.entries(cats).sort((a,b) => b[1] - a[1])[0]?.[0] || 'General'
  }
}
