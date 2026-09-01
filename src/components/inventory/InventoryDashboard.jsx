import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Package, ArrowUpRight, ArrowDownRight, RefreshCw, Eye } from 'lucide-react'
import { db } from '../../firebase'
import { collection, query, where, orderBy, limit, getDocs, Timestamp } from 'firebase/firestore'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { useLanguage } from '../../contexts/LanguageContext'
import { getItemStatus, getSportLabel, fmtTimeAgo, getCurrentMonthRange } from './shared'
import inventoryCommandArt from '../../assets/inventory-command/inventory-readiness-command-v1.webp'

export default function InventoryDashboard({ items, settings, onViewItem, onOpenBarcode }) {
  const { t, lang } = useLanguage()
  const [recentMovements, setRecentMovements] = useState([])
  const [sportChart, setSportChart] = useState([])
  const [loadingMovements, setLoadingMovements] = useState(true)

  const sports = settings?.sports || []

  const totalItems = items.length
  const lowStock = items.filter(i => getItemStatus(i) === 'low').length
  const outOfStock = items.filter(i => getItemStatus(i) === 'out').length
  const alertItems = items.filter(i => getItemStatus(i) !== 'ok')

  useEffect(() => {
    let cancelled = false
    const { start, end } = getCurrentMonthRange()

    async function load() {
      setLoadingMovements(true)
      try {
        // Recent 10 movements
        const mSnap = await getDocs(
          query(collection(db, 'inventory_movements'), orderBy('createdAt', 'desc'), limit(10))
        )
        if (cancelled) return
        setRecentMovements(mSnap.docs.map(d => ({ id: d.id, ...d.data() })))

        // Issuance by sport this month
        const issSnap = await getDocs(
          query(
            collection(db, 'inventory_movements'),
            where('type', '==', 'stock_out'),
            where('createdAt', '>=', Timestamp.fromDate(start)),
            where('createdAt', '<=', Timestamp.fromDate(end))
          )
        )
        if (cancelled) return
        const byS = {}
        issSnap.docs.forEach(d => {
          const mv = d.data()
          const s = mv.issuedTo?.sport || 'general'
          byS[s] = (byS[s] || 0) + (mv.quantity || 0)
        })
        const chartData = Object.entries(byS)
          .map(([sportId, qty]) => ({
            sport: sportId,
            label: getSportLabel(sportId, lang, sports),
            qty,
          }))
          .sort((a, b) => b.qty - a.qty)
        setSportChart(chartData)
      } catch (err) {
        console.error('Dashboard load error:', err)
      } finally {
        if (!cancelled) setLoadingMovements(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [lang, items.length])

  const issuedThisMonth = sportChart.reduce((s, c) => s + c.qty, 0)
  const healthyStock = Math.max(totalItems - lowStock - outOfStock, 0)
  const stockHealthPct = totalItems > 0 ? Math.round((healthyStock / totalItems) * 100) : null

  return (
    <motion.main
      className="inv-dashboard inv-command"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
    >
      <section className="inv-command-head">
        <img
          className="inv-command-head-art"
          src={inventoryCommandArt}
          alt=""
          aria-hidden="true"
        />
        <div className="inv-command-copy">
          <span>{t('Warehouse command', 'قيادة المستودع')}</span>
          <h1>{t('Stock readiness', 'جاهزية المخزون')}</h1>
          <p>{t('Shortage pressure, controlled movement and demand in one operational picture.', 'ضغط النقص والحركة المنضبطة والطلب في صورة تشغيلية واحدة.')}</p>
        </div>
        <div className="inv-command-score">
          <div className="inv-health-ring" style={{ '--health': stockHealthPct == null ? 0 : stockHealthPct }}>
            <strong>{stockHealthPct == null ? '—' : `${stockHealthPct}%`}</strong>
            <span>{t('healthy lines', 'أصناف سليمة')}</span>
          </div>
          <dl>
            <div><dt>{t('Catalog', 'السجل')}</dt><dd>{totalItems.toLocaleString()}</dd></div>
            <div><dt>{t('Issued this month', 'صرف هذا الشهر')}</dt><dd>{issuedThisMonth.toLocaleString()}</dd></div>
            <div className="is-warn"><dt>{t('Low', 'منخفض')}</dt><dd>{lowStock.toLocaleString()}</dd></div>
            <div className="is-risk"><dt>{t('Out', 'نافد')}</dt><dd>{outOfStock.toLocaleString()}</dd></div>
          </dl>
        </div>
      </section>

      <section className="inv-command-grid">
        <article className="inv-shortage-board">
          <div className="inv-command-section-head">
            <div><span>{t('Immediate attention', 'انتباه فوري')}</span><h2>{t('Shortage queue', 'قائمة النقص')}</h2></div>
            <b>{alertItems.length.toLocaleString()}</b>
          </div>
          {alertItems.length === 0 ? (
            <div className="inv-command-empty is-good"><Package size={26} /><strong>{t('Stock levels are healthy', 'مستويات المخزون سليمة')}</strong><span>{t('No item is below its configured threshold.', 'لا يوجد صنف دون الحد المحدد.')}</span></div>
          ) : (
            <div className="inv-shortage-list">
              {alertItems.slice(0, 9).map((item, index) => {
                const status = getItemStatus(item)
                return (
                  <button key={item.id} className={status === 'out' ? 'is-out' : 'is-low'} onClick={() => onViewItem?.(item)}>
                    <span className="inv-shortage-rank">{String(index + 1).padStart(2, '0')}</span>
                    <span className="inv-shortage-name"><strong dir="auto">{lang === 'ar' ? item.nameAr : item.nameEn}</strong><small>{getSportLabel(item.sport, lang, sports)}{item.size ? ` · ${item.size}` : ''}</small></span>
                    <span className="inv-shortage-pressure"><i style={{ transform: `scaleX(${Math.min((item.currentStock || 0) / Math.max(item.minThreshold || 5, 1), 1)})` }} /></span>
                    <span className="inv-shortage-qty" dir="ltr"><b>{item.currentStock || 0}</b> / {item.minThreshold ?? 5}</span>
                    <Eye size={14} />
                  </button>
                )
              })}
            </div>
          )}
        </article>

        <article className="inv-movement-board">
          <div className="inv-command-section-head">
            <div><span>{t('Controlled flow', 'التدفق المنضبط')}</span><h2>{t('Movement velocity', 'سرعة الحركة')}</h2></div>
            <RefreshCw size={17} className={loadingMovements ? 'inv-spin' : ''} />
          </div>
          {loadingMovements ? (
            <div className="inv-command-empty"><RefreshCw size={20} className="inv-spin" /></div>
          ) : recentMovements.length === 0 ? (
            <div className="inv-command-empty">{t('No movements yet', 'لا توجد حركات حتى الآن')}</div>
          ) : (
            <div className="inv-command-movements">
              {recentMovements.slice(0, 8).map(movement => {
                const isIn = movement.type === 'stock_in'
                const isAdjustment = movement.type === 'adjustment'
                const Icon = isAdjustment ? RefreshCw : isIn ? ArrowUpRight : ArrowDownRight
                return (
                  <div key={movement.id}>
                    <span className={`inv-command-flow ${isAdjustment ? 'is-adjustment' : isIn ? 'is-in' : 'is-out'}`}><Icon size={13} /></span>
                    <span className="inv-command-movement-name"><strong dir="auto">{lang === 'ar' ? movement.itemNameAr : movement.itemNameEn}</strong><small dir="auto">{movement.issuedTo ? getSportLabel(movement.issuedTo.sport, lang, sports) : movement.itemSku} · {movement.performedByName}</small></span>
                    <b className={isIn ? 'is-in' : isAdjustment ? 'is-adjustment' : 'is-out'} dir="ltr">{isIn ? '+' : isAdjustment ? '±' : '−'}{movement.quantity}</b>
                    <time>{fmtTimeAgo(movement.createdAt, lang)}</time>
                  </div>
                )
              })}
            </div>
          )}
        </article>
      </section>

      <section className="inv-demand-board">
        <div className="inv-demand-copy">
          <span>{t('Demand distribution', 'توزيع الطلب')}</span>
          <h2>{t('Issued this month by sport', 'الصرف هذا الشهر حسب الرياضة')}</h2>
          <p>{sportChart[0] ? t(`${sportChart[0].label} is creating the highest current demand.`, `${sportChart[0].label} يمثل أعلى طلب حالي.`) : t('Demand will appear after the first approved issue.', 'سيظهر الطلب بعد أول عملية صرف معتمدة.')}</p>
          <strong dir="ltr">{issuedThisMonth.toLocaleString()}</strong>
          <small>{t('units issued', 'وحدة مصروفة')}</small>
        </div>
        <div className="inv-demand-chart">
          {sportChart.length === 0 ? (
            <div className="inv-command-empty">{t('No issuances this month', 'لا صرف هذا الشهر')}</div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={sportChart} layout="vertical" margin={{ left: 0, right: 18, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--theme-border)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--theme-text-muted)' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="label" tick={{ fontSize: 10, fill: 'var(--theme-text-muted)' }} axisLine={false} tickLine={false} width={88} />
                <Tooltip contentStyle={{ background: 'var(--theme-surface-raised)', border: '1px solid var(--theme-border)', borderRadius: 10, fontSize: 11 }} formatter={(value) => [value, t('Qty', 'كمية')]} />
                <Bar dataKey="qty" radius={[0, 8, 8, 0]} maxBarSize={18}>
                  {sportChart.map((entry, index) => <Cell key={entry.sport} fill={index === 0 ? '#0d7c5c' : '#83ae9f'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>
    </motion.main>
  )
}
