import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, Package, PlusCircle, ArrowDownCircle,
  History, BarChart2, Settings, Plus, RefreshCw, Lock
} from 'lucide-react'
import { db, auth } from '../firebase'
import {
  collection, query, where, orderBy, onSnapshot,
  getDocs, getDoc, setDoc, doc, serverTimestamp, writeBatch, deleteDoc
} from 'firebase/firestore'
import { useLanguage } from '../contexts/LanguageContext'
import { usePermissions } from '../hooks/usePermissions'
import {
  MASTER_ADMIN_EMAIL, DEFAULT_SPORTS, DEFAULT_CATEGORIES, DEFAULT_UNITS
} from './inventory/shared'

import InventoryDashboard  from './inventory/InventoryDashboard'
import InventoryStock      from './inventory/InventoryStock'
import InventoryStockIn    from './inventory/InventoryStockIn'
import InventoryIssue      from './inventory/InventoryIssue'
import InventoryHistory    from './inventory/InventoryHistory'
import InventoryReports    from './inventory/InventoryReports'
import InventorySettings   from './inventory/InventorySettings'
import BarcodePrintModal   from './inventory/BarcodePrintModal'
import ItemEditModal       from './inventory/ItemEditModal'
import ScanPopup           from './inventory/ScanPopup'
import './InventoryModule.css'

const TABS = [
  { id: 'dashboard', icon: LayoutDashboard, en: 'Dashboard',        ar: 'لوحة التحكم',   adminOnly: false },
  { id: 'stock',     icon: Package,         en: 'Stock',            ar: 'المخزون',       adminOnly: false },
  { id: 'stockin',   icon: PlusCircle,      en: 'Stock In',         ar: 'إضافة مخزون',   adminOnly: true  },
  { id: 'issue',     icon: ArrowDownCircle, en: 'Issue Items',      ar: 'صرف مخزون',    adminOnly: true  },
  { id: 'history',   icon: History,         en: 'Movement History', ar: 'السجلات',       adminOnly: false },
  { id: 'reports',   icon: BarChart2,       en: 'Reports',          ar: 'التقارير',      adminOnly: false },
  { id: 'settings',  icon: Settings,        en: 'Settings',         ar: 'الإعدادات',     adminOnly: true  },
]

const SPORTS_VERSION = 2  // increment when DEFAULT_SPORTS changes

async function seedSettings() {
  const configSnap = await getDoc(doc(db, 'inventory_config', 'main'))
  const currentVersion = configSnap.exists() ? (configSnap.data().sportsVersion || 0) : 0

  const batch = writeBatch(db)

  if (currentVersion < SPORTS_VERSION) {
    // Wipe and re-seed sports with new ordered list
    const existing = await getDocs(collection(db, 'inventory_sports'))
    existing.docs.forEach(d => batch.delete(d.ref))
    DEFAULT_SPORTS.forEach((s, i) => {
      batch.set(doc(db, 'inventory_sports', s.id), { en: s.en, ar: s.ar, order: i })
    })
    batch.set(doc(db, 'inventory_config', 'main'), { sportsVersion: SPORTS_VERSION }, { merge: true })
  }

  // Seed categories and units only if empty
  const [catSnap, unitSnap] = await Promise.all([
    getDocs(collection(db, 'inventory_categories')),
    getDocs(collection(db, 'inventory_units')),
  ])
  if (catSnap.empty) {
    DEFAULT_CATEGORIES.forEach((c, i) => {
      batch.set(doc(db, 'inventory_categories', c.id), { en: c.en, ar: c.ar, order: i })
    })
  }
  if (unitSnap.empty) {
    DEFAULT_UNITS.forEach((u, i) => {
      batch.set(doc(db, 'inventory_units', u.id), { en: u.en, ar: u.ar, order: i })
    })
  }

  await batch.commit()
}

