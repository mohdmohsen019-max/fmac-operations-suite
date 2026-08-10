/**
 * Module visibility — suite-wide show/hide switches.
 *
 * A master admin can hide whole modules from the console (e.g. while one is
 * being rebuilt, or before a feature is ready to show the club). The switches
 * live in Firestore at `app_settings/modules` as { hidden: { <id>: true } } and
 * are watched live, so flipping one updates every signed-in device immediately.
 *
 * Deliberately NOT a permission system: this is presentation only. Per-user
 * access is still governed by usePermissions / jobTitlePermissions. Hiding a
 * module removes it from the sidebar + mobile nav and blocks its route, but the
 * underlying data is untouched.
 *
 * Only the modules listed in TOGGLEABLE_MODULES can ever be hidden. User
 * Management is intentionally excluded — it hosts the switches, so allowing it
 * to hide itself would lock an admin out of turning anything back on.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'

export const MODULES_DOC = { col: 'app_settings', id: 'modules' }

/* id must match the module ids used by NAV_ITEMS_DEF in App.jsx */
export const TOGGLEABLE_MODULES = [
  { id: 'help',      en: 'Help Desk',            ar: 'مركز الدعم' },
  { id: 'fleet',     en: 'Fleet Management',     ar: 'إدارة الأسطول' },
  { id: 'strategy',  en: 'Strategy & Excellence', ar: 'الاستراتيجية والتميز' },
  { id: 'crisis',    en: 'Crisis & Emergency',   ar: 'إدارة الأزمات والطوارئ' },
  { id: 'logistics', en: 'Logistics Hub',        ar: 'مركز اللوجستيات' },
  { id: 'insights',  en: 'Insights',             ar: 'الرؤى' },
]

const TOGGLEABLE_IDS = new Set(TOGGLEABLE_MODULES.map(m => m.id))

/** Ignore any stored key that isn't a module we allow hiding. */
export const sanitizeHidden = (raw) => {
  const out = {}
  Object.entries(raw || {}).forEach(([k, v]) => {
    if (v === true && TOGGLEABLE_IDS.has(k)) out[k] = true
  })
  return out
}

export function useModuleVisibility() {
  // `undefined` until the first snapshot lands, so callers can avoid flashing
  // a module that is actually hidden.
  const [hidden, setHidden] = useState(undefined)

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, MODULES_DOC.col, MODULES_DOC.id),
      snap => setHidden(sanitizeHidden(snap.exists() ? snap.data()?.hidden : {})),
      // Offline or rules denial must never black out the console — fail open.
      () => setHidden({}),
    )
    return unsub
  }, [])

  // Stable identities so consumers can safely use these in effect deps.
  const map = useMemo(() => hidden || {}, [hidden])
  const isHidden = useCallback((id) => !!map[id], [map])

  return { hidden: map, ready: hidden !== undefined, isHidden }
}
