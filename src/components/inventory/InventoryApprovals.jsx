import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowDownToLine, ArrowUpFromLine, Check, CheckCircle2, Clock3,
  ExternalLink, FileText, Loader2, Printer, ShieldCheck, UserCheck, X,
} from 'lucide-react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase'
import { useLanguage } from '../../contexts/LanguageContext'
import { usePermissions } from '../../hooks/usePermissions'
import {
  approveInventoryRequest, INVENTORY_REQUEST_STATUS, inventoryWorkflowRole, rejectInventoryRequest,
  openInventoryEvidence,
} from './inventoryApprovalService'
import InventoryIssueVoucher from './InventoryIssueVoucher'

const FILTERS = ['pending', 'approved', 'rejected', 'all']

const timestampMs = (value) => value?.toDate?.()?.getTime?.() || 0

function statusMeta(status, t) {
  if (status === INVENTORY_REQUEST_STATUS.PENDING_SPECIALIST) return { tone: 'warn', label: t('Awaiting specialist', 'بانتظار الأخصائي') }
  if (status === INVENTORY_REQUEST_STATUS.PENDING_HEAD) return { tone: 'info', label: t('Awaiting Head of Operations', 'بانتظار رئيس العمليات') }
  if (status === INVENTORY_REQUEST_STATUS.APPROVED) return { tone: 'good', label: t('Approved & applied', 'معتمد ومُرحّل') }
  if (status === INVENTORY_REQUEST_STATUS.REJECTED) return { tone: 'bad', label: t('Rejected', 'مرفوض') }
  return { tone: 'muted', label: status || '—' }
}

function Step({ icon: Icon, title, detail, state, t }) {
  const label = state?.status === 'approved' ? t('Approved', 'معتمد')
    : state?.status === 'requested' ? t('Requested', 'مطلوب')
      : state?.status === 'overridden' ? t('Overridden by Head', 'تم تجاوزه من الرئيس')
        : state?.status === 'rejected' ? t('Rejected', 'مرفوض')
          : t('Pending', 'قيد الانتظار')
  const tone = state?.status === 'approved' || state?.status === 'requested' ? 'done'
    : state?.status === 'overridden' ? 'override'
      : state?.status === 'rejected' ? 'rejected' : 'pending'
  return (
    <div className={`inv-approval-step inv-approval-step--${tone}`}>
      <div className="inv-approval-step-icon"><Icon size={15} /></div>
      <div className="inv-approval-step-copy">
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
      <span className="inv-approval-step-state">{label}</span>
    </div>
  )
}

