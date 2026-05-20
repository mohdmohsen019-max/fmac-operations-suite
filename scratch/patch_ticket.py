import re
import os

target_file = r"c:\Users\mohdm\Desktop\Projects\FMAC Logistics Hub\src\components\help\admin\HelpAdminTicket.jsx"

with open(target_file, "r", encoding="utf-8") as f:
    code = f.read()

# 1. Imports
code = code.replace("import { db } from '../../../firebase';", "import { db, auth } from '../../../firebase';")
code = code.replace("import { doc, getDoc, updateDoc, arrayUnion, serverTimestamp } from 'firebase/firestore';", "import { doc, getDoc, updateDoc, arrayUnion, serverTimestamp } from 'firebase/firestore';")

# 2. Service Specifics Component
service_specifics = """
const Field = ({ label, value }) => (
  <div style={{ marginBottom: '0.75rem' }}>
    <p style={{ color: 'var(--hc-text-muted)', margin: '0 0 0.25rem 0', textTransform: 'uppercase', fontSize: '0.75rem' }}>{label}</p>
    <p style={{ fontWeight: 600, margin: 0 }}>{value}</p>
  </div>
);

const ServiceSpecifics = ({ ticket }) => {
  const type = ticket.type;
  const sd = ticket.serviceDetails || {};

  if (type === 'complaint') return (
    <>
      {sd.against && <Field label="الشكوى ضد / Against" value={sd.against} />}
      {sd.targetName && <Field label="الاسم / Name" value={sd.targetName} />}
      {sd.busNumber && <Field label="رقم الحافلة / Bus" value={sd.busNumber} />}
      {sd.description && <Field label="الوصف / Description" value={sd.description} />}
    </>
  )

  if (type === 'inquiry') return (
    <>
      {sd.categories?.length > 0 && <Field label="الفئات / Categories" value={sd.categories.join(', ')} />}
      {sd.notes && <Field label="ملاحظات / Notes" value={sd.notes} />}
    </>
  )

  if (type === 'suggestion') return (
    <>
      {sd.department && <Field label="القسم / Department" value={sd.department} />}
      {sd.priority && <Field label="الأولوية / Priority" value={sd.priority} />}
      {sd.outcome && <Field label="النتيجة المتوقعة / Expected Outcome" value={sd.outcome} />}
      {sd.description && <Field label="الوصف / Description" value={sd.description} />}
    </>
  )

  if (type === 'meeting') return (
    <>
      {sd.meetingWith && <Field label="الاجتماع مع / Meeting With" value={sd.meetingWith} />}
      {sd.preferredDate && <Field label="التاريخ المفضل / Preferred Date" value={sd.preferredDate} />}
      {sd.reason && <Field label="السبب / Reason" value={sd.reason} />}
    </>
  )

  if (type === 'call') return (
    <>
      {sd.role && <Field label="الدور / Role" value={sd.role} />}
      {sd.subject && <Field label="الموضوع / Subject" value={sd.subject} />}
      {sd.bestTime && <Field label="أفضل وقت / Best Time" value={sd.bestTime} />}
    </>
  )

  if (type === 'maintenance') return (
    <>
      {sd.location && <Field label="الموقع / Location" value={sd.location} />}
      {sd.busNumber && <Field label="رقم الحافلة / Bus Number" value={sd.busNumber} />}
      {sd.categories?.length > 0 && <Field label="الفئات / Categories" value={sd.categories.join(', ')} />}
      {sd.urgency && <Field label="الأولوية / Urgency" value={sd.urgency} />}
      {sd.description && <Field label="الوصف / Description" value={sd.description} />}
    </>
  )

  return null;
}
"""
code = code.replace("export default function HelpAdminTicket", service_specifics + "\nexport default function HelpAdminTicket")

# 3. Inside the component state
new_state = """
  const currentUser = auth.currentUser;
  const isHOD = currentUser?.email === 'fmacoperations@gmail.com' || currentUser?.role === 'hod';
  
  const [showEscalationModal, setShowEscalationModal] = useState(false);
  const [escalationReason, setEscalationReason] = useState('');
  
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailData, setEmailData] = useState({ manager: '', viceManager: '', subject: '', body: '' });
  const [sendingEmail, setSendingEmail] = useState(false);
"""
code = code.replace("const [postingNote, setPostingNote] = useState(false);", "const [postingNote, setPostingNote] = useState(false);\n" + new_state)

# 4. In fetchTicket, add missing fields default
code = code.replace("setRequest({ id: docSnap.id, ...docSnap.data() });", """
          const data = docSnap.data();
          setRequest({ 
            id: docSnap.id, 
            ...data,
            assignedTo: data.assignedTo || 'chr',
            adminComments: data.adminComments || []
          });
""")

