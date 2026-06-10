import { useRef, useState } from 'react'
import { Reorder, useDragControls } from 'framer-motion'
import {
  GripVertical, Trash2, Plus, Type, AlignLeft, List as ListIcon,
  LayoutGrid, Table as TableIcon, Image as ImageIcon, X, RefreshCw
} from 'lucide-react'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage } from '../../firebase'
import {
  newHeading, newParagraph, newList, newCards, newTable, newImage
} from '../../utils/reportBlocks'
import './ReportBlockEditor.css'

// Downscale + compress an image File to a data URL under ~700KB so it can be
// stored inline in Firestore when Storage uploads are blocked by rules.
function compressImage(file, maxDim = 1100, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    const reader = new FileReader()
    reader.onload = () => { img.src = reader.result }
    reader.onerror = reject
    img.onload = () => {
      let { width, height } = img
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height)
        width = Math.round(width * scale)
        height = Math.round(height * scale)
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d').drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = reject
    reader.readAsDataURL(file)
  })
}

// ── Single sortable block ───────────────────────────────────────────
function BlockItem({ block, onChange, onRemove, reportId, sectionKey, t }) {
  const dragControls = useDragControls()

  return (
    <Reorder.Item
      value={block}
      dragListener={false}
      dragControls={dragControls}
      className="rbe-block"
    >
      <div className="rbe-block-rail">
        <button
          className="rbe-drag"
          onPointerDown={(e) => dragControls.start(e)}
          title={t('Drag to reorder', 'اسحب لإعادة الترتيب')}
        >
          <GripVertical size={15} />
        </button>
        <button className="rbe-block-del" onClick={onRemove} title={t('Delete block', 'حذف العنصر')}>
          <Trash2 size={14} />
        </button>
      </div>

      <div className="rbe-block-body">
        {block.type === 'heading' && (
          <input
            className="rbe-heading-input"
            dir="auto"
            value={block.text}
            placeholder={t('Heading…', 'عنوان…')}
            onChange={e => onChange({ ...block, text: e.target.value })}
          />
        )}

        {block.type === 'paragraph' && (
          <textarea
            className="rbe-para-input"
            dir="auto"
            rows={3}
            value={block.text}
            placeholder={t('Write a paragraph…', 'اكتب فقرة…')}
            onChange={e => onChange({ ...block, text: e.target.value })}
          />
        )}

        {block.type === 'list' && (
          <ListBlock block={block} onChange={onChange} t={t} />
        )}

        {block.type === 'cards' && (
          <CardsBlock block={block} onChange={onChange} t={t} />
        )}

        {block.type === 'table' && (
          <TableBlock block={block} onChange={onChange} t={t} />
        )}

        {block.type === 'image' && (
          <ImageBlock block={block} onChange={onChange} reportId={reportId} sectionKey={sectionKey} t={t} />
        )}
      </div>
    </Reorder.Item>
  )
}

// ── List block ──────────────────────────────────────────────────────
function ListBlock({ block, onChange, t }) {
  const set = (items) => onChange({ ...block, items })
  return (
    <div className="rbe-list">
      {block.items.map((item, i) => (
        <div key={i} className="rbe-list-row">
          <span className="rbe-list-bullet">{i + 1}</span>
          <input
            className="rbe-list-input"
            dir="auto"
            value={item}
            onChange={e => set(block.items.map((v, j) => (j === i ? e.target.value : v)))}
          />
          <button className="rbe-mini-del" onClick={() => set(block.items.filter((_, j) => j !== i))}>
            <X size={11} />
          </button>
        </div>
      ))}
      <button className="rbe-add-inline" onClick={() => set([...block.items, ''])}>
        <Plus size={12} /> {t('Add point', 'إضافة نقطة')}
      </button>
    </div>
  )
}

