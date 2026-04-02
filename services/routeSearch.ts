import { useStore } from '../store/useStore';
import type { JeepneyRoute, RouteCoord } from '../types/routes';

/** A single leg of a transit journey */
export type RouteLeg = {
  route: JeepneyRoute;
  boardingPoint: { latitude: number; longitude: number };
  alightingPoint: { latitude: number; longitude: number };
  distanceKm: number;
  estimatedFare: number;
  estimatedMinutes: number;
};

export type MatchedRoute = {
  /** Array of 1+ legs (single ride or transfer) */
  legs: RouteLeg[];
  /** Total distance across all legs */
  distanceKm: number;
  /** Total fare (sum of each leg) */
  estimatedFare: number;
  /** Total time including walking between transfers */
  estimatedMinutes: number;
  /** Number of transfers (legs.length - 1) for ranking */
  transferCount: number;
  // -- kept for backward-compat with single-leg consumers --
  route: JeepneyRoute;
  boardingPoint: { latitude: number; longitude: number };
  alightingPoint: { latitude: number; longitude: number };
};

export type RankMode = 'easiest' | 'fastest' | 'cheapest';

/** Rank routes by the selected mode without mutating the input array */
export function rankRoutes(routes: MatchedRoute[], mode: RankMode): MatchedRoute[] {
  return [...routes].sort((a, b) => {
    switch (mode) {
      case 'easiest':
        return (
          a.transferCount - b.transferCount ||
          a.estimatedMinutes - b.estimatedMinutes ||
          a.estimatedFare - b.estimatedFare
        );
      case 'fastest':
        return (
          a.estimatedMinutes - b.estimatedMinutes ||
          a.transferCount - b.transferCount ||
          a.estimatedFare - b.estimatedFare
        );
      case 'cheapest':
        return (
          a.estimatedFare - b.estimatedFare ||
          a.estimatedMinutes - b.estimatedMinutes ||
          a.transferCount - b.transferCount
        );
    }
  });
}

const METERS_PER_DEG = 111_320;
const MIN_COS_LAT = 0.2;

const BUFFER_DISTANCE = 500; // meters
const TRANSFER_WALK_DISTANCE = 500; // meters
const AVG_SPEED_KMH = 15;
const WALK_SPEED_KMH = 4;

// Tuned to keep search responsive on mid-range phones.
const MAX_LINE_POINTS = 160;
const MAX_NEAR_CANDIDATES = 10;
const MAX_TRANSFER_SAMPLES = 24;
const MAX_MATCHED_RESULTS = 40;

// Multi-leg search safety limits.
const MAX_TRANSFERS = 4; // up to 5 legs
const MAX_STATE_EXPANSIONS = 420;
const MAX_FRONTIER_SIZE = 180;
const MAX_NEIGHBORS_PER_STATE = 8;
const MAX_NEIGHBOR_CANDIDATES = 28;
const MIN_LEG_DISTANCE_KM = 0.05;
const MAX_TOTAL_WALK_KM = 3.2;
const MIN_FORWARD_PROGRESS_KM = 0.01;
const SPATIAL_GRID_CELL_DEG = 0.01;

const JEEPNEY_BASE_FARE_REGULAR = 13;
const JEEPNEY_BASE_FARE_DISCOUNTED = 11;
const JEEPNEY_BASE_DISTANCE_KM = 4;
const JEEPNEY_DEFAULT_PER_KM_RATE = 1.8;

function getFareDiscountMultiplier(): number {
  const discountType = useStore.getState().user?.fare_discount_type || 'regular';
  return discountType === 'regular' ? 1 : 0.8;
}

function applyUserFareDiscount(rawFare: number): number {
  const multiplier = getFareDiscountMultiplier();
  return Math.max(1, Math.round(rawFare * multiplier));
}

function getPerKmRate(vehicleType: string, fallback: number): number {
  const fareMatrices = useStore.getState().fareMatrices || [];
  const matrix = fareMatrices.find((m: any) => m.vehicle_type === vehicleType);
  return Number(matrix?.per_km_rate) || fallback;
}

