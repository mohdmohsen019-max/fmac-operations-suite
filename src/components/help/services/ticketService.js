import { db } from '../../../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

const generateTicketNumber = () => {
  const random = Math.floor(100000 + Math.random() * 900000);
  return `FMAC-2026-${random}`;
};

export const submitTicket = async (type, userInfo, details) => {
  const ticketNumber = generateTicketNumber();
  
  // Calculate SLA (48 hours from now)
  const slaDeadline = new Date(Date.now() + 48 * 60 * 60 * 1000);

  const requestData = {
    ticketNumber,
    type,
    status: 'new',
    priority: details.priority || details.urgency || 'Medium',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    slaDeadline,
    userInfo,
    serviceDetails: details,
    content: { description: details.description || details.subject || 'No description provided' },
    admin: {
      internalNotes: [],
      assignedTo: null
    }
  };

  try {
    // 1. Write to Firestore
    await addDoc(collection(db, 'requests'), requestData);

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
            From: ${userInfo.name} (${userInfo.phone})
            Branch: ${userInfo.branch}
            
            Description: ${details.description}
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
