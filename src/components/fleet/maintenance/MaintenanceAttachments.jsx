/**
 * Attachments on maintenance records — invoices + photos.
 * Files live in Storage under fleet_maintenance/{recordKey}/… and are indexed
 * in the fleet_maintenance_files collection (records themselves may come from
 * a read-only source, so nothing is written onto the record).
 */
import React, { useState, useRef } from 'react'
import {
  Paperclip, X, Trash2, FileText, Loader2, Receipt, Camera, ExternalLink,
} from 'lucide-react'
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { collection, addDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore'
import { db, storage, auth } from '../../../firebase'
import { normReg } from '../../../services/fleetMeta'
import { useLanguage } from '../../../contexts/LanguageContext'
import { recordKeyOf } from './maintenanceSuite'

const MAX_SIZE = 10 * 1024 * 1024 // 10MB
const EXT_OK = /\.(pdf|jpe?g|png|webp)$/i
const isImageFile = (f) => /^image\//.test(f?.contentType || '') || /\.(jpe?g|png|webp)$/i.test(f?.name || '')

const fmtSize = (bytes) => {
  const n = parseFloat(bytes) || 0
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  if (n >= 1024) return `${Math.round(n / 1024)} KB`
  return `${n} B`
}

export default function MaintenanceAttachments({ record, files = [], isMasterAdmin }) {
  const { t, locale } = useLanguage()
  const [open, setOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const invoiceInputRef = useRef(null)
  const photoInputRef = useRef(null)

  const recordKey = recordKeyOf(record)
  const uid = auth.currentUser?.uid || null
  const canDelete = (f) => isMasterAdmin || (uid && f.uploadedBy === uid)

  const handleUpload = async (kind, fileList) => {
    const picked = Array.from(fileList || [])
    if (!picked.length) return
    setError(null)

    const bad = picked.find((f) => !EXT_OK.test(f.name))
    if (bad) {
      setError(t(`"${bad.name}" is not a supported type (.pdf, .jpg, .jpeg, .png, .webp).`,
        `"${bad.name}" ليس نوعاً مدعوماً (.pdf, .jpg, .jpeg, .png, .webp).`))
      return
    }
    const big = picked.find((f) => f.size > MAX_SIZE)
    if (big) {
      setError(t(`"${big.name}" exceeds the 10MB limit.`, `"${big.name}" يتجاوز الحد الأقصى 10 ميجابايت.`))
      return
    }

    setUploading(true)
    try {
      for (const file of picked) {
        const safeName = file.name.replace(/[^\w.\-()\s]/g, '_')
        const path = `fleet_maintenance/${recordKey}/${Date.now()}_${safeName}`
        const sRef = storageRef(storage, path)
        await uploadBytes(sRef, file, { contentType: file.type || 'application/octet-stream' })
        const url = await getDownloadURL(sRef)
        await addDoc(collection(db, 'fleet_maintenance_files'), {
          recordKey,
          vehicleReg: normReg(record.plateNumber || record.registration || ''),
          kind,
          name: file.name,
          url,
          path,
          size: file.size,
          contentType: file.type || 'application/octet-stream',
          uploadedBy: uid,
          uploadedAt: serverTimestamp(),
        })
      }
    } catch (err) {
      console.error('Attachment upload failed:', err)
      setError(t('Upload failed: ', 'فشل الرفع: ') + err.message)
    } finally {
      setUploading(false)
      if (invoiceInputRef.current) invoiceInputRef.current.value = ''
      if (photoInputRef.current) photoInputRef.current.value = ''
    }
  }

  const handleDelete = async (f) => {
    const ok = window.confirm(t(`Delete "${f.name}"? This cannot be undone.`,
      `حذف "${f.name}"؟ لا يمكن التراجع عن هذا الإجراء.`))
    if (!ok) return
    try {
      // Storage object first (best-effort), then the index doc.
      if (f.path) {
        try { await deleteObject(storageRef(storage, f.path)) } catch (err) {
          console.warn('Storage delete failed (continuing):', err)
        }
      }
      await deleteDoc(doc(db, 'fleet_maintenance_files', f.id))
    } catch (err) {
      console.error('Attachment delete failed:', err)
      setError(t('Delete failed: ', 'فشل الحذف: ') + err.message)
    }
  }

  const photos = files.filter((f) => f.kind === 'photo' || (f.kind !== 'invoice' && isImageFile(f)))
  const invoices = files.filter((f) => !photos.includes(f))

  return (
    <>
      <button
        type="button"
        className={`fms-clip-btn${files.length ? ' has-files' : ''}`}
        onClick={() => { setOpen(true); setError(null) }}
        title={t('Attachments', 'المرفقات')}
      >
        <Paperclip size={14} />
        {files.length > 0 && <span className="fms-clip-count">{files.length}</span>}
      </button>

      {open && (
        <div className="fms-modal-overlay" onClick={() => setOpen(false)}>
          <div className="fms-modal" onClick={(e) => e.stopPropagation()}>
            <div className="fms-modal-head">
              <h3>
                <Paperclip size={16} />
                {t('Attachments', 'المرفقات')}
                <span className="fms-modal-sub">
                  {record.plateNumber || record.registration} · {record.date}
                </span>
              </h3>
              <button type="button" className="fms-icon-btn" onClick={() => setOpen(false)}><X size={16} /></button>
            </div>

            <div className="fms-modal-body">
              {error && <div className="fms-error">{error}</div>}

              <div className="fms-upload-row">
                <input
                  ref={invoiceInputRef} type="file" hidden multiple
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  onChange={(e) => handleUpload('invoice', e.target.files)}
                />
                <input
                  ref={photoInputRef} type="file" hidden multiple
                  accept=".jpg,.jpeg,.png,.webp"
                  onChange={(e) => handleUpload('photo', e.target.files)}
                />
                <button
                  type="button" className="fms-btn" disabled={uploading}
                  onClick={() => invoiceInputRef.current?.click()}
                >
                  {uploading ? <Loader2 size={14} className="fms-spin" /> : <Receipt size={14} />}
                  {t('Upload invoice', 'رفع فاتورة')}
                </button>
                <button
                  type="button" className="fms-btn" disabled={uploading}
                  onClick={() => photoInputRef.current?.click()}
                >
                  {uploading ? <Loader2 size={14} className="fms-spin" /> : <Camera size={14} />}
                  {t('Upload photo', 'رفع صورة')}
                </button>
                <span className="fms-hint">{t('PDF / JPG / PNG / WEBP — max 10MB each', 'PDF / JPG / PNG / WEBP — بحد أقصى 10 ميجابايت لكل ملف')}</span>
              </div>

              {files.length === 0 && !uploading && (
                <div className="fms-empty">{t('No attachments yet.', 'لا توجد مرفقات بعد.')}</div>
              )}

              {photos.length > 0 && (
                <div className="fms-thumb-grid">
                  {photos.map((f) => (
                    <div key={f.id} className="fms-thumb">
                      <a href={f.url} target="_blank" rel="noreferrer" title={f.name}>
                        <img src={f.url} alt={f.name} loading="lazy" />
                      </a>
                      {canDelete(f) && (
                        <button type="button" className="fms-thumb-del" onClick={() => handleDelete(f)} title={t('Delete', 'حذف')}>
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {invoices.length > 0 && (
                <div className="fms-file-list">
                  {invoices.map((f) => (
                    <div key={f.id} className="fms-file-row">
                      <FileText size={16} className="fms-file-icon" />
                      <a href={f.url} target="_blank" rel="noreferrer" className="fms-file-name" title={f.name}>
                        {f.name} <ExternalLink size={11} />
                      </a>
                      <span className="fms-file-meta">
                        {fmtSize(f.size)}
                        {f.uploadedAt?.seconds
                          ? ` · ${new Date(f.uploadedAt.seconds * 1000).toLocaleDateString(locale)}`
                          : ''}
                      </span>
                      {canDelete(f) && (
                        <button type="button" className="fms-icon-btn danger" onClick={() => handleDelete(f)} title={t('Delete', 'حذف')}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
