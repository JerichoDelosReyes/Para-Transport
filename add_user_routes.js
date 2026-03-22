const fs = require('fs');

let content = fs.readFileSync('app/(tabs)/routes.tsx', 'utf8');

if (!content.includes('const user = useStore')) {
  content = content.replace(
    '  const setSelectedTransitRoute = useStore((state) => state.setSelectedTransitRoute);',
    '  const setSelectedTransitRoute = useStore((state) => state.setSelectedTransitRoute);\n  const user = useStore((state) => state.user);'
  );
  fs.writeFileSync('app/(tabs)/routes.tsx', content, 'utf8');
}
