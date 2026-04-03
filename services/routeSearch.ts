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
const MAX_ENDPOINT_SNAP_CANDIDATES = 72;
const DIRECT_PAIR_ENDPOINT_TIE_METERS = 40;
const FORWARD_DEST_NEAREST_TIE_METERS = 35;
const MAX_BASE_ENDPOINT_WALK_METERS = 280;
const MIN_LEG_DISTANCE_KM = 0.05;
const MAX_TOTAL_WALK_KM = 3.2;
const MIN_FORWARD_PROGRESS_KM = 0.01;
const SPATIAL_GRID_CELL_DEG = 0.01;

const JEEPNEY_BASE_FARE_REGULAR = 13;
const JEEPNEY_BASE_FARE_DISCOUNTED = 11;
const JEEPNEY_BASE_DISTANCE_KM = 4;
const JEEPNEY_DEFAULT_PER_KM_RATE = 1.8;

type FareMatrixRow = {
  vehicle_type?: string;
  is_active?: boolean;
  base_fare?: number;
  base_distance?: number;
  per_km_rate?: number;
  base_fare_regular?: number;
  base_fare_discount?: number;
  base_distance_km?: number;
  per_km_regular?: number;
  per_km_discount?: number;
};

function normalizeVehicleType(value: unknown): string {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'uv' ? 'uv_express' : normalized;
}

function getFareDiscountType(): string {
  return String(useStore.getState().user?.fare_discount_type || 'regular').toLowerCase();
}

function getActiveFareMatrix(vehicleType: string): FareMatrixRow | null {
  const normalized = normalizeVehicleType(vehicleType);
  const fareMatrices = (useStore.getState().fareMatrices || []) as FareMatrixRow[];

  const activeRows = fareMatrices.filter((matrix) => matrix && matrix.is_active !== false);
  const sourceRows = activeRows.length > 0 ? activeRows : fareMatrices;

  return (
    sourceRows.find((matrix) => normalizeVehicleType(matrix?.vehicle_type) === normalized) || null
  );
}

function getNumericField(
  matrix: FareMatrixRow | null,
  keys: Array<keyof FareMatrixRow>,
  fallback: number,
): number {
  if (!matrix) return fallback;

  for (const key of keys) {
    const value = Number(matrix[key]);
    if (Number.isFinite(value)) return value;
  }

  return fallback;
}

function getFareDiscountMultiplier(): number {
  const discountType = getFareDiscountType();
  return discountType === 'regular' ? 1 : 0.8;
}

function applyUserFareDiscount(rawFare: number): number {
  const multiplier = getFareDiscountMultiplier();
  return Math.max(1, Math.round(rawFare * multiplier));
}

function calculateJeepneyFare(distanceKm: number): number {
  const matrix = getActiveFareMatrix('jeepney');
  const discountType = getFareDiscountType();

  const regularBaseFare = getNumericField(
    matrix,
    ['base_fare_regular', 'base_fare'],
    JEEPNEY_BASE_FARE_REGULAR,
  );
  const discountBaseFare = getNumericField(
    matrix,
    ['base_fare_discount'],
    JEEPNEY_BASE_FARE_DISCOUNTED,
  );

  const regularPerKmRate = getNumericField(
    matrix,
    ['per_km_regular', 'per_km_rate'],
    JEEPNEY_DEFAULT_PER_KM_RATE,
  );
  const discountPerKmRate = getNumericField(
    matrix,
    ['per_km_discount'],
    regularPerKmRate * getFareDiscountMultiplier(),
  );

  const baseDistanceKm = getNumericField(
    matrix,
    ['base_distance_km', 'base_distance'],
    JEEPNEY_BASE_DISTANCE_KM,
  );

  const billableKm = Math.max(1, Math.ceil(distanceKm));
  const baseFare = discountType === 'regular' ? regularBaseFare : discountBaseFare;
  const perKmRate = discountType === 'regular' ? regularPerKmRate : discountPerKmRate;

  if (billableKm <= baseDistanceKm) return Math.max(1, Math.round(baseFare));

  const extraKm = billableKm - baseDistanceKm;
  return Math.max(1, Math.round(baseFare + extraKm * perKmRate));
}

