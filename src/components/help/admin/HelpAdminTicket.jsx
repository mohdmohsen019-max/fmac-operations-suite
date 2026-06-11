import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import '../HelpCenter.css';
import { motion } from 'framer-motion';
import { db, auth } from '../../../firebase';
import { doc, getDoc, updateDoc, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { ArrowLeft, User, Phone, Mail, MapPin, Clock, FileText, History, CheckCircle2, AlertCircle, Loader2, Tag } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import CustomSelect from '../../CustomSelect';


const Field = ({ label, value }) => (
  <div style={{ marginBottom: '0.75rem' }}>
    <p style={{ color: 'var(--hc-text-muted)', margin: '0 0 0.25rem 0', textTransform: 'uppercase', fontSize: '0.75rem' }}>{label}</p>
    <p style={{ fontWeight: 600, margin: 0 }}>{value}</p>
  </div>
);

const ServiceSpecifics = ({ ticket }) => {
  const { t } = useLanguage();
  const type = ticket.type;
  const sd = ticket.serviceDetails || {};

  if (type === 'complaint') return (
    <>
      {sd.against && <Field label={t('Against', 'الشكوى ضد')} value={sd.against} />}
      {sd.targetName && <Field label={t('Name', 'الاسم')} value={sd.targetName} />}
      {sd.busNumber && <Field label={t('Bus', 'رقم الحافلة')} value={sd.busNumber} />}
      {sd.description && <Field label={t('Description', 'الوصف')} value={sd.description} />}
    </>
  )

  if (type === 'inquiry') return (
    <>
      {sd.categories?.length > 0 && <Field label={t('Categories', 'الفئات')} value={sd.categories.join(', ')} />}
      {sd.notes && <Field label={t('Notes', 'ملاحظات')} value={sd.notes} />}
    </>
  )

  if (type === 'suggestion') return (
    <>
      {sd.department && <Field label={t('Department', 'القسم')} value={sd.department} />}
      {sd.priority && <Field label={t('Priority', 'الأولوية')} value={sd.priority} />}
      {sd.outcome && <Field label={t('Expected Outcome', 'النتيجة المتوقعة')} value={sd.outcome} />}
      {sd.description && <Field label={t('Description', 'الوصف')} value={sd.description} />}
    </>
  )

  if (type === 'meeting') return (
    <>
      {sd.meetingWith && <Field label={t('Meeting With', 'الاجتماع مع')} value={sd.meetingWith} />}
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
      {sd.categories?.length > 0 && <Field label={t('Categories', 'الفئات')} value={sd.categories.join(', ')} />}
      {sd.urgency && <Field label={t('Urgency', 'الأولوية')} value={sd.urgency} />}
      {sd.description && <Field label={t('Description', 'الوصف')} value={sd.description} />}
    </>
  )

  return null;
}

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

  const handleStatusChange = async (newStatus) => {
    try {
      await updateDoc(doc(db, 'requests', ticketId), {
        status: newStatus,
        updatedAt: serverTimestamp()
      });
      setRequest(prev => ({ ...prev, status: newStatus }));
    } catch (err) {
      alert(t('Error updating status', 'خطأ في تحديث الحالة'));
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
      const sysComment = {
        text: `تم إغلاق الطلب بواسطة [${currentUser?.displayName || currentUser?.email?.split('@')[0]}]`,
        authorName: 'System',
        authorRole: 'SYS',
        createdAt: new Date().toISOString()
      };
      await updateDoc(doc(db, 'requests', ticketId), {
        status: 'closed',
        resolvedAt: serverTimestamp(),
        resolvedBy: currentUser?.email,
        adminComments: arrayUnion(sysComment)
      });
      setRequest(prev => ({ ...prev, status: 'closed', adminComments: [...(prev.adminComments || []), sysComment] }));
      alert(t('Ticket resolved successfully', 'تم حل الطلب بنجاح'));
    } catch (err) {
      alert(t('Error resolving ticket', 'خطأ في حل الطلب'));
    }
  };

  const handleEscalate = async () => {
    if (!escalationReason.trim()) return;
    try {
      const sysComment = {
        text: `تم تصعيد الطلب إلى رئيس العمليات — السبب: ${escalationReason}`,
        authorName: 'System',
        authorRole: 'SYS',
        createdAt: new Date().toISOString()
      };
      await updateDoc(doc(db, 'requests', ticketId), {
        assignedTo: 'hod',
        escalatedAt: serverTimestamp(),
        escalatedBy: currentUser?.email,
        escalationReason: escalationReason,
        status: 'progress',
        adminComments: arrayUnion(sysComment)
      });
      setRequest(prev => ({ 
        ...prev, 
        assignedTo: 'hod', 
        status: 'progress', 
        escalationReason,
        escalatedAt: { toDate: () => new Date() }, // fallback for local UI
        adminComments: [...(prev.adminComments || []), sysComment] 
      }));
      setShowEscalationModal(false);
      setEscalationReason('');
      alert(t('Escalated successfully', 'تم التصعيد بنجاح'));
    } catch (err) {
      alert(t('Error escalating', 'خطأ في التصعيد'));
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

  return (
    <div style={{ padding: '2rem 3rem', maxWidth: '1400px', margin: '0 auto' }}>
      <button
        className="hc-btn hc-btn-ghost"
        style={{ padding: '0', marginBottom: '2rem' }}
        onClick={() => navigate('/help')}
      >
        <ArrowLeft size={16} /> {t('BACK TO LIST', 'العودة إلى القائمة')}
      </button>

      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, margin: 0 }}>{t('Ticket', 'تذكرة')} {request.ticketNumber}</h1>
          <span className={`hc-badge ${request.status}`}>{statusLabel(request.status)}</span>
          <span style={{ padding: '4px 10px', background: 'var(--hc-bg-hover)', border: '1px solid var(--hc-border)', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>
            {request.type}
          </span>
        </div>
        <div style={{ color: 'var(--hc-text-muted)', fontSize: '0.875rem', fontFamily: 'monospace' }}>ID: {request.id}</div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '2rem' }}>
        {/* Left Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

          <div className="hc-card" style={{ display: 'flex', gap: '2rem' }}>
            <div style={{ flex: 1 }}>
              <div style={{ color: 'var(--hc-text-secondary)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <User size={14} /> {t('Requester', 'مقدم الطلب')}
              </div>
              <h2 style={{ fontSize: '1.5rem', margin: '0 0 1rem 0' }}>{request.userInfo.name}</h2>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', color: 'var(--hc-text-secondary)', fontSize: '0.875rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Phone size={14} /> {request.userInfo.phone}</div>
                {request.userInfo.email && <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Mail size={14} /> {request.userInfo.email}</div>}
              </div>
              <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem' }}>
                <span style={{ background: 'var(--hc-bg-hover)', border: '1px solid var(--hc-border)', padding: '4px 12px', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600 }}>{request.userInfo.branch.toUpperCase()} {t('BRANCH', 'فرع')}</span>
                {request.userInfo.sport && <span style={{ background: 'var(--hc-bg-hover)', border: '1px solid var(--hc-border)', padding: '4px 12px', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600 }}>{request.userInfo.sport}</span>}
              </div>
            </div>

            <div style={{ flex: 1, borderLeft: '1px solid var(--hc-border)', paddingLeft: '2rem' }}>
              <div style={{ color: 'var(--hc-text-secondary)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Tag size={14} /> {t('Service Specifics', 'تفاصيل الخدمة')}
              </div>
              <ServiceSpecifics ticket={request} />
            </div>
          </div>

          <div className="hc-card">
            <div style={{ color: 'var(--hc-text-secondary)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <FileText size={14} /> {t('Application Content', 'محتوى الطلب')}
            </div>
            <div style={{ background: 'var(--hc-bg-hover)', padding: '1.5rem', borderRadius: 'var(--hc-radius-sm)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
              {request.content?.description || t('No description available (Imported Record).', 'لا يوجد وصف (سجل مستورد).')}
            </div>
          </div>

          <div className="hc-card">
            <div style={{ color: 'var(--hc-text-secondary)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <History size={14} /> {t('Activity & Comments', 'النشاط والتعليقات')}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem' }}>
              {(request.adminComments || []).length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--hc-text-muted)', fontSize: '0.875rem', border: '1px dashed var(--hc-border)', borderRadius: 'var(--hc-radius-sm)' }}>
                  {t('No comments yet', 'لا توجد تعليقات بعد')}
                </div>
              ) : (
                request.adminComments.map((comment, i) => (
                  <div key={i} style={{ display: 'flex', gap: '1rem' }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: comment.authorRole === 'HOD' ? 'var(--hc-accent)' : 'var(--hc-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, flexShrink: 0, color: comment.authorRole === 'HOD' ? '#fff' : 'var(--hc-text-primary)' }}>
                      {comment.authorRole}
                    </div>
                    <div style={{ flex: 1, padding: '1rem', background: 'var(--hc-bg-hover)', borderRadius: 'var(--hc-radius-sm)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.75rem' }}>
                        <span style={{ fontWeight: 700 }}>{comment.authorName}</span>
                        <span style={{ color: 'var(--hc-text-muted)' }}>{new Date(comment.createdAt).toLocaleString()}</span>
                      </div>
                      <p style={{ margin: 0, fontSize: '0.875rem', lineHeight: 1.5 }}>{comment.text}</p>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div style={{ position: 'relative' }}>
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
                  style={{ marginTop: '0.5rem', width: '100%', padding: '0.75rem', fontSize: '0.875rem' }}
                >
                  {t('Post', 'إرسال')}
                </button>
              )}
            </div>
          </div>

        </div>

        {/* Right Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          
          {/* Stage Indicator */}
          <div className="hc-card" style={{ padding: '1.5rem', textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ flex: 1, color: request.assignedTo === 'chr' && request.status !== 'closed' ? 'var(--hc-accent)' : 'var(--hc-text-muted)', fontWeight: request.assignedTo === 'chr' ? 700 : 400, fontSize: '0.75rem' }}>{t('CHR Review', 'CHR المراجعة')}</div>
              <div style={{ flex: 1, color: request.assignedTo === 'hod' && request.status !== 'closed' ? '#f59e0b' : 'var(--hc-text-muted)', fontWeight: request.assignedTo === 'hod' ? 700 : 400, fontSize: '0.75rem' }}>{t('HOD Escalation', 'تصعيد HOD')}</div>
              <div style={{ flex: 1, color: request.status === 'closed' ? '#22c55e' : 'var(--hc-text-muted)', fontWeight: request.status === 'closed' ? 700 : 400, fontSize: '0.75rem' }}>{t('Closed', 'إغلاق')}</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}>
              <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: '2px', background: 'var(--hc-border)', zIndex: 0 }}></div>
              <div style={{ width: 16, height: 16, borderRadius: '50%', background: request.assignedTo === 'chr' && request.status !== 'closed' ? 'var(--hc-accent)' : 'var(--hc-border)', zIndex: 1 }}></div>
              <div style={{ width: 16, height: 16, borderRadius: '50%', background: request.assignedTo === 'hod' && request.status !== 'closed' ? '#f59e0b' : 'var(--hc-border)', zIndex: 1 }}></div>
              <div style={{ width: 16, height: 16, borderRadius: '50%', background: request.status === 'closed' ? '#22c55e' : 'var(--hc-border)', zIndex: 1 }}></div>
            </div>
          </div>

          <div className="hc-card">
            <div style={{ color: 'var(--hc-text-secondary)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '1rem' }}>{t('Execution Status', 'حالة التنفيذ')}</div>
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
          </div>

          {/* Workflow Actions */}
          {request.status !== 'closed' && (
            <div className="hc-card">
              <div style={{ color: 'var(--hc-text-secondary)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '1rem' }}>{t('Workflow Actions', 'إجراءات سير العمل')}</div>

              {!isHOD && request.assignedTo === 'chr' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <button className="hc-btn hc-btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={handleResolve}>✓ {t('Mark as Resolved', 'حل الطلب')}</button>
                  <button className="hc-btn hc-btn-outline" style={{ width: '100%', justifyContent: 'center', borderColor: '#c9a84c', color: '#c9a84c' }} onClick={() => setShowEscalationModal(true)}>↑ {t('Escalate to HOD', 'تصعيد إلى رئيس العمليات')}</button>
                </div>
              )}

              {isHOD && request.assignedTo === 'hod' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.2)', padding: '1rem', borderRadius: 'var(--hc-radius-sm)', marginBottom: '0.5rem' }}>
                    <p style={{ margin: '0 0 0.5rem 0', fontWeight: 600, color: '#f59e0b', fontSize: '0.875rem' }}>📋 {t('Escalated by', 'طلب مُصعَّد من')}: {request.escalatedBy}</p>
                    <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.75rem', color: 'var(--hc-text-muted)' }}>{t('Reason', 'السبب')}: {request.escalationReason}</p>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--hc-text-muted)' }}>{t('Date', 'التاريخ')}: {request.escalatedAt?.toDate ? request.escalatedAt.toDate().toLocaleString() : ''}</p>
                  </div>
                  <button className="hc-btn hc-btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={handleResolve}>✓ {t('Mark as Resolved', 'حل الطلب')}</button>
                  <button className="hc-btn hc-btn-outline" style={{ width: '100%', justifyContent: 'center', borderColor: 'var(--hc-accent)', color: 'var(--hc-accent)' }} onClick={openEmailModal}>📧 {t('Email Manager', 'إرسال بريد للمدير')}</button>
                </div>
              )}
            </div>
          )}

          <div className="hc-card">
            <div style={{ color: 'var(--hc-text-secondary)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '1rem' }}>{t('Service Level Agreement', 'اتفاقية مستوى الخدمة')}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <Clock size={24} color={isOverdue ? 'var(--hc-accent)' : 'var(--hc-text-secondary)'} />
              <div>
                <p style={{ margin: '0 0 0.25rem 0', fontSize: '0.75rem', fontWeight: 600, color: 'var(--hc-text-muted)' }}>{t('RESOLUTION DEADLINE', 'الموعد النهائي للحل')}</p>
                <p style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: isOverdue ? 'var(--hc-accent)' : 'var(--hc-text-primary)' }}>
                  {request.slaDeadline?.toDate ? request.slaDeadline.toDate().toLocaleDateString() : 'N/A'}
                </p>
              </div>
            </div>
            {isOverdue && (
              <div style={{ marginTop: '1rem', background: 'rgba(232, 0, 45, 0.1)', color: 'var(--hc-accent)', padding: '0.75rem', borderRadius: 'var(--hc-radius-sm)', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <AlertCircle size={14} /> {t('SLA BREACHED', 'تجاوز اتفاقية الخدمة')}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Escalation Modal */}
      {showEscalationModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '24px' }}>
          <motion.div
            className="hc-card"
            style={{ width: '100%', maxWidth: '500px', padding: 0, borderTop: '3px solid #c9a84c' }}
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          >
            <div style={{ padding: '1.5rem 2rem', borderBottom: '1px solid var(--hc-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#c9a84c' }}>{t('Escalate to HOD', 'تصعيد إلى رئيس العمليات')}</h2>
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
              <button className="hc-btn hc-btn-primary" style={{ background: '#c9a84c', color: '#fff' }} onClick={handleEscalate} disabled={!escalationReason.trim()}>{t('Confirm Escalation', 'تأكيد التصعيد')}</button>
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
            {/* Header */}
            <div style={{ padding: '1.5rem 2rem', borderBottom: '1px solid var(--hc-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h2 style={{ margin: '0 0 0.25rem 0', fontSize: '1.05rem', fontWeight: 700 }}>{t('Email Draft', 'مسودة البريد الإلكتروني')}</h2>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--hc-text-muted)' }}>
                  {t('Copy the subject and body below into your work email client.', 'انسخ الموضوع والمحتوى أدناه والصقه في بريدك الإلكتروني.')}
                </p>
              </div>
              <button className="hc-btn hc-btn-ghost" onClick={() => setShowEmailModal(false)} style={{ padding: 0, width: 32, height: 32, borderRadius: '50%', fontSize: '1rem', flexShrink: 0 }}>✕</button>
            </div>

            {/* Body */}
            <div style={{ padding: '1.75rem 2rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Subject */}
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

              {/* Body */}
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

            {/* Footer */}
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