function calculateJeepneyFare(distanceKm: number): number {
  const discountType = useStore.getState().user?.fare_discount_type || 'regular';
  const billableKm = Math.max(1, Math.ceil(distanceKm));
  const perKmRate = getPerKmRate('jeepney', JEEPNEY_DEFAULT_PER_KM_RATE);
  const baseFare = discountType === 'regular' ? JEEPNEY_BASE_FARE_REGULAR : JEEPNEY_BASE_FARE_DISCOUNTED;

  if (billableKm <= JEEPNEY_BASE_DISTANCE_KM) return baseFare;

  const extraKm = billableKm - JEEPNEY_BASE_DISTANCE_KM;
  return Math.max(1, Math.round(baseFare + extraKm * perKmRate));
}

function calculateFare(distanceKm: number, vehicleType: string = 'jeepney'): number {
  const normalizedVehicleType = String(vehicleType || 'jeepney').toLowerCase();
  const normalizedType = normalizedVehicleType === 'uv' ? 'uv_express' : normalizedVehicleType;

  // Jeepney policy: first 4 km fixed (regular 13, discounted 11), then add per billable km.
  if (normalizedType === 'jeepney') {
    return calculateJeepneyFare(distanceKm);
  }

  let baseFare = 13.0;
  let baseDistance = 4.0;
  let perKmRate = JEEPNEY_DEFAULT_PER_KM_RATE;

  const fareMatrices = useStore.getState().fareMatrices || [];
  const matrix = fareMatrices.find((m: any) => m.vehicle_type === normalizedType);
  if (matrix) {
    baseFare = Number(matrix.base_fare) || baseFare;
    baseDistance = Number(matrix.base_distance) || baseDistance;
    perKmRate = Number(matrix.per_km_rate) || perKmRate;
  }

  if (distanceKm <= baseDistance) return applyUserFareDiscount(baseFare);

  const extraKm = distanceKm - baseDistance;
  const raw = baseFare + extraKm * perKmRate;

  return applyUserFareDiscount(raw);
}

function lonScaleAtLat(lat: number): number {
  const cos = Math.max(MIN_COS_LAT, Math.abs(Math.cos((lat * Math.PI) / 180)));
  return METERS_PER_DEG * cos;
}

function segmentDistanceMeters(a: RouteCoord, b: RouteCoord): number {
  const refLat = (a.latitude + b.latitude) / 2;
  const dx = (a.longitude - b.longitude) * lonScaleAtLat(refLat);
  const dy = (a.latitude - b.latitude) * METERS_PER_DEG;
  return Math.sqrt(dx * dx + dy * dy);
}

function simplifyCoordinates(coordinates: RouteCoord[], maxPoints: number): RouteCoord[] {
  if (coordinates.length <= maxPoints) return coordinates;

  const step = (coordinates.length - 1) / (maxPoints - 1);
  const sampled: RouteCoord[] = [];

  for (let i = 0; i < maxPoints - 1; i++) {
    sampled.push(coordinates[Math.round(i * step)]);
  }

  sampled.push(coordinates[coordinates.length - 1]);
  return sampled;
}

type SnapResult = {
  latitude: number;
  longitude: number;
  distanceMeters: number;
  alongKm: number;
};

type TransferSample = {
  point: RouteCoord;
  alongKm: number;
};

type RouteBBox = {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
};

type RouteIndex = {
  coords: RouteCoord[];
  cumulativeMeters: number[];
  bbox: RouteBBox;
  transferSamples: TransferSample[];
};

type TransferCandidate = {
  pointA: { latitude: number; longitude: number };
  pointB: { latitude: number; longitude: number };
  alongAKm: number;
  alongBKm: number;
  walkDistanceKm: number;
};

type SnapCandidate = {
  info: RouteInfo;
  snap: SnapResult;
  meters: number;
};

type AlongPoint = {
  latitude: number;
  longitude: number;
  alongKm: number;
};

type RouteInfo = {
  route: JeepneyRoute;
  index: RouteIndex;
  code: string;
};

type NeighborCandidate = {
  next: RouteInfo;
  transfer: TransferCandidate;
  heuristic: number;
};

type SearchState = {
  current: RouteInfo;
  entry: AlongPoint;
  legs: RouteLeg[];
  totalDistanceKm: number;
  totalFare: number;
  totalMinutes: number;
  totalWalkKm: number;
  transferCount: number;
  usedCodes: Set<string>;
};

type QueuedState = {
  state: SearchState;
  priority: number;
};

type RouteSearchDataset = {
  infos: RouteInfo[];
  codeToIndex: Map<string, number>;
  pointGrid: Map<string, number[]>;
  neighborCandidatesByCode: Map<string, number[]>;
};

