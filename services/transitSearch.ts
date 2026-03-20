import transitData from '../data/transit.routes.generated.json';
import { routeRegistry } from './GraphBuilder';
import { formatResponsePayload, ResponsePayload } from './PostProcessor';
import { findOptimalPath } from './RoutingEngine';
import { ensureRoutingRuntimeInitialized } from './RoutingRuntime';

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

type RouteStopIndex = TransitStop & {
  pointIndex: number;
  nodeId: string;
};

type IndexedRoute = {
  route: TransitRoute;
  cumulativeKmByPoint: number[];
  indexedStops: RouteStopIndex[];
};

type NodeKind = 'terminal' | 'stop' | 'intersection' | 'virtual';

type GraphNode = {
  id: string;
  kind: NodeKind;
  label: string;
  coordinate: GeoJSONCoordinate;
  routeId?: string;
  pointIndex?: number;
};

type GraphEdgeMode = 'ride' | 'walk';

type GraphEdge = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  mode: GraphEdgeMode;
  routeId?: string;
  distanceKm: number;
  etaMinutes: number;
  fare: number;
  geometry?: GeoJSONCoordinate[];
  description: string;
};

type IntersectionNode = {
  id: string;
  routeAId: string;
  routeAIndex: number;
  routeBId: string;
  routeBIndex: number;
  coordinateA: GeoJSONCoordinate;
  coordinateB: GeoJSONCoordinate;
  nearestStopA: RouteStopIndex;
  nearestStopB: RouteStopIndex;
  walkMeters: number;
  label: string;
};

type BaseGraph = {
  nodes: Map<string, GraphNode>;
  edges: GraphEdge[];
  adjacency: Map<string, GraphEdge[]>;
};

type Profile = 'recommended' | 'fastest' | 'cheapest' | 'leastWalk' | 'fewestTransfers';

type ProfileWeights = {
  eta: number;
  walkPerMeter: number;
  transfer: number;
  fare: number;
};

type AStarState = {
  key: string;
  nodeId: string;
  currentRouteId: string | null;
  g: number;
  f: number;
  transfers: number;
  etaMinutes: number;
  walkMeters: number;
  fare: number;
  parentKey: string | null;
  viaEdgeId: string | null;
};

export type RouteMapSegment = {
  routeId: string;
  signboard: string;
  coordinates: GeoJSONCoordinate[];
};

export type RouteMapMarker = {
  id: string;
  label: string;
  coordinate: GeoJSONCoordinate;
  kind: 'board' | 'alight' | 'transfer';
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
  mapSegments: RouteMapSegment[];
  mapMarkers: RouteMapMarker[];
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

const ORIGIN_MATCH_BUFFER_KM = 0.75;
const DEST_MATCH_BUFFER_KM = 0.75;
const INTERSECTION_MAX_GAP_KM = 0.09;
const TRANSFER_WALK_MAX_KM = 0.22;

const BASE_FARE = 13;
const BASE_DISTANCE_KM = 4;
const ADDITIONAL_PER_KM = 1.8;
const AVERAGE_SPEED_KMPH = 18;
const WALKING_SPEED_M_PER_MIN = 78;

const PROFILE_WEIGHTS: Record<Profile, ProfileWeights> = {
  recommended: {
    eta: 1.45,
    walkPerMeter: 0.02,
    transfer: 210,
    fare: 1.2,
  },
  fastest: {
    eta: 2.2,
    walkPerMeter: 0.03,
    transfer: 95,
    fare: 0.4,
  },
  cheapest: {
    eta: 0.9,
    walkPerMeter: 0.008,
    transfer: 75,
    fare: 3.0,
  },
  leastWalk: {
    eta: 1.15,
    walkPerMeter: 0.07,
    transfer: 70,
    fare: 0.8,
  },
  fewestTransfers: {
    eta: 1.2,
    walkPerMeter: 0.015,
    transfer: 340,
    fare: 0.9,
  },
};

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

function estimateRideCost(distanceKm: number): number {
  return Math.max(1, distanceKm * 2.4);
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

function computeCumulativeDistance(points: GeoJSONCoordinate[]): number[] {
  const cumulative: number[] = [0];
  for (let i = 1; i < points.length; i += 1) {
    cumulative.push(cumulative[i - 1] + haversineKm(points[i - 1], points[i]));
  }
  return cumulative;
}

function segmentDistanceKm(cumulative: number[], fromIndex: number, toIndex: number): number {
  return Math.max(0, (cumulative[toIndex] || 0) - (cumulative[fromIndex] || 0));
}

function nearestIndexedStop(indexedStops: RouteStopIndex[], pointIndex: number): RouteStopIndex {
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
    const cumulativeKmByPoint = computeCumulativeDistance(route.geometry.coordinates);

    const indexedStops = route.stops
      .map((stop) => {
        const nearest = nearestPointIndex(route.geometry.coordinates, stop.coordinate);
        return {
          ...stop,
          pointIndex: nearest.index,
          nodeId: `stop:${route.routeId}:${stop.stopId}`,
        };
      })
      .sort((a, b) => a.pointIndex - b.pointIndex);

    return {
      route,
      cumulativeKmByPoint,
      indexedStops,
    };
  });
}

