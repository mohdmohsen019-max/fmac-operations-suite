import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  User, Mail, Phone, Camera, Shield, Save, Loader2, Lock,
  KeyRound, Eye, EyeOff, CheckCircle2, Clock, CalendarDays,
  Briefcase, LayoutGrid, FileText, Crown,
} from 'lucide-react';
import { db, auth } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import {
  EmailAuthProvider, reauthenticateWithCredential, updatePassword,
} from 'firebase/auth';
import './ProfileModule.css';
import { useLanguage } from '../contexts/LanguageContext';
import { MASTER_ADMIN_EMAIL } from '../utils/jobTitlePermissions';

/* ── helpers ── */
const fmtDate = (ts) => {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const fmtDateTime = (ts) => {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const MODULE_LABELS = {
  logistics: { en: 'Logistics Hub', ar: 'مركز اللوجستيات' },
  fleet:     { en: 'Fleet Management', ar: 'إدارة الأسطول' },
  inventory: { en: 'Inventory', ar: 'المخزون' },
  helpDesk:  { en: 'Help Desk', ar: 'مركز الدعم' },
};

const REPORT_LABELS = {
  bus_trips: { en: 'Bus Trips', ar: 'حركة الحافلات' },
  maintenance: { en: 'Maintenance', ar: 'الصيانة' },
  player_registration: { en: 'Player Registration', ar: 'تسجيل اللاعبين' },
  complaints: { en: 'Complaints', ar: 'الشكاوى' },
  inventory: { en: 'Inventory', ar: 'المخازن' },
  media: { en: 'Media', ar: 'ميديا' },
  fuel: { en: 'Fuel', ar: 'بترول' },
  admin_costs: { en: 'Admin Costs', ar: 'تكاليف إدارية' },
  projects: { en: 'Projects', ar: 'مشاريع' },
};

export default function ProfileModule({ user, userProfile, onUpdateProfile }) {
  const { t, lang } = useLanguage();
  const isMasterAdmin = user?.email === MASTER_ADMIN_EMAIL;

  const [formData, setFormData] = useState({
    displayName: '',
    phoneNumber: '',
    photoURL: ''
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const fileInputRef = useRef(null);

  // Change-password state
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwShow, setPwShow] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState(null); // { ok: bool, text: string }

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

          // Compress to JPEG with 0.7 quality to fit within Firestore 1MB doc limit
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
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        displayName: formData.displayName,
        phoneNumber: formData.phoneNumber,
        photoURL: formData.photoURL
        // Avoid overwriting email or role
      });
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

  /* ── Change password (reauth with current password, then update) ── */
  const handleChangePassword = async () => {
    setPwMsg(null);
    if (!pwCurrent || !pwNew || !pwConfirm) {
      setPwMsg({ ok: false, text: t('Please fill in all password fields.', 'يرجى تعبئة جميع حقول كلمة المرور.') });
      return;
    }
    if (pwNew.length < 6) {
      setPwMsg({ ok: false, text: t('New password must be at least 6 characters.', 'يجب أن تكون كلمة المرور الجديدة 6 أحرف على الأقل.') });
      return;
    }
    if (pwNew !== pwConfirm) {
      setPwMsg({ ok: false, text: t('New passwords do not match.', 'كلمتا المرور الجديدتان غير متطابقتين.') });
      return;
    }
    setPwBusy(true);
    try {
      const cred = EmailAuthProvider.credential(auth.currentUser.email, pwCurrent);
      await reauthenticateWithCredential(auth.currentUser, cred);
      await updatePassword(auth.currentUser, pwNew);
      setPwMsg({ ok: true, text: t('Password changed successfully.', 'تم تغيير كلمة المرور بنجاح.') });
      setPwCurrent(''); setPwNew(''); setPwConfirm('');
    } catch (err) {
      console.error('Change password failed:', err);
      const wrong = err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential';
      setPwMsg({
        ok: false,
        text: wrong
          ? t('Current password is incorrect.', 'كلمة المرور الحالية غير صحيحة.')
          : t('Could not change password. Try again.', 'تعذر تغيير كلمة المرور. حاول مرة أخرى.'),
      });
    } finally {
      setPwBusy(false);
    }
  };

  const status = userProfile?.status;
  const statusActive = status === 'approved' || status === 'active' || userProfile?.approved === true;
  const permissions = userProfile?.permissions;
  const reportKeys = Array.isArray(permissions?.reports) ? permissions.reports : [];

  return (
    <motion.div
      className="profile-module-container"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
    >
      <div className="profile-header-area">
        <div>
          <h1 className="profile-title">{t('My Profile', 'ملفي الشخصي')}</h1>
          <p className="profile-subtitle">{t('Your account, access and security in one place.', 'حسابك وصلاحياتك وأمانك في مكان واحد.')}</p>
        </div>
      </div>

      <div className="profile-content-grid">
        {/* ══ LEFT — identity card ══ */}
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
              {isMasterAdmin ? <Crown size={14} /> : <Shield size={14} />}
              <span>{isMasterAdmin ? t('Master Admin', 'المسؤول العام') : (userProfile?.jobTitle || userProfile?.role?.toUpperCase() || '—')}</span>
            </div>
            <div className={`pf-status ${statusActive ? 'ok' : ''}`}>
              <span className="pf-status-dot" />
              {statusActive ? t('Active Account', 'حساب نشط') : (status || '—')}
            </div>
          </div>

          {/* Account meta */}
          <div className="pf-meta-list">
            <div className="pf-meta-row">
              <Mail size={14} />
              <div>
                <span className="pf-meta-label">{t('Email', 'البريد الإلكتروني')}</span>
                <span className="pf-meta-value">{user?.email || '—'}</span>
              </div>
            </div>
            <div className="pf-meta-row">
              <Briefcase size={14} />
              <div>
                <span className="pf-meta-label">{t('Job Title', 'المسمى الوظيفي')}</span>
                <span className="pf-meta-value">{isMasterAdmin ? 'Master Admin' : (userProfile?.jobTitle || '—')}</span>
              </div>
            </div>
            <div className="pf-meta-row">
              <CalendarDays size={14} />
              <div>
                <span className="pf-meta-label">{t('Member Since', 'عضو منذ')}</span>
                <span className="pf-meta-value">{fmtDate(userProfile?.createdAt)}</span>
              </div>
            </div>
            <div className="pf-meta-row">
              <Clock size={14} />
              <div>
                <span className="pf-meta-label">{t('Last Login', 'آخر دخول')}</span>
                <span className="pf-meta-value">{fmtDateTime(userProfile?.lastLogin)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ══ RIGHT — details / access / security ══ */}
        <div className="pf-right-col">
          {/* Personal details */}
          <div className="glass-panel profile-card-right">
            <h3 className="section-heading"><User size={16} /> {t('Personal Details', 'البيانات الشخصية')}</h3>

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
                <span className={`save-status ${saveStatus.includes('success') || saveStatus.includes('نجاح') ? 'success' : 'info'}`}>
                  {saveStatus}
                </span>
              )}
              <button className="btn-premium save-btn" onClick={handleSave} disabled={isSaving}>
                {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                {isSaving ? t('Saving...', 'جارٍ الحفظ...') : t('Save Changes', 'حفظ التغييرات')}
              </button>
            </div>
          </div>

          {/* Access & permissions */}
          <div className="glass-panel profile-card-right">
            <h3 className="section-heading"><LayoutGrid size={16} /> {t('My Access', 'صلاحياتي')}</h3>

            {isMasterAdmin ? (
              <div className="pf-full-access">
                <Crown size={18} />
                <div>
                  <strong>{t('Full Access', 'وصول كامل')}</strong>
                  <p>{t('You have unrestricted access to every module and action in the suite.', 'لديك وصول غير مقيد لجميع الأقسام والإجراءات في النظام.')}</p>
                </div>
              </div>
            ) : (
              <>
                <div className="pf-access-grid">
                  {Object.entries(MODULE_LABELS).map(([key, label]) => {
                    const level = permissions?.[key];
                    const color = level === 'edit' ? '#10b981' : level === 'view' ? '#f59e0b' : '#6b7280';
                    const levelLabel = level === 'edit'
                      ? t('Can Edit', 'تعديل')
                      : level === 'view'
                        ? t('View Only', 'عرض فقط')
                        : t('No Access', 'لا يوجد وصول');
                    return (
                      <div key={key} className="pf-access-card" style={{ opacity: !level || level === 'none' ? 0.5 : 1 }}>
                        <span className="pf-access-module">{lang === 'ar' ? label.ar : label.en}</span>
                        <span className="pf-access-level" style={{ color, background: `${color}14`, borderColor: `${color}38` }}>
                          {levelLabel}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {reportKeys.length > 0 && (
                  <div className="pf-reports">
                    <span className="pf-reports-label"><FileText size={13} /> {t('Report sections you can submit', 'أقسام التقارير التي يمكنك تقديمها')}</span>
                    <div className="pf-reports-chips">
                      {reportKeys.map(k => (
                        <span key={k} className="pf-report-chip">
                          {lang === 'ar' ? (REPORT_LABELS[k]?.ar || k) : (REPORT_LABELS[k]?.en || k)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Security — change password */}
          <div className="glass-panel profile-card-right">
            <h3 className="section-heading"><Lock size={16} /> {t('Security', 'الأمان')}</h3>

            <div className="form-group">
              <label>{t('Current Password', 'كلمة المرور الحالية')}</label>
              <div className="input-with-icon">
                <KeyRound size={18} className="input-icon" />
                <input
                  type={pwShow ? 'text' : 'password'}
                  value={pwCurrent}
                  onChange={e => setPwCurrent(e.target.value)}
                  placeholder="••••••••"
                  className="profile-input"
                  autoComplete="current-password"
                />
              </div>
            </div>

            <div className="pf-pw-row">
              <div className="form-group">
                <label>{t('New Password', 'كلمة المرور الجديدة')}</label>
                <div className="input-with-icon">
                  <Lock size={18} className="input-icon" />
                  <input
                    type={pwShow ? 'text' : 'password'}
                    value={pwNew}
                    onChange={e => setPwNew(e.target.value)}
                    placeholder="••••••••"
                    className="profile-input"
                    autoComplete="new-password"
                  />
                </div>
              </div>
              <div className="form-group">
                <label>{t('Confirm New Password', 'تأكيد كلمة المرور')}</label>
                <div className="input-with-icon">
                  <Lock size={18} className="input-icon" />
                  <input
                    type={pwShow ? 'text' : 'password'}
                    value={pwConfirm}
                    onChange={e => setPwConfirm(e.target.value)}
                    placeholder="••••••••"
                    className="profile-input"
                    autoComplete="new-password"
                  />
                </div>
              </div>
            </div>

            <button className="pf-pw-toggle" onClick={() => setPwShow(s => !s)} type="button">
              {pwShow ? <EyeOff size={13} /> : <Eye size={13} />}
              {pwShow ? t('Hide passwords', 'إخفاء كلمات المرور') : t('Show passwords', 'إظهار كلمات المرور')}
            </button>

            {pwMsg && (
              <div className={`pf-pw-msg ${pwMsg.ok ? 'ok' : 'err'}`}>
                {pwMsg.ok && <CheckCircle2 size={14} />}
                {pwMsg.text}
              </div>
            )}

            <div className="profile-actions">
              <button className="btn-premium save-btn" onClick={handleChangePassword} disabled={pwBusy}>
                {pwBusy ? <Loader2 size={18} className="animate-spin" /> : <KeyRound size={18} />}
                {pwBusy ? t('Updating...', 'جارٍ التحديث...') : t('Change Password', 'تغيير كلمة المرور')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
