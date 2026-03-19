import transitData from '../data/transit.routes.generated.json';

export type GeoJSONCoordinate = [number, number];

export type ResolvedLocation = {
  label: string;
  coordinate: GeoJSONCoordinate;
  source: 'input' | 'current-location' | 'geocoded';
};

type TransitStop = {
  stopId: string;
  name: string;
  type: 'terminal' | 'stop';
  coordinate: GeoJSONCoordinate;
};

type TransitRoute = {
  routeId: string;
  routeName: string;
  signboard: string;
  vehicleType: string;
  direction: 'forward' | 'reverse';
  sourceFile: string;
  geometry: {
    type: 'LineString';
    coordinates: GeoJSONCoordinate[];
  };
  stops: TransitStop[];
};

type RouteStopIndex = TransitStop & { pointIndex: number };

type IndexedRoute = {
  route: TransitRoute;
  cumulativeKmByPoint: number[];
  indexedStops: RouteStopIndex[];
};

type GraphNodeType = 'terminal' | 'stop' | 'intersection';

type GraphNode = {
  id: string;
  type: GraphNodeType;
  coordinate: GeoJSONCoordinate;
  label: string;
  routeId?: string;
  pointIndex?: number;
};

type GraphEdgeMode = 'ride' | 'walk';

type GraphEdge = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  mode: GraphEdgeMode;
  distanceKm: number;
  etaMinutes: number;
  fare: number;
  routeId?: string;
  description: string;
};

type IntersectionNode = {
  id: string;
  coordinate: GeoJSONCoordinate;
  routeAId: string;
  routeAIndex: number;
  routeBId: string;
  routeBIndex: number;
  nearestStopA: RouteStopIndex;
  nearestStopB: RouteStopIndex;
  walkMeters: number;
  label: string;
};

export type PlannedLeg = {
  routeId: string;
  routeName: string;
  signboard: string;
  boardAt: string;
  alightAt: string;
  distanceKm: number;
  estimatedMinutes: number;
  fare: number;
};

export type PlannedRouteOption = {
  id: string;
  type: 'direct' | 'transfer';
  transferCount: number;
  title: string;
  subtitle: string;
  totalDistanceKm: number;
  totalFare: number;
  estimatedMinutes: number;
  walkingMeters: number;
  score: number;
  summaryTags: string[];
  legs: PlannedLeg[];
  transferDescription?: string;
  directions: string[];
};

export type TransitSearchResult = {
  origin: ResolvedLocation;
  destination: ResolvedLocation;
  options: PlannedRouteOption[];
};

export type SearchInput = {
  originQuery?: string;
  destinationQuery: string;
  currentLocation?: { latitude: number; longitude: number } | null;
};

const ROUTES: TransitRoute[] = ((transitData as any)?.routes ?? []) as TransitRoute[];
const NOMINATIM_BASE_URL =
  process.env.EXPO_PUBLIC_GEOCODING_BASE_URL || 'https://nominatim.openstreetmap.org';

const ORIGIN_MATCH_BUFFER_KM = 0.6;
const DEST_MATCH_BUFFER_KM = 0.6;
const INTERSECTION_MAX_GAP_KM = 0.09;
const TRANSFER_WALK_MAX_KM = 0.2;

const BASE_FARE = 13;
const BASE_DISTANCE_KM = 4;
const ADDITIONAL_PER_KM = 1.8;
const AVERAGE_SPEED_KMPH = 18;
const WALKING_SPEED_M_PER_MIN = 78;

function toRad(value: number): number {
  return (value * Math.PI) / 180;
}

function haversineKm(a: GeoJSONCoordinate, b: GeoJSONCoordinate): number {
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);

  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;

  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function estimateMinutes(distanceKm: number): number {
  return Math.max(1, Math.round((distanceKm / AVERAGE_SPEED_KMPH) * 60));
}

function walkingMinutes(meters: number): number {
  return Math.max(1, Math.round(meters / WALKING_SPEED_M_PER_MIN));
}

