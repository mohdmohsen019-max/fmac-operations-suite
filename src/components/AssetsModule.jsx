import { useState, useEffect, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { List, DoorOpen, ScrollText, SlidersHorizontal, RefreshCw, FileBarChart, ShieldCheck } from 'lucide-react'
import { db } from '../firebase'
import { collection, onSnapshot, doc, query, orderBy } from 'firebase/firestore'
import { useLanguage } from '../contexts/LanguageContext'
import { usePermissions } from '../hooks/usePermissions'
import ModuleLock from './shared/ModuleLock'

import AssetRegistry    from './assets/AssetRegistry'
import AssetRooms       from './assets/AssetRooms'
import AssetAuditLog    from './assets/AssetAuditLog'
import AssetReports     from './assets/AssetReports'
import AssetAMS         from './assets/AssetAMS'
import AssetSystem      from './assets/AssetSystem'
import AssetDetailModal from './assets/AssetDetailModal'
import AssetEditModal   from './assets/AssetEditModal'
import AssetScanPopup   from './assets/AssetScanPopup'
import BarcodePrintModal from './inventory/BarcodePrintModal'
import { toMillis } from './assets/shared'
import { mergeAmsConfig } from './assets/ams'
import './AssetsModule.css'

const TABS = [
  { id: 'registry', icon: List,               en: 'Registry',  ar: 'السجل',            managerOnly: false },
  { id: 'reports',  icon: FileBarChart,       en: 'Reports',   ar: 'التقارير',         managerOnly: true  },
  { id: 'ams',      icon: ShieldCheck,        en: 'AMS',       ar: 'نظام الأصول',      managerOnly: true  },
  { id: 'rooms',    icon: DoorOpen,           en: 'Rooms',     ar: 'الغرف',            managerOnly: false },
  { id: 'audit',    icon: ScrollText,         en: 'Audit Log', ar: 'سجل التغييرات',    managerOnly: false },
  { id: 'system',   icon: SlidersHorizontal,  en: 'System',    ar: 'النظام',           managerOnly: true  },
]

export default function AssetsModule() {
  const { t, lang, isRTL } = useLanguage()
  const { userProfile, user, isMasterAdmin } = usePermissions()

  // ── Access control ────────────────────────────────────────────────
  // Edit: master admin, store manager, HOD, or an explicit 'edit' grant from
  // User Management. View: everyone unless explicitly set to 'none' (absent
  // key = legacy account from before assets appeared in the permission grid).
  const assetsPerm = userProfile?.permissions?.assets
  const canManage = isMasterAdmin || userProfile?.role === 'store_manager'
    || userProfile?.role === 'hod' || assetsPerm === 'edit'
  const canView = isMasterAdmin || userProfile?.role === 'hod' || assetsPerm !== 'none'

  const actorName = user?.displayName || userProfile?.displayName || user?.email || 'Unknown'
  const actorUid = user?.uid || ''

  const [activeTab, setActiveTab] = useState('registry')
  const [assets, setAssets] = useState([])
  const [rooms, setRooms] = useState([])
  const [amsConfig, setAmsConfig] = useState(null)   // merged AMS config (ISO 55001)
  const [snapshots, setSnapshots] = useState([])     // dated performance snapshots
  const [loading, setLoading] = useState(true)

  // Cross-tab control: room pre-filter when arriving from the Rooms tab.
  const [registryRoomFilter, setRegistryRoomFilter] = useState('all')

  // Modals
  const [detailAsset, setDetailAsset] = useState(null)
  const [editAsset, setEditAsset] = useState(null)       // null = closed, {} = new, asset = edit
  const [barcodeAsset, setBarcodeAsset] = useState(null)

  // Barcode scanning — same contract as the Inventory module: an explicit
  // armed scan mode; scanResult is null | asset | 'not_found'.
  const [scanMode, setScanMode] = useState(false)
  const [scanResult, setScanResult] = useState(null)

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

    // AMS config (ISO 55001) — single doc, merged onto defaults so reports
    // and the editor always have a complete config.
    const unsubAms = onSnapshot(doc(db, 'asset_ams', 'config'), snap => {
      setAmsConfig(mergeAmsConfig(snap.exists() ? snap.data() : null))
    }, err => { console.error('[assets] ams config listener error:', err); setAmsConfig(mergeAmsConfig(null)) })

    // Dated performance snapshots for trend analysis.
    const unsubSnaps = onSnapshot(collection(db, 'asset_snapshots'), snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
      setSnapshots(list)
    }, err => console.error('[assets] snapshots listener error:', err))

    return () => { unsubAssets(); unsubRooms(); unsubAms(); unsubSnaps() }
  }, [])

  // Keep the open detail modal in sync with live data after edits.
  const liveDetailAsset = useMemo(() => {
    if (!detailAsset) return null
    return assets.find(a => a.id === detailAsset.id) || detailAsset
  }, [detailAsset, assets])

  // Live ref to the latest assets so the scan listener can match against fresh
  // data without listing `assets` in its deps (see the scan effect below).
  const assetsRef = useRef(assets)
  useEffect(() => { assetsRef.current = assets }, [assets])

  // ── USB barcode scanner (keyboard wedge, <50ms keystroke gap) ──
  // Mirrors the Inventory module exactly: active only while scan mode is
  // armed; a match opens the quick-action popup, a miss shows "not found".
  // Deps are [scanMode] only — `assets` is read via assetsRef so a live DB
  // snapshot doesn't tear down/rebuild the listener and drop a mid-scan buffer.
  useEffect(() => {
    if (!scanMode) return
    let buffer = ''
    let lastTime = Date.now()

    const onKey = (e) => {
      // Never capture keystrokes aimed at a field (e.g. the Registry search
      // box) — only hardware-scanner input to the page body should be read.
      const tag = (e.target?.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable) return

      const now = Date.now()
      const gap = now - lastTime
      lastTime = now

      if (e.key === 'Enter') {
        if (buffer.length >= 3) {
          const code = buffer.trim()
          const found = assetsRef.current.find(a => a.barcode === code || a.sku === code || a.asset_code === code)
          setScanResult(found || 'not_found')
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
  }, [scanMode])

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
    actorUid, actorName, amsConfig, snapshots,
    scanMode, setScanMode,
    onOpenDetail: (a) => setDetailAsset(a),
    onOpenEdit: (a) => setEditAsset(a),
    onOpenBarcode: openBarcodeFor,
  }

  if (!canView) return <ModuleLock />

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
              {activeTab === 'ams' && canManage && <AssetAMS {...tabProps} />}
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
          <BarcodePrintModal item={barcodeAsset} opts={{ boldCode: true }} onClose={() => setBarcodeAsset(null)} />
        )}
      </AnimatePresence>

      {/* Scan result popup / not-found toast — same pattern as Inventory */}
      <AnimatePresence>
        {scanResult && scanResult !== 'not_found' && (
          <AssetScanPopup
            asset={scanResult}
            rooms={rooms}
            canManage={canManage}
            onClose={() => setScanResult(null)}
            onDetail={(a) => setDetailAsset(a)}
            onEdit={(a) => setEditAsset(a)}
            onBarcode={openBarcodeFor}
          />
        )}
        {scanResult === 'not_found' && (
          <motion.div
            className="ast-scan-notfound"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            onAnimationComplete={() => setTimeout(() => setScanResult(null), 1800)}
          >
            {t('Asset not found', 'الأصل غير موجود')}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