function calculateFare(distanceKm: number, vehicleType: string = 'jeepney'): number {
  const normalizedType = normalizeVehicleType(vehicleType || 'jeepney');
  const discountType = getFareDiscountType();

  // Jeepney policy: first 4 km fixed (regular 13, discounted 11), then add per billable km.
  if (normalizedType === 'jeepney') {
    return calculateJeepneyFare(distanceKm);
  }

  const matrix = getActiveFareMatrix(normalizedType);

  const baseFareRegular = getNumericField(matrix, ['base_fare_regular', 'base_fare'], 13.0);
  const baseDistance = getNumericField(matrix, ['base_distance_km', 'base_distance'], 4.0);
  const perKmRateRegular = getNumericField(matrix, ['per_km_regular', 'per_km_rate'], JEEPNEY_DEFAULT_PER_KM_RATE);

  const baseFareDiscount = getNumericField(
    matrix,
    ['base_fare_discount'],
    applyUserFareDiscount(baseFareRegular),
  );
  const perKmRateDiscount = getNumericField(
    matrix,
    ['per_km_discount'],
    perKmRateRegular * getFareDiscountMultiplier(),
  );

  const baseFare = discountType === 'regular' ? baseFareRegular : baseFareDiscount;
  const perKmRate = discountType === 'regular' ? perKmRateRegular : perKmRateDiscount;

  if (distanceKm <= baseDistance) return Math.max(1, Math.round(baseFare));

  const extraKm = distanceKm - baseDistance;
  const rawFare = baseFare + extraKm * perKmRate;

  return Math.max(1, Math.round(rawFare));
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

type DirectSnapPair = {
  originSnap: SnapResult;
  destinationSnap: SnapResult;
  endpointDistanceMeters: number;
  rideDistanceMeters: number;
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

class MinQueuedStateHeap {
  private items: QueuedState[] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: QueuedState): void {
    this.items.push(item);
    this.siftUp(this.items.length - 1);
  }

  pop(): QueuedState | undefined {
    if (this.items.length === 0) return undefined;
    if (this.items.length === 1) return this.items.pop();

    const top = this.items[0];
    this.items[0] = this.items[this.items.length - 1];
    this.items.pop();
    this.siftDown(0);
    return top;
  }

  trim(maxSize: number): void {
    if (this.items.length <= maxSize) return;

    // Keep the best N states by priority, then rebuild the heap.
    this.items.sort((a, b) => a.priority - b.priority);
    this.items.length = maxSize;

    for (let i = Math.floor(this.items.length / 2) - 1; i >= 0; i--) {
      this.siftDown(i);
    }
  }

  private siftUp(index: number): void {
    let i = index;
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (this.items[parent].priority <= this.items[i].priority) break;
      this.swap(parent, i);
      i = parent;
    }
  }

  private siftDown(index: number): void {
    let i = index;
    const n = this.items.length;

    while (true) {
      const left = i * 2 + 1;
      const right = left + 1;
      let smallest = i;

      if (left < n && this.items[left].priority < this.items[smallest].priority) {
        smallest = left;
      }
      if (right < n && this.items[right].priority < this.items[smallest].priority) {
        smallest = right;
      }

      if (smallest === i) break;
      this.swap(i, smallest);
      i = smallest;
    }
  }

  private swap(a: number, b: number): void {
    const temp = this.items[a];
    this.items[a] = this.items[b];
    this.items[b] = temp;
  }
}

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
  nearestTieMeters?: number,
): SnapResult | null {
  const coords = index.coords;
  if (coords.length < 2) return null;

  const minAlongMeters = Math.max(0, minAlongKm * 1000);
  const tieMeters =
    typeof nearestTieMeters === 'number' && Number.isFinite(nearestTieMeters) && nearestTieMeters > 0
      ? nearestTieMeters
      : 0;

  const candidates: Array<{
    latitude: number;
    longitude: number;
    distanceMeters: number;
    alongMeters: number;
  }> = [];

  let bestDistMeters = Number.POSITIVE_INFINITY;
  let bestLat = coords[0].latitude;
  let bestLng = coords[0].longitude;
  let bestAlongMeters = Number.POSITIVE_INFINITY;
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
    const distanceMeters = Math.sqrt(projX * projX + projY * projY);
    const latitude = point.latitude + projY / METERS_PER_DEG;
    const longitude = point.longitude + projX / lonScale;

    candidates.push({
      latitude,
      longitude,
      distanceMeters,
      alongMeters,
    });

    if (
      !found ||
      distanceMeters < bestDistMeters ||
      (Math.abs(distanceMeters - bestDistMeters) < 1e-6 && alongMeters < bestAlongMeters)
    ) {
      bestDistMeters = distanceMeters;
      bestLat = latitude;
      bestLng = longitude;
      bestAlongMeters = alongMeters;
      found = true;
    }
  }

  if (!found) return null;

  if (tieMeters > 0 && candidates.length > 1) {
    const thresholdMeters = bestDistMeters + tieMeters;
    let tieBest = candidates[0];
    let tieFound = false;

    for (const candidate of candidates) {
      if (candidate.distanceMeters > thresholdMeters) continue;
      if (
        !tieFound ||
        candidate.alongMeters < tieBest.alongMeters ||
        (Math.abs(candidate.alongMeters - tieBest.alongMeters) < 1e-6 &&
          candidate.distanceMeters < tieBest.distanceMeters)
      ) {
        tieBest = candidate;
        tieFound = true;
      }
    }

    if (tieFound) {
      return {
        latitude: tieBest.latitude,
        longitude: tieBest.longitude,
        distanceMeters: tieBest.distanceMeters,
        alongKm: tieBest.alongMeters / 1000,
      };
    }
  }

  return {
    latitude: bestLat,
    longitude: bestLng,
    distanceMeters: bestDistMeters,
    alongKm: bestAlongMeters / 1000,
  };
}

