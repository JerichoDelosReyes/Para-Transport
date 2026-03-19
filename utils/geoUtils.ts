/**
 * Geo utility functions for route suggestion engine.
 * Haversine distance, nearest-stop finder, fare & time estimation.
 */

export type Coordinate = {
  latitude: number;
  longitude: number;
};

const EARTH_RADIUS_M = 6_371_000;

/** Haversine distance between two coordinates in meters. */
export function haversineDistance(a: Coordinate, b: Coordinate): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * sinLon * sinLon;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

export type StopWithDistance = {
  id: string | number;
  name: string;
  coordinate: Coordinate;
  routeIds: (string | number)[];
  distanceM: number;
};

/**
 * Find stops within `radiusM` meters of `center`, sorted nearest-first.
 */
export function findNearestStops(
  center: Coordinate,
  stops: { id: string | number; name: string; coordinate: Coordinate; routeIds: (string | number)[] }[],
  radiusM: number = 1000,
): StopWithDistance[] {
  const results: StopWithDistance[] = [];
  for (const s of stops) {
    const d = haversineDistance(center, s.coordinate);
    if (d <= radiusM) {
      results.push({ ...s, distanceM: d });
    }
  }
  results.sort((a, b) => a.distanceM - b.distanceM);
  return results;
}

/** Average speeds in km/h per transport mode (used for time estimates). */
const SPEED_MAP: Record<string, number> = {
  jeepney: 15,
  bus: 25,
  share_taxi: 20,
};

/** Estimate travel time in minutes given distance (km) and mode. */
export function estimateTravelTime(distanceKm: number, mode: string): number {
  const speed = SPEED_MAP[mode] || 18;
  return (distanceKm / speed) * 60;
}

/**
 * Estimate fare based on LTFRB base rates (2024 Metro Manila / Cavite).
 * Jeepney: ₱13 base (first 4 km) + ₱1.80/km
 * Bus ordinary: ₱15 base (first 5 km) + ₱2.25/km
 * UV Express: ₱15 base + ₱2.00/km
 */
const FARE_TABLE: Record<string, { base: number; baseKm: number; perKm: number }> = {
  jeepney: { base: 13, baseKm: 4, perKm: 1.8 },
  bus: { base: 15, baseKm: 5, perKm: 2.25 },
  share_taxi: { base: 15, baseKm: 5, perKm: 2.0 },
};

export function estimateFare(distanceKm: number, mode: string): number {
  const entry = FARE_TABLE[mode] || FARE_TABLE.jeepney;
  if (distanceKm <= entry.baseKm) return entry.base;
  return Math.round(entry.base + (distanceKm - entry.baseKm) * entry.perKm);
}

/**
 * Compute the cumulative distance along a polyline (in km)
 * between the points nearest to `start` and `end`.
 * Returns both the sub-path and total distance.
 */
export function subPathBetween(
  path: Coordinate[],
  start: Coordinate,
  end: Coordinate,
): { subPath: Coordinate[]; distanceKm: number } {
  if (path.length < 2) return { subPath: path, distanceKm: 0 };

  // Find indices closest to start and end
  let startIdx = 0;
  let endIdx = path.length - 1;
  let minStartDist = Infinity;
  let minEndDist = Infinity;

  for (let i = 0; i < path.length; i++) {
    const ds = haversineDistance(path[i], start);
    const de = haversineDistance(path[i], end);
    if (ds < minStartDist) {
      minStartDist = ds;
      startIdx = i;
    }
    if (de < minEndDist) {
      minEndDist = de;
      endIdx = i;
    }
  }

  // Ensure startIdx < endIdx (route direction)
  if (startIdx > endIdx) [startIdx, endIdx] = [endIdx, startIdx];

  const subPath = path.slice(startIdx, endIdx + 1);

  let distanceM = 0;
  for (let i = 1; i < subPath.length; i++) {
    distanceM += haversineDistance(subPath[i - 1], subPath[i]);
  }

  return { subPath, distanceKm: distanceM / 1000 };
}

/** Walking time estimate: ~5 km/h average walking speed. */
export function walkingTimeMinutes(distanceM: number): number {
  return (distanceM / 1000 / 5) * 60;
}
