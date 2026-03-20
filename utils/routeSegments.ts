/**
 * Splits a route into on-transit (solid) and walking (dashed) segments
 * by checking proximity to known transit route geometries.
 */

type Coord = { latitude: number; longitude: number };

const DEG_TO_M = 111_320; // approximate metres per degree of latitude

/**
 * Fast squared-distance check (avoids sqrt). Returns metres².
 */
function sqDistMetres(a: Coord, b: Coord): number {
  const dLat = (a.latitude - b.latitude) * DEG_TO_M;
  const dLng =
    (a.longitude - b.longitude) *
    DEG_TO_M *
    Math.cos(((a.latitude + b.latitude) / 2) * (Math.PI / 180));
  return dLat * dLat + dLng * dLng;
}

/**
 * Minimum squared distance from point `p` to the line segment `a–b` (in metres²).
 */
function sqDistToSegment(p: Coord, a: Coord, b: Coord): number {
  const aLat = a.latitude * DEG_TO_M;
  const aLng = a.longitude * DEG_TO_M * Math.cos(a.latitude * (Math.PI / 180));
  const bLat = b.latitude * DEG_TO_M;
  const bLng = b.longitude * DEG_TO_M * Math.cos(b.latitude * (Math.PI / 180));
  const pLat = p.latitude * DEG_TO_M;
  const pLng = p.longitude * DEG_TO_M * Math.cos(p.latitude * (Math.PI / 180));

  const dx = bLat - aLat;
  const dy = bLng - aLng;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    const ex = pLat - aLat;
    const ey = pLng - aLng;
    return ex * ex + ey * ey;
  }

  let t = ((pLat - aLat) * dx + (pLng - aLng) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const projLat = aLat + t * dx;
  const projLng = aLng + t * dy;
  const ex = pLat - projLat;
  const ey = pLng - projLng;
  return ex * ex + ey * ey;
}

export type RouteSegment = {
  coordinates: Coord[];
  onTransit: boolean;
};

/**
 * Check if a point is near any transit route polyline within `thresholdMetres`.
 */
function isNearTransit(
  point: Coord,
  transitCoords: Coord[][],
  thresholdSq: number,
): boolean {
  for (const coords of transitCoords) {
    for (let i = 0; i < coords.length - 1; i++) {
      if (sqDistToSegment(point, coords[i], coords[i + 1]) <= thresholdSq) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Split `routePoints` into alternating on-transit / walking segments.
 *
 * @param routePoints  The full OSRM route coordinates
 * @param transitRoutes  Array of transit routes, each with a `.coordinates` array
 * @param thresholdMetres  Distance threshold to consider "on transit" (default 150m)
 */
export function splitRouteSegments(
  routePoints: Coord[],
  transitRoutes: { coordinates: Coord[] }[],
  thresholdMetres = 150,
): RouteSegment[] {
  if (routePoints.length < 2) return [];

  const transitCoords = transitRoutes
    .map((r) => r.coordinates)
    .filter((c) => c && c.length >= 2);

  // No transit data → everything is walking
  if (transitCoords.length === 0) {
    return [{ coordinates: routePoints, onTransit: false }];
  }

  const thresholdSq = thresholdMetres * thresholdMetres;
  const segments: RouteSegment[] = [];

  let currentOnTransit = isNearTransit(routePoints[0], transitCoords, thresholdSq);
  let currentCoords: Coord[] = [routePoints[0]];

  for (let i = 1; i < routePoints.length; i++) {
    const onTransit = isNearTransit(routePoints[i], transitCoords, thresholdSq);

    if (onTransit !== currentOnTransit) {
      // Overlap: share the boundary point so lines connect visually
      currentCoords.push(routePoints[i]);
      segments.push({ coordinates: currentCoords, onTransit: currentOnTransit });
      currentCoords = [routePoints[i]];
      currentOnTransit = onTransit;
    } else {
      currentCoords.push(routePoints[i]);
    }
  }

  if (currentCoords.length >= 2) {
    segments.push({ coordinates: currentCoords, onTransit: currentOnTransit });
  }

  return segments;
}
