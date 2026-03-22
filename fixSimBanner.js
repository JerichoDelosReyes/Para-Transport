const fs = require('fs');
const path = 'app/(tabs)/index.tsx';
let it = fs.readFileSync(path, 'utf8');

const sIdx = it.indexOf('{/* Simulation segment info banner */}');
const eIdx = it.indexOf('{/* Route Recommender Panel */}');

if(sIdx > 0 && eIdx > 0) {
  fs.writeFileSync(path, it.substring(0, sIdx) + it.substring(eIdx));
  console.log('Removed simBanner!');
} else {
  console.log('Could not find tags.');
}