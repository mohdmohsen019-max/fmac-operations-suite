// Requires VITE_RESET_PASSCODE in environment
import { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { db } from '../firebase';
import { useLanguage } from '../contexts/LanguageContext';
import { usePermissions } from '../hooks/usePermissions';
import { collection, query, doc, writeBatch, getDoc, getDocs, serverTimestamp, where } from 'firebase/firestore';
import AttendanceTable from './AttendanceTable';
import CustomSelect from './CustomSelect';
import CustomDateInput from './CustomDateInput';
import ConfirmModal from './ConfirmModal';
import './Dashboard.css';

const CLASS_TIMINGS = [
  '04:30 PM - 05:30 PM',
  '05:30 PM - 07:00 PM',
  '07:00 PM - 09:00 PM'
];

export default function Dashboard() {
  const { t } = useLanguage();
  const { can } = usePermissions();
  const canEdit = can('logistics', 'edit');
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSport, setFilterSport] = useState('All');
  
  // Scoped Session State
  const [selectedDate, setSelectedDate] = useState(new Date().toLocaleDateString('en-CA'));
  const [selectedTiming, setSelectedTiming] = useState(CLASS_TIMINGS[0]);
  const [sessionData, setSessionData] = useState({}); // { [playerId]: { status, transportation } }
  const [sessionExists, setSessionExists] = useState(false);
  const [lastSavedBy, setLastSavedBy] = useState('');

  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [missingTransportModal, setMissingTransportModal] = useState({ isOpen: false, players: [] });
  const [overwriteModalOpen, setOverwriteModalOpen] = useState(false);

  // 1. Fetch Players and Session Data
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch players for this timing
        const pQuery = query(collection(db, "players_v2"), where("classTiming", "==", selectedTiming));
        const pSnapshot = await getDocs(pQuery);
        const playersList = pSnapshot.docs.map(d => ({
          ...d.data(),
          firestoreId: d.id
        }));
        setPlayers(playersList);

        // Fetch existing session
        const sessionId = `${selectedDate}_${selectedTiming.replace(/\s+/g, '')}`;
        const sessionRef = doc(db, "sessions", sessionId);
        const sessionSnap = await getDoc(sessionRef);

        if (sessionSnap.exists()) {
          setSessionExists(true);
          setLastSavedBy(sessionSnap.data().recordedBy || 'Coach');
          
          const attQuery = collection(db, "sessions", sessionId, "attendance");
          const attSnapshot = await getDocs(attQuery);
          const attMap = {};
          attSnapshot.forEach(d => {
            attMap[d.id] = d.data();
          });
          setSessionData(attMap);
        } else {
          setSessionExists(false);
          setLastSavedBy('');
          setSessionData({});
        }
      } catch (err) {
        console.error("Error fetching data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [selectedDate, selectedTiming]);

  const handleToggleStatus = (playerId) => {
    setSessionData(prev => {
      const current = prev[playerId] || { status: 'absent', transportation: '' };
      const newStatus = current.status === 'present' ? 'absent' : 'present';
      return {
        ...prev,
        [playerId]: {
          ...current,
          status: newStatus,
          transportation: newStatus === 'absent' ? '' : current.transportation
        }
      };
    });
  };

  const handleChangeTransport = (playerId, newTransport) => {
    setSessionData(prev => ({
      ...prev,
      [playerId]: {
        ...(prev[playerId] || { status: 'absent' }),
        transportation: newTransport
      }
    }));
  };

  const handleSaveAttendance = async () => {
    // Validate transport
    const presentPlayers = players.filter(p => sessionData[p.firestoreId]?.status === 'present');
    const invalid = presentPlayers.filter(p => !sessionData[p.firestoreId]?.transportation);
    
    if (invalid.length > 0) {
      setMissingTransportModal({ isOpen: true, players: invalid });
      return;
    }

    if (sessionExists) {
      setOverwriteModalOpen(true);
    } else {
      performSave();
    }
  };

  const performSave = async () => {
    setIsSaving(true);
    setSaveMessage(t('Saving session...', 'جارٍ حفظ الجلسة...'));
    setOverwriteModalOpen(false);

    try {
      const sessionId = `${selectedDate}_${selectedTiming.replace(/\s+/g, '')}`;
      const batch = writeBatch(db);

      // 1. Create/Update main session doc
      const sessionRef = doc(db, "sessions", sessionId);
      batch.set(sessionRef, {
        date: selectedDate,
        classTiming: selectedTiming,
        createdAt: serverTimestamp(),
        recordedBy: "Operations Coach", // Placeholder for auth context
        presentCount: presentPlayersCount,
        totalPlayers: players.length
      });

      // 2. Save attendance subcollection
      players.forEach(p => {
        const data = sessionData[p.firestoreId] || { status: 'absent', transportation: '' };
        const attRef = doc(db, "sessions", sessionId, "attendance", p.firestoreId);
        batch.set(attRef, {
          playerId: p.id,
          playerName: p.name,
          status: data.status,
          transportation: data.transportation || '',
          coach: p.coach,
          sport: p.sports?.[0] || p.sport || 'N/A'
        });
      });

      await batch.commit();
      setSessionExists(true);
      setSaveMessage(t('✅ Session Saved Successfully!', '✅ تم حفظ الجلسة بنجاح!'));
      setTimeout(() => setSaveMessage(''), 4000);
    } catch (err) {
      console.error(err);
      setSaveMessage(t('❌ Error saving session', '❌ خطأ في حفظ الجلسة'));
    } finally {
      setIsSaving(false);
    }
  };

  // UI Derived State
  const sports = useMemo(() => {
    const s = new Set();
    players.forEach(p => {
      if (p.sports) p.sports.forEach(x => s.add(x));
      else if (p.sport) s.add(p.sport);
    });
    return ['All', ...Array.from(s).sort()];
  }, [players]);

  const filteredPlayers = useMemo(() => {
    return players.filter(p => {
      const matchesSearch = (p.name || '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchesSport = filterSport === 'All' || (p.sports ? p.sports.includes(filterSport) : p.sport === filterSport);
      return matchesSearch && matchesSport;
    });
  }, [players, searchQuery, filterSport]);

  const playersWithStatus = useMemo(() => {
    return filteredPlayers.map(p => ({
      ...p,
      status: sessionData[p.firestoreId]?.status || 'absent',
      transportation: sessionData[p.firestoreId]?.transportation || ''
    }));
  }, [filteredPlayers, sessionData]);

  const presentPlayersCount = useMemo(() => {
    return Object.values(sessionData).filter(s => s.status === 'present').length;
  }, [sessionData]);

  return (
    <div className="dashboard-container">
      <div className="dashboard-grid">
        <div className="stats-bento">
          <div className="stat-card glass-panel animate-fade-in" style={{animationDelay: '0.1s'}}>
            <div className="stat-header"><h3>{t('Session Roster', 'قائمة الجلسة')}</h3></div>
            <div className="stat-value">{players.length}</div>
            <p className="stat-label">{t('Operatives', 'المشغّلون')}</p>
          </div>

          <div className="stat-card glass-panel animate-fade-in" style={{animationDelay: '0.2s'}}>
            <div className="stat-header"><h3>{t('Present', 'الحاضرون')}</h3></div>
            <div className="stat-value text-present">{presentPlayersCount}</div>
            <p className="stat-label">{t('Active Field', 'في الميدان')}</p>
          </div>

          <div className="stat-card glass-panel animate-fade-in" style={{animationDelay: '0.3s'}}>
            <div className="stat-header"><h3>{t('Absent', 'الغائبون')}</h3></div>
            <div className="stat-value text-absent">{players.length - presentPlayersCount}</div>
            <p className="stat-label">{t('Pending', 'معلق')}</p>
          </div>

          <div className="stat-card glass-panel animate-fade-in" style={{animationDelay: '0.4s'}}>
            <div className="stat-header"><h3>{t('Telemetry', 'التتبع')}</h3></div>
            <div className="stat-value" style={{ fontSize: '1.2rem' }}>{sessionExists ? t('RECORDED', 'مُسجَّل') : t('PENDING', 'قيد الانتظار')}</div>
            <p className="stat-label">{sessionExists ? `${t('Auth', 'بواسطة')}: ${lastSavedBy}` : t('Unsigned Data', 'بيانات غير موقّعة')}</p>
          </div>
        </div>

        <div className="chart-bento glass-panel animate-fade-in" style={{animationDelay: '0.5s'}}>
          <div className="chart-header">
            <h3 className="chart-title">{t('Mission Parameters', 'معاملات المهمة')}</h3>
          </div>
          <div className="session-selector-pane">
             <CustomDateInput
                label={t('Operation Date', 'تاريخ العملية')}
                value={selectedDate}
                max={new Date().toLocaleDateString('en-CA')}
                onChange={setSelectedDate}
             />
             <div className="selector-group">
                <label>{t('Deployment Window', 'نافذة التوقيت')}</label>
                <div className="timing-pills">
                  {CLASS_TIMINGS.map(timing => (
                    <button
                      key={timing}
                      className={`timing-pill ${selectedTiming === timing ? 'active' : ''}`}
                      onClick={() => setSelectedTiming(timing)}
                    >
                      {timing}
                    </button>
                  ))}
                </div>
             </div>
          </div>
        </div>
      </div>

      <div className="controls-panel">
        <div className="search-box">
          <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input 
            type="text" 
            placeholder={t('Filter session roster...', 'تصفية قائمة الجلسة...')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
        </div>
        <div className="filter-actions">
          <CustomSelect 
            value={filterSport} 
            onChange={setFilterSport}
            options={sports}
            className="sport-dropdown"
          />
          {canEdit && (
            <button
              className="btn-premium"
              onClick={handleSaveAttendance}
              disabled={isSaving || loading}
            >
              {isSaving ? t('Processing...', 'جارٍ المعالجة...') : `${t('Commit Data', 'تسجيل البيانات')} (${presentPlayersCount})`}
            </button>
          )}
          {saveMessage && <span className="save-msg animate-fade-in">{saveMessage}</span>}
        </div>
      </div>
      <div className="table-container">
        {loading ? (
          <div className="view-loading">
            <div className="app-loader"><span /><span /><span /><span /><span /></div>
          </div>
        ) : (
          <AttendanceTable
            players={playersWithStatus}
            onToggleStatus={canEdit ? handleToggleStatus : undefined}
            onChangeTransport={canEdit ? handleChangeTransport : undefined}
            canEdit={canEdit}
          />
        )}
      </div>

      {/* MISSING TRANSPORT MODAL */}
      {missingTransportModal.isOpen && createPortal(
        <div className="custom-modal-overlay animate-fade-in">
          <div className="custom-modal glass-panel animate-pop-in">
            <div className="modal-header">
              <div className="modal-title-group">
                <span className="modal-icon" style={{ color: 'var(--theme-crimson)' }}>!</span>
                <h3>{t('Logistics Discrepancy', 'خلل في اللوجستيات')}</h3>
              </div>
              <button className="close-modal-btn" onClick={() => setMissingTransportModal({ isOpen: false, players: [] })}>✕</button>
            </div>
            <div className="modal-body">
              <p className="modal-desc">
                {t('Commit failed. The following', 'فشل التسجيل. المشغّلون التاليون')} <strong>{missingTransportModal.players.length}</strong> {t('operatives have no assigned logistics:', 'ليس لديهم نقل مُخصَّص:')}
              </p>
              <ul className="modal-player-list">
                {missingTransportModal.players.map(p => (
                  <li key={p.firestoreId} className="modal-player-item">
                    <div className="modal-avatar">{p.name.charAt(0)}</div>
                    <div className="modal-player-info">
                      <span className="modal-player-name">{p.name}</span>
                      <span className="modal-player-coach">{t('Unit', 'الوحدة')}: {p.coach}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div className="modal-footer">
              <button className="btn-premium" onClick={() => setMissingTransportModal({ isOpen: false, players: [] })}>{t('Update Logs', 'تحديث السجلات')}</button>
            </div>
          </div>
        </div>, document.body
      )}

      {/* OVERWRITE WARNING MODAL */}
      <ConfirmModal 
        isOpen={overwriteModalOpen}
        onClose={() => setOverwriteModalOpen(false)}
        onConfirm={performSave}
        isDanger={true}
        title={t('Protocol Overwrite', 'تجاوز البيانات')}
        message={t(`A data record for ${selectedDate} at ${selectedTiming} already exists (Auth: ${lastSavedBy}). Proceed with overwrite?`, `يوجد سجل بيانات لتاريخ ${selectedDate} في ${selectedTiming} (بواسطة: ${lastSavedBy}). هل تريد التجاوز؟`)}
        confirmText={t('Execute Overwrite', 'تأكيد التجاوز')}
        cancelText={t('Cancel', 'إلغاء')}
        requiredPasscode={import.meta.env.VITE_RESET_PASSCODE}
      />
    </div>
  );
}