const routeIndexCache = new WeakMap<JeepneyRoute, RouteIndex>();
const transferPairCache = new Map<string, TransferCandidate | null>();
const routeSearchDatasetCache = new WeakMap<JeepneyRoute[], RouteSearchDataset>();

function buildTransferSamples(coords: RouteCoord[], cumulativeMeters: number[]): TransferSample[] {
  if (coords.length === 0) return [];
  if (coords.length <= MAX_TRANSFER_SAMPLES) {
    return coords.map((point, idx) => ({ point, alongKm: (cumulativeMeters[idx] || 0) / 1000 }));
  }

  const samples: TransferSample[] = [];
  const step = (coords.length - 1) / (MAX_TRANSFER_SAMPLES - 1);
  for (let i = 0; i < MAX_TRANSFER_SAMPLES - 1; i++) {
    const idx = Math.round(i * step);
    samples.push({ point: coords[idx], alongKm: (cumulativeMeters[idx] || 0) / 1000 });
  }

  const lastIdx = coords.length - 1;
  samples.push({ point: coords[lastIdx], alongKm: (cumulativeMeters[lastIdx] || 0) / 1000 });
  return samples;
}

function buildRouteIndex(route: JeepneyRoute): RouteIndex {
  const coords = simplifyCoordinates(route.coordinates, MAX_LINE_POINTS);

  const cumulativeMeters: number[] = [0];
  for (let i = 1; i < coords.length; i++) {
    cumulativeMeters[i] = cumulativeMeters[i - 1] + segmentDistanceMeters(coords[i - 1], coords[i]);
  }

  let minLat = Number.POSITIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  let minLng = Number.POSITIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;

  for (const c of coords) {
    if (c.latitude < minLat) minLat = c.latitude;
    if (c.latitude > maxLat) maxLat = c.latitude;
    if (c.longitude < minLng) minLng = c.longitude;
    if (c.longitude > maxLng) maxLng = c.longitude;
  }

  return {
    coords,
    cumulativeMeters,
    bbox: { minLat, maxLat, minLng, maxLng },
    transferSamples: buildTransferSamples(coords, cumulativeMeters),
  };
}

function getRouteIndex(route: JeepneyRoute): RouteIndex {
  const cached = routeIndexCache.get(route);
  if (cached) return cached;

  const idx = buildRouteIndex(route);
  routeIndexCache.set(route, idx);
  return idx;
}

function gridCellKey(latitude: number, longitude: number): string {
  const row = Math.floor(latitude / SPATIAL_GRID_CELL_DEG);
  const col = Math.floor(longitude / SPATIAL_GRID_CELL_DEG);
  return `${row}:${col}`;
}

function collectPointGridCandidates(
  grid: Map<string, number[]>,
  point: { latitude: number; longitude: number },
  radiusMeters: number,
): Set<number> {
  const latPad = radiusMeters / METERS_PER_DEG;
  const lngPad = radiusMeters / lonScaleAtLat(point.latitude);

  const minRow = Math.floor((point.latitude - latPad) / SPATIAL_GRID_CELL_DEG);
  const maxRow = Math.floor((point.latitude + latPad) / SPATIAL_GRID_CELL_DEG);
  const minCol = Math.floor((point.longitude - lngPad) / SPATIAL_GRID_CELL_DEG);
  const maxCol = Math.floor((point.longitude + lngPad) / SPATIAL_GRID_CELL_DEG);

  const out = new Set<number>();
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const key = `${row}:${col}`;
      const bucket = grid.get(key);
      if (!bucket) continue;
      for (const idx of bucket) out.add(idx);
    }
  }

  return out;
}

function buildRouteSearchDataset(routes: JeepneyRoute[]): RouteSearchDataset {
  const infos: RouteInfo[] = [];
  const codeToIndex = new Map<string, number>();
  const pointGrid = new Map<string, number[]>();

  for (const route of routes) {
    if (route.coordinates.length < 2) continue;

    const info: RouteInfo = {
      route,
      index: getRouteIndex(route),
      code: route.properties.code,
    };

    const idx = infos.length;
    infos.push(info);
    codeToIndex.set(info.code, idx);

    // Index simplified route points into a spatial hash for fast candidate lookup.
    const seenCells = new Set<string>();
    for (const point of info.index.coords) {
      const key = gridCellKey(point.latitude, point.longitude);
      if (seenCells.has(key)) continue;
      seenCells.add(key);

      const bucket = pointGrid.get(key);
      if (bucket) {
        bucket.push(idx);
      } else {
        pointGrid.set(key, [idx]);
      }
    }
  }

  return {
    infos,
    codeToIndex,
    pointGrid,
    neighborCandidatesByCode: new Map<string, number[]>(),
  };
}

