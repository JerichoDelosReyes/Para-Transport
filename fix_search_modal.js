const fs = require('fs');
const file = 'components/SearchScreen.tsx';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(/container: \{\n\s*\.\.\.StyleSheet\.absoluteFillObject,\n\s*backgroundColor: COLORS\.background,\n\s*zIndex: 100,\n\s*\}/, 
\`container: {
    flex: 1,
    backgroundColor: COLORS.background,
  }\`);
fs.writeFileSync(file, code);
