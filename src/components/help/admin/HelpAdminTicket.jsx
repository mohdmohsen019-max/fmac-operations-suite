import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import '../HelpCenter.css';
import { motion } from 'framer-motion';
import { db, auth } from '../../../firebase';
import { doc, getDoc, updateDoc, arrayUnion, serverTimestamp, deleteField, deleteDoc } from 'firebase/firestore';
import {
  ArrowLeft, User, Phone, Mail, Clock, FileText, History, AlertCircle, Loader2, Tag,
  Timer, Star, Flag, GitBranch, CheckCircle2, ArrowUpCircle, Pencil, Gauge, Activity, Trash2,
} from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import CustomSelect from '../../CustomSelect';
import { sendNotification } from '../../../utils/notify';
import {
  slaHoursFor, resolutionMinutesOf, slaMetOf, fmtDuration, CSAT_SCALE, csatMetaOf,
  businessMinutesBetween, intakeMetaOf,
} from '../helpConfig';
import { PRIORITY, priorityMetaOf } from '../ticketSchema';

const Field = ({ label, value }) => (
  <div style={{ marginBottom: '0.75rem' }}>
    <p style={{ color: 'var(--hc-text-muted)', margin: '0 0 0.25rem 0', textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.04em' }}>{label}</p>
    <p style={{ fontWeight: 600, margin: 0 }}>{value}</p>
  </div>
);

const ServiceSpecifics = ({ ticket }) => {
  const { t } = useLanguage();
  const type = ticket.type;
  const sd = ticket.serviceDetails || {};

  if (type === 'complaint') return (
    <>
      {sd.severity && <Field label={t('Nature', 'طبيعة الشكوى')} value={sd.severity} />}
      {sd.against && <Field label={t('Against', 'الشكوى ضد')} value={sd.against} />}
      {sd.targetName && <Field label={t('Name', 'الاسم')} value={sd.targetName} />}
      {sd.busNumber && <Field label={t('Bus', 'رقم الحافلة')} value={sd.busNumber} />}
      {sd.description && <Field label={t('Description', 'الوصف')} value={sd.description} />}
    </>
  )

  if (type === 'inquiry') return (
    <>
      {sd.categories?.length > 0 && <Field label={t('Categories', 'الفئات')} value={sd.categories.join('، ')} />}
      {sd.notes && <Field label={t('Notes', 'ملاحظات')} value={sd.notes} />}
    </>
  )

  if (type === 'suggestion') return (
    <>
      {sd.department && <Field label={t('Department', 'القسم')} value={sd.department} />}
      {sd.priority && <Field label={t('Expected impact', 'التأثير المتوقع')} value={sd.priority} />}
      {sd.outcome && <Field label={t('Expected Outcome', 'النتيجة المتوقعة')} value={sd.outcome} />}
      {sd.description && <Field label={t('Description', 'الوصف')} value={sd.description} />}
    </>
  )

  if (type === 'meeting') return (
    <>
      {sd.meetingWith && <Field label={t('Meeting With', 'الاجتماع مع')} value={sd.meetingWith} />}
      {sd.timing && <Field label={t('Timing', 'طبيعة الموعد')} value={sd.timing} />}
      {sd.preferredDate && <Field label={t('Preferred Date', 'التاريخ المفضل')} value={sd.preferredDate} />}
      {sd.reason && <Field label={t('Reason', 'السبب')} value={sd.reason} />}
    </>
  )

  if (type === 'call') return (
    <>
      {sd.role && <Field label={t('Role', 'الدور')} value={sd.role} />}
      {sd.subject && <Field label={t('Subject', 'الموضوع')} value={sd.subject} />}
      {sd.bestTime && <Field label={t('Best Time', 'أفضل وقت')} value={sd.bestTime} />}
    </>
  )

  if (type === 'maintenance') return (
    <>
      {sd.location && <Field label={t('Location', 'الموقع')} value={sd.location} />}
      {sd.busNumber && <Field label={t('Bus Number', 'رقم الحافلة')} value={sd.busNumber} />}
      {sd.categories?.length > 0 && <Field label={t('Categories', 'الفئات')} value={sd.categories.join('، ')} />}
      {sd.urgency && <Field label={t('Severity', 'درجة الخطورة')} value={sd.urgency} />}
      {sd.description && <Field label={t('Description', 'الوصف')} value={sd.description} />}
    </>
  )

  return null;
}

/* Small labelled section header used across the right rail. */
const SideHead = ({ icon: Icon, children }) => (
  <div style={{ color: 'var(--hc-text-secondary)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
    {Icon && <Icon size={14} />} {children}
  </div>
);

export default function HelpAdminTicket({ userProfile }) {
  const { ticketId } = useParams();
  const navigate = useNavigate();
  const { t, lang } = useLanguage();
  const isRTL = lang === 'ar';
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');
  const [postingNote, setPostingNote] = useState(false);

  const MASTER_ADMIN_EMAIL = import.meta.env.VITE_MASTER_ADMIN_EMAIL;
  const currentUser = auth.currentUser;
  const userRole = (userProfile?.role || '').toLowerCase();
  const isHOD = userRole === 'hod' || userRole.includes('head of operations');
  const canEditHelp = userProfile?.approved === true || userProfile?.status === 'active'
    ? isHOD || (userProfile?.permissions?.helpDesk === 'edit') || userProfile?.email === MASTER_ADMIN_EMAIL
    : false;

  const [showEscalationModal, setShowEscalationModal] = useState(false);
  const [escalationReason, setEscalationReason] = useState('');

  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailData, setEmailData] = useState({ subject: '', body: '' });
  const [copied, setCopied] = useState('');

  const [editingPriority, setEditingPriority] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // رضا المتعامل — staff-recorded on the follow-up call
  const [csatRating, setCsatRating] = useState(0);
  const [csatNotes, setCsatNotes] = useState('');
  const [savingCsat, setSavingCsat] = useState(false);

  useEffect(() => {
    const fetchTicket = async () => {
      try {
        const docSnap = await getDoc(doc(db, 'requests', ticketId));
        if (docSnap.exists()) {
          const data = docSnap.data();
          setRequest({
            id: docSnap.id,
            ...data,
            assignedTo: data.assignedTo || 'chr',
            adminComments: data.adminComments || []
          });
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    if (ticketId) fetchTicket();
  }, [ticketId]);

  /* Closing a ticket must always stamp زمن الإنجاز — via the dropdown or the
     "Mark as Resolved" button. Returns { patch, local } so Firestore gets the
     server sentinel while local state gets renderable values. */
  const buildClosePatch = () => {
    const nowMs = Date.now();
    const createdMs = request?.createdAt?.toDate ? request.createdAt.toDate().getTime() : null;
    /* Clock skew (the closing device's clock is behind the server-stamped
       createdAt) or a still-pending serverTimestamp (createdMs null) yields a
       negative/absent duration. Store no measured fields in that case so the
       stats layer treats it as unmeasured (null) rather than a fabricated
       "0-minute, SLA-met" record that would inflate dashboard averages. */
    const mins = createdMs && nowMs >= createdMs ? Math.round((nowMs - createdMs) / 60000) : null;
    const targetH = request?.slaTargetHours ?? slaHoursFor(request?.type);
    /* زمن الإنجاز is actual elapsed time (mins), but SLA compliance is judged on
       OPEN minutes (Sat off, 09:00–21:00) to match the business-hours deadline. */
    const bizMins = createdMs != null ? businessMinutesBetween(new Date(createdMs), new Date(nowMs)) : null;
    const measured = mins != null
      ? { resolutionMinutes: mins, slaTargetHours: targetH, slaMet: bizMins <= targetH * 60 }
      : {};
    return {
      patch: { status: 'closed', resolvedAt: serverTimestamp(), resolvedBy: currentUser?.email, ...measured },
      local: { status: 'closed', resolvedAt: { toDate: () => new Date() }, resolvedBy: currentUser?.email, ...measured },
    };
  };

  /* Every workflow action is attributed to the person who took it — the activity
     log must answer "WHO did this", not just "what happened". Events are stored
     structurally (action + meta) rather than as a frozen sentence, so the log
     renders correctly in both languages regardless of who wrote it. */
  const actorIdentity = () => ({
    authorName: currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Unknown',
    authorEmail: currentUser?.email || '',
    authorRole: isHOD ? 'HOD' : 'CHR',
  });

  const buildEvent = (action, meta = {}) => {
    const clean = {};
    Object.entries(meta).forEach(([k, v]) => { if (v !== undefined && v !== null) clean[k] = v; });
    return { ...actorIdentity(), kind: 'event', action, meta: clean, createdAt: new Date().toISOString() };
  };

  /* Append an event to the ticket and mirror it into local state. */
  const commitEvent = async (evt, extraPatch = {}, localPatch = {}) => {
    await updateDoc(doc(db, 'requests', ticketId), {
      ...extraPatch, updatedAt: serverTimestamp(), adminComments: arrayUnion(evt),
    });
    setRequest(prev => ({ ...prev, ...localPatch, adminComments: [...(prev.adminComments || []), evt] }));
  };

  const handleStatusChange = async (newStatus) => {
    if (newStatus === request.status) return;
    try {
      if (newStatus === 'closed') {
        const { patch, local } = buildClosePatch();
        const evt = buildEvent('closed', { minutes: local.resolutionMinutes });
        await commitEvent(evt, patch, local);
        return;
      }
      /* Reopening a closed ticket must drop the measurements from that closure —
         otherwise it keeps reporting a resolution time it no longer has, and
         those stale numbers skew the dashboard averages and SLA compliance. */
      const wasClosed = request.status === 'closed';
      const clear = wasClosed ? {
        resolvedAt: deleteField(), resolvedBy: deleteField(),
        resolutionMinutes: deleteField(), slaMet: deleteField(),
      } : {};
      const localClear = wasClosed ? {
        resolvedAt: null, resolvedBy: null, resolutionMinutes: null, slaMet: null,
      } : {};
      const evt = buildEvent(
        newStatus === 'progress' ? 'status_progress' : 'status_new',
        wasClosed ? { reopened: true } : {},
      );
      await commitEvent(evt, { status: newStatus, ...clear }, { status: newStatus, ...localClear });
    } catch (err) {
      alert(t('Error updating status', 'خطأ في تحديث الحالة'));
    }
  };

  /* Priority triage — staff confirm/adjust the provisional (submitter-derived)
     priority. Setting it clears the provisional flag. */
  const handleSetPriority = async (level) => {
    if (level === request.priority) { setEditingPriority(false); return; }
    try {
      const evt = buildEvent('priority', { level, from: request.priority || '' });
      await commitEvent(evt,
        { priority: level, priorityProvisional: false },
        { priority: level, priorityProvisional: false });
      setEditingPriority(false);
    } catch (err) {
      alert(t('Error updating priority', 'خطأ في تحديث الأولوية'));
    }
  };

  const handlePostNote = async () => {
    if (!note.trim()) return;
    setPostingNote(true);
    try {
      const commentData = {
        text: note,
        authorName: currentUser?.displayName || currentUser?.email?.split('@')[0],
        authorRole: isHOD ? 'HOD' : 'CHR',
        authorEmail: currentUser?.email,
        createdAt: new Date().toISOString()
      };
      await updateDoc(doc(db, 'requests', ticketId), {
        adminComments: arrayUnion(commentData),
        updatedAt: serverTimestamp()
      });
      setRequest(prev => ({
        ...prev,
        adminComments: [...(prev.adminComments || []), commentData]
      }));
      setNote('');
    } catch (err) {
      alert(t('Error posting comment', 'خطأ في نشر التعليق'));
    } finally {
      setPostingNote(false);
    }
  };

  const handleResolve = async () => {
    try {
      const { patch, local } = buildClosePatch();
      const evt = buildEvent('closed', { minutes: local.resolutionMinutes });
      await commitEvent(evt, patch, local);
    } catch (err) {
      alert(t('Error resolving ticket', 'خطأ في حل الطلب'));
    }
  };

  /* رضا المتعامل — recorded by staff on the follow-up call, after closure. */
  const handleSaveCsat = async () => {
    if (!csatRating) return;
    setSavingCsat(true);
    try {
      const satisfaction = {
        rating: Number(csatRating),
        notes: csatNotes.trim(),
        method: 'call',
        recordedBy: currentUser?.email || '',
        recordedByName: currentUser?.displayName || currentUser?.email?.split('@')[0] || '',
        recordedAt: new Date().toISOString(),
      };
      const evt = buildEvent('csat', { rating: satisfaction.rating });
      await commitEvent(evt, { satisfaction }, { satisfaction });
      setCsatNotes('');
    } catch (err) {
      alert(t('Error saving satisfaction', 'خطأ في حفظ تقييم الرضا'));
    } finally {
      setSavingCsat(false);
    }
  };

  const handleEscalate = async () => {
    if (!escalationReason.trim()) return;
    try {
      const evt = buildEvent('escalated', { reason: escalationReason });
      await updateDoc(doc(db, 'requests', ticketId), {
        assignedTo: 'hod',
        escalatedAt: serverTimestamp(),
        escalatedBy: currentUser?.email,
        escalatedByName: actorIdentity().authorName,
        escalationReason: escalationReason,
        status: 'progress',
        adminComments: arrayUnion(evt)
      });

      // Notify configured recipients (fire-and-forget, never blocks)
      try {
        sendNotification('escalated_ticket', {
          ticketId: request.ticketNumber,
          type: request.type,
          escalatedBy: userProfile?.displayName || currentUser?.email || 'Unknown',
          escalatedAt: new Date().toISOString(),
        });
      } catch (notifyErr) {
        console.error('escalated_ticket notification failed silently:', notifyErr);
      }

      setRequest(prev => ({
        ...prev,
        assignedTo: 'hod',
        status: 'progress',
        escalationReason,
        escalatedByName: actorIdentity().authorName,
        escalatedAt: { toDate: () => new Date() }, // fallback for local UI
        adminComments: [...(prev.adminComments || []), evt]
      }));
      setShowEscalationModal(false);
      setEscalationReason('');
    } catch (err) {
      alert(t('Error escalating', 'خطأ في التصعيد'));
    }
  };

  /* Permanently remove a ticket. Master admin only, and behind an explicit
     confirm — this is for clearing test submissions, not routine workflow;
     genuine tickets should be closed, which keeps them in the CX statistics. */
  const handleDeleteTicket = async () => {
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'requests', ticketId));
      navigate('/help');
    } catch (err) {
      console.error('[helpdesk] delete failed:', err);
      alert(t('Could not delete this ticket.', 'تعذّر حذف هذه التذكرة.'));
      setDeleting(false);
    }
  };

  const copyToClipboard = (text, field) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(field);
      setTimeout(() => setCopied(''), 2000);
    });
  };

  const openEmailModal = () => {
    const date = new Date(request.createdAt?.toDate ? request.createdAt.toDate() : Date.now()).toLocaleDateString();
    const sender = currentUser?.displayName || currentUser?.email?.split('@')[0];
    const subject = isRTL
      ? `طلب يحتاج إلى اهتمام - ${request.ticketNumber}`
      : `Request Needs Attention - ${request.ticketNumber}`;
    const body = isRTL
      ? `عزيزي المدير،\n\nنود إحاطتكم علماً بوجود طلب يستوجب اهتمامكم:\n\nرقم الطلب: ${request.ticketNumber}\nالنوع: ${request.type}\nمقدم الطلب: ${request.userInfo?.name}\nالتاريخ: ${date}\nالحالة: ${statusLabel(request.status)}\n\nتفاصيل الطلب:\n${request.content?.description}\n\nسبب الرفع للإدارة:\n${request.escalationReason}\n\nمع التحية،\n${sender}\nقسم العمليات — نادي الفجيرة للفنون القتالية`
      : `Dear Manager,\n\nWe would like to bring to your attention a request that requires your review:\n\nTicket No: ${request.ticketNumber}\nType: ${request.type}\nSubmitted by: ${request.userInfo?.name}\nDate: ${date}\nStatus: ${statusLabel(request.status)}\n\nRequest Details:\n${request.content?.description}\n\nReason for Escalation:\n${request.escalationReason}\n\nBest regards,\n${sender}\nOperations Department — Fujairah Martial Arts Club`;
    setEmailData({ subject, body });
    setShowEmailModal(true);
  };

  const statusLabel = (status) => {
    if (status === 'progress') return t('In Progress', 'قيد التنفيذ');
    if (status === 'new') return t('New', 'جديد');
    if (status === 'closed') return t('Closed', 'مغلق');
    return status;
  };

  /* Renders a stored event into readable text in the CURRENT language. Events
     keep their action + meta, so history never gets frozen in one language.
     Legacy rows (pre-attribution) fall back to their stored sentence. */
  const eventLabel = (c) => {
    const m = c.meta || {};
    switch (c.action) {
      case 'escalated':
        return t(`Escalated to the Head of Operations — reason: ${m.reason || '—'}`,
                 `صعّد الطلب إلى رئيس العمليات — السبب: ${m.reason || '—'}`);
      case 'closed':
        return m.minutes != null
          ? t(`Closed the request — resolution time: ${fmtDuration(m.minutes, 'en')}`,
              `أغلق الطلب — زمن الإنجاز: ${fmtDuration(m.minutes, 'ar')}`)
          : t('Closed the request', 'أغلق الطلب');
      case 'status_progress':
        return m.reopened
          ? t('Reopened the closed request and resumed work on it', 'أعاد فتح الطلب المغلق واستأنف العمل عليه')
          : t('Started working on the request', 'بدأ العمل على الطلب');
      case 'status_new':
        return m.reopened
          ? t('Reopened the closed request and returned it to New', 'أعاد فتح الطلب المغلق وأرجعه إلى حالة جديد')
          : t('Set the request back to New', 'أرجع الطلب إلى حالة جديد');
      case 'priority': {
        const to = PRIORITY[m.level];
        const from = PRIORITY[m.from];
        const toL = to ? (isRTL ? to.ar : to.en) : m.level;
        const fromL = from ? (isRTL ? from.ar : from.en) : m.from;
        return fromL
          ? t(`Changed priority from ${fromL} to ${toL}`, `غيّر الأولوية من ${fromL} إلى ${toL}`)
          : t(`Set priority to ${toL}`, `حدّد الأولوية: ${toL}`);
      }
      case 'csat':
        return t(`Recorded customer satisfaction: ${m.rating}/5`, `سجّل رضا المتعامل: ${m.rating}/5`);
      default:
        return c.text || '';
    }
  };

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
      <div className="app-loader"><span /><span /><span /><span /><span /></div>
    </div>
  );

  if (!request) return (
    <div style={{ textAlign: 'center', padding: '4rem' }}>
      <p>{t('Ticket not found.', 'التذكرة غير موجودة.')}</p>
      <button className="hc-btn hc-btn-outline" onClick={() => navigate('/help')}>{t('Go Back', 'رجوع')}</button>
    </div>
  );

  const isOverdue = request.slaDeadline?.toDate
    ? request.slaDeadline.toDate() < new Date() && request.status !== 'closed'
    : false;

  /* service level + زمن الإنجاز for this ticket */
  const targetHours = request.slaTargetHours ?? slaHoursFor(request.type);
  const resolutionMins = resolutionMinutesOf(request);
  const slaOk = slaMetOf(request);

  const priMeta = request.priority ? priorityMetaOf(request.priority) : null;
  const priBasis = request.priorityBasis ? (isRTL ? request.priorityBasis.ar : request.priorityBasis.en) : null;
  const intakeMeta = request.intakeRating ? intakeMetaOf(request.intakeRating.value) : null;

  // Workflow stage index: new → progress → closed
  const stageIndex = request.status === 'closed' ? 2 : request.status === 'progress' ? 1 : 0;
  const STAGES = [
    { key: 'new', ar: 'جديد', en: 'New', icon: Flag },
    { key: 'progress', ar: 'قيد المعالجة', en: 'In progress', icon: GitBranch },
    { key: 'closed', ar: 'مغلق', en: 'Closed', icon: CheckCircle2 },
  ];

  const PRIORITY_ORDER = ['Low', 'Medium', 'High', 'Emergency'];

  return (
    <div style={{ padding: '2rem 3rem', maxWidth: '1400px', margin: '0 auto' }}>
      <button
        className="hc-btn hc-btn-ghost"
        style={{ padding: '0', marginBottom: '1.5rem' }}
        onClick={() => navigate('/help')}
      >
        <ArrowLeft size={16} /> {t('BACK TO LIST', 'العودة إلى القائمة')}
      </button>

      {/* Header — identity + at-a-glance chips */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '2rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: '1.9rem', fontWeight: 800, margin: 0 }}>{t('Ticket', 'تذكرة')} {request.ticketNumber}</h1>
            <span className={`hc-badge ${request.status}`}>{statusLabel(request.status)}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
            <span style={{ padding: '3px 10px', background: 'var(--hc-bg-hover)', border: '1px solid var(--hc-border)', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase' }}>
              {request.type}
            </span>
            {priMeta && (
              <span style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 700, border: `1px solid ${priMeta.hex}`, color: priMeta.hex, display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                <Flag size={11} /> {isRTL ? priMeta.ar : priMeta.en}
                {request.priorityProvisional && <span style={{ opacity: 0.7, fontWeight: 500 }}>· {t('provisional', 'مبدئية')}</span>}
              </span>
            )}
            {isOverdue && (
              <span style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 700, background: 'rgba(232,0,45,0.1)', color: 'var(--hc-accent)', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                <AlertCircle size={11} /> {t('SLA breached', 'تجاوز الموعد')}
              </span>
            )}
          </div>
        </div>
        <div style={{ color: 'var(--hc-text-muted)', fontSize: '0.8rem', fontFamily: 'monospace', paddingTop: '0.4rem' }}>ID: {request.id}</div>
      </header>

      <div className="hc-ticket-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '1.5rem', alignItems: 'start' }}>
        {/* ── Left column ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          <div className="hc-card" style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 240px' }}>
              <SideHead icon={User}>{t('Requester', 'مقدم الطلب')}</SideHead>
              <h2 style={{ fontSize: '1.4rem', margin: '0 0 1rem 0' }}>{request.userInfo.name}</h2>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', color: 'var(--hc-text-secondary)', fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Phone size={14} /> <span dir="ltr">{request.userInfo.phone}</span></div>
                {request.userInfo.email && <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Mail size={14} /> {request.userInfo.email}</div>}
              </div>
              <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ background: 'var(--hc-bg-hover)', border: '1px solid var(--hc-border)', padding: '3px 10px', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 600 }}>{request.userInfo.branch?.toUpperCase()} {t('BRANCH', 'فرع')}</span>
                {request.userInfo.sport && <span style={{ background: 'var(--hc-bg-hover)', border: '1px solid var(--hc-border)', padding: '3px 10px', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 600 }}>{request.userInfo.sport}</span>}
              </div>
            </div>

            <div style={{ flex: '1 1 240px', borderInlineStart: '1px solid var(--hc-border)', paddingInlineStart: '2rem' }}>
              <SideHead icon={Tag}>{t('Service Specifics', 'تفاصيل الخدمة')}</SideHead>
              <ServiceSpecifics ticket={request} />
            </div>
          </div>

          <div className="hc-card">
            <SideHead icon={FileText}>{t('Request Content', 'محتوى الطلب')}</SideHead>
            <div style={{ background: 'var(--hc-bg-hover)', padding: '1.25rem', borderRadius: 'var(--hc-radius-sm)', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
              {request.content?.description || t('No description available (Imported Record).', 'لا يوجد وصف (سجل مستورد).')}
            </div>
          </div>

          <div className="hc-card">
            <SideHead icon={History}>{t('Activity & Comments', 'النشاط والتعليقات')}</SideHead>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
              {(request.adminComments || []).length === 0 ? (
                <div style={{ textAlign: 'center', padding: '1.75rem', color: 'var(--hc-text-muted)', fontSize: '0.85rem', border: '1px dashed var(--hc-border)', borderRadius: 'var(--hc-radius-sm)' }}>
                  {t('No comments yet', 'لا توجد تعليقات بعد')}
                </div>
              ) : (
                request.adminComments.map((comment, i) => {
                  const isEvent = comment.kind === 'event' || comment.authorRole === 'SYS';
                  /* Legacy rows were written before actions were attributed —
                     they genuinely have no actor, so they stay "System". */
                  const legacy = !comment.kind && comment.authorRole === 'SYS';
                  const who = legacy ? t('System', 'النظام') : (comment.authorName || t('Unknown', 'غير معروف'));
                  const role = legacy ? null : comment.authorRole;
                  return (
                    <div key={i} style={{ display: 'flex', gap: '0.85rem' }}>
                      <div style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.68rem', fontWeight: 700,
                        background: isEvent ? 'transparent' : comment.authorRole === 'HOD' ? 'var(--hc-accent)' : 'var(--hc-border)',
                        border: isEvent ? '1px dashed var(--hc-border)' : 'none',
                        color: isEvent ? 'var(--hc-text-muted)' : comment.authorRole === 'HOD' ? '#fff' : 'var(--hc-text-primary)' }}>
                        {isEvent ? <Activity size={14} /> : comment.authorRole}
                      </div>
                      <div style={{ flex: 1, padding: '0.85rem 1rem', borderRadius: 'var(--hc-radius-sm)',
                        background: isEvent ? 'transparent' : 'var(--hc-bg-hover)',
                        border: isEvent ? '1px solid var(--hc-border)' : 'none' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.4rem', fontSize: '0.72rem' }}>
                          <span style={{ fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                            {who}
                            {role && <span style={{ fontWeight: 600, color: 'var(--hc-text-muted)' }}>· {role}</span>}
                            {isEvent && !legacy && (
                              <span style={{ padding: '1px 7px', borderRadius: '999px', background: 'var(--hc-bg-hover)', border: '1px solid var(--hc-border)', fontSize: '0.62rem', fontWeight: 700, color: 'var(--hc-text-muted)' }}>
                                {t('action', 'إجراء')}
                              </span>
                            )}
                          </span>
                          <span style={{ color: 'var(--hc-text-muted)' }}>{new Date(comment.createdAt).toLocaleString()}</span>
                        </div>
                        <p style={{ margin: 0, fontSize: '0.85rem', lineHeight: 1.55, color: isEvent ? 'var(--hc-text-secondary)' : 'var(--hc-text-primary)' }} dir="auto">
                          {isEvent ? eventLabel(comment) : comment.text}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div>
              <textarea
                className="hc-textarea"
                placeholder={t('Add an internal comment...', 'أضف تعليقاً داخلياً...')}
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                style={{ direction: isRTL ? 'rtl' : 'ltr' }}
              />
              {canEditHelp && (
                <button
                  className="hc-btn hc-btn-primary"
                  onClick={handlePostNote}
                  disabled={postingNote || !note.trim()}
                  style={{ marginTop: '0.5rem', width: '100%', padding: '0.7rem', fontSize: '0.85rem' }}
                >
                  {postingNote ? <Loader2 size={15} className="animate-spin" /> : t('Post Comment', 'إرسال التعليق')}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Right rail ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* Workflow — stage + status + actions, one panel */}
          <div className="hc-card">
            <SideHead icon={GitBranch}>{t('Workflow', 'سير العمل')}</SideHead>

            {/* Stage stepper */}
            <div style={{ display: 'flex', marginBottom: '1.5rem' }}>
              {STAGES.map((s, i) => {
                const done = i < stageIndex;
                const active = i === stageIndex;
                const color = done ? 'var(--hc-success, #16a34a)' : active ? 'var(--hc-accent)' : 'var(--hc-border)';
                const Icon = s.icon;
                return (
                  <div key={s.key} style={{ flex: 1, textAlign: 'center', position: 'relative' }}>
                    {i > 0 && <div style={{ position: 'absolute', top: 17, insetInlineEnd: '50%', width: '100%', height: 2, background: i <= stageIndex ? 'var(--hc-success, #16a34a)' : 'var(--hc-border)' }} />}
                    <div style={{ position: 'relative', zIndex: 1, width: 36, height: 36, margin: '0 auto 0.4rem', borderRadius: '50%', background: 'var(--hc-bg-card, var(--hc-surface, #fff))', border: `2px solid ${color}`, color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon size={16} />
                    </div>
                    <span style={{ fontSize: '0.7rem', fontWeight: active ? 800 : 600, color: active || done ? 'var(--hc-text-primary)' : 'var(--hc-text-muted)' }}>{isRTL ? s.ar : s.en}</span>
                    {i === 1 && request.assignedTo === 'hod' && request.status !== 'closed' && (
                      <div style={{ fontSize: '0.62rem', color: 'var(--status-warn)', marginTop: 2 }}>{t('with HOD', 'لدى رئيس العمليات')}</div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Status control */}
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--hc-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.5rem' }}>{t('Set status', 'تغيير الحالة')}</label>
            <CustomSelect
              value={request.status}
              onChange={(v) => canEditHelp && handleStatusChange(v)}
              disabled={!canEditHelp}
              options={[
                { value: 'new', label: `🔴 ${t('NEW', 'جديد')}` },
                { value: 'progress', label: `🟡 ${t('IN PROGRESS', 'قيد التنفيذ')}` },
                { value: 'closed', label: `🟢 ${t('CLOSED', 'مغلق')}` },
              ]}
            />

            {/* Primary actions */}
            {canEditHelp && request.status !== 'closed' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginTop: '1rem' }}>
                <button className="hc-btn hc-btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={handleResolve}>
                  <CheckCircle2 size={15} /> {t('Mark as Resolved', 'حل الطلب')}
                </button>
                {!isHOD && request.assignedTo !== 'hod' && (
                  <button className="hc-btn hc-btn-outline" style={{ width: '100%', justifyContent: 'center', borderColor: 'var(--theme-accent-border, var(--hc-border))', color: 'var(--theme-accent, var(--hc-accent))' }} onClick={() => setShowEscalationModal(true)}>
                    <ArrowUpCircle size={15} /> {t('Escalate to HOD', 'تصعيد إلى رئيس العمليات')}
                  </button>
                )}
                {isHOD && request.assignedTo === 'hod' && (
                  <button className="hc-btn hc-btn-outline" style={{ width: '100%', justifyContent: 'center' }} onClick={openEmailModal}>
                    <Mail size={15} /> {t('Email Manager', 'إرسال بريد للمدير')}
                  </button>
                )}
              </div>
            )}

            {/* Escalation context for HOD */}
            {request.assignedTo === 'hod' && request.escalationReason && (
              <div style={{ marginTop: '1rem', background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.2)', padding: '0.85rem', borderRadius: 'var(--hc-radius-sm)' }}>
                <p style={{ margin: '0 0 0.3rem 0', fontWeight: 700, color: 'var(--status-warn)', fontSize: '0.78rem' }}>
                  {t('Escalated by', 'صعّده')} {request.escalatedByName || request.escalatedBy?.split('@')[0] || t('a staff member', 'أحد الموظفين')}
                </p>
                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--hc-text-muted)' }} dir="auto">{request.escalationReason}</p>
              </div>
            )}
          </div>

          {/* Service level + priority */}
          <div className="hc-card">
            <SideHead icon={Gauge}>{t('Service Level & Priority', 'مستوى الخدمة والأولوية')}</SideHead>

            {/* Priority + override */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid var(--hc-border)' }}>
              <div>
                <p style={{ margin: '0 0 0.25rem', fontSize: '0.72rem', fontWeight: 600, color: 'var(--hc-text-muted)', textTransform: 'uppercase' }}>{t('Priority', 'الأولوية')}</p>
                <span style={{ fontWeight: 800, fontSize: '1rem', color: priMeta?.hex || 'var(--hc-text-primary)' }}>{priMeta ? (isRTL ? priMeta.ar : priMeta.en) : '—'}</span>
                {priBasis && <p style={{ margin: '0.2rem 0 0', fontSize: '0.68rem', color: 'var(--hc-text-muted)' }} dir="auto">{request.priorityProvisional ? t('Provisional · ', 'مبدئية · ') : ''}{priBasis}</p>}
              </div>
              {canEditHelp && (
                <button className="hc-btn hc-btn-ghost" style={{ padding: '0.3rem 0.6rem', fontSize: '0.72rem' }} onClick={() => setEditingPriority(v => !v)}>
                  <Pencil size={12} /> {t('Adjust', 'تعديل')}
                </button>
              )}
            </div>
            {editingPriority && canEditHelp && (
              <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                {PRIORITY_ORDER.map(level => {
                  const m = PRIORITY[level];
                  const sel = request.priority === level;
                  return (
                    <button key={level} onClick={() => handleSetPriority(level)}
                      style={{ flex: '1 1 auto', padding: '0.4rem 0.5rem', borderRadius: 'var(--hc-radius-sm)', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700,
                        border: `1px solid ${sel ? m.hex : 'var(--hc-border)'}`, background: sel ? m.hex : 'transparent', color: sel ? '#fff' : 'var(--hc-text-secondary)' }}>
                      {isRTL ? m.ar : m.en}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Committed target */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem', fontSize: '0.82rem' }}>
              <span style={{ color: 'var(--hc-text-muted)', fontWeight: 600 }}>{t('Committed target', 'المستهدف الملتزم به')}</span>
              <span style={{ fontWeight: 700 }} dir="ltr">{targetHours} {t('h', 'ساعة')}</span>
            </div>

            {/* Deadline */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
              <Clock size={22} color={isOverdue ? 'var(--hc-accent)' : 'var(--hc-text-secondary)'} />
              <div>
                <p style={{ margin: '0 0 0.2rem 0', fontSize: '0.7rem', fontWeight: 600, color: 'var(--hc-text-muted)' }}>{t('RESPONSE DEADLINE', 'الموعد المستهدف للرد')}</p>
                <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: isOverdue ? 'var(--hc-accent)' : 'var(--hc-text-primary)' }} dir="auto">
                  {request.slaDeadline?.toDate ? request.slaDeadline.toDate().toLocaleString(isRTL ? 'ar-AE' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : 'N/A'}
                </p>
              </div>
            </div>

            {/* زمن الإنجاز */}
            {resolutionMins != null && (
              <div style={{ marginTop: '1.1rem', paddingTop: '1.1rem', borderTop: '1px solid var(--hc-border)', display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                <Timer size={22} color={slaOk === false ? 'var(--hc-accent)' : 'var(--hc-success, #16a34a)'} />
                <div style={{ flex: 1 }}>
                  <p style={{ margin: '0 0 0.2rem 0', fontSize: '0.7rem', fontWeight: 600, color: 'var(--hc-text-muted)' }}>{t('RESOLUTION TIME', 'زمن الإنجاز')}</p>
                  <p style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: slaOk === false ? 'var(--hc-accent)' : 'var(--hc-success, #16a34a)' }} dir="auto">
                    {fmtDuration(resolutionMins, lang)}
                  </p>
                </div>
                <span style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '0.68rem', fontWeight: 700, background: slaOk === false ? 'rgba(232,0,45,0.1)' : 'rgba(22,163,74,0.12)', color: slaOk === false ? 'var(--hc-accent)' : '#16a34a' }}>
                  {slaOk === false ? t('Breached', 'تجاوز') : t('Within SLA', 'ضمن المستهدف')}
                </span>
              </div>
            )}
          </div>

          {/* Satisfaction — submission experience (always) + resolution CSAT */}
          <div className="hc-card">
            <SideHead icon={Star}>{t('Satisfaction', 'رضا المتعامل')}</SideHead>

            {/* Submission experience (intake emoji) */}
            <div style={{ marginBottom: '1.1rem', paddingBottom: '1.1rem', borderBottom: '1px solid var(--hc-border)' }}>
              <p style={{ margin: '0 0 0.5rem', fontSize: '0.7rem', fontWeight: 700, color: 'var(--hc-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t('Submission experience', 'تجربة التقديم')}</p>
              {intakeMeta ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span style={{ fontSize: '1.7rem', lineHeight: 1 }}>{intakeMeta.emoji}</span>
                  <div>
                    <span style={{ fontWeight: 800, fontSize: '0.95rem', color: intakeMeta.hex }} dir="auto">{isRTL ? intakeMeta.ar : intakeMeta.en}</span>
                    <span style={{ marginInlineStart: '0.4rem', fontSize: '0.8rem', color: 'var(--hc-text-muted)' }} dir="ltr">{intakeMeta.value}/5</span>
                  </div>
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--hc-text-muted)' }} dir="auto">{t('Not rated by the submitter.', 'لم يقيّمها مقدم الطلب.')}</p>
              )}
            </div>

            {/* Resolution satisfaction (staff CSAT, follow-up call) */}
            <p style={{ margin: '0 0 0.6rem', fontSize: '0.7rem', fontWeight: 700, color: 'var(--hc-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t('Resolution satisfaction', 'رضا الحل')}</p>
            {request.satisfaction ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.6rem' }}>
                  {[1, 2, 3, 4, 5].map(v => (
                    <Star key={v} size={18}
                      fill={v <= request.satisfaction.rating ? (csatMetaOf(request.satisfaction.rating)?.hex || '#16a34a') : 'none'}
                      color={v <= request.satisfaction.rating ? (csatMetaOf(request.satisfaction.rating)?.hex || '#16a34a') : 'var(--hc-border)'} />
                  ))}
                  <span style={{ marginInlineStart: '0.4rem', fontWeight: 700, fontSize: '0.85rem' }} dir="auto">
                    {isRTL ? csatMetaOf(request.satisfaction.rating)?.ar : csatMetaOf(request.satisfaction.rating)?.en}
                  </span>
                </div>
                {request.satisfaction.notes && (
                  <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.82rem', lineHeight: 1.5, background: 'var(--hc-bg-hover)', padding: '0.7rem', borderRadius: 'var(--hc-radius-sm)' }} dir="auto">
                    {request.satisfaction.notes}
                  </p>
                )}
                <p style={{ margin: 0, fontSize: '0.68rem', color: 'var(--hc-text-muted)' }} dir="auto">
                  {t('Recorded by', 'سُجّل بواسطة')} {request.satisfaction.recordedByName} · {t('via follow-up call', 'عبر مكالمة متابعة')}
                </p>
              </div>
            ) : request.status !== 'closed' ? (
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--hc-text-muted)' }} dir="auto">
                {t('Recorded on the follow-up call after the ticket is closed.', 'يُسجَّل عبر مكالمة المتابعة بعد إغلاق الطلب.')}
              </p>
            ) : canEditHelp ? (
              <div>
                <p style={{ margin: '0 0 0.6rem 0', fontSize: '0.75rem', color: 'var(--hc-text-muted)', lineHeight: 1.5 }} dir="auto">
                  {t('Record the rating the customer gave on the follow-up call.', 'سجّل التقييم الذي أبداه المتعامل خلال مكالمة المتابعة.')}
                </p>
                <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.6rem' }}>
                  {CSAT_SCALE.map(c => (
                    <button key={c.value} type="button" title={isRTL ? c.ar : c.en}
                      onClick={() => setCsatRating(c.value)}
                      style={{ flex: 1, padding: '0.5rem 0', borderRadius: 'var(--hc-radius-sm)', cursor: 'pointer', fontWeight: 800, fontSize: '0.85rem',
                        border: `1px solid ${csatRating === c.value ? c.hex : 'var(--hc-border)'}`,
                        background: csatRating === c.value ? c.hex : 'transparent',
                        color: csatRating === c.value ? '#fff' : 'var(--hc-text-secondary)' }}>
                      {c.value}
                    </button>
                  ))}
                </div>
                <textarea className="hc-textarea" rows={2} value={csatNotes} onChange={e => setCsatNotes(e.target.value)}
                  placeholder={t('What did the customer say? (optional)', 'ماذا قال المتعامل؟ (اختياري)')}
                  style={{ direction: isRTL ? 'rtl' : 'ltr', marginBottom: '0.5rem' }} />
                <button className="hc-btn hc-btn-primary" style={{ width: '100%', justifyContent: 'center' }}
                  disabled={!csatRating || savingCsat} onClick={handleSaveCsat}>
                  {savingCsat ? t('Saving…', 'جارٍ الحفظ…') : t('Save satisfaction', 'حفظ التقييم')}
                </button>
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--hc-text-muted)' }} dir="auto">
                {t('Not recorded yet.', 'لم يُسجَّل بعد.')}
              </p>
            )}
          </div>

          {/* Master-admin only: remove a test submission entirely. */}
          {userProfile?.email === MASTER_ADMIN_EMAIL && (
            <div className="hc-card">
              <SideHead icon={Trash2}>{t('Danger Zone', 'منطقة الحذف')}</SideHead>
              {!confirmDelete ? (
                <>
                  <p style={{ margin: '0 0 0.75rem', fontSize: '0.78rem', lineHeight: 1.55, color: 'var(--hc-text-muted)' }} dir="auto">
                    {t('Permanently delete this ticket. Use only for test submissions — real tickets should be closed so they stay in the statistics.',
                       'حذف هذه التذكرة نهائياً. للتذاكر التجريبية فقط — التذاكر الحقيقية يجب إغلاقها لتبقى ضمن الإحصاءات.')}
                  </p>
                  <button
                    className="hc-btn hc-btn-outline"
                    style={{ width: '100%', justifyContent: 'center', borderColor: 'var(--hc-accent)', color: 'var(--hc-accent)' }}
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 size={14} /> {t('Delete ticket', 'حذف التذكرة')}
                  </button>
                </>
              ) : (
                <>
                  <p style={{ margin: '0 0 0.75rem', fontSize: '0.8rem', lineHeight: 1.55, fontWeight: 600 }} dir="auto">
                    {t(`Delete ${request.ticketNumber} permanently? This cannot be undone.`,
                       `حذف ${request.ticketNumber} نهائياً؟ لا يمكن التراجع عن هذا الإجراء.`)}
                  </p>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="hc-btn hc-btn-outline" style={{ flex: 1, justifyContent: 'center' }}
                      onClick={() => setConfirmDelete(false)} disabled={deleting}>
                      {t('Cancel', 'إلغاء')}
                    </button>
                    <button className="hc-btn hc-btn-accent" style={{ flex: 1, justifyContent: 'center' }}
                      onClick={handleDeleteTicket} disabled={deleting}>
                      {deleting
                        ? <Loader2 size={14} className="animate-spin" />
                        : <>{t('Delete', 'حذف')}</>}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Escalation Modal */}
      {showEscalationModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '24px' }}>
          <motion.div
            className="hc-card"
            style={{ width: '100%', maxWidth: '500px', padding: 0, borderTop: '3px solid var(--accent)' }}
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          >
            <div style={{ padding: '1.5rem 2rem', borderBottom: '1px solid var(--hc-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--theme-accent)' }}>{t('Escalate to HOD', 'تصعيد إلى رئيس العمليات')}</h2>
              <button className="hc-btn hc-btn-ghost" onClick={() => setShowEscalationModal(false)} style={{ padding: 0, width: 32, height: 32, borderRadius: '50%', fontSize: '1rem' }}>✕</button>
            </div>
            <div style={{ padding: '1.75rem 2rem' }}>
              <div className="hc-form-group">
                <label className="hc-label">{t('Reason for escalation', 'سبب التصعيد')}</label>
                <textarea className="hc-textarea" rows={4} value={escalationReason} onChange={(e) => setEscalationReason(e.target.value)} style={{ direction: isRTL ? 'rtl' : 'ltr' }} />
              </div>
            </div>
            <div style={{ padding: '1.25rem 2rem', borderTop: '1px solid var(--hc-border)', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button className="hc-btn hc-btn-outline" onClick={() => setShowEscalationModal(false)}>{t('Cancel', 'إلغاء')}</button>
              <button className="hc-btn hc-btn-primary" style={{ background: 'var(--theme-ink)', color: 'var(--theme-ink-text)' }} onClick={handleEscalate} disabled={!escalationReason.trim()}>{t('Confirm Escalation', 'تأكيد التصعيد')}</button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Email Draft Modal */}
      {showEmailModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '24px' }}>
          <motion.div
            className="hc-card"
            style={{ width: '100%', maxWidth: '620px', maxHeight: '90vh', overflowY: 'auto', padding: 0, borderTop: '3px solid var(--hc-accent)' }}
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          >
            <div style={{ padding: '1.5rem 2rem', borderBottom: '1px solid var(--hc-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h2 style={{ margin: '0 0 0.25rem 0', fontSize: '1.05rem', fontWeight: 700 }}>{t('Email Draft', 'مسودة البريد الإلكتروني')}</h2>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--hc-text-muted)' }}>
                  {t('Copy the subject and body below into your work email client.', 'انسخ الموضوع والمحتوى أدناه والصقه في بريدك الإلكتروني.')}
                </p>
              </div>
              <button className="hc-btn hc-btn-ghost" onClick={() => setShowEmailModal(false)} style={{ padding: 0, width: 32, height: 32, borderRadius: '50%', fontSize: '1rem', flexShrink: 0 }}>✕</button>
            </div>

            <div style={{ padding: '1.75rem 2rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <label className="hc-label">{t('Subject', 'الموضوع')}</label>
                  <button
                    className="hc-btn hc-btn-ghost"
                    style={{ padding: '2px 10px', fontSize: '0.75rem', height: 'auto' }}
                    onClick={() => copyToClipboard(emailData.subject, 'subject')}
                  >
                    {copied === 'subject' ? t('Copied!', 'تم النسخ!') : t('Copy', 'نسخ')}
                  </button>
                </div>
                <div className="hc-input" style={{ direction: isRTL ? 'rtl' : 'ltr', cursor: 'text', userSelect: 'all', background: 'var(--hc-bg-hover)' }}>
                  {emailData.subject}
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <label className="hc-label">{t('Body', 'محتوى الرسالة')}</label>
                  <button
                    className="hc-btn hc-btn-ghost"
                    style={{ padding: '2px 10px', fontSize: '0.75rem', height: 'auto' }}
                    onClick={() => copyToClipboard(emailData.body, 'body')}
                  >
                    {copied === 'body' ? t('Copied!', 'تم النسخ!') : t('Copy', 'نسخ')}
                  </button>
                </div>
                <textarea
                  className="hc-textarea"
                  rows={12}
                  value={emailData.body}
                  readOnly
                  style={{ direction: isRTL ? 'rtl' : 'ltr', cursor: 'text', background: 'var(--hc-bg-hover)', resize: 'none' }}
                />
              </div>
            </div>

            <div style={{ padding: '1.25rem 2rem', borderTop: '1px solid var(--hc-border)', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button className="hc-btn hc-btn-outline" onClick={() => setShowEmailModal(false)}>{t('Close', 'إغلاق')}</button>
              <button
                className="hc-btn hc-btn-accent"
                onClick={() => copyToClipboard(`${t('Subject', 'الموضوع')}: ${emailData.subject}\n\n${emailData.body}`, 'all')}
              >
                {copied === 'all' ? t('Copied!', 'تم النسخ!') : t('Copy All', 'نسخ الكل')}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
