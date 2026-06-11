import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, ShieldCheck, X, CheckCircle, XCircle, Trash2,
  Clock, Search, Lock, ChevronDown, Key, Send,
} from 'lucide-react';
import { db, functions } from '../firebase';
import { httpsCallable } from 'firebase/functions';
import {
  collection, query, where, onSnapshot, doc,
  updateDoc, deleteDoc, serverTimestamp, orderBy,
} from 'firebase/firestore';
import { useLanguage } from '../contexts/LanguageContext';
import { usePermissions } from '../hooks/usePermissions';
import {
  JOB_TITLES, JOB_TITLE_PERMISSIONS, MASTER_ADMIN_EMAIL,
} from '../utils/jobTitlePermissions';
import CustomSelect from './CustomSelect';

/* ── helpers ── */
const fmtDate = (ts) => {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const fmtDateTime = (ts) => {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

/* ── permission preview tags for a job title ── */
function PermPreview({ jobTitle }) {
  const mapping = JOB_TITLE_PERMISSIONS[jobTitle];
  if (!mapping) return null;
  const { permissions } = mapping;
  const moduleLabels = {
    logistics: 'Logistics',
    fleet: 'Fleet',
    inventory: 'Inventory',
    helpDesk: 'Help Desk',
  };
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' }}>
      {Object.entries(moduleLabels).map(([key, label]) => {
        const level = permissions[key];
        const color = level === 'edit' ? '#10b981' : level === 'view' ? '#f59e0b' : '#6b7280';
        return (
          <span key={key} style={{
            fontSize: '0.7rem', fontWeight: 700, padding: '2px 6px',
            borderRadius: '4px', border: `1px solid ${color}30`,
            background: `${color}12`, color,
          }}>
            {label}: {level === 'edit' ? 'Edit' : level === 'view' ? 'View' : 'None'}
          </span>
        );
      })}
    </div>
  );
}

/* ── 4-dot module permission display ── */
function PermDots({ permissions }) {
  if (!permissions) return <span style={{ color: 'var(--theme-text-ghost)', fontSize: '0.75rem' }}>—</span>;
  const modules = [
    { key: 'logistics', label: 'Logistics' },
    { key: 'fleet', label: 'Fleet' },
    { key: 'inventory', label: 'Inventory' },
    { key: 'helpDesk', label: 'Help Desk' },
  ];
  return (
    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
      {modules.map(({ key, label }) => {
        const level = permissions[key];
        const color = level === 'edit' ? '#10b981' : level === 'view' ? '#f59e0b' : '#6b7280';
        return (
          <div key={key} title={`${label}: ${level || 'none'}`} style={{
            width: '10px', height: '10px', borderRadius: '50%',
            background: color, opacity: level === 'none' || !level ? 0.3 : 1,
          }} />
        );
      })}
    </div>
  );
}

/* ── toast ── */
function Toast({ message, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2800);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <motion.div
      initial={{ opacity: 0, y: 40, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20 }}
      style={{
        position: 'fixed', bottom: '32px', left: '50%', transform: 'translateX(-50%)',
        background: 'var(--theme-surface)', border: '1px solid var(--theme-border)',
        borderRadius: '12px', padding: '14px 24px', fontWeight: 700,
        color: 'var(--theme-text-main)', boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
        zIndex: 9999, whiteSpace: 'nowrap',
      }}
    >
      {message}
    </motion.div>
  );
}

/* ── locked module placeholder ── */
function LockedModule({ lang }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '60vh', gap: '16px',
      color: 'var(--theme-text-muted)',
    }}>
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

