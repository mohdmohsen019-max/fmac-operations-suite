const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const { Resend } = require('resend');
const { buildSubject, buildTemplate } = require('./_templates');

admin.initializeApp();

// RESEND_API_KEY lives only in Firebase secrets — never on the client.
// Set it with:  firebase functions:secrets:set RESEND_API_KEY
const RESEND_API_KEY = defineSecret('RESEND_API_KEY');
const CARTRACK_API_KEY = defineSecret('CARTRACK_API_KEY');
const CARTRACK_BASE_URL = 'https://fleetapi-me.cartrack.com/rest';

const FROM = 'FMAC Operations <notifications@fmac.space>';
const MASTER_ADMIN_EMAIL = 'admin@fmac.com';

// Only these notification types may ever be sent, and recipients are resolved
// server-side (see sendNotification) — never taken from the request body.
const ALLOWED_NOTIFICATION_TYPES = new Set([
  'new_ticket', 'escalated_ticket', 'inventory_low', 'monthly_report_reminder',
  'fleet_driver_changed', 'fleet_external_transport', 'fleet_overtime_logged',
  'fleet_fine_logged', 'fleet_registration_expiry', 'fleet_maintenance_completed',
]);
const MAX_RECIPIENTS = 50;

/* Authenticated Cartrack proxy. The vendor credential must never be bundled by
   Vite or sent to the browser. Only the small endpoint surface used by Fleet is
   allowed, and the upstream host is fixed to prevent this becoming an SSRF
   proxy. Configure with: firebase functions:secrets:set CARTRACK_API_KEY */
const CARTRACK_PATHS = [
  /^vehicles$/,
  /^vehicles\/status$/,
  /^vehicles\/[A-Za-z0-9_-]+\/events$/,
  /^trips$/,
  /^alerts$/,
  /^mifleet\/maintenance$/,
  /^vision\/livestream\/[A-Za-z0-9_-]+$/,
];

