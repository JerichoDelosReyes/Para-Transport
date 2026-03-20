/**
 * Parse Overpass API responses into structured route and stop data.
 *
 * Designed for `out geom` format where geometry is embedded directly in
 * relation members (each way member has a `geometry` array of {lat,lon}).
 *
 * IMPORTANT: Overpass returns the FULL geometry for any route relation that
 * intersects the bounding box — a Manila-to-Naga bus passing through Imus
 * will include its entire 200km path. We clip all geometry to the target
 * area so only local segments are rendered on the map.
 */

// Color coding per route type
export const ROUTE_COLORS = {
  bus: '#1E88E5',       // blue
  jeepney: '#F9A825',   // yellow
  share_taxi: '#E53935', // red
};

export const ROUTE_LABELS = {
  bus: 'Bus',
  jeepney: 'Jeepney',
  share_taxi: 'UV Express',
};

// Clip bounds: whole Cavite province
const CLIP_BOUNDS = {
  minLat: 14.10,
  maxLat: 14.49,
  minLon: 120.56,
  maxLon: 121.10,
};

// Simplification tolerance in degrees (~11m at Cavite's latitude)
const SIMPLIFY_TOLERANCE = 0.0001;

// Minimum number of points a clipped route must have to be worth showing
const MIN_CLIPPED_POINTS = 3;

function isInsideBounds(lat, lon) {
  return (
    lat >= CLIP_BOUNDS.minLat && lat <= CLIP_BOUNDS.maxLat &&
    lon >= CLIP_BOUNDS.minLon && lon <= CLIP_BOUNDS.maxLon
  );
}

/**
 * Clips a polyline to the bounding box, returning only the segments
 * that fall within the area. Splits into separate segment arrays
 * when the route exits and re-enters the bounds.
 * @param {Array} coords - Array of {latitude, longitude}
 * @returns {Array<Array>} Array of clipped segment arrays
 */
function clipPolylineToBounds(coords) {
  const segments = [];
  let current = [];

  for (const pt of coords) {
    if (isInsideBounds(pt.latitude, pt.longitude)) {
      current.push(pt);
    } else {
      // Point is outside — end the current segment if it has enough points
      if (current.length >= 2) {
        segments.push(current);
      }
      current = [];
    }
  }

  // Don't forget the last segment
  if (current.length >= 2) {
    segments.push(current);
  }

  return segments;
}

/**
 * Clips stop nodes to only those inside the bounding box.
 */
function clipStopToBounds(stop) {
  return isInsideBounds(stop.coordinate.latitude, stop.coordinate.longitude);
}

/**
 * Parses route relation elements (from `out geom` response) into route objects.
 * Clips all geometry to the Bacoor/Imus/Dasma area.
 * @param {Array} elements - Overpass elements from the routes query
 * @returns {Array} Parsed route objects with clipped coordinates
 */
export function parseRouteElements(elements) {
  if (!Array.isArray(elements)) return [];

  const routes = [];

  for (const el of elements) {
    if (el.type !== 'relation') continue;

    const tags = el.tags || {};
    let routeType = tags.route;
    if (!routeType || !ROUTE_COLORS[routeType]) continue;

    // Reclassify: In the Philippines, jeepneys are often tagged as route=bus
    // but have network containing "PUJ" or name containing "Jeepney"/"PUJ"
    if (routeType === 'bus') {
      const name = (tags.name || '').toLowerCase();
      const network = (tags.network || '').toLowerCase();
      if (network.includes('puj') || name.includes('jeepney') || name.includes('puj')) {
        routeType = 'jeepney';
      }
    }

    const members = el.members || [];

    // Build connected segments from way members (keeps gaps separate)
    const waySegments = buildSegmentsFromGeomMembers(members);
    if (waySegments.length === 0) continue;

    // Clip each segment to bounds, then simplify individually
    const segments = [];
    for (const seg of waySegments) {
      const clipped = clipPolylineToBounds(seg);
      for (const c of clipped) {
        if (c.length >= MIN_CLIPPED_POINTS) {
          segments.push(simplifyPolyline(c, SIMPLIFY_TOLERANCE));
        }
      }
    }

    if (segments.length === 0) continue;

    // Extract stop nodes from members, clipped to bounds
    const routeStops = [];
    for (const member of members) {
      if (member.type === 'node' && (member.role === 'stop' || member.role === 'platform')) {
        if (member.lat != null && member.lon != null && isInsideBounds(member.lat, member.lon)) {
          routeStops.push({
            id: member.ref,
            name: member.tags?.name || 'Stop',
            coordinate: { latitude: member.lat, longitude: member.lon },
          });
        }
      }
    }

    routes.push({
      id: el.id,
      type: routeType,
      name: tags.name || tags.description || `${ROUTE_LABELS[routeType]} Route`,
      ref: tags.ref || '',
      operator: tags.operator || '',
      from: tags.from || '',
      to: tags.to || '',
      network: tags.network || '',
      color: ROUTE_COLORS[routeType],
      label: ROUTE_LABELS[routeType],
      segments,
      stops: routeStops,
    });
  }

  return routes;
}

