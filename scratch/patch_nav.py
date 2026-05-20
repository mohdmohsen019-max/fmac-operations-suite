import re

# 1. HelpLanding.jsx
file_path = r"c:\Users\mohdm\Desktop\Projects\FMAC Logistics Hub\src\components\help\public\HelpLanding.jsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace("import { useNavigate } from 'react-router-dom';", "")
content = content.replace("export default function HelpLanding() {", "export default function HelpLanding({ onNavigate }) {")
content = content.replace("const navigate = useNavigate();", "")
content = content.replace("navigate('/admin/login')", "onNavigate('admin-login')")
content = content.replace("navigate(`/submit/${service.id}?step=1`)", "onNavigate('submit', { type: service.id })")

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

# 2. HelpAdminLogin.jsx
file_path = r"c:\Users\mohdm\Desktop\Projects\FMAC Logistics Hub\src\components\help\admin\HelpAdminLogin.jsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace("import { useNavigate } from 'react-router-dom';", "")
content = content.replace("export default function HelpAdminLogin({ onLogin }) {", "export default function HelpAdminLogin({ onLogin, onNavigate }) {")
content = content.replace("const navigate = useNavigate();", "")
content = content.replace("navigate('/admin/dashboard');", "onNavigate('admin-dashboard');")
content = content.replace("navigate('/');", "onNavigate('landing');")

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

# 3. HelpFormWizard.jsx
file_path = r"c:\Users\mohdm\Desktop\Projects\FMAC Logistics Hub\src\components\help\public\HelpFormWizard.jsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace("import { useSearchParams, useNavigate, useParams } from 'react-router-dom';", "")
content = content.replace("export default function HelpFormWizard() {", "export default function HelpFormWizard({ type, onNavigate }) {")
content = content.replace("const { type } = useParams();", "")
content = content.replace("const [searchParams, setSearchParams] = useSearchParams();", "")
content = content.replace("const currentStep = parseInt(searchParams.get('step') || '1');", "const [currentStep, setCurrentStep] = useState(1);")
content = content.replace("const navigate = useNavigate();", "")
content = content.replace("setSearchParams({ step: currentStep + 1 });", "setCurrentStep(currentStep + 1);")
content = content.replace("setSearchParams({ step: currentStep - 1 });", "setCurrentStep(currentStep - 1);")
content = content.replace("navigate('/');", "onNavigate('landing');")
content = content.replace("navigate(`/submit/success/${ticketId}`);", "onNavigate('success', { ticketId });")

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