exports.cartrackProxy = onRequest(
  { cors: true, secrets: [CARTRACK_API_KEY], timeoutSeconds: 120 },
  async (req, res) => {
    if (!['GET', 'POST'].includes(req.method)) {
      res.status(405).json({ error: 'method_not_allowed' });
      return;
    }

    const bearer = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '');
    try {
      if (!bearer) throw new Error('missing token');
      await admin.auth().verifyIdToken(bearer);
    } catch {
      res.status(401).json({ error: 'unauthenticated' });
      return;
    }

    const path = String(req.path || '').replace(/^\/api\/cartrack\/?/, '').replace(/^\//, '');
    if (!CARTRACK_PATHS.some((pattern) => pattern.test(path))) {
      res.status(404).json({ error: 'unsupported_endpoint' });
      return;
    }

    const secret = CARTRACK_API_KEY.value();
    if (!secret) {
      res.status(503).json({ error: 'cartrack_not_configured' });
      return;
    }

    const upstream = new URL(`${CARTRACK_BASE_URL}/${path}`);
    for (const [key, value] of Object.entries(req.query || {})) {
      if (typeof value === 'string') upstream.searchParams.set(key, value);
    }

    try {
      const response = await fetch(upstream, {
        method: req.method,
        headers: {
          Authorization: `Basic ${secret}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: req.method === 'POST' ? JSON.stringify(req.body || {}) : undefined,
      });
      const text = await response.text();
      res.status(response.status).type(response.headers.get('content-type') || 'application/json').send(text);
    } catch (err) {
      console.error('Cartrack proxy failed:', err);
      res.status(502).json({ error: 'upstream_unavailable' });
    }
  },
);

/* ──────────────────────────────────────────────────────────────────────
   Master-admin: reset a user's password to the temporary default.
   (unchanged from the original setup)
─────────────────────────────────────────────────────────────────────── */
exports.adminSetTempPassword = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be authenticated');
  }
  if (request.auth.token.email !== MASTER_ADMIN_EMAIL) {
    throw new HttpsError('permission-denied', 'Only master admin can perform this action');
  }

  const { uid } = request.data;
  if (!uid) {
    throw new HttpsError('invalid-argument', 'uid is required');
  }

  await admin.auth().updateUser(uid, { password: '000000' });

  await admin.firestore().doc(`users/${uid}`).update({
    forcePasswordReset: true,
    tempPasswordSetAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { success: true };
});

/* ──────────────────────────────────────────────────────────────────────
   Client-triggered outbound email (was Vercel api/send-notification).
   The app POSTs to /api/send-notification; a Firebase Hosting rewrite maps
   that path to this function, so the client URL is unchanged.

   Request body: { type, payload, test?: bool }   (recipients are IGNORED)
   Response:     { results: [{ email, status: 'sent'|'failed', error? }] }

   SECURITY: This endpoint is public (a Hosting rewrite exposes it, and the
   public ticket form is unauthenticated, so we cannot require Firebase Auth
   here). To stop it being abused as an open spam/phishing relay, it NEVER
   trusts a client-supplied recipient list. The `type` must be one of a fixed
   allowlist, and recipients are resolved server-side from
   notification_config/main — so the worst an anonymous caller can do is
   trigger a known-format email to the club's own pre-configured staff
   addresses. (A future hardening is Firebase App Check on the client.)
─────────────────────────────────────────────────────────────────────── */
exports.sendNotification = onRequest(
  { cors: true, secrets: [RESEND_API_KEY] },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const apiKey = RESEND_API_KEY.value();
    if (!apiKey) {
      res.status(500).json({ error: 'RESEND_API_KEY not configured', results: [] });
      return;
    }

    const { type, payload = {}, test = false } = req.body || {};

    // Reject any type not on the allowlist — no arbitrary sends.
    if (!type || !ALLOWED_NOTIFICATION_TYPES.has(type)) {
      res.status(200).json({ results: [] });
      return;
    }

    // Resolve recipients server-side from the notification config; the request
    // body's `recipients` (if any) is deliberately ignored.
    let recipients = [];
    try {
      const snap = await admin.firestore().doc('notification_config/main').get();
      const config = snap.exists ? snap.data() : null;
      if (config && config[`enabled_${type}`] === false) {
        res.status(200).json({ results: [] });
        return;
      }
      const list = config && config.recipients ? config.recipients[type] : null;
      recipients = Array.isArray(list) ? list.filter((r) => r && r.email).slice(0, MAX_RECIPIENTS) : [];
    } catch (err) {
      res.status(500).json({ error: 'Failed to read notification config', results: [] });
      return;
    }

    if (recipients.length === 0) {
      res.status(200).json({ results: [] });
      return;
    }

    const resend = new Resend(apiKey);
    const baseSubject = buildSubject(type, payload);
    const subject = test ? `[TEST] ${baseSubject}` : baseSubject;
    const html = buildTemplate(type, payload);

    const results = [];
    for (const recipient of recipients) {
      try {
        const { error } = await resend.emails.send({ from: FROM, to: recipient.email, subject, html });
        if (error) {
          results.push({ email: recipient.email, status: 'failed', error: error.message || String(error) });
        } else {
          results.push({ email: recipient.email, status: 'sent' });
        }
      } catch (err) {
        results.push({ email: recipient.email, status: 'failed', error: err?.message || String(err) });
      }
    }

    res.status(200).json({ results });
  }
);

/* ──────────────────────────────────────────────────────────────────────
   Public ticket tracking (متابعة الطلب).
   The public form is unauthenticated and the Firestore rules deny anonymous
   reads of `requests`, so submitters cannot read their ticket directly. This
   function is the ONLY public read path: it takes a ticket number plus a
   lightweight identity proof (the last 4 digits of the phone used on submit)
   and returns a NON-PII status summary — never the name, phone, email or the
   full description. Wrong number or wrong digits both return { found:false }
   (indistinguishable) so the endpoint can't be used to enumerate tickets.

   Request body: { ticketNumber, verify }   (verify = last 4 phone digits)
   Exposed to the client via a Hosting rewrite: POST /api/track-ticket
─────────────────────────────────────────────────────────────────────── */
const onlyDigits = (s) => String(s || '').replace(/\D/g, '');
const toIso = (ts) => {
  try { return ts && ts.toDate ? ts.toDate().toISOString() : null; } catch { return null; }
};

exports.trackTicket = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { ticketNumber, verify } = req.body || {};
  const number = String(ticketNumber || '').trim().toUpperCase();
  const digits = onlyDigits(verify).slice(-4);

  // Basic shape checks — bail early, same generic answer as a real miss.
  if (!number || digits.length < 4) {
    res.status(200).json({ found: false });
    return;
  }

  try {
    const snap = await admin.firestore()
      .collection('requests')
      .where('ticketNumber', '==', number)
      .limit(1)
      .get();

    if (snap.empty) { res.status(200).json({ found: false }); return; }

    const d = snap.docs[0].data();

    // Identity proof: last-4 of the phone on the record. Fall back to deriving
    // it from userInfo.phone for older tickets written before track.phoneLast4.
    const expected = (d.track && d.track.phoneLast4) || onlyDigits(d.userInfo && d.userInfo.phone).slice(-4);
    if (!expected || expected !== digits) { res.status(200).json({ found: false }); return; }

    const createdAt = toIso(d.createdAt);
    const updatedAt = toIso(d.updatedAt);
    const escalatedAt = toIso(d.escalatedAt);
    /* A ticket that was closed and then REOPENED still carries resolvedAt /
       resolutionMinutes from that earlier closure. Only report them while the
       ticket is actually closed — otherwise the submitter is told their request
       is complete when it is back in the queue. */
    const isClosed = d.status === 'closed';
    const resolvedAt = isClosed ? toIso(d.resolvedAt) : null;

    // A privacy-safe progress timeline built from timestamps we already store.
    const timeline = [];
    if (createdAt) timeline.push({ key: 'received', at: createdAt });
    if (escalatedAt) timeline.push({ key: 'escalated', at: escalatedAt });
    if (d.status === 'progress' && !escalatedAt) timeline.push({ key: 'in_progress', at: updatedAt || createdAt });
    if (resolvedAt) timeline.push({ key: 'closed', at: resolvedAt });

    res.status(200).json({
      found: true,
      ticketNumber: number,
      type: d.type || null,
      status: d.status || 'new',
      // NOTE: priority is deliberately NOT returned — it is an internal staff
      // triage signal, never exposed to the submitter (no queue-jumping incentive).
      branch: (d.userInfo && d.userInfo.branch) || null,
      createdAt,
      updatedAt,
      slaDeadline: toIso(d.slaDeadline),
      resolvedAt,
      resolutionMinutes: isClosed && d.resolutionMinutes != null ? d.resolutionMinutes : null,
      hasSatisfaction: !!d.satisfaction,
      timeline,
    });
  } catch (err) {
    console.error('trackTicket failed:', err);
    res.status(500).json({ error: 'lookup_failed' });
  }
});

/* ──────────────────────────────────────────────────────────────────────
   Submission-experience rating (تقييم تجربة التقديم).
   Recorded by the submitter on the success screen, right after submitting —
   it rates the intake experience, NOT the resolution (that CSAT is captured
   by staff on the follow-up call and stored under `satisfaction`).

   The public form is unauthenticated and cannot update `requests`, so this
   function performs the write with admin credentials. It is intentionally
   low-stakes and defensive: rating must be an integer 1–5, and the write is
   first-write-wins (a ticket already rated is left untouched), so it can't be
   used to overwrite or inflate an existing rating.

   Request body: { ticketNumber, rating }   → { ok: true, already?: bool }
   Exposed via a Hosting rewrite: POST /api/rate-intake
─────────────────────────────────────────────────────────────────────── */
exports.rateIntake = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const { ticketNumber, rating } = req.body || {};
  const number = String(ticketNumber || '').trim().toUpperCase();
  const value = Number(rating);

  if (!number || !Number.isInteger(value) || value < 1 || value > 5) {
    res.status(400).json({ ok: false, error: 'invalid' });
    return;
  }

  try {
    const db = admin.firestore();
    const snap = await db.collection('requests').where('ticketNumber', '==', number).limit(1).get();
    if (snap.empty) { res.status(200).json({ ok: true }); return; } // don't reveal existence

    const ref = snap.docs[0].ref;
    const existing = snap.docs[0].data().intakeRating;
    if (existing && existing.value) { res.status(200).json({ ok: true, already: true }); return; }

    await ref.update({
      intakeRating: { value, ratedAt: admin.firestore.FieldValue.serverTimestamp() },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('rateIntake failed:', err);
    res.status(500).json({ ok: false, error: 'write_failed' });
  }
});

/* ──────────────────────────────────────────────────────────────────────
   Monthly report reminder (was the Vercel cron api/monthly-reminder).
   Fires 08:00 Asia/Dubai on the 1st of each month. Runs with the function's
   built-in admin credentials — no FIREBASE_SERVICE_ACCOUNT needed.
   Requires the Blaze plan (scheduled functions use Cloud Scheduler).
─────────────────────────────────────────────────────────────────────── */
function currentMonthLabel() {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Dubai', month: 'long', year: 'numeric',
    }).format(new Date());
  } catch {
    return new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });
  }
}

exports.monthlyReminder = onSchedule(
  { schedule: '0 8 1 * *', timeZone: 'Asia/Dubai', secrets: [RESEND_API_KEY] },
  async () => {
    const db = admin.firestore();

    // 1. Read config; bail if the reminder is disabled.
    const cfgSnap = await db.collection('notification_config').doc('main').get();
    const cfg = cfgSnap.exists ? cfgSnap.data() : null;
    if (!cfg || cfg.monthly_reminder_enabled !== true) {
      console.log('monthly-reminder skipped: monthly_reminder_enabled is not true');
      return;
    }

    const recipients = Array.isArray(cfg?.recipients?.monthly_report_reminder)
      ? cfg.recipients.monthly_report_reminder
      : [];
    if (recipients.length === 0) {
      console.log('monthly-reminder skipped: no recipients configured');
      return;
    }

    const monthLabel = currentMonthLabel();
    const type = 'monthly_report_reminder';
    const payload = { monthLabel };
    const subject = buildSubject(type, payload);
    const html = buildTemplate(type, payload);

    const apiKey = RESEND_API_KEY.value();
    if (!apiKey) throw new Error('RESEND_API_KEY not configured');
    const resend = new Resend(apiKey);

    let sent = 0;
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
      if (status === 'sent') sent += 1;

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

    console.log(`monthly-reminder: sent ${sent}/${recipients.length}`);
  }
);