/**
 * Parses stop node elements from the stops query.
 * Already bbox-filtered by Overpass, but double-checks bounds.
 * @param {Array} elements - Overpass elements from the stops query
 * @returns {Array} Parsed stop objects
 */
export function parseStopElements(elements) {
  if (!Array.isArray(elements)) return [];

  const stops = [];
  for (const el of elements) {
    if (el.type !== 'node') continue;
    if (el.lat == null || el.lon == null) continue;
    if (!isInsideBounds(el.lat, el.lon)) continue;

    stops.push({
      id: el.id,
      name: el.tags?.name || 'Unnamed Stop',
      coordinate: { latitude: el.lat, longitude: el.lon },
      operator: el.tags?.operator || '',
      network: el.tags?.network || '',
    });
  }
  return stops;
}

/**
 * Build a polyline from relation members that carry inline geometry
 * (the `out geom` format gives each way member a `geometry` array).
 */
/**
 * Builds connected polyline segments from way members.
 * Chains consecutive ways that share endpoints into continuous segments.
 * When a gap is found, starts a NEW segment instead of drawing a straight line.
 */
function buildSegmentsFromGeomMembers(members) {
  const rawParts = [];

  for (const member of members) {
    if (member.type !== 'way') continue;
    const role = member.role || '';
    if (role && role !== 'forward' && role !== 'backward' && role !== '') continue;

    const geom = member.geometry;
    if (!Array.isArray(geom) || geom.length < 2) continue;

    const coords = [];
    for (const pt of geom) {
      if (pt.lat != null && pt.lon != null) {
        coords.push({ latitude: pt.lat, longitude: pt.lon });
      }
    }
    if (coords.length >= 2) {
      rawParts.push(coords);
    }
  }

  if (rawParts.length === 0) return [];

  // Chain consecutive ways that connect; break into new segment on gaps
  const result = [];
  let current = [...rawParts[0]];

  for (let i = 1; i < rawParts.length; i++) {
    const seg = rawParts[i];
    const lastPt = current[current.length - 1];
    const segFirst = seg[0];
    const segLast = seg[seg.length - 1];

    if (coordsNear(lastPt, segFirst)) {
      current.push(...seg.slice(1));
    } else if (coordsNear(lastPt, segLast)) {
      const reversed = [...seg].reverse();
      current.push(...reversed.slice(1));
    } else {
      // Gap — save current segment, start a new one
      if (current.length >= 2) result.push(current);
      current = [...seg];
    }
  }
  if (current.length >= 2) result.push(current);

  return result;
}

/**
 * Check if two coordinates are approximately the same point.
 */
function coordsNear(a, b) {
  if (!a || !b) return false;
  return (
    Math.abs(a.latitude - b.latitude) < 0.00002 &&
    Math.abs(a.longitude - b.longitude) < 0.00002
  );
}

/**
 * Ramer-Douglas-Peucker polyline simplification.
 * Reduces point count while preserving shape, critical for mobile rendering
 * performance when dealing with hundreds of transit routes.
 */
function simplifyPolyline(points, tolerance) {
  if (points.length <= 2) return points;

  // Find the point with maximum distance from the line between first and last
  let maxDist = 0;
  let maxIdx = 0;
  const first = points[0];
  const last = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], first, last);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }

  if (maxDist > tolerance) {
    const left = simplifyPolyline(points.slice(0, maxIdx + 1), tolerance);
    const right = simplifyPolyline(points.slice(maxIdx), tolerance);
    return [...left.slice(0, -1), ...right];
  }

  return [first, last];
}

function perpendicularDistance(point, lineStart, lineEnd) {
  const dx = lineEnd.longitude - lineStart.longitude;
  const dy = lineEnd.latitude - lineStart.latitude;

  if (dx === 0 && dy === 0) {
    // lineStart and lineEnd are the same point
    const pdx = point.longitude - lineStart.longitude;
    const pdy = point.latitude - lineStart.latitude;
    return Math.sqrt(pdx * pdx + pdy * pdy);
  }

  const t = Math.max(0, Math.min(1,
    ((point.longitude - lineStart.longitude) * dx + (point.latitude - lineStart.latitude) * dy) /
    (dx * dx + dy * dy)
  ));

  const projLon = lineStart.longitude + t * dx;
  const projLat = lineStart.latitude + t * dy;
  const dLon = point.longitude - projLon;
  const dLat = point.latitude - projLat;

  return Math.sqrt(dLon * dLon + dLat * dLat);
}
