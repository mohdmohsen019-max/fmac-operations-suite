import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { List, DoorOpen, ScrollText, SlidersHorizontal, RefreshCw, FileBarChart } from 'lucide-react'
import { db } from '../firebase'
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore'
import { useLanguage } from '../contexts/LanguageContext'
import { usePermissions } from '../hooks/usePermissions'

import AssetRegistry    from './assets/AssetRegistry'
import AssetRooms       from './assets/AssetRooms'
import AssetAuditLog    from './assets/AssetAuditLog'
import AssetReports     from './assets/AssetReports'
import AssetSystem      from './assets/AssetSystem'
import AssetDetailModal from './assets/AssetDetailModal'
import AssetEditModal   from './assets/AssetEditModal'
import BarcodePrintModal from './inventory/BarcodePrintModal'
import { toMillis } from './assets/shared'
import './AssetsModule.css'

const TABS = [
  { id: 'registry', icon: List,               en: 'Registry',  ar: 'السجل',            managerOnly: false },
  { id: 'reports',  icon: FileBarChart,       en: 'Reports',   ar: 'التقارير',         managerOnly: true  },
  { id: 'rooms',    icon: DoorOpen,           en: 'Rooms',     ar: 'الغرف',            managerOnly: false },
  { id: 'audit',    icon: ScrollText,         en: 'Audit Log', ar: 'سجل التغييرات',    managerOnly: false },
  { id: 'system',   icon: SlidersHorizontal,  en: 'System',    ar: 'النظام',           managerOnly: true  },
]