// ── Cards block ─────────────────────────────────────────────────────
function CardsBlock({ block, onChange, t }) {
  const set = (items) => onChange({ ...block, items })
  return (
    <div>
      <div className="rbe-cards-grid">
        {block.items.map((card, i) => (
          <div key={i} className="rbe-card">
            <button className="rbe-card-del" onClick={() => set(block.items.filter((_, j) => j !== i))}>
              <X size={10} />
            </button>
            <input
              className="rbe-card-value"
              dir="auto"
              value={card.value}
              placeholder={t('Value', 'القيمة')}
              onChange={e => set(block.items.map((c, j) => (j === i ? { ...c, value: e.target.value } : c)))}
            />
            <input
              className="rbe-card-label"
              dir="auto"
              value={card.label}
              placeholder={t('Label', 'التسمية')}
              onChange={e => set(block.items.map((c, j) => (j === i ? { ...c, label: e.target.value } : c)))}
            />
          </div>
        ))}
      </div>
      <button className="rbe-add-inline" onClick={() => set([...block.items, { label: '', value: '' }])}>
        <Plus size={12} /> {t('Add card', 'إضافة بطاقة')}
      </button>
    </div>
  )
}

// ── Table block ─────────────────────────────────────────────────────
function TableBlock({ block, onChange, t }) {
  const setHeaders = (headers) => onChange({ ...block, headers })
  const setRows = (rows) => onChange({ ...block, rows })

  const addColumn = () => {
    onChange({
      ...block,
      headers: [...block.headers, ''],
      rows: block.rows.map(r => [...r, '']),
    })
  }
  const removeColumn = (ci) => {
    onChange({
      ...block,
      headers: block.headers.filter((_, i) => i !== ci),
      rows: block.rows.map(r => r.filter((_, i) => i !== ci)),
    })
  }
  const addRow = () => setRows([...block.rows, block.headers.map(() => '')])

  return (
    <div className="rbe-table-wrap-edit">
      <input
        className="rbe-table-title"
        dir="auto"
        value={block.title}
        placeholder={t('Table title…', 'عنوان الجدول…')}
        onChange={e => onChange({ ...block, title: e.target.value })}
      />
      <div className="rbe-table-scroll">
        <table className="rbe-table">
          <thead>
            <tr>
              {block.headers.map((h, ci) => (
                <th key={ci}>
                  <div className="rbe-th-cell">
                    <input
                      dir="auto"
                      value={h}
                      placeholder={t('Column', 'عمود')}
                      onChange={e => setHeaders(block.headers.map((v, j) => (j === ci ? e.target.value : v)))}
                    />
                    <button className="rbe-col-del" onClick={() => removeColumn(ci)} title={t('Remove column', 'حذف العمود')}>
                      <X size={10} />
                    </button>
                  </div>
                </th>
              ))}
              <th className="rbe-col-add-cell">
                <button className="rbe-col-add" onClick={addColumn} title={t('Add column', 'إضافة عمود')}>
                  <Plus size={12} />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, ri) => (
              <tr key={ri}>
                {block.headers.map((_, ci) => (
                  <td key={ci}>
                    <input
                      dir="auto"
                      value={row[ci] ?? ''}
                      onChange={e => setRows(block.rows.map((r, j) =>
                        j === ri ? r.map((c, k) => (k === ci ? e.target.value : c)) : r
                      ))}
                    />
                  </td>
                ))}
                <td className="rbe-row-del-cell">
                  <button className="rbe-mini-del" onClick={() => setRows(block.rows.filter((_, j) => j !== ri))}>
                    <X size={11} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="rbe-add-inline" onClick={addRow}>
        <Plus size={12} /> {t('Add row', 'إضافة صف')}
      </button>
    </div>
  )
}

