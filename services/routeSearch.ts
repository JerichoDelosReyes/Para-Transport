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

/**
 * LTFRB Jeepney Fare Matrix (PUJ – Traditional)
 * First 4 km = P13.00, then P1.80 per succeeding km
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
  const allInfos: RouteInfo[] = [];
  const nearOriginRanked: SnapCandidate[] = [];
  const nearDestByCode = new Map<string, SnapCandidate>();
  const destHintByCode = new Map<string, number>();

  for (const route of routes) {
    if (route.coordinates.length < 2) continue;

    const info: RouteInfo = {
      route,
      index: getRouteIndex(route),
      code: route.properties.code,
    };
    allInfos.push(info);

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
  }

  if (allInfos.length === 0 || nearDestByCode.size === 0) return [];

  nearOriginRanked.sort((a, b) => a.meters - b.meters);
  const startCandidates = nearOriginRanked.slice(0, MAX_NEAR_CANDIDATES);
  if (startCandidates.length === 0) return [];

  const neighborMemo = new Map<string, NeighborCandidate[]>();

  const getNeighbors = (fromInfo: RouteInfo): NeighborCandidate[] => {
    const cached = neighborMemo.get(fromInfo.code);
    if (cached) return cached;

    const candidates: NeighborCandidate[] = [];
    for (const toInfo of allInfos) {
      if (toInfo.code === fromInfo.code) continue;

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
      const finalLeg = buildLegFromAlong(state.current.route, state.entry, destCandidate.snap);

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
