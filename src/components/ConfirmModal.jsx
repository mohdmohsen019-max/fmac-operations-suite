import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import './ConfirmModal.css';
import { useLanguage } from '../contexts/LanguageContext';

/**
 * A reusable confirmation modal with glassmorphism styling and optional passcode security.
 * 
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the modal is visible
 * @param {Function} props.onClose - Action when canceled or closed
 * @param {Function} props.onConfirm - Action when confirmed
 * @param {string} props.title - Modal title
 * @param {string} props.message - Modal body text
 * @param {string} props.confirmText - Label for action button
 * @param {string} props.cancelText - Label for cancel button
 * @param {boolean} props.isDanger - If true, uses red theme for action
 * @param {string} props.requiredPasscode - If provided, user must enter this to confirm
 */
export default function ConfirmModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title, 
  message, 
  confirmText = "Confirm", 
  cancelText = "Cancel", 
  isDanger = false,
  requiredPasscode = ""
}) {
  const { t } = useLanguage();
  const [passcodeInput, setPasscodeInput] = useState("");
  const [error, setError] = useState(false);

  // Reset state whenever modal opens or closes
  useEffect(() => {
    if (!isOpen) {
      setPasscodeInput("");
      setError(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConfirmAction = () => {
    if (requiredPasscode && passcodeInput !== requiredPasscode) {
      setError(true);
      return;
    }
    onConfirm();
    onClose();
  };

  return createPortal(
    <div className="confirm-modal-overlay animate-fade-in" onClick={onClose}>
      <div className="confirm-modal glass-panel animate-pop-in" onClick={e => e.stopPropagation()}>
        <div className="confirm-modal-header">
          <div className={`confirm-icon-circle ${isDanger ? 'danger' : ''}`}>
            {isDanger ? '⚠️' : '❓'}
          </div>
          <h3>{title}</h3>
        </div>
        
        <div className="confirm-modal-body">
          <p className="confirm-message">{message}</p>
          
          {requiredPasscode && (
            <div className="passcode-field-wrapper">
              <label className="passcode-label">{t('Admin Passcode Required', 'كلمة مرور المسؤول مطلوبة')}</label>
              <input 
                type="password" 
                className={`confirm-passcode-input ${error ? 'error' : ''}`}
                placeholder="••••••••"
                value={passcodeInput}
                onChange={(e) => {
                  setPasscodeInput(e.target.value);
                  if (error) setError(false);
                }}
                autoFocus
              />
              {error && <span className="passcode-error-msg">❌ {t('Incorrect passcode', 'كلمة المرور غير صحيحة')}</span>}
            </div>
          )}
        </div>
        
        <div className="confirm-modal-footer">
          <button className="confirm-btn-cancel" onClick={onClose}>
            {cancelText}
          </button>
          <button 
            className={`confirm-btn-action ${isDanger ? 'danger' : ''}`} 
            onClick={handleConfirmAction}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
