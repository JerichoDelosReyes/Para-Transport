const fs = require('fs');

let content = fs.readFileSync('app/(tabs)/_layout.tsx', 'utf8');

// replace the height and bottom inset calculation
content = content.replace(
  /const height = 53 \+ insets\.bottom;/,
  `const bottomSpace = insets.bottom > 0 ? insets.bottom * 0.7 : 10;
  const height = 48 + bottomSpace;`
);

content = content.replace(
  /<View style={\[styles\.customTabBarContainer, \{ height: 50, paddingBottom: 6, marginBottom: bottomInset \}\]}>/,
  `const bottomSpace = insets.bottom > 0 ? insets.bottom * 0.7 : 10;
      <View style={[styles.customTabBarContainer, { height: 48, paddingBottom: 0, marginBottom: bottomSpace }]}>`
);

fs.writeFileSync('app/(tabs)/_layout.tsx', content);
