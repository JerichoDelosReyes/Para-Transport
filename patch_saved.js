const fs = require('fs');
let code = fs.readFileSync('app/(tabs)/saved.tsx', 'utf8');

code = code.replace(
  "const origin = selectedRoute.legs[0].from;",
  "const origin = selectedRoute.legs[0].fromObj || selectedRoute.legs[0].from;"
);
code = code.replace(
  "const destination = selectedRoute.legs[0].to;",
  "const destination = selectedRoute.legs[0].toObj || selectedRoute.legs[0].to;"
);

fs.writeFileSync('app/(tabs)/saved.tsx', code, 'utf8');
console.log('patched saved.tsx');