function getRouteSearchDataset(routes: JeepneyRoute[]): RouteSearchDataset {
  const cached = routeSearchDatasetCache.get(routes);
  if (cached) return cached;

  const dataset = buildRouteSearchDataset(routes);
  routeSearchDatasetCache.set(routes, dataset);
  return dataset;
}

function getPotentialNeighborIndexes(
  dataset: RouteSearchDataset,
  fromInfo: RouteInfo,
): number[] {
  const cached = dataset.neighborCandidatesByCode.get(fromInfo.code);
  if (cached) return cached;

  const fromIdx = dataset.codeToIndex.get(fromInfo.code);
  const candidates = new Set<number>();

  const coords = fromInfo.index.coords;
  if (coords.length > 0) {
    const stride = Math.max(1, Math.floor(coords.length / MAX_TRANSFER_SAMPLES));
    for (let i = 0; i < coords.length; i += stride) {
      const near = collectPointGridCandidates(
        dataset.pointGrid,
        coords[i],
        TRANSFER_WALK_DISTANCE * 1.5,
      );
      for (const idx of near) candidates.add(idx);
    }

    const last = coords[coords.length - 1];
    const nearLast = collectPointGridCandidates(
      dataset.pointGrid,
      last,
      TRANSFER_WALK_DISTANCE * 1.5,
    );
    for (const idx of nearLast) candidates.add(idx);
  }

  if (fromIdx !== undefined) candidates.delete(fromIdx);

  const out = Array.from(candidates);
  dataset.neighborCandidatesByCode.set(fromInfo.code, out);
  return out;
}

function pointCouldBeNearRoute(
  point: { latitude: number; longitude: number },
  bbox: RouteBBox,
  bufferMeters: number,
): boolean {
  const latPad = bufferMeters / METERS_PER_DEG;
  const lngPad = bufferMeters / lonScaleAtLat(point.latitude);

  return !(
    point.latitude < bbox.minLat - latPad ||
    point.latitude > bbox.maxLat + latPad ||
    point.longitude < bbox.minLng - lngPad ||
    point.longitude > bbox.maxLng + lngPad
  );
}

function snapPointToRoute(
  point: { latitude: number; longitude: number },
  index: RouteIndex,
): SnapResult {
  const coords = index.coords;
  if (coords.length === 0) {
    return {
      latitude: point.latitude,
      longitude: point.longitude,
      distanceMeters: Number.POSITIVE_INFINITY,
      alongKm: 0,
    };
  }

  if (coords.length === 1) {
    const dist = segmentDistanceMeters(coords[0], point as RouteCoord);
    return {
      latitude: coords[0].latitude,
      longitude: coords[0].longitude,
      distanceMeters: dist,
      alongKm: 0,
    };
  }

  let bestDistSq = Number.POSITIVE_INFINITY;
  let bestLat = coords[0].latitude;
  let bestLng = coords[0].longitude;
  let bestAlongMeters = 0;

  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i];
    const b = coords[i + 1];

    const refLat = (point.latitude + a.latitude + b.latitude) / 3;
    const lonScale = lonScaleAtLat(refLat);

    const ax = (a.longitude - point.longitude) * lonScale;
    const ay = (a.latitude - point.latitude) * METERS_PER_DEG;
    const bx = (b.longitude - point.longitude) * lonScale;
    const by = (b.latitude - point.latitude) * METERS_PER_DEG;

    const abx = bx - ax;
    const aby = by - ay;
    const lenSq = abx * abx + aby * aby;

    let t = 0;
    if (lenSq > 0) {
      t = -(ax * abx + ay * aby) / lenSq;
      if (t < 0) t = 0;
      if (t > 1) t = 1;
    }

    const projX = ax + t * abx;
    const projY = ay + t * aby;
    const distSq = projX * projX + projY * projY;

    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      bestLat = point.latitude + projY / METERS_PER_DEG;
      bestLng = point.longitude + projX / lonScale;

      const segLenMeters = index.cumulativeMeters[i + 1] - index.cumulativeMeters[i];
      bestAlongMeters = index.cumulativeMeters[i] + segLenMeters * t;
    }
  }

  return {
    latitude: bestLat,
    longitude: bestLng,
    distanceMeters: Math.sqrt(bestDistSq),
    alongKm: bestAlongMeters / 1000,
  };
}