function RequestCard({ request, actor, userProfile, isHOD, isMasterAdmin }) {
  const { t, lang, locale } = useLanguage()
  const [working, setWorking] = useState('')
  const [error, setError] = useState('')
  const [voucherRequest, setVoucherRequest] = useState(null)
  const meta = statusMeta(request.status, t)
  const isIn = request.type === 'stock_in'
  const TypeIcon = isIn ? ArrowDownToLine : ArrowUpFromLine
  const canSpecialistApprove = actor === 'specialist' && request.status === INVENTORY_REQUEST_STATUS.PENDING_SPECIALIST
  const canHeadApprove = actor === 'head' && [INVENTORY_REQUEST_STATUS.PENDING_SPECIALIST, INVENTORY_REQUEST_STATUS.PENDING_HEAD].includes(request.status)
  const requestedDate = request.requestedAt?.toDate?.()

  const decide = async (action) => {
    setError('')
    let reason = ''
    if (action === 'reject') {
      reason = window.prompt(t('Reason for rejection:', 'سبب الرفض:')) || ''
      if (!reason.trim()) return
    }
    setWorking(action)
    try {
      if (action === 'approve') {
        const result = await approveInventoryRequest(request.id, userProfile, { isHOD, isMasterAdmin })
        if (!isIn && result.status === INVENTORY_REQUEST_STATUS.APPROVED) {
          const approverName = userProfile?.displayName || userProfile?.email || '—'
          setVoucherRequest({
            ...request,
            status: INVENTORY_REQUEST_STATUS.APPROVED,
            receiptNumber: result.receiptNumber,
            appliedAt: new Date(),
            approval: {
              ...request.approval,
              specialist: request.status === INVENTORY_REQUEST_STATUS.PENDING_SPECIALIST
                ? { status: 'overridden', overriddenByName: approverName, at: new Date() }
                : request.approval?.specialist,
              head: { status: 'approved', name: approverName, at: new Date() },
            },
          })
        }
      } else {
        await rejectInventoryRequest(request.id, reason.trim(), userProfile, { isHOD, isMasterAdmin })
      }
    } catch (err) {
      console.error('Inventory approval action failed:', err)
      setError(err.message || t('Approval action failed.', 'فشل إجراء الاعتماد.'))
    } finally {
      setWorking('')
    }
  }

  return (
    <motion.article className="inv-approval-card" layout>
      <header className="inv-approval-card-head">
        <div className={`inv-request-type inv-request-type--${isIn ? 'in' : 'out'}`}><TypeIcon size={16} /></div>
        <div className="inv-approval-card-title">
          <div>
            <strong>{isIn ? t('Stock-in request', 'طلب إضافة مخزون') : t('Issue request', 'طلب صرف مخزون')}</strong>
            <span className="inv-request-code">{request.requestCode}</span>
          </div>
          <p>
            {t('Requested by', 'مقدم من')} {request.requestedByName || '—'}
            {requestedDate ? ` · ${requestedDate.toLocaleString(locale)}` : ''}
          </p>
        </div>
        <span className={`inv-approval-status inv-approval-status--${meta.tone}`}>{meta.label}</span>
      </header>

      <div className="inv-approval-body">
        <div className="inv-approval-items">
          <div className="inv-approval-section-label">{t('Requested items', 'الأصناف المطلوبة')}</div>
          {request.items?.map((item) => (
            <div className="inv-approval-item" key={item.itemId}>
              <div>
                <strong>{lang === 'ar' ? (item.itemNameAr || item.itemNameEn) : (item.itemNameEn || item.itemNameAr)}</strong>
                <span>{item.itemSku}{item.size ? ` · ${item.size}` : ''}</span>
              </div>
              <span className="inv-approval-qty">×{Number(item.quantity).toLocaleString(locale)}</span>
            </div>
          ))}
          {request.details?.deliveryNoteRef && (
            <div className="inv-request-detail"><span>{t('Delivery reference', 'مرجع التسليم')}</span><strong>{request.details.deliveryNoteRef}</strong></div>
          )}
          {request.details?.issuedTo && (
            <div className="inv-request-detail"><span>{t('Issued to', 'الصرف إلى')}</span><strong>{request.details.issuedTo.personName || request.details.issuedTo.sportAr || request.details.issuedTo.sport}</strong></div>
          )}
          {request.notes && <div className="inv-request-note">{request.notes}</div>}
        </div>

        <div className="inv-approval-evidence">
          <div className="inv-approval-section-label">{t('Evidence', 'المستندات المؤيدة')}</div>
          {request.evidence?.length ? request.evidence.map((file) => (
            <button key={file.path || file.url || file.fileDocId} type="button" onClick={() => openInventoryEvidence(file).catch((openError) => setError(openError.message))} className="inv-evidence-link">
              <FileText size={14} />
              <span>{file.name}</span>
              <ExternalLink size={12} />
            </button>
          )) : <div className="inv-no-evidence">{t('No evidence attached', 'لا توجد مستندات مرفقة')}</div>}
        </div>
      </div>

      <div className="inv-approval-flow">
        <Step icon={CheckCircle2} title={t('Store Manager', 'مدير المخزن')} detail={request.approval?.requester?.name || request.requestedByName || '—'} state={request.approval?.requester} t={t} />
        <Step icon={UserCheck} title={t('Sports Activities Specialist', 'أخصائي الأنشطة الرياضية')} detail={request.approval?.specialist?.name || t('Required unless overridden by Head', 'مطلوب ما لم يتجاوزه الرئيس')} state={request.approval?.specialist} t={t} />
        <Step icon={ShieldCheck} title={t('Head of Operations', 'رئيس العمليات')} detail={request.approval?.head?.name || t('Final authority', 'صاحب الاعتماد النهائي')} state={request.approval?.head} t={t} />
      </div>

      {request.rejectionReason && <div className="inv-approval-rejection"><X size={14} /> {request.rejectionReason}</div>}
      {error && <div className="inv-error-msg inv-approval-error">{error}</div>}

      {(canSpecialistApprove || canHeadApprove) && (
        <footer className="inv-approval-actions">
          <span>
            {canHeadApprove && request.status === INVENTORY_REQUEST_STATUS.PENDING_SPECIALIST
              ? t('Head approval will override the specialist step and update stock immediately.', 'اعتماد الرئيس سيتجاوز خطوة الأخصائي ويرحّل المخزون فوراً.')
              : canHeadApprove
                ? t('Final approval will update inventory quantities.', 'الاعتماد النهائي سيرحّل كميات المخزون.')
                : t('Your approval sends this request to Head of Operations.', 'اعتمادك يرسل الطلب إلى رئيس العمليات.')}
          </span>
          <div>
            <button type="button" className="inv-btn inv-btn-ghost inv-btn-reject" disabled={!!working} onClick={() => decide('reject')}>
              {working === 'reject' ? <Loader2 size={14} className="inv-spin" /> : <X size={14} />} {t('Reject', 'رفض')}
            </button>
            <button type="button" className="inv-btn inv-btn-primary" disabled={!!working} onClick={() => decide('approve')}>
              {working === 'approve' ? <Loader2 size={14} className="inv-spin" /> : <Check size={14} />}
              {canHeadApprove ? t('Final approve', 'اعتماد نهائي') : t('Approve', 'اعتماد')}
            </button>
          </div>
        </footer>
      )}
      {!isIn && request.status === INVENTORY_REQUEST_STATUS.APPROVED && request.receiptNumber && (
        <footer className="inv-approval-actions inv-approval-actions--voucher">
          <span>{t('The final issue voucher includes the request details and full approval trail.', 'يتضمن إذن الصرف النهائي تفاصيل الطلب ومسار الاعتماد كاملاً.')}</span>
          <div><button type="button" className="inv-btn inv-btn-primary" onClick={() => setVoucherRequest(request)}><Printer size={14} /> {t('View / print voucher', 'عرض / طباعة الإذن')}</button></div>
        </footer>
      )}
      {voucherRequest && <InventoryIssueVoucher request={voucherRequest} onClose={() => setVoucherRequest(null)} />}
    </motion.article>
  )
}

