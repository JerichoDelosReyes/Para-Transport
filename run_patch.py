import re

with open('app/(tabs)/index.tsx', 'r') as f:
    text = f.read()

# 1. Imports
text = text.replace(
    "import RouteRecommenderPanel, { RouteRecommenderOption } from '../../components/RouteRecommenderPanel';",
    "import RouteRecommenderPanel from '../../components/RouteRecommenderPanel';\nimport { findRoutesForDestination, rankRoutes, MatchedRoute, RankMode } from '../../services/routeSearch';"
)
text = text.replace("import useJeepneyRoutes from '../../hooks/useJeepneyRoutes';", "import useRoutes from '../../hooks/useRoutes';")

# 2. Deleting unused legacy functions
start_idx = text.find('const isWalkOnlyCandidate = (candidate: RecommenderCandidate): boolean => {')
end_idx = text.find('export default function HomeScreen() {')
if start_idx != -1 and end_idx != -1:
    text = text[:start_idx] + text[end_idx:]

# 3. Replacing states
old_states = '''  const [recommenderCandidates, setRecommenderCandidates] = useState<RecommenderCandidate[]>([]);
  const [recommenderOptions, setRecommenderOptions] = useState<RouteRecommenderOption[]>([]);
  const [selectedRecommenderOptionId, setSelectedRecommenderOptionId] = useState<string | null>(null);
  const [selectedRouteLegs, setSelectedRouteLegs] = useState<TransitLeg[]>([]);
  const [mapRegion, setMapRegion] = useState<MapRegion>(INITIAL_REGION);
  const { routes: jeepneyRoutes } = useJeepneyRoutes();
  const { routes: tricycleRoutes } = useTricycleRoutes();
  const transitRoutes = useMemo(() => [...jeepneyRoutes, ...tricycleRoutes], [jeepneyRoutes, tricycleRoutes]);'''

new_states = '''  const [matchedRoutes, setMatchedRoutes] = useState<MatchedRoute[]>([]);
  const [rankTab, setRankTab] = useState<RankMode>('easiest');
  const [rankedRoutes, setRankedRoutes] = useState<MatchedRoute[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<MatchedRoute | null>(null);
  const [mapRegion, setMapRegion] = useState<MapRegion>(INITIAL_REGION);
  const { routes: transitRoutes } = useRoutes();

  useEffect(() => {
    setRankedRoutes(rankRoutes(matchedRoutes, rankTab));
  }, [matchedRoutes, rankTab]);

  useEffect(() => {
    setSelectedRoute(matchedRoutes.find(m => m.legs.map((l: any) => l.route.properties.code).join('+') === selectedRouteId) || null);
  }, [selectedRouteId, matchedRoutes]);'''
text = text.replace(old_states, new_states)

# 4. transitLegs / routeCoordinates
old_legs = '''  // Compute an array of coordinates tracking all drawn components
  useEffect(() => {
    if (selectedRouteLegs.length === 0) return;
    const combined: MapCoordinate[] = [];
    selectedRouteLegs.forEach((leg) => {
      combined.push(...leg.waypoints);
      if (leg.walkPathToNext) {
        combined.push(...leg.walkPathToNext);
      }
    });

    const unique = combined.filter(
      (pt, idx) =>
        idx === 0 || !(pt.latitude === combined[idx - 1].latitude && pt.longitude === combined[idx - 1].longitude)
    );
    setRouteCoordinates(unique);
  }, [selectedRouteLegs]);'''
text = text.replace(old_legs, '')

old_use_effect_routes = '''  useEffect(() => {
    if (!selectedTransitRoute?.coordinates?.length) return;

    const allCoords = selectedTransitRoute.coordinates;
    if (allCoords.length > 1) {
      setRouteCoordinates([]);
      setDestinationLocation(null);
      setRouteSummary(null);
      setRecommenderCandidates([]);
      setRecommenderOptions([]);
      setSelectedRecommenderOptionId(null);
      setSelectedRouteLegs([]);

      mapRef.current?.fitToCoordinates(allCoords, {
        edgePadding: { top: 140, right: 40, bottom: 220, left: 40 },
        animated: true,
      });
    }
  }, [selectedTransitRoute]);'''