function cellKey(a: number, b: number): string {
  return `${a}:${b}`;
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
        const latCell = Math.floor(point[1] / cellSizeDeg);
        const lngCell = Math.floor(point[0] / cellSizeDeg);
        const key = cellKey(latCell, lngCell);
        const list = bucket.get(key) || [];
        list.push({ index: bIndex, point });
        bucket.set(key, list);
      }

      let bestGap = Number.POSITIVE_INFINITY;
      let bestAIndex = -1;
      let bestBIndex = -1;

      for (let aIndex = 0; aIndex < pointsA.length; aIndex += 1) {
        const pointA = pointsA[aIndex];
        const latCell = Math.floor(pointA[1] / cellSizeDeg);
        const lngCell = Math.floor(pointA[0] / cellSizeDeg);

        for (let y = -1; y <= 1; y += 1) {
          for (let x = -1; x <= 1; x += 1) {
            const key = cellKey(latCell + y, lngCell + x);
            const candidates = bucket.get(key) || [];

            for (const candidate of candidates) {
              const gap = haversineKm(pointA, candidate.point);
              if (gap < bestGap) {
                bestGap = gap;
                bestAIndex = aIndex;
                bestBIndex = candidate.index;
              }
            }
          }
        }
      }

      if (bestAIndex < 0 || bestBIndex < 0 || bestGap > INTERSECTION_MAX_GAP_KM) {
        continue;
      }

      const nearestStopA = nearestIndexedStop(routeA.indexedStops, bestAIndex);
      const nearestStopB = nearestIndexedStop(routeB.indexedStops, bestBIndex);
      const walkMeters = Math.round(bestGap * 1000);

      if (walkMeters > Math.round(TRANSFER_WALK_MAX_KM * 1000)) {
        continue;
      }

      const label = `${nearestStopA.name} / ${nearestStopB.name}`;

      intersections.push({
        id: `ix:${routeA.route.routeId}:${bestAIndex}:${routeB.route.routeId}:${bestBIndex}`,
        routeAId: routeA.route.routeId,
        routeAIndex: bestAIndex,
        routeBId: routeB.route.routeId,
        routeBIndex: bestBIndex,
        coordinateA: pointsA[bestAIndex],
        coordinateB: pointsB[bestBIndex],
        nearestStopA,
        nearestStopB,
        walkMeters,
        label,
      });
    }
  }

  return intersections;
}

