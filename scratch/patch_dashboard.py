import re
import os

target_file = r"c:\Users\mohdm\Desktop\Projects\FMAC Logistics Hub\src\components\help\admin\HelpAdminDashboard.jsx"

with open(target_file, "r", encoding="utf-8") as f:
    code = f.read()

# 1. TABS Update
old_tabs = """  const TABS = [
    { id: 'all', label: t('All Requests', 'جميع الطلبات'), icon: LayoutDashboard },
    { id: 'inquiry', label: t('Inquiries', 'الاستفسارات'), icon: Inbox },
    { id: 'complaint', label: t('Complaints', 'الشكاوى'), icon: AlertCircle },
    { id: 'suggestion', label: t('Suggestions', 'المقترحات'), icon: Lightbulb },
    { id: 'meeting', label: t('Meetings', 'الاجتماعات'), icon: Users },
    { id: 'call', label: t('Calls', 'المكالمات'), icon: Phone },
    { id: 'maintenance', label: t('Maintenance', 'الصيانة'), icon: Wrench }
  ];"""

new_tabs = """  const TABS = [
    { id: 'all', label: t('All Requests', 'جميع الطلبات'), icon: LayoutDashboard },
    { id: 'escalated', label: t('Escalated', 'مُصعَّد'), icon: AlertCircle },
    { id: 'inquiry', label: t('Inquiries', 'الاستفسارات'), icon: Inbox },
    { id: 'complaint', label: t('Complaints', 'الشكاوى'), icon: AlertCircle },
    { id: 'suggestion', label: t('Suggestions', 'المقترحات'), icon: Lightbulb },
    { id: 'meeting', label: t('Meetings', 'الاجتماعات'), icon: Users },
    { id: 'call', label: t('Calls', 'المكالمات'), icon: Phone },
    { id: 'maintenance', label: t('Maintenance', 'الصيانة'), icon: Wrench }
  ];"""

code = code.replace(old_tabs, new_tabs)

# 2. Filter Update
old_filter = """  const filteredRequests = requests.filter(r => {
    const matchesTab = activeTab === 'all' || r.type === activeTab;
    const matchesSearch = r.ticketNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          r.userInfo?.name?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesTab && matchesSearch;
  });"""

new_filter = """  const filteredRequests = requests.filter(r => {
    let matchesTab = false;
    if (activeTab === 'all') matchesTab = true;
    else if (activeTab === 'escalated') matchesTab = r.assignedTo === 'hod' && r.status !== 'closed';
    else matchesTab = r.type === activeTab;

    const matchesSearch = r.ticketNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          r.userInfo?.name?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesTab && matchesSearch;
  });"""

code = code.replace(old_filter, new_filter)

# 3. Tab Rendering Update
old_count = "const count = tab.id === 'all' ? requests.length : requests.filter(r => r.type === tab.id).length;"
new_count = "const count = tab.id === 'all' ? requests.length : tab.id === 'escalated' ? requests.filter(r => r.assignedTo === 'hod' && r.status !== 'closed').length : requests.filter(r => r.type === tab.id).length;"
code = code.replace(old_count, new_count)

# 4. Table UI Update
old_td = "<td style={{ fontWeight: 600, fontFamily: 'monospace' }}>{r.ticketNumber}</td>"
new_td = """<td style={{ fontWeight: 600, fontFamily: 'monospace' }}>
                    {r.ticketNumber}
                    {r.assignedTo === 'hod' && r.status !== 'closed' && (
                      <span style={{ marginLeft: '8px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.2)', color: '#f59e0b', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem' }}>↑ HOD</span>
                    )}
                  </td>"""

code = code.replace(old_td, new_td)

with open(target_file, "w", encoding="utf-8") as f:
    f.write(code)