function calculateFare(distanceKm: number): number {
  if (distanceKm <= BASE_DISTANCE_KM) {
    return BASE_FARE;
  }
  return Math.ceil(BASE_FARE + (distanceKm - BASE_DISTANCE_KM) * ADDITIONAL_PER_KM);
}

function normalize(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, ' ');
}

function toTitleCase(value: string): string {
  return value
    .split(' ')
    .map((token) => {
      if (/^[a-z0-9]{1,3}$/i.test(token) && token === token.toLowerCase()) {
        return token.toUpperCase();
      }
      return token.charAt(0).toUpperCase() + token.slice(1);
    })
    .join(' ');
}

function nearestPointIndex(
  routeCoordinates: GeoJSONCoordinate[],
  point: GeoJSONCoordinate
): { index: number; distanceKm: number } {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let i = 0; i < routeCoordinates.length; i += 1) {
    const distance = haversineKm(point, routeCoordinates[i]);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
    }
  }

  return { index: bestIndex, distanceKm: bestDistance };
}

function segmentDistanceKm(cumulative: number[], fromIndex: number, toIndex: number): number {
  const a = cumulative[Math.max(0, fromIndex)] || 0;
  const b = cumulative[Math.max(0, toIndex)] || 0;
  return Math.max(0, b - a);
}

function computeCumulativeDistance(points: GeoJSONCoordinate[]): number[] {
  const cumulative: number[] = [0];
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    cumulative.push(cumulative[i - 1] + haversineKm(prev, curr));
  }
  return cumulative;
}

function nearestIndexedStop(indexedStops: RouteStopIndex[], pointIndex: number): RouteStopIndex {
  if (!indexedStops.length) {
    return {
      stopId: 'virtual-stop',
      name: 'Unnamed stop',
      type: 'stop',
      coordinate: [0, 0],
      pointIndex,
    };
  }

  let best = indexedStops[0];
  let bestGap = Number.POSITIVE_INFINITY;

  for (const stop of indexedStops) {
    const gap = Math.abs(stop.pointIndex - pointIndex);
    if (gap < bestGap) {
      bestGap = gap;
      best = stop;
    }
  }

  return best;
}

function buildIndexedRoutes(routes: TransitRoute[]): IndexedRoute[] {
  return routes.map((route) => {
    const coords = route.geometry.coordinates;
    const cumulativeKmByPoint = computeCumulativeDistance(coords);

    const indexedStops = route.stops.map((stop) => {
      const nearest = nearestPointIndex(coords, stop.coordinate);
      return {
        ...stop,
        pointIndex: nearest.index,
      };
    });

    indexedStops.sort((a, b) => a.pointIndex - b.pointIndex);

    return {
      route,
      cumulativeKmByPoint,
      indexedStops,
    };
  });
}

function bucketKey(latBucket: number, lngBucket: number): string {
  return `${latBucket}:${lngBucket}`;
}

