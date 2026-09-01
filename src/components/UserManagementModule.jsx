import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, ShieldCheck, X, CheckCircle, XCircle, Trash2,
  Clock, Search, Lock, Key, Pencil, UserCheck, UserX, Crown, Bus,
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
import NotificationSettings from './NotificationSettings';
import ModuleVisibilitySettings from './ModuleVisibilitySettings';
import { recordActivity } from '../services/activityLog';
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
  approved:    { en: 'Active',      ar: 'نشط',   color: 'var(--status-safe)', bg: 'rgba(16,185,129,0.1)',  border: 'rgba(16,185,129,0.28)' },
  pending:     { en: 'Pending',     ar: 'معلق',  color: 'var(--status-warn)', bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.28)' },
  rejected:    { en: 'Rejected',    ar: 'مرفوض', color: 'var(--status-risk)', bg: 'rgba(225,29,72,0.1)',   border: 'rgba(225,29,72,0.28)' },
  deactivated: { en: 'Deactivated', ar: 'موقوف', color: '#8b8b9e', bg: 'rgba(139,139,158,0.1)', border: 'rgba(139,139,158,0.28)' },
};
const statusMeta = (s) => STATUS_META[s] || { en: s || '—', ar: s || '—', color: '#8b8b9e', bg: 'rgba(139,139,158,0.1)', border: 'rgba(139,139,158,0.28)' };

/* ── Avatar: real photo when available, deterministic gradient initials otherwise ──
   Warm Meadow family — distinct per user, harmonized with the tangerine accent. */
const AVATAR_GRADIENTS = [
  ['#a32d2d', '#872424'], ['#8a6d1f', '#6d5518'], ['#0c7a58', '#096246'],
  ['#6d4fc4', '#5a3fa6'], ['#2563eb', '#1d4fc0'], ['#0e7490', '#0b5d74'],
  ['#52525a', '#3c3c44'], ['#b4540b', '#8f430a'],
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
  fleetRidership: { en: 'Fleet › Ridership', ar: 'الأسطول › ركاب الحافلات', child: true },
  inventory: { en: 'Inventory', ar: 'المخزون' },
  helpDesk:  { en: 'Help Desk', ar: 'الدعم' },
  assets:    { en: 'Assets',    ar: 'الأصول' },
  strategy:  { en: 'Strategy',  ar: 'الاستراتيجية' },
  insights:  { en: 'Insights',  ar: 'الرؤى' },
  crisis:    { en: 'Crisis',    ar: 'الأزمات' },
};

const PERM_LEVELS = ['none', 'view', 'edit'];