text = text.replace(old_use_effect_routes, '')

old_handle_clear = '''  const handleClearRoute = useCallback((clearOrigin = true, clearDestination = true) => {
    if (clearDestination) setDestinationQuery('');
    if (clearOrigin) setOriginQuery('');
    setDestinationLocation(null);
    setRouteCoordinates([]);
    setRouteSummary(null);
    setRecommenderCandidates([]);
    setRecommenderOptions([]);
    setSelectedRecommenderOptionId(null);
    setSelectedRouteLegs([]);
    setPendingRouteSearch(null);
    setSelectedTransitRoute(null);
  }, [setPendingRouteSearch, setSelectedTransitRoute]);'''

new_handle_clear = '''  const handleClearRoute = useCallback((clearOrigin = true, clearDestination = true) => {
    if (clearDestination) setDestinationQuery('');
    if (clearOrigin) setOriginQuery('');
    setDestinationLocation(null);
    setMatchedRoutes([]);
    setSelectedRouteId(null);
    setPendingRouteSearch(null);
    setSelectedTransitRoute(null);
  }, [setPendingRouteSearch, setSelectedTransitRoute]);'''
text = text.replace(old_handle_clear, new_handle_clear)

old_handle_select = '''  const handleSelectRecommenderOption = useCallback((optionId: string) => {
    const chosen = recommenderCandidates.find((c) => c.id === optionId);
    if (!chosen) return;

    if (chosen.metrics?.farePhp) {
      updateLatestHistoryFare(chosen.metrics.farePhp);
    }

    setSelectedRecommenderOptionId(optionId);
    setRouteCoordinates(chosen.coordinates);
    setRouteSummary(chosen.summary);
    setSelectedRouteLegs(chosen.legs);

    mapRef.current?.fitToCoordinates(chosen.coordinates, {
      edgePadding: { top: 120, right: 40, bottom: 220, left: 40 },
      animated: true,
    });
  }, [recommenderCandidates]);'''
text = text.replace(old_handle_select, '')

# Search handler
start_search = text.find('  const handleSearchSelectRoute = useCallback(async (origin: PlaceResult | null, destination: PlaceResult) => {')
end_search = text.find('}, [currentLocation, transitRoutes]);')
if start_search != -1 and end_search != -1:
    new_search = '''  const handleSearchSelectRoute = useCallback((origin: PlaceResult | null, destination: PlaceResult) => {
    setIsSearchActive(false);
    setDestinationQuery(destination.title);
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
      mapRef.current?.animateToRegion({...destinationPoint, latitudeDelta: 0.01, longitudeDelta: 0.01}, 600);
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
      setSelectedRouteId(null);
      setShowRecommender(true);

      if (results.length > 0) {
        const allCoords = results.flatMap(m => m.legs.flatMap((l: any) => l.route.coordinates));
        mapRef.current?.fitToCoordinates(allCoords, {
          edgePadding: { top: 160, right: 50, bottom: 300, left: 50 },
          animated: true,
        });
      } else {
        mapRef.current?.animateToRegion({...destinationPoint, latitudeDelta: 0.01, longitudeDelta: 0.01}, 600);
      }

      Keyboard.dismiss();
      
      const h_origin = origin ? { name: origin.title, lat: origin.latitude, lon: origin.longitude } : null;
      const initialFare = results.length > 0 ? (results[0].estimatedFare || 0) : 0;
      addHistory({
        id: Date.now().toString(),
        origin: h_origin,
        destination: { name: destination.title, lat: destination.latitude, lon: destination.longitude },
        fare: initialFare,
        timestamp: Date.now(),
      });
      
    } catch (error) {
      console.warn('[HomeScreen] Route search failed:', error);
    } finally {
      setIsRouting(false);
    }
  '''
    text = text[:start_search] + new_search + text[end_search:]

