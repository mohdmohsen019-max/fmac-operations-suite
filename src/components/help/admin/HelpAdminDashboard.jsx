import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '../HelpCenter.css';
import { motion } from 'framer-motion';
import { db, auth } from '../../../firebase';
import { collection, query, onSnapshot, orderBy, deleteDoc, doc, writeBatch } from 'firebase/firestore';
import { Download, Search, LayoutDashboard, Inbox, AlertCircle, Lightbulb, Users, Phone, Wrench, ChevronRight, FileText, FileSpreadsheet, Upload, Lock } from 'lucide-react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useLanguage } from '../../../contexts/LanguageContext';
import { usePermissions } from '../../../hooks/usePermissions';

export default function HelpAdminDashboard() {
  const navigate = useNavigate();
  const { t, lang } = useLanguage();
  const { can } = usePermissions();
  const [activeTab, setActiveTab] = useState('all');
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showExport, setShowExport] = useState(false);

  const MASTER_ADMIN_EMAIL = import.meta.env.VITE_MASTER_ADMIN_EMAIL;
  const currentUser = auth.currentUser;
  const isMasterAdmin = currentUser?.email === MASTER_ADMIN_EMAIL;

  const TABS = [
    { id: 'all', label: t('All Requests', 'جميع الطلبات'), icon: LayoutDashboard },
    { id: 'escalated', label: t('Escalated', 'مُصعَّد'), icon: AlertCircle },
    { id: 'inquiry', label: t('Inquiries', 'الاستفسارات'), icon: Inbox },
    { id: 'complaint', label: t('Complaints', 'الشكاوى'), icon: AlertCircle },
    { id: 'suggestion', label: t('Suggestions', 'المقترحات'), icon: Lightbulb },
    { id: 'meeting', label: t('Meetings', 'الاجتماعات'), icon: Users },
    { id: 'call', label: t('Calls', 'المكالمات'), icon: Phone },
    { id: 'maintenance', label: t('Maintenance', 'الصيانة'), icon: Wrench }
  ];

  useEffect(() => {
    const q = query(collection(db, 'requests'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setRequests(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const filteredRequests = requests.filter(r => {
    let matchesTab = false;
    if (activeTab === 'all') matchesTab = true;
    else if (activeTab === 'escalated') matchesTab = r.assignedTo === 'hod' && r.status !== 'closed';
    else matchesTab = r.type === activeTab;

    const matchesSearch = r.ticketNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          r.userInfo?.name?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesTab && matchesSearch;
  });

  const stats = {
    total: requests.length,
    new: requests.filter(r => r.status === 'new').length,
    progress: requests.filter(r => r.status === 'progress').length,
    closed: requests.filter(r => r.status === 'closed').length,
    overdue: requests.filter(r => r.slaDeadline?.toDate && r.slaDeadline.toDate() < new Date() && r.status !== 'closed').length
  };

  const handleClearAll = async () => {
    if (!window.confirm(t('CRITICAL WARNING: This will permanently delete all help center requests. Are you sure?', 'تحذير حرج: سيؤدي هذا إلى حذف جميع طلبات مركز المساعدة نهائياً. هل أنت متأكد؟'))) return;
    try {
      const batch = writeBatch(db);
      requests.forEach(r => batch.delete(doc(db, 'requests', r.id)));
      await batch.commit();
    } catch (err) {
      console.error('handleClearAll failed:', err);
      alert(t('Failed to clear requests. Please try again.', 'فشل مسح الطلبات. حاول مرة أخرى.'));
    }
  };

  const exportExcel = () => {
    const data = filteredRequests.map(r => ({
      'Ticket ID': r.ticketNumber,
      'Type': r.type?.toUpperCase(),
      'Submitter': r.userInfo?.name,
      'Status': r.status?.toUpperCase(),
      'Priority': r.priority,
      'Branch': r.userInfo?.branch,
      'Date': r.createdAt?.toDate ? r.createdAt.toDate().toLocaleDateString() : 'N/A'
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Requests');
    XLSX.writeFile(wb, `FMAC_Requests_${new Date().toLocaleDateString()}.xlsx`);
    setShowExport(false);
  };

  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary', cellDates: true });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);
        
        const batch = writeBatch(db);
        let count = 0;
        
        data.forEach((row) => {
          const docRef = doc(collection(db, 'requests'));
          
          const ticketNumber = row['Ticket ID'] || row['ticketNumber'] || `FMAC-IMPORT-${Math.floor(Math.random() * 1000000)}`;
          const type = (row['Type'] || row['type'] || 'inquiry').toLowerCase();
          const name = row['Submitter'] || row['name'] || 'Imported User';
          const branch = row['Branch'] || row['branch'] || 'HQ';
          const status = (row['Status'] || row['status'] || 'new').toLowerCase();
          const priority = row['Priority'] || row['priority'] || 'Medium';
          
          let dateVal = new Date();
          const rawDate = row['Date'] || row['date'] || row['createdAt'];
          if (rawDate) {
            if (rawDate instanceof Date && !isNaN(rawDate)) {
              dateVal = rawDate;
            } else {
              const parsed = new Date(rawDate);
              if (!isNaN(parsed)) {
                dateVal = parsed;
              } else if (typeof rawDate === 'string' && rawDate.includes('/')) {
                // Fallback for DD/MM/YYYY
                const parts = rawDate.split('/');
                if (parts.length >= 3) {
                  const d = parseInt(parts[0], 10);
                  const m = parseInt(parts[1], 10);
                  const y = parseInt(parts[2], 10);
                  dateVal = new Date(y, m - 1, d);
                }
              }
            }
          }
          
          batch.set(docRef, {
            ticketNumber,
            type,
            status,
            priority,
            userInfo: {
              name,
              branch,
              uid: 'imported'
            },
            content: {
              description: row['Description'] || row['description'] || 'Imported from previous portal.'
            },
            createdAt: dateVal,
            source: 'imported'
          });
          count++;
        });
        
        await batch.commit();
        alert(`Successfully imported ${count} requests.`);
      } catch (error) {
        console.error('Import error:', error);
        alert('Failed to import requests. Check console for details.');
      }
      
      // Reset the input so the same file can be imported again if needed
      e.target.value = null;
    };
    reader.readAsBinaryString(file);
  };

  const exportPDF = () => {
    const docPdf = new jsPDF();
    docPdf.text('FMAC Unified Console - Requests Report', 14, 15);
    const tableData = filteredRequests.map(r => [
      r.ticketNumber, r.type?.toUpperCase(), r.userInfo?.name, r.status?.toUpperCase(), r.priority, r.userInfo?.branch
    ]);
    autoTable(docPdf, {
      head: [['Ticket ID', 'Type', 'Submitter', 'Status', 'Priority', 'Branch']],
      body: tableData,
      startY: 25
    });
    docPdf.save(`FMAC_Requests_${new Date().toLocaleDateString()}.pdf`);
    setShowExport(false);
  };

  const statusLabel = (status) => {
    if (status === 'progress') return t('In Progress', 'قيد التنفيذ');
    if (status === 'new') return t('New', 'جديد');
    if (status === 'closed') return t('Closed', 'مغلق');
    return status;
  };

  if (!can('helpDesk', 'view')) {
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
    );
  }

  return (
    <div className="hc-admin-root" style={{ padding: '2rem 3rem', maxWidth: '1600px', margin: '0 auto' }}>

      {/* KPIs */}
      <div className="hc-admin-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
        {[
          { label: t('Total Requests', 'إجمالي الطلبات'), value: stats.total, color: 'var(--hc-text-primary)' },
          { label: t('New', 'جديد'), value: stats.new, color: '#3B82F6' },
          { label: t('In Progress', 'قيد التنفيذ'), value: stats.progress, color: 'var(--hc-warning)' },
          { label: t('Closed', 'مغلق'), value: stats.closed, color: 'var(--hc-success)' },
          { label: t('Overdue SLA', 'تجاوز الموعد'), value: stats.overdue, color: 'var(--hc-accent)' }
        ].map((kpi, i) => (
          <motion.div key={kpi.label} className="hc-card" style={{ padding: '1.5rem' }} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <p style={{ color: 'var(--hc-text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 600, margin: '0 0 0.5rem 0' }}>{kpi.label}</p>
            <h2 style={{ fontSize: '2rem', fontWeight: 800, margin: 0, color: kpi.color }}>{kpi.value}</h2>
          </motion.div>
        ))}
      </div>

      {/* Toolbar: Search + Export */}
      <div className="hc-admin-toolbar" style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
        <div className="hc-admin-search" style={{ position: 'relative', width: '280px' }}>
          <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--hc-text-muted)', pointerEvents: 'none' }} size={16} />
          <input
            type="text"
            className="hc-input"
            placeholder={t('Search tickets or names...', 'البحث في التذاكر أو الأسماء...')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ paddingLeft: '36px', borderRadius: '999px', padding: '0.5rem 1rem 0.5rem 36px' }}
          />
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', position: 'relative' }}>
          <input 
            type="file" 
            accept=".xlsx, .xls" 
            id="import-excel" 
            style={{ display: 'none' }} 
            onChange={handleImport}
          />
          <button className="hc-btn hc-btn-outline" onClick={() => document.getElementById('import-excel').click()}>
            <Upload size={15} /> {t('Import', 'استيراد')}
          </button>
          <button className="hc-btn hc-btn-outline" onClick={() => setShowExport(!showExport)}>
            <Download size={15} /> {t('Export', 'تصدير')} ▾
          </button>
          {showExport && (
            <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '0.4rem', background: 'var(--hc-bg-card)', border: '1px solid var(--hc-border)', borderRadius: 'var(--hc-radius-sm)', padding: '0.4rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', zIndex: 100, minWidth: '140px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)' }}>
              <button className="hc-btn hc-btn-ghost" style={{ justifyContent: 'flex-start', padding: '0.5rem 0.75rem', gap: '0.5rem' }} onClick={exportExcel}><FileSpreadsheet size={15} /> Excel</button>
              <button className="hc-btn hc-btn-ghost" style={{ justifyContent: 'flex-start', padding: '0.5rem 0.75rem', gap: '0.5rem' }} onClick={exportPDF}><FileText size={15} /> PDF</button>
            </div>
          )}
        </div>
      </div>

      {/* Tab Filters */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div className="luxury-tab-rail" style={{ marginBottom: 0 }}>
          {TABS.map(tab => {
            const Icon = tab.icon;
            const count = tab.id === 'all' ? requests.length : tab.id === 'escalated' ? requests.filter(r => r.assignedTo === 'hod' && r.status !== 'closed').length : requests.filter(r => r.type === tab.id).length;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`tab-item ${isActive ? 'active' : ''}`}
              >
                <Icon size={16} />
                {tab.label}
                <span className="count-badge">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Table */}
      <div className="hc-table-container">
        <table className="hc-table">
          <thead>
            <tr>
              <th>{t('Ticket ID', 'رقم التذكرة')}</th>
              <th>{t('Type', 'النوع')}</th>
              <th>{t('Submitter', 'مقدم الطلب')}</th>
              <th>{t('Branch', 'الفرع')}</th>
              <th>{t('Priority', 'الأولوية')}</th>
              <th>{t('Status', 'الحالة')}</th>
              <th>{t('Date', 'التاريخ')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: '3rem' }}>{t('Loading live data...', 'جارٍ تحميل البيانات...')}</td></tr>
            ) : filteredRequests.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: '3rem', color: 'var(--hc-text-muted)' }}>{t('No requests found.', 'لا توجد طلبات.')}</td></tr>
            ) : (
              filteredRequests.map(r => (
                <tr key={r.id} onClick={() => navigate('/help/requests/' + r.id)} style={{ cursor: 'pointer' }}>
                  <td style={{ fontWeight: 600, fontFamily: 'monospace' }}>
                    {r.ticketNumber}
                    {r.assignedTo === 'hod' && r.status !== 'closed' && (
                      <span style={{ marginLeft: '8px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.2)', color: '#f59e0b', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem' }}>↑ HOD</span>
                    )}
                  </td>
                  <td style={{ textTransform: 'capitalize' }}>{r.type}</td>
                  <td>{r.userInfo?.name}</td>
                  <td>{r.userInfo?.branch}</td>
                  <td>
                    <span style={{ color: r.priority === 'High' || r.priority === 'Emergency' ? 'var(--hc-accent)' : 'inherit', fontWeight: r.priority === 'High' ? 600 : 400 }}>
                      {r.priority}
                    </span>
                  </td>
                  <td>
                    <span className={`hc-badge ${r.status}`}>
                      {statusLabel(r.status)}
                    </span>
                  </td>
                  <td style={{ color: 'var(--hc-text-secondary)' }}>
                    {r.createdAt?.toDate ? r.createdAt.toDate().toLocaleDateString() : ''}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <ChevronRight size={18} color="var(--hc-text-muted)" />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Master Controls — visible to master admin only */}
      {isMasterAdmin && (
        <div style={{ marginTop: '3rem', padding: '1.5rem', border: '1px solid rgba(232, 0, 45, 0.2)', borderRadius: 'var(--hc-radius-md)', background: 'rgba(232, 0, 45, 0.02)' }}>
          <h4 style={{ margin: '0 0 1rem 0', color: 'var(--hc-accent)', fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('Master Controls', 'أدوات التحكم الرئيسية')}</h4>
          <button className="hc-btn hc-btn-accent" onClick={handleClearAll}>
            {t('Clear All System Requests', 'مسح جميع طلبات النظام')}
          </button>
        </div>
      )}

    </div>
  );
}
