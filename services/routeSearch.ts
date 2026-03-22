import * as turf from '@turf/turf';
import type { JeepneyRoute, RouteCoord } from '../hooks/useJeepneyRoutes';

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

const BUFFER_DISTANCE = 1000; // meters
const TRANSFER_WALK_DISTANCE = 800; // max meters to walk between two routes for a transfer
const AVG_SPEED_KMH = 15;
const WALK_SPEED_KMH = 4;

/**
 * LTFRB Jeepney Fare Matrix (PUJ – Traditional)
 * First 4 km = ₱13.00, then ₱1.80 per succeeding km
 * Fares rounded to nearest ₱0.25
 *
 * Distance → Fare lookup table (from LTFRB order)
 */
const FARE_TABLE: [number, number][] = [
  [4,  13.00],
  [5,  14.75],
  [6,  16.50],
  [7,  18.25],
  [8,  20.00],
  [9,  21.75],
  [10, 23.50],
  [11, 25.25],
  [12, 27.00],
  [13, 28.75],
  [14, 30.50],
  [15, 32.25],
  [16, 34.00],
  [17, 35.75],
  [18, 37.50],
  [19, 39.25],
  [20, 41.00],
  [21, 42.75],
  [22, 44.50],
  [23, 46.25],
  [24, 48.00],
  [25, 49.75],
];

/**
 * Calculate fare using the LTFRB fare matrix.
 * For distances within the table, use exact lookup.
 * For distances beyond the table, extrapolate at ₱1.80/km after base.
 */
function calculateFare(distanceKm: number): number {
  if (distanceKm <= 4) return 13.00;

  // Find the bracket in the table
  const rounded = Math.ceil(distanceKm);
  const entry = FARE_TABLE.find(([km]) => km === rounded);
  if (entry) return entry[1];

  // Extrapolate beyond table
  const extraKm = distanceKm - 4;
  const raw = 13.00 + extraKm * 1.80;
  // Round to nearest ₱0.25
  return Math.ceil(raw * 4) / 4;
}

function toGeoJSONCoord(point: { latitude: number; longitude: number }): [number, number] {
  return [point.longitude, point.latitude];
}

function routeToLineString(coordinates: RouteCoord[]) {
  const coords = coordinates.map(c => toGeoJSONCoord(c));
  return turf.lineString(coords);
}

type SnapInfo = {
  route: JeepneyRoute;
  line: ReturnType<typeof turf.lineString>;
  buffered: GeoJSON.Feature;
};