function detectIntersections(indexedRoutes: IndexedRoute[]): IntersectionNode[] {
  const intersections: IntersectionNode[] = [];
  const cellSizeDeg = INTERSECTION_MAX_GAP_KM / 111;

  for (let i = 0; i < indexedRoutes.length; i += 1) {
    for (let j = i + 1; j < indexedRoutes.length; j += 1) {
      const routeA = indexedRoutes[i];
      const routeB = indexedRoutes[j];
      const pointsA = routeA.route.geometry.coordinates;
      const pointsB = routeB.route.geometry.coordinates;

      const bucket = new Map<string, Array<{ index: number; point: GeoJSONCoordinate }>>();

      for (let bIndex = 0; bIndex < pointsB.length; bIndex += 1) {
        const point = pointsB[bIndex];
        const latBucket = Math.floor(point[1] / cellSizeDeg);
        const lngBucket = Math.floor(point[0] / cellSizeDeg);
        const key = bucketKey(latBucket, lngBucket);
        const existing = bucket.get(key) || [];
        existing.push({ index: bIndex, point });
        bucket.set(key, existing);
      }

      let bestGap = Number.POSITIVE_INFINITY;
      let bestAIndex = -1;
      let bestBIndex = -1;

      for (let aIndex = 0; aIndex < pointsA.length; aIndex += 1) {
        const aPoint = pointsA[aIndex];
        const latBucket = Math.floor(aPoint[1] / cellSizeDeg);
        const lngBucket = Math.floor(aPoint[0] / cellSizeDeg);

        for (let y = -1; y <= 1; y += 1) {
          for (let x = -1; x <= 1; x += 1) {
            const key = bucketKey(latBucket + y, lngBucket + x);
            const candidates = bucket.get(key) || [];

            for (const candidate of candidates) {
              const gap = haversineKm(aPoint, candidate.point);
              if (gap < bestGap) {
                bestGap = gap;
                bestAIndex = aIndex;
                bestBIndex = candidate.index;
              }
            }
          }
        }
      }

      if (
        bestAIndex < 0 ||
        bestBIndex < 0 ||
        bestGap > INTERSECTION_MAX_GAP_KM
      ) {
        continue;
      }

      const nearestStopA = nearestIndexedStop(routeA.indexedStops, bestAIndex);
      const nearestStopB = nearestIndexedStop(routeB.indexedStops, bestBIndex);
      const walkMeters = Math.round(bestGap * 1000);

      if (walkMeters > Math.round(TRANSFER_WALK_MAX_KM * 1000)) {
        continue;
      }

      const coordinate: GeoJSONCoordinate = [
        (pointsA[bestAIndex][0] + pointsB[bestBIndex][0]) / 2,
        (pointsA[bestAIndex][1] + pointsB[bestBIndex][1]) / 2,
      ];

      const label = `${nearestStopA.name} / ${nearestStopB.name}`;

      intersections.push({
        id: `ix-${routeA.route.routeId}-${bestAIndex}-${routeB.route.routeId}-${bestBIndex}`,
        coordinate,
        routeAId: routeA.route.routeId,
        routeAIndex: bestAIndex,
        routeBId: routeB.route.routeId,
        routeBIndex: bestBIndex,
        nearestStopA,
        nearestStopB,
        walkMeters,
        label,
      });
    }
  }

  return intersections;
}

function buildRouteGraph(
  indexedRoutes: IndexedRoute[],
  intersections: IntersectionNode[]
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeMap = new Map<string, GraphNode>();

  function upsertNode(node: GraphNode): GraphNode {
    const existing = nodeMap.get(node.id);
    if (existing) {
      return existing;
    }
    nodeMap.set(node.id, node);
    nodes.push(node);
    return node;
  }

  const intersectionsByRoute = new Map<string, IntersectionNode[]>();
  for (const intersection of intersections) {
    const first = intersectionsByRoute.get(intersection.routeAId) || [];
    first.push(intersection);
    intersectionsByRoute.set(intersection.routeAId, first);

    const second = intersectionsByRoute.get(intersection.routeBId) || [];
    second.push(intersection);
    intersectionsByRoute.set(intersection.routeBId, second);

    upsertNode({
      id: intersection.id,
      type: 'intersection',
      coordinate: intersection.coordinate,
      label: intersection.label,
    });
  }

  for (const indexedRoute of indexedRoutes) {
    const { route, cumulativeKmByPoint, indexedStops } = indexedRoute;

    const stopNodes = indexedStops.map((stop) =>
      upsertNode({
        id: `stop-${route.routeId}-${stop.stopId}`,
        type: stop.type,
        coordinate: stop.coordinate,
        label: stop.name,
        routeId: route.routeId,
        pointIndex: stop.pointIndex,
      })
    );

    const anchors: Array<{ nodeId: string; pointIndex: number; label: string }> = stopNodes.map((n) => ({
      nodeId: n.id,
      pointIndex: n.pointIndex || 0,
      label: n.label,
    }));

    const routeIntersections = intersectionsByRoute.get(route.routeId) || [];
    for (const intersection of routeIntersections) {
      const pointIndex =
        intersection.routeAId === route.routeId
          ? intersection.routeAIndex
          : intersection.routeBIndex;

      anchors.push({
        nodeId: intersection.id,
        pointIndex,
        label: intersection.label,
      });
    }

    anchors.sort((a, b) => a.pointIndex - b.pointIndex);

    for (let i = 1; i < anchors.length; i += 1) {
      const from = anchors[i - 1];
      const to = anchors[i];

      if (to.pointIndex <= from.pointIndex) {
        continue;
      }

      const distanceKm = segmentDistanceKm(cumulativeKmByPoint, from.pointIndex, to.pointIndex);
      if (distanceKm <= 0) {
        continue;
      }

      edges.push({
        id: `ride-${route.routeId}-${from.pointIndex}-${to.pointIndex}`,
        fromNodeId: from.nodeId,
        toNodeId: to.nodeId,
        mode: 'ride',
        distanceKm,
        etaMinutes: estimateMinutes(distanceKm),
        fare: calculateFare(distanceKm),
        routeId: route.routeId,
        description: `${route.signboard}: ${from.label} to ${to.label}`,
      });
    }
  }

  for (const intersection of intersections) {
    const walkDistanceKm = intersection.walkMeters / 1000;
    edges.push({
      id: `walk-${intersection.id}`,
      fromNodeId: intersection.id,
      toNodeId: intersection.id,
      mode: 'walk',
      distanceKm: walkDistanceKm,
      etaMinutes: walkingMinutes(intersection.walkMeters),
      fare: 0,
      description: `Walk ${intersection.walkMeters} m at ${intersection.label}`,
    });
  }

  return { nodes, edges };
}

