import React, { useState, useEffect } from 'react';
import { UserPlus, ShieldCheck, Mail, Loader2 } from 'lucide-react';
import { FleetTable, SectionTitle } from './FleetSharedUI';
import { db } from '../../firebase';
import { collection, getDocs } from 'firebase/firestore';
import { useLanguage } from '../../contexts/LanguageContext';

export default function FleetUsers() {
  const { t } = useLanguage();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  async function fetchUsers() {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'users'));
      const data = snap.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
      setUsers(data);
    } catch (err) {
      console.error('Error fetching users:', err);
    }
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchUsers();
  }, []);

  const adminCount = users.filter(u => u.role === 'admin').length;

  return (
    <div className="fleet-view-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <div className="fleet-kpi-label">{t('Administration', 'الإدارة')}</div>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, margin: 0 }}>{t('System Users', 'مستخدمو النظام')}</h1>
        </div>
        <button className="fleet-btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <UserPlus size={16} /> {t('Invite User', 'دعوة مستخدم')}
        </button>
      </div>

      <div className="fleet-stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="fleet-kpi-card">
          <div className="fleet-kpi-label">{t('Active Users', 'المستخدمون النشطون')}</div>
          <div className="fleet-kpi-value">{users.length}</div>
        </div>
        <div className="fleet-kpi-card">
          <div className="fleet-kpi-label">{t('Admins', 'المسؤولون')}</div>
          <div className="fleet-kpi-value">{adminCount}</div>
        </div>
        <div className="fleet-kpi-card">
          <div className="fleet-kpi-label">{t('Pending Approval', 'بانتظار الموافقة')}</div>
          <div className="fleet-kpi-value" style={{ color: 'var(--status-warn)' }}>0</div>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '40px', display: 'flex', justifyContent: 'center' }}><div className="app-loader"><span /><span /><span /><span /><span /></div></div>
      ) : (
        <FleetTable 
          headers={[t('Name', 'الاسم'), t('Email', 'البريد'), t('Role', 'الدور'), t('Status', 'الحالة'), t('Access Level', 'مستوى الوصول')]}
          data={users}
          renderRow={(user) => (
            <tr key={user.uid}>
              <td style={{ fontWeight: 700 }}>{user.displayName || user.name || 'N/A'}</td>
              <td style={{ color: 'var(--theme-text-muted)' }}>{user.email}</td>
              <td>
                <span style={{ 
                  background: user.role === 'admin' ? 'var(--theme-accent-soft)' : 'var(--theme-surface-hover)',
                  color: user.role === 'admin' ? 'var(--theme-accent)' : 'var(--theme-text-main)',
                  padding: '4px 10px',
                  borderRadius: '4px',
                  fontSize: '0.7rem',
                  fontWeight: 800,
                  textTransform: 'uppercase'
                }}>
                  {user.role}
                </span>
              </td>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ 
                    width: '6px', 
                    height: '6px', 
                    borderRadius: '50%', 
                    background: '#10B981' 
                  }} />
                  {t('Active', 'نشط')}
                </div>
              </td>
              <td>{user.role === 'admin' ? t('Full Control', 'تحكم كامل') : t('Standard Access', 'وصول عادي')}</td>
            </tr>
          )}
        />
      )}
    </div>
  );
}

