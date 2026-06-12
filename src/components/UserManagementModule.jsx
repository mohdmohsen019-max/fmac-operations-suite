import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, ShieldCheck, X, CheckCircle, XCircle, Trash2,
  Clock, Search, Lock, Key, Pencil, UserCheck, UserX, Crown,
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
import './UserManagementModule.css';

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

const STATUS_META = {
  approved:    { en: 'Active',      ar: 'نشط',   color: '#10b981', bg: 'rgba(16,185,129,0.1)',  border: 'rgba(16,185,129,0.28)' },
  pending:     { en: 'Pending',     ar: 'معلق',  color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.28)' },
  rejected:    { en: 'Rejected',    ar: 'مرفوض', color: '#e11d48', bg: 'rgba(225,29,72,0.1)',   border: 'rgba(225,29,72,0.28)' },
  deactivated: { en: 'Deactivated', ar: 'موقوف', color: '#8b8b9e', bg: 'rgba(139,139,158,0.1)', border: 'rgba(139,139,158,0.28)' },
};
const statusMeta = (s) => STATUS_META[s] || { en: s || '—', ar: s || '—', color: '#8b8b9e', bg: 'rgba(139,139,158,0.1)', border: 'rgba(139,139,158,0.28)' };

/* ── Avatar: real photo when available, deterministic gradient initials otherwise ── */
const AVATAR_GRADIENTS = [
  ['#8b5cf6', '#6d28d9'], ['#06b6d4', '#0e7490'], ['#f59e0b', '#b45309'],
  ['#10b981', '#047857'], ['#ec4899', '#be185d'], ['#3b82f6', '#1d4ed8'],
  ['#f43f5e', '#be123c'], ['#84cc16', '#4d7c0f'],
];

function initialsOf(name, email) {
  const src = (name || '').trim() || (email || '').split('@')[0] || '?';
  const parts = src.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

function gradientFor(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const [a, b] = AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length];
  return `linear-gradient(135deg, ${a}, ${b})`;
}

export function UserAvatar({ user, size = '', statusDotColor }) {
  const photo = user?.photoURL;
  const seed = user?.email || user?.displayName || '?';
  return (
    <div
      className={`um-avatar ${size}`}
      style={photo ? undefined : { background: gradientFor(seed) }}
    >
      {photo
        ? <img src={photo} alt={user?.displayName || 'user'} />
        : initialsOf(user?.displayName, user?.email)}
      {statusDotColor && <span className="um-avatar-dot" style={{ background: statusDotColor }} />}
    </div>
  );
}

/* ── permission preview pills for a job title ── */
const MODULE_LABELS = {
  logistics: { en: 'Logistics', ar: 'اللوجستيات' },
  fleet:     { en: 'Fleet',     ar: 'الأسطول' },
  inventory: { en: 'Inventory', ar: 'المخزون' },
  helpDesk:  { en: 'Help Desk', ar: 'الدعم' },
};

function PermPills({ permissions, lang }) {
  if (!permissions) return <span style={{ color: 'var(--theme-text-ghost)', fontSize: '0.75rem' }}>—</span>;
  return (
    <div className="um-perms">
      {Object.entries(MODULE_LABELS).map(([key, label]) => {
        const level = permissions[key];
        const color = level === 'edit' ? '#10b981' : level === 'view' ? '#f59e0b' : '#6b7280';
        const levelLabel = level === 'edit'
          ? (lang === 'ar' ? 'تعديل' : 'Edit')
          : level === 'view'
            ? (lang === 'ar' ? 'عرض' : 'View')
            : (lang === 'ar' ? 'لا شيء' : 'None');
        return (
          <span
            key={key}
            className="um-perm-pill"
            title={`${lang === 'ar' ? label.ar : label.en}: ${levelLabel}`}
            style={{
              color,
              borderColor: `${color}38`,
              background: `${color}14`,
              opacity: !level || level === 'none' ? 0.45 : 1,
            }}
          >
            {(lang === 'ar' ? label.ar : label.en)} · {levelLabel}
          </span>
        );
      })}
    </div>
  );
}

