import os
import re

# 1. HelpLanding.jsx
file_path = r"c:\Users\mohdm\Desktop\Projects\FMAC Logistics Hub\src\components\help\public\HelpLanding.jsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace("export default function HelpLanding({ onNavigate }) {", "import { useNavigate } from 'react-router-dom';\n\nexport default function HelpLanding() {")
content = content.replace("export default function HelpLanding() {", "import { useNavigate } from 'react-router-dom';\n\nexport default function HelpLanding() {")
# Avoid double importing if run multiple times
if content.count("import { useNavigate } from 'react-router-dom';") > 1:
    content = content.replace("import { useNavigate } from 'react-router-dom';\n\nimport { useNavigate } from 'react-router-dom';\n\n", "import { useNavigate } from 'react-router-dom';\n\n")

if "const navigate = useNavigate();" not in content:
    content = content.replace("export default function HelpLanding() {", "export default function HelpLanding() {\n  const navigate = useNavigate();")

content = content.replace("onNavigate('admin-login')", "navigate('/admin/login')")
content = content.replace("onNavigate('submit', { type: service.id })", "navigate(`/submit/${service.id}?step=1`)")

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

# 2. HelpAdminLogin.jsx
file_path = r"c:\Users\mohdm\Desktop\Projects\FMAC Logistics Hub\src\components\help\admin\HelpAdminLogin.jsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace("export default function HelpAdminLogin({ onLogin, onNavigate }) {", "import { useNavigate } from 'react-router-dom';\n\nexport default function HelpAdminLogin({ onLogin }) {")
content = content.replace("export default function HelpAdminLogin({ onLogin }) {", "import { useNavigate } from 'react-router-dom';\n\nexport default function HelpAdminLogin({ onLogin }) {")
if content.count("import { useNavigate } from 'react-router-dom';") > 1:
    content = content.replace("import { useNavigate } from 'react-router-dom';\n\nimport { useNavigate } from 'react-router-dom';\n\n", "import { useNavigate } from 'react-router-dom';\n\n")

if "const navigate = useNavigate();" not in content:
    content = content.replace("export default function HelpAdminLogin({ onLogin }) {\n  const { t, lang } = useLanguage();", "export default function HelpAdminLogin({ onLogin }) {\n  const { t, lang } = useLanguage();\n  const navigate = useNavigate();")

content = content.replace("onNavigate('admin-dashboard');", "navigate('/admin/dashboard');")
content = content.replace("onNavigate('landing');", "navigate('/');")

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

# 3. HelpFormWizard.jsx
file_path = r"c:\Users\mohdm\Desktop\Projects\FMAC Logistics Hub\src\components\help\public\HelpFormWizard.jsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

if "react-router-dom" not in content:
    content = content.replace("import { useLanguage } from '../../../contexts/LanguageContext';", "import { useLanguage } from '../../../contexts/LanguageContext';\nimport { useSearchParams, useNavigate, useParams } from 'react-router-dom';")

content = content.replace("export default function HelpFormWizard({ type, onNavigate }) {", "export default function HelpFormWizard() {")
if "const { type } = useParams();" not in content:
    content = content.replace("export default function HelpFormWizard() {", "export default function HelpFormWizard() {\n  const { type } = useParams();")

if "const [searchParams, setSearchParams] = useSearchParams();" not in content:
    content = content.replace("export default function HelpFormWizard() {\n  const { type } = useParams();", "export default function HelpFormWizard() {\n  const { type } = useParams();\n  const [searchParams, setSearchParams] = useSearchParams();\n  const currentStep = parseInt(searchParams.get('step') || '1');\n  const navigate = useNavigate();")

content = content.replace("const [currentStep, setCurrentStep] = useState(1);", "")
content = content.replace("setCurrentStep(currentStep + 1);", "setSearchParams({ step: currentStep + 1 });")
content = content.replace("setCurrentStep(currentStep - 1);", "setSearchParams({ step: currentStep - 1 });")
content = content.replace("onNavigate('landing');", "navigate('/');")
content = content.replace("onNavigate('success', { ticketId });", "navigate(`/submit/success/${ticketId}`);")

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

# 4. HelpSuccess.jsx
file_path = r"c:\Users\mohdm\Desktop\Projects\FMAC Logistics Hub\src\components\help\public\HelpSuccess.jsx"
if os.path.exists(file_path):
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    if "react-router-dom" not in content:
        content = content.replace("import { useLanguage } from '../../../contexts/LanguageContext';", "import { useLanguage } from '../../../contexts/LanguageContext';\nimport { useNavigate, useParams } from 'react-router-dom';")

    content = content.replace("export default function HelpSuccess({ ticketId, onNavigate }) {", "export default function HelpSuccess() {")
    content = content.replace("const ticketNumber = ticketId;", "const { ticketNumber } = useParams();\n  const navigate = useNavigate();")
    content = content.replace("onNavigate('landing')", "navigate('/')")

    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)
