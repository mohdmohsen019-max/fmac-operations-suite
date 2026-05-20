import { motion } from 'framer-motion';
import { Wrench } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';

export default function UnderMaintenance({ icon: Icon, title }) {
  const { t } = useLanguage();
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      minHeight: '60vh',
      gap: '24px',
      padding: '40px',
      textAlign: 'center',
    }}>
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        style={{
          width: '88px',
          height: '88px',
          borderRadius: '28px',
          background: 'var(--theme-accent-soft)',
          border: '1px solid var(--theme-accent-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--theme-accent)',
          boxShadow: '0 0 40px var(--theme-accent-glow)',
        }}
      >
        <Icon size={40} strokeWidth={1.5} />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.4 }}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}
      >
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 12px',
          borderRadius: '99px',
          background: 'var(--theme-accent-soft)',
          border: '1px solid var(--theme-accent-border)',
          fontSize: '0.62rem',
          fontWeight: 900,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: 'var(--theme-accent)',
        }}>
          <Wrench size={10} strokeWidth={2.5} />
          {t('Under Maintenance', 'تحت الصيانة')}
        </span>

        <h1 style={{
          margin: 0,
          fontSize: '2rem',
          fontWeight: 900,
          letterSpacing: '-0.03em',
          color: 'var(--theme-text-main)',
        }}>
          {title}
        </h1>

        <p style={{
          margin: 0,
          fontSize: '0.95rem',
          color: 'var(--theme-text-muted)',
          lineHeight: 1.6,
          maxWidth: '360px',
        }}>
          {t('This module is currently being built.', 'هذه الوحدة قيد الإنشاء حالياً.')}<br />
          {t('Check back soon.', 'تفقد مجدداً قريباً.')}
        </p>
      </motion.div>
    </div>
  );
}