# 5. handlePostNote update
code = code.replace("""
  const handlePostNote = async () => {
    if (!note.trim()) return;
    setPostingNote(true);
    try {
      const noteData = { text: note, timestamp: new Date().toISOString() };
      await updateDoc(doc(db, 'requests', ticketId), {
        'admin.internalNotes': arrayUnion(noteData),
        updatedAt: serverTimestamp()
      });
      setRequest(prev => ({
        ...prev,
        admin: { ...prev.admin, internalNotes: [...(prev.admin?.internalNotes || []), noteData] }
      }));
      setNote('');
    } catch (err) {
      alert(t('Error posting note', 'خطأ في نشر الملاحظة'));
    } finally {
      setPostingNote(false);
    }
  };
""", """
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
""")

# 6. Workflow actions functions
workflow_funcs = """
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

  const handleSendEmail = async () => {
    setSendingEmail(true);
    try {
      const res = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_key: import.meta.env.VITE_WEB3FORMS_KEY,
          to: `${emailData.manager},${emailData.viceManager}`,
          subject: emailData.subject,
          message: emailData.body,
          from_name: 'FMAC Operations Suite'
        })
      });
      if (res.ok) {
        const sysComment = {
          text: `تم إرسال بريد إلكتروني للإدارة بواسطة [${currentUser?.displayName || currentUser?.email?.split('@')[0]}]`,
          authorName: 'System',
          authorRole: 'SYS',
          createdAt: new Date().toISOString()
        };
        await updateDoc(doc(db, 'requests', ticketId), {
          adminComments: arrayUnion(sysComment)
        });
        setRequest(prev => ({ ...prev, adminComments: [...(prev.adminComments || []), sysComment] }));
        setShowEmailModal(false);
        alert(t('Email sent successfully', 'تم إرسال البريد بنجاح'));
      } else {
        alert(t('Failed to send email', 'فشل إرسال البريد — حاول مرة أخرى'));
      }
    } catch (err) {
      alert(t('Failed to send email', 'فشل إرسال البريد — حاول مرة أخرى'));
    } finally {
      setSendingEmail(false);
    }
  };

  const openEmailModal = () => {
    setEmailData({
      manager: '',
      viceManager: '',
      subject: `طلب يحتاج إلى اهتمام - ${request.ticketNumber}`,
      body: `عزيزي المدير،\\n\\nنود إحاطتكم علماً بوجود طلب يستوجب اهتمامكم:\\n\\nرقم الطلب: ${request.ticketNumber}\\nالنوع: ${request.type}\\nمقدم الطلب: ${request.userInfo?.name}\\nالتاريخ: ${new Date(request.createdAt?.toDate ? request.createdAt.toDate() : Date.now()).toLocaleDateString()}\\nالحالة: ${statusLabel(request.status)}\\n\\nتفاصيل الطلب:\\n${request.content?.description}\\n\\nسبب الرفع للإدارة:\\n${request.escalationReason}\\n\\nمع التحية،\\n${currentUser?.displayName || currentUser?.email?.split('@')[0]}\\nقسم العمليات — نادي الفجيرة للفنون القتالية`
    });
    setShowEmailModal(true);
  };
"""
code = code.replace("const statusLabel =", workflow_funcs + "\n  const statusLabel =")

# 7. ServiceSpecifics replace
old_service_specifics = """              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.875rem' }}>
                {Object.entries(request.serviceDetails || {}).filter(([k]) => k !== 'description').map(([key, val]) => (
                  <div key={key}>
                    <p style={{ color: 'var(--hc-text-muted)', margin: '0 0 0.25rem 0', textTransform: 'uppercase', fontSize: '0.75rem' }}>{key}</p>
                    <p style={{ fontWeight: 600, margin: 0 }}>{Array.isArray(val) ? val.join(', ') : (val || 'N/A')}</p>
                  </div>
                ))}
              </div>"""
code = code.replace(old_service_specifics, "              <ServiceSpecifics ticket={request} />")

