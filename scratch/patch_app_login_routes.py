import re

file_path = r"c:\Users\mohdm\Desktop\Projects\FMAC Logistics Hub\src\App.jsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Replace the login route logic
content = content.replace(
    '<Route path="/admin/login" element={user ? <Navigate to="/admin/dashboard" replace /> : <HelpAdminLogin onLogin={handleLogin} />} />',
    '<Route path="/admin/login" element={<HelpAdminLogin onLogin={handleLogin} />} />'
)

content = content.replace(
    '<Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <LoginPage onLogin={handleLogin} />} />',
    '<Route path="/login" element={<LoginPage onLogin={handleLogin} />} />'
)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
