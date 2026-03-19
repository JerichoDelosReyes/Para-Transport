var fs = require('fs'); var content = fs.readFileSync('app/(tabs)/_layout.tsx', 'utf8'); content = content.replace(/notchWidth = 72;/g, 'notchWidth = 104;'); content = content.replace(/depth = 24;/g, 'depth = 36;'); content = content.replace(/<Ionicons name={focused \? \'home\' : \'home-outline\'} size={28} color=\"#FFFFFF\" \/>/g, '<Ionicons name={focused ? \'home\' : \'home-outline\'} size={36} color="#FFFFFF" />'); content = content.replace(/bottom: 42/g, 'bottom: 18'); content = content.replace(/homeButtonContainer: {
    width: 60,
    height: 60,/g, 'homeButtonContainer: {
    width: 76,
    height: 76,'); content = content.replace(/liquidRing: {
    position: \'absolute\',
    width: 68,
    height: 68,
    borderRadius: 34,/g, 'liquidRing: {
    position: \'absolute\',
    width: 72,
    height: 72,
    borderRadius: 36,'); content = content.replace(/homeButtonBase: {
    width: 56,
    height: 56,
    borderRadius: 28,/g, 'homeButtonBase: {
    width: 72,
    height: 72,
    borderRadius: 36,'); fs.writeFileSync('app/(tabs)/_layout.tsx', content);