export default function AssetsModule() {
  const { t, lang, isRTL } = useLanguage()
  const { userProfile, user, isMasterAdmin } = usePermissions()

  // ── Access control ────────────────────────────────────────────────
  // Per spec: only Warehouse/Store Manager (role 'store_manager') + master admin
  // get full edit access. Everyone else authenticated is view-only.
  const canManage = isMasterAdmin || userProfile?.role === 'store_manager'

  const actorName = user?.displayName || userProfile?.displayName || user?.email || 'Unknown'
  const actorUid = user?.uid || ''

  const [activeTab, setActiveTab] = useState('registry')
  const [assets, setAssets] = useState([])
  const [rooms, setRooms] = useState([])
  const [loading, setLoading] = useState(true)

  // Cross-tab control: room pre-filter when arriving from the Rooms tab.
  const [registryRoomFilter, setRegistryRoomFilter] = useState('all')

  // Modals
  const [detailAsset, setDetailAsset] = useState(null)
  const [editAsset, setEditAsset] = useState(null)       // null = closed, {} = new, asset = edit
  const [barcodeAsset, setBarcodeAsset] = useState(null)

  // ── Real-time listeners (additive reads only) ─────────────────────
  useEffect(() => {
    const unsubAssets = onSnapshot(collection(db, 'assets'), snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => toMillis(b.last_updated) - toMillis(a.last_updated))
      setAssets(list)
      setLoading(false)
    }, err => { console.error('[assets] listener error:', err); setLoading(false) })

    const unsubRooms = onSnapshot(collection(db, 'asset_rooms'), snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.name_en || '').localeCompare(b.name_en || ''))
      setRooms(list)
    }, err => console.error('[assets] rooms listener error:', err))

    return () => { unsubAssets(); unsubRooms() }
  }, [])

  // Keep the open detail modal in sync with live data after edits.
  const liveDetailAsset = useMemo(() => {
    if (!detailAsset) return null
    return assets.find(a => a.id === detailAsset.id) || detailAsset
  }, [detailAsset, assets])

  // ── Global USB barcode scanner (keyboard wedge, <50ms keystroke gap) ──
  // On a complete scan, open the matched asset's detail modal immediately.
  useEffect(() => {
    let buffer = ''
    let lastTime = Date.now()

    const onKey = (e) => {
      // Ignore while typing in a field.
      const tag = (e.target?.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable) return

      const now = Date.now()
      const gap = now - lastTime
      lastTime = now

      if (e.key === 'Enter') {
        if (buffer.length >= 3) {
          const code = buffer.trim()
          const found = assets.find(a => a.barcode === code || a.sku === code)
          if (found) { setEditAsset(null); setDetailAsset(found) }
        }
        buffer = ''
        return
      }
      if (e.key.length !== 1) return
      if (gap < 50 || buffer.length > 0) buffer += e.key
      else buffer = e.key
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [assets])

  const visibleTabs = TABS.filter(tab => !tab.managerOnly || canManage)

  const goToRoomAssets = (roomId) => {
    setRegistryRoomFilter(roomId)
    setActiveTab('registry')
  }

  const openBarcodeFor = (asset) => {
    // Adapt to the inventory BarcodePrintModal contract (nameAr/nameEn/sku/barcode).
    setBarcodeAsset({
      nameAr: asset.name_ar || '',
      nameEn: asset.name_en || '',
      sku: asset.sku || '',
      barcode: asset.barcode || asset.sku || '',
    })
  }

  const tabProps = {
    assets, rooms, canManage, lang, t, isRTL,
    actorUid, actorName,
    onOpenDetail: (a) => setDetailAsset(a),
    onOpenEdit: (a) => setEditAsset(a),
    onOpenBarcode: openBarcodeFor,
  }

  return (
    <div className="ast-module">
      {/* Tab navigation */}
      <div className="ast-tab-header">
        <nav className="luxury-tab-rail ast-tab-rail">
          {visibleTabs.map(tab => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                className={`tab-item ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <Icon size={13} strokeWidth={1.8} />
                {t(tab.en, tab.ar)}
              </button>
            )
          })}
        </nav>
        {canManage && activeTab === 'registry' && (
          <motion.button
            className="ast-btn ast-btn-primary ast-btn-sm ast-add-top"
            onClick={() => setEditAsset({})}
            whileTap={{ scale: 0.96 }}
          >
            + {t('Add Asset', 'إضافة أصل')}
          </motion.button>
        )}
      </div>

      {/* Content */}
      <div className="ast-content">
        {loading ? (
          <div className="ast-loading">
            <RefreshCw size={26} className="ast-spin" style={{ color: 'var(--theme-accent)' }} />
            <span>{t('Loading assets…', 'جارٍ تحميل الأصول…')}</span>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            >
              {activeTab === 'registry' && (
                <AssetRegistry
                  {...tabProps}
                  roomFilter={registryRoomFilter}
                  setRoomFilter={setRegistryRoomFilter}
                />
              )}
              {activeTab === 'reports' && canManage && <AssetReports {...tabProps} />}
              {activeTab === 'rooms' && (
                <AssetRooms {...tabProps} onViewRoomAssets={goToRoomAssets} />
              )}
              {activeTab === 'audit' && <AssetAuditLog {...tabProps} />}
              {activeTab === 'system' && canManage && <AssetSystem {...tabProps} />}
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      {/* Modals */}
      <AnimatePresence>
        {liveDetailAsset && (
          <AssetDetailModal
            asset={liveDetailAsset}
            rooms={rooms}
            canManage={canManage}
            lang={lang} t={t} isRTL={isRTL}
            actorUid={actorUid} actorName={actorName}
            onClose={() => setDetailAsset(null)}
            onEdit={(a) => { setDetailAsset(null); setEditAsset(a) }}
            onBarcode={openBarcodeFor}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editAsset !== null && (
          <AssetEditModal
            asset={editAsset.id ? editAsset : null}
            assets={assets}
            rooms={rooms}
            lang={lang} t={t} isRTL={isRTL}
            actorUid={actorUid} actorName={actorName}
            onClose={() => setEditAsset(null)}
            onSaved={() => setEditAsset(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {barcodeAsset && (
          <BarcodePrintModal item={barcodeAsset} onClose={() => setBarcodeAsset(null)} />
        )}
      </AnimatePresence>
    </div>
  )
}
