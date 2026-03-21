const fs = require('fs');
let content = fs.readFileSync('app/(tabs)/_layout.tsx', 'utf8');
content = content.replace(/<Ionicons name={focused \? 'home' : 'home-outline'} size={22}/, '<Ionicons name={focused ? \'home\' : \'home-outline\'} size={28}');
content = content.replace(/<Ionicons name={isHistoryFocused \? 'map' : 'map-outline'} size={20}/, '<Ionicons name={isHistoryFocused ? \'map\' : \'map-outline\'} size={24}');
content = content.replace(/<Ionicons name={iconName as any} size={20}/, '<Ionicons name={iconName as any} size={24}');
content = content.replace(/const bottomSpace = insets.bottom > 0 \? insets.bottom \* 0.4 : 10;/g, 'const bottomSpace = insets.bottom > 0 ? insets.bottom * 0.5 : 14;');
content = content.replace(/width: 48,
    height: 48/, 'width: 60,
    height: 60');
content = content.replace(/width: 44,
    height: 44,
    borderRadius: 22/, 'width: 56,
    height: 56,
    borderRadius: 28');
content = content.replace(`
    M 0,0 
    L \${cx - 45},0
    C \${cx - 32},0 \${cx - 34},36 \${cx},36
    C \${cx + 34},36 \${cx + 32},0 \${cx + 45},0
    L \${width},0
    L \${width},\${height}
    L 0,\${height}
    Z
  `, `
    M 0,0 
    L \${cx - 52},0
    C \${cx - 36},0 \${cx - 38},44 \${cx},44
    C \${cx + 38},44 \${cx + 36},0 \${cx + 52},0
    L \${width},0
    L \${width},\${height}
    L 0,\${height}
    Z
  `);
fs.writeFileSync('app/(tabs)/_layout.tsx', content);