const INDEXED_ROUTES = buildIndexedRoutes(ROUTES);
const INTERSECTIONS = detectIntersections(INDEXED_ROUTES);
const ROUTE_GRAPH = buildRouteGraph(INDEXED_ROUTES, INTERSECTIONS);

function buildKnownPlaces(): Array<{ name: string; coordinate: GeoJSONCoordinate }> {
  const places = new Map<string, GeoJSONCoordinate>();

  for (const route of ROUTES) {
    for (const stop of route.stops) {
      if (!stop.name || /^stop candidate/i.test(stop.name)) {
        continue;
      }
      const key = normalize(stop.name);
      if (!places.has(key)) {
        places.set(key, stop.coordinate);
      }
    }
  }

  return [...places.entries()]
    .map(([name, coordinate]) => ({ name, coordinate }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));
}

const KNOWN_PLACES = buildKnownPlaces();

export function getTransitPlaceSuggestions(query: string, limit = 6): string[] {
  const q = normalize(query);
  if (!q) {
    return KNOWN_PLACES.slice(0, limit).map((item) => toTitleCase(item.name));
  }

  const candidates = KNOWN_PLACES.filter((item) => item.name.includes(q));
  return candidates.slice(0, limit).map((item) => toTitleCase(item.name));
}

async function geocodeWithNominatim(query: string): Promise<ResolvedLocation | null> {
  const params = new URLSearchParams({
    q: `${query}, Cavite, Philippines`,
    format: 'json',
    limit: '1',
    countrycodes: 'ph',
    addressdetails: '0',
  });

  const response = await fetch(`${NOMINATIM_BASE_URL}/search?${params.toString()}`, {
    headers: {
      'Accept-Language': 'en',
    },
  });

  if (!response.ok) {
    return null;
  }

  const payload = await response.json();
  const first = Array.isArray(payload) ? payload[0] : null;
  if (!first) {
    return null;
  }

  const lat = Number(first.lat);
  const lon = Number(first.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  const label = String(first.display_name || query)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)[0] || query;

  return {
    label,
    coordinate: [lon, lat],
    source: 'geocoded',
  };
}