function collectRouteSnapsWithinDistance(
  point: { latitude: number; longitude: number },
  index: RouteIndex,
  maxDistanceMeters: number,
): SnapResult[] {
  const coords = index.coords;
  if (coords.length < 2 || !Number.isFinite(maxDistanceMeters) || maxDistanceMeters <= 0) return [];

  const maxDistSq = maxDistanceMeters * maxDistanceMeters;
  const snaps: Array<SnapResult & { alongMeters: number }> = [];

  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i];
    const b = coords[i + 1];

    const segStartMeters = index.cumulativeMeters[i] || 0;
    const segEndMeters = index.cumulativeMeters[i + 1] || segStartMeters;
    const segLenMeters = Math.max(0, segEndMeters - segStartMeters);

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

    if (distSq > maxDistSq) continue;

    const alongMeters = segStartMeters + segLenMeters * t;
    snaps.push({
      latitude: point.latitude + projY / METERS_PER_DEG,
      longitude: point.longitude + projX / lonScale,
      distanceMeters: Math.sqrt(distSq),
      alongKm: alongMeters / 1000,
      alongMeters,
    });
  }

  snaps.sort((a, b) => a.distanceMeters - b.distanceMeters || a.alongMeters - b.alongMeters);

  // De-dupe near-identical along positions so repeated polyline points do not
  // flood candidate pairs on looping/crossing routes.
  const deduped: SnapResult[] = [];
  const seenAlongBins = new Set<number>();

  for (const snap of snaps) {
    const bin = Math.round(snap.alongMeters / 20); // 20 m bins
    if (seenAlongBins.has(bin)) continue;
    seenAlongBins.add(bin);

    deduped.push({
      latitude: snap.latitude,
      longitude: snap.longitude,
      distanceMeters: snap.distanceMeters,
      alongKm: snap.alongKm,
    });

    if (deduped.length >= MAX_ENDPOINT_SNAP_CANDIDATES) break;
  }

  return deduped;
}

