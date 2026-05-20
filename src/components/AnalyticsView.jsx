import { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { db } from '../firebase';
import { useLanguage } from '../contexts/LanguageContext';
import { collection, query, getDocs, where } from 'firebase/firestore';
import CustomSelect from './CustomSelect';
import ConfirmModal from './ConfirmModal';
import { clearAttendanceHistory } from '../utils/systemUtils';
import './AnalyticsView.css';

export default function AnalyticsView() {
  const { t } = useLanguage();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const handleReset = async () => {
    setIsResetting(true);
    try {
      await clearAttendanceHistory();
      setSessions([]);
    } catch (e) {
      alert(t("Reset failed.", "فشلت عملية إعادة الضبط."));
    } finally {
      setIsResetting(false);
      setResetModalOpen(false);
    }
  };

  useEffect(() => {
    const fetchAllSessions = async () => {
      setLoading(true);
      try {
        const q = query(collection(db, "sessions"));
        const snapshot = await getDocs(q);
        const sessionsList = [];
        
        for (const sDoc of snapshot.docs) {
          const sData = sDoc.data();
          const d = new Date(sData.date);
          if (d.getMonth() === selectedMonth && d.getFullYear() === selectedYear) {
            // Fetch attendance subcollection for this session
            const attSnap = await getDocs(collection(db, "sessions", sDoc.id, "attendance"));
            const attendance = attSnap.docs.map(ad => ad.data());
            sessionsList.push({
              ...sData,
              id: sDoc.id,
              attendance
            });
          }
        }
        setSessions(sessionsList);
      } catch (err) {
        console.error("Error fetching analytics sessions:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchAllSessions();
  }, [selectedMonth, selectedYear]);

  const monthlyReport = useMemo(() => {
    const playerStats = {};
    const timingCount = {}; // { [timing]: count }

    // 1. Count sessions per timing
    sessions.forEach(s => {
      timingCount[s.classTiming] = (timingCount[s.classTiming] || 0) + 1;
    });

    // 2. Aggregate player attendance
    sessions.forEach(s => {
      s.attendance.forEach(record => {
        const pid = record.playerId || record.id;
        if (!playerStats[pid]) {
          playerStats[pid] = { 
            name: record.playerName || record.name, 
            present: 0, 
            classTiming: s.classTiming
          };
        }
        if (record.status === 'present') {
          playerStats[pid].present += 1;
        }
      });
    });

    return Object.entries(playerStats)
      .map(([id, stats]) => {
        const totalSessionsHeld = timingCount[stats.classTiming] || 0;
        return {
          id,
          ...stats,
          total: totalSessionsHeld,
          rate: totalSessionsHeld === 0 ? 0 : Math.round((stats.present / totalSessionsHeld) * 100)
        };
      })
      .sort((a, b) => b.rate - a.rate);
  }, [sessions]);

  const years = useMemo(() => {
    return [new Date().getFullYear(), new Date().getFullYear() - 1];
  }, []);

  if (loading) {
    return (
      <div className="jumping-logo-container">
        <img src="/fmac-logo-new.png" alt="Loading" className="jumping-logo" />
        <span className="jumping-text">{t('Generating Scoped Reports...', 'جارٍ إنشاء التقارير...')}</span>
      </div>
    );
  }

  return (
    <div className="analytics-container">
      <div className="analytics-header animate-fade-in">
        <div>
          <h2 className="view-title" style={{ fontSize: '1.5rem' }}>{t('Strategic Intelligence', 'الذكاء الاستراتيجي')}</h2>
          <p className="analytics-subtitle">{t('Aggregated performance telemetry', 'قياسات الأداء المجمّعة')}</p>
        </div>
        <div className="analytics-filters">
          <CustomSelect 
            value={selectedMonth} 
            onChange={val => setSelectedMonth(parseInt(val))}
            options={[
              { value: 0, label: t('January', 'يناير') }, { value: 1, label: t('February', 'فبراير') }, { value: 2, label: t('March', 'مارس') },
              { value: 3, label: t('April', 'أبريل') }, { value: 4, label: t('May', 'مايو') }, { value: 5, label: t('June', 'يونيو') },
              { value: 6, label: t('July', 'يوليو') }, { value: 7, label: t('August', 'أغسطس') }, { value: 8, label: t('September', 'سبتمبر') },
              { value: 9, label: t('October', 'أكتوبر') }, { value: 10, label: t('November', 'نوفمبر') }, { value: 11, label: t('December', 'ديسمبر') }
            ]}
            className="analytics-dropdown"
          />
          <CustomSelect 
            value={selectedYear} 
            onChange={val => setSelectedYear(parseInt(val))}
            options={years.map(y => ({ value: y, label: y.toString() }))}
            className="analytics-dropdown"
          />
          <button 
            className="analytics-reset-btn" 
            onClick={() => setResetModalOpen(true)}
            disabled={isResetting}
          >
            {isResetting ? "..." : t("Wipe Archive", "مسح الأرشيف")}
          </button>
        </div>
      </div>

      <div className="analytics-grid">
        <div className="analytics-card glass-panel animate-fade-in" style={{ animationDelay: '0.1s' }}>
          <span className="label">{t('Combat Readiness Index', 'مؤشر الجاهزية')}</span>
          <span className="value">
            {monthlyReport.length > 0 
              ? Math.round(monthlyReport.reduce((acc, curr) => acc + curr.rate, 0) / monthlyReport.length) 
              : 0}%
          </span>
          <p className="subtext">{t('Derived from', 'مستخرج من')} {sessions.length} {t('operational cycles', 'دورة تشغيلية')}</p>
        </div>
      </div>

      <div className="analytics-table-wrapper glass-panel animate-fade-in" style={{ animationDelay: '0.2s' }}>
        <table className="analytics-table">
          <thead>
            <tr>
              <th>{t('Operative', 'المشغّل')}</th>
              <th>{t('Deployment Window', 'نافذة التوقيت')}</th>
              <th>{t('Ops Cycle', 'الدورة')}</th>
              <th>{t('Performance Rate', 'معدل الأداء')}</th>
              <th>{t('Status', 'الحالة')}</th>
            </tr>
          </thead>
          <tbody>
            {monthlyReport.length > 0 ? (
              monthlyReport.map((player, index) => (
                <motion.tr 
                  key={player.id}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.02 }}
                >
                  <td>
                    <div className="player-cell">
                      <span className="p-name">{player.name}</span>
                      <span className="p-id">ID: {player.id}</span>
                    </div>
                  </td>
                  <td style={{fontSize:'0.85rem', color:'var(--theme-text-muted)'}}>{player.classTiming}</td>
                  <td style={{ fontWeight: '600' }}>{player.present} / {player.total}</td>
                  <td>
                    <div className="rate-container">
                      <div className="rate-bar-track">
                        <motion.div 
                          className="rate-bar-fill" 
                          initial={{ width: 0 }}
                          animate={{ width: `${player.rate}%` }}
                          transition={{ duration: 1, delay: 0.5 + (index * 0.02) }}
                        />
                      </div>
                      <span className="rate-text">{player.rate}%</span>
                    </div>
                  </td>
                  <td>
                    <span className={`performance-badge ${player.rate >= 90 ? 'excellent' : player.rate >= 75 ? 'good' : 'warning'}`}>
                      {player.rate >= 90 ? t('Alpha', 'ممتاز') : player.rate >= 75 ? t('Beta', 'جيد') : t('Review', 'مراجعة')}
                    </span>
                  </td>
                </motion.tr>
              ))
            ) : (
              <tr>
                <td colSpan="5" className="empty-row" style={{ textAlign: 'center', padding: '40px', color: 'var(--theme-text-muted)' }}>{t('No historical data available for selected period.', 'لا توجد بيانات تاريخية للفترة المحددة.')}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ConfirmModal 
        isOpen={resetModalOpen}
        onClose={() => setResetModalOpen(false)}
        onConfirm={handleReset}
        isDanger={true}
        title={t('Wipe Analytics History?', 'مسح سجل التحليلات؟')}
        message={t("This will delete the historical data used for these charts. Today's active Hub session will NOT be affected.", "سيؤدي هذا إلى حذف البيانات التاريخية المستخدمة في هذه المخططات. لن تتأثر جلسة اليوم الحالية.")}
        confirmText={t('Yes, Wipe Data', 'نعم، مسح البيانات')}
        cancelText={t('Cancel', 'إلغاء')}
        requiredPasscode="Fm@c.2020"
      />
    </div>
  );
}
