const fs = require('fs');
const file = 'app/(tabs)/index.tsx';
let code = fs.readFileSync(file, 'utf8');

// Find handleLocateUser and modify it
// Original logic should have some bounds checking.

code = code.replace(/const handleLocateUser = \(\) => \{([\s\S]*?)mapRef\.current\?\.animateToRegion\(newRegion, 1000\);\n\s*\};/, 
`const handleLocateUser = () => {
    if (userLocation) {
      if (
        userLocation.latitude < MAP_CONFIG.PHILIPPINES_BOUNDS.minLatitude ||
        userLocation.latitude > MAP_CONFIG.PHILIPPINES_BOUNDS.maxLatitude ||
        userLocation.longitude < MAP_CONFIG.PHILIPPINES_BOUNDS.minLongitude ||
        userLocation.longitude > MAP_CONFIG.PHILIPPINES_BOUNDS.maxLongitude
      ) {
        Alert.alert('Out of Range', 'The current location is out of the Philippines.');
        return;
      }
      $1mapRef.current?.animateToRegion(newRegion, 1000);
    }
  };`);
fs.writeFileSync(file, code);
