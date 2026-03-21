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
  // -- kept for backward-compat with single-leg consumers --
  route: JeepneyRoute;
  boardingPoint: { latitude: number; longitude: number };
  alightingPoint: { latitude: number; longitude: number };
};

const BUFFER_DISTANCE = 1000; // meters
const TRANSFER_WALK_DISTANCE = 800; // max meters to walk between two routes for a transfer
const BASE_FARE = 13;
const BASE_DISTANCE_KM = 4;
const FARE_PER_KM = 1.8;
const AVG_SPEED_KMH = 15;
const WALK_SPEED_KMH = 4;

function calculateFare(distanceKm: number): number {
  if (distanceKm <= BASE_DISTANCE_KM) return BASE_FARE;
  return Math.ceil(BASE_FARE + (distanceKm - BASE_DISTANCE_KM) * FARE_PER_KM);
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