# Build dynamically
# Replace selectedRouteLegs rendering
start_memo = text.find('  const displayLegs = useMemo(() => {')
end_memo = text.find('  const transitLegs = useMemo((): TransitLeg[] => {')
if start_memo != -1 and end_memo != -1:
    memo_replacement = '''  const routeCoordinates = useMemo(() => {
    if (!selectedRoute) return [];
    return selectedRoute.legs.flatMap((l: any) => l.route.coordinates);
  }, [selectedRoute]);
  
  const routeSummary = useMemo(() => {
    if (!selectedRoute) return null;
    return { distanceKm: selectedRoute.distanceKm, durationMin: selectedRoute.estimatedMinutes };
  }, [selectedRoute]);
  
  const transitLegs = useMemo((): TransitLeg[] => {
    if (!selectedRoute) return [];
    const legs: TransitLeg[] = [];
    let index = 0;
    for (const rLeg of selectedRoute.legs as any[]) {
      legs.push({
        transitRouteId: rLeg.route.properties.id,
        transitInfo: {
          id: rLeg.route.properties.id,
          ref: rLeg.route.properties.code,
          name: rLeg.route.properties.name,
          type: rLeg.route.properties.type,
          color: 'blue',
        },
        waypoints: rLeg.route.coordinates,
        distances: [],
        stopNames: [],
        totalDistance: rLeg.distanceKm * 1000,
        originalIndex: index++
      });
    }
    return legs;
  }, [selectedRoute]);

  const displayLegs = useMemo(() => {
    if (transitLegs.length > 0) return transitLegs;
    if (routeCoordinates.length < 2) return [];
    return splitRouteSegments(routeCoordinates, transitRoutes, 50);
  }, [transitLegs, routeCoordinates, transitRoutes]);

'''
    
    end_memo2 = text.find('// Simulation — uses the actual searched route')
    text = text[:start_memo] + memo_replacement + text[end_memo2:]

# Next, fix selectedOptionLabel
text = text.replace(
'''  const selectedOptionLabel = useMemo(() => {
    if (!selectedRecommenderOptionId) return 'Current Route';
    return recommenderOptions.find((opt) => opt.id === selectedRecommenderOptionId)?.label || 'Current Route';
  }, [selectedRecommenderOptionId, recommenderOptions]);''',
'''  const selectedOptionLabel = useMemo(() => {
    if (!selectedRouteId) return 'Current Route';
    return selectedRoute?.legs.map((l: any) => l.route.properties.code).join('+') || 'Current Route';
  }, [selectedRouteId, selectedRoute]);'''
)

text = text.replace('''const activeOption = recommenderOptions.find((o) => o.id === selectedRecommenderOptionId);
      const distKm = activeOption?.distanceKm ?? (routeSummary?.distanceKm ?? 0);
      const fareAmt = activeOption?.farePhp ?? 0;''', '''const distKm = routeSummary?.distanceKm ?? 0;
      const fareAmt = selectedRoute?.estimatedFare ?? 0;''')

# In polyline render, map displayLegs instead of selectedRouteLegs
text = text.replace('''{selectedRouteLegs.map((leg, i) => (''', '''{displayLegs.map((leg, i) => (''')

# Update panel props
text = text.replace('''<RouteRecommenderPanel
        visible={showRecommender}
        options={recommenderOptions}
        selectedOptionId={selectedRecommenderOptionId}
        onSelectOption={handleSelectRecommenderOption}
        onClose={() => setShowRecommender(false)}
        routeSummary={routeSummary}
      />''', '''<RouteRecommenderPanel
        visible={showRecommender}
        matchedRoutes={matchedRoutes}
        rankedRoutes={rankedRoutes}
        rankTab={rankTab}
        setRankTab={setRankTab}
        selectedRoute={selectedRouteId}
        setSelectedRoute={setSelectedRouteId}
        destinationName={destinationQuery}
        onClose={() => setShowRecommender(false)}
      />''')

with open('app/(tabs)/index.tsx', 'w') as f:
    f.write(text)
