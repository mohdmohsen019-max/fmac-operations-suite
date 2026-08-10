/* ══════════════════════════════════════════════════════════════════════════
   Help Desk — service-level configuration & resolution-time helpers
   مستويات الخدمة وزمن الإنجاز

   Single source of truth for:
     • آلية الالتزام بمستويات الخدمة — per-service-type SLA targets
     • زمن الإنجاز — measured resolution time (createdAt → resolvedAt)
     • رضا المتعامل — satisfaction capture scale
   Used by ticketService (on submit), the admin ticket page (on close) and the
   admin dashboard (compliance + averages).
   ════════════════════════════════════════════════════════════════════════ */

/* Committed resolution targets, in hours, per service type. */
export const SLA_HOURS = {
  call: 4,          // طلب اتصال
  inquiry: 8,       // استفسار
  complaint: 24,    // شكوى
  maintenance: 48,  // بلاغ صيانة
  meeting: 72,      // طلب اجتماع (3 أيام)
  suggestion: 120,  // اقتراح (5 أيام)
}
export const SLA_DEFAULT_HOURS = 48

export const slaHoursFor = (type) => SLA_HOURS[type] ?? SLA_DEFAULT_HOURS

/* ── ساعات العمل — business-hours SLA clock ──────────────────────────────
   The club is CLOSED on Saturdays and open 09:00–21:00, Asia/Dubai. UAE has
   no daylight saving, so Dubai is a fixed UTC+4 — we shift instants by +4h and
   read the UTC fields to get the local wall clock, with no DST edge cases.
   SLA targets are consumed only during open hours, so a request filed at 20:00
   is due the next open morning — never at 04:00 while the club is shut.        */
export const BIZ = {
  openHour: 9,
  closeHour: 21,
  closedDays: [6],               // 0=Sun … 5=Fri, 6=Sat  → Saturday only
  offsetMs: 4 * 60 * 60 * 1000,  // Asia/Dubai, fixed UTC+4 (no DST)
}

const isClosedDay = (d) => BIZ.closedDays.includes(d.getUTCDay())

/* Next OPEN day at 09:00, in the +4-shifted frame. Skips closed days. */
const nextOpen09 = (d) => {
  let nd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, BIZ.openHour, 0, 0))
  let guard = 0
  while (isClosedDay(nd) && guard++ < 14) {
    nd = new Date(Date.UTC(nd.getUTCFullYear(), nd.getUTCMonth(), nd.getUTCDate() + 1, BIZ.openHour, 0, 0))
  }
  return nd
}

/* Deadline = `from` + `hours` of OPEN time. Returns a real instant (Date). */
export const businessDeadline = (from, hours) => {
  let remaining = Math.max(0, hours) * 3600 * 1000
  let d = new Date(from.getTime() + BIZ.offsetMs) // shifted frame
  let guard = 0
  while (guard++ < 5000) {
    const y = d.getUTCFullYear(), m = d.getUTCMonth(), date = d.getUTCDate()
    const open = Date.UTC(y, m, date, BIZ.openHour, 0, 0)
    const close = Date.UTC(y, m, date, BIZ.closeHour, 0, 0)
    const cur = d.getTime()
    if (isClosedDay(d) || cur >= close) { d = nextOpen09(d); continue }
    if (cur < open) { d = new Date(open); continue }
    const avail = close - cur
    if (remaining <= avail) { d = new Date(cur + remaining); break }
    remaining -= avail
    d = nextOpen09(d)
  }
  return new Date(d.getTime() - BIZ.offsetMs) // back to a real instant
}

/* Open minutes elapsed between two instants (skips Saturdays & closed hours). */
export const businessMinutesBetween = (start, end) => {
  if (!start || !end || end <= start) return 0
  let total = 0
  let d = new Date(start.getTime() + BIZ.offsetMs)
  const endShift = end.getTime() + BIZ.offsetMs
  let guard = 0
  while (d.getTime() < endShift && guard++ < 20000) {
    const y = d.getUTCFullYear(), m = d.getUTCMonth(), date = d.getUTCDate()
    const open = Date.UTC(y, m, date, BIZ.openHour, 0, 0)
    const close = Date.UTC(y, m, date, BIZ.closeHour, 0, 0)
    const cur = d.getTime()
    if (isClosedDay(d) || cur >= close) { d = nextOpen09(d); continue }
    if (cur < open) { d = new Date(open); continue }
    const segEnd = Math.min(close, endShift)
    total += segEnd - cur
    d = segEnd >= close ? nextOpen09(d) : new Date(segEnd)
  }
  return Math.round(total / 60000)
}

export const TYPE_LABEL = {
  complaint:   { en: 'Complaint',   ar: 'شكوى' },
  inquiry:     { en: 'Inquiry',     ar: 'استفسار' },
  suggestion:  { en: 'Suggestion',  ar: 'اقتراح' },
  meeting:     { en: 'Meeting',     ar: 'طلب اجتماع' },
  call:        { en: 'Call',        ar: 'طلب اتصال' },
  maintenance: { en: 'Maintenance', ar: 'بلاغ صيانة' },
}

const toMs = (t) => {
  if (!t) return 0
  const d = t?.toDate ? t.toDate() : new Date(t)
  const ms = d.getTime()
  return Number.isNaN(ms) ? 0 : ms
}

