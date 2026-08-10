/**
 * Fleet scope — which vehicles every fleet sub-module is looking at.
 *
 *   'buses'  → the 14-bus school fleet (historical default)
 *   'others' → club vehicles that are NOT part of the bus fleet
 *   'all'    → everything registered on Cartrack
 *
 * One shared switch, one shared state: flipping it in any tab re-scopes the
 * whole module. The context also owns the live fleet_vehicle_meta subscription
 * and plugs a Firestore-backed classifier into cartrackService, so
 * reclassifying a vehicle in the Ecosystem tab immediately moves it between
 * scopes everywhere — map, fuel, maintenance, reports.
 */
import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'
import { Bus, Car, Layers } from 'lucide-react'
import { setVehicleClassifier } from '../../services/cartrackService'
import {
  subscribeFleetMeta, effectiveMeta, classOf, matchesScope, displayNameOf, normReg,
} from '../../services/fleetMeta'
import { useLanguage } from '../../contexts/LanguageContext'

const FleetScopeContext = createContext(null)

const STORAGE_KEY = 'fmac_fleet_scope'
const VALID = ['buses', 'others', 'all']

export function FleetScopeProvider({ children }) {
  const [scope, setScopeRaw] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    return VALID.includes(saved) ? saved : 'buses'
  })
  const [metaMap, setMetaMap] = useState(() => new Map())
  const [metaReady, setMetaReady] = useState(false)

  useEffect(() => {
    const unsub = subscribeFleetMeta((map) => {
      setMetaMap(map)
      setMetaReady(true)
      // Re-point the service classifier at the freshest Firestore state.
      setVehicleClassifier((reg) => classOf(reg, map))
    })
    return unsub
  }, [])

  const setScope = useCallback((s) => {
    if (!VALID.includes(s)) return
    setScopeRaw(s)
    localStorage.setItem(STORAGE_KEY, s)
  }, [])

  const value = useMemo(() => ({
    scope,
    setScope,
    metaMap,
    metaReady,
    metaOf: (reg) => effectiveMeta(reg, metaMap),
    classOf: (reg) => classOf(reg, metaMap),
    inScope: (reg) => matchesScope(reg, scope, metaMap),
    displayName: (reg, lang) => displayNameOf(reg, metaMap, lang),
    normReg,
  }), [scope, setScope, metaMap, metaReady])

  return <FleetScopeContext.Provider value={value}>{children}</FleetScopeContext.Provider>
}

export function useFleetScope() {
  const ctx = useContext(FleetScopeContext)
  if (!ctx) {
    // Render-safe fallback for anything mounted outside the provider.
    return {
      scope: 'buses', setScope: () => {}, metaMap: new Map(), metaReady: false,
      metaOf: (reg) => effectiveMeta(reg, new Map()),
      classOf: (reg) => classOf(reg, new Map()),
      inScope: (reg) => matchesScope(reg, 'buses', new Map()),
      displayName: (reg, lang) => displayNameOf(reg, new Map(), lang),
      normReg,
    }
  }
  return ctx
}

/* ── The shared switch — sits in the fleet header, styled like the tabs ── */
export function FleetScopeSwitch({ compact = false }) {
  const { t } = useLanguage()
  const { scope, setScope } = useFleetScope()
  const OPTIONS = [
    { id: 'buses',  icon: Bus,    en: 'Buses',  ar: 'الحافلات' },
    { id: 'others', icon: Car,    en: 'Other Vehicles', ar: 'مركبات أخرى' },
    { id: 'all',    icon: Layers, en: 'All',    ar: 'الكل' },
  ]
  return (
    <div className={`fleet-scope-switch${compact ? ' fleet-scope-switch--compact' : ''}`} role="tablist">
      {OPTIONS.map((o) => {
        const Icon = o.icon
        return (
          <button
            key={o.id}
            role="tab"
            aria-selected={scope === o.id}
            className={`fleet-scope-btn${scope === o.id ? ' active' : ''}`}
            onClick={() => setScope(o.id)}
          >
            <Icon size={13} strokeWidth={2} />
            {compact ? null : <span>{t(o.en, o.ar)}</span>}
          </button>
        )
      })}
    </div>
  )
}
