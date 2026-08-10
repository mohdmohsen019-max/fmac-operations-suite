import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Package2, Bus, Map, Fuel, Wrench, ShieldAlert,
  Package, ScanBarcode, ArrowDownToLine, ArrowUpFromLine, Building2,
  BarChart2, LifeBuoy, Users, UserCircle2, Moon, Languages, LogOut,
  Search, CornerDownLeft, History, ClipboardList, Ticket, Box, TrendingUp, MonitorPlay, Target, Siren,
} from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth, db } from '../../firebase';
import { collection, getDocs } from 'firebase/firestore';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useModuleVisibility } from '../../hooks/useModuleVisibility';
import './CommandPalette.css';

/* ── Static command registry ──
   keywords include Arabic + English aliases so search works in both
   languages regardless of the active UI language. */
const COMMANDS = [
  // Navigation
  { id: 'dash',      icon: LayoutDashboard, en: 'Overview',                ar: 'نظرة عامة',            group: 'nav', path: '/dashboard',              kw: 'home overview dashboard رئيسية' },
  { id: 'activity',  icon: History,         en: 'Activity Log',            ar: 'سجل النشاط',           group: 'nav', path: '/activity',               kw: 'activity timeline audit log سجل نشاط تدقيق' },
  { id: 'insights',  icon: TrendingUp,      en: 'Executive Insights',      ar: 'الرؤى التنفيذية',      group: 'nav', path: '/insights',               kw: 'insights analytics charts trends رؤى تحليلات اتجاهات' },
  { id: 'strategy',  icon: Target,          en: 'Strategy & Excellence',   ar: 'الاستراتيجية والتميز',  group: 'nav', path: '/strategy',               kw: 'strategy excellence kpi initiatives استراتيجية تميز مؤشرات مبادرات' },
  { id: 'strategy-kpis', icon: Target,      en: 'Excellence KPIs',         ar: 'مؤشرات التميز',        group: 'nav', path: '/strategy/kpis',          kw: 'kpi indicators targets مؤشرات مستهدفات' },
  { id: 'strategy-reports', icon: Target,   en: 'Excellence Reports',      ar: 'تقارير التميز',        group: 'nav', path: '/strategy/reports',       kw: 'scorecard portfolio brief بطاقة الأداء موجز' },
  { id: 'crisis',    icon: Siren,           en: 'Crisis & Emergency',      ar: 'إدارة الأزمات والطوارئ', group: 'nav', path: '/crisis',                 kw: 'crisis emergency incident risk continuity war room أزمات طوارئ حوادث مخاطر استمرارية' },
  { id: 'crisis-incidents', icon: Siren,    en: 'Crisis — Incidents',      ar: 'الأزمات — الحوادث',    group: 'nav', path: '/crisis/incidents',       kw: 'incident report crisis حادث إبلاغ أزمة' },
  { id: 'crisis-room', icon: Siren,         en: 'Crisis — Event Room',     ar: 'الأزمات — غرفة الحدث',  group: 'nav', path: '/crisis/room',            kw: 'event room live command war أزمة غرفة الحدث مباشر' },
  { id: 'wallboard', icon: MonitorPlay,     en: 'Ops Wallboard (TV mode)', ar: 'شاشة العمليات (وضع TV)', group: 'nav', path: '/wallboard',             kw: 'wallboard tv screen mission control شاشة عرض' },
  { id: 'logistics', icon: Package2,        en: 'Logistics — Attendance',  ar: 'اللوجستيات — الحضور',  group: 'nav', path: '/logistics/attendance',   kw: 'attendance sessions players حضور جلسات' },
  { id: 'fleet',     icon: Bus,             en: 'Fleet — Overview',        ar: 'الأسطول — نظرة عامة',  group: 'nav', path: '/fleet/dashboard',        kw: 'fleet buses vehicles حافلات أسطول' },
  { id: 'livemap',   icon: Map,             en: 'Fleet — Live Map',        ar: 'الأسطول — خريطة مباشرة', group: 'nav', path: '/fleet/livemap',        kw: 'map gps tracking خريطة تتبع' },
  { id: 'fuel',      icon: Fuel,            en: 'Fleet — Fuel Core',       ar: 'الأسطول — الوقود',     group: 'nav', path: '/fleet/fuel-intelligence', kw: 'fuel adnoc وقود' },
  { id: 'maint',     icon: Wrench,          en: 'Fleet — Maintenance',     ar: 'الأسطول — الصيانة',    group: 'nav', path: '/fleet/maintenance',      kw: 'maintenance service صيانة' },
  { id: 'safety',    icon: ShieldAlert,     en: 'Fleet — Safety',          ar: 'الأسطول — السلامة',    group: 'nav', path: '/fleet/safety-behavior',  kw: 'safety risk violations سلامة مخالفات' },
  { id: 'inv',       icon: Package,         en: 'Inventory — Dashboard',   ar: 'المخزون — لوحة',       group: 'nav', path: '/inventory',              kw: 'inventory stock warehouse مخزون مستودع' },
  { id: 'stockin',   icon: ArrowDownToLine, en: 'Inventory — Stock In',    ar: 'المخزون — إدخال',      group: 'nav', path: '/inventory/stock-in',     kw: 'stock in receive إدخال استلام' },
  { id: 'issue',     icon: ArrowUpFromLine, en: 'Inventory — Issue Items', ar: 'المخزون — صرف',        group: 'nav', path: '/inventory/issue',        kw: 'issue give صرف تسليم' },
  { id: 'scan',      icon: ScanBarcode,     en: 'Inventory — Stock List',  ar: 'المخزون — الأصناف',    group: 'nav', path: '/inventory/stock',        kw: 'items barcode sku باركود أصناف' },
  { id: 'reorder',   icon: ClipboardList,   en: 'Inventory — Reorder Sheet', ar: 'المخزون — ورقة إعادة الطلب', group: 'nav', path: '/inventory/reorder', kw: 'reorder purchase restock low شراء إعادة طلب نواقص' },
  { id: 'assets',    icon: Building2,       en: 'Assets — Registry',       ar: 'الأصول — السجل',       group: 'nav', path: '/assets',                 kw: 'assets rooms registry أصول غرف' },
  { id: 'reports',   icon: BarChart2,       en: 'Dept. Reports',           ar: 'تقارير الأقسام',       group: 'nav', path: '/reports',                kw: 'reports monthly تقارير شهري' },
  { id: 'help',      icon: LifeBuoy,        en: 'Help Desk',               ar: 'مركز الدعم',           group: 'nav', path: '/help',                   kw: 'tickets support complaints دعم تذاكر شكاوى' },
  { id: 'users',     icon: Users,           en: 'User Management',         ar: 'إدارة المستخدمين',     group: 'nav', path: '/users/dashboard',        kw: 'users accounts approvals مستخدمين حسابات' },
  { id: 'profile',   icon: UserCircle2,     en: 'My Profile',              ar: 'ملفي الشخصي',          group: 'nav', path: '/profile',                kw: 'profile account ملف شخصي' },
  // Actions
  { id: 'theme',     icon: Moon,            en: 'Toggle light / dark',     ar: 'تبديل الوضع الفاتح / الداكن', group: 'action', action: 'theme',  kw: 'theme dark light مظهر داكن فاتح' },
  { id: 'lang',      icon: Languages,       en: 'Switch language',         ar: 'تغيير اللغة',          group: 'action', action: 'lang',   kw: 'language english arabic عربي انجليزي لغة' },
  { id: 'signout',   icon: LogOut,          en: 'Sign out',                ar: 'تسجيل الخروج',         group: 'action', action: 'signout', kw: 'logout sign out exit خروج' },
];

