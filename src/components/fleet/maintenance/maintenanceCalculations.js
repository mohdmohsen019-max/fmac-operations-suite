const DAY_MS = 86400000

export function partStatusOf(pct, warningThresholdPct = 75, dueThresholdPct = 90) {
  const warning = Math.max(0, Math.min(99, Number(warningThresholdPct) || 75)) / 100
  const due = Math.max(warning, Math.min(100, Number(dueThresholdPct) || 90)) / 100
  if (!Number.isFinite(pct) || pct < 0) return 'healthy'
  if (pct > 1) return 'overdue'
  if (pct >= due) return 'due'
  if (pct >= warning) return 'due-soon'
  return 'healthy'
}

export function oilStatusOf(remaining, interval, currentKm, lastChangeKm) {
  if (
    Number.isFinite(currentKm)
    && Number.isFinite(lastChangeKm)
    && (currentKm < 0 || lastChangeKm < 0 || lastChangeKm > currentKm)
  ) return 'invalid'
  if (!Number.isFinite(remaining) || !Number.isFinite(interval) || interval <= 0) return 'none'
  if (remaining < 0) return 'overdue'
  if (remaining <= interval * 0.1) return 'due-soon'
  return 'ok'
}

export function componentLifecycle({ currentKm, installedAtKm, installedDate, part, nowMs = Date.now() }) {
  const usedKm = Math.max(0, (Number(currentKm) || 0) - (Number(installedAtKm) || 0))
  const date = installedDate ? new Date(`${installedDate}T00:00:00`) : null
  const usedDays = date && !Number.isNaN(date.getTime())
    ? Math.max(0, Math.floor((nowMs - date.getTime()) / DAY_MS))
    : 0
  const basis = part?.lifecycleBasis === 'time' ? 'time' : 'km'
  const configuredLife = basis === 'time' ? Number(part?.lifespanDays) : Number(part?.lifespanKm)
  const lifespan = configuredLife > 0 ? configuredLife : 1
  const used = basis === 'time' ? usedDays : usedKm
  const pct = used / lifespan
  return {
    usedKm, usedDays, used, lifespan, basis, pct, remaining: lifespan - used,
    status: partStatusOf(pct, part?.warningThresholdPct, part?.dueThresholdPct),
  }
}