/** Build a single RouteLeg between two snapped points on one route */
function buildLeg(
  route: JeepneyRoute,
  line: ReturnType<typeof turf.lineString>,
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): RouteLeg {
  const fromSnap = turf.nearestPointOnLine(line, turf.point(toGeoJSONCoord(from)));
  const toSnap = turf.nearestPointOnLine(line, turf.point(toGeoJSONCoord(to)));
  const distanceKm = Math.abs(
    (toSnap.properties.location ?? 0) - (fromSnap.properties.location ?? 0),
  );
  const [bLng, bLat] = fromSnap.geometry.coordinates;
  const [aLng, aLat] = toSnap.geometry.coordinates;
  return {
    route,
    boardingPoint: { latitude: bLat, longitude: bLng },
    alightingPoint: { latitude: aLat, longitude: aLng },
    distanceKm,
    estimatedFare: calculateFare(distanceKm),
    estimatedMinutes: Math.ceil((distanceKm / AVG_SPEED_KMH) * 60),
  };
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
  const originPoint = turf.point(toGeoJSONCoord(origin));
  const destPoint = turf.point(toGeoJSONCoord(destination));

  // Pre-compute line + buffer for each route
  const infos: SnapInfo[] = [];
  for (const route of routes) {
    if (route.coordinates.length < 2) continue;
    const line = routeToLineString(route.coordinates);
    const bufResult = turf.buffer(line, bufferMeters, { units: 'meters' });
    if (!bufResult) continue;
    const buffered = bufResult as unknown as GeoJSON.Feature;
    if (!buffered) continue;
    infos.push({ route, line, buffered });
  }

  // Classify which routes are near origin / near destination
  const nearOrigin: SnapInfo[] = [];
  const nearDest: SnapInfo[] = [];
  for (const info of infos) {
    const poly = info.buffered as GeoJSON.Feature<GeoJSON.Polygon>;
    if (turf.booleanPointInPolygon(originPoint, poly)) nearOrigin.push(info);
    if (turf.booleanPointInPolygon(destPoint, poly)) nearDest.push(info);
  }

  const matched: MatchedRoute[] = [];
  const seen = new Set<string>(); // dedupe key

  // ─── Single-leg: routes that cover both origin and destination ──────────
  for (const info of nearOrigin) {
    if (!nearDest.some(d => d.route.properties.code === info.route.properties.code)) continue;

    const leg = buildLeg(info.route, info.line, origin, destination);
    const key = info.route.properties.code;
    if (seen.has(key)) continue;
    seen.add(key);

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

  // ─── Two-leg transfers: route A (near origin) → walk → route B (near destination) ─
  for (const a of nearOrigin) {
    for (const b of nearDest) {
      if (a.route.properties.code === b.route.properties.code) continue;
      const key = `${a.route.properties.code}+${b.route.properties.code}`;
      if (seen.has(key)) continue;

      // Find the closest point between the two route LineStrings
      const transferPoint = findTransferPoint(a, b);
      if (!transferPoint) continue;

      const leg1 = buildLeg(a.route, a.line, origin, transferPoint);
      const leg2 = buildLeg(b.route, b.line, transferPoint, destination);

      // Skip degenerate legs (boarding = alighting on same spot)
      if (leg1.distanceKm < 0.1 || leg2.distanceKm < 0.1) continue;

      const walkKm = transferPoint.walkDistanceKm;
      const walkMin = Math.ceil((walkKm / WALK_SPEED_KMH) * 60);
      const totalDistance = leg1.distanceKm + leg2.distanceKm;
      const totalFare = leg1.estimatedFare + leg2.estimatedFare;
      const totalMinutes = leg1.estimatedMinutes + walkMin + leg2.estimatedMinutes;

      seen.add(key);
      matched.push({
        legs: [leg1, leg2],
        distanceKm: totalDistance,
        estimatedFare: totalFare,
        estimatedMinutes: totalMinutes,
        transferCount: 1,
        // backward-compat: use first leg's boarding and last leg's alighting
        route: leg1.route,
        boardingPoint: leg1.boardingPoint,
        alightingPoint: leg2.alightingPoint,
      });
    }
  }

  // Sort: fewest legs first, then shortest time
  matched.sort((a, b) => a.legs.length - b.legs.length || a.estimatedMinutes - b.estimatedMinutes);
  return matched;
}

/**
 * Find the closest pair of points between two routes within walking distance.
 * Returns the midpoint + walking distance if within TRANSFER_WALK_DISTANCE.
 */
function findTransferPoint(
  a: SnapInfo,
  b: SnapInfo,
): { latitude: number; longitude: number; walkDistanceKm: number } | null {
  // Sample points along route A and snap to route B to find the closest pair
  const aCoords = a.route.coordinates;
  const step = Math.max(1, Math.floor(aCoords.length / 40)); // sample ~40 points
  let bestDist = Infinity;
  let bestPt: { latitude: number; longitude: number } | null = null;

  for (let i = 0; i < aCoords.length; i += step) {
    const pt = turf.point(toGeoJSONCoord(aCoords[i]));
    const snap = turf.nearestPointOnLine(b.line, pt);
    const dist = turf.distance(pt, snap, { units: 'meters' });
    if (dist < bestDist) {
      bestDist = dist;
      // Use midpoint between route A point and its closest point on route B
      const [sLng, sLat] = snap.geometry.coordinates;
      bestPt = {
        latitude: (aCoords[i].latitude + sLat) / 2,
        longitude: (aCoords[i].longitude + sLng) / 2,
      };
    }
  }

  if (bestDist > TRANSFER_WALK_DISTANCE || !bestPt) return null;
  return { ...bestPt, walkDistanceKm: bestDist / 1000 };
}
