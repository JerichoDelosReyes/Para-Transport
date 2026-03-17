const turf = require('@turf/turf');

/**
 * Spatial Filter Service for Para Mobile
 * Implements the "Graph-Lite" routing logic using turf.js buffer analysis
 */

/**
 * Buffer distance in meters for route matching
 * User must be within this distance of a route to be considered "on" the route
 */
const BUFFER_DISTANCE = 400; // meters

/**
 * Creates a buffer polygon around a GeoJSON LineString
 * @param {Object} lineString - GeoJSON LineString geometry
 * @param {Number} distance - Buffer distance in meters
 * @returns {Object} GeoJSON Polygon (buffered area)
 */
const createRouteBuffer = (lineString, distance = BUFFER_DISTANCE) => {
  const line = turf.lineString(lineString.coordinates);
  const buffered = turf.buffer(line, distance, { units: 'meters' });
  return buffered;
};

/**
 * Checks if a point falls within a buffered route
 * @param {Array} coordinates - [longitude, latitude]
 * @param {Object} routeGeometry - GeoJSON LineString geometry
 * @param {Number} bufferDistance - Buffer distance in meters
 * @returns {Boolean} True if point is within buffer
 */
const isPointWithinRouteBuffer = (
  coordinates,
  routeGeometry,
  bufferDistance = BUFFER_DISTANCE
) => {
  const point = turf.point(coordinates);
  const buffer = createRouteBuffer(routeGeometry, bufferDistance);
  return turf.booleanPointInPolygon(point, buffer);
};

/**
 * Finds all routes that contain BOTH origin and destination within their buffer
 * This is the core "Graph-Lite" matching algorithm
 * @param {Array} origin - [longitude, latitude] of starting point
 * @param {Array} destination - [longitude, latitude] of ending point
 * @param {Array} routes - Array of route documents with geometry field
 * @param {Number} bufferDistance - Buffer distance in meters
 * @returns {Array} Matching route documents
 */
const findMatchingRoutes = (
  origin,
  destination,
  routes,
  bufferDistance = BUFFER_DISTANCE
) => {
  const matchingRoutes = [];

  for (const route of routes) {
    if (!route.geometry || !route.geometry.coordinates) {
      console.warn(`Route ${route.routeId} missing geometry, skipping...`);
      continue;
    }

    // Create the buffer once per route and reuse it for both origin and destination checks
    const buffer = createRouteBuffer(route.geometry, bufferDistance);
    const originPoint = turf.point(origin);
    const destPoint = turf.point(destination);

    const originInBuffer = turf.booleanPointInPolygon(originPoint, buffer);
    const destInBuffer = turf.booleanPointInPolygon(destPoint, buffer);

    // Both points must be within the route buffer
    if (originInBuffer && destInBuffer) {
      // Forward Progress Check: Destination must be further along the line than Origin
      const line = turf.lineString(route.geometry.coordinates);
      const originSnap = turf.nearestPointOnLine(line, originPoint);
      const destSnap = turf.nearestPointOnLine(line, destPoint);

      // If destination is at or behind the origin along the line, reject this route
      if (destSnap.properties.location <= originSnap.properties.location) {
        continue;
      }

      matchingRoutes.push(route);
    }
  }

  return matchingRoutes;
};

/**
 * Calculates the distance between two points
 * @param {Array} origin - [longitude, latitude]
 * @param {Array} destination - [longitude, latitude]
 * @param {String} units - 'kilometers' or 'meters'
 * @returns {Number} Distance in specified units
 */
const calculateDistance = (origin, destination, units = 'kilometers') => {
  const from = turf.point(origin);
  const to = turf.point(destination);
  return turf.distance(from, to, { units });
};

/**
 * Calculates the fare based on distance
 * Formula: baseFare + ((distance - 4km) * farePerKm) for distance > 4km
 * @param {Number} distance - Distance in kilometers
 * @param {Number} baseFare - Base fare (default 13 PHP)
 * @param {Number} farePerKm - Additional fare per km (default 1.80 PHP)
 * @returns {Number} Calculated fare
 */
const calculateFare = (distance, baseFare = 13, farePerKm = 1.8) => {
  const baseDistance = 4; // First 4km covered by base fare

  if (distance <= baseDistance) {
    return baseFare;
  }

  const additionalDistance = distance - baseDistance;
  const additionalFare = additionalDistance * farePerKm;

  return Math.ceil(baseFare + additionalFare); // Round up to nearest peso
};

/**
 * Finds the nearest point on a route line from a given point
 * @param {Array} point - [longitude, latitude]
 * @param {Object} routeGeometry - GeoJSON LineString
 * @returns {Object} Nearest point on the line with distance
 */
const findNearestPointOnRoute = (point, routeGeometry) => {
  const pt = turf.point(point);
  const line = turf.lineString(routeGeometry.coordinates);
  const snapped = turf.nearestPointOnLine(line, pt, { units: 'meters' });
  return {
    coordinates: snapped.geometry.coordinates,
    distance: snapped.properties.dist, // Distance in meters
  };
};

