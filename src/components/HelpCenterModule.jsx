import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { auth } from '../firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';

import './help/HelpCenter.css';

// Public Views
import HelpLanding from './help/public/HelpLanding';
import HelpFormWizard from './help/public/HelpFormWizard';
import HelpSuccess from './help/public/HelpSuccess';

// Admin Views
import HelpAdminDashboard from './help/admin/HelpAdminDashboard';
import HelpAdminTicket from './help/admin/HelpAdminTicket';

export default function HelpCenterModule({ onLogin, onSignUp }) {
  const [view, setView] = useState('landing');
  const [ticketData, setTicketData] = useState(null);
  const [adminUser, setAdminUser] = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setAdminUser(user);
      if (user && view === 'landing') {
        setView('admin-dashboard');
      }
      setIsInitializing(false);
    });
    return () => unsubscribe();
  }, [view]);

  const navigate = (newView, data = null) => {
    if (data) setTicketData(data);
    setView(newView);
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setView('landing');
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  if (isInitializing) {
    return (
      <div className="help-center-root" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <img src="/fmac-logo-new.png" alt="Loading" className="jumping-logo" style={{ filter: 'none' }} />
      </div>
    );
  }

  const renderView = () => {
    switch (view) {
      case 'landing':
        return <HelpLanding onNavigate={navigate} />;
      case 'submit':
        return <HelpFormWizard type={ticketData?.type} onNavigate={navigate} />;
      case 'success':
        return <HelpSuccess ticketId={ticketData?.ticketId} onNavigate={navigate} />;
      case 'admin-dashboard':
        return <HelpAdminDashboard onNavigate={navigate} onLogout={handleLogout} />;
      case 'admin-ticket':
        return <HelpAdminTicket ticketId={ticketData?.ticketId} onNavigate={navigate} />;
      default:
        return <HelpLanding onNavigate={navigate} />;
    }
  };

  return (
    <div className="help-center-root" style={{ position: 'relative' }}>


      <AnimatePresence mode="wait">
        <motion.div
          key={view}
          initial={{ opacity: 0, filter: 'blur(10px)' }}
          animate={{ opacity: 1, filter: 'blur(0px)' }}
          exit={{ opacity: 0, filter: 'blur(10px)' }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          style={{ width: '100%', minHeight: '100vh' }}
        >
          {renderView()}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