# 8. Activity & Comments replace
old_comments = """          <div className="hc-card">
            <div style={{ color: 'var(--hc-text-secondary)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <History size={14} /> {t('Internal Logs', 'السجلات الداخلية')}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem' }}>
              {(request.admin.internalNotes || []).length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--hc-text-muted)', fontSize: '0.875rem', border: '1px dashed var(--hc-border)', borderRadius: 'var(--hc-radius-sm)' }}>
                  {t('No internal activity logged.', 'لا توجد سجلات داخلية.')}
                </div>
              ) : (
                request.admin.internalNotes.map((logNote, i) => (
                  <div key={i} style={{ padding: '1rem', background: 'var(--hc-bg-hover)', borderRadius: 'var(--hc-radius-sm)', borderLeft: '3px solid var(--hc-accent)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.75rem' }}>
                      <span style={{ fontWeight: 700 }}>{t('ADMIN LOG', 'سجل المدير')}</span>
                      <span style={{ color: 'var(--hc-text-muted)' }}>{new Date(logNote.timestamp).toLocaleString()}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.875rem', lineHeight: 1.5 }}>{logNote.text}</p>
                  </div>
                ))
              )}
            </div>

            <div style={{ position: 'relative' }}>
              <textarea
                className="hc-textarea"
                placeholder={t('Log internal update...', 'سجّل تحديثاً داخلياً...')}
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                style={{ paddingRight: '100px' }}
              />
              <button
                className="hc-btn hc-btn-primary"
                onClick={handlePostNote}
                disabled={postingNote || !note.trim()}
                style={{ position: 'absolute', right: '0.5rem', bottom: '0.5rem', padding: '0.5rem 1rem', fontSize: '0.75rem' }}
              >
                {postingNote ? t('Posting...', 'جارٍ النشر...') : t('Post Log', 'نشر السجل')}
              </button>
            </div>
          </div>"""

new_comments = """          <div className="hc-card">
            <div style={{ color: 'var(--hc-text-secondary)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <History size={14} /> النشاط والتعليقات / Activity & Comments
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem' }}>
              {(request.adminComments || []).length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--hc-text-muted)', fontSize: '0.875rem', border: '1px dashed var(--hc-border)', borderRadius: 'var(--hc-radius-sm)' }}>
                  لا توجد تعليقات بعد / No comments yet
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
                placeholder="أضف تعليقاً داخلياً..."
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                style={{ direction: 'rtl', fontFamily: 'Tajawal, sans-serif' }}
              />
              <button
                className="hc-btn hc-btn-primary"
                onClick={handlePostNote}
                disabled={postingNote || !note.trim()}
                style={{ marginTop: '0.5rem', width: '100%', padding: '0.75rem', fontSize: '0.875rem' }}
              >
                إرسال / Post
              </button>
            </div>
          </div>"""

code = code.replace(old_comments, new_comments)

# 9. Workflow Right Panel
old_right = """        {/* Right Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="hc-card">
            <div style={{ color: 'var(--hc-text-secondary)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '1rem' }}>{t('Execution Status', 'حالة التنفيذ')}</div>
            <select
              className="hc-select"
              value={request.status}
              onChange={(e) => handleStatusChange(e.target.value)}
              style={{ fontWeight: 600 }}
            >
              <option value="new">🔴 {t('NEW', 'جديد')}</option>
              <option value="progress">🟡 {t('IN PROGRESS', 'قيد التنفيذ')}</option>
              <option value="closed">🟢 {t('CLOSED', 'مغلق')}</option>
            </select>
          </div>

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
        </div>"""

new_right = """        {/* Right Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          
          {/* Stage Indicator */}
          <div className="hc-card" style={{ padding: '1.5rem', textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ flex: 1, color: request.assignedTo === 'chr' && request.status !== 'closed' ? 'var(--hc-accent)' : 'var(--hc-text-muted)', fontWeight: request.assignedTo === 'chr' ? 700 : 400, fontSize: '0.75rem' }}>CHR المراجعة</div>
              <div style={{ flex: 1, color: request.assignedTo === 'hod' && request.status !== 'closed' ? '#f59e0b' : 'var(--hc-text-muted)', fontWeight: request.assignedTo === 'hod' ? 700 : 400, fontSize: '0.75rem' }}>تصعيد HOD</div>
              <div style={{ flex: 1, color: request.status === 'closed' ? '#22c55e' : 'var(--hc-text-muted)', fontWeight: request.status === 'closed' ? 700 : 400, fontSize: '0.75rem' }}>إغلاق</div>
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
            <select
              className="hc-select"
              value={request.status}
              onChange={(e) => handleStatusChange(e.target.value)}
              style={{ fontWeight: 600 }}
            >
              <option value="new">🔴 {t('NEW', 'جديد')}</option>
              <option value="progress">🟡 {t('IN PROGRESS', 'قيد التنفيذ')}</option>
              <option value="closed">🟢 {t('CLOSED', 'مغلق')}</option>
            </select>
          </div>

          {/* Workflow Actions */}
          {request.status !== 'closed' && (
            <div className="hc-card">
              <div style={{ color: 'var(--hc-text-secondary)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '1rem' }}>إجراءات سير العمل / Workflow Actions</div>
              
              {!isHOD && request.assignedTo === 'chr' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <button className="hc-btn hc-btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={handleResolve}>✓ حل الطلب / Mark as Resolved</button>
                  <button className="hc-btn hc-btn-outline" style={{ width: '100%', justifyContent: 'center', borderColor: '#c9a84c', color: '#c9a84c' }} onClick={() => setShowEscalationModal(true)}>↑ تصعيد إلى رئيس العمليات / Escalate to HOD</button>
                </div>
              )}

              {isHOD && request.assignedTo === 'hod' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.2)', padding: '1rem', borderRadius: 'var(--hc-radius-sm)', marginBottom: '0.5rem' }}>
                    <p style={{ margin: '0 0 0.5rem 0', fontWeight: 600, color: '#f59e0b', fontSize: '0.875rem' }}>📋 طلب مُصعَّد من: {request.escalatedBy}</p>
                    <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.75rem', color: 'var(--hc-text-muted)' }}>السبب: {request.escalationReason}</p>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--hc-text-muted)' }}>التاريخ: {request.escalatedAt?.toDate ? request.escalatedAt.toDate().toLocaleString() : ''}</p>
                  </div>
                  <button className="hc-btn hc-btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={handleResolve}>✓ حل الطلب / Mark as Resolved</button>
                  <button className="hc-btn hc-btn-outline" style={{ width: '100%', justifyContent: 'center', borderColor: 'var(--hc-accent)', color: 'var(--hc-accent)' }} onClick={openEmailModal}>📧 إرسال بريد للمدير / Email Manager</button>
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
        </div>"""

