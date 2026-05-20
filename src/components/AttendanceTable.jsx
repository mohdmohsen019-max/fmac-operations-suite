import React, { useState, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import CustomSelect from './CustomSelect';
import './AttendanceTable.css';
import { useLanguage } from '../contexts/LanguageContext';

const TRANSPORT_LABELS = {
  'Bus 1': { en: 'Bus 1', ar: 'باص 1' },
  'Bus 2': { en: 'Bus 2', ar: 'باص 2' },
  'Bus 3': { en: 'Bus 3', ar: 'باص 3' },
  'Bus 4': { en: 'Bus 4', ar: 'باص 4' },
  'Bus 5': { en: 'Bus 5', ar: 'باص 5' },
  'Bus 6': { en: 'Bus 6', ar: 'باص 6' },
  'Bus 7': { en: 'Bus 7', ar: 'باص 7' },
  'Bus 8': { en: 'Bus 8', ar: 'باص 8' },
  'Own Transportation': { en: 'Own Transportation', ar: 'مواصلات خاصة' },
};

const PlayerRow = memo(({ player, onToggleStatus, onChangeTransport, canEdit, index, t, lang }) => {
  const transportOptions = Object.keys(TRANSPORT_LABELS).map(key => ({
    value: key,
    label: lang === 'ar' ? TRANSPORT_LABELS[key].ar : TRANSPORT_LABELS[key].en,
  }));
  return (
    <motion.tr 
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.03 }}
    >
      <td className="col-name">
        <div className="player-info">
          <div className="avatar">{player.name.charAt(0)}</div>
          <div className="name-id">
            <span className="player-name">{player.name}</span>
            <span className="player-id">{player.id}</span>
          </div>
        </div>
      </td>
      <td className="col-sport">
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {player.sports && player.sports.length > 0 
            ? player.sports.map((s, idx) => (
               <span key={idx} className={`badge badge-sport ${player.sports.length > 1 ? 'multi-glow' : ''}`}>{s}</span>
              ))
            : <span className="badge badge-sport">{player.sport}</span>
          }
        </div>
      </td>
      <td className="col-window">
        <div className="timing-text">{player.classTiming}</div>
      </td>
      <td className="col-status status-col">
        <div className="status-toggle-wrapper">
          <button
            className={`status-toggle ${player.status === 'present' ? 'is-present' : 'is-absent'}`}
            onClick={() => canEdit && onToggleStatus?.(player.firestoreId)}
            disabled={!canEdit}
            style={!canEdit ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
          >
            <div className="toggle-circle"></div>
          </button>
          <span className={`status-text ${player.status}`}>
            {player.status === 'present' ? t('PRESENT', 'حاضر') : t('ABSENT', 'غائب')}
          </span>
        </div>
      </td>
      <td className="col-logistics action-col">
        <div className="action-wrapper">
          <AnimatePresence>
            {player.status === 'present' && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                style={{ width: '100%' }}
              >
                <CustomSelect
                  value={player.transportation || ''}
                  onChange={val => canEdit && onChangeTransport?.(player.firestoreId, val)}
                  options={transportOptions}
                  placeholder={t('Select Transportation', 'اختر وسيلة النقل')}
                  className="transport-dropdown"
                  disabled={!canEdit}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </td>
    </motion.tr>
  );
});

const MobilePlayerCard = memo(({ player, onToggleStatus, onChangeTransport, canEdit, index, t, lang }) => {
  const [expanded, setExpanded] = useState(false);
  const transportOptions = Object.keys(TRANSPORT_LABELS).map(key => ({
    value: key,
    label: lang === 'ar' ? TRANSPORT_LABELS[key].ar : TRANSPORT_LABELS[key].en,
  }));

  return (
    <motion.div 
      className={`player-card ${expanded ? 'expanded' : ''} ${player.status === 'present' ? 'card-present-glow' : ''}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
    >
      <div className="player-card-top" onClick={() => setExpanded(!expanded)}>
        <div className="player-info">
          <div className="avatar">{player.name.charAt(0)}</div>
          <div className="name-id">
            <span className="player-name">{player.name}</span>
            <span className="player-id">#{player.id}</span>
          </div>
        </div>
        <div className="status-toggle-wrapper">
          <button
            className={`status-toggle ${player.status === 'present' ? 'is-present' : 'is-absent'}`}
            disabled={!canEdit}
            style={!canEdit ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
            onClick={(e) => {
              if (!canEdit) return;
              e.stopPropagation();
              onToggleStatus?.(player.firestoreId);
              if (player.status !== 'present') setExpanded(true);
            }}
          >
            <div className="toggle-circle"></div>
          </button>
          <span className={`status-text ${player.status}`}>{player.status === 'present' ? t('PRESENT', 'حاضر') : t('ABSENT', 'غائب')}</span>
        </div>
      </div>
      
      <div className="player-card-details">
        {player.status === 'present' && (
          <div className="mobile-action-row" style={{ marginBottom: '12px' }}>
             <CustomSelect
              value={player.transportation || ''}
              onChange={val => canEdit && onChangeTransport?.(player.firestoreId, val)}
              options={transportOptions}
              placeholder={t('Assign Transportation', 'تعيين وسيلة النقل')}
              className="transport-dropdown"
              disabled={!canEdit}
            />
          </div>
        )}
        <div className="details-row" style={{ fontSize: '0.8rem', color: 'var(--theme-text-muted)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span>{t('Class', 'الفصل')}: {player.sport}</span>
          <span>{t('Timing', 'التوقيت')}: {player.classTiming}</span>
        </div>
      </div>
    </motion.div>
  );
});

export default function AttendanceTable({ players, onToggleStatus, onChangeTransport, canEdit, loading }) {
  const { t, lang } = useLanguage();
  if (loading) return null;

  if (players.length === 0) {
    return (
      <div className="empty-state animate-fade-in" style={{ padding: '60px', textAlign: 'center', color: 'var(--theme-text-muted)' }}>
        <p>{t('No operative records found.', 'لا توجد سجلات للعمليات.')}</p>
      </div>
    );
  }

  return (
    <div className="table-wrapper">
      <div className="desktop-only">
        <table className="attendance-table table-surface">
          <colgroup>
            <col style={{ width: '30%' }} />
            <col style={{ width: '18%' }} />
            <col style={{ width: '17%' }} />
            <col style={{ width: '15%' }} />
            <col style={{ width: '20%' }} />
          </colgroup>
          <thead>
            <tr>
              <th className="col-name">{t('Operative Name', 'اسم المشغّل')}</th>
              <th className="col-sport">{t('Sport', 'الرياضة')}</th>
              <th className="col-window">{t('Class Timing', 'توقيت الفصل')}</th>
              <th className="col-status">{t('Status', 'الحالة')}</th>
              <th className="col-logistics">{t('Transportation', 'النقل')}</th>
            </tr>
          </thead>
          <tbody>
            {players.map((player, index) => (
              <PlayerRow
                key={player.firestoreId}
                player={player}
                index={index}
                canEdit={canEdit}
                onToggleStatus={onToggleStatus}
                onChangeTransport={onChangeTransport}
                t={t}
                lang={lang}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="mobile-card-list mobile-only">
        {players.map((player, index) => (
          <MobilePlayerCard
            key={player.firestoreId}
            player={player}
            index={index}
            canEdit={canEdit}
            onToggleStatus={onToggleStatus}
            onChangeTransport={onChangeTransport}
            t={t}
            lang={lang}
          />
        ))}
      </div>
    </div>
  );
}