export async function resolveLocation(
  query: string,
  currentLocation?: { latitude: number; longitude: number } | null
): Promise<ResolvedLocation | null> {
  const normalized = normalize(query);

  if (!normalized || normalized === 'my location' || normalized === 'current location') {
    if (!currentLocation) {
      return null;
    }

    return {
      label: 'Current Location',
      coordinate: [currentLocation.longitude, currentLocation.latitude],
      source: 'current-location',
    };
  }

  const exact = KNOWN_PLACES.find((item) => item.name === normalized);
  if (exact) {
    return {
      label: toTitleCase(exact.name),
      coordinate: exact.coordinate,
      source: 'input',
    };
  }

  const includes = KNOWN_PLACES.find(
    (item) => item.name.includes(normalized) || normalized.includes(item.name)
  );
  if (includes) {
    return {
      label: toTitleCase(includes.name),
      coordinate: includes.coordinate,
      source: 'input',
    };
  }

  return geocodeWithNominatim(query);
}

type AccessProbe = {
  indexedRoute: IndexedRoute;
  pointIndex: number;
  pointDistanceKm: number;
  nearestStop: RouteStopIndex;
};

function findRouteAccess(point: GeoJSONCoordinate, bufferKm: number): AccessProbe[] {
  const probes = INDEXED_ROUTES.map((indexedRoute) => {
    const nearest = nearestPointIndex(indexedRoute.route.geometry.coordinates, point);
    return {
      indexedRoute,
      pointIndex: nearest.index,
      pointDistanceKm: nearest.distanceKm,
      nearestStop: nearestIndexedStop(indexedRoute.indexedStops, nearest.index),
    };
  })
    .filter((probe) => probe.pointDistanceKm <= bufferKm)
    .sort((a, b) => a.pointDistanceKm - b.pointDistanceKm);

  return probes;
}

function directOptionFromRoute(
  origin: ResolvedLocation,
  destination: ResolvedLocation,
  originAccess: AccessProbe,
  destinationAccess: AccessProbe
): PlannedRouteOption | null {
  if (originAccess.indexedRoute.route.routeId !== destinationAccess.indexedRoute.route.routeId) {
    return null;
  }

  const indexedRoute = originAccess.indexedRoute;
  const route = indexedRoute.route;

  if (destinationAccess.pointIndex <= originAccess.pointIndex) {
    return null;
  }

  const distanceKm = segmentDistanceKm(
    indexedRoute.cumulativeKmByPoint,
    originAccess.pointIndex,
    destinationAccess.pointIndex
  );

  if (distanceKm <= 0.2) {
    return null;
  }

  const walkingMeters = Math.round((originAccess.pointDistanceKm + destinationAccess.pointDistanceKm) * 1000);
  const leg: PlannedLeg = {
    routeId: route.routeId,
    routeName: route.routeName,
    signboard: route.signboard,
    boardAt: originAccess.nearestStop.name,
    alightAt: destinationAccess.nearestStop.name,
    distanceKm: Number(distanceKm.toFixed(2)),
    estimatedMinutes: estimateMinutes(distanceKm),
    fare: calculateFare(distanceKm),
  };

  const directions = [
    `Board at ${originAccess.nearestStop.name} using signboard ${route.signboard}.`,
    `Stay on board for about ${leg.distanceKm.toFixed(1)} km (${leg.estimatedMinutes} min).`,
    `Alight at ${destinationAccess.nearestStop.name}.`,
    `Walk to ${destination.label}.`,
  ];

  return {
    id: `direct-${route.routeId}-${originAccess.pointIndex}-${destinationAccess.pointIndex}`,
    type: 'direct',
    transferCount: 0,
    title: route.routeName,
    subtitle: `Direct via ${route.signboard}`,
    totalDistanceKm: leg.distanceKm,
    totalFare: leg.fare,
    estimatedMinutes: leg.estimatedMinutes,
    walkingMeters,
    score: 0,
    summaryTags: [],
    legs: [leg],
    directions,
  };
}

