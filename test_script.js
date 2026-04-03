const { readFileSync } = require('fs');
const content = readFileSync('app/(tabs)/index.tsx', 'utf8');
const calculateDistanceMatches = content.match(/calculateDistance\(/g);
console.log(calculateDistanceMatches);