code = code.replace(old_right, new_right)

# 10. Modals
modals = """
      {/* Escalation Modal */}
      {showEscalationModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '24px' }}>
          <div style={{ background: 'var(--hc-bg-elevated)', border: '1px solid var(--hc-border)', borderRadius: '16px', padding: '32px', width: '100%', maxWidth: '520px' }}>
            <h2 style={{ fontSize: '1.25rem', marginTop: 0, marginBottom: '1.5rem', color: '#c9a84c' }}>تصعيد إلى رئيس العمليات / Escalate to HOD</h2>
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 600 }}>سبب التصعيد / Reason for escalation</label>
              <textarea className="hc-textarea" rows={4} value={escalationReason} onChange={(e) => setEscalationReason(e.target.value)} style={{ direction: 'rtl', fontFamily: 'Tajawal' }} />
            </div>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button className="hc-btn hc-btn-ghost" onClick={() => setShowEscalationModal(false)}>إلغاء / Cancel</button>
              <button className="hc-btn hc-btn-primary" style={{ background: '#c9a84c' }} onClick={handleEscalate} disabled={!escalationReason.trim()}>تأكيد التصعيد / Confirm Escalation</button>
            </div>
          </div>
        </div>
      )}

      {/* Email Modal */}
      {showEmailModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '24px' }}>
          <div style={{ background: 'var(--hc-bg-elevated)', border: '1px solid var(--hc-border)', borderRadius: '16px', padding: '32px', width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: '1.25rem', marginTop: 0, marginBottom: '1.5rem' }}>إرسال إلى الإدارة / Notify Management</h2>
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 600 }}>المدير / Manager Email</label>
                <input className="hc-input" value={emailData.manager} onChange={(e) => setEmailData({...emailData, manager: e.target.value})} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 600 }}>نائب المدير / Vice Manager Email</label>
                <input className="hc-input" value={emailData.viceManager} onChange={(e) => setEmailData({...emailData, viceManager: e.target.value})} />
              </div>
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 600 }}>الموضوع / Subject</label>
              <input className="hc-input" value={emailData.subject} onChange={(e) => setEmailData({...emailData, subject: e.target.value})} style={{ direction: 'rtl', fontFamily: 'Tajawal' }} />
            </div>
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 600 }}>محتوى الرسالة / Body</label>
              <textarea className="hc-textarea" rows={10} value={emailData.body} onChange={(e) => setEmailData({...emailData, body: e.target.value})} style={{ direction: 'rtl', fontFamily: 'Tajawal' }} />
            </div>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button className="hc-btn hc-btn-ghost" onClick={() => setShowEmailModal(false)}>إلغاء / Cancel</button>
              <button className="hc-btn hc-btn-primary" onClick={handleSendEmail} disabled={sendingEmail || !emailData.manager}>
                {sendingEmail ? 'جارٍ الإرسال...' : 'إرسال البريد / Send Email'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
"""
code = code.replace("    </div>\n  );\n}\n", modals)

with open(target_file, "w", encoding="utf-8") as f:
    f.write(code)