/* ── Record index — tickets, inventory items, assets.
   Built lazily on the first real query, cached for 10 minutes,
   shared across palette openings (module-level). ── */
const INDEX_TTL = 10 * 60 * 1000;
let recordCache = { at: 0, records: null, promise: null };

async function buildRecordIndex() {
  const records = [];

  await Promise.allSettled([
    (async () => {
      const snap = await getDocs(collection(db, 'requests'));
      snap.docs.forEach(d => {
        const r = d.data();
        records.push({
          id: `tk-${d.id}`,
          rgroup: 'tickets',
          icon: Ticket,
          title: r.ticketNumber || d.id.slice(0, 12),
          rawName: r.userInfo?.name || '',
          rawType: r.type || '',
          rawStatus: r.status || '',
          path: `/help/requests/${d.id}`,
          kw: `${r.ticketNumber || ''} ${r.userInfo?.name || ''} ${r.type || ''}`.toLowerCase(),
        });
      });
    })(),
    (async () => {
      const snap = await getDocs(collection(db, 'inventory_items'));
      snap.docs.forEach(d => {
        const i = d.data();
        if (i.isActive === false) return;
        records.push({
          id: `it-${d.id}`,
          rgroup: 'items',
          icon: Box,
          title: i.nameAr || i.nameEn || i.sku || '—',
          rawSku: i.sku || '',
          rawStock: typeof i.currentStock === 'number' ? i.currentStock : null,
          path: `/inventory/stock?q=${encodeURIComponent(i.sku || i.nameEn || i.nameAr || '')}`,
          kw: `${i.nameEn || ''} ${i.nameAr || ''} ${i.sku || ''} ${i.barcode || ''}`.toLowerCase(),
        });
      });
    })(),
    (async () => {
      const snap = await getDocs(collection(db, 'assets'));
      snap.docs.forEach(d => {
        const a = d.data();
        records.push({
          id: `as-${d.id}`,
          rgroup: 'assets',
          icon: Building2,
          title: a.name_en || a.name_ar || '—',
          rawBarcode: a.barcode || '',
          rawStatus: a.status || '',
          path: `/assets?q=${encodeURIComponent(a.barcode || a.name_en || a.name_ar || '')}`,
          kw: `${a.name_en || ''} ${a.name_ar || ''} ${a.barcode || ''} ${a.sku || ''}`.toLowerCase(),
        });
      });
    })(),
  ]);

  return records;
}