/**
 * Calculates the distance along a route between two points
 * @param {Array} origin - [longitude, latitude]
 * @param {Array} destination - [longitude, latitude]
 * @param {Object} routeGeometry - GeoJSON LineString
 * @returns {Number} Distance along route in kilometers
 */
const calculateRouteDistance = (origin, destination, routeGeometry) => {
  const line = turf.lineString(routeGeometry.coordinates);

  // Find where origin and destination snap to the route
  const originSnap = turf.nearestPointOnLine(line, turf.point(origin));
  const destSnap = turf.nearestPointOnLine(line, turf.point(destination));

  // Get the distance along the line for both points
  const originLocation = originSnap.properties.location; // km from start
  const destLocation = destSnap.properties.location; // km from start

  // Return absolute difference (route can be traveled in either direction)
  return Math.abs(destLocation - originLocation);
};

// ============================================================================
// TRANSFER NODE LOGIC - Multi-Leg Journey Support (Max 1 Transfer)
// ============================================================================

/**
 * Finds all routes where a point is within the buffer
 * @param {Array} point - [longitude, latitude]
 * @param {Array} routes - Array of route documents
 * @param {Number} bufferDistance - Buffer distance in meters
 * @returns {Array} Routes that contain the point within their buffer
 */
const findRoutesContainingPoint = (point, routes, bufferDistance = BUFFER_DISTANCE) => {
  const matchingRoutes = [];
  const turfPoint = turf.point(point);

  for (const route of routes) {
    if (!route.geometry || !route.geometry.coordinates) {
      continue;
    }

    const buffer = createRouteBuffer(route.geometry, bufferDistance);
    if (turf.booleanPointInPolygon(turfPoint, buffer)) {
      matchingRoutes.push(route);
    }
  }

  return matchingRoutes;
};

/**
 * Finds intersection points between two route LineStrings
 * @param {Object} routeA - Route document with geometry
 * @param {Object} routeB - Route document with geometry
 * @returns {Array|null} Array of intersection points or null if no intersection
 */
const findRouteIntersections = (routeA, routeB) => {
  try {
    const lineA = turf.lineString(routeA.geometry.coordinates);
    const lineB = turf.lineString(routeB.geometry.coordinates);

    const intersections = turf.lineIntersect(lineA, lineB);

    if (intersections.features.length === 0) {
      return null;
    }

    // Return all intersection points
    return intersections.features.map((feature) => ({
      coordinates: feature.geometry.coordinates,
      lng: feature.geometry.coordinates[0],
      lat: feature.geometry.coordinates[1],
    }));
  } catch (error) {
    console.warn(
      `Error finding intersections between ${routeA.routeId} and ${routeB.routeId}:`,
      error.message
    );
    return null;
  }
};

/**
 * Calculates the distance from a point to a route (snap distance)
 * Used for ranking routes by proximity
 * @param {Array} point - [longitude, latitude]
 * @param {Object} routeGeometry - GeoJSON LineString
 * @returns {Number} Distance in meters
 */
const getDistanceToRoute = (point, routeGeometry) => {
  const pt = turf.point(point);
  const line = turf.lineString(routeGeometry.coordinates);
  const snapped = turf.nearestPointOnLine(line, pt, { units: 'meters' });
  return snapped.properties.dist;
};

/**
 * Finds transfer routes when no direct route exists (Max 1 Transfer)
 * Uses Graph-Lite approach with turf.js intersection detection
 * 
 * @param {Array} origin - [longitude, latitude] of starting point
 * @param {Array} destination - [longitude, latitude] of ending point
 * @param {Array} routes - Array of all route documents
 * @param {Number} bufferDistance - Buffer distance in meters
 * @param {Number} maxCandidates - Max number of candidate routes to check (performance limit)
 * @returns {Array} Array of transfer route options
 */
