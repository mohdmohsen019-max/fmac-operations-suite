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

  _getTopCategory(records) {
    const cats = {}
    records.forEach(r => { if (r.category) cats[r.category] = (cats[r.category] || 0) + 1 })
    return Object.entries(cats).sort((a,b) => b[1] - a[1])[0]?.[0] || 'General'
  }
}