function ensureRecordIndex() {
  const now = Date.now();
  if (recordCache.records && now - recordCache.at < INDEX_TTL) {
    return Promise.resolve(recordCache.records);
  }
  if (!recordCache.promise) {
    recordCache.promise = buildRecordIndex().then(records => {
      recordCache = { at: Date.now(), records, promise: null };
      return records;
    }).catch(() => {
      recordCache.promise = null;
      return [];
    });
  }
  return recordCache.promise;
}

const RGROUP_LABELS = {
  tickets: { en: 'Tickets', ar: 'التذاكر' },
  items:   { en: 'Inventory items', ar: 'أصناف المخزون' },
  assets:  { en: 'Assets', ar: 'الأصول' },
};

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [q, setQ] = useState('');            // debounced term
  const [cursor, setCursor] = useState(0);
  const [records, setRecords] = useState(null); // null = not indexed yet
  const [indexing, setIndexing] = useState(false);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const navigate = useNavigate();
  const { t, lang, toggleLanguage } = useLanguage();
  const { toggleTheme } = useTheme();
  const { isHidden } = useModuleVisibility();

  /* Open via Ctrl/Cmd+K anywhere, or the custom event fired by the
     dashboard's search button. Esc closes. State resets happen in the
     handlers themselves (never synchronously inside an effect). */
  useEffect(() => {
    const reset = () => { setTerm(''); setQ(''); setCursor(0); };
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        reset();
        setOpen(v => !v);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    const onOpenEvent = () => { reset(); setOpen(true); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('fmac:palette', onOpenEvent);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('fmac:palette', onOpenEvent);
    };
  }, []);

  /* Focus the input once the dialog mounts */
  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  /* Debounce the query */
  useEffect(() => {
    const id = setTimeout(() => setQ(term.trim().toLowerCase()), 160);
    return () => clearTimeout(id);
  }, [term]);

  /* Lazily build the record index the moment the user types a real
     query (event handler, not an effect — keeps renders pure). */
  const kickIndex = useCallback((value) => {
    if (value.trim().length < 2 || records !== null || indexing) return;
    setIndexing(true);
    ensureRecordIndex().then(r => {
      setRecords(r);
      setIndexing(false);
    });
  }, [records, indexing]);

  /* Commands for modules an admin has switched off must not be reachable here
     either — the palette is a second door into the same routes. Matched on the
     command's path so sub-pages (e.g. /strategy/kpis) drop out with the parent. */
  const visibleCommands = useMemo(
    () => COMMANDS.filter(c => {
      const root = String(c.path || '').split('/').filter(Boolean)[0];
      return !root || !isHidden(root);
    }),
    [isHidden],
  );

  const cmdResults = useMemo(() => {
    if (!q) return visibleCommands;
    return visibleCommands.filter(c =>
      c.en.toLowerCase().includes(q) || c.ar.includes(q) || c.kw.toLowerCase().includes(q)
    );
  }, [q, visibleCommands]);

  const recResults = useMemo(() => {
    if (q.length < 2 || !records) return { tickets: [], items: [], assets: [] };
    const hit = records.filter(r => r.kw.includes(q) || r.title.toLowerCase().includes(q));
    return {
      tickets: hit.filter(r => r.rgroup === 'tickets').slice(0, 5),
      items:   hit.filter(r => r.rgroup === 'items').slice(0, 5),
      assets:  hit.filter(r => r.rgroup === 'assets').slice(0, 5),
    };
  }, [q, records]);

  const navResults = cmdResults.filter(r => r.group === 'nav');
  const actionResults = cmdResults.filter(r => r.group === 'action');
  const flat = [
    ...navResults,
    ...recResults.tickets, ...recResults.items, ...recResults.assets,
    ...actionResults,
  ];

  /* Clamp at render — no effect needed to keep the cursor in range */
  const cursorSafe = Math.min(cursor, Math.max(flat.length - 1, 0));

  const run = useCallback((cmd) => {
    setOpen(false);
    if (!cmd) return;
    if (cmd.path) { navigate(cmd.path); return; }
    if (cmd.action === 'theme') toggleTheme();
    else if (cmd.action === 'lang') toggleLanguage();
    else if (cmd.action === 'signout') signOut(auth);
  }, [navigate, toggleTheme, toggleLanguage]);

  const onInputKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(Math.min(cursorSafe + 1, flat.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(Math.max(cursorSafe - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); run(flat[cursorSafe]); }
  };

  /* Keep the active row in view */
  useEffect(() => {
    listRef.current?.querySelector('.cp-item.active')?.scrollIntoView({ block: 'nearest' });
  }, [cursorSafe]);

  if (!open) return null;

  const recSub = (r) => {
    if (r.rgroup === 'tickets') {
      return [r.rawName, r.rawType, r.rawStatus === 'closed' ? t('closed', 'مغلق') : t('open', 'مفتوح')]
        .filter(Boolean).join(' · ');
    }
    if (r.rgroup === 'items') {
      return [r.rawSku, r.rawStock != null ? `${t('stock', 'المخزون')}: ${r.rawStock}` : '']
        .filter(Boolean).join(' · ');
    }
    return [r.rawBarcode, r.rawStatus].filter(Boolean).join(' · ');
  };

  const renderRow = (cmd) => {
    const i = flat.indexOf(cmd);
    const Icon = cmd.icon;
    const isRecord = !!cmd.rgroup;
    return (
      <button
        key={cmd.id}
        className={`cp-item${i === cursorSafe ? ' active' : ''}`}
        role="option"
        aria-selected={i === cursorSafe}
        onMouseEnter={() => setCursor(i)}
        onClick={() => run(cmd)}
      >
        <Icon size={15} strokeWidth={1.9} />
        {isRecord ? (
          <span className="cp-item-rec">
            <span className="cp-item-label" dir="auto">{cmd.title}</span>
            <span className="cp-item-sub" dir="auto">{recSub(cmd)}</span>
          </span>
        ) : (
          <span className="cp-item-label">{lang === 'ar' ? cmd.ar : cmd.en}</span>
        )}
        {i === cursorSafe && <CornerDownLeft size={13} className="cp-enter" />}
      </button>
    );
  };

  const recGroups = ['tickets', 'items', 'assets'].filter(g => recResults[g].length > 0);
  const nothing = flat.length === 0 && !indexing;

  return (
    <div className="cp-backdrop" onMouseDown={() => setOpen(false)}>
      <div className="cp" role="dialog" aria-modal="true" aria-label={t('Command palette', 'لوحة الأوامر')} onMouseDown={e => e.stopPropagation()}>
        <div className="cp-input-row">
          <Search size={15} strokeWidth={2} />
          <input
            ref={inputRef}
            className="cp-input"
            value={term}
            placeholder={t('Search pages, tickets, items, assets…', 'ابحث في الصفحات والتذاكر والأصناف والأصول…')}
            onChange={e => { setTerm(e.target.value); kickIndex(e.target.value); }}
            onKeyDown={onInputKey}
          />
          <span className="cp-kbd">esc</span>
        </div>

        <div className="cp-list" role="listbox" ref={listRef}>
          {nothing && <div className="cp-none">{t('No matches.', 'لا توجد نتائج.')}</div>}

          {navResults.length > 0 && (
            <div className="cp-group-label">{t('Go to', 'الانتقال إلى')}</div>
          )}
          {navResults.map(renderRow)}

          {q.length >= 2 && indexing && (
            <div className="cp-indexing">{t('Indexing records…', 'جارٍ فهرسة السجلات…')}</div>
          )}
          {recGroups.map(g => (
            <React.Fragment key={g}>
              <div className="cp-group-label">{lang === 'ar' ? RGROUP_LABELS[g].ar : RGROUP_LABELS[g].en}</div>
              {recResults[g].map(renderRow)}
            </React.Fragment>
          ))}

          {actionResults.length > 0 && (
            <div className="cp-group-label">{t('Actions', 'إجراءات')}</div>
          )}
          {actionResults.map(renderRow)}
        </div>

        <div className="cp-foot">
          <span><span className="cp-kbd">↑↓</span> {t('navigate', 'تنقل')}</span>
          <span><span className="cp-kbd">↵</span> {t('open', 'فتح')}</span>
          <span><span className="cp-kbd">Ctrl K</span> {t('toggle', 'إظهار/إخفاء')}</span>
        </div>
      </div>
    </div>
  );
}

