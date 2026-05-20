import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { db } from '../firebase';
import { useLanguage } from '../contexts/LanguageContext';
import { usePermissions } from '../hooks/usePermissions';
import { collection, query, orderBy, onSnapshot, limit, getDocs } from 'firebase/firestore';
import ConfirmModal from './ConfirmModal';
import { clearAttendanceHistory } from '../utils/systemUtils';
import './AttendanceHistory.css';

export default function AttendanceHistory() {
  const { t, locale } = useLanguage();
  const { can } = usePermissions();
  const canEdit = can('logistics', 'edit');
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState(null);
  const [selectedAttendance, setSelectedAttendance] = useState([]);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const handleReset = async () => {
    setIsResetting(true);
    try {
      await clearAttendanceHistory();
      setSelectedLog(null);
    } catch (e) {
      alert(t("Reset failed.", "فشلت عملية إعادة الضبط."));
    } finally {
      setIsResetting(false);
      setResetModalOpen(false);
    }
  };

  useEffect(() => {
    const q = query(
      collection(db, "sessions"),
      orderBy("date", "desc"),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setLogs(logsData);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching logs:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleSelectLog = async (log) => {
    setSelectedLog(log);
    setShowDetail(true);
    setLoadingAttendance(true);
    try {
      const attSnap = await getDocs(collection(db, "sessions", log.id, "attendance"));
      setSelectedAttendance(attSnap.docs.map(d => d.data()));
    } catch (err) {
      console.error("Error fetching session attendance:", err);
    } finally {
      setLoadingAttendance(false);
    }
  };

  if (loading) {
    return <div className="loading-state">{t('Syncing history logs...', 'جارٍ مزامنة سجلات التاريخ...')}</div>;
  }

  return (
    <div className={`history-container ${showDetail ? 'mobile-show-detail' : ''}`}>
      <div className="history-sidebar glass-panel animate-fade-in">
        <div className="sidebar-header-row">
          <h3 className="sidebar-title">{t('Mission Archives', 'أرشيف المهام')}</h3>
          {canEdit && (
            <button
              className="reset-history-btn"
              onClick={() => setResetModalOpen(true)}
              disabled={isResetting}
            >
              {isResetting ? "..." : t("Purge", "مسح")}
            </button>
          )}
        </div>
        <div className="logs-list">
          {logs.map((log, index) => (
            <motion.div 
              key={log.id} 
              className={`log-item ${selectedLog?.id === log.id ? 'active' : ''}`}
              onClick={() => handleSelectLog(log)}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.03 }}
            >
              <div className="log-date">{new Date(log.date).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' })}</div>
              <div className="log-meta">
                <span>{log.classTiming}</span>
              </div>
              <div className="log-stats">
                <span className="present">{t('Units', 'حضور')}: {log.presentCount}</span>
                <span className="absent">{t('Abs', 'غياب')}: {log.totalPlayers - log.presentCount}</span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      <div className="history-detail glass-panel animate-fade-in" style={{ animationDelay: '0.1s' }}>
        {selectedLog ? (
          <>
            <div className="detail-header">
              <button className="btn-ghost mobile-only" onClick={() => setShowDetail(false)} style={{ marginBottom: '16px' }}>
                {t('← Return', '← رجوع')}
              </button>
              <div>
                <h2 className="text-gradient" style={{ fontSize: '1.5rem', marginBottom: '4px' }}>
                  {new Date(selectedLog.date).toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric' })}
                </h2>
                <p className="detail-subtitle">{selectedLog.classTiming}</p>
                <p className="detail-subtitle" style={{ fontSize: '0.75rem', marginTop: '4px' }}>{t('Auth Signature', 'توقيع المسؤول')}: {selectedLog.recordedBy}</p>
              </div>
              <div className="detail-stats">
                <div className="stat-circle">
                  <span className="val">{Math.round((selectedLog.presentCount / selectedLog.totalPlayers) * 100)}%</span>
                  <span className="lab">{t('Success', 'نجاح')}</span>
                </div>
              </div>
            </div>

            <div className="detail-table-wrapper">
              {loadingAttendance ? (
                <div className="flex-center" style={{ height: '200px' }}>
                  <motion.div 
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    style={{ width: '24px', height: '24px', border: '2px solid var(--theme-border)', borderTopColor: 'var(--theme-accent)', borderRadius: '50%' }}
                  />
                </div>
              ) : (
                <table className="detail-table">
                  <thead>
                    <tr>
                      <th>{t('Operative', 'المشغّل')}</th>
                      <th>{t('Unit ID', 'رقم الوحدة')}</th>
                      <th>{t('Status', 'الحالة')}</th>
                      <th>{t('Logistics', 'النقل')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedAttendance.map((player, idx) => (
                      <motion.tr 
                        key={idx} 
                        className={player.status}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.01 }}
                      >
                        <td style={{ fontWeight: '600' }}>{player.playerName}</td>
                        <td style={{ fontFamily: 'JetBrains Mono', fontSize: '0.75rem', color: 'var(--theme-text-muted)' }}>{player.playerId}</td>
                        <td>
                          <span className={`status-pill ${player.status}`}>
                            {player.status === 'present' ? t('PRESENT', 'حاضر') : t('ABSENT', 'غائب')}
                          </span>
                        </td>
                        <td style={{fontSize:'0.8rem', color: 'var(--theme-text-muted)'}}>{player.transportation || 'N/A'}</td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        ) : (
          <div className="flex-center" style={{ height: '100%', flexDirection: 'column', gap: '16px', color: 'var(--theme-text-muted)' }}>
             <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.2 }}>
               <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
               <polyline points="14 2 14 8 20 8"></polyline>
               <line x1="16" y1="13" x2="8" y2="13"></line>
               <line x1="16" y1="17" x2="8" y2="17"></line>
               <polyline points="10 9 9 9 8 9"></polyline>
             </svg>
             <p style={{ fontSize: '0.9rem', letterSpacing: '0.05em' }}>{t('Select operational cycle to view logs', 'اختر دورة تشغيلية لعرض السجلات')}</p>
          </div>
        )}
      </div>

      <ConfirmModal 
        isOpen={resetModalOpen}
        onClose={() => setResetModalOpen(false)}
        onConfirm={handleReset}
        isDanger={true}
        title={t('Purge Mission Archives?', 'مسح أرشيف المهام؟')}
        message={t('This action will permanently delete all historical operational cycles and their data records.', 'سيؤدي هذا الإجراء إلى حذف جميع الدورات التشغيلية التاريخية وسجلاتها نهائياً.')}
        confirmText={t('Execute Purge', 'تأكيد المسح')}
        cancelText={t('Cancel', 'إلغاء')}
        requiredPasscode="Fm@c.2020"
      />
    </div>
  );
}
