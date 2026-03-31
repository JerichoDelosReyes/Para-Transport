const fs = require('fs');
let content = fs.readFileSync('app/(tabs)/index.tsx', 'utf-8');

const regex = /const handleSearchSelectRoute = useCallback[\s\S]*?\}, \[currentLocation, transitRoutes\]\);/m;

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

    try {
      setIsRouting(true);
      const results = findRoutesForDestination(
        startPoint,
        destinationPoint,
        transitRoutes as any[],
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
      } else {
        mapRef.current?.animateToRegion({
          ...destinationPoint,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }, 600);
      }

      Keyboard.dismiss();
      
      const h_origin = origin ? { name: origin.title, lat: origin.latitude, lon: origin.longitude } : null;
      const initialFare = results.length > 0 ? (results[0].totalFare || 0) : 0;
      addHistory({
        id: Date.now().toString(),
        origin: h_origin,
        destination: { name: destination.title, lat: destination.latitude, lon: destination.longitude },
        fare: initialFare,
        timestamp: Date.now(),
      });
      
    } catch (error) {
      console.warn('[HomeScreen] Route search failed:', error);
      Alert.alert('Search Failed', 'Unable to fetch route right now. Please try again.');
    } finally {
      setIsRouting(false);
    }
  }, [currentLocation, transitRoutes, addHistory]);`;

content = content.replace(regex, replacement);
fs.writeFileSync('app/(tabs)/index.tsx', content);
