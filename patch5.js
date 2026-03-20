const fs = require('fs');
const file = 'app/(tabs)/index.tsx';
let code = fs.readFileSync(file, 'utf8');
code = code.replace(/const handleLocateUser = \(\) => \{([\s\S]*?)mapRef\.current\?\.animateToRegion\(next, 500\);\n\s*\} else \{/, 'const handleLocateUser = () => {
    if (currentLocation) {
      if (
        currentLocation.latitude < MAP_CONFIG.PHILIPPINES_BOUNDS.minLatitude ||
        currentLocation.latitude > MAP_CONFIG.PHILIPPINES_BOUNDS.maxLatitude ||
        currentLocation.longitude < MAP_CONFIG.PHILIPPINES_BOUNDS.minLongitude ||
        currentLocation.longitude > MAP_CONFIG.PHILIPPINES_BOUNDS.maxLongitude
      ) {
        Alert.alert(\'Out of Range\', \'Your current location is outside the Philippines.\');
        return;
      }
      const next: MapRegion = {
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };
      setMapRegion(next);
      mapRef.current?.animateToRegion(next, 500);
    } else {');
fs.writeFileSync(file, code);
