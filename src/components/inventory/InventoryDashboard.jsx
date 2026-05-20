import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Package, AlertTriangle, XCircle, TrendingDown, ArrowUpRight, ArrowDownRight, RefreshCw, Eye } from 'lucide-react'
import { db } from '../../firebase'
import { collection, query, where, orderBy, limit, getDocs, Timestamp } from 'firebase/firestore'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { useLanguage } from '../../contexts/LanguageContext'
import { getItemStatus, getSportLabel, fmtTimeAgo, getCurrentMonthRange } from './shared'

const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  show: i => ({ opacity: 1, y: 0, transition: { delay: i * 0.07, duration: 0.3, ease: [0.16, 1, 0.3, 1] } }),
}

function KPICard({ icon: Icon, label, value, color, bg, i }) {
  return (
    <motion.div
      className="inv-kpi-card"
      style={{ '--kpi-color': color, '--kpi-bg': bg }}
      custom={i}
      variants={cardVariants}
      initial="hidden"
      animate="show"
    >
      <div className="inv-kpi-icon"><Icon size={22} strokeWidth={1.75} /></div>
      <div className="inv-kpi-body">
        <div className="inv-kpi-value">{value}</div>
        <div className="inv-kpi-label">{label}</div>
      </div>
    </motion.div>
  )
}

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

  return (
    <div className="inv-dashboard">
      {/* KPI Row */}
      <div className="inv-kpi-row">
        <KPICard i={0}
          icon={Package}
          label={t('Total Items', 'إجمالي الأصناف')}
          value={totalItems}
          color="var(--theme-accent)"
          bg="var(--theme-accent-soft)"
        />
        <KPICard i={1}
          icon={AlertTriangle}
          label={t('Low Stock', 'المخزون المنخفض')}
          value={lowStock}
          color="#f59e0b"
          bg="rgba(245,158,11,0.1)"
        />
        <KPICard i={2}
          icon={XCircle}
          label={t('Out of Stock', 'نفذ من المخزون')}
          value={outOfStock}
          color="#f43f5e"
          bg="rgba(244,63,94,0.1)"
        />
        <KPICard i={3}
          icon={TrendingDown}
          label={t('Issued This Month', 'صرف هذا الشهر')}
          value={issuedThisMonth}
          color="#10b981"
          bg="rgba(16,185,129,0.1)"
        />
      </div>

      <div className="inv-dash-grid">
        {/* Low Stock Alerts */}
        <div className="inv-dash-card inv-alerts-card">
          <div className="inv-dash-card-header">
            <AlertTriangle size={16} />
            <span>{t('Low Stock Alerts', 'تنبيهات المخزون المنخفض')}</span>
          </div>
          {alertItems.length === 0 ? (
            <div className="inv-alerts-ok">
              <span style={{ color: '#10b981', fontSize: '1.4rem' }}>✓</span>
              <span>{t('Stock levels are good', 'المخزون في وضع جيد')}</span>
            </div>
          ) : (
            <div className="inv-alerts-list">
              {alertItems.map(item => {
                const st = getItemStatus(item)
                const color = st === 'out' ? '#f43f5e' : '#f59e0b'
                const bg = st === 'out' ? 'rgba(244,63,94,0.08)' : 'rgba(245,158,11,0.08)'
                return (
                  <div key={item.id} className="inv-alert-row" style={{ '--al-color': color, '--al-bg': bg }}>
                    <div className="inv-alert-info">
                      <div className="inv-alert-name">{lang === 'ar' ? item.nameAr : item.nameEn}</div>
                      <div className="inv-alert-meta">
                        {getSportLabel(item.sport, lang, sports)}
                        {item.size ? ` · ${item.size}` : ''}
                      </div>
                    </div>
                    <div className="inv-alert-stock">
                      <span className="inv-alert-qty" style={{ color }}>{item.currentStock}</span>
                      <span className="inv-alert-thresh">/ {item.minThreshold ?? 5}</span>
                    </div>
                    <button className="inv-alert-view" onClick={() => onViewItem?.(item)}>
                      <Eye size={13} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Recent Movements */}
        <div className="inv-dash-card inv-recent-card">
          <div className="inv-dash-card-header">
            <RefreshCw size={16} />
            <span>{t('Recent Movements', 'آخر الحركات')}</span>
          </div>
          {loadingMovements ? (
            <div className="inv-loading-row"><RefreshCw size={16} className="inv-spin" /></div>
          ) : recentMovements.length === 0 ? (
            <div className="inv-empty-text">{t('No movements yet', 'لا توجد حركات حتى الآن')}</div>
          ) : (
            <div className="inv-recent-list">
              {recentMovements.map(mv => {
                const isIn = mv.type === 'stock_in'
                const isAdj = mv.type === 'adjustment'
                const color = isAdj ? '#3b82f6' : isIn ? '#10b981' : '#f43f5e'
                const Icon = isAdj ? RefreshCw : isIn ? ArrowUpRight : ArrowDownRight
                return (
                  <div key={mv.id} className="inv-recent-row">
                    <div className="inv-recent-icon" style={{ color, background: color + '18' }}>
                      <Icon size={13} strokeWidth={2} />
                    </div>
                    <div className="inv-recent-info">
                      <div className="inv-recent-name">{lang === 'ar' ? mv.itemNameAr : mv.itemNameEn}</div>
                      <div className="inv-recent-meta">
                        {mv.issuedTo ? getSportLabel(mv.issuedTo.sport, lang, sports) : mv.itemSku}
                        {' · '}{mv.performedByName}
                      </div>
                    </div>
                    <div className="inv-recent-right">
                      <span className="inv-recent-qty" style={{ color }}>
                        {isIn ? '+' : isAdj ? '±' : '-'}{mv.quantity}
                      </span>
                      <span className="inv-recent-time">{fmtTimeAgo(mv.createdAt, lang)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Issuance Chart */}
        <div className="inv-dash-card inv-chart-card">
          <div className="inv-dash-card-header">
            <TrendingDown size={16} />
            <span>{t('Issued This Month by Sport', 'الصرف هذا الشهر حسب الرياضة')}</span>
          </div>
          {sportChart.length === 0 ? (
            <div className="inv-empty-text">{t('No issuances this month', 'لا صرف هذا الشهر')}</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={sportChart} layout="vertical" margin={{ left: 0, right: 16, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--theme-border)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--theme-text-muted)' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="label" tick={{ fontSize: 11, fill: 'var(--theme-text-muted)' }} axisLine={false} tickLine={false} width={80} />
                <Tooltip
                  contentStyle={{ background: 'var(--theme-surface-raised)', border: '1px solid var(--theme-border)', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: 'var(--theme-text-main)' }}
                  itemStyle={{ color: 'var(--theme-accent)' }}
                  formatter={(v) => [v, t('Qty', 'كمية')]}
                />
                <Bar dataKey="qty" radius={[0, 4, 4, 0]} fill="var(--theme-accent)" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  )
}