/* Per-module access editor — master admin & HOD grant None/View/Edit. */
function PermEditor({ perms, onChange, lang }) {
  const levelLabel = (lv) => lv === 'edit'
    ? (lang === 'ar' ? 'تعديل' : 'Edit')
    : lv === 'view' ? (lang === 'ar' ? 'عرض' : 'View')
    : (lang === 'ar' ? 'لا شيء' : 'None');
  return (
    <div className="um-permgrid">
      {Object.entries(MODULE_LABELS).map(([key, label]) => {
        const current = perms?.[key] || 'none';
        return (
          <div key={key} className={`um-permgrid-row${label.child ? ' is-child' : ''}`}>
            <span className="um-permgrid-name">{lang === 'ar' ? label.ar : label.en}</span>
            <div className="um-permgrid-levels">
              {PERM_LEVELS.map(lv => (
                <button
                  key={lv}
                  type="button"
                  className={`um-permgrid-btn um-permgrid-btn--${lv}${current === lv ? ' active' : ''}`}
                  onClick={() => onChange({ ...perms, [key]: lv })}
                >
                  {levelLabel(lv)}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PermPills({ permissions, lang }) {
  if (!permissions) return <span style={{ color: 'var(--theme-text-ghost)', fontSize: '0.75rem' }}>—</span>;
  const active = Object.entries(MODULE_LABELS)
    .map(([key, label]) => ({ key, label: lang === 'ar' ? label.ar : label.en, level: permissions[key] }))
    .filter(item => item.level === 'view' || item.level === 'edit');
  const editing = active.filter(item => item.level === 'edit');
  const viewing = active.filter(item => item.level === 'view');
  const fullAccess = active.length === Object.keys(MODULE_LABELS).length && viewing.length === 0;
  const concise = fullAccess
    ? (lang === 'ar' ? 'وصول كامل' : 'Full access')
    : editing.length === 1 && viewing.length === 1
      ? `${editing[0].label} ${lang === 'ar' ? 'تعديل' : 'Edit'} + ${viewing[0].label} ${lang === 'ar' ? 'عرض' : 'View'}`
      : `${active.length} ${lang === 'ar' ? 'وحدات' : 'modules'}`;
  const breakdown = active
    .map(item => `${item.label}: ${item.level === 'edit' ? (lang === 'ar' ? 'تعديل' : 'Edit') : (lang === 'ar' ? 'عرض' : 'View')}`)
    .join(' · ');
  return (
    <span className="um-access-summary" title={breakdown || (lang === 'ar' ? 'لا توجد صلاحيات' : 'No module access')}>
      <span className="um-access-summary__dot" />
      <span>{active.length ? concise : (lang === 'ar' ? 'لا توجد صلاحيات' : 'No access')}</span>
      {!fullAccess && active.length > 0 && (
        <small>{editing.length} {lang === 'ar' ? 'تعديل' : 'edit'} · {viewing.length} {lang === 'ar' ? 'عرض' : 'view'}</small>
      )}
    </span>
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
  const [editPerms, setEditPerms] = useState({});
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
      await recordActivity({ module: 'users', submodule: 'accounts', action: 'account_approved', titleEn: `Account approved · ${approveTarget.displayName || approveTarget.email}`, titleAr: `تمت الموافقة على الحساب · ${approveTarget.displayName || approveTarget.email}`, detailEn: approveJobTitle, detailAr: approveJobTitle, recordId: approveTarget.uid, path: '/users/dashboard', actor: { uid: user?.uid, email: user?.email, name: user?.displayName } });
      showToast(`${lang === 'ar' ? 'تمت الموافقة على' : 'Approved'} ${approveTarget.displayName || approveTarget.email}`);
      // TODO: wire an approval-notification email through utils/notify.js (needs
      // a 'user_approved' template). The old Web3Forms path used a placeholder
      // key and silently never sent — removed to avoid the false impression that
      // the applicant was notified.
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
      await recordActivity({ module: 'users', submodule: 'accounts', action: 'account_rejected', titleEn: `Account request rejected · ${u.displayName || u.email}`, titleAr: `تم رفض طلب الحساب · ${u.displayName || u.email}`, recordId: u.uid, path: '/users/dashboard', actor: { uid: user?.uid, email: user?.email, name: user?.displayName } });
      showToast(`${lang === 'ar' ? 'تم رفض طلب' : 'Rejected'} ${u.displayName || u.email}`);
      // TODO: wire a rejection-notification email through utils/notify.js when a
      // template exists (the old Web3Forms path had a placeholder key and never
      // actually sent).
    } catch (err) {
      console.error('handleReject failed:', err);
      showToast(lang === 'ar' ? 'حدث خطأ. حاول مرة أخرى.' : 'Error rejecting request. Try again.');
    }
  };

  /* ── Edit role ── */
  const openEditModal = (u) => {
    setEditTarget(u);
    const title = u.jobTitle || JOB_TITLES[0];
    setEditJobTitle(title);
    setEditPerms({
      ...(JOB_TITLE_PERMISSIONS[title]?.permissions || {}),
      ...(u.permissions || {}),
    });
  };

  /* Changing the job title re-seeds the grid from that title's preset. */
  const handleEditTitleChange = (title) => {
    setEditJobTitle(title);
    setEditPerms(JOB_TITLE_PERMISSIONS[title]?.permissions || {});
  };

  const handleEditSave = async () => {
    if (!editTarget || !editJobTitle) return;
    setEditLoading(true);
    try {
      const mapping = JOB_TITLE_PERMISSIONS[editJobTitle];
      await updateDoc(doc(db, 'users', editTarget.uid), {
        jobTitle: editJobTitle,
        role: mapping.role,
        // The grid's custom levels win over the title preset — this is how the
        // master admin / HOD grants or revokes individual module access.
        permissions: { ...mapping.permissions, ...editPerms },
      });
      await recordActivity({
        module: 'users',
        submodule: 'permissions',
        action: 'permissions_updated',
        titleEn: `Permissions updated · ${editTarget.displayName || editTarget.email}`,
        titleAr: `تم تحديث الصلاحيات · ${editTarget.displayName || editTarget.email}`,
        detailEn: editPerms.fleet === 'view' && editPerms.fleetRidership === 'edit'
          ? 'Ridership edit access with read-only Fleet access'
          : `Role: ${editJobTitle}`,
        detailAr: editPerms.fleet === 'view' && editPerms.fleetRidership === 'edit'
          ? 'تعديل ركاب الحافلات مع عرض بقية الأسطول فقط'
          : `الدور: ${editJobTitle}`,
        recordId: editTarget.uid,
        path: '/users/dashboard',
        actor: { uid: user?.uid, email: user?.email, name: user?.displayName },
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
      await recordActivity({ module: 'users', submodule: 'accounts', action: `account_${newStatus}`, titleEn: `Account ${newStatus} · ${u.displayName || u.email}`, titleAr: `${newStatus === 'approved' ? 'تم تفعيل الحساب' : 'تم إيقاف الحساب'} · ${u.displayName || u.email}`, recordId: u.uid, path: '/users/dashboard', actor: { uid: user?.uid, email: user?.email, name: user?.displayName } });
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
      await recordActivity({ module: 'users', submodule: 'accounts', action: 'account_deleted', titleEn: `Account deleted · ${u.displayName || u.email}`, titleAr: `تم حذف الحساب · ${u.displayName || u.email}`, recordId: u.uid, path: '/users/dashboard', actor: { uid: user?.uid, email: user?.email, name: user?.displayName } });
      showToast(lang === 'ar' ? 'تم الحذف' : 'User deleted');
    } catch (err) {
      console.error('handleDelete failed:', err);
      showToast(lang === 'ar' ? 'حدث خطأ. حاول مرة أخرى.' : 'Error deleting user. Try again.');
    }
  };

  /* ── Password reset handlers ── */
  const handleSetTempPassword = async (req) => {
    // Public recovery requests contain only an email so the signed-out screen
    // never needs access to the private users collection.
    const matchingUser = allUsers.find((account) =>
      String(account.email || '').trim().toLowerCase() === String(req.email || '').trim().toLowerCase()
    );
    const uid = req.uid || matchingUser?.uid;
    if (!uid) {
      alert(lang === 'ar' ? 'لا يوجد حساب مسجل بهذا البريد الإلكتروني.' : 'No registered user account matches this email address.');
      return;
    }
    try {
      const adminSetTempPassword = httpsCallable(functions, 'adminSetTempPassword');
      await adminSetTempPassword({ uid });
      await updateDoc(doc(db, 'password_reset_requests', req.id), {
        status: 'resolved',
        resolvedAt: serverTimestamp(),
      });
      await recordActivity({ module: 'users', submodule: 'password-resets', action: 'temporary_password_set', titleEn: `Temporary password set · ${req.email}`, titleAr: `تم تعيين كلمة مرور مؤقتة · ${req.email}`, recordId: req.id, path: '/users/dashboard', actor: { uid: user?.uid, email: user?.email, name: user?.displayName } });
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
      await recordActivity({ module: 'users', submodule: 'password-resets', action: 'password_reset_dismissed', titleEn: `Password reset dismissed · ${req.email}`, titleAr: `تم رفض طلب إعادة كلمة المرور · ${req.email}`, recordId: req.id, path: '/users/dashboard', actor: { uid: user?.uid, email: user?.email, name: user?.displayName } });
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
        {isMasterAdmin && (
          <button
            className={`tab-item ${activeTab === 'notifications' ? 'active' : ''}`}
            onClick={() => setActiveTab('notifications')}
          >
            {lang === 'ar' ? 'الإشعارات' : 'Notifications'}
          </button>
        )}
        {isMasterAdmin && (
          <button
            className={`tab-item ${activeTab === 'modules' ? 'active' : ''}`}
            onClick={() => setActiveTab('modules')}
          >
            {lang === 'ar' ? 'الوحدات' : 'Modules'}
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
        ) : activeTab === 'notifications' ? (
          <motion.div key="notifications" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <NotificationSettings isMasterAdmin={isMasterAdmin} />
          </motion.div>
        ) : activeTab === 'modules' ? (
          <motion.div key="modules" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <ModuleVisibilitySettings isMasterAdmin={isMasterAdmin} />
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
                    onChange={handleEditTitleChange}
                    options={JOB_TITLES.map(title => ({ value: title, label: title }))}
                  />
                </div>
                <div className="um-field">
                  <label>{lang === 'ar' ? 'صلاحيات الوحدات' : 'Module Access'}</label>
                  <button
                    type="button"
                    className="um-ridership-preset"
                    onClick={() => setEditPerms(current => ({
                      ...current,
                      logistics: 'view',
                      fleet: 'view',
                      fleetRidership: 'edit',
                      inventory: 'view',
                      helpDesk: 'view',
                      assets: 'view',
                      strategy: 'view',
                      insights: 'view',
                      crisis: 'view',
                    }))}
                  >
                    <Bus size={15} />
                    <span>
                      <strong>{lang === 'ar' ? 'تطبيق صلاحية محرر ركاب الحافلات' : 'Apply Ridership editor preset'}</strong>
                      <small>{lang === 'ar' ? 'تعديل ركاب الحافلات فقط، وعرض بقية الوحدات.' : 'Edit Ridership only; view every other module.'}</small>
                    </span>
                  </button>
                  <PermEditor perms={editPerms} onChange={setEditPerms} lang={lang} />
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
            <div className="um-avatar" style={{ background: 'rgba(245,158,11,0.15)', color: 'var(--status-warn)', border: '2px solid rgba(245,158,11,0.3)' }}>
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
                  <th>{lang === 'ar' ? 'ملخص الوصول' : 'Access summary'}</th>
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
