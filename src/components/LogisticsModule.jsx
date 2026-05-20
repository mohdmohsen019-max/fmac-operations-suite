import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import './LogisticsModule.css';
import { useLanguage } from '../contexts/LanguageContext';
import { useLocation, useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import Dashboard from './Dashboard';
import AttendanceHistory from './AttendanceHistory';
import AnalyticsView from './AnalyticsView';
import TransportationModule from './TransportationModule';
import { usePermissions } from '../hooks/usePermissions';

export default function LogisticsModule() {
  const { t, lang } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;
  const [activeTab, setActiveTab] = useState('dashboard');
  const [displayedTab, setDisplayedTab] = useState('dashboard');
  const [isTransitioning, setIsTransitioning] = useState(false);

  const { can } = usePermissions();
  const canView = can('logistics', 'view');
  const canEdit = can('logistics', 'edit');

  // Slug mapping
  const slugToTab = {
    'dashboard': 'dashboard',
    'attendance': 'dashboard',
    'history': 'history',
    'analytics': 'analytics',
    'transportation': 'transportation'
  };

  const tabToSlug = {
    'dashboard': 'attendance',
    'history': 'history',
    'analytics': 'analytics',
    'transportation': 'transportation'
  };

  // Sync tab with URL
  useEffect(() => {
    const segments = currentPath.split('/').filter(Boolean);
    if (segments[0] === 'logistics' && segments[1]) {
      const tab = slugToTab[segments[1]];
      if (tab && tab !== activeTab) {
        setActiveTab(tab);
        setDisplayedTab(tab);
      }
    }
  }, [currentPath]);

  if (!canView) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '16px', color: 'var(--theme-text-muted)' }}>
        <Lock size={48} opacity={0.3} />
        <p style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>
          {lang === 'ar' ? 'ليس لديك صلاحية الوصول لهذا القسم' : 'You do not have access to this module'}
        </p>
        <p style={{ fontSize: '13px', margin: 0 }}>
          {lang === 'ar' ? 'تواصل مع المدير لطلب الصلاحية' : 'Contact your administrator for access'}
        </p>
      </div>
    );
  }

  const handleTabChange = (tabId) => {
    if (tabId === activeTab || isTransitioning) return;
    
    // Update URL
    const slug = tabToSlug[tabId] || tabId;
    navigate(`/logistics/${slug}`);

    setActiveTab(tabId);
    setIsTransitioning(true);
    
    setTimeout(() => {
      setDisplayedTab(tabId);
      setIsTransitioning(false);
    }, 300);
  };

  const renderContent = () => {
    const props = { canEdit };
    switch (displayedTab) {
      case 'dashboard':
        return <Dashboard {...props} />;
      case 'history':
        return <AttendanceHistory {...props} />;
      case 'analytics':
        return <AnalyticsView {...props} />;
      case 'transportation':
        return <TransportationModule {...props} />;
      default:
        return <Dashboard {...props} />;
    }
  };

  return (
    <motion.div 
      className="logistics-module-container"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="main-layout">
        <nav className="luxury-tab-rail animate-fade-in" style={{ animationDelay: '0.1s', marginLeft: '24px', marginTop: '8px', marginBottom: '20px' }}>
          <button 
            className={`tab-item ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => handleTabChange('dashboard')}
          >
            {t('Attendance', 'الحضور')}
          </button>

          <button
            className={`tab-item ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => handleTabChange('history')}
          >
            {t('History', 'السجل')}
          </button>

          <button
            className={`tab-item ${activeTab === 'analytics' ? 'active' : ''}`}
            onClick={() => handleTabChange('analytics')}
          >
            {t('Analytics', 'التحليلات')}
          </button>

          <button
            className={`tab-item ${activeTab === 'transportation' ? 'active' : ''}`}
            onClick={() => handleTabChange('transportation')}
          >
            {t('Transportation', 'النقل')}
          </button>
        </nav>

        <main className="main-content">
          {isTransitioning ? (
            <div className="view-loading">
              <div className="app-loader"><span /><span /><span /><span /><span /></div>
            </div>
          ) : (
            <motion.div 
              key={displayedTab} 
              className="view-wrapper"
              initial={{ opacity: 0, scale: 0.98, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            >
              {renderContent()}
            </motion.div>
          )}
        </main>
      </div>
    </motion.div>
  );
}
