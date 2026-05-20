import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Home } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useParams, useNavigate } from 'react-router-dom';

export default function HelpSuccess() {
  const { ticketNumber } = useParams();
  const navigate = useNavigate();
  
  const { t } = useLanguage();

  useEffect(() => {
    document.title = "Request Submitted — FMAC Operations Suite";
  }, []);
  return (
    <div className="hc-container" style={{ padding: '8rem 2rem', textAlign: 'center' }}>
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", bounce: 0.5 }}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem' }}
      >
        <div style={{ color: 'var(--hc-success)', background: 'rgba(23, 178, 106, 0.1)', padding: '1rem', borderRadius: '50%' }}>
          <CheckCircle2 size={64} />
        </div>
        
        <h1 className="hc-title" style={{ fontSize: '2.5rem' }}>{t('Request Submitted', 'تم تقديم الطلب')}</h1>

        <p className="hc-subtitle" style={{ marginBottom: '2rem' }}>
          {t('Your request has been successfully received. Our operations team will review it and get back to you shortly.', 'تم استلام طلبك بنجاح. سيقوم فريق العمليات بمراجعته والرد عليك قريباً.')}
        </p>

        <div className="hc-card" style={{ padding: '2rem', minWidth: '300px', display: 'inline-block' }}>
          <p style={{ color: 'var(--hc-text-secondary)', fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
            {t('Your Ticket Number', 'رقم تذكرتك')}
          </p>
          <div style={{ fontSize: '2rem', fontWeight: 800, fontFamily: 'monospace', color: 'var(--hc-accent)' }}>
            {ticketNumber}
          </div>
        </div>

        <button 
          className="hc-btn hc-btn-primary" 
          style={{ marginTop: '3rem' }}
          onClick={() => navigate('/')}
        >
          <Home size={18} /> {t('Return Home', 'العودة للرئيسية')}
        </button>
      </motion.div>
    </div>
  );
}