function buildBaseGraph(indexedRoutes: IndexedRoute[], intersections: IntersectionNode[]): BaseGraph {
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];

  function addNode(node: GraphNode): void {
    if (!nodes.has(node.id)) {
      nodes.set(node.id, node);
    }
  }

  for (const indexedRoute of indexedRoutes) {
    for (const stop of indexedRoute.indexedStops) {
      addNode({
        id: stop.nodeId,
        kind: stop.type,
        label: stop.name,
        coordinate: stop.coordinate,
        routeId: indexedRoute.route.routeId,
        pointIndex: stop.pointIndex,
      });
    }
  }

  const intersectionAnchorByRoute = new Map<string, Array<{ pointIndex: number; nodeId: string; label: string }>>();

  for (const intersection of intersections) {
    const nodeAId = `${intersection.id}:A`;
    const nodeBId = `${intersection.id}:B`;

    addNode({
      id: nodeAId,
      kind: 'intersection',
      label: `${intersection.label} (Route A)`,
      coordinate: intersection.coordinateA,
      routeId: intersection.routeAId,
      pointIndex: intersection.routeAIndex,
    });

    addNode({
      id: nodeBId,
      kind: 'intersection',
      label: `${intersection.label} (Route B)`,
      coordinate: intersection.coordinateB,
      routeId: intersection.routeBId,
      pointIndex: intersection.routeBIndex,
    });

    const listA = intersectionAnchorByRoute.get(intersection.routeAId) || [];
    listA.push({ pointIndex: intersection.routeAIndex, nodeId: nodeAId, label: intersection.label });
    intersectionAnchorByRoute.set(intersection.routeAId, listA);

    const listB = intersectionAnchorByRoute.get(intersection.routeBId) || [];
    listB.push({ pointIndex: intersection.routeBIndex, nodeId: nodeBId, label: intersection.label });
    intersectionAnchorByRoute.set(intersection.routeBId, listB);

    const walkDistanceKm = intersection.walkMeters / 1000;
    const walkEta = walkingMinutes(intersection.walkMeters);

    edges.push({
      id: `walk:${nodeAId}:${nodeBId}`,
      fromNodeId: nodeAId,
      toNodeId: nodeBId,
      mode: 'walk',
      distanceKm: walkDistanceKm,
      etaMinutes: walkEta,
      fare: 0,
      description: `Transfer walk at ${intersection.label}`,
    });

    edges.push({
      id: `walk:${nodeBId}:${nodeAId}`,
      fromNodeId: nodeBId,
      toNodeId: nodeAId,
      mode: 'walk',
      distanceKm: walkDistanceKm,
      etaMinutes: walkEta,
      fare: 0,
      description: `Transfer walk at ${intersection.label}`,
    });
  }

  for (const indexedRoute of indexedRoutes) {
    const routeId = indexedRoute.route.routeId;

    const anchors = indexedRoute.indexedStops.map((stop) => ({
      pointIndex: stop.pointIndex,
      nodeId: stop.nodeId,
      label: stop.name,
    }));

    for (const anchor of intersectionAnchorByRoute.get(routeId) || []) {
      anchors.push(anchor);
    }

    anchors.sort((a, b) => a.pointIndex - b.pointIndex);

    for (let i = 1; i < anchors.length; i += 1) {
      const from = anchors[i - 1];
      const to = anchors[i];

      if (to.pointIndex <= from.pointIndex) {
        continue;
      }

      const distanceKm = segmentDistanceKm(indexedRoute.cumulativeKmByPoint, from.pointIndex, to.pointIndex);
      if (distanceKm <= 0) {
        continue;
      }

      const geometry = indexedRoute.route.geometry.coordinates.slice(from.pointIndex, to.pointIndex + 1);

      edges.push({
        id: `ride:${routeId}:${from.pointIndex}:${to.pointIndex}`,
        fromNodeId: from.nodeId,
        toNodeId: to.nodeId,
        mode: 'ride',
        routeId,
        distanceKm,
        etaMinutes: estimateMinutes(distanceKm),
        fare: 0,
        geometry,
        description: `${indexedRoute.route.signboard}: ${from.label} to ${to.label}`,
      });
    }
  }

  const adjacency = new Map<string, GraphEdge[]>();
  for (const edge of edges) {
    const list = adjacency.get(edge.fromNodeId) || [];
    list.push(edge);
    adjacency.set(edge.fromNodeId, list);
  }

  return { nodes, edges, adjacency };
}

const INDEXED_ROUTES = buildIndexedRoutes(ROUTES);
const INTERSECTIONS = detectIntersections(INDEXED_ROUTES);
const BASE_GRAPH = buildBaseGraph(INDEXED_ROUTES, INTERSECTIONS);

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

