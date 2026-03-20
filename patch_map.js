const fs = require('fs');
const file = 'app/(tabs)/index.tsx';
let code = fs.readFileSync(file, 'utf8');

// replace mapType="none" with mapType="standard"
code = code.replace('mapType="none"', 'mapType="standard"');

// remove UrlTile block completely
code = code.replace(/<UrlTile[\s\S]*?shouldReplaceMapContent={true}\s*\/>/, '');

fs.writeFileSync(file, code);
