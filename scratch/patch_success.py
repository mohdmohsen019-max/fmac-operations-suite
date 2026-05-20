import re

file_path = r"c:\Users\mohdm\Desktop\Projects\FMAC Logistics Hub\src\components\help\public\HelpSuccess.jsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace("import { useNavigate, useParams } from 'react-router-dom';", "")
content = content.replace("export default function HelpSuccess() {", "export default function HelpSuccess({ ticketId, onNavigate }) {")
content = content.replace("const { ticketNumber } = useParams();", "const ticketNumber = ticketId;")
content = content.replace("const navigate = useNavigate();", "")
content = content.replace("onClick={() => navigate('/')}", "onClick={() => onNavigate('landing')}")

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