type AccessCandidate = {
  nodeId: string;
  routeId: string;
  label: string;
  coordinate: GeoJSONCoordinate;
  distanceKm: number;
};

function findAccessCandidates(point: GeoJSONCoordinate, bufferKm: number): AccessCandidate[] {
  const candidates: AccessCandidate[] = [];

  for (const indexedRoute of INDEXED_ROUTES) {
    const byDistance = [...indexedRoute.indexedStops]
      .map((stop) => ({
        nodeId: stop.nodeId,
        routeId: indexedRoute.route.routeId,
        label: stop.name,
        coordinate: stop.coordinate,
        distanceKm: haversineKm(stop.coordinate, point),
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 3);

    for (const item of byDistance) {
      if (item.distanceKm <= bufferKm) {
        candidates.push(item);
      }
    }
  }

  if (!candidates.length) {
    const fallback = INDEXED_ROUTES.flatMap((indexedRoute) =>
      indexedRoute.indexedStops.map((stop) => ({
        nodeId: stop.nodeId,
        routeId: indexedRoute.route.routeId,
        label: stop.name,
        coordinate: stop.coordinate,
        distanceKm: haversineKm(stop.coordinate, point),
      }))
    )
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 5);

    return fallback;
  }

  return candidates.sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 12);
}

function profileHeuristic(profile: Profile, distanceKm: number): number {
  const weights = PROFILE_WEIGHTS[profile];
  const eta = (distanceKm / AVERAGE_SPEED_KMPH) * 60;
  const walkMeters = distanceKm * 1000;
  const fare = estimateRideCost(distanceKm);
  return eta * weights.eta + walkMeters * weights.walkPerMeter + fare * weights.fare;
}

function profileStepCost(
  profile: Profile,
  edge: GraphEdge,
  transferInc: number,
  fareInc: number
): number {
  const weights = PROFILE_WEIGHTS[profile];
  const walkMeters = edge.mode === 'walk' ? edge.distanceKm * 1000 : 0;

  return (
    edge.etaMinutes * weights.eta +
    walkMeters * weights.walkPerMeter +
    transferInc * weights.transfer +
    fareInc * weights.fare
  );
}

function popLowest(open: AStarState[]): AStarState {
  open.sort((a, b) => a.f - b.f);
  return open.shift() as AStarState;
}

function buildStateKey(nodeId: string, currentRouteId: string | null): string {
  return `${nodeId}|${currentRouteId || 'none'}`;
}

function runAStar(
  profile: Profile,
  graph: BaseGraph,
  startNodeId: string,
  endNodeId: string,
  endCoordinate: GeoJSONCoordinate
): GraphEdge[] | null {
  const startKey = buildStateKey(startNodeId, null);

  const startState: AStarState = {
    key: startKey,
    nodeId: startNodeId,
    currentRouteId: null,
    g: 0,
    f: 0,
    transfers: 0,
    etaMinutes: 0,
    walkMeters: 0,
    fare: 0,
    parentKey: null,
    viaEdgeId: null,
  };

  const open: AStarState[] = [startState];
  const bestG = new Map<string, number>([[startKey, 0]]);
  const states = new Map<string, AStarState>([[startKey, startState]]);

  while (open.length) {
    const current = popLowest(open);

    if (current.nodeId === endNodeId) {
      const edgeById = new Map(graph.edges.map((edge) => [edge.id, edge]));
      const pathEdges: GraphEdge[] = [];
      let cursor: AStarState | undefined = current;

      while (cursor && cursor.parentKey) {
        if (cursor.viaEdgeId) {
          const edge = edgeById.get(cursor.viaEdgeId);
          if (edge) {
            pathEdges.unshift(edge);
          }
        }
        cursor = states.get(cursor.parentKey);
      }

      return pathEdges;
    }

    const neighbors = graph.adjacency.get(current.nodeId) || [];

    for (const edge of neighbors) {
      const nextRouteId = edge.mode === 'ride' ? edge.routeId || current.currentRouteId : current.currentRouteId;
      const transferInc =
        edge.mode === 'ride' &&
        current.currentRouteId !== null &&
        edge.routeId !== current.currentRouteId
          ? 1
          : 0;

      const transfers = current.transfers + transferInc;
      const etaMinutes = current.etaMinutes + edge.etaMinutes;
      const walkMeters = current.walkMeters + Math.round(edge.mode === 'walk' ? edge.distanceKm * 1000 : 0);
      const fareInc = edge.mode === 'ride' ? estimateRideCost(edge.distanceKm) : 0;
      const fare = current.fare + fareInc;

      const stepCost = profileStepCost(profile, edge, transferInc, fareInc);
      const g = current.g + stepCost;
      const nextNode = graph.nodes.get(edge.toNodeId);
      const heuristic = nextNode
        ? profileHeuristic(profile, haversineKm(nextNode.coordinate, endCoordinate))
        : 0;

      const f = g + heuristic;
      const key = buildStateKey(edge.toNodeId, nextRouteId || null);

      if (bestG.has(key) && (bestG.get(key) as number) <= g) {
        continue;
      }

      bestG.set(key, g);

      const nextState: AStarState = {
        key,
        nodeId: edge.toNodeId,
        currentRouteId: nextRouteId || null,
        g,
        f,
        transfers,
        etaMinutes,
        walkMeters,
        fare,
        parentKey: current.key,
        viaEdgeId: edge.id,
      };

      states.set(key, nextState);
      open.push(nextState);
    }
  }

  return null;
}