function PermPreview({ jobTitle, lang }) {
  const mapping = JOB_TITLE_PERMISSIONS[jobTitle];
  if (!mapping) return null;
  return <PermPills permissions={mapping.permissions} lang={lang} />;
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
  const activeCount = allUsers.filter(u => u.status === 'approved').length;
  const deactivatedCount = allUsers.filter(u => u.status === 'deactivated').length;

  /* ── Gate: only HOD and master admin see this module ── */
  if (!canManageUsers) {
    return <LockedModule lang={lang} />;
  }

  return (
    <motion.div
      className="um-module theme-users"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {/* Page header + live stats */}
      <div className="um-header">
        <div className="um-header-text">
          <h1>{lang === 'ar' ? 'إدارة المستخدمين' : 'User Management'}</h1>
          <p>{lang === 'ar' ? 'الموافقات والأدوار والصلاحيات لجميع حسابات الموظفين' : 'Approvals, roles and permissions for all staff accounts'}</p>
        </div>
        <div className="um-stats">
          <div className="um-stat accent">
            <span className="um-stat-value">{allUsers.length}</span>
            <span className="um-stat-label">{lang === 'ar' ? 'الإجمالي' : 'Total'}</span>
          </div>
          <div className="um-stat ok">
            <span className="um-stat-value">{activeCount}</span>
            <span className="um-stat-label">{lang === 'ar' ? 'نشط' : 'Active'}</span>
          </div>
          <div className="um-stat warn">
            <span className="um-stat-value">{pendingCount}</span>
            <span className="um-stat-label">{lang === 'ar' ? 'معلق' : 'Pending'}</span>
          </div>
          <div className="um-stat">
            <span className="um-stat-value">{deactivatedCount}</span>
            <span className="um-stat-label">{lang === 'ar' ? 'موقوف' : 'Inactive'}</span>
          </div>
        </div>
      </div>

      {/* Tab rail */}
      <nav className="luxury-tab-rail um-tab-rail">
        <button
          className={`tab-item ${activeTab === 'pending' ? 'active' : ''}`}
          onClick={() => setActiveTab('pending')}
          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          {lang === 'ar' ? 'الطلبات المعلقة' : 'Pending Requests'}
          {pendingCount > 0 && <span className="um-tab-count red">{pendingCount}</span>}
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
            {passwordResets.length > 0 && <span className="um-tab-count amber">{passwordResets.length}</span>}
          </button>
        )}
      </nav>

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

      {/* ── Approve Modal ── */}
      <AnimatePresence>
        {approveTarget && (
          <div className="um-modal-backdrop" onClick={() => setApproveTarget(null)}>
            <motion.div
              className="um-modal"
              initial={{ opacity: 0, scale: 0.94, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              onClick={e => e.stopPropagation()}
            >
              <div className="um-modal-header">
                <UserAvatar user={approveTarget} size="lg" />
                <div className="um-card-id">
                  <span className="um-modal-kicker">{lang === 'ar' ? 'تأكيد الموافقة' : 'Confirm Approval'}</span>
                  <h2>{approveTarget.displayName || approveTarget.email}</h2>
                  <p>{approveTarget.email}</p>
                </div>
                <button className="um-modal-close" onClick={() => setApproveTarget(null)}><X size={17} /></button>
              </div>

              <div className="um-modal-body">
                <div className="um-field">
                  <label>{lang === 'ar' ? 'المسمى الوظيفي' : 'Job Title'}</label>
                  <CustomSelect
                    value={approveJobTitle}
                    onChange={setApproveJobTitle}
                    options={JOB_TITLES.map(title => ({ value: title, label: title }))}
                  />
                </div>
                <div className="um-field">
                  <label>{lang === 'ar' ? 'معاينة الصلاحيات' : 'Permissions Preview'}</label>
                  <PermPreview jobTitle={approveJobTitle} lang={lang} />
                </div>
              </div>

              <div className="um-modal-footer">
                <button onClick={() => setApproveTarget(null)} className="um-btn um-btn-ghost">
                  {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
                <button onClick={handleApprove} disabled={approveLoading} className="um-btn um-btn-primary">
                  <CheckCircle size={15} />
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
          <div className="um-modal-backdrop" onClick={() => setEditTarget(null)}>
            <motion.div
              className="um-modal"
              initial={{ opacity: 0, scale: 0.94, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              onClick={e => e.stopPropagation()}
            >
              <div className="um-modal-header">
                <UserAvatar user={editTarget} size="lg" />
                <div className="um-card-id">
                  <span className="um-modal-kicker">{lang === 'ar' ? 'تعديل الدور' : 'Edit Role'}</span>
                  <h2>{editTarget.displayName || editTarget.email}</h2>
                  <p>{editTarget.email}</p>
                </div>
                <button className="um-modal-close" onClick={() => setEditTarget(null)}><X size={17} /></button>
              </div>

              <div className="um-modal-body">
                <div className="um-field">
                  <label>{lang === 'ar' ? 'المسمى الوظيفي' : 'Job Title'}</label>
                  <CustomSelect
                    value={editJobTitle}
                    onChange={setEditJobTitle}
                    options={JOB_TITLES.map(title => ({ value: title, label: title }))}
                  />
                </div>
                <div className="um-field">
                  <label>{lang === 'ar' ? 'معاينة الصلاحيات' : 'Permissions Preview'}</label>
                  <PermPreview jobTitle={editJobTitle} lang={lang} />
                </div>
              </div>

              <div className="um-modal-footer">
                <button onClick={() => setEditTarget(null)} className="um-btn um-btn-ghost">
                  {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
                <button onClick={handleEditSave} disabled={editLoading} className="um-btn um-btn-primary">
                  <ShieldCheck size={15} />
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
      <div className="um-loading">
        <div className="app-loader"><span /><span /><span /><span /><span /></div>
      </div>
    );
  }

  if (!requests.length) {
    return (
      <div className="um-empty">
        <div className="um-empty-icon"><CheckCircle size={28} /></div>
        <p>{lang === 'ar' ? 'لا توجد طلبات استعادة معلقة' : 'No pending password reset requests'}</p>
        <span>{lang === 'ar' ? 'ستظهر طلبات المستخدمين هنا فور وصولها' : 'New requests from users will show up here in real time'}</span>
      </div>
    );
  }

  return (
    <div className="um-card-grid">
      {requests.map(req => (
        <motion.div key={req.id} className="um-card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <div className="um-card-head">
            <div className="um-avatar" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '2px solid rgba(245,158,11,0.3)' }}>
              <Key size={17} />
            </div>
            <div className="um-card-id">
              <div className="um-user-name" style={{ maxWidth: 'none' }}>{req.displayName || req.email}</div>
              <div className="um-user-email" style={{ maxWidth: 'none' }}>{req.email}</div>
            </div>
            <span className="um-card-time"><Clock size={11} />{fmtDateTime(req.requestedAt)}</span>
          </div>

          <p className="um-card-note">
            {lang === 'ar'
              ? 'طلب هذا المستخدم إعادة تعيين كلمة مروره. اضغط "تعيين كلمة مؤقتة" لتعيين كلمة المرور إلى "000000" — سيُطلب منه تغييرها عند تسجيل الدخول.'
              : 'This user requested a password reset. "Set Temp Password" resets it to "000000" — they will be prompted to change it on next login.'}
          </p>

          <div className="um-card-actions">
            <button className="um-btn um-btn-ok" onClick={() => onSetTemp(req)} style={{ flex: 2 }}>
              <Key size={13} />
              {lang === 'ar' ? 'تعيين كلمة مؤقتة (000000)' : 'Set Temp Password (000000)'}
            </button>
            <button className="um-btn um-btn-ghost" onClick={() => onDismiss(req)}>
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
      <div className="um-loading">
        <div className="app-loader"><span /><span /><span /><span /><span /></div>
      </div>
    );
  }

  if (!users.length) {
    return (
      <div className="um-empty">
        <div className="um-empty-icon"><CheckCircle size={28} /></div>
        <p>{lang === 'ar' ? 'لا توجد طلبات معلقة' : 'No pending requests'}</p>
        <span>{lang === 'ar' ? 'حسابات التسجيل الجديدة ستظهر هنا للموافقة' : 'New sign-ups will appear here for approval'}</span>
      </div>
    );
  }

  return (
    <div className="um-card-grid">
      {users.map(u => (
        <motion.div key={u.uid} className="um-card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <div className="um-card-head">
            <UserAvatar user={u} />
            <div className="um-card-id">
              <div className="um-user-name" style={{ maxWidth: 'none' }}>
                {u.displayName || (lang === 'ar' ? 'بدون اسم' : 'Unnamed')}
              </div>
              <div className="um-user-email" style={{ maxWidth: 'none' }}>{u.email}</div>
            </div>
            <span className="um-card-time"><Clock size={11} />{fmtDate(u.createdAt)}</span>
          </div>

          <div>
            <span className="um-job-chip">{u.jobTitle || (lang === 'ar' ? 'لم يُحدد' : 'Not specified')}</span>
          </div>

          <PermPreview jobTitle={u.jobTitle} lang={lang} />

          <div className="um-card-actions">
            <button className="um-btn um-btn-ok" onClick={() => onApprove(u)}>
              <CheckCircle size={14} />
              {lang === 'ar' ? 'موافقة' : 'Approve'}
            </button>
            <button className="um-btn um-btn-danger" onClick={() => onReject(u)}>
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
  const renderActions = (u, isTarget) => {
    if (isTarget) return null;
    return (
      <div className="um-actions">
        {canManageUsers && u.status !== 'pending' && (
          <button className="um-btn um-btn-primary" onClick={() => onEdit(u)} title={lang === 'ar' ? 'تعديل الدور' : 'Edit role'}>
            <Pencil size={12} />
            {lang === 'ar' ? 'تعديل' : 'Edit'}
          </button>
        )}
        {canManageUsers && u.status !== 'pending' && u.status !== 'rejected' && (
          <button
            className="um-btn um-btn-ghost"
            onClick={() => onToggleStatus(u)}
            title={u.status === 'deactivated'
              ? (lang === 'ar' ? 'إعادة تفعيل الحساب' : 'Reactivate account')
              : (lang === 'ar' ? 'تعليق الحساب' : 'Deactivate account')}
          >
            {u.status === 'deactivated' ? <UserCheck size={13} /> : <UserX size={13} />}
            {u.status === 'deactivated'
              ? (lang === 'ar' ? 'تفعيل' : 'Activate')
              : (lang === 'ar' ? 'تعليق' : 'Deactivate')}
          </button>
        )}
        {isMasterAdmin && (
          <button className="um-btn um-btn-danger um-btn-icon" onClick={() => onDelete(u)} title={lang === 'ar' ? 'حذف نهائي' : 'Delete permanently'}>
            <Trash2 size={13} />
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="um-panel">
      {/* Toolbar */}
      <div className="um-toolbar">
        <div className="um-search">
          <Search size={15} />
          <input
            placeholder={lang === 'ar' ? 'بحث بالاسم أو البريد...' : 'Search name or email...'}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div style={{ minWidth: 165 }}>
          <CustomSelect
            value={filterJobTitle}
            onChange={setFilterJobTitle}
            options={[{ value: '', label: lang === 'ar' ? 'كل الوظائف' : 'All Job Titles' }, ...JOB_TITLES.map(t => ({ value: t, label: t }))]}
          />
        </div>
        <div style={{ minWidth: 140 }}>
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
        <div className="um-loading">
          <div className="app-loader"><span /><span /><span /><span /><span /></div>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="um-table-wrap">
            <table className="um-table">
              <thead>
                <tr>
                  <th>{lang === 'ar' ? 'المستخدم' : 'User'}</th>
                  <th>{lang === 'ar' ? 'المسمى الوظيفي' : 'Job Title'}</th>
                  <th>{lang === 'ar' ? 'الصلاحيات' : 'Permissions'}</th>
                  <th>{lang === 'ar' ? 'آخر دخول' : 'Last Login'}</th>
                  <th>{lang === 'ar' ? 'الحالة' : 'Status'}</th>
                  <th style={{ textAlign: lang === 'ar' ? 'left' : 'right' }}>{lang === 'ar' ? 'إجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => {
                  const isTarget = u.email === masterAdminEmail;
                  const sm = statusMeta(u.status);
                  return (
                    <tr key={u.uid}>
                      <td>
                        <div className="um-user-cell">
                          <UserAvatar user={u} statusDotColor={sm.color} />
                          <div style={{ minWidth: 0 }}>
                            <div className="um-user-name" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              {u.displayName || (lang === 'ar' ? 'بدون اسم' : 'Unnamed')}
                              {isTarget && <Crown size={13} style={{ color: 'var(--theme-accent-bright)', flexShrink: 0 }} />}
                            </div>
                            <div className="um-user-email">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`um-job-chip ${isTarget ? 'master' : ''}`}>
                          {isTarget ? 'Master Admin' : (u.jobTitle || '—')}
                        </span>
                      </td>
                      <td>
                        {isTarget
                          ? <span className="um-full-access">{lang === 'ar' ? 'وصول كامل' : 'FULL ACCESS'}</span>
                          : <PermPills permissions={u.permissions} lang={lang} />}
                      </td>
                      <td style={{ fontSize: '0.76rem', color: 'var(--theme-text-muted)', whiteSpace: 'nowrap' }}>
                        {fmtDateTime(u.lastLogin)}
                      </td>
                      <td>
                        <span className="um-status" style={{ color: sm.color, background: sm.bg, borderColor: sm.border }}>
                          <span className="um-status-dot" />
                          {lang === 'ar' ? sm.ar : sm.en}
                        </span>
                      </td>
                      <td>{renderActions(u, isTarget)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!users.length && (
              <div className="um-empty">
                <div className="um-empty-icon" style={{ background: 'var(--theme-accent-soft)', color: 'var(--theme-accent-bright)' }}><Users size={26} /></div>
                <p>{lang === 'ar' ? 'لا توجد نتائج' : 'No users found'}</p>
                <span>{lang === 'ar' ? 'جرّب تعديل البحث أو الفلاتر' : 'Try adjusting your search or filters'}</span>
              </div>
            )}
          </div>

          {/* Mobile cards */}
          <div className="um-mobile-list">
            {users.map(u => {
              const isTarget = u.email === masterAdminEmail;
              const sm = statusMeta(u.status);
              return (
                <div key={u.uid} className="um-mobile-card">
                  <div className="um-mobile-card-top">
                    <UserAvatar user={u} statusDotColor={sm.color} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="um-user-name">{u.displayName || (lang === 'ar' ? 'بدون اسم' : 'Unnamed')}</div>
                      <div className="um-user-email">{u.email}</div>
                    </div>
                    <span className="um-status" style={{ color: sm.color, background: sm.bg, borderColor: sm.border }}>
                      {lang === 'ar' ? sm.ar : sm.en}
                    </span>
                  </div>
                  <div className="um-mobile-card-meta">
                    <span className={`um-job-chip ${isTarget ? 'master' : ''}`}>
                      {isTarget ? 'Master Admin' : (u.jobTitle || '—')}
                    </span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--theme-text-ghost)' }}>
                      {lang === 'ar' ? 'آخر دخول:' : 'Last login:'} {fmtDateTime(u.lastLogin)}
                    </span>
                  </div>
                  {renderActions(u, isTarget)}
                </div>
              );
            })}
            {!users.length && (
              <div className="um-empty">
                <p>{lang === 'ar' ? 'لا توجد نتائج' : 'No users found'}</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
