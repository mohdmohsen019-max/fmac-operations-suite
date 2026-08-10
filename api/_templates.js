// Shared email subject + HTML template builders for FMAC notifications.
// Imported by the Vercel serverless routes only (api/send-notification.js,
// api/monthly-reminder.js). The leading underscore keeps Vercel from treating
// this file as an HTTP route.
//
// All HTML is INLINE-CSS only — email clients strip <style>/external sheets.

const APP_URL = 'https://operations.fmac.space';

const COLORS = {
  bg: '#080810',
  text: '#f0f0f8',
  muted: '#8b8b9e',
  gold: '#c9a84c',
  red: '#f43f5e',
  line: '#1a1a2e',
};

function fmtTime(value) {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return String(value);
  try {
    return d.toLocaleString('en-GB', {
      timeZone: 'Asia/Dubai',
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }) + ' GST';
  } catch {
    return d.toISOString();
  }
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Reusable building blocks ──────────────────────────────────────────
function button(href, label) {
  return `<a href="${href}" target="_blank" style="display:inline-block; background:#c9a84c; color:#080810; text-decoration:none; font-weight:700; font-size:14px; padding:13px 28px; border-radius:8px; letter-spacing:0.02em;">${esc(label)} →</a>`;
}

function row(label, value, valueColor) {
  return `<tr>
    <td style="padding:8px 0; font-size:13px; color:${COLORS.muted}; white-space:nowrap;">${esc(label)}</td>
    <td style="padding:8px 0 8px 18px; font-size:14px; font-weight:600; color:${valueColor || COLORS.text}; text-align:right;">${value}</td>
  </tr>`;
}

function wrap(innerHtml) {
  return `<div style="background:${COLORS.bg}; color:${COLORS.text}; font-family:Inter,Arial,Helvetica,sans-serif; max-width:600px; margin:0 auto; padding:32px;">
  <div style="border-bottom:2px solid ${COLORS.gold}; padding-bottom:16px; margin-bottom:24px;">
    <span style="font-size:22px; font-weight:700; color:${COLORS.gold};">FMAC</span>
    <span style="font-size:14px; color:${COLORS.muted}; margin-left:8px;">Operations Suite</span>
  </div>
  ${innerHtml}
  <div style="margin-top:32px; padding-top:16px; border-top:1px solid ${COLORS.line}; font-size:12px; color:${COLORS.muted};">
    Fujairah Martial Arts Club — This is an automated notification. Do not reply.
  </div>
</div>`;
}

function bigStat(value, color) {
  return `<div style="font-size:42px; font-weight:800; color:${color}; line-height:1; margin:4px 0 6px;">${esc(value)}</div>`;
}

// ── Subjects ──────────────────────────────────────────────────────────
export function buildSubject(type, payload = {}) {
  switch (type) {
    case 'new_ticket':
      return `New Ticket Received — ${payload.ticketId || ''}`.trim();
    case 'escalated_ticket':
      return `Ticket Escalated — ${payload.ticketId || ''}`.trim();
    case 'inventory_low':
      return `Low Stock Alert — ${payload.nameEn || payload.nameAr || ''}`.trim();
    case 'monthly_report_reminder':
      return `📋 Monthly Report Reminder — ${payload.monthLabel || ''}`.trim();
    default:
      return 'FMAC Operations Notification';
  }
}

// ── HTML bodies ───────────────────────────────────────────────────────
export function buildTemplate(type, payload = {}) {
  switch (type) {
    case 'new_ticket':
      return wrap(`
        <p style="font-size:13px; color:${COLORS.muted}; text-transform:uppercase; letter-spacing:0.12em; margin:0 0 4px;">New Help Desk Ticket</p>
        <p style="font-size:11px; color:${COLORS.muted}; margin:0;">Ticket ID</p>
        ${bigStat(payload.ticketId || '—', COLORS.gold)}
        <table style="width:100%; border-collapse:collapse; margin:18px 0 26px;">
          ${row('Type', `<span style="text-transform:capitalize;">${esc(payload.type || '—')}</span>`)}
          ${row('Submitted', fmtTime(payload.submittedAt))}
        </table>
        ${button(`${APP_URL}/help`, 'Open Help Desk')}
      `);

    case 'escalated_ticket':
      return wrap(`
        <p style="font-size:13px; color:${COLORS.red}; text-transform:uppercase; letter-spacing:0.12em; margin:0 0 4px;">Ticket Escalated to HOD</p>
        <p style="font-size:11px; color:${COLORS.muted}; margin:0;">Ticket ID</p>
        ${bigStat(payload.ticketId || '—', COLORS.gold)}
        <table style="width:100%; border-collapse:collapse; margin:18px 0 26px;">
          ${row('Type', `<span style="text-transform:capitalize;">${esc(payload.type || '—')}</span>`)}
          ${row('Escalated by', esc(payload.escalatedBy || '—'))}
          ${row('Escalated at', fmtTime(payload.escalatedAt))}
        </table>
        ${button(`${APP_URL}/help`, 'Review in Help Desk')}
      `);

    case 'inventory_low':
      return wrap(`
        <p style="font-size:13px; color:${COLORS.red}; text-transform:uppercase; letter-spacing:0.12em; margin:0 0 8px;">Low Stock Alert</p>
        <div style="font-size:20px; font-weight:700; color:${COLORS.text}; margin:0 0 2px;">${esc(payload.nameEn || '—')}</div>
        <div style="font-size:16px; color:${COLORS.muted}; direction:rtl; margin:0 0 14px;">${esc(payload.nameAr || '')}</div>
        <p style="font-size:11px; color:${COLORS.muted}; margin:0;">Current quantity</p>
        ${bigStat(payload.quantity != null ? payload.quantity : '—', COLORS.red)}
        <table style="width:100%; border-collapse:collapse; margin:14px 0 26px;">
          ${row('Threshold', esc(payload.threshold != null ? payload.threshold : '—'))}
          ${row('Category', esc(payload.category || '—'))}
        </table>
        ${button(`${APP_URL}/inventory`, 'Open Inventory')}
      `);

    case 'monthly_report_reminder':
      return wrap(`
        <p style="font-size:13px; color:${COLORS.gold}; text-transform:uppercase; letter-spacing:0.12em; margin:0 0 10px;">Monthly Report Reminder</p>
        <div style="font-size:24px; font-weight:800; color:${COLORS.text}; margin:0 0 14px;">${esc(payload.monthLabel || 'This Month')}</div>
        <p style="font-size:14px; line-height:1.7; color:${COLORS.text}; margin:0 0 8px;">
          This is a friendly reminder that the monthly department report sections for
          <strong style="color:${COLORS.gold};">${esc(payload.monthLabel || 'this month')}</strong>
          are now due.
        </p>
        <p style="font-size:14px; line-height:1.7; color:${COLORS.muted}; margin:0 0 26px;">
          Please prepare and submit your assigned sections so the Head of Operations can compile and approve the report on time.
        </p>
        ${button(`${APP_URL}/reports`, 'Go to Reports')}
      `);

    default:
      return wrap(`<p style="font-size:14px; color:${COLORS.text};">You have a new notification from FMAC Operations Suite.</p>`);
  }
}
