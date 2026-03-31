const fs = require('fs');
let content = fs.readFileSync('app/(tabs)/index.tsx', 'utf-8');

const regex = /const handleSearchSelectRoute = useCallback[\s\S]*?\/\/ Save this to commute history/m;

const replacement = `  const handleSearchSelectRoute = useCallback((origin: PlaceResult | null, destination: PlaceResult) => {
    setIsSearchActive(false);
    setDestinationQuery(destination.title);
    setDestinationName(destination.title);
    setOriginQuery(origin?.title || '');
    
    const destinationPoint: MapCoordinate = {
      latitude: destination.latitude,
      longitude: destination.longitude,
    };
    setDestinationLocation(destinationPoint);
    
    const startPoint = origin
      ? { latitude: origin.latitude, longitude: origin.longitude }
      : currentLocation;
      
    if (!startPoint) {
      mapRef.current?.animateToRegion({
        ...destinationPoint,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 600);
      return;
    }

    const results = findRoutesForDestination(
      startPoint,
      destinationPoint,
      transitRoutes,
    );

    setMatchedRoutes(results);
    setSelectedRoute(null);
    setShowRecommender(true);

    if (results.length > 0) {
      const allCoords = results.flatMap(m => m.legs.flatMap(l => l.route.coordinates));
      mapRef.current?.fitToCoordinates(allCoords, {
        edgePadding: { top: 160, right: 50, bottom: 300, left: 50 },
        animated: true,
      });
    }

    Keyboard.dismiss();
    
    // Save this to commute history`;

content = content.replace(regex, replacement);
fs.writeFileSync('app/(tabs)/index.tsx', content);
