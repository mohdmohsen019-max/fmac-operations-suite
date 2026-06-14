// Vercel serverless route — all client-triggered outbound email.
// Credentials (RESEND_API_KEY) live only here, never on the client.
//
// Request body: { type, payload, recipients: [{ name, email }], test?: bool }
// Response:     { results: [{ email, status: 'sent'|'failed', error? }] }

import { Resend } from 'resend';
import { buildSubject, buildTemplate } from './_templates.js';

const FROM = 'FMAC Operations <notifications@fmac.space>';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'RESEND_API_KEY not configured', results: [] });
    return;
  }

  const resend = new Resend(apiKey);
  const { type, payload = {}, recipients = [], test = false } = req.body || {};

  if (!type || !Array.isArray(recipients) || recipients.length === 0) {
    res.status(200).json({ results: [] });
    return;
  }

  const baseSubject = buildSubject(type, payload);
  const subject = test ? `[TEST] ${baseSubject}` : baseSubject;
  const html = buildTemplate(type, payload);

  const results = [];
  for (const recipient of recipients) {
    if (!recipient?.email) {
      results.push({ email: recipient?.email || '', status: 'failed', error: 'Missing email' });
      continue;
    }
    try {
      const { error } = await resend.emails.send({
        from: FROM,
        to: recipient.email,
        subject,
        html,
      });
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