function transferOptionFromIntersection(
  origin: ResolvedLocation,
  destination: ResolvedLocation,
  originAccess: AccessProbe,
  destinationAccess: AccessProbe,
  intersection: IntersectionNode
): PlannedRouteOption | null {
  const firstRoute = originAccess.indexedRoute.route.routeId;
  const secondRoute = destinationAccess.indexedRoute.route.routeId;

  const matchesForward =
    intersection.routeAId === firstRoute &&
    intersection.routeBId === secondRoute &&
    originAccess.pointIndex < intersection.routeAIndex &&
    intersection.routeBIndex < destinationAccess.pointIndex;

  const matchesReverse =
    intersection.routeBId === firstRoute &&
    intersection.routeAId === secondRoute &&
    originAccess.pointIndex < intersection.routeBIndex &&
    intersection.routeAIndex < destinationAccess.pointIndex;

  if (!matchesForward && !matchesReverse) {
    return null;
  }

  const firstIndex = matchesForward ? intersection.routeAIndex : intersection.routeBIndex;
  const secondIndex = matchesForward ? intersection.routeBIndex : intersection.routeAIndex;

  const firstTransferStop = matchesForward ? intersection.nearestStopA : intersection.nearestStopB;
  const secondTransferStop = matchesForward ? intersection.nearestStopB : intersection.nearestStopA;

  const leg1Distance = segmentDistanceKm(
    originAccess.indexedRoute.cumulativeKmByPoint,
    originAccess.pointIndex,
    firstIndex
  );
  const leg2Distance = segmentDistanceKm(
    destinationAccess.indexedRoute.cumulativeKmByPoint,
    secondIndex,
    destinationAccess.pointIndex
  );

  if (leg1Distance <= 0.2 || leg2Distance <= 0.2) {
    return null;
  }

  const leg1: PlannedLeg = {
    routeId: originAccess.indexedRoute.route.routeId,
    routeName: originAccess.indexedRoute.route.routeName,
    signboard: originAccess.indexedRoute.route.signboard,
    boardAt: originAccess.nearestStop.name,
    alightAt: firstTransferStop.name,
    distanceKm: Number(leg1Distance.toFixed(2)),
    estimatedMinutes: estimateMinutes(leg1Distance),
    fare: calculateFare(leg1Distance),
  };

  const leg2: PlannedLeg = {
    routeId: destinationAccess.indexedRoute.route.routeId,
    routeName: destinationAccess.indexedRoute.route.routeName,
    signboard: destinationAccess.indexedRoute.route.signboard,
    boardAt: secondTransferStop.name,
    alightAt: destinationAccess.nearestStop.name,
    distanceKm: Number(leg2Distance.toFixed(2)),
    estimatedMinutes: estimateMinutes(leg2Distance),
    fare: calculateFare(leg2Distance),
  };

  const accessWalkMeters = Math.round((originAccess.pointDistanceKm + destinationAccess.pointDistanceKm) * 1000);
  const transferWalkMeters = intersection.walkMeters;
  const walkingMeters = accessWalkMeters + transferWalkMeters;

  const totalDistanceKm = Number((leg1.distanceKm + leg2.distanceKm).toFixed(2));
  const totalFare = leg1.fare + leg2.fare;
  const totalEta =
    leg1.estimatedMinutes +
    leg2.estimatedMinutes +
    walkingMinutes(transferWalkMeters);

  const directions = [
    `Board at ${leg1.boardAt} on ${leg1.signboard}.`,
    `Alight at ${leg1.alightAt}.`,
    `Transfer at ${intersection.label} and walk about ${transferWalkMeters} m to ${leg2.boardAt}.`,
    `Board ${leg2.signboard}, then alight at ${leg2.alightAt}.`,
    `Walk to ${destination.label}.`,
  ];

  return {
    id: `transfer-${leg1.routeId}-${leg2.routeId}-${intersection.id}-${originAccess.pointIndex}-${destinationAccess.pointIndex}`,
    type: 'transfer',
    transferCount: 1,
    title: `${leg1.routeName} + ${leg2.routeName}`,
    subtitle: `Transfer at ${intersection.label}`,
    totalDistanceKm,
    totalFare,
    estimatedMinutes: totalEta,
    walkingMeters,
    score: 0,
    summaryTags: [],
    legs: [leg1, leg2],
    transferDescription: `${transferWalkMeters} m walk at ${intersection.label}`,
    directions,
  };
}

