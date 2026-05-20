import re
import os

# 1. Update index.html
html_path = r"c:\Users\mohdm\Desktop\Projects\FMAC Logistics Hub\index.html"
with open(html_path, "r", encoding="utf-8") as f:
    content = f.read()

if "Tajawal" not in content:
    content = content.replace("https://fonts.googleapis.com/css2?", "https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;800&")
    with open(html_path, "w", encoding="utf-8") as f:
        f.write(content)

# 2. Update LoginPage.css for Tajawal and heading styles
css_path = r"c:\Users\mohdm\Desktop\Projects\FMAC Logistics Hub\src\LoginPage.css"
if os.path.exists(css_path):
    with open(css_path, "r", encoding="utf-8") as f:
        content = f.read()
    
    content = content.replace("'Noto Naskh Arabic'", "'Tajawal'")
    
    # Check if .login-heading-ar exists and update it
    if ".login-heading-ar" in content:
        content = re.sub(r"\.login-heading-ar\s*{[^}]*}", 
                         ".login-heading-ar {\n  font-family: 'Tajawal', sans-serif;\n  font-weight: 800;\n  font-size: 32px;\n  color: var(--text-primary);\n  margin-bottom: 4px;\n}", 
                         content)
    
    with open(css_path, "w", encoding="utf-8") as f:
        f.write(content)
