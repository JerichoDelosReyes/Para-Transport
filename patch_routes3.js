const fs = require('fs');
let code = fs.readFileSync('app/(tabs)/routes.tsx', 'utf8');

code = code.replace(
  "legs: [{ mode: 'Custom Route', from: item.origin || null, to: item.destination }]",
  "legs: [{ mode: 'Custom Route', from: item.origin?.name || 'Current Location', to: item.destination?.name || 'Unknown', fromObj: item.origin || null, toObj: item.destination }]"
);

fs.writeFileSync('app/(tabs)/routes.tsx', code, 'utf8');
console.log('patched routes.tsx');