export default function InventoryModule() {
  const { t, lang } = useLanguage()
  const { can, isMasterAdmin, isHOD } = usePermissions()

  const canView = can('inventory', 'view')
  const canEdit = can('inventory', 'edit')
  const isAdmin = canEdit

  const [activeTab, setActiveTab] = useState('dashboard')
  const [displayedTab, setDisplayedTab] = useState('dashboard')
  const [isTransitioning, setIsTransitioning] = useState(false)

  const [items, setItems] = useState([])
  const [settings, setSettings] = useState({
    sports: DEFAULT_SPORTS,
    categories: DEFAULT_CATEGORIES,
    units: DEFAULT_UNITS,
  })
  const [loadingItems, setLoadingItems] = useState(true)
  const [seeded, setSeeded] = useState(false)

  // Modals / overlays
  const [barcodeItem, setBarcodeItem] = useState(null)
  const [editItem, setEditItem] = useState(null)    // null = closed, {} = new, item = edit
  const [scanMode, setScanMode] = useState(false)
  const [scanResult, setScanResult] = useState(null)
  const [selectedItems, setSelectedItems] = useState([])

  // Seed settings on first load — only admins/HOD should write default data
  useEffect(() => {
    if (!isMasterAdmin && !isHOD) return
    seedSettings().catch(console.error)
  }, [isMasterAdmin, isHOD])

  // Real-time listener for inventory_items
  useEffect(() => {
    // Composite index may be needed: inventory_items (isActive ASC, createdAt DESC)
    // If not yet deployed, fallback query runs without orderBy
    const buildQuery = (withOrder) => withOrder
      ? query(collection(db, 'inventory_items'), where('isActive', '==', true), orderBy('createdAt', 'desc'))
      : query(collection(db, 'inventory_items'), where('isActive', '==', true))

    const unsub = onSnapshot(buildQuery(true), snap => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoadingItems(false)
    }, err => {
      // Index not ready — fall back to unordered query and sort client-side
      console.warn('Inventory ordered query needs index, falling back:', err.code)
      const unsub2 = onSnapshot(buildQuery(false), snap => {
        const sorted = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => {
            const ta = a.createdAt?.toDate?.()?.getTime() || 0
            const tb = b.createdAt?.toDate?.()?.getTime() || 0
            return tb - ta
          })
        setItems(sorted)
        setLoadingItems(false)
      }, err2 => { console.error('Inventory fallback listener:', err2); setLoadingItems(false) })
      return () => unsub2()
    })
    return unsub
  }, [])

  // Load settings from Firestore
  const loadSettings = useCallback(async () => {
    try {
      const [sSnap, cSnap, uSnap] = await Promise.all([
        getDocs(collection(db, 'inventory_sports')),
        getDocs(collection(db, 'inventory_categories')),
        getDocs(collection(db, 'inventory_units')),
      ])
      const sports     = sSnap.docs.length     ? sSnap.docs.map(d => ({ id: d.id, ...d.data() }))     : DEFAULT_SPORTS
      const categories = cSnap.docs.length ? cSnap.docs.map(d => ({ id: d.id, ...d.data() })) : DEFAULT_CATEGORIES
      const units      = uSnap.docs.length      ? uSnap.docs.map(d => ({ id: d.id, ...d.data() }))      : DEFAULT_UNITS
      setSettings({ sports, categories, units })
    } catch (err) {
      console.error('Settings load error:', err)
    }
  }, [])

  useEffect(() => { loadSettings() }, [loadSettings])

  // Barcode scanner listener
  useEffect(() => {
    if (!scanMode) return
    let buffer = ''
    let lastTime = Date.now()

    const onKey = (e) => {
      const now = Date.now()
      const gap = now - lastTime
      lastTime = now

      if (e.key === 'Enter') {
        if (buffer.length >= 3) {
          const found = items.find(i => i.barcode === buffer || i.sku === buffer)
          if (found) setScanResult(found)
          else setScanResult('not_found')
        }
        buffer = ''
        return
      }
      if (gap < 50 || buffer.length > 0) {
        buffer += e.key
      } else {
        buffer = e.key
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [scanMode, items])

  const handleTabChange = (tabId) => {
    if (tabId === activeTab || isTransitioning) return
    setActiveTab(tabId)
    setIsTransitioning(true)
    setTimeout(() => {
      setDisplayedTab(tabId)
      setIsTransitioning(false)
    }, 200)
  }

  const visibleTabs = TABS.filter(tab => !tab.adminOnly || isAdmin)

  if (!canView) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '16px', color: 'var(--theme-text-muted)' }}>
        <Lock size={48} opacity={0.3} />
        <p style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>
          {lang === 'ar' ? 'ليس لديك صلاحية الوصول لهذا القسم' : 'You do not have access to this module'}
        </p>
        <p style={{ fontSize: '13px', margin: 0 }}>
          {lang === 'ar' ? 'تواصل مع المدير لطلب الصلاحية' : 'Contact your administrator for access'}
        </p>
      </div>
    )
  }

  const sharedProps = {
    items,
    settings,
    isAdmin,
    onOpenBarcode: setBarcodeItem,
  }

  const renderTab = () => {
    switch (displayedTab) {
      case 'dashboard':
        return (
          <InventoryDashboard
            {...sharedProps}
            onViewItem={item => { handleTabChange('stock') }}
          />
        )
      case 'stock':
        return (
          <InventoryStock
            {...sharedProps}
            scanMode={scanMode}
            setScanMode={setScanMode}
            onEditItem={item => setEditItem(item)}
            onViewHistory={(item) => handleTabChange('history')}
            selectedItems={selectedItems}
            setSelectedItems={setSelectedItems}
          />
        )
      case 'stockin':
        return <InventoryStockIn {...sharedProps} />
      case 'issue':
        return (
          <InventoryIssue
            {...sharedProps}
            onIssueComplete={() => {}}
          />
        )
      case 'history':
        return <InventoryHistory {...sharedProps} />
      case 'reports':
        return <InventoryReports {...sharedProps} />
      case 'settings':
        return (
          <InventorySettings
            {...sharedProps}
            onSettingsChange={loadSettings}
          />
        )
      default:
        return null
    }
  }

  return (
    <div className="inv-module">
      {/* Top tab navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginLeft: '24px', marginRight: '24px', marginTop: '8px', marginBottom: '20px' }}>
        <nav className="luxury-tab-rail">
          {visibleTabs.map(tab => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                className={`tab-item ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => handleTabChange(tab.id)}
              >
                <Icon size={13} strokeWidth={1.8} />
                {t(tab.en, tab.ar)}
              </button>
            )
          })}
        </nav>
        {canEdit && (
          <motion.button
            className="inv-btn inv-btn-primary inv-btn-sm"
            onClick={() => setEditItem({})}
            whileTap={{ scale: 0.96 }}
          >
            <Plus size={14} /> {t('Add Item', 'إضافة صنف')}
          </motion.button>
        )}
      </div>

      {/* Content area */}
      <div className="inv-content">
        {loadingItems ? (
          <div className="inv-loading-state">
            <RefreshCw size={28} className="inv-spin" style={{ color: 'var(--theme-accent)' }} />
            <span>{t('Loading inventory…', 'جارٍ تحميل المخزون…')}</span>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={displayedTab}
              className="inv-tab-content"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            >
              {items.length === 0 && displayedTab === 'dashboard' ? (
                <div className="inv-empty-welcome">
                  <div className="inv-welcome-icon">
                    <Package size={48} strokeWidth={1} />
                  </div>
                  <h2 className="inv-welcome-title">
                    {t('Welcome to Inventory', 'مرحباً بك في نظام المخازن')}
                  </h2>
                  <p className="inv-welcome-desc">
                    {t(
                      'Start by importing your data from Excel or add items manually.',
                      'ابدأ باستيراد بياناتك من Excel أو أضف أصنافاً يدوياً'
                    )}
                  </p>
                  <button className="inv-btn inv-btn-primary" onClick={() => setEditItem({})}>
                    <Plus size={15} /> {t('Add First Item', 'أضف أول صنف')}
                  </button>
                </div>
              ) : (
                renderTab()
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      {/* Barcode Print Modal */}
      <AnimatePresence>
        {barcodeItem && (
          <BarcodePrintModal item={barcodeItem} onClose={() => setBarcodeItem(null)} />
        )}
      </AnimatePresence>

      {/* Item Edit/Add Modal */}
      <AnimatePresence>
        {editItem !== null && (
          <ItemEditModal
            item={editItem.id ? editItem : null}
            settings={settings}
            onClose={() => setEditItem(null)}
            onSaved={() => setEditItem(null)}
          />
        )}
      </AnimatePresence>

      {/* Scan Result Popup */}
      <AnimatePresence>
        {scanResult && scanResult !== 'not_found' && (
          <ScanPopup
            item={scanResult}
            settings={settings}
            onClose={() => setScanResult(null)}
            onStockIn={(item) => { setScanResult(null); handleTabChange('stockin') }}
            onIssue={(item) => { setScanResult(null); handleTabChange('issue') }}
            onBarcode={(item) => { setScanResult(null); setBarcodeItem(item) }}
          />
        )}
        {scanResult === 'not_found' && (
          <motion.div
            className="inv-scan-notfound"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            onAnimationComplete={() => setTimeout(() => setScanResult(null), 1800)}
          >
            {t('Item not found', 'الصنف غير موجود')}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Print-only barcode area (injected by BarcodePrintModal) */}
    </div>
  )
}