function snapPointToRouteForward(
  point: { latitude: number; longitude: number },
  index: RouteIndex,
  minAlongKm: number,
): SnapResult | null {
  const coords = index.coords;
  if (coords.length < 2) return null;

  const minAlongMeters = Math.max(0, minAlongKm * 1000);

  let bestDistSq = Number.POSITIVE_INFINITY;
  let bestLat = coords[0].latitude;
  let bestLng = coords[0].longitude;
  let bestAlongMeters = 0;
  let found = false;

  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i];
    const b = coords[i + 1];

    const segStartMeters = index.cumulativeMeters[i] || 0;
    const segEndMeters = index.cumulativeMeters[i + 1] || segStartMeters;
    const segLenMeters = Math.max(0, segEndMeters - segStartMeters);

    if (segEndMeters < minAlongMeters) continue;

    const refLat = (point.latitude + a.latitude + b.latitude) / 3;
    const lonScale = lonScaleAtLat(refLat);

    const ax = (a.longitude - point.longitude) * lonScale;
    const ay = (a.latitude - point.latitude) * METERS_PER_DEG;
    const bx = (b.longitude - point.longitude) * lonScale;
    const by = (b.latitude - point.latitude) * METERS_PER_DEG;

    const abx = bx - ax;
    const aby = by - ay;
    const lenSq = abx * abx + aby * aby;

    let t = 0;
    if (lenSq > 0) {
      t = -(ax * abx + ay * aby) / lenSq;
    }

    let minT = 0;
    if (segLenMeters > 0 && minAlongMeters > segStartMeters) {
      minT = (minAlongMeters - segStartMeters) / segLenMeters;
    }

    if (t < minT) t = minT;
    if (t < 0) t = 0;
    if (t > 1) t = 1;

    const alongMeters = segStartMeters + segLenMeters * t;
    if (alongMeters < minAlongMeters) continue;

    const projX = ax + t * abx;
    const projY = ay + t * aby;
    const distSq = projX * projX + projY * projY;

    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      bestLat = point.latitude + projY / METERS_PER_DEG;
      bestLng = point.longitude + projX / lonScale;
      bestAlongMeters = alongMeters;
      found = true;
    }
  }

  if (!found) return null;

  return {
    latitude: bestLat,
    longitude: bestLng,
    distanceMeters: Math.sqrt(bestDistSq),
    alongKm: bestAlongMeters / 1000,
  };
}

function buildLegFromAlong(route: JeepneyRoute, from: AlongPoint, to: AlongPoint): RouteLeg | null {
  const distanceKm = to.alongKm - from.alongKm;
  if (distanceKm <= MIN_FORWARD_PROGRESS_KM) return null;

  return {
    route,
    boardingPoint: { latitude: from.latitude, longitude: from.longitude },
    alightingPoint: { latitude: to.latitude, longitude: to.longitude },
    distanceKm,
    estimatedFare: calculateFare(distanceKm, route?.properties?.type || 'jeepney'),
    estimatedMinutes: Math.ceil((distanceKm / AVG_SPEED_KMH) * 60),
  };
}

function transferCacheKey(aCode: string, bCode: string): string {
  return `${aCode}__${bCode}`;
}

function findBestSampleTransfer(
  sourceSamples: TransferSample[],
  targetIndex: RouteIndex,
): { source: TransferSample; targetSnap: SnapResult } | null {
  let bestSource: TransferSample | null = null;
  let bestSnap: SnapResult | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const sample of sourceSamples) {
    const snap = snapPointToRoute(sample.point, targetIndex);
    if (snap.distanceMeters >= bestDistance) continue;

    bestDistance = snap.distanceMeters;
    bestSource = sample;
    bestSnap = snap;
  }

  if (!bestSource || !bestSnap) return null;
  return { source: bestSource, targetSnap: bestSnap };
}