// ── Image block ─────────────────────────────────────────────────────
function ImageBlock({ block, onChange, reportId, sectionKey, t }) {
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const pick = async (file) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setErr(t('Please choose an image file.', 'يرجى اختيار ملف صورة.'))
      return
    }
    setBusy(true)
    setErr(null)
    try {
      // 1) Try Firebase Storage for a clean URL.
      try {
        const path = `report_images/${reportId}/${sectionKey}/${Date.now()}_${file.name}`
        const storageRef = ref(storage, path)
        await uploadBytes(storageRef, file)
        const url = await getDownloadURL(storageRef)
        onChange({ ...block, src: url })
        return
      } catch (storageErr) {
        console.warn('Image storage upload failed, falling back to inline:', storageErr?.message)
      }
      // 2) Fallback: compressed inline data URL.
      const dataUrl = await compressImage(file)
      onChange({ ...block, src: dataUrl })
    } catch (e) {
      console.error('Image error:', e)
      setErr(t('Could not load image.', 'تعذر تحميل الصورة.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rbe-image">
      {block.src ? (
        <div className="rbe-image-preview">
          <img src={block.src} alt={block.caption || 'report'} />
          <button className="rbe-image-replace" onClick={() => inputRef.current?.click()}>
            <RefreshCw size={12} /> {t('Replace', 'استبدال')}
          </button>
        </div>
      ) : (
        <button className="rbe-image-drop" onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? <RefreshCw size={20} className="rpt-spin" /> : <ImageIcon size={22} />}
          <span>{busy ? t('Uploading…', 'جارٍ الرفع…') : t('Add a picture', 'إضافة صورة')}</span>
        </button>
      )}
      {err && <div className="rbe-image-err">{err}</div>}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={e => pick(e.target.files[0])}
      />
      {block.src && (
        <input
          className="rbe-image-caption"
          dir="auto"
          value={block.caption}
          placeholder={t('Caption (optional)…', 'وصف (اختياري)…')}
          onChange={e => onChange({ ...block, caption: e.target.value })}
        />
      )}
    </div>
  )
}

// ── Add-block toolbar ───────────────────────────────────────────────
const ADD_OPTIONS = [
  { type: 'heading', icon: Type, en: 'Heading', ar: 'عنوان', make: newHeading },
  { type: 'paragraph', icon: AlignLeft, en: 'Paragraph', ar: 'فقرة', make: newParagraph },
  { type: 'list', icon: ListIcon, en: 'List', ar: 'قائمة', make: () => newList(['']) },
  { type: 'cards', icon: LayoutGrid, en: 'Cards', ar: 'بطاقات', make: () => newCards([{ label: '', value: '' }]) },
  { type: 'table', icon: TableIcon, en: 'Table', ar: 'جدول', make: newTable },
  { type: 'image', icon: ImageIcon, en: 'Picture', ar: 'صورة', make: () => newImage('') },
]

// ── Editor root ─────────────────────────────────────────────────────
export default function ReportBlockEditor({ blocks, setBlocks, reportId, sectionKey, t }) {
  const updateBlock = (id, next) => setBlocks(blocks.map(b => (b.id === id ? next : b)))
  const removeBlock = (id) => setBlocks(blocks.filter(b => b.id !== id))
  const addBlock = (make) => setBlocks([...blocks, make()])

  return (
    <div className="rbe-root">
      <Reorder.Group axis="y" values={blocks} onReorder={setBlocks} className="rbe-list-group">
        {blocks.map(block => (
          <BlockItem
            key={block.id}
            block={block}
            onChange={(next) => updateBlock(block.id, next)}
            onRemove={() => removeBlock(block.id)}
            reportId={reportId}
            sectionKey={sectionKey}
            t={t}
          />
        ))}
      </Reorder.Group>

      {blocks.length === 0 && (
        <div className="rbe-empty">{t('No content yet — add a block below.', 'لا يوجد محتوى بعد — أضف عنصراً أدناه.')}</div>
      )}

      <div className="rbe-add-bar">
        <span className="rbe-add-label">{t('Add', 'إضافة')}:</span>
        {ADD_OPTIONS.map(opt => {
          const Icon = opt.icon
          return (
            <button key={opt.type} className="rbe-add-btn" onClick={() => addBlock(opt.make)}>
              <Icon size={13} /> {t(opt.en, opt.ar)}
            </button>
          )
        })}
      </div>
    </div>
  )
}
