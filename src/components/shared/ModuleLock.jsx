import { Lock } from 'lucide-react'
import { useLanguage } from '../../contexts/LanguageContext'

/* Shown when User Management has set a module's access to "None". */
export default function ModuleLock() {
  const { t } = useLanguage()
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '60vh', gap: 14,
      color: 'var(--theme-text-muted)', textAlign: 'center',
    }}>
      <Lock size={44} strokeWidth={1.5} style={{ opacity: 0.35 }} />
      <p style={{ fontSize: 15, fontWeight: 600, margin: 0, color: 'var(--theme-text-main)' }}>
        {t('You do not have access to this module', 'ليس لديك صلاحية الوصول لهذه الوحدة')}
      </p>
      <p style={{ fontSize: 13, margin: 0 }}>
        {t('Ask the Head of Operations or the administrator to grant access.',
           'اطلب الصلاحية من رئيس العمليات أو المسؤول.')}
      </p>
    </div>
  )
}
