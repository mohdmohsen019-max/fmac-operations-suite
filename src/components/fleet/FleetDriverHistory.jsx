import React, { useState, useEffect } from 'react';
import { History, Calendar, Search, Loader2 } from 'lucide-react';
import { FleetTable, SectionTitle } from './FleetSharedUI';
import { db } from '../../firebase';
import { collection, query, orderBy, getDocs } from 'firebase/firestore';
import { useLanguage } from '../../contexts/LanguageContext';

export default function FleetDriverHistory() {
  const { t } = useLanguage();
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchTrips();
  }, []);

  const fetchTrips = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'trip_logs'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTrips(data);
    } catch (err) {
      console.error('Error fetching trips:', err);
    }
    setLoading(false);
  };

  const filteredTrips = trips.filter(trip =>
    trip.plateNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    trip.busNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    trip.destination?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalDistance = trips.reduce((acc, trip) => {
    const dist = (parseFloat(trip.endOdo) || 0) - (parseFloat(trip.startOdo) || 0);
    return acc + (dist > 0 ? dist : 0);
  }, 0);

  return (
    <div className="fleet-view-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <div className="fleet-kpi-label">{t('Personal Records', 'السجلات الشخصية')}</div>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, margin: 0 }}>{t('My Trip History', 'سجل رحلاتي')}</h1>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <div style={{ position: 'relative' }}>
            <Search style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#8888AA' }} size={16} />
            <input 
              type="text" 
              placeholder={t('Search my trips...', 'البحث في رحلاتي...')}
              className="fleet-input"
              style={{ paddingLeft: '40px', width: '240px' }}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="fleet-stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="fleet-kpi-card">
          <div className="fleet-kpi-label">{t('Total Trips', 'إجمالي الرحلات')}</div>
          <div className="fleet-kpi-value">{trips.length}</div>
        </div>
        <div className="fleet-kpi-card">
          <div className="fleet-kpi-label">{t('Total Distance', 'إجمالي المسافة')}</div>
          <div className="fleet-kpi-value">
            {Math.round(totalDistance).toLocaleString()}
            <span className="unit">km</span>
          </div>
        </div>
        <div className="fleet-kpi-card">
          <div className="fleet-kpi-label">{t('Safety Rating', 'تقييم السلامة')}</div>
          <div className="fleet-kpi-value" style={{ color: '#10B981' }}>94%</div>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '40px', display: 'flex', justifyContent: 'center' }}><div className="app-loader"><span /><span /><span /><span /><span /></div></div>
      ) : (
        <FleetTable 
          headers={[t('Date', 'التاريخ'), t('Vehicle', 'المركبة'), t('Type', 'النوع'), t('Start Odo', 'عداد البداية'), t('End Odo', 'عداد النهاية'), t('Distance', 'المسافة')]}
          data={filteredTrips}
          renderRow={(trip) => {
            const dist = (parseFloat(trip.endOdo) || 0) - (parseFloat(trip.startOdo) || 0);
            return (
              <tr key={trip.id}>
                <td className="mono" style={{ color: '#8888AA' }}>{trip.date}</td>
                <td style={{ fontWeight: 800 }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span>{trip.busNumber}</span>
                    <span style={{ fontSize: '0.7rem', color: '#8888AA' }}>{trip.plateNumber}</span>
                  </div>
                </td>
                <td>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{
                      background: trip.tripType === 'Internal' ? 'rgba(212, 175, 55, 0.1)' : 'rgba(255,255,255,0.05)',
                      color: trip.tripType === 'Internal' ? '#D4AF37' : '#FFFFFF',
                      padding: '4px 10px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', alignSelf: 'flex-start'
                    }}>
                      {trip.tripType === 'Internal' ? t('Internal', 'داخلي') : t('External', 'خارجي')}
                    </span>
                    {trip.tripType === 'External' && <span style={{ fontSize: '0.7rem', color: '#8888AA' }}>{t('to', 'إلى')}: {trip.destination}</span>}
                  </div>
                </td>
                <td className="mono">{parseFloat(trip.startOdo).toLocaleString()}</td>
                <td className="mono">{parseFloat(trip.endOdo).toLocaleString()}</td>
                <td className="mono" style={{ fontWeight: 800, color: '#D4AF37' }}>{dist > 0 ? dist.toLocaleString() : 0} km</td>
              </tr>
            );
          }}
        />
      )}
    </div>
  );
}