function buildSearchGraph(
  origin: ResolvedLocation,
  destination: ResolvedLocation
): { graph: BaseGraph; startNodeId: string; endNodeId: string } {
  const stamp = `${Date.now()}:${Math.random()}`;
  const startNodeId = `virtual:start:${stamp}`;
  const endNodeId = `virtual:end:${stamp}`;

  const nodes = new Map(BASE_GRAPH.nodes);
  const edges = [...BASE_GRAPH.edges];

  nodes.set(startNodeId, {
    id: startNodeId,
    kind: 'virtual',
    label: origin.label,
    coordinate: origin.coordinate,
  });

  nodes.set(endNodeId, {
    id: endNodeId,
    kind: 'virtual',
    label: destination.label,
    coordinate: destination.coordinate,
  });

  const originCandidates = findAccessCandidates(origin.coordinate, ORIGIN_MATCH_BUFFER_KM);
  for (const candidate of originCandidates) {
    edges.push({
      id: `walk:start:${startNodeId}:${candidate.nodeId}`,
      fromNodeId: startNodeId,
      toNodeId: candidate.nodeId,
      mode: 'walk',
      distanceKm: candidate.distanceKm,
      etaMinutes: walkingMinutes(Math.round(candidate.distanceKm * 1000)),
      fare: 0,
      description: `Walk from origin to ${candidate.label}`,
    });
  }

  const destinationCandidates = findAccessCandidates(destination.coordinate, DEST_MATCH_BUFFER_KM);
  for (const candidate of destinationCandidates) {
    edges.push({
      id: `walk:end:${candidate.nodeId}:${endNodeId}`,
      fromNodeId: candidate.nodeId,
      toNodeId: endNodeId,
      mode: 'walk',
      distanceKm: candidate.distanceKm,
      etaMinutes: walkingMinutes(Math.round(candidate.distanceKm * 1000)),
      fare: 0,
      description: `Walk to destination from ${candidate.label}`,
    });
  }

  const adjacency = new Map<string, GraphEdge[]>();
  for (const edge of edges) {
    const list = adjacency.get(edge.fromNodeId) || [];
    list.push(edge);
    adjacency.set(edge.fromNodeId, list);
  }

  return {
    graph: {
      nodes,
      edges,
      adjacency,
    },
    startNodeId,
    endNodeId,
  };
}

function routeById(routeId: string): TransitRoute | undefined {
  return ROUTES.find((route) => route.routeId === routeId);
}

