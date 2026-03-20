const fs = require('fs');

let content = fs.readFileSync('app/(tabs)/_layout.tsx', 'utf8');

if (!content.includes('if (options.href === null) return null;')) {
    content = content.replace(
        'const { options } = descriptors[route.key];',
        'const { options } = descriptors[route.key];\n            if (options.href === null) return null;'
    );
}

if (!content.includes('const user = useStore')) {
    content = content.replace(
        'export default function TabLayout() {',
        'export default function TabLayout() {\n  const user = useStore((state) => state.user);'
    );
}

if (!content.includes('href: user?.isGuest ? null : undefined')) {
    content = content.replace(
        "title: 'Saved',",
        "title: 'Saved',\n          href: user?.isGuest ? null : undefined,"
    );
}

fs.writeFileSync('app/(tabs)/_layout.tsx', content);
