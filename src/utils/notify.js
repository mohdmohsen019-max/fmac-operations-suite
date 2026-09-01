// Fire-and-forget client notification helper.
//
// Reads the recipient list for `type` from notification_config/main, posts to
// the server route (which holds the Resend key), then logs each result to
// notification_log. ALWAYS wrapped in try/catch — a notification failure must
// never block or delay the user action that triggered it.

import { db } from '../firebase';
import { doc, getDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';

// Mirror of the server-side subject builder (kept tiny + secret-free) so the
// log records the same subject the email used. Templates/HTML stay server-only.
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
    case 'fleet_driver_changed': return `Fleet Driver Changed — ${payload.registration || ''}`.trim();
    case 'fleet_external_transport': return `External Transportation Logged — ${payload.registration || ''}`.trim();
    case 'fleet_overtime_logged': return `Driver Overtime Logged — ${payload.personName || ''}`.trim();
    case 'fleet_fine_logged': return `Traffic Fine Logged — ${payload.registration || payload.driverName || ''}`.trim();
    case 'fleet_registration_expiry': return `Vehicle Renewal Attention — ${payload.registration || ''}`.trim();
    case 'fleet_maintenance_completed': return `Preventive Maintenance Completed — ${payload.registration || ''}`.trim();
    default:
      return 'FMAC Operations Notification';
  }
}

/**
 * Send a notification of `type` with `payload`. Optionally pass
 * { test: true, recipients } to bypass the config lookup (used by the test
 * button to target a specific section's recipients).
 */
export async function sendNotification(type, payload = {}, opts = {}) {
  try {
    let recipients = opts.recipients;
    const enabledByDefault = true;

    if (!recipients) {
      const configSnap = await getDoc(doc(db, 'notification_config', 'main'));
      const config = configSnap.exists() ? configSnap.data() : null;

      // Per-type enable flag (only the monthly cron has a separate flag; the
      // in-app types are toggled via `enabled_<type>` in config).
      if (config?.[`enabled_${type}`] === false) return;

      recipients = config?.recipients?.[type] || [];
    }

    if (!recipients.length) return; // nothing configured — skip silently

    const res = await fetch('/api/send-notification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, payload, recipients, test: !!opts.test }),
    });

    let results = [];
    let data = null;
    try {
      data = await res.json();
    } catch { /* non-JSON response (e.g. proxy error page) */ }
    results = Array.isArray(data?.results) ? data.results : [];

    // We only fetch when recipients exist, so zero results = the server never
    // attempted a send. Log the reason per recipient instead of logging nothing.
    if (results.length === 0 && recipients.length > 0) {
      const reason = data?.error || `No response from server (HTTP ${res.status})`;
      results = recipients.map(r => ({ email: r.email, status: 'failed', error: reason }));
    }

    const subject = (opts.test ? '[TEST] ' : '') + buildSubject(type, payload);
    const byEmail = Object.fromEntries(recipients.map(r => [r.email, r.name || '']));

    for (const result of results) {
      try {
        await addDoc(collection(db, 'notification_log'), {
          type,
          recipient_email: result.email || '',
          recipient_name: byEmail[result.email] || '',
          status: result.status || 'failed',
          error: result.error || null,
          subject,
          timestamp: serverTimestamp(),
        });
      } catch (logErr) {
        console.error('notification_log write failed:', logErr);
      }
    }
  } catch (err) {
    console.error('Notification failed silently:', err);
    // never block the main action
  }
}