const findTransferRoutes = (
  origin,
  destination,
  routes,
  bufferDistance = BUFFER_DISTANCE,
  maxCandidates = 5
) => {
  // Step 1: Find candidate routes for origin and destination
  const startRoutes = findRoutesContainingPoint(origin, routes, bufferDistance);
  const endRoutes = findRoutesContainingPoint(destination, routes, bufferDistance);

  // If either has no routes, no transfer possible
  if (startRoutes.length === 0 || endRoutes.length === 0) {
    return [];
  }

  // Step 2: Sort by proximity to origin/destination and limit candidates
  const sortedStartRoutes = startRoutes
    .map((route) => ({
      route,
      distance: getDistanceToRoute(origin, route.geometry),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, maxCandidates)
    .map((item) => item.route);

  const sortedEndRoutes = endRoutes
    .map((route) => ({
      route,
      distance: getDistanceToRoute(destination, route.geometry),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, maxCandidates)
    .map((item) => item.route);

  // Step 3: Find intersections between start and end routes
  const transferOptions = [];

  for (const routeA of sortedStartRoutes) {
    for (const routeB of sortedEndRoutes) {
      // Skip if same route (would be a direct route)
      if (routeA.routeId === routeB.routeId) {
        continue;
      }

      // Find intersection points
      const intersections = findRouteIntersections(routeA, routeB);

      if (intersections && intersections.length > 0) {
        // Use the first (or closest) intersection point as transfer node
        // For multiple intersections, pick the one closest to the midpoint of origin-destination
        let bestTransferPoint = intersections[0];

        if (intersections.length > 1) {
          const midpoint = turf.midpoint(turf.point(origin), turf.point(destination));
          let minDist = Infinity;

          for (const intersection of intersections) {
            const dist = turf.distance(
              turf.point(intersection.coordinates),
              midpoint,
              { units: 'meters' }
            );
            if (dist < minDist) {
              minDist = dist;
              bestTransferPoint = intersection;
            }
          }
        }

        // Step 4: Calculate distances and fares for the transfer journey
        const leg1Distance = calculateRouteDistance(
          origin,
          bestTransferPoint.coordinates,
          routeA.geometry
        );
        const leg2Distance = calculateRouteDistance(
          bestTransferPoint.coordinates,
          destination,
          routeB.geometry
        );

        const totalDistance = leg1Distance + leg2Distance;

        // Calculate fare for each leg
        const leg1Fare = calculateFare(leg1Distance, routeA.fare || 13);
        const leg2Fare = calculateFare(leg2Distance, routeB.fare || 13);
        const totalFare = leg1Fare + leg2Fare;

        transferOptions.push({
          type: 'transfer',
          transferCount: 1,
          legs: [
            {
              order: 1,
              route: {
                routeId: routeA.routeId,
                routeName: routeA.routeName,
                vehicleType: routeA.vehicleType,
                signboard: routeA.signboard,
                trafficLevel: routeA.trafficLevel,
                geometry: routeA.geometry,
              },
              from: {
                type: 'origin',
                coordinates: origin,
                lng: origin[0],
                lat: origin[1],
              },
              to: {
                type: 'transfer',
                coordinates: bestTransferPoint.coordinates,
                lng: bestTransferPoint.lng,
                lat: bestTransferPoint.lat,
              },
              distance: Math.round(leg1Distance * 100) / 100,
              fare: leg1Fare,
            },
            {
              order: 2,
              route: {
                routeId: routeB.routeId,
                routeName: routeB.routeName,
                vehicleType: routeB.vehicleType,
                signboard: routeB.signboard,
                trafficLevel: routeB.trafficLevel,
                geometry: routeB.geometry,
              },
              from: {
                type: 'transfer',
                coordinates: bestTransferPoint.coordinates,
                lng: bestTransferPoint.lng,
                lat: bestTransferPoint.lat,
              },
              to: {
                type: 'destination',
                coordinates: destination,
                lng: destination[0],
                lat: destination[1],
              },
              distance: Math.round(leg2Distance * 100) / 100,
              fare: leg2Fare,
            },
          ],
          transferPoint: {
            coordinates: bestTransferPoint.coordinates,
            lng: bestTransferPoint.lng,
            lat: bestTransferPoint.lat,
          },
          totalDistance: Math.round(totalDistance * 100) / 100,
          totalFare,
        });
      }
    }
  }

  // Step 5: Sort transfer options by total distance (shortest first)
  transferOptions.sort((a, b) => a.totalDistance - b.totalDistance);

  // Remove duplicate route combinations (keep the one with shortest distance)
  const seen = new Set();
  const uniqueTransfers = transferOptions.filter((option) => {
    const key = `${option.legs[0].route.routeId}-${option.legs[1].route.routeId}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });

  return uniqueTransfers;
};

/**
 * Comprehensive route search that returns both direct and transfer routes
 * @param {Array} origin - [longitude, latitude]
 * @param {Array} destination - [longitude, latitude]
 * @param {Array} routes - Array of all route documents
 * @param {Number} bufferDistance - Buffer distance in meters
 * @returns {Object} { directRoutes: [], transferRoutes: [] }
 */
const searchRoutes = (
  origin,
  destination,
  routes,
  bufferDistance = BUFFER_DISTANCE
) => {
  // Find direct routes first
  const directRoutes = findMatchingRoutes(origin, destination, routes, bufferDistance);

  // Only search for transfers if no direct routes found (performance optimization)
  // Or always search if you want to give users options
  let transferRoutes = [];

  if (directRoutes.length === 0) {
    transferRoutes = findTransferRoutes(origin, destination, routes, bufferDistance);
  }

  return {
    directRoutes,
    transferRoutes,
    hasDirectRoute: directRoutes.length > 0,
    hasTransferRoute: transferRoutes.length > 0,
  };
};

module.exports = {
  BUFFER_DISTANCE,
  createRouteBuffer,
  isPointWithinRouteBuffer,
  findMatchingRoutes,
  calculateDistance,
  calculateFare,
  findNearestPointOnRoute,
  calculateRouteDistance,
  // Transfer Node Logic exports
  findRoutesContainingPoint,
  findRouteIntersections,
  findTransferRoutes,
  searchRoutes,
};