function findTransferCandidate(
  aCode: string,
  aIndex: RouteIndex,
  bCode: string,
  bIndex: RouteIndex,
): TransferCandidate | null {
  const key = transferCacheKey(aCode, bCode);
  if (transferPairCache.has(key)) {
    return transferPairCache.get(key) ?? null;
  }

  const forward = findBestSampleTransfer(aIndex.transferSamples, bIndex);
  const backward = findBestSampleTransfer(bIndex.transferSamples, aIndex);

  let best: TransferCandidate | null = null;

  if (forward) {
    best = {
      pointA: {
        latitude: forward.source.point.latitude,
        longitude: forward.source.point.longitude,
      },
      pointB: {
        latitude: forward.targetSnap.latitude,
        longitude: forward.targetSnap.longitude,
      },
      alongAKm: forward.source.alongKm,
      alongBKm: forward.targetSnap.alongKm,
      walkDistanceKm: forward.targetSnap.distanceMeters / 1000,
    };
  }

  if (backward) {
    const candidate: TransferCandidate = {
      pointA: {
        latitude: backward.targetSnap.latitude,
        longitude: backward.targetSnap.longitude,
      },
      pointB: {
        latitude: backward.source.point.latitude,
        longitude: backward.source.point.longitude,
      },
      alongAKm: backward.targetSnap.alongKm,
      alongBKm: backward.source.alongKm,
      walkDistanceKm: backward.targetSnap.distanceMeters / 1000,
    };

    if (!best || candidate.walkDistanceKm < best.walkDistanceKm) {
      best = candidate;
    }
  }

  const result = best && best.walkDistanceKm * 1000 <= TRANSFER_WALK_DISTANCE ? best : null;
  transferPairCache.set(key, result);
  return result;
}

function bboxGapMeters(a: RouteBBox, b: RouteBBox): number {
  const latGap = Math.max(0, Math.max(a.minLat, b.minLat) - Math.min(a.maxLat, b.maxLat));
  const lngGap = Math.max(0, Math.max(a.minLng, b.minLng) - Math.min(a.maxLng, b.maxLng));

  if (latGap === 0 && lngGap === 0) return 0;

  const refLat = (a.minLat + a.maxLat + b.minLat + b.maxLat) / 4;
  const dy = latGap * METERS_PER_DEG;
  const dx = lngGap * lonScaleAtLat(refLat);
  return Math.sqrt(dx * dx + dy * dy);
}

function statePriority(state: SearchState, destHintMeters: number): number {
  const transferPenalty = state.transferCount * 4;
  const walkPenalty = state.totalWalkKm * 9;
  const destPenalty = destHintMeters / 200;
  return state.totalMinutes + transferPenalty + walkPenalty + destPenalty;
}

function buildMatchedRoute(legs: RouteLeg[], totalMinutes: number, totalFare: number, totalDistanceKm: number): MatchedRoute {
  const first = legs[0];
  const last = legs[legs.length - 1];

  return {
    legs,
    distanceKm: totalDistanceKm,
    estimatedFare: totalFare,
    estimatedMinutes: totalMinutes,
    transferCount: Math.max(0, legs.length - 1),
    route: first.route,
    boardingPoint: first.boardingPoint,
    alightingPoint: last.alightingPoint,
  };
}

/**
 * Find all transit routes (single or multi-transfer) from origin to destination.
 */
