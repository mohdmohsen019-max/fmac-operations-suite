import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './FuelIntelligence.css';

// Components
import FuelDashboard from './FuelDashboard';
import FuelVehicleDetail from './FuelVehicleDetail';

export default function FuelIntelligence() {
  const [view, setView] = useState('dashboard'); // 'dashboard', 'vehicle-detail'
  const [selectedVehicle, setSelectedVehicle] = useState(null);

  const navigateToVehicle = (vehicle) => {
    setSelectedVehicle(vehicle);
    setView('vehicle-detail');
  };

  const backToDashboard = () => {
    setView('dashboard');
    setSelectedVehicle(null);
  };

  return (
    <div className="fuel-module-container">
      <div className="fuel-grid-bg" />
      
      <AnimatePresence mode="wait">
        {view === 'dashboard' ? (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.4 }}
          >
            <FuelDashboard onSelectVehicle={navigateToVehicle} />
          </motion.div>
        ) : (
          <motion.div
            key="detail"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.4 }}
          >
            <FuelVehicleDetail 
              vehicle={selectedVehicle} 
              onBack={backToDashboard} 
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
