import re
import os

# 1. Update HelpLanding.jsx
file_path = r"c:\Users\mohdm\Desktop\Projects\FMAC Logistics Hub\src\components\help\public\HelpLanding.jsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace("navigate('/admin/login')", "navigate('/login')")
with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

# 2. Update HelpAdminDashboard.jsx
file_path = r"c:\Users\mohdm\Desktop\Projects\FMAC Logistics Hub\src\components\help\admin\HelpAdminDashboard.jsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

if "react-router-dom" not in content:
    content = content.replace("import React,", "import React,")
    content = re.sub(r"import React,[^\n]+", r"\g<0>\nimport { useNavigate } from 'react-router-dom';", content)

content = content.replace("export default function HelpAdminDashboard({ onNavigate, onLogout }) {", "export default function HelpAdminDashboard() {")
if "const navigate = useNavigate();" not in content:
    content = content.replace("export default function HelpAdminDashboard() {", "export default function HelpAdminDashboard() {\n  const navigate = useNavigate();")

content = content.replace("onClick={() => onNavigate('admin-ticket', { ticketId: r.id })}", "onClick={() => navigate('/help/requests/' + r.id)}")

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

# 3. Update HelpAdminTicket.jsx
file_path = r"c:\Users\mohdm\Desktop\Projects\FMAC Logistics Hub\src\components\help\admin\HelpAdminTicket.jsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

if "react-router-dom" not in content:
    content = re.sub(r"import React,[^\n]+", r"\g<0>\nimport { useNavigate, useParams } from 'react-router-dom';", content)

content = content.replace("export default function HelpAdminTicket({ ticketId, onNavigate }) {", "export default function HelpAdminTicket() {")
if "const { ticketId } = useParams();" not in content:
    content = content.replace("export default function HelpAdminTicket() {", "export default function HelpAdminTicket() {\n  const { ticketId } = useParams();\n  const navigate = useNavigate();")

content = content.replace("onNavigate('admin-dashboard')", "navigate('/help')")

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

# 4. Update App.jsx
file_path = r"c:\Users\mohdm\Desktop\Projects\FMAC Logistics Hub\src\App.jsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Remove HelpAdminLogin import
content = re.sub(r"import HelpAdminLogin[^\n]+\n", "", content)

# Remove HelpAdminGuard definition
content = re.sub(r"const HelpAdminGuard = \(\{ children \}\) => \{[^\}]+\}\n", "", content)

# Replace Route blocks
routes_block = """
  return (
    <Routes>
      {/* PUBLIC ROUTES (no sidebar, no auth) */}
      <Route path="/" element={<HelpLanding />} />
      <Route path="/submit/:type" element={<HelpFormWizard />} />
      <Route path="/submit/success/:ticketId" element={<HelpSuccess />} />

      {/* MAIN APP ROUTES */}
      <Route path="/login" element={<LoginPage onLogin={handleLogin} />} />
      
      <Route element={<MainAuthGuard><MainAppLayout /></MainAuthGuard>}>
        <Route path="/dashboard" element={<OperationsDashboard userProfile={userProfile} />} />
        <Route path="/logistics/*" element={<LogisticsModule />} />
        <Route path="/fleet/*" element={<FleetModule />} />
        <Route path="/inventory/*" element={<InventoryModule />} />
        <Route path="/reports/*" element={<ReportsModule user={user} userProfile={userProfile} />} />
        <Route path="/users/*" element={<UserManagementModule />} />
        <Route path="/profile/*" element={<ProfileModule user={user} userProfile={userProfile} onUpdateProfile={setUserProfile} />} />
        
        {/* Help Center Admin injected into Main App Layout */}
        <Route path="/help" element={<HelpAdminDashboard />} />
        <Route path="/help/requests/:ticketId" element={<HelpAdminTicket />} />
      </Route>

      {/* CATCH ALL */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
"""
# Assuming the routes block starts at return ( <Routes>
content = re.sub(r"return \(\s*<Routes>.*?</Routes>\s*\)", routes_block.strip(), content, flags=re.DOTALL)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