export function findRoutesForDestination(
  origin: { latitude: number; longitude: number },
  destination: { latitude: number; longitude: number },
  routes: JeepneyRoute[],
  bufferMeters: number = BUFFER_DISTANCE,
): MatchedRoute[] {
  const dataset = getRouteSearchDataset(routes);
  const allInfos = dataset.infos;
  const nearOriginRanked: SnapCandidate[] = [];
  const nearDestByCode = new Map<string, SnapCandidate>();
  const destHintByCode = new Map<string, number>();

  if (allInfos.length === 0) return [];

  const considerRoute = (info: RouteInfo) => {
    if (pointCouldBeNearRoute(origin, info.index.bbox, bufferMeters)) {
      const originSnap = snapPointToRoute(origin, info.index);
      if (originSnap.distanceMeters <= bufferMeters) {
        nearOriginRanked.push({
          info,
          snap: originSnap,
          meters: originSnap.distanceMeters,
        });
      }
    }

    if (pointCouldBeNearRoute(destination, info.index.bbox, bufferMeters)) {
      const destSnap = snapPointToRoute(destination, info.index);
      if (destSnap.distanceMeters <= bufferMeters) {
        const existing = nearDestByCode.get(info.code);
        if (!existing || destSnap.distanceMeters < existing.meters) {
          nearDestByCode.set(info.code, {
            info,
            snap: destSnap,
            meters: destSnap.distanceMeters,
          });
          destHintByCode.set(info.code, destSnap.distanceMeters);
        }
      }
    }
  };

  const candidateIndexes = new Set<number>();
  const endpointScanRadius = Math.max(bufferMeters * 1.5, 700);

  for (const idx of collectPointGridCandidates(dataset.pointGrid, origin, endpointScanRadius)) {
    candidateIndexes.add(idx);
  }
  for (const idx of collectPointGridCandidates(dataset.pointGrid, destination, endpointScanRadius)) {
    candidateIndexes.add(idx);
  }

  if (candidateIndexes.size > 0) {
    for (const idx of candidateIndexes) {
      const info = allInfos[idx];
      if (!info) continue;
      considerRoute(info);
    }
  }

  // Safety fallback: if candidate pruning misses endpoints, do a full scan.
  if (nearOriginRanked.length === 0 || nearDestByCode.size === 0) {
    nearOriginRanked.length = 0;
    nearDestByCode.clear();
    destHintByCode.clear();

    for (const info of allInfos) {
      considerRoute(info);
    }
  }

  if (nearDestByCode.size === 0) return [];

  nearOriginRanked.sort((a, b) => a.meters - b.meters);
  const startCandidates = nearOriginRanked.slice(0, MAX_NEAR_CANDIDATES);
  if (startCandidates.length === 0) return [];

  const neighborMemo = new Map<string, NeighborCandidate[]>();

  const getNeighbors = (fromInfo: RouteInfo): NeighborCandidate[] => {
    const cached = neighborMemo.get(fromInfo.code);
    if (cached) return cached;

    const candidates: NeighborCandidate[] = [];
    const neighborIndexes = getPotentialNeighborIndexes(dataset, fromInfo);
    for (const idx of neighborIndexes) {
      const toInfo = allInfos[idx];
      if (!toInfo || toInfo.code === fromInfo.code) continue;

      const bboxGap = bboxGapMeters(fromInfo.index.bbox, toInfo.index.bbox);
      if (bboxGap > TRANSFER_WALK_DISTANCE * 1.35) continue;

      const transfer = findTransferCandidate(fromInfo.code, fromInfo.index, toInfo.code, toInfo.index);
      if (!transfer) continue;

      const destHint = destHintByCode.get(toInfo.code) ?? 4000;
      const heuristic = transfer.walkDistanceKm * 1000 + destHint;

      candidates.push({
        next: toInfo,
        transfer,
        heuristic,
      });
    }

    candidates.sort((a, b) => a.heuristic - b.heuristic);
    const trimmed = candidates.slice(0, MAX_NEIGHBOR_CANDIDATES);
    neighborMemo.set(fromInfo.code, trimmed);
    return trimmed;
  };

  const resultBySignature = new Map<string, MatchedRoute>();
  const bestStateScore = new Map<string, number>();
  const frontier: QueuedState[] = [];

  const seededCodes = new Set<string>();
  for (const start of startCandidates) {
    if (seededCodes.has(start.info.code)) continue;
    seededCodes.add(start.info.code);

    const state: SearchState = {
      current: start.info,
      entry: {
        latitude: start.snap.latitude,
        longitude: start.snap.longitude,
        alongKm: start.snap.alongKm,
      },
      legs: [],
      totalDistanceKm: 0,
      totalFare: 0,
      totalMinutes: 0,
      totalWalkKm: 0,
      transferCount: 0,
      usedCodes: new Set([start.info.code]),
    };

    frontier.push({
      state,
      priority: statePriority(state, destHintByCode.get(start.info.code) ?? 4000),
    });
  }

  let expansions = 0;
  while (
    frontier.length > 0 &&
    expansions < MAX_STATE_EXPANSIONS &&
    resultBySignature.size < MAX_MATCHED_RESULTS
  ) {
    frontier.sort((a, b) => a.priority - b.priority);
    const queued = frontier.shift();
    if (!queued) break;

    const state = queued.state;
    expansions += 1;

    const destCandidate = nearDestByCode.get(state.current.code);
    if (destCandidate) {
      const forwardDestSnap = snapPointToRouteForward(
        destination,
        state.current.index,
        state.entry.alongKm + MIN_FORWARD_PROGRESS_KM,
      );

      if (!forwardDestSnap || forwardDestSnap.distanceMeters > bufferMeters) {
        continue;
      }

      const finalLeg = buildLegFromAlong(state.current.route, state.entry, forwardDestSnap);
      if (!finalLeg) continue;

      if (finalLeg.distanceKm >= MIN_LEG_DISTANCE_KM || state.legs.length === 0) {
        const legs = [...state.legs, finalLeg];
        const totalDistanceKm = state.totalDistanceKm + finalLeg.distanceKm;
        const totalFare = state.totalFare + finalLeg.estimatedFare;
        const totalMinutes = state.totalMinutes + finalLeg.estimatedMinutes;

        const matched = buildMatchedRoute(legs, totalMinutes, totalFare, totalDistanceKm);
        const sig = legs.map((leg) => leg.route.properties.code).join('>');
        const prev = resultBySignature.get(sig);

        if (!prev || matched.estimatedMinutes < prev.estimatedMinutes) {
          resultBySignature.set(sig, matched);
        }
      }
    }

    if (state.transferCount >= MAX_TRANSFERS) continue;
    if (state.totalWalkKm >= MAX_TOTAL_WALK_KM) continue;

    const neighbors = getNeighbors(state.current);
    let expanded = 0;

    for (const neighbor of neighbors) {
      if (expanded >= MAX_NEIGHBORS_PER_STATE) break;
      if (state.usedCodes.has(neighbor.next.code)) continue;

      const transferOnCurrent: AlongPoint = {
        latitude: neighbor.transfer.pointA.latitude,
        longitude: neighbor.transfer.pointA.longitude,
        alongKm: neighbor.transfer.alongAKm,
      };

      const currentLeg = buildLegFromAlong(state.current.route, state.entry, transferOnCurrent);
      if (!currentLeg) continue;
      if (currentLeg.distanceKm < MIN_LEG_DISTANCE_KM) continue;

      const walkKm = neighbor.transfer.walkDistanceKm;
      const nextTotalWalkKm = state.totalWalkKm + walkKm;
      if (nextTotalWalkKm > MAX_TOTAL_WALK_KM) continue;

      const walkMin = Math.ceil((walkKm / WALK_SPEED_KMH) * 60);

      const nextState: SearchState = {
        current: neighbor.next,
        entry: {
          latitude: neighbor.transfer.pointB.latitude,
          longitude: neighbor.transfer.pointB.longitude,
          alongKm: neighbor.transfer.alongBKm,
        },
        legs: [...state.legs, currentLeg],
        totalDistanceKm: state.totalDistanceKm + currentLeg.distanceKm,
        totalFare: state.totalFare + currentLeg.estimatedFare,
        totalMinutes: state.totalMinutes + currentLeg.estimatedMinutes + walkMin,
        totalWalkKm: nextTotalWalkKm,
        transferCount: state.transferCount + 1,
        usedCodes: new Set(state.usedCodes).add(neighbor.next.code),
      };

      const bucketAlong = Math.round(nextState.entry.alongKm * 5); // 200m bins
      const stateKey = `${nextState.current.code}|${nextState.transferCount}|${bucketAlong}`;
      const score = nextState.totalMinutes + nextState.transferCount * 4 + nextState.totalWalkKm * 9;
      const bestScore = bestStateScore.get(stateKey);

      if (bestScore !== undefined && score >= bestScore) continue;

      bestStateScore.set(stateKey, score);

      frontier.push({
        state: nextState,
        priority: statePriority(nextState, destHintByCode.get(nextState.current.code) ?? 4000),
      });
      expanded += 1;
    }

    if (frontier.length > MAX_FRONTIER_SIZE) {
      frontier.sort((a, b) => a.priority - b.priority);
      frontier.length = MAX_FRONTIER_SIZE;
    }
  }

  const matched = Array.from(resultBySignature.values());
  matched.sort((a, b) => {
    return (
      a.transferCount - b.transferCount ||
      a.estimatedMinutes - b.estimatedMinutes ||
      a.estimatedFare - b.estimatedFare
    );
  });

  return matched.slice(0, MAX_MATCHED_RESULTS);
}
