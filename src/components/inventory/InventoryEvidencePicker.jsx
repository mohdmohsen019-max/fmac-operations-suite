import { useRef } from 'react'
import { FileText, Image, Paperclip, Trash2 } from 'lucide-react'
import { useLanguage } from '../../contexts/LanguageContext'

const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx'
const MAX_SIZE = 15 * 1024 * 1024

const sizeLabel = (bytes) => {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

export default function InventoryEvidencePicker({ files, onChange, title, description }) {
  const { t } = useLanguage()
  const inputRef = useRef(null)

  const addFiles = (fileList) => {
    const incoming = Array.from(fileList || []).filter((file) => file.size <= MAX_SIZE)
    const existing = new Set(files.map((file) => `${file.name}:${file.size}`))
    onChange([...files, ...incoming.filter((file) => !existing.has(`${file.name}:${file.size}`))])
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="inv-evidence-picker">
      <div className="inv-evidence-copy">
        <span className="inv-label">{title || t('Supporting evidence', 'المستندات المؤيدة')}</span>
        <span>{description || t('Delivery note, purchase proof, order or authorisation.', 'وصل تسليم أو إثبات شراء أو أمر أو تفويض.')}</span>
      </div>
      <input ref={inputRef} type="file" hidden multiple accept={ACCEPT} onChange={(event) => addFiles(event.target.files)} />
      <button type="button" className="inv-btn inv-btn-ghost inv-evidence-add" onClick={() => inputRef.current?.click()}>
        <Paperclip size={14} /> {t('Attach evidence', 'إرفاق مستند')}
      </button>
      {files.length > 0 && (
        <div className="inv-evidence-list">
          {files.map((file, index) => (
            <div className="inv-evidence-file" key={`${file.name}-${file.size}`}>
              {file.type?.startsWith('image/') ? <Image size={15} /> : <FileText size={15} />}
              <span className="inv-evidence-name">{file.name}</span>
              <span className="inv-evidence-size">{sizeLabel(file.size)}</span>
              <button type="button" className="inv-icon-btn inv-icon-btn-danger" onClick={() => onChange(files.filter((_, i) => i !== index))}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
      <span className="inv-evidence-hint">{t('Optional · PDF, image, Word or Excel · 15MB maximum per file', 'اختياري · PDF أو صورة أو Word أو Excel · بحد أقصى 15 ميجابايت للملف')}</span>
    </div>
  )
}