export default function InventoryApprovals() {
  const { t, locale } = useLanguage()
  const { userProfile, isHOD, isMasterAdmin } = usePermissions()
  const actor = inventoryWorkflowRole(userProfile, { isHOD, isMasterAdmin })
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('pending')
  const [loadError, setLoadError] = useState('')

  useEffect(() => onSnapshot(
    collection(db, 'inventory_requests'),
    (snapshot) => {
      setRequests(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).sort((a, b) => timestampMs(b.requestedAt) - timestampMs(a.requestedAt)))
      setLoading(false)
      setLoadError('')
    },
    (error) => { setLoadError(error.message); setLoading(false) },
  ), [])

  const counts = useMemo(() => ({
    pending: requests.filter((request) => [INVENTORY_REQUEST_STATUS.PENDING_SPECIALIST, INVENTORY_REQUEST_STATUS.PENDING_HEAD].includes(request.status)).length,
    approved: requests.filter((request) => request.status === INVENTORY_REQUEST_STATUS.APPROVED).length,
    rejected: requests.filter((request) => request.status === INVENTORY_REQUEST_STATUS.REJECTED).length,
  }), [requests])

  const visible = requests.filter((request) => {
    if (filter === 'all') return true
    if (filter === 'pending') return [INVENTORY_REQUEST_STATUS.PENDING_SPECIALIST, INVENTORY_REQUEST_STATUS.PENDING_HEAD].includes(request.status)
    return request.status === filter
  })

  return (
    <div className="inv-approvals">
      <div className="inv-approvals-hero">
        <div>
          <span className="inv-eyebrow">{t('CONTROLLED INVENTORY WORKFLOW', 'مسار عمل المخزون المنضبط')}</span>
          <h2>{t('Requests & Approvals', 'الطلبات والاعتمادات')}</h2>
          <p>{t('Stock changes are applied only after final approval by Head of Operations.', 'لا تُرحّل تغييرات المخزون إلا بعد الاعتماد النهائي من رئيس العمليات.')}</p>
        </div>
        <div className="inv-approval-kpis">
          <div><Clock3 size={15} /><strong>{counts.pending.toLocaleString(locale)}</strong><span>{t('Pending', 'قيد الانتظار')}</span></div>
          <div><CheckCircle2 size={15} /><strong>{counts.approved.toLocaleString(locale)}</strong><span>{t('Approved', 'معتمد')}</span></div>
          <div><X size={15} /><strong>{counts.rejected.toLocaleString(locale)}</strong><span>{t('Rejected', 'مرفوض')}</span></div>
        </div>
      </div>

      <div className="inv-approval-toolbar">
        {FILTERS.map((value) => (
          <button key={value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>
            {value === 'pending' ? t('Pending', 'قيد الانتظار') : value === 'approved' ? t('Approved', 'معتمد') : value === 'rejected' ? t('Rejected', 'مرفوض') : t('All', 'الكل')}
            {value !== 'all' && <span>{counts[value]}</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="inv-loading-state"><Loader2 size={22} className="inv-spin" /> {t('Loading requests…', 'جارٍ تحميل الطلبات…')}</div>
      ) : loadError ? (
        <div className="inv-error-msg">{loadError}</div>
      ) : visible.length === 0 ? (
        <div className="inv-approval-empty"><ShieldCheck size={32} /><strong>{t('No requests in this view', 'لا توجد طلبات في هذا العرض')}</strong><span>{t('New requests will appear here with their evidence and approval trail.', 'ستظهر الطلبات الجديدة هنا مع مستنداتها ومسار اعتمادها.')}</span></div>
      ) : (
        <div className="inv-approval-list">
          {visible.map((request) => <RequestCard key={request.id} request={request} actor={actor} userProfile={userProfile} isHOD={isHOD} isMasterAdmin={isMasterAdmin} />)}
        </div>
      )}
    </div>
  )
}
