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

const BUFFER_DISTANCE = 1000; // meters
const TRANSFER_WALK_DISTANCE = 800; // meters
const AVG_SPEED_KMH = 15;
const WALK_SPEED_KMH = 4;

// Tuned to keep search responsive on mid-range phones.
const MAX_LINE_POINTS = 160;
const MAX_NEAR_CANDIDATES = 10;
const MAX_TRANSFER_SAMPLES = 24;
const MAX_TRANSFER_PAIRS = 36;
const MAX_MATCHED_RESULTS = 40;

/**
 * LTFRB Jeepney Fare Matrix (PUJ – Traditional)
 * First 4 km = P13.00, then P1.80 per succeeding km.
 */
const FARE_TABLE: [number, number][] = [
  [4, 13.0],
  [5, 14.75],
  [6, 16.5],
  [7, 18.25],
  [8, 20.0],
  [9, 21.75],
  [10, 23.5],
  [11, 25.25],
  [12, 27.0],
  [13, 28.75],
  [14, 30.5],
  [15, 32.25],
  [16, 34.0],
  [17, 35.75],
  [18, 37.5],
  [19, 39.25],
  [20, 41.0],
  [21, 42.75],
  [22, 44.5],
  [23, 46.25],
  [24, 48.0],
  [25, 49.75],
];

function calculateFare(distanceKm: number): number {
  if (distanceKm <= 4) return 13.0;

  const rounded = Math.ceil(distanceKm);
  const entry = FARE_TABLE.find(([km]) => km === rounded);
  if (entry) return entry[1];

  const extraKm = distanceKm - 4;
  const raw = 13.0 + extraKm * 1.8;
  return Math.ceil(raw * 4) / 4;
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

type RouteIndex = {
  coords: RouteCoord[];
  cumulativeMeters: number[];
  bbox: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  };
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
  route: JeepneyRoute;
  index: RouteIndex;
  snap: SnapResult;
  meters: number;
};

const routeIndexCache = new WeakMap<JeepneyRoute, RouteIndex>();
const transferPairCache = new Map<string, TransferCandidate | null>();

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