/* Resolution time in minutes. Prefers the stored value; otherwise derives it
   from createdAt → resolvedAt so older records still report correctly.

   A resolution time only exists for a CLOSED ticket. A ticket that was closed
   and then reopened can still carry measurements from that earlier closure —
   reporting them would claim a ticket was resolved when it is back in the
   queue, and would poison the dashboard's averages and SLA compliance. */
export const resolutionMinutesOf = (ticket) => {
  if (ticket?.status !== 'closed') return null
  if (ticket?.resolutionMinutes != null) return ticket.resolutionMinutes
  const a = toMs(ticket?.createdAt), b = toMs(ticket?.resolvedAt)
  if (!a || !b || b < a) return null
  return Math.round((b - a) / 60000)
}

/* Was the committed service level met? null when not yet resolved.
   Measured in OPEN minutes (Sat off, 09:00–21:00) so it matches the business-
   hours deadline — a ticket resolved by the next open morning isn't "breached"
   just because the clock ran overnight. Stored `slaMet` (written at close by
   the admin) wins when present; otherwise we derive it from the timestamps. */
export const slaMetOf = (ticket) => {
  // Same reopen guard as resolutionMinutesOf — an unresolved ticket has no verdict.
  if (ticket?.status !== 'closed') return null
  if (typeof ticket?.slaMet === 'boolean') return ticket.slaMet
  const a = toMs(ticket?.createdAt), b = toMs(ticket?.resolvedAt)
  if (!a || !b || b < a) return null
  const target = (ticket?.slaTargetHours ?? slaHoursFor(ticket?.type)) * 60
  return businessMinutesBetween(new Date(a), new Date(b)) <= target
}

/* Human duration: "45 د" · "3 س 20 د" · "2 ي 4 س" */
export const fmtDuration = (minutes, lang = 'ar') => {
  if (minutes == null || Number.isNaN(minutes)) return '—'
  const m = Math.max(0, Math.round(minutes))
  const u = lang === 'ar' ? { d: 'ي', h: 'س', m: 'د' } : { d: 'd', h: 'h', m: 'm' }
  if (m < 60) return `${m} ${u.m}`
  const h = Math.floor(m / 60), rm = m % 60
  if (h < 24) return rm ? `${h} ${u.h} ${rm} ${u.m}` : `${h} ${u.h}`
  const d = Math.floor(h / 24), rh = h % 24
  return rh ? `${d} ${u.d} ${rh} ${u.h}` : `${d} ${u.d}`
}

/* Aggregate helpers for the dashboard */
export const avgResolutionMinutes = (tickets) => {
  const vals = tickets.map(resolutionMinutesOf).filter(v => v != null)
  if (!vals.length) return null
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
}
export const slaCompliancePct = (tickets) => {
  const vals = tickets.map(slaMetOf).filter(v => v != null)
  if (!vals.length) return null
  return Math.round((vals.filter(Boolean).length / vals.length) * 1000) / 10
}

/* ── رضا المتعامل — satisfaction captured by staff on the follow-up call ── */
export const CSAT_SCALE = [
  { value: 1, en: 'Very dissatisfied', ar: 'غير راضٍ إطلاقاً', hex: '#dc2626' },
  { value: 2, en: 'Dissatisfied',      ar: 'غير راضٍ',        hex: '#ea580c' },
  { value: 3, en: 'Neutral',           ar: 'محايد',           hex: '#d97706' },
  { value: 4, en: 'Satisfied',         ar: 'راضٍ',            hex: '#65a30d' },
  { value: 5, en: 'Very satisfied',    ar: 'راضٍ جداً',       hex: '#16a34a' },
]
export const csatMetaOf = (v) => CSAT_SCALE.find(c => c.value === Number(v)) || null

/* ── تجربة التقديم — submission-experience rating (emoji, set by the submitter
   on the success screen, stored as intakeRating.value). Distinct from the
   resolution CSAT above: it measures the intake channel, and it populates
   immediately (no follow-up call needed). Shared by the success page & admin. */
export const INTAKE_SCALE = [
  { value: 1, emoji: '😞', ar: 'سيئة',   en: 'Poor',      hex: '#dc2626' },
  { value: 2, emoji: '🙁', ar: 'ضعيفة',  en: 'Fair',      hex: '#ea580c' },
  { value: 3, emoji: '😐', ar: 'مقبولة', en: 'Okay',      hex: '#d97706' },
  { value: 4, emoji: '🙂', ar: 'جيدة',   en: 'Good',      hex: '#65a30d' },
  { value: 5, emoji: '😍', ar: 'ممتازة', en: 'Excellent', hex: '#16a34a' },
]
export const intakeMetaOf = (v) => INTAKE_SCALE.find(f => f.value === Number(v)) || null
export const avgIntakeRating = (tickets) => {
  const vals = tickets.map(t => t?.intakeRating?.value).filter(v => v != null).map(Number)
  if (!vals.length) return null
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
}

/* Average satisfaction (1–5) and % satisfied (4–5) across tickets. */
export const avgCsat = (tickets) => {
  const vals = tickets.map(t => t?.satisfaction?.rating).filter(v => v != null).map(Number)
  if (!vals.length) return null
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
}
export const csatSatisfiedPct = (tickets) => {
  const vals = tickets.map(t => t?.satisfaction?.rating).filter(v => v != null).map(Number)
  if (!vals.length) return null
  return Math.round((vals.filter(v => v >= 4).length / vals.length) * 1000) / 10
}
