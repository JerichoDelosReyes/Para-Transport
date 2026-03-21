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
 * Approximate total path length of a coordinate array in metres.
 */
function totalLengthMetres(coords: Coord[]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += Math.sqrt(sqDistMetres(coords[i - 1], coords[i]));
  }
  return total;
}

/**
 * Merge consecutive segments with the same onTransit value.
 */
function mergeAdjacentSameType(segments: RouteSegment[]): RouteSegment[] {
  if (segments.length === 0) return segments;
  const merged: RouteSegment[] = [{ ...segments[0], coordinates: [...segments[0].coordinates] }];
  for (let i = 1; i < segments.length; i++) {
    const last = merged[merged.length - 1];
    if (last.onTransit === segments[i].onTransit) {
      // Skip duplicate junction point already shared at boundary
      last.coordinates.push(...segments[i].coordinates.slice(1));
    } else {
      merged.push({ ...segments[i], coordinates: [...segments[i].coordinates] });
    }
  }
  return merged;
}

/**
 * Remove transit segments shorter than minTransitMetres by converting them
 * back to walking, then re-merge adjacent same-type segments.
 * This eliminates false-positive orange islands on inner streets.
 */
function dropShortTransitSegments(
  segments: RouteSegment[],
  minTransitMetres: number,
): RouteSegment[] {
  const flipped = segments.map((seg) => {
    if (!seg.onTransit) return seg;
    return totalLengthMetres(seg.coordinates) < minTransitMetres
      ? { ...seg, onTransit: false }
      : seg;
  });
  return mergeAdjacentSameType(flipped);
}

/**
 * Split `routePoints` into alternating on-transit / walking segments.
 *
 * @param routePoints       The full OSRM route coordinates
 * @param transitRoutes     Array of transit routes, each with a `.coordinates` array
 * @param thresholdMetres   Max distance from a transit polyline to count as "on transit" (default 50m)
 * @param minTransitMetres  Minimum length a transit segment must be to survive; shorter ones become
 *                          walking to avoid false orange islands on inner streets (default 150m)
 */
// ── Multi-leg transit matching ─────────────────────────────────────────────

export type TransitLeg = {
  /** The transit route matched for this leg (null = walking) */
  transitRouteId: string | null;
  /** Human-readable info about the matched transit route */
  transitInfo: {
    id: string;
    ref?: string;
    name?: string;
    type?: string;
    color?: string;
    fare?: string | number;
    from?: string;
    to?: string;
    verified?: boolean;
  } | null;
  /** Where the user boards this transit (or starts walking) */
  boardAt: Coord;
  /** Where the user alights (or stops walking) */
  alightAt: Coord;
  /** The name of the boarding location (nearest stop or address) */
  boardLabel: string;
  /** The name of the alighting location (nearest stop or address) */
  alightLabel: string;
  /** The polyline for this leg */
  coordinates: Coord[];
  /** Whether this leg is on transit or walking */
  onTransit: boolean;
};

type TransitRouteWithMeta = {
  id: string;
  ref?: string;
  name?: string;
  type?: string;
  color?: string;
  fare?: string | number;
  from?: string;
  to?: string;
  verified?: boolean;
  coordinates: Coord[];
  stops?: { coordinate: Coord; name: string }[];
};

/**
 * Find which specific transit route is nearest to a point, within threshold.
 * Returns the route id or null if no route is close enough.
 */
function findNearestTransitRoute(
  point: Coord,
  transitRoutes: TransitRouteWithMeta[],
  thresholdSq: number,
): string | null {
  let bestId: string | null = null;
  let bestDist = Infinity;

  for (const route of transitRoutes) {
    if (!route.coordinates || route.coordinates.length < 2) continue;
    for (let i = 0; i < route.coordinates.length - 1; i++) {
      const d = sqDistToSegment(point, route.coordinates[i], route.coordinates[i + 1]);
      if (d <= thresholdSq && d < bestDist) {
        bestDist = d;
        bestId = route.id;
      }
    }
  }
  return bestId;
}

/**
 * Find the nearest named stop on a specific transit route to a given point.
 */
function findNearestStop(
  point: Coord,
  route: TransitRouteWithMeta,
): string {
  if (!route.stops || route.stops.length === 0) {
    return route.from || route.name || 'Transit stop';
  }
  let best = route.stops[0];
  let bestDist = sqDistMetres(point, best.coordinate);
  for (let i = 1; i < route.stops.length; i++) {
    const d = sqDistMetres(point, route.stops[i].coordinate);
    if (d < bestDist) {
      bestDist = d;
      best = route.stops[i];
    }
  }
  return best.name;
}