function pointCouldBeNearRoute(
  point: { latitude: number; longitude: number },
  bbox: RouteIndex['bbox'],
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

type AlongPoint = {
  latitude: number;
  longitude: number;
  alongKm: number;
};

function buildLegFromAlong(route: JeepneyRoute, from: AlongPoint, to: AlongPoint): RouteLeg {
  const distanceKm = Math.abs(to.alongKm - from.alongKm);

  return {
    route,
    boardingPoint: { latitude: from.latitude, longitude: from.longitude },
    alightingPoint: { latitude: to.latitude, longitude: to.longitude },
    distanceKm,
    estimatedFare: calculateFare(distanceKm),
    estimatedMinutes: Math.ceil((distanceKm / AVG_SPEED_KMH) * 60),
  };
}

function transferCacheKey(aCode: string, bCode: string): string {
  return `${aCode}__${bCode}`;
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

  let bestDistance = Number.POSITIVE_INFINITY;
  let best: TransferCandidate | null = null;

  for (const sample of aIndex.transferSamples) {
    const snapOnB = snapPointToRoute(sample.point, bIndex);
    if (snapOnB.distanceMeters >= bestDistance) continue;

    bestDistance = snapOnB.distanceMeters;
    best = {
      pointA: {
        latitude: sample.point.latitude,
        longitude: sample.point.longitude,
      },
      pointB: {
        latitude: snapOnB.latitude,
        longitude: snapOnB.longitude,
      },
      alongAKm: sample.alongKm,
      alongBKm: snapOnB.alongKm,
      walkDistanceKm: snapOnB.distanceMeters / 1000,
    };
  }

  const result = best && bestDistance <= TRANSFER_WALK_DISTANCE ? best : null;
  transferPairCache.set(key, result);
  return result;
}

/**
 * Find all transit routes (single or 2-leg transfers) from origin to destination.
 */
export function findRoutesForDestination(
  origin: { latitude: number; longitude: number },
  destination: { latitude: number; longitude: number },
  routes: JeepneyRoute[],
  bufferMeters: number = BUFFER_DISTANCE,
): MatchedRoute[] {
  const nearOriginRanked: SnapCandidate[] = [];
  const nearDestRanked: SnapCandidate[] = [];

  for (const route of routes) {
    if (route.coordinates.length < 2) continue;
    const index = getRouteIndex(route);

    if (pointCouldBeNearRoute(origin, index.bbox, bufferMeters)) {
      const originSnap = snapPointToRoute(origin, index);
      if (originSnap.distanceMeters <= bufferMeters) {
        nearOriginRanked.push({
          route,
          index,
          snap: originSnap,
          meters: originSnap.distanceMeters,
        });
      }
    }

    if (pointCouldBeNearRoute(destination, index.bbox, bufferMeters)) {
      const destSnap = snapPointToRoute(destination, index);
      if (destSnap.distanceMeters <= bufferMeters) {
        nearDestRanked.push({
          route,
          index,
          snap: destSnap,
          meters: destSnap.distanceMeters,
        });
      }
    }
  }

  nearOriginRanked.sort((a, b) => a.meters - b.meters);
  nearDestRanked.sort((a, b) => a.meters - b.meters);

  const nearOrigin = nearOriginRanked.slice(0, MAX_NEAR_CANDIDATES);
  const nearDest = nearDestRanked.slice(0, MAX_NEAR_CANDIDATES);

  const nearDestByCode = new Map<string, SnapCandidate>();
  for (const info of nearDest) {
    nearDestByCode.set(info.route.properties.code, info);
  }

  const matched: MatchedRoute[] = [];
  const seen = new Set<string>();

  // Single-leg routes.
  for (const info of nearOrigin) {
    const code = info.route.properties.code;
    const destInfo = nearDestByCode.get(code);
    if (!destInfo) continue;

    const leg = buildLegFromAlong(info.route, info.snap, destInfo.snap);
    if (seen.has(code)) continue;
    seen.add(code);

    matched.push({
      legs: [leg],
      distanceKm: leg.distanceKm,
      estimatedFare: leg.estimatedFare,
      estimatedMinutes: leg.estimatedMinutes,
      transferCount: 0,
      route: leg.route,
      boardingPoint: leg.boardingPoint,
      alightingPoint: leg.alightingPoint,
    });
  }

  // Transfer routes, ranked by proximity score before deeper evaluation.
  const transferPairs: Array<{ a: SnapCandidate; b: SnapCandidate; score: number }> = [];
  for (const a of nearOrigin) {
    for (const b of nearDest) {
      if (a.route.properties.code === b.route.properties.code) continue;
      transferPairs.push({ a, b, score: a.meters + b.meters });
    }
  }

  transferPairs.sort((x, y) => x.score - y.score);

  let evaluatedPairs = 0;
  for (const pair of transferPairs) {
    if (evaluatedPairs >= MAX_TRANSFER_PAIRS) break;

    const aCode = pair.a.route.properties.code;
    const bCode = pair.b.route.properties.code;
    const key = `${aCode}+${bCode}`;
    if (seen.has(key)) continue;

    evaluatedPairs += 1;

    const transfer = findTransferCandidate(aCode, pair.a.index, bCode, pair.b.index);
    if (!transfer) continue;

    const transferOnA: AlongPoint = {
      latitude: transfer.pointA.latitude,
      longitude: transfer.pointA.longitude,
      alongKm: transfer.alongAKm,
    };
    const transferOnB: AlongPoint = {
      latitude: transfer.pointB.latitude,
      longitude: transfer.pointB.longitude,
      alongKm: transfer.alongBKm,
    };

    const leg1 = buildLegFromAlong(pair.a.route, pair.a.snap, transferOnA);
    const leg2 = buildLegFromAlong(pair.b.route, transferOnB, pair.b.snap);

    if (leg1.distanceKm < 0.1 || leg2.distanceKm < 0.1) continue;

    const walkKm = transfer.walkDistanceKm;
    const walkMin = Math.ceil((walkKm / WALK_SPEED_KMH) * 60);

    seen.add(key);
    matched.push({
      legs: [leg1, leg2],
      distanceKm: leg1.distanceKm + leg2.distanceKm,
      estimatedFare: leg1.estimatedFare + leg2.estimatedFare,
      estimatedMinutes: leg1.estimatedMinutes + walkMin + leg2.estimatedMinutes,
      transferCount: 1,
      route: leg1.route,
      boardingPoint: leg1.boardingPoint,
      alightingPoint: leg2.alightingPoint,
    });
  }

  matched.sort((a, b) => a.legs.length - b.legs.length || a.estimatedMinutes - b.estimatedMinutes);
  return matched.slice(0, MAX_MATCHED_RESULTS);
}
