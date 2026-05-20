import re

file_path = r"c:\Users\mohdm\Desktop\Projects\FMAC Logistics Hub\src\components\LoginPage.jsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

if "react-router-dom" not in content:
    content = content.replace("import { ArrowLeft } from 'lucide-react';", "import { ArrowLeft } from 'lucide-react';\nimport { useNavigate } from 'react-router-dom';")

if "const navigate = useNavigate();" not in content:
    content = content.replace("export default function LoginPage({ onLogin, onSignUp }) {", "export default function LoginPage({ onLogin, onSignUp }) {\n  const navigate = useNavigate();")

if "navigate('/dashboard');" not in content:
    content = content.replace("await onLogin(username, password);", "await onLogin(username, password);\n      navigate('/dashboard');")

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