/* ════════════════════════════════════════════════════════ */
export default function UserManagementModule({ isMasterAdmin: isMasterAdminProp }) {
  const { t, lang } = useLanguage();
  const { canManageUsers, isMasterAdmin, user } = usePermissions();

  const [activeTab, setActiveTab] = useState('pending');
  const [pendingUsers, setPendingUsers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loadingPending, setLoadingPending] = useState(true);
  const [loadingAll, setLoadingAll] = useState(true);

  // Approve modal state
  const [approveTarget, setApproveTarget] = useState(null);
  const [approveJobTitle, setApproveJobTitle] = useState('');
  const [approveLoading, setApproveLoading] = useState(false);

  // Edit modal state
  const [editTarget, setEditTarget] = useState(null);
  const [editJobTitle, setEditJobTitle] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  // Search / filter
  const [search, setSearch] = useState('');
  const [filterJobTitle, setFilterJobTitle] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Password reset requests (master admin only)
  const [passwordResets, setPasswordResets] = useState([]);
  const [loadingResets, setLoadingResets] = useState(true);

  // Toast
  const [toast, setToast] = useState(null);

  const showToast = useCallback((msg) => setToast(msg), []);

  /* ── Real-time listeners ── */
  useEffect(() => {
    const q = query(collection(db, 'users'), where('status', '==', 'pending'));
    return onSnapshot(q, (snap) => {
      setPendingUsers(snap.docs.map(d => ({ uid: d.id, ...d.data() })));
      setLoadingPending(false);
    });
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => {
      setAllUsers(snap.docs.map(d => ({ uid: d.id, ...d.data() })));
      setLoadingAll(false);
    });
  }, []);

  /* ── Password reset requests listener ── */
  useEffect(() => {
    if (!isMasterAdmin) { setLoadingResets(false); return; }
    const q = query(
      collection(db, 'password_reset_requests'),
      where('status', '==', 'pending')
    );
    return onSnapshot(q, (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      items.sort((a, b) => (b.requestedAt?.toMillis?.() || 0) - (a.requestedAt?.toMillis?.() || 0));
      setPasswordResets(items);
      setLoadingResets(false);
    }, () => setLoadingResets(false));
  }, [isMasterAdmin]);

  /* ── Send notification email via Web3Forms ── */
  const sendNotification = async (toEmail, toName, subject, message) => {
    try {
      await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_key: 'YOUR_WEB3FORMS_KEY',
          to: toEmail,
          subject,
          message,
          from_name: 'FMAC Operations Suite',
        }),
      });
    } catch {
      // Notification failure is non-critical
    }
  };

  /* ── Approve ── */
  const openApproveModal = (u) => {
    setApproveTarget(u);
    setApproveJobTitle(u.jobTitle || JOB_TITLES[0]);
  };

  const handleApprove = async () => {
    if (!approveTarget || !approveJobTitle) return;
    setApproveLoading(true);
    try {
      const mapping = JOB_TITLE_PERMISSIONS[approveJobTitle];
      await updateDoc(doc(db, 'users', approveTarget.uid), {
        status: 'approved',
        approved: true,
        jobTitle: approveJobTitle,
        role: mapping.role,
        permissions: mapping.permissions,
        approvedBy: user?.email,
        approvedAt: serverTimestamp(),
      });
      showToast(`${lang === 'ar' ? 'تمت الموافقة على' : 'Approved'} ${approveTarget.displayName || approveTarget.email}`);
      await sendNotification(
        approveTarget.email,
        approveTarget.displayName || approveTarget.email,
        'تمت الموافقة على طلب انضمامك — FMAC Operations Suite',
        `مرحباً ${approveTarget.displayName || ''},\n\nتمت الموافقة على طلبك.\nالمسمى الوظيفي: ${approveJobTitle}\nيمكنك الآن تسجيل الدخول.`,
      );
      setApproveTarget(null);
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setApproveLoading(false);
    }
  };

  /* ── Reject ── */
  const handleReject = async (u) => {
    const confirmed = window.confirm(
      lang === 'ar'
        ? `هل أنت متأكد من رفض طلب ${u.displayName || u.email}؟`
        : `Reject request from ${u.displayName || u.email}?`
    );
    if (!confirmed) return;
    try {
      await updateDoc(doc(db, 'users', u.uid), { status: 'rejected' });
      showToast(`${lang === 'ar' ? 'تم رفض طلب' : 'Rejected'} ${u.displayName || u.email}`);
      await sendNotification(
        u.email,
        u.displayName || u.email,
        'بشأن طلب انضمامك — FMAC Operations Suite',
        `مرحباً ${u.displayName || ''},\n\nنأسف لإبلاغك بأنه تعذر قبول طلبك في الوقت الحالي.\nللاستفسار تواصل معنا.`,
      );
    } catch (err) {
      console.error('handleReject failed:', err);
      showToast(lang === 'ar' ? 'حدث خطأ. حاول مرة أخرى.' : 'Error rejecting request. Try again.');
    }
  };

  /* ── Edit role ── */
  const openEditModal = (u) => {
    setEditTarget(u);
    setEditJobTitle(u.jobTitle || JOB_TITLES[0]);
  };

  const handleEditSave = async () => {
    if (!editTarget || !editJobTitle) return;
    setEditLoading(true);
    try {
      const mapping = JOB_TITLE_PERMISSIONS[editJobTitle];
      await updateDoc(doc(db, 'users', editTarget.uid), {
        jobTitle: editJobTitle,
        role: mapping.role,
        permissions: mapping.permissions,
      });
      showToast(lang === 'ar' ? 'تم تحديث الدور' : 'Role updated');
      setEditTarget(null);
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setEditLoading(false);
    }
  };

  /* ── Deactivate / reactivate ── */
  const handleToggleStatus = async (u) => {
    const newStatus = u.status === 'approved' ? 'deactivated' : 'approved';
    try {
      // Keep `approved` in sync with status so the login check and the badge
      // never disagree (reactivating restores approved: true).
      await updateDoc(doc(db, 'users', u.uid), {
        status: newStatus,
        approved: newStatus === 'approved',
      });
      showToast(lang === 'ar' ? 'تم تحديث الحالة' : 'Status updated');
    } catch (err) {
      console.error('handleToggleStatus failed:', err);
      showToast(lang === 'ar' ? 'حدث خطأ. حاول مرة أخرى.' : 'Error updating status. Try again.');
    }
  };

  /* ── Delete ── */
  const handleDelete = async (u) => {
    const confirmed = window.confirm(
      lang === 'ar'
        ? `هل تريد حذف حساب ${u.displayName || u.email} نهائياً؟`
        : `Permanently delete ${u.displayName || u.email}?`
    );
    if (!confirmed) return;
    try {
      await deleteDoc(doc(db, 'users', u.uid));
      showToast(lang === 'ar' ? 'تم الحذف' : 'User deleted');
    } catch (err) {
      console.error('handleDelete failed:', err);
      showToast(lang === 'ar' ? 'حدث خطأ. حاول مرة أخرى.' : 'Error deleting user. Try again.');
    }
  };

  /* ── Password reset handlers ── */
  const handleSetTempPassword = async (req) => {
    const uid = req.uid;
    if (!uid) {
      alert(lang === 'ar' ? 'UID المستخدم غير موجود في الطلب.' : 'User UID is missing from the request. Re-submit is needed.');
      return;
    }
    try {
      const adminSetTempPassword = httpsCallable(functions, 'adminSetTempPassword');
      await adminSetTempPassword({ uid });
      await updateDoc(doc(db, 'password_reset_requests', req.id), {
        status: 'resolved',
        resolvedAt: serverTimestamp(),
      });
      showToast(lang === 'ar'
        ? 'تم تعيين كلمة المرور المؤقتة "000000" — سيُطلب من المستخدم تغييرها عند تسجيل الدخول'
        : 'Temp password set to "000000" — user will be prompted to change it on next login');
    } catch (err) {
      const isNotDeployed = err.message?.includes('internal') || err.code === 'functions/internal';
      alert(isNotDeployed
        ? (lang === 'ar'
            ? 'الوظيفة السحابية غير منشورة بعد.\nافتح Terminal وشغّل: firebase deploy --only functions'
            : 'Cloud Function not deployed yet.\nOpen a terminal and run: firebase deploy --only functions')
        : 'Error: ' + err.message);
    }
  };

  const handleDismissReset = async (req) => {
    try {
      await updateDoc(doc(db, 'password_reset_requests', req.id), { status: 'dismissed' });
      showToast(lang === 'ar' ? 'تم رفض الطلب' : 'Request dismissed');
    } catch (err) {
      console.error('handleDismissReset failed:', err);
      showToast(lang === 'ar' ? 'حدث خطأ. حاول مرة أخرى.' : 'Error dismissing request. Try again.');
    }
  };

  /* ── Filtered users ── */
  const filteredUsers = allUsers.filter(u => {
    const q = search.toLowerCase();
    const matchSearch = !q
      || (u.displayName || '').toLowerCase().includes(q)
      || (u.email || '').toLowerCase().includes(q);
    const matchJob = !filterJobTitle || u.jobTitle === filterJobTitle;
    const matchStatus = !filterStatus || u.status === filterStatus;
    return matchSearch && matchJob && matchStatus;
  });

  const pendingCount = pendingUsers.length;

  /* ── Gate: only HOD and master admin see this module ── */
  if (!canManageUsers) {
    return <LockedModule lang={lang} />;
  }

  return (
    <motion.div
      className="logistics-module-container theme-users"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
    >
      {/* Tab rail */}
      <nav className="luxury-tab-rail animate-fade-in" style={{ marginLeft: '24px', marginTop: '8px', marginBottom: '20px' }}>
        <button
          className={`tab-item ${activeTab === 'pending' ? 'active' : ''}`}
          onClick={() => setActiveTab('pending')}
          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          {lang === 'ar' ? 'الطلبات المعلقة' : 'Pending Requests'}
          {pendingCount > 0 && (
            <span style={{
              background: '#e11d48', color: '#fff', borderRadius: '10px',
              fontSize: '0.65rem', fontWeight: 800, padding: '1px 6px', minWidth: '18px', textAlign: 'center',
            }}>
              {pendingCount}
            </span>
          )}
        </button>
        <button
          className={`tab-item ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          {lang === 'ar' ? 'المستخدمون' : 'All Users'}
        </button>
        {isMasterAdmin && (
          <button
            className={`tab-item ${activeTab === 'resets' ? 'active' : ''}`}
            onClick={() => setActiveTab('resets')}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            {lang === 'ar' ? 'استعادة كلمة المرور' : 'Password Resets'}
            {passwordResets.length > 0 && (
              <span style={{
                background: '#f59e0b', color: '#fff', borderRadius: '10px',
                fontSize: '0.65rem', fontWeight: 800, padding: '1px 6px', minWidth: '18px', textAlign: 'center',
              }}>
                {passwordResets.length}
              </span>
            )}
          </button>
        )}
      </nav>

      <div className="main-layout">
        <main className="main-content">
          <AnimatePresence mode="wait">
            {activeTab === 'pending' ? (
              <motion.div key="pending" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <PendingTab
                  users={pendingUsers}
                  loading={loadingPending}
                  lang={lang}
                  onApprove={openApproveModal}
                  onReject={handleReject}
                />
              </motion.div>
            ) : activeTab === 'resets' ? (
              <motion.div key="resets" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <PasswordResetsTab
                  requests={passwordResets}
                  loading={loadingResets}
                  lang={lang}
                  onSetTemp={handleSetTempPassword}
                  onDismiss={handleDismissReset}
                />
              </motion.div>
            ) : (
              <motion.div key="users" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <AllUsersTab
                  users={filteredUsers}
                  loading={loadingAll}
                  lang={lang}
                  search={search}
                  setSearch={setSearch}
                  filterJobTitle={filterJobTitle}
                  setFilterJobTitle={setFilterJobTitle}
                  filterStatus={filterStatus}
                  setFilterStatus={setFilterStatus}
                  canManageUsers={canManageUsers}
                  isMasterAdmin={isMasterAdmin}
                  onEdit={openEditModal}
                  onToggleStatus={handleToggleStatus}
                  onDelete={handleDelete}
                  masterAdminEmail={MASTER_ADMIN_EMAIL}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      {/* ── Approve Modal ── */}
      <AnimatePresence>
        {approveTarget && (
          <div className="modal-backdrop">
            <motion.div
              className="modal-surface-premium"
              initial={{ opacity: 0, scale: 0.94, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              style={{ maxWidth: '460px' }}
            >
              <div className="modal-header-luxe">
                <div>
                  <div className="mission-badge" style={{ marginBottom: '8px' }}>
                    {lang === 'ar' ? 'تأكيد الموافقة' : 'Confirm Approval'}
                  </div>
                  <h2 style={{ margin: 0 }}>{approveTarget.displayName || approveTarget.email}</h2>
                  <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--theme-text-muted)' }}>{approveTarget.email}</p>
                </div>
                <button onClick={() => setApproveTarget(null)} className="btn-ghost"
                  style={{ width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                  <X size={18} />
                </button>
              </div>

              <div className="modal-body-luxe">
                <div className="field-group">
                  <label className="field-label-luxe">
                    {lang === 'ar' ? 'المسمى الوظيفي' : 'Job Title'}
                  </label>
                  <CustomSelect
                    value={approveJobTitle}
                    onChange={setApproveJobTitle}
                    options={JOB_TITLES.map(title => ({ value: title, label: title }))}
                  />
                </div>

                <div className="field-group">
                  <label className="field-label-luxe">{lang === 'ar' ? 'معاينة الصلاحيات' : 'Permissions Preview'}</label>
                  <PermPreview jobTitle={approveJobTitle} />
                </div>
              </div>

              <div className="modal-footer-luxe">
                <button onClick={() => setApproveTarget(null)} className="btn-ghost" style={{ flex: 1, padding: '14px' }}>
                  {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  onClick={handleApprove}
                  disabled={approveLoading}
                  className="btn-premium"
                  style={{ flex: 2, padding: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                >
                  <CheckCircle size={16} />
                  {approveLoading
                    ? (lang === 'ar' ? 'جاري...' : 'Processing...')
                    : (lang === 'ar' ? 'تأكيد الموافقة' : 'Confirm Approval')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Edit Role Modal ── */}
      <AnimatePresence>
        {editTarget && (
          <div className="modal-backdrop">
            <motion.div
              className="modal-surface-premium"
              initial={{ opacity: 0, scale: 0.94, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              style={{ maxWidth: '460px' }}
            >
              <div className="modal-header-luxe">
                <div>
                  <div className="mission-badge" style={{ marginBottom: '8px' }}>
                    {lang === 'ar' ? 'تعديل الدور' : 'Edit Role'}
                  </div>
                  <h2 style={{ margin: 0 }}>{editTarget.displayName || editTarget.email}</h2>
                </div>
                <button onClick={() => setEditTarget(null)} className="btn-ghost"
                  style={{ width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                  <X size={18} />
                </button>
              </div>

              <div className="modal-body-luxe">
                <div className="field-group">
                  <label className="field-label-luxe">{lang === 'ar' ? 'المسمى الوظيفي' : 'Job Title'}</label>
                  <div>
                    <CustomSelect
                      value={editJobTitle}
                      onChange={setEditJobTitle}
                      options={JOB_TITLES.map(title => ({ value: title, label: title }))}
                    />
                  </div>
                </div>
                <div className="field-group">
                  <label className="field-label-luxe">{lang === 'ar' ? 'معاينة الصلاحيات' : 'Permissions Preview'}</label>
                  <PermPreview jobTitle={editJobTitle} />
                </div>
              </div>

              <div className="modal-footer-luxe">
                <button onClick={() => setEditTarget(null)} className="btn-ghost" style={{ flex: 1, padding: '14px' }}>
                  {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  onClick={handleEditSave}
                  disabled={editLoading}
                  className="btn-premium"
                  style={{ flex: 2, padding: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                >
                  <ShieldCheck size={16} />
                  {editLoading ? (lang === 'ar' ? 'جاري...' : 'Saving...') : (lang === 'ar' ? 'حفظ التغييرات' : 'Save Changes')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast && <Toast key={toast} message={toast} onDone={() => setToast(null)} />}
      </AnimatePresence>
    </motion.div>
  );
}

/* ════════════════════════════════════════════════════════
   PASSWORD RESETS TAB
   ════════════════════════════════════════════════════════ */
function PasswordResetsTab({ requests, loading, lang, onSetTemp, onDismiss }) {
  if (loading) {
    return (
      <div style={{ padding: '80px', display: 'flex', justifyContent: 'center' }}>
        <div className="app-loader"><span /><span /><span /><span /><span /></div>
      </div>
    );
  }

  if (!requests.length) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 32px', color: 'var(--theme-text-muted)' }}>
        <CheckCircle size={48} style={{ color: '#10b981', marginBottom: '16px', opacity: 0.6 }} />
        <p style={{ fontSize: '1rem', fontWeight: 700, color: '#10b981' }}>
          {lang === 'ar' ? 'لا توجد طلبات استعادة معلقة' : 'No pending password reset requests'}
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px', padding: '0 0 32px 0' }}>
      {requests.map(req => (
        <motion.div
          key={req.id}
          className="glass-panel"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ padding: '20px', borderRadius: '16px' }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '12px' }}>
            <div className="avatar" style={{ flexShrink: 0, background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }}>
              <Key size={18} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, color: 'var(--theme-text-main)', fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {req.email}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: '#f59e0b', marginTop: '4px' }}>
                <Clock size={11} />
                {fmtDateTime(req.requestedAt)}
              </div>
            </div>
          </div>

          {req.displayName && (
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--theme-text-main)', marginBottom: '8px' }}>
              {req.displayName}
            </div>
          )}
          <p style={{ fontSize: '0.78rem', color: 'var(--theme-text-muted)', marginBottom: '16px', lineHeight: 1.5 }}>
            {lang === 'ar'
              ? 'طلب هذا المستخدم إعادة تعيين كلمة مروره. اضغط "تعيين كلمة مؤقتة" لتعيين كلمة المرور إلى "000000" — سيُطلب منه تغييرها عند تسجيل الدخول.'
              : 'This user requested a password reset. Click "Set Temp Password" to set their password to "000000" — they will be prompted to change it on next login.'}
          </p>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => onSetTemp(req)}
              style={{
                flex: 2, padding: '9px 0', borderRadius: '8px', border: 'none',
                background: 'rgba(16,185,129,0.12)', color: '#10b981',
                fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(16,185,129,0.22)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(16,185,129,0.12)'}
            >
              <Key size={13} />
              {lang === 'ar' ? 'تعيين كلمة مرور مؤقتة (000000)' : 'Set Temp Password (000000)'}
            </button>
            <button
              onClick={() => onDismiss(req)}
              style={{
                flex: 1, padding: '9px 0', borderRadius: '8px', border: 'none',
                background: 'rgba(107,114,128,0.08)', color: '#6b7280',
                fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(107,114,128,0.18)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(107,114,128,0.08)'}
            >
              {lang === 'ar' ? 'رفض' : 'Dismiss'}
            </button>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   PENDING TAB
   ════════════════════════════════════════════════════════ */
function PendingTab({ users, loading, lang, onApprove, onReject }) {
  if (loading) {
    return (
      <div style={{ padding: '80px', display: 'flex', justifyContent: 'center' }}>
        <div className="app-loader"><span /><span /><span /><span /><span /></div>
      </div>
    );
  }

  if (!users.length) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 32px', color: 'var(--theme-text-muted)' }}>
        <CheckCircle size={48} style={{ color: '#10b981', marginBottom: '16px', opacity: 0.6 }} />
        <p style={{ fontSize: '1rem', fontWeight: 700, color: '#10b981' }}>
          {lang === 'ar' ? 'لا توجد طلبات معلقة' : 'No pending requests'}
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px', padding: '0 0 32px 0' }}>
      {users.map(u => (
        <motion.div
          key={u.uid}
          className="glass-panel"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ padding: '20px', borderRadius: '16px' }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '12px' }}>
            <div className="avatar" style={{ flexShrink: 0 }}>
              <Users size={18} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, color: 'var(--theme-text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {u.displayName || (lang === 'ar' ? 'بدون اسم' : 'Unnamed')}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--theme-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {u.email}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: '#f59e0b', flexShrink: 0 }}>
              <Clock size={12} />
              {fmtDate(u.createdAt)}
            </div>
          </div>

          <div style={{ marginBottom: '4px' }}>
            <span style={{
              fontSize: '0.78rem', fontWeight: 700, padding: '3px 10px',
              borderRadius: '6px', background: 'var(--theme-surface-hover)',
              color: 'var(--theme-text-main)', border: '1px solid var(--theme-border)',
            }}>
              {u.jobTitle || (lang === 'ar' ? 'لم يُحدد' : 'Not specified')}
            </span>
          </div>

          <PermPreview jobTitle={u.jobTitle} />

          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            <button
              onClick={() => onApprove(u)}
              style={{
                flex: 1, padding: '9px 0', borderRadius: '8px', border: 'none',
                background: 'rgba(16,185,129,0.12)', color: '#10b981',
                fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(16,185,129,0.22)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(16,185,129,0.12)'}
            >
              <CheckCircle size={14} />
              {lang === 'ar' ? 'موافقة' : 'Approve'}
            </button>
            <button
              onClick={() => onReject(u)}
              style={{
                flex: 1, padding: '9px 0', borderRadius: '8px', border: 'none',
                background: 'rgba(225,29,72,0.08)', color: '#e11d48',
                fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(225,29,72,0.18)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(225,29,72,0.08)'}
            >
              <XCircle size={14} />
              {lang === 'ar' ? 'رفض' : 'Reject'}
            </button>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   ALL USERS TAB
   ════════════════════════════════════════════════════════ */
function AllUsersTab({
  users, loading, lang, search, setSearch, filterJobTitle, setFilterJobTitle,
  filterStatus, setFilterStatus, canManageUsers, isMasterAdmin,
  onEdit, onToggleStatus, onDelete, masterAdminEmail,
}) {
  const statusLabel = (s) => {
    if (s === 'approved') return { label: lang === 'ar' ? 'نشط' : 'Active', color: '#10b981' };
    if (s === 'pending') return { label: lang === 'ar' ? 'معلق' : 'Pending', color: '#f59e0b' };
    if (s === 'rejected') return { label: lang === 'ar' ? 'مرفوض' : 'Rejected', color: '#e11d48' };
    if (s === 'deactivated') return { label: lang === 'ar' ? 'موقوف' : 'Deactivated', color: '#6b7280' };
    return { label: s || '—', color: '#6b7280' };
  };

  return (
    <div className="glass-panel animate-fade-in" style={{ padding: 0, overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{
        padding: '20px 24px', borderBottom: '1px solid var(--theme-border)',
        display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center',
      }}>
        <div style={{ position: 'relative', flex: '1 1 200px', minWidth: '160px' }}>
          <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }} />
          <input
            className="input-luxe"
            placeholder={lang === 'ar' ? 'بحث بالاسم أو البريد...' : 'Search name or email...'}
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: '32px', height: '36px', fontSize: '0.82rem' }}
          />
        </div>
        <div style={{ minWidth: 150 }}>
          <CustomSelect
            value={filterJobTitle}
            onChange={setFilterJobTitle}
            options={[{ value: '', label: lang === 'ar' ? 'كل الوظائف' : 'All Job Titles' }, ...JOB_TITLES.map(t => ({ value: t, label: t }))]}
          />
        </div>
        <div style={{ minWidth: 130 }}>
          <CustomSelect
            value={filterStatus}
            onChange={setFilterStatus}
            options={[
              { value: '', label: lang === 'ar' ? 'كل الحالات' : 'All Statuses' },
              { value: 'approved', label: lang === 'ar' ? 'نشط' : 'Active' },
              { value: 'pending', label: lang === 'ar' ? 'معلق' : 'Pending' },
              { value: 'rejected', label: lang === 'ar' ? 'مرفوض' : 'Rejected' },
              { value: 'deactivated', label: lang === 'ar' ? 'موقوف' : 'Deactivated' },
            ]}
          />
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '80px', display: 'flex', justifyContent: 'center' }}>
          <div className="app-loader"><span /><span /><span /><span /><span /></div>
        </div>
      ) : (
        <div style={{ overflowX: 'auto', padding: '0 0 8px 0' }}>
          <table className="table-surface">
            <thead>
              <tr>
                <th>{lang === 'ar' ? 'الاسم' : 'Name'}</th>
                <th>{lang === 'ar' ? 'المسمى الوظيفي' : 'Job Title'}</th>
                <th>{lang === 'ar' ? 'الدور' : 'Role'}</th>
                <th>{lang === 'ar' ? 'الصلاحيات' : 'Permissions'}</th>
                <th>{lang === 'ar' ? 'آخر دخول' : 'Last Login'}</th>
                <th>{lang === 'ar' ? 'الحالة' : 'Status'}</th>
                <th style={{ textAlign: 'right' }}>{lang === 'ar' ? 'إجراءات' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => {
                const isTarget = u.email === masterAdminEmail;
                const { label: statusLbl, color: statusColor } = statusLabel(u.status);
                return (
                  <tr key={u.uid}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div className="avatar"><Users size={16} /></div>
                        <div>
                          <div style={{ fontWeight: 700, color: 'var(--theme-text-main)', fontSize: '0.85rem' }}>
                            {u.displayName || (lang === 'ar' ? 'بدون اسم' : 'Unnamed')}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--theme-text-muted)' }}>{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span style={{
                        fontSize: '0.75rem', fontWeight: 700, padding: '3px 8px',
                        borderRadius: '6px', background: 'var(--theme-surface-hover)',
                        color: 'var(--theme-text-main)', border: '1px solid var(--theme-border)',
                        whiteSpace: 'nowrap',
                      }}>
                        {isTarget ? 'Master Admin' : (u.jobTitle || '—')}
                      </span>
                    </td>
                    <td>
                      <span className="mission-badge">
                        {isTarget ? 'master_admin' : (u.role || '—')}
                      </span>
                    </td>
                    <td>
                      {isTarget ? (
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--theme-accent)' }}>FULL ACCESS</span>
                      ) : (
                        <PermDots permissions={u.permissions} />
                      )}
                    </td>
                    <td style={{ fontSize: '0.78rem', color: 'var(--theme-text-muted)' }}>
                      {fmtDateTime(u.lastLogin)}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{
                          width: '7px', height: '7px', borderRadius: '50%',
                          background: statusColor,
                          boxShadow: u.status === 'approved' ? `0 0 6px ${statusColor}` : 'none',
                        }} />
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: statusColor }}>
                          {statusLbl}
                        </span>
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {!isTarget && (
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', flexWrap: 'wrap' }}>
                          {canManageUsers && u.status !== 'pending' && (
                            <button
                              onClick={() => onEdit(u)}
                              className="btn-premium"
                              style={{ padding: '6px 12px', fontSize: '0.72rem' }}
                            >
                              <ShieldCheck size={12} />
                              {lang === 'ar' ? 'تعديل' : 'Edit'}
                            </button>
                          )}
                          {canManageUsers && u.status !== 'pending' && u.status !== 'rejected' && (
                            <button
                              onClick={() => onToggleStatus(u)}
                              className="btn-ghost"
                              style={{ padding: '6px 10px', fontSize: '0.72rem' }}
                            >
                              {u.status === 'deactivated'
                                ? (lang === 'ar' ? 'تفعيل' : 'Activate')
                                : (lang === 'ar' ? 'تعليق' : 'Deactivate')}
                            </button>
                          )}
                          {isMasterAdmin && (
                            <button
                              onClick={() => onDelete(u)}
                              className="btn-ghost"
                              style={{
                                padding: '6px 8px', borderRadius: '8px',
                                border: 'none', background: 'rgba(225,29,72,0.08)',
                                color: '#e11d48', cursor: 'pointer',
                              }}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!users.length && (
            <div style={{ textAlign: 'center', padding: '48px', color: 'var(--theme-text-ghost)' }}>
              {lang === 'ar' ? 'لا توجد نتائج' : 'No users found'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
