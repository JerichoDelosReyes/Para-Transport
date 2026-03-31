const fs = require('fs');

let code = fs.readFileSync('app/(tabs)/index.tsx', 'utf-8');

// Imports
code = code.replace(
  `import { useJeepneyRoutes, JeepneyRoute } from '../../hooks/useJeepneyRoutes';`,
  `import { useRoutes } from '../../hooks/useRoutes';\nimport { JeepneyRoute } from '../../types/routes';\nimport { findRoutesForDestination, rankRoutes, MatchedRoute, RankMode } from '../../services/routeSearch';`
);

// State
code = code.replace(
  `const { routes: gpxRoutes } = useJeepneyRoutes();`,
  `const { routes: gpxRoutes } = useRoutes();\n  const [matchedRoutes, setMatchedRoutes] = useState<MatchedRoute[]>([]);\n  const [rankTab, setRankTab] = useState<RankMode>('easiest');\n  const [rankedRoutes, setRankedRoutes] = useState<MatchedRoute[]>([]);\n  \n  useEffect(() => {\n    setRankedRoutes(rankRoutes(matchedRoutes, rankTab));\n  }, [matchedRoutes, rankTab]);`
);

// Replace exact chunk of handleSearchSelectRoute to avoid regex match issues
const startIndex = code.indexOf('const handleSearchSelectRoute = useCallback(async (origin: PlaceResult | null, destination: PlaceResult) => {');
const lastPart = "setRecommenderCandidates([]);";
const fallbackIndex = code.indexOf(lastPart, startIndex);
if (startIndex !== -1 && fallbackIndex !== -1) {
   // Find the end of the handleSearchSelectRoute by looking for its closing brackets
   const endIndexMatch = code.indexOf('  }, [recommenderCandidates]);', startIndex);
   if (endIndexMatch !== -1) {
       const functionBlock = code.slice(startIndex, endIndexMatch);
       const replacedBlock = `const handleSearchSelectRoute = useCallback(async (origin: PlaceResult | null, destination: PlaceResult) => {
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
        
        const allCoords = results.flatMap(m => m.legs.flatMap(l => l.route.coordinates));
        if (allCoords.length > 0) {
           mapRef.current?.fitToCoordinates(allCoords, {
             edgePadding: { top: 160, right: 50, bottom: 400, left: 50 },
             animated: true,
           });
        }
      }
      setIsRouting(false);
      
    } catch (error) {
      console.warn("Match error", error);
      setIsRouting(false);
    }
`;
       code = code.replace(functionBlock, replacedBlock);
   }
}

// Strip recommender imports
code = code.replace(/import RouteRecommenderPanel, \{ RouteRecommenderOption \} from '\.\.\/\.\.\/components\/RouteRecommenderPanel';/, 'import RouteRecommenderPanel from \'../../components/RouteRecommenderPanel\';');
code = code.replace(/import \{ buildRecommendationOptions, toRecommenderOptions \} from '\.\.\/\.\.\/services\/[a-zA-Z0-9_\/.]+';\n?/, '');

// Fix RouteRecommenderPanel rendering
const recommenderRenderOld = `<RouteRecommenderPanel
        visible={showRecommender}
        routeSummary={routeSummary}
        transitLegs={transitLegs}
        options={recommenderOptions}
        selectedOptionId={selectedRecommenderOptionId}
        onSelectOption={handleSelectRecommenderOption}
        onClose={() => setShowRecommender(false)}
      />`;

const recommenderRenderNew = `<RouteRecommenderPanel
        visible={showRecommender}
        matchedRoutes={matchedRoutes}
        rankedRoutes={rankedRoutes}
        rankTab={rankTab}
        setRankTab={setRankTab}
        selectedRoute={selectedRecommenderOptionId}
        setSelectedRoute={(id) => {
             setSelectedRecommenderOptionId(id);
             if (id) {
               const selected = matchedRoutes.find(m => m.legs.map((l: any) => l.route.properties.code).join('+') === id);
               if (selected) {
                  const allCoords = selected.legs.flatMap((l: any) => l.route.coordinates);
                  mapRef.current?.fitToCoordinates(allCoords, {
                     edgePadding: { top: 160, right: 50, bottom: 400, left: 50 },
                     animated: true,
                  });
               }
             }
        }}
        destinationName={destinationQuery}
        onClose={() => setShowRecommender(false)}
      />`;

code = code.replace(recommenderRenderOld, recommenderRenderNew);

// Replace mapping logic for drawing lines
const drawingBlockStart = "{/* Render searched route: mode-colored for transit, dashed for walking */}";
const mapCloseIndex = code.indexOf('          );', code.indexOf(drawingBlockStart));
const completeMapClose = code.indexOf('})}', mapCloseIndex) + 3;

if (mapCloseIndex !== -1) {
  const originalDrawingBloc = code.substring(code.indexOf(drawingBlockStart), completeMapClose);
  const newDrawingBlock = `{/* Render searched route via matchedRoutes */}
        {matchedRoutes.map((m, idx) => {
          const mId = m.legs.map((l: any) => l.route.properties.code).join('+');
          if (selectedRecommenderOptionId && selectedRecommenderOptionId !== mId) return null;
          if (!selectedRecommenderOptionId && idx !== 0) return null;
          
          return m.legs.map((leg: any, legIdx: number) => {
            const legType = String(leg.route.properties.type || '').toLowerCase();
            const transitColor = (ROUTE_COLORS as Record<string, string>)[legType] || '#E8A020';
            return (
              <Polyline
                key={\`leg-\$\{mId\}-\$\{legIdx\}\`}
                coordinates={leg.route.coordinates}
                strokeColor={transitColor}
                strokeWidth={legIdx === 0 ? 5 : 4}
              />
            );
          });
        })}`;
        code = code.replace(originalDrawingBloc, newDrawingBlock);
}

fs.writeFileSync('app/(tabs)/index.tsx', code);
console.log('Precise patching complete version 2.');
