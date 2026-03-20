const fs = require('fs');
const file = 'components/SearchScreen.tsx';
let code = fs.readFileSync(file, 'utf8');

const newStyles = `  currentLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: SPACING.screenX,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(10,22,40,0.06)',
  },
  resultRow: {`;

code = code.replace('  resultRow: {', newStyles);

fs.writeFileSync(file, code);