/**
 * Build a multi-leg journey plan from an OSRM route by matching segments
 * to specific transit routes and identifying transfer points.
 *
 * @param routePoints     The full OSRM route coordinates
 * @param transitRoutes   Array of transit routes with coordinates, stops, and metadata
 * @param thresholdMetres Max distance to count as "on transit" (default 50m)
 * @param minLegMetres    Minimum leg length to keep (removes noise, default 150m)
 */
export function buildTransitLegs(
  routePoints: Coord[],
  transitRoutes: TransitRouteWithMeta[],
  thresholdMetres = 50,
  minLegMetres = 150,
): TransitLeg[] {
  if (routePoints.length < 2) return [];
  if (transitRoutes.length === 0) {
    return [{
      transitRouteId: null,
      transitInfo: null,
      boardAt: routePoints[0],
      alightAt: routePoints[routePoints.length - 1],
      boardLabel: 'Start',
      alightLabel: 'Destination',
      coordinates: routePoints,
      onTransit: false,
    }];
  }

  const thresholdSq = thresholdMetres * thresholdMetres;
  const routeMap = new Map(transitRoutes.map(r => [r.id, r]));

  // Step 1: Tag each route point with its nearest transit route id (or null)
  const tags: (string | null)[] = routePoints.map(p =>
    findNearestTransitRoute(p, transitRoutes, thresholdSq)
  );

  // Step 2: Group consecutive same-tag points into raw legs
  type RawLeg = { routeId: string | null; startIdx: number; endIdx: number };
  const rawLegs: RawLeg[] = [];
  let currentId = tags[0];
  let startIdx = 0;

  for (let i = 1; i < tags.length; i++) {
    if (tags[i] !== currentId) {
      rawLegs.push({ routeId: currentId, startIdx, endIdx: i });
      currentId = tags[i];
      startIdx = i;
    }
  }
  rawLegs.push({ routeId: currentId, startIdx, endIdx: tags.length - 1 });

  // Step 3: Remove short transit legs (noise) — convert to walking, then re-merge
  const cleaned: RawLeg[] = [];
  for (const leg of rawLegs) {
    const coords = routePoints.slice(leg.startIdx, leg.endIdx + 1);
    const len = totalLengthMetres(coords);
    const isTransit = leg.routeId !== null;

    if (isTransit && len < minLegMetres) {
      // Convert to walking
      cleaned.push({ ...leg, routeId: null });
    } else {
      cleaned.push(leg);
    }
  }

  // Re-merge adjacent same-id legs
  const merged: RawLeg[] = [cleaned[0]];
  for (let i = 1; i < cleaned.length; i++) {
    const last = merged[merged.length - 1];
    if (last.routeId === cleaned[i].routeId) {
      last.endIdx = cleaned[i].endIdx;
    } else {
      merged.push({ ...cleaned[i] });
    }
  }

  // Step 4: Build TransitLeg objects
  return merged.map((raw): TransitLeg => {
    const coords = routePoints.slice(raw.startIdx, raw.endIdx + 1);
    const board = coords[0];
    const alight = coords[coords.length - 1];
    const onTransit = raw.routeId !== null;
    const route = raw.routeId ? routeMap.get(raw.routeId) : undefined;

    let boardLabel = 'Walk';
    let alightLabel = 'Walk';

    if (route) {
      boardLabel = findNearestStop(board, route);
      alightLabel = findNearestStop(alight, route);
    }

    return {
      transitRouteId: raw.routeId,
      transitInfo: route ? {
        id: route.id,
        ref: route.ref,
        name: route.name,
        type: route.type,
        color: route.color,
        fare: route.fare,
        from: route.from,
        to: route.to,
        verified: route.verified,
      } : null,
      boardAt: board,
      alightAt: alight,
      boardLabel,
      alightLabel,
      coordinates: coords,
      onTransit,
    };
  });
}

export function splitRouteSegments(
  routePoints: Coord[],
  transitRoutes: { coordinates: Coord[] }[],
  thresholdMetres = 50,
  minTransitMetres = 150,
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

  // Remove short transit islands caused by loose proximity matches
  return dropShortTransitSegments(segments, minTransitMetres);
}
