const fs = require('fs');
const file = 'app/(tabs)/index.tsx';
let code = fs.readFileSync(file, 'utf-8');

const regex = /\/\/ Record trip stats when simulation finishes \(once per run\)\n\s*useEffect\(\(\) => \{\n\s*if \(sim\.state === 'idle'\) \{\n[\s\S]*?\/\/ eslint-disable-next-line react-hooks\/exhaustive-deps\n\s*\}, \[sim\.state\]\);/g;

if (code.match(regex)) {
  code = code.replace(regex, '');
  fs.writeFileSync(file, code);
  console.log('Stripped legacy sim hook');
} else {
  console.log('Could not find legacy hook');
}
