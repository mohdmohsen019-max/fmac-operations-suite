import { useMemo } from 'react'
import {
  AlertTriangle, ArrowUpRight, Boxes, CheckCircle2, Clock3,
  Layers3, MapPin, ScanLine, UserRoundCheck,
} from 'lucide-react'
import { roomLabel, toMillis } from './shared'
import assetCommandVisual from '../../assets/assets-command/asset-registry-command-v1.webp'

const statusTone = (status) => ({
  Active: 'safe',
  'Under Maintenance': 'warning',
  Missing: 'risk',
  Disposed: 'muted',
}[status] || 'muted')

export default function AssetDashboard({ assets, rooms, lang, t, onOpenDetail, onOpenRegistry }) {
  const locale = lang === 'ar' ? 'ar-AE' : 'en-AE'
  const data = useMemo(() => {
    const roomMap = Object.fromEntries(rooms.map(room => [room.id, room]))
    const statusCounts = assets.reduce((acc, asset) => {
      const key = asset.status || 'Unspecified'
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})
    const attention = assets.filter(asset =>
      ['Missing', 'Under Maintenance'].includes(asset.status)
      || ['Poor', 'Needs Maintenance'].includes(asset.condition)
    )
    const roomCounts = assets.reduce((acc, asset) => {
      const key = asset.location_room || '__none'
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})
    const categoryCounts = assets.reduce((acc, asset) => {
      const key = asset.category || t('Uncategorized', 'غير مصنف')
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})
    const roomRows = Object.entries(roomCounts).map(([id, count]) => ({
      id,
      label: id === '__none' ? t('No room assigned', 'بدون غرفة') : roomLabel(roomMap[id], lang),
      count,
    })).sort((a, b) => b.count - a.count)
    const categoryRows = Object.entries(categoryCounts).map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
    const missingFields = assets.filter(asset => !asset.barcode || !asset.category || !asset.location_room).length
    const assigned = assets.filter(asset => String(asset.assigned_to || '').trim()).length
    const active = statusCounts.Active || 0
    const inServiceBase = Math.max(assets.length - (statusCounts.Disposed || 0), 0)
    return {
      statusCounts, attention, roomRows, categoryRows, missingFields, assigned,
      active, health: inServiceBase ? Math.round((active / inServiceBase) * 100) : null,
      recent: [...assets].sort((a, b) => toMillis(b.last_updated) - toMillis(a.last_updated)).slice(0, 6),
      maxRoom: roomRows[0]?.count || 1,
      maxCategory: categoryRows[0]?.count || 1,
    }
  }, [assets, rooms, lang, t])

  const statuses = [
    ['Active', t('Active', 'نشط')],
    ['Under Maintenance', t('Under maintenance', 'تحت الصيانة')],
    ['Missing', t('Missing', 'مفقود')],
    ['Disposed', t('Disposed', 'مستبعد')],
  ]

  return (
    <div className="ast-dash">
      <section className="ast-dash-command">
        <img
          className="ast-dash-command__art"
          src={assetCommandVisual}
          alt=""
          aria-hidden="true"
        />
        <div className="ast-dash-command__copy">
          <span className="ast-dash-eyebrow"><ScanLine size={14} /> {t('Live asset control', 'التحكم المباشر بالأصول')}</span>
          <h1>{t('Asset operations dashboard', 'لوحة عمليات الأصول')}</h1>
          <p>{t('Health, location, custody and exceptions across the complete physical register.', 'الصحة والموقع والعهدة والاستثناءات عبر سجل الأصول الكامل.')}</p>
          <button type="button" onClick={onOpenRegistry}>{t('Open full register', 'فتح السجل الكامل')} <ArrowUpRight size={15} /></button>
        </div>
        <div className="ast-dash-command__number">
          <span>{t('Registered assets', 'الأصول المسجلة')}</span>
          <strong>{assets.length.toLocaleString(locale)}</strong>
          <small>{rooms.length.toLocaleString(locale)} {t('operational rooms', 'غرفة تشغيلية')}</small>
        </div>
        <div className="ast-dash-command__pulse">
          <div className="ast-dash-ring" style={{ '--value': `${data.health ?? 0}%` }}><strong>{data.health ?? '—'}{data.health != null && '%'}</strong></div>
          <span>{t('Register health', 'صحة السجل')}</span>
          <small>{data.active.toLocaleString(locale)} {t('active assets', 'أصل نشط')}</small>
        </div>
      </section>

      <section className="ast-dash-status" aria-label={t('Asset status distribution', 'توزيع حالات الأصول')}>
        {statuses.map(([key, label]) => (
          <article key={key} className={`ast-dash-status__item is-${statusTone(key)}`}>
            <span>{label}</span>
            <strong>{(data.statusCounts[key] || 0).toLocaleString(locale)}</strong>
            <i />
          </article>
        ))}
        <article className="ast-dash-status__item is-info">
          <span>{t('Assigned custody', 'العهدة المعينة')}</span>
          <strong>{data.assigned.toLocaleString(locale)}</strong>
          <small>{assets.length ? Math.round((data.assigned / assets.length) * 100) : 0}%</small>
        </article>
      </section>

      <div className="ast-dash-grid">
        <section className="ast-dash-panel ast-dash-panel--rooms">
          <header><div><MapPin size={17} /><span><strong>{t('Asset footprint', 'توزيع الأصول')}</strong><small>{t('Where the register is concentrated', 'أماكن تركز السجل')}</small></span></div><b>{data.roomRows.length}</b></header>
          <div className="ast-dash-bars">
            {data.roomRows.slice(0, 8).map(row => (
              <button key={row.id} type="button" onClick={onOpenRegistry}>
                <span>{row.label}</span><i><em style={{ width: `${(row.count / data.maxRoom) * 100}%` }} /></i><strong>{row.count.toLocaleString(locale)}</strong>
              </button>
            ))}
          </div>
        </section>

        <section className="ast-dash-panel ast-dash-panel--attention">
          <header><div><AlertTriangle size={17} /><span><strong>{t('Attention queue', 'قائمة المتابعة')}</strong><small>{t('Physical exceptions requiring review', 'استثناءات مادية تتطلب المراجعة')}</small></span></div><b>{data.attention.length}</b></header>
          <div className="ast-dash-queue">
            {data.attention.length ? data.attention.slice(0, 6).map(asset => (
              <button key={asset.id} type="button" onClick={() => onOpenDetail(asset)}>
                <i className={`is-${statusTone(asset.status)}`} />
                <span><strong>{lang === 'ar' ? (asset.name_ar || asset.name_en) : (asset.name_en || asset.name_ar)}</strong><small>{asset.barcode || '—'} · {asset.status || asset.condition}</small></span>
                <ArrowUpRight size={14} />
              </button>
            )) : <div className="ast-dash-clear"><CheckCircle2 size={22} /><strong>{t('No active exceptions', 'لا توجد استثناءات نشطة')}</strong><small>{t('All registered assets are in a normal state.', 'جميع الأصول المسجلة في حالة طبيعية.')}</small></div>}
          </div>
        </section>

        <section className="ast-dash-panel ast-dash-panel--categories">
          <header><div><Layers3 size={17} /><span><strong>{t('Category composition', 'تكوين الفئات')}</strong><small>{t('Largest asset groups', 'أكبر مجموعات الأصول')}</small></span></div></header>
          <div className="ast-dash-category-grid">
            {data.categoryRows.slice(0, 6).map(row => <div key={row.label}><span>{row.label}</span><strong>{row.count.toLocaleString(locale)}</strong><i><em style={{ width: `${(row.count / data.maxCategory) * 100}%` }} /></i></div>)}
          </div>
        </section>

        <section className="ast-dash-panel ast-dash-panel--quality">
          <header><div><UserRoundCheck size={17} /><span><strong>{t('Register quality', 'جودة السجل')}</strong><small>{t('Completeness and traceability', 'الاكتمال وقابلية التتبع')}</small></span></div></header>
          <div className="ast-dash-quality">
            <div><Boxes size={17} /><span><strong>{(assets.length - data.missingFields).toLocaleString(locale)}</strong><small>{t('complete identity records', 'سجل هوية مكتمل')}</small></span></div>
            <div className={data.missingFields ? 'has-risk' : ''}><AlertTriangle size={17} /><span><strong>{data.missingFields.toLocaleString(locale)}</strong><small>{t('records missing a key field', 'سجل ينقصه حقل أساسي')}</small></span></div>
          </div>
        </section>

        <section className="ast-dash-panel ast-dash-panel--recent">
          <header><div><Clock3 size={17} /><span><strong>{t('Recently updated', 'آخر التحديثات')}</strong><small>{t('Latest register changes', 'أحدث تغييرات السجل')}</small></span></div></header>
          <div className="ast-dash-recent">
            {data.recent.map(asset => <button key={asset.id} type="button" onClick={() => onOpenDetail(asset)}><span><strong>{lang === 'ar' ? (asset.name_ar || asset.name_en) : (asset.name_en || asset.name_ar)}</strong><small>{asset.barcode || '—'}</small></span><time>{toMillis(asset.last_updated) ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(new Date(toMillis(asset.last_updated))) : '—'}</time></button>)}
          </div>
        </section>
      </div>
    </div>
  )
}
