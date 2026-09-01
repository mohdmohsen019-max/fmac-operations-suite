/** Aggregate saved ridership count documents into per-class and fleet totals. */
export function buildRidershipStats(entries = [], classes = []) {
  const byClass = new Map()
  let totalRiders = 0
  for (const entry of entries) {
    const riders = Number(entry.riders) || 0
    totalRiders += riders
    const groupId = entry.classSnapshot?.registration || entry.classId
    if (!byClass.has(groupId)) byClass.set(groupId, { sessions: 0, riders: 0, capacitySeats: 0, capacitySessions: 0, snapshot: entry.classSnapshot || null })
    const group = byClass.get(groupId)
    group.sessions += 1
    group.riders += riders
    const historicalCapacity = Number(entry.classSnapshot?.capacity)
    if (historicalCapacity > 0) {
      group.capacitySeats += historicalCapacity
      group.capacitySessions += 1
    }
  }
  const perClass = [...byClass.entries()].map(([classId, group]) => {
    const cls = group.snapshot || classes.find((item) => item.id === classId) || null
    const currentCapacity = cls && Number(cls.capacity) > 0 ? Number(cls.capacity) : null
    const capacity = group.capacitySessions > 0 ? group.capacitySeats / group.capacitySessions : currentCapacity
    return {
      classId,
      cls,
      sessions: group.sessions,
      riders: group.riders,
      avg: group.sessions > 0 ? group.riders / group.sessions : 0,
      capacity,
      utilization: capacity ? (group.riders / (capacity * group.sessions)) * 100 : null,
    }
  }).sort((left, right) => right.avg - left.avg)
  let capacityRiders = 0
  let capacitySeats = 0
  perClass.forEach((item) => {
    if (item.capacity) {
      capacityRiders += item.riders
      capacitySeats += item.capacity * item.sessions
    }
  })
  return {
    perClass,
    totalRiders,
    sessions: entries.length,
    avgPerSession: entries.length > 0 ? totalRiders / entries.length : 0,
    busiest: perClass[0] || null,
    quietest: perClass.length > 0 ? perClass.at(-1) : null,
    utilization: capacitySeats > 0 ? (capacityRiders / capacitySeats) * 100 : null,
  }
}
