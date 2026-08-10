import { db } from '../../../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { sendNotification } from '../../../utils/notify';
import { slaHoursFor, businessDeadline } from '../helpConfig';
import { emptyDetailsFor, derivePriority, narrativeOf } from '../ticketSchema';

const generateTicketNumber = () => {
  const random = Math.floor(100000 + Math.random() * 900000);
  return `FMAC-2026-${random}`;
};

/* Keep only this type's own schema fields — the record can never carry another
   type's fields (the previous bug wrote the whole shared defaults object). */
const cleanDetailsFor = (type, details) => {
  const shell = emptyDetailsFor(type);
  const out = {};
  Object.keys(shell).forEach((key) => {
    const v = details?.[key];
    if (v === undefined || v === null) return;
    if (Array.isArray(v)) { if (v.length) out[key] = v; }
    else if (String(v).trim() !== '') out[key] = v;
  });
  return out;
};

/* Last 4 phone digits — the lightweight token the public tracking page checks. */
const phoneLast4 = (phone) => (String(phone || '').replace(/\D/g, '').slice(-4) || '');

export const submitTicket = async (type, userInfo, details) => {
  const ticketNumber = generateTicketNumber();

  // Only the selected type's fields make it into the record.
  const serviceDetails = cleanDetailsFor(type, details);

  // Committed service level for this request type (آلية الالتزام بمستويات الخدمة).
  // The deadline counts only open hours — Saturdays off, 09:00–21:00 Asia/Dubai.
  const slaTargetHours = slaHoursFor(type);
  const slaDeadline = businessDeadline(new Date(), slaTargetHours);

  // Initial priority hint for STAFF triage — derived from what the submitter
  // stated, on an explicit basis (never a blind "Medium"). Marked provisional
  // and never shown to the submitter, so there is no incentive to overstate the
  // severity to jump the queue; staff confirm/adjust it during triage.
  const { level, basisAr, basisEn } = derivePriority(type, details);

  // The narrative staff read first, sourced from the type's own narrative field.
  const description = narrativeOf(type, details) || 'No description provided';

  const requestData = {
    ticketNumber,
    type,
    status: 'new',
    priority: level,
    priorityProvisional: true,
    priorityBasis: { ar: basisAr, en: basisEn },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    slaTargetHours,
    slaDeadline,
    userInfo,
    serviceDetails,
    content: { description },
    // Public follow-up token — verified server-side by the trackTicket function.
    track: { phoneLast4: phoneLast4(userInfo?.phone) },
    admin: {
      internalNotes: [],
      assignedTo: null
    }
  };

  try {
    // 1. Write to Firestore
    await addDoc(collection(db, 'requests'), requestData);

    // 1b. Notify configured recipients (fire-and-forget, never blocks submit)
    try {
      sendNotification('new_ticket', {
        ticketId: ticketNumber,
        type,
        submittedAt: new Date().toISOString(),
      });
    } catch (notifyErr) {
      console.error('new_ticket notification failed silently:', notifyErr);
    }

    // 2. Email Notification (Web3Forms)
    const WEB3FORMS_KEY = import.meta.env.VITE_WEB3FORMS_KEY;
    if (WEB3FORMS_KEY) {
      await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_key: WEB3FORMS_KEY,
          subject: `New ${type.toUpperCase()} Request: ${ticketNumber}`,
          from_name: 'FMAC Unified Console',
          message: `
            A new request has been submitted to the Help Center.

            Ticket: ${ticketNumber}
            Type: ${type}
            Priority: ${level} (${basisEn})
            From: ${userInfo.name} (${userInfo.phone})
            Branch: ${userInfo.branch}

            Description: ${description}
          `
        })
      });
    }

    return ticketNumber;
  } catch (error) {
    console.error('Error submitting ticket:', error);
    throw error;
  }
};
