const { execSync } = require('child_process');
const fs = require('fs');
const out = execSync('git show merging:app/(tabs)/index.tsx').toString();
fs.writeFileSync('merging_index.tsx', out);