function findBestDirectForwardPair(
  origin: { latitude: number; longitude: number },
  destination: { latitude: number; longitude: number },
  index: RouteIndex,
  bufferMeters: number,
): DirectSnapPair | null {
  const originSnaps = collectRouteSnapsWithinDistance(origin, index, bufferMeters);
  const destinationSnaps = collectRouteSnapsWithinDistance(destination, index, bufferMeters);

  if (originSnaps.length === 0 || destinationSnaps.length === 0) return null;

  const pairs: DirectSnapPair[] = [];

  for (const originSnap of originSnaps) {
    for (const destinationSnap of destinationSnaps) {
      const rideDistanceMeters = (destinationSnap.alongKm - originSnap.alongKm) * 1000;
      if (rideDistanceMeters <= MIN_FORWARD_PROGRESS_KM * 1000) continue;

      const endpointDistanceMeters = originSnap.distanceMeters + destinationSnap.distanceMeters;

      pairs.push({
        originSnap,
        destinationSnap,
        endpointDistanceMeters,
        rideDistanceMeters,
      });
    }
  }

  if (pairs.length === 0) return null;

  let minEndpointDistance = Number.POSITIVE_INFINITY;
  for (const pair of pairs) {
    if (pair.endpointDistanceMeters < minEndpointDistance) {
      minEndpointDistance = pair.endpointDistanceMeters;
    }
  }

  const endpointThreshold = minEndpointDistance + DIRECT_PAIR_ENDPOINT_TIE_METERS;
  const nearEndpointPairs = pairs.filter((pair) => pair.endpointDistanceMeters <= endpointThreshold);

  // Keep boarding/alighting nearest first, then break ties by shorter ride.
  nearEndpointPairs.sort((a, b) => {
    return (
      a.endpointDistanceMeters - b.endpointDistanceMeters ||
      a.originSnap.distanceMeters - b.originSnap.distanceMeters ||
      a.destinationSnap.distanceMeters - b.destinationSnap.distanceMeters ||
      a.rideDistanceMeters - b.rideDistanceMeters
    );
  });

  if (nearEndpointPairs.length > 0) {
    return nearEndpointPairs[0];
  }

  pairs.sort((a, b) => {
    return (
      a.endpointDistanceMeters - b.endpointDistanceMeters ||
      a.originSnap.distanceMeters - b.originSnap.distanceMeters ||
      a.destinationSnap.distanceMeters - b.destinationSnap.distanceMeters ||
      a.rideDistanceMeters - b.rideDistanceMeters
    );
  });
  return pairs[0] ?? null;
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

function pointDistanceMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  return segmentDistanceMeters(a as RouteCoord, b as RouteCoord);
}

function endpointWalkMetersForMatchedRoute(
  match: MatchedRoute,
  origin: { latitude: number; longitude: number },
  destination: { latitude: number; longitude: number },
): number {
  if (!match.legs || match.legs.length === 0) return Number.POSITIVE_INFINITY;
  const first = match.legs[0];
  const last = match.legs[match.legs.length - 1];

  const startWalk = pointDistanceMeters(origin, first.boardingPoint);
  const endWalk = pointDistanceMeters(last.alightingPoint, destination);
  return startWalk + endWalk;
}