function rankOptions(options: PlannedRouteOption[]): PlannedRouteOption[] {
  const sorted = [...options].sort((a, b) => {
    if (a.transferCount !== b.transferCount) {
      return a.transferCount - b.transferCount;
    }
    if (a.estimatedMinutes !== b.estimatedMinutes) {
      return a.estimatedMinutes - b.estimatedMinutes;
    }
    return a.walkingMeters - b.walkingMeters;
  });

  if (!sorted.length) {
    return sorted;
  }

  const fastest = [...sorted].sort((a, b) => a.estimatedMinutes - b.estimatedMinutes)[0];
  const cheapest = [...sorted].sort((a, b) => a.totalFare - b.totalFare)[0];
  const leastWalk = [...sorted].sort((a, b) => a.walkingMeters - b.walkingMeters)[0];

  const byId = new Map<string, PlannedRouteOption>();
  for (const option of sorted) {
    byId.set(option.id, {
      ...option,
      score: option.transferCount * 10000 + option.estimatedMinutes * 100 + option.walkingMeters,
      summaryTags: [],
    });
  }

  const recommended = byId.get(sorted[0].id);
  if (recommended) {
    recommended.summaryTags.push('Recommended');
  }

  const fastestTag = byId.get(fastest.id);
  if (fastestTag && !fastestTag.summaryTags.includes('Fastest')) {
    fastestTag.summaryTags.push('Fastest');
  }

  const cheapestTag = byId.get(cheapest.id);
  if (cheapestTag && !cheapestTag.summaryTags.includes('Cheapest')) {
    cheapestTag.summaryTags.push('Cheapest');
  }

  const leastWalkTag = byId.get(leastWalk.id);
  if (leastWalkTag && !leastWalkTag.summaryTags.includes('Least Walk')) {
    leastWalkTag.summaryTags.push('Least Walk');
  }

  return sorted.map((option) => byId.get(option.id) || option);
}

export async function searchTransitRoutes(input: SearchInput): Promise<TransitSearchResult> {
  const originQuery = (input.originQuery || '').trim();
  const destinationQuery = input.destinationQuery.trim();

  if (!destinationQuery) {
    throw new Error('Destination is required.');
  }

  const origin = await resolveLocation(originQuery || 'current location', input.currentLocation);
  if (!origin) {
    throw new Error('Origin is required. Enter a place or allow current location.');
  }

  const destination = await resolveLocation(destinationQuery, input.currentLocation);
  if (!destination) {
    throw new Error('Destination not found. Please refine your destination input.');
  }

  const originAccess = findRouteAccess(origin.coordinate, ORIGIN_MATCH_BUFFER_KM);
  const destinationAccess = findRouteAccess(destination.coordinate, DEST_MATCH_BUFFER_KM);

  const options: PlannedRouteOption[] = [];

  for (const oa of originAccess.slice(0, 10)) {
    for (const da of destinationAccess.slice(0, 10)) {
      const direct = directOptionFromRoute(origin, destination, oa, da);
      if (direct) {
        options.push(direct);
      }
    }
  }

  for (const oa of originAccess.slice(0, 8)) {
    for (const da of destinationAccess.slice(0, 8)) {
      for (const intersection of INTERSECTIONS) {
        const transfer = transferOptionFromIntersection(origin, destination, oa, da, intersection);
        if (transfer) {
          options.push(transfer);
        }
      }
    }
  }

  const deduped = new Map<string, PlannedRouteOption>();
  for (const option of options) {
    if (!deduped.has(option.id)) {
      deduped.set(option.id, option);
    }
  }

  const ranked = rankOptions([...deduped.values()]).slice(0, 8);

  return {
    origin,
    destination,
    options: ranked,
  };
}

export function getRouteGraphStats(): { nodeCount: number; edgeCount: number; intersectionCount: number } {
  return {
    nodeCount: ROUTE_GRAPH.nodes.length,
    edgeCount: ROUTE_GRAPH.edges.length,
    intersectionCount: INTERSECTIONS.length,
  };
}
