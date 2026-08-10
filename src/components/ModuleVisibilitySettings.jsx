/**
 * Module visibility settings — master-admin switches that show/hide whole
 * modules across the suite. Writes to `app_settings/modules`.
 *
 * Presentation only: hiding a module pulls it from the sidebar + mobile nav and
 * blocks its route, but never touches the module's data. Turning it back on
 * restores everything exactly as it was.
 */
import { useState } from 'react'
import { motion } from 'framer-motion'
import { EyeOff, Loader2, ShieldCheck } from 'lucide-react'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db, auth } from '../firebase'
import { useLanguage } from '../contexts/LanguageContext'
import { useModuleVisibility, TOGGLEABLE_MODULES, MODULES_DOC } from '../hooks/useModuleVisibility'

export default function ModuleVisibilitySettings({ isMasterAdmin }) {
  const { t, lang } = useLanguage()
  const isAr = lang === 'ar'
  const { hidden, ready } = useModuleVisibility()
  const [saving, setSaving] = useState('')   // module id currently being written
  const [error, setError] = useState('')

  const toggle = async (id, nextHidden) => {
    setSaving(id)
    setError('')
    try {
      await setDoc(
        doc(db, MODULES_DOC.col, MODULES_DOC.id),
        {
          hidden: { ...hidden, [id]: nextHidden },
          updatedAt: serverTimestamp(),
          updatedBy: auth.currentUser?.email || '',
        },
        { merge: true },
      )
    } catch (err) {
      console.error('[modules] toggle failed:', err)
      setError(err?.message || String(err))
    }
    setSaving('')
  }

  if (!isMasterAdmin) {
    return (
      <div className="mv-empty" dir="auto">
        {t('Only the master administrator can change module visibility.',
           'يمكن للمسؤول الرئيسي فقط تغيير إظهار الوحدات.')}
      </div>
    )
  }

  const hiddenCount = TOGGLEABLE_MODULES.filter(m => hidden[m.id]).length

  return (
    <div className="mv-wrap">
      <div className="mv-head">
        <div>
          <h3 className="mv-title" dir="auto">{t('Module visibility', 'إظهار الوحدات')}</h3>
          <p className="mv-sub" dir="auto">
            {t('Turn a module off to hide it from the sidebar and block its pages for everyone. Data is never deleted — switching it back on restores it exactly as it was.',
               'أوقف أي وحدة لإخفائها من القائمة الجانبية ومنع صفحاتها عن الجميع. لا تُحذف أي بيانات — وإعادة التشغيل تستعيدها كما كانت تماماً.')}
          </p>
        </div>
        {hiddenCount > 0 && (
          <span className="mv-count">
            <EyeOff size={13} />
            {t(`${hiddenCount} hidden`, `${hiddenCount} مخفية`)}
          </span>
        )}
      </div>

      {error && <div className="mv-error" dir="auto">{error}</div>}

      <div className="mv-list">
        {TOGGLEABLE_MODULES.map(m => {
          const off = !!hidden[m.id]
          const busy = saving === m.id
          return (
            <div key={m.id} className={`mv-row${off ? ' is-off' : ''}`}>
              <div className="mv-row-label">
                <span className="mv-row-name" dir="auto">{isAr ? m.ar : m.en}</span>
                <span className="mv-row-state" dir="auto">
                  {off ? t('Hidden from everyone', 'مخفية عن الجميع') : t('Visible', 'ظاهرة')}
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={!off}
                aria-label={isAr ? m.ar : m.en}
                className={`mv-switch${off ? '' : ' on'}`}
                disabled={busy || !ready}
                onClick={() => toggle(m.id, !off)}
              >
                {busy
                  ? <Loader2 size={13} className="mv-spin" />
                  : <motion.span className="mv-knob" layout transition={{ type: 'spring', stiffness: 500, damping: 34 }} />}
              </button>
            </div>
          )
        })}
      </div>

      <p className="mv-note" dir="auto">
        <ShieldCheck size={13} />
        {t('User Management, Inventory, Assets, Reports and Activity Log always stay visible so the console can never lock you out.',
           'تبقى إدارة المستخدمين والمخزون والأصول والتقارير وسجل النشاط ظاهرة دائماً حتى لا تُغلق لوحة التحكم دونك.')}
      </p>
    </div>
  )
}
