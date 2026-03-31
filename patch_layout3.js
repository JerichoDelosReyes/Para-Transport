const fs = require('fs');
let code = fs.readFileSync('app_tabs_index_main.tsx_temp', 'utf-8');

// 1. Swap useJeepneyRoutes to useRoutes
code = code.replace(
  `import { useJeepneyRoutes, JeepneyRoute } from '../../hooks/useJeepneyRoutes';`,
  `import { useRoutes } from '../../hooks/useRoutes';\nimport { findRoutesForDestination, rankRoutes, MatchedRoute, RankMode } from '../../services/routeSearch';\nimport RouteRecommenderPanel from '../../components/RouteRecommenderPanel';\nimport { JeepneyRoute } from '../../types/routes';`
);

code = code.replace(
  `const { routes: gpxRoutes } = useJeepneyRoutes();`,
  `const { routes: gpxRoutes } = useRoutes();\n  const [matchedRoutes, setMatchedRoutes] = useState<MatchedRoute[]>([]);\n  const [rankTab, setRankTab] = useState<RankMode>('easiest');\n  const [rankedRoutes, setRankedRoutes] = useState<MatchedRoute[]>([]);\n  \n  useEffect(() => {\n    setRankedRoutes(rankRoutes(matchedRoutes, rankTab));\n  }, [matchedRoutes, rankTab]);`
);

// 2. Change handleSearchSelectRoute to use the new algorithm
// We replace everything inside handleSearchSelectRoute up to the line where it has ALREADY set the states.
code = code.replace(
  /const handleSearchSelectRoute = useCallback\(async[\s\S]*?\} catch \(err\) \{/,
  `const handleSearchSelectRoute = useCallback(async (origin: PlaceResult | null, destination: PlaceResult) => {
    setIsSearchActive(false);
    setDestinationQuery(destination.title);
    setOriginQuery(origin?.title || '');
    
    const destinationPoint = {
      latitude: destination.latitude,
      longitude: destination.longitude,
    };
    setDestinationLocation(destinationPoint);
    
    const startPoint = origin
      ? { latitude: origin.latitude, longitude: origin.longitude }
      : currentLocation;
      
    if (!startPoint || !mapRegion) return;
    
    setIsRouting(true);
    try {
      // Use new matching algorithm
      const results = findRoutesForDestination(
        { latitude: startPoint.latitude, longitude: startPoint.longitude },
        destinationPoint,
        gpxRoutes as any
      );
      
      setMatchedRoutes(results);
      setShowRecommender(true);
      
      if (results.length > 0) {
        setRouteCoordinates(results[0].legs[0].route.coordinates || []);
        setSelectedRecommenderOptionId(results[0].legs.map(l => l.route.properties.code).join('+'));
        
        // Setup Map frame for the routes
        const allCoords = results.flatMap(m => m.legs.flatMap(l => l.route.coordinates));
        if (allCoords.length > 0) {
           mapRef.current?.fitToCoordinates(allCoords, {
             edgePadding: { top: 160, right: 50, bottom: 400, left: 50 },
             animated: true,
           });
        }
      }
      setIsRouting(false);
      
    } catch (err) {`
);

// 3. Swap out RouteRecommenderPanel props
code = code.replace(
  /<RouteRecommenderPanel[\s\S]*?onClose=\{\(\) => setShowRecommender\(false\)\}\n\s*\/>/,
  `<RouteRecommenderPanel
        visible={showRecommender}
        matchedRoutes={matchedRoutes}
        rankedRoutes={rankedRoutes}
        rankTab={rankTab}
        setRankTab={setRankTab}
        selectedRoute={selectedRecommenderOptionId}
        setSelectedRoute={(id) => {
             setSelectedRecommenderOptionId(id);
             if (id) {
               const selected = matchedRoutes.find(m => m.legs.map(l => l.route.properties.code).join('+') === id);
               if (selected) {
                  const allCoords = selected.legs.flatMap(l => l.route.coordinates);
                  mapRef.current?.fitToCoordinates(allCoords, {
                     edgePadding: { top: 160, right: 50, bottom: 400, left: 50 },
                     animated: true,
                  });
               }
             }
        }}
        destinationName={destinationQuery}
        onClose={() => setShowRecommender(false)}
      />`
);

// 4. Clean up imports of missing things (like the old RouteRecommenderOption and buildRecommendationOptions)
code = code.replace(/import RouteRecommenderPanel, \{ RouteRecommenderOption \} from '\.\.\/\.\.\/components\/RouteRecommenderPanel';/, '');
code = code.replace(/import \{ buildRecommendationOptions, toRecommenderOptions \} from '\.\.\/\.\.\/services\/[a-zA-Z0-9_\/.]+';/, '');
code = code.replace(/const \[recommenderCandidates, setRecommenderCandidates\] = useState<RecommenderCandidate\[\]>\(\[\]\);/, '');

// Clean up clear route to also clear matchedRoutes
code = code.replace(
  /setRouteSummary\(null\);/,
  `setRouteSummary(null);\n    setMatchedRoutes([]);`
);

// Also let's strip out the rendering of the old visibleTransitLegs and replace with new rendering
// It looks like: { visibleTransitLegs.map((leg, idx) => { ... </Polyline> ) } )} 
code = code.replace(
  /\{\s*\/\*\s*Render searched route: mode-colored for transit, dashed for walking\s*\*\/\s*\}[\s\S]*?\{\s*visibleTransitLegs\.map\(\(leg, idx\) => \{[\s\S]*?<\/Polyline>\n\s*\);\n\s*\}\)\}/,
  `
  {/* Render new matchedRoutes lines dynamically */}
  {matchedRoutes.map((m, idx) => {
    const mId = m.legs.map(l => l.route.properties.code).join('+');
    if (selectedRecommenderOptionId && selectedRecommenderOptionId !== mId) return null;
    if (!selectedRecommenderOptionId && idx !== 0) return null; // Show first route as default if none selected
    
    return m.legs.map((leg, legIdx) => {
      const legType = String(leg.route.properties.type || '').toLowerCase();
      const transitColor = (ROUTE_COLORS as Record<string, string>)[legType] || '#E8A020';
      return (
        <Polyline
          key={\`leg-\$\{mId\}-\$\{legIdx\}\`}
          coordinates={leg.route.coordinates}
          strokeColor={transitColor}
          strokeWidth={5}
        />
      );
    });
  })}
  `
);

fs.writeFileSync('app/(tabs)/index.tsx', code);
console.log('Script finished. Replaced index.tsx.');
