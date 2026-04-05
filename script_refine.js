const fs = require('fs');

function refineBorders(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  content = content.replace(/borderColor:\s*'#EFEFEF'/g, "borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#EFEFEF'");
  content = content.replace(/borderColor:\s*'rgba\(0,0,0,0\.08\)'/g, "borderColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)'");
  content = content.replace(/borderColor:\s*'rgba\(0,0,0,0\.12\)'/g, "borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.12)'");

  fs.writeFileSync(filePath, content, 'utf8');
}

['app/login.tsx', 'app/register.tsx', 'app/index.tsx', 'components/OtpModal.tsx'].forEach(refineBorders);
