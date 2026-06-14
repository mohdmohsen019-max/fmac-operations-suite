// Vercel Cron route — fires 08:00 UAE (04:00 UTC) on the 1st of each month.
// Sends the monthly report reminder to the configured recipients and logs
// every send to notification_log. Uses Firebase Admin (server-side) so it can
// run without a signed-in user.

import { Resend } from 'resend';
import admin from 'firebase-admin';
import { buildSubject, buildTemplate } from './_templates.js';

const FROM = 'FMAC Operations <notifications@fmac.space>';

// ── Firebase Admin singleton ──────────────────────────────────────────
function getDb() {
  if (!admin.apps.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT not configured');
    const serviceAccount = JSON.parse(raw);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
  return admin.firestore();
}

function currentMonthLabel() {
  // Month/year in Gulf Standard Time so the label matches the local 1st-of-month.
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Dubai', month: 'long', year: 'numeric',
    }).format(new Date());
  } catch {
    const d = new Date();
    return d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  }
}

export default async function handler(req, res) {
  // Optional hardening: if CRON_SECRET is set, require Vercel's cron auth header.
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const db = getDb();

    // 1. Read config; bail if the cron is disabled.
    const cfgSnap = await db.collection('notification_config').doc('main').get();
    const cfg = cfgSnap.exists ? cfgSnap.data() : null;
    if (!cfg || cfg.monthly_reminder_enabled !== true) {
      res.status(200).json({ skipped: true, reason: 'monthly_reminder_enabled is not true' });
      return;
    }

    const recipients = Array.isArray(cfg?.recipients?.monthly_report_reminder)
      ? cfg.recipients.monthly_report_reminder
      : [];
    if (recipients.length === 0) {
      res.status(200).json({ skipped: true, reason: 'no recipients configured' });
      return;
    }

    const monthLabel = currentMonthLabel();
    const payload = { monthLabel };
    const type = 'monthly_report_reminder';
    const subject = buildSubject(type, payload);
    const html = buildTemplate(type, payload);

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error('RESEND_API_KEY not configured');
    const resend = new Resend(apiKey);

    const results = [];
    for (const recipient of recipients) {
      if (!recipient?.email) continue;
      let status = 'sent';
      let error = null;
      try {
        const r = await resend.emails.send({ from: FROM, to: recipient.email, subject, html });
        if (r.error) { status = 'failed'; error = r.error.message || String(r.error); }
      } catch (err) {
        status = 'failed';
        error = err?.message || String(err);
      }

      results.push({ email: recipient.email, status, error });

      // Log every send.
      try {
        await db.collection('notification_log').add({
          type,
          recipient_email: recipient.email,
          recipient_name: recipient.name || '',
          status,
          error: error || null,
          subject,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (logErr) {
        console.error('notification_log write failed:', logErr);
      }
    }

    res.status(200).json({ sent: results.filter(r => r.status === 'sent').length, results });
  } catch (err) {
    console.error('monthly-reminder failed:', err);
    res.status(500).json({ error: err?.message || String(err) });
  }
}
