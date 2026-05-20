import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { User, Mail, Phone, Camera, Shield, Save, Loader2 } from 'lucide-react';
import { db } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import './ProfileModule.css';
import { useLanguage } from '../contexts/LanguageContext';

export default function ProfileModule({ user, userProfile, onUpdateProfile }) {
  const { t } = useLanguage();
  const [formData, setFormData] = useState({
    displayName: '',
    phoneNumber: '',
    photoURL: ''
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (userProfile) {
      setFormData({
        displayName: userProfile.displayName || '',
        phoneNumber: userProfile.phoneNumber || '',
        photoURL: userProfile.photoURL || ''
      });
    } else if (user) {
      setFormData({
        displayName: user.displayName || '',
        phoneNumber: user.phoneNumber || '',
        photoURL: user.photoURL || ''
      });
    }
  }, [userProfile, user]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 256;
          const MAX_HEIGHT = 256;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          
          // Compress to JPEG with 0.7 quality to ensure it fits easily within Firestore 1MB document limit
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          
          setFormData(prev => ({ ...prev, photoURL: dataUrl }));
          setSaveStatus(t('Photo preview ready. Click Save to apply.', 'معاينة الصورة جاهزة. اضغط حفظ للتطبيق.'));
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setIsSaving(true);
    setSaveStatus('');
    try {
      // Update Firestore user document
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        displayName: formData.displayName,
        phoneNumber: formData.phoneNumber,
        photoURL: formData.photoURL
        // Avoid overwriting email or role
      });
      // Update local context instantly
      if (onUpdateProfile) {
        onUpdateProfile({
          ...userProfile,
          displayName: formData.displayName,
          phoneNumber: formData.phoneNumber,
          photoURL: formData.photoURL
        });
      }

      setSaveStatus(t('Profile updated successfully.', 'تم تحديث الملف الشخصي بنجاح.'));
      setTimeout(() => setSaveStatus(''), 3000);
    } catch (err) {
      console.error('Error updating profile:', err);
      setSaveStatus(t('Failed to update profile.', 'فشل تحديث الملف الشخصي.'));
    }
    setIsSaving(false);
  };

  return (
    <motion.div 
      className="profile-module-container"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
    >
      <div className="profile-header-area">
        <div>
          <h1 className="profile-title">{t('Profile Management', 'إدارة الملف الشخصي')}</h1>
          <p className="profile-subtitle">{t('Manage your personal information and security settings.', 'إدارة معلوماتك الشخصية وإعدادات الأمان.')}</p>
        </div>
      </div>

      <div className="profile-content-grid">
        <div className="glass-panel profile-card-left">
          <div className="avatar-section">
            <div className="avatar-wrapper" onClick={() => fileInputRef.current?.click()}>
              {formData.photoURL ? (
                <img src={formData.photoURL} alt="Profile" className="profile-avatar-img" />
              ) : (
                <div className="profile-avatar-placeholder">
                  <User size={48} />
                </div>
              )}
              <div className="avatar-overlay">
                <Camera size={24} />
              </div>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                accept="image/*" 
                style={{ display: 'none' }} 
              />
            </div>
            <h2 className="avatar-name">{formData.displayName || user?.email?.split('@')[0] || 'User'}</h2>
            <div className="role-badge">
              <Shield size={14} />
              <span>{userProfile?.role?.toUpperCase() || 'ADMIN'}</span>
            </div>
          </div>
        </div>

        <div className="glass-panel profile-card-right">
          <h3 className="section-heading">{t('Personal Details', 'البيانات الشخصية')}</h3>

          <div className="form-group">
            <label>{t('Full Name', 'الاسم الكامل')}</label>
            <div className="input-with-icon">
              <User size={18} className="input-icon" />
              <input
                type="text"
                name="displayName"
                value={formData.displayName}
                onChange={handleInputChange}
                placeholder={t('Enter your full name', 'أدخل اسمك الكامل')}
                className="profile-input"
              />
            </div>
          </div>

          <div className="form-group">
            <label>{t('Phone Number', 'رقم الهاتف')}</label>
            <div className="input-with-icon">
              <Phone size={18} className="input-icon" />
              <input 
                type="tel" 
                name="phoneNumber"
                value={formData.phoneNumber}
                onChange={handleInputChange}
                placeholder="e.g. +971 50 123 4567"
                className="profile-input"
              />
            </div>
          </div>

          <div className="form-group">
            <label>{t('Email Address', 'البريد الإلكتروني')} <span className="text-muted">({t('Read Only', 'للقراءة فقط')})</span></label>
            <div className="input-with-icon read-only">
              <Mail size={18} className="input-icon" />
              <input 
                type="email" 
                value={user?.email || ''}
                readOnly
                className="profile-input"
              />
            </div>
          </div>

          <div className="profile-actions">
            {saveStatus && (
              <span className={`save-status ${saveStatus.includes('success') ? 'success' : 'info'}`}>
                {saveStatus}
              </span>
            )}
            <button className="btn-premium save-btn" onClick={handleSave} disabled={isSaving}>
              {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
              {isSaving ? t('Saving...', 'جارٍ الحفظ...') : t('Save Changes', 'حفظ التغييرات')}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
