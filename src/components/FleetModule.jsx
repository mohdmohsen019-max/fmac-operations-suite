import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { Lock } from 'lucide-react';
import './fleet/FleetModule.css';
import { FleetSettingsProvider } from './fleet/FleetSettingsContext';
import { usePermissions } from '../hooks/usePermissions';

// Admin Views
import FleetDashboard from './fleet/FleetDashboard';
import FleetVehicles from './fleet/FleetVehicles';
import FleetMaintenance from './fleet/FleetMaintenance';
import FleetReports from './fleet/FleetReports';
import FleetRiskManagement from './fleet/FleetRiskManagement';
import FleetSettings from './fleet/FleetSettings';
import FuelIntelligence from './fleet/fuel/FuelIntelligence';
import FleetLiveMap from './fleet/FleetLiveMap';

export default function FleetModule() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t, lang } = useLanguage();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isTransitioning, setIsTransitioning] = useState(false);

  const { can } = usePermissions();
  const canView = can('fleet', 'view');
  const canEdit = can('fleet', 'edit');

  // Slug mapping
  const slugToTab = {
    'dashboard': 'dashboard',
    'vehicles': 'vehicles',
    'fuel-intelligence': 'fuel',
    'fuel': 'fuel',
    'users': 'users',
    'maintenance': 'maintenance',
    'reports': 'reports',
    'safety-behavior': 'risk',
    'risk': 'risk',
    'settings': 'settings',
    'livemap': 'livemap'
  };

  const tabToSlug = {
    'dashboard': 'dashboard',
    'vehicles': 'vehicles',
    'fuel': 'fuel-intelligence',
    'users': 'users',
    'maintenance': 'maintenance',
    'reports': 'reports',
    'risk': 'safety-behavior',
    'settings': 'settings',
    'livemap': 'livemap'
  };

  // Sync tab with URL
  useEffect(() => {
    const segments = location.pathname.split('/').filter(Boolean);
    if (segments[0] === 'fleet' && segments[1]) {
      const tab = slugToTab[segments[1]];
      if (tab && tab !== activeTab) {
        setActiveTab(tab);
      }
    }
  }, [location.pathname]);

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

  const allTabs = [
    { id: 'dashboard',   label: t('Overview', 'نظرة عامة'),              editOnly: false },
    { id: 'livemap',     label: t('Live Map', 'خريطة مباشرة'),           editOnly: false },
    { id: 'vehicles',    label: t('Ecosystem', 'النظام البيئي'),          editOnly: false },
    { id: 'fuel',        label: t('Fuel Core', 'جوهر الوقود'),           editOnly: false },
    { id: 'maintenance', label: t('Maintenance', 'الصيانة'),              editOnly: false },
    { id: 'risk',        label: t('Safety & Behavior', 'السلامة والسلوك'), editOnly: false },
    { id: 'reports',     label: t('Intelligence', 'الذكاء'),              editOnly: false },
    { id: 'settings',    label: t('System', 'النظام'),                    editOnly: true  },
  ];
  const adminTabs = allTabs.filter(tab => !tab.editOnly || canEdit);

  const handleTabChange = (tabId) => {
    if (tabId === activeTab || isTransitioning) return;
    
    // Update URL
    const slug = tabToSlug[tabId] || tabId;
    navigate(`/fleet/${slug}`);

    setIsTransitioning(true);
    setTimeout(() => {
      setActiveTab(tabId);
      setIsTransitioning(false);
    }, 300);
  };

  const renderContent = () => {
    const props = { canEdit };
    switch (activeTab) {
      case 'dashboard': return <FleetDashboard {...props} />;
      case 'vehicles': return <FleetVehicles {...props} />;
      case 'fuel': return <FuelIntelligence {...props} />;
      case 'maintenance': return <FleetMaintenance {...props} />;
      case 'reports': return <FleetReports {...props} />;
      case 'risk': return <FleetRiskManagement {...props} />;
      case 'settings': return <FleetSettings {...props} />;
      case 'livemap': return <FleetLiveMap {...props} />;
      default: return <FleetDashboard {...props} />;
    }
  };

  return (
    <FleetSettingsProvider>
      <motion.div 
        className="fleet-module-container"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <nav className="luxury-tab-rail" style={{ marginBottom: '20px', marginTop: '8px', marginLeft: '24px' }}>
          {adminTabs.map(tab => (
            <button 
              key={tab.id}
              className={`tab-item ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => handleTabChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <main className="main-content">
          <AnimatePresence mode="wait">
            {isTransitioning ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="view-loading"
              >
                <div className="app-loader"><span /><span /><span /><span /><span /></div>
              </motion.div>
            ) : (
              <motion.div 
                key={activeTab} 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
              >
                {renderContent()}
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </motion.div>
    </FleetSettingsProvider>
  );
}