function matchedRouteSignature(match: MatchedRoute): string {
  return match.legs.map((leg) => leg.route.properties.code).join('>');
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
  if (nearOriginRanked.length === 0) return [];

  const compareMatchedRoutes = (a: MatchedRoute, b: MatchedRoute): number => {
    const endpointWalkA = endpointWalkMetersForMatchedRoute(a, origin, destination);
    const endpointWalkB = endpointWalkMetersForMatchedRoute(b, origin, destination);

    return (
      a.transferCount - b.transferCount ||
      endpointWalkA - endpointWalkB ||
      a.estimatedMinutes - b.estimatedMinutes ||
      a.estimatedFare - b.estimatedFare
    );
  };

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

  const runSearchWithSeedLimit = (seedLimit: number): MatchedRoute[] => {
    const startCandidates = nearOriginRanked.slice(0, seedLimit);
    if (startCandidates.length === 0) return [];

    const resultBySignature = new Map<string, MatchedRoute>();
    const bestStateScore = new Map<string, number>();
    const frontier = new MinQueuedStateHeap();

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
      frontier.size > 0 &&
      expansions < MAX_STATE_EXPANSIONS &&
      resultBySignature.size < MAX_MATCHED_RESULTS
    ) {
      const queued = frontier.pop();
      if (!queued) break;

      const state = queued.state;
      expansions += 1;

      const destCandidate = nearDestByCode.get(state.current.code);
      if (destCandidate) {
        let directEntry = state.entry;
        let forwardDestSnap = snapPointToRouteForward(
          destination,
          state.current.index,
          state.entry.alongKm + MIN_FORWARD_PROGRESS_KM,
          FORWARD_DEST_NEAREST_TIE_METERS,
        );

        if (state.legs.length === 0) {
          const directPair = findBestDirectForwardPair(origin, destination, state.current.index, bufferMeters);
          if (directPair) {
            directEntry = {
              latitude: directPair.originSnap.latitude,
              longitude: directPair.originSnap.longitude,
              alongKm: directPair.originSnap.alongKm,
            };
            forwardDestSnap = directPair.destinationSnap;
          }
        }

        if (forwardDestSnap && forwardDestSnap.distanceMeters <= bufferMeters) {
          const finalLeg = buildLegFromAlong(state.current.route, directEntry, forwardDestSnap);
          if (finalLeg && (finalLeg.distanceKm >= MIN_LEG_DISTANCE_KM || state.legs.length === 0)) {
            const legs = [...state.legs, finalLeg];
            const totalDistanceKm = state.totalDistanceKm + finalLeg.distanceKm;
            const totalFare = state.totalFare + finalLeg.estimatedFare;
            const totalMinutes = state.totalMinutes + finalLeg.estimatedMinutes;

            const matched = buildMatchedRoute(legs, totalMinutes, totalFare, totalDistanceKm);
            const sig = legs.map((leg) => leg.route.properties.code).join('>');
            const prev = resultBySignature.get(sig);

            if (!prev || compareMatchedRoutes(matched, prev) < 0) {
              resultBySignature.set(sig, matched);
            }
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

      if (frontier.size > MAX_FRONTIER_SIZE) {
        frontier.trim(MAX_FRONTIER_SIZE);
      }
    }

    const matched = Array.from(resultBySignature.values());
    matched.sort(compareMatchedRoutes);

    return matched.slice(0, MAX_MATCHED_RESULTS);
  };

  const baseMatches = runSearchWithSeedLimit(MAX_NEAR_CANDIDATES);
  if (nearOriginRanked.length <= MAX_NEAR_CANDIDATES) {
    return baseMatches;
  }

  const bestBase = baseMatches[0];
  const bestBaseEndpointWalk = bestBase
    ? endpointWalkMetersForMatchedRoute(bestBase, origin, destination)
    : Number.POSITIVE_INFINITY;

  const shouldRetryExpandedSeeds =
    baseMatches.length === 0 ||
    (bestBase?.transferCount ?? 0) > 0 ||
    bestBaseEndpointWalk > MAX_BASE_ENDPOINT_WALK_METERS;

  if (!shouldRetryExpandedSeeds) return baseMatches;

  // Dense corridors can have many equally-near overlapping routes. Retry with
  // a wider seed set so opposite-direction lines are not dropped too early.
  const expandedSeedLimit = Math.min(nearOriginRanked.length, Math.max(MAX_NEAR_CANDIDATES * 3, 30));
  const expandedMatches = runSearchWithSeedLimit(expandedSeedLimit);
  if (expandedMatches.length === 0) return baseMatches;
  if (baseMatches.length === 0) return expandedMatches;

  const merged = new Map<string, MatchedRoute>();
  for (const match of [...baseMatches, ...expandedMatches]) {
    const sig = matchedRouteSignature(match);
    const prev = merged.get(sig);
    if (!prev || compareMatchedRoutes(match, prev) < 0) {
      merged.set(sig, match);
    }
  }

  const combined = Array.from(merged.values());
  combined.sort(compareMatchedRoutes);
  return combined.slice(0, MAX_MATCHED_RESULTS);
}
