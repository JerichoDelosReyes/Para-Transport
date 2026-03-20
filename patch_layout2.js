const fs = require('fs');

let content = fs.readFileSync('app/(tabs)/_layout.tsx', 'utf8');

content = content.replace(
    'href: user?.isGuest ? null : undefined,',
    'href: sessionMode === \'guest\' ? null : undefined,'
);

if (!content.includes('const sessionMode = useStore((state) => state.sessionMode);')) {
    content = content.replace(
        'export default function TabLayout() {\n  const user = useStore',
        'export default function TabLayout() {\n  const sessionMode = useStore((state) => state.sessionMode);\n  const user = useStore'
    );
}

fs.writeFileSync('app/(tabs)/_layout.tsx', content);