function mergeGeometries(geometries: GeoJSONCoordinate[][]): GeoJSONCoordinate[] {
  const merged: GeoJSONCoordinate[] = [];

  for (const geometry of geometries) {
    for (const coord of geometry) {
      const prev = merged[merged.length - 1];
      if (!prev || prev[0] !== coord[0] || prev[1] !== coord[1]) {
        merged.push(coord);
      }
    }
  }

  return merged;
}

function pathToOption(
  idPrefix: string,
  profile: Profile,
  pathEdges: GraphEdge[],
  graph: BaseGraph,
  destination: ResolvedLocation
): PlannedRouteOption | null {
  if (!pathEdges.length) {
    return null;
  }

  const legs: PlannedLeg[] = [];
  const mapSegments: RouteMapSegment[] = [];
  const mapMarkers: RouteMapMarker[] = [];

  let totalWalkMeters = 0;
  let transferDescription = '';
  const directions: string[] = [];

  const rideGroups: Array<{ routeId: string; edges: GraphEdge[] }> = [];

  for (const edge of pathEdges) {
    if (edge.mode === 'walk') {
      totalWalkMeters += Math.round(edge.distanceKm * 1000);
      continue;
    }

    const last = rideGroups[rideGroups.length - 1];
    if (last && last.routeId === edge.routeId) {
      last.edges.push(edge);
    } else if (edge.routeId) {
      rideGroups.push({ routeId: edge.routeId, edges: [edge] });
    }
  }

  if (!rideGroups.length) {
    return null;
  }

  for (let i = 0; i < rideGroups.length; i += 1) {
    const group = rideGroups[i];
    const firstEdge = group.edges[0];
    const lastEdge = group.edges[group.edges.length - 1];

    const route = routeById(group.routeId);
    if (!route) {
      continue;
    }

    const boardNode = graph.nodes.get(firstEdge.fromNodeId);
    const alightNode = graph.nodes.get(lastEdge.toNodeId);
    if (!boardNode || !alightNode) {
      continue;
    }

    const distanceKm = group.edges.reduce((sum, edge) => sum + edge.distanceKm, 0);
    const legFare = calculateFare(distanceKm);
    const legEta = estimateMinutes(distanceKm);

    const leg: PlannedLeg = {
      routeId: route.routeId,
      routeName: route.routeName,
      signboard: route.signboard,
      boardAt: boardNode.label,
      alightAt: alightNode.label,
      distanceKm: Number(distanceKm.toFixed(2)),
      estimatedMinutes: legEta,
      fare: legFare,
    };

    legs.push(leg);

    const segmentGeometry = mergeGeometries(
      group.edges
        .map((edge) => edge.geometry || [])
        .filter((geometry) => geometry.length > 1)
    );

    if (segmentGeometry.length > 1) {
      mapSegments.push({
        routeId: route.routeId,
        signboard: route.signboard,
        coordinates: segmentGeometry,
      });
    }

    mapMarkers.push({
      id: `${idPrefix}:board:${i}`,
      label: `Board: ${leg.boardAt}`,
      coordinate: boardNode.coordinate,
      kind: 'board',
    });

    mapMarkers.push({
      id: `${idPrefix}:alight:${i}`,
      label: i === rideGroups.length - 1 ? `Final Alight: ${leg.alightAt}` : `Alight: ${leg.alightAt}`,
      coordinate: alightNode.coordinate,
      kind: i === rideGroups.length - 1 ? 'alight' : 'transfer',
    });

    directions.push(`Board at ${leg.boardAt} with signboard ${leg.signboard}.`);
    directions.push(`Alight at ${leg.alightAt} after ${leg.distanceKm.toFixed(1)} km (${leg.estimatedMinutes} min).`);

    if (i < rideGroups.length - 1) {
      const nextGroup = rideGroups[i + 1];
      const nextBoardNode = graph.nodes.get(nextGroup.edges[0].fromNodeId);
      if (nextBoardNode) {
        const transferMeters = Math.round(haversineKm(alightNode.coordinate, nextBoardNode.coordinate) * 1000);
        transferDescription = transferDescription || `${transferMeters} m walk transfer`;
        directions.push(`Transfer near ${alightNode.label} and walk about ${transferMeters} m to ${nextBoardNode.label}.`);
      }
    }
  }

  const totalDistanceKm = Number(legs.reduce((sum, leg) => sum + leg.distanceKm, 0).toFixed(2));
  const totalFare = legs.reduce((sum, leg) => sum + leg.fare, 0);
  const rideEta = legs.reduce((sum, leg) => sum + leg.estimatedMinutes, 0);
  const totalEta = rideEta + walkingMinutes(totalWalkMeters);
  const transferCount = Math.max(0, legs.length - 1);

  directions.push(`Final stop reached. Walk to ${destination.label}.`);

  return {
    id: `${idPrefix}:${profile}:${legs.map((leg) => leg.routeId).join('__')}`,
    type: transferCount > 0 ? 'transfer' : 'direct',
    transferCount,
    title: transferCount > 0 ? legs.map((leg) => leg.routeName).join(' + ') : legs[0].routeName,
    subtitle:
      transferCount > 0
        ? `Transfer route with ${transferCount} transfer${transferCount > 1 ? 's' : ''}`
        : `Direct via ${legs[0].signboard}`,
    totalDistanceKm,
    totalFare,
    estimatedMinutes: totalEta,
    walkingMeters: totalWalkMeters,
    score: 0,
    summaryTags: [],
    legs,
    transferDescription: transferDescription || undefined,
    directions,
    mapSegments,
    mapMarkers,
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
  const fewerTransfers = [...sorted].sort((a, b) => a.transferCount - b.transferCount)[0];

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
  if (leastWalkTag && !leastWalkTag.summaryTags.includes('Least Walking')) {
    leastWalkTag.summaryTags.push('Least Walking');
  }

  const fewerTransfersTag = byId.get(fewerTransfers.id);
  if (fewerTransfersTag && !fewerTransfersTag.summaryTags.includes('Fewer Transfers')) {
    fewerTransfersTag.summaryTags.push('Fewer Transfers');
  }

  return sorted.map((item) => byId.get(item.id) || item);
}

function distanceFromCoordinates(coordinates: GeoJSONCoordinate[]): number {
  if (coordinates.length < 2) {
    return 0;
  }

  let total = 0;
  for (let i = 1; i < coordinates.length; i += 1) {
    total += haversineKm(coordinates[i - 1], coordinates[i]);
  }

  return total;
}

function mapPayloadToOption(payload: ResponsePayload): PlannedRouteOption {
  const transitSteps = payload.path_array.filter((step) => step.type === 'TRANSIT');
  const walkSteps = payload.path_array.filter((step) => step.type === 'WALK');

  const legs: PlannedLeg[] = transitSteps.map((step, index) => {
    const route = routeRegistry.get(step.route_id);
    const start = step.geometry.coordinates[0] || [0, 0];
    const end = step.geometry.coordinates[step.geometry.coordinates.length - 1] || start;

    return {
      routeId: step.route_id,
      routeName: route?.route_name || step.route_id,
      signboard: route?.route_name || step.instruction,
      boardAt: `${start[1].toFixed(5)}, ${start[0].toFixed(5)}`,
      alightAt: `${end[1].toFixed(5)}, ${end[0].toFixed(5)}`,
      distanceKm: step.distance_km,
      estimatedMinutes: step.duration_mins,
      fare: step.fare_cost,
    };
  });

  const mapSegments: RouteMapSegment[] = transitSteps.map((step, index) => ({
    routeId: `${step.route_id}:${index}`,
    signboard: step.instruction,
    coordinates: step.geometry.coordinates,
  }));

  const mapMarkers: RouteMapMarker[] = [];
  if (transitSteps.length > 0) {
    const first = transitSteps[0];
    const boardCoord = first.geometry.coordinates[0];
    if (boardCoord) {
      mapMarkers.push({
        id: 'board-0',
        label: 'Board here',
        coordinate: boardCoord,
        kind: 'board',
      });
    }

    for (let i = 0; i < transitSteps.length - 1; i += 1) {
      const current = transitSteps[i];
      const transferCoord = current.geometry.coordinates[current.geometry.coordinates.length - 1];
      if (transferCoord) {
        mapMarkers.push({
          id: `transfer-${i}`,
          label: 'Transfer point',
          coordinate: transferCoord,
          kind: 'transfer',
        });
      }
    }

    const last = transitSteps[transitSteps.length - 1];
    const alightCoord = last.geometry.coordinates[last.geometry.coordinates.length - 1];
    if (alightCoord) {
      mapMarkers.push({
        id: 'alight-final',
        label: 'Alight here',
        coordinate: alightCoord,
        kind: 'alight',
      });
    }
  }

  const walkingMeters = Math.round(
    walkSteps.reduce((sum, step) => sum + distanceFromCoordinates(step.geometry.coordinates), 0) * 1000
  );

  const totalDistanceKm = Number(
    (
      transitSteps.reduce((sum, step) => sum + step.distance_km, 0) +
      walkSteps.reduce((sum, step) => sum + distanceFromCoordinates(step.geometry.coordinates), 0)
    ).toFixed(2)
  );

  const transferCount = payload.summary.total_transfers;
  const type: PlannedRouteOption['type'] = transferCount > 0 ? 'transfer' : 'direct';

  const subtitle = `${totalDistanceKm.toFixed(1)} km • ${transferCount} transfer${transferCount === 1 ? '' : 's'} • ${walkingMeters} m walk`;

  return {
    id: payload.route_id,
    type,
    transferCount,
    title: transferCount > 0 ? 'Optimized Multi-Leg Route' : 'Optimized Direct Route',
    subtitle,
    totalDistanceKm,
    totalFare: payload.summary.total_fare,
    estimatedMinutes: payload.summary.total_time_mins,
    walkingMeters,
    score: transferCount * 10000 + payload.summary.total_time_mins * 100 + walkingMeters,
    summaryTags: ['Recommended', 'Fastest'],
    legs,
    transferDescription: transferCount > 0 ? `${transferCount} transfer point(s)` : undefined,
    directions: payload.path_array.map((step) => step.instruction),
    mapSegments,
    mapMarkers,
  };
}

async function searchTransitRoutesLegacy(input: SearchInput): Promise<TransitSearchResult> {
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

  const { graph, startNodeId, endNodeId } = buildSearchGraph(origin, destination);

  const profiles: Profile[] = [
    'recommended',
    'fastest',
    'cheapest',
    'leastWalk',
    'fewestTransfers',
  ];

  const options: PlannedRouteOption[] = [];

  for (const profile of profiles) {
    const pathEdges = runAStar(profile, graph, startNodeId, endNodeId, destination.coordinate);
    if (!pathEdges || !pathEdges.length) {
      continue;
    }

    const option = pathToOption(`option-${profile}`, profile, pathEdges, graph, destination);
    if (option) {
      options.push(option);
    }
  }

  const deduped = new Map<string, PlannedRouteOption>();
  for (const option of options) {
    const signature = `${option.legs.map((leg) => `${leg.routeId}:${leg.boardAt}:${leg.alightAt}`).join('|')}|${option.transferCount}`;
    if (!deduped.has(signature)) {
      deduped.set(signature, option);
    }
  }

  const ranked = rankOptions([...deduped.values()]).slice(0, 8);

  return {
    origin,
    destination,
    options: ranked,
  };
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

  try {
    await ensureRoutingRuntimeInitialized();

    const rawPath = findOptimalPath(origin.coordinate, destination.coordinate);
    const payload = formatResponsePayload(
      {
        origin: origin.coordinate,
        destination: destination.coordinate,
        path_history: rawPath,
        route_id: `graph-${Date.now()}`,
      },
      'Fastest_ETA'
    );

    return {
      origin,
      destination,
      options: [mapPayloadToOption(payload)],
    };
  } catch (error) {
    console.warn('[transitSearch] Graph pipeline failed; using legacy fallback', error);
    return searchTransitRoutesLegacy(input);
  }
}

export function getRouteGraphStats(): { nodeCount: number; edgeCount: number; intersectionCount: number } {
  return {
    nodeCount: BASE_GRAPH.nodes.size,
    edgeCount: BASE_GRAPH.edges.length,
    intersectionCount: INTERSECTIONS.length,
  };
}
