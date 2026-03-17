/**
 * Spatial Filter Service for Para Mobile
 * 
 * Implements the "Graph-Lite" routing logic using turf.js buffer analysis.
 * Ported from backend/services/spatialFilter.js for offline-first operation.
 * 
 * Key Features:
 * - Buffer-based route matching (origin + destination within route buffer)
 * - Forward progress validation (destination must be ahead of origin on route)
 * - Transfer route detection via route intersection analysis
 * - Fare calculation based on distance
 * 
 * @module services/spatialFilter
 */

import * as turf from '@turf/turf';
import { Feature, LineString, Polygon, Point } from 'geojson';
import { DEFAULT_FARE_RATES } from '../config/constants';
import {
  GeoJSONCoordinate,
  RouteGeometry,
  VehicleType,
} from '../types/route';

// =============================================================================
// Configuration
// =============================================================================

/**
 * Buffer distance in meters for route matching
 * User must be within this distance of a route to be considered "on" the route
 */
export const BUFFER_DISTANCE = 400; // meters

/**
 * Maximum candidate routes to check for transfers (performance limit)
 */
const MAX_TRANSFER_CANDIDATES = 5;

// =============================================================================
// Types
// =============================================================================

/**
 * Route document structure (from routes.json or backend)
 */
export interface RouteDocument {
  routeId: string;
  routeName: string;
  vehicleType: VehicleType;
  signboard: string;
  direction?: string;
  trafficLevel?: string;
  fare?: number;
  geometry: RouteGeometry;
}

/**
 * Intersection point between two routes
 */
export interface IntersectionPoint {
  coordinates: GeoJSONCoordinate;
  lng: number;
  lat: number;
}

/**
 * Waypoint in a journey (origin, transfer, or destination)
 */
export interface JourneyWaypoint {
  type: 'origin' | 'transfer' | 'destination';
  coordinates: GeoJSONCoordinate;
  lng: number;
  lat: number;
  name?: string;
}

/**
 * A single leg of a journey
 */
export interface JourneyLeg {
  order: number;
  route: {
    routeId: string;
    routeName: string;
    vehicleType: VehicleType;
    signboard: string;
    trafficLevel?: string;
    geometry: RouteGeometry;
  };
  from: JourneyWaypoint;
  to: JourneyWaypoint;
  /** Distance in kilometers */
  distance: number;
  /** Fare in PHP */
  fare: number;
  /** Estimated time in minutes */
  estimatedTime?: number;
}

/**
 * Transfer route option (requires 1 transfer)
 */
export interface TransferRouteOption {
  type: 'transfer';
  transferCount: number;
  legs: JourneyLeg[];
  transferPoint: IntersectionPoint;
  /** Total distance in kilometers */
  totalDistance: number;
  /** Total fare in PHP */
  totalFare: number;
  /** Total estimated time in minutes */
  totalTime?: number;
  /** Walking distance at transfer point in meters */
  walkingDistance?: number;
  /** Walking time estimate in minutes */
  walkingTime?: number;
}

/**
 * Search result containing direct and transfer routes
 */
export interface SpatialSearchResult {
  directRoutes: RouteDocument[];
  transferRoutes: TransferRouteOption[];
  hasDirectRoute: boolean;
  hasTransferRoute: boolean;
}

// =============================================================================
// Buffer & Geometry Functions
// =============================================================================

/**
 * Creates a buffer polygon around a GeoJSON LineString
 * @param geometry - Route geometry (LineString)
 * @param distance - Buffer distance in meters
 * @returns Buffered polygon feature
 */
export const createRouteBuffer = (
  geometry: RouteGeometry,
  distance: number = BUFFER_DISTANCE
): Feature<Polygon> => {
  const line = turf.lineString(geometry.coordinates);
  const buffered = turf.buffer(line, distance, { units: 'meters' });
  return buffered as Feature<Polygon>;
};

/**
 * Checks if a point falls within a buffered route
 * @param coordinates - [longitude, latitude]
 * @param routeGeometry - Route geometry (LineString)
 * @param bufferDistance - Buffer distance in meters
 * @returns True if point is within buffer
 */
export const isPointWithinRouteBuffer = (
  coordinates: GeoJSONCoordinate,
  routeGeometry: RouteGeometry,
  bufferDistance: number = BUFFER_DISTANCE
): boolean => {
  const point = turf.point(coordinates);
  const buffer = createRouteBuffer(routeGeometry, bufferDistance);
  return turf.booleanPointInPolygon(point, buffer);
};

// =============================================================================
// Distance & Fare Calculations
// =============================================================================

/**
 * Calculates the distance between two points
 * @param origin - [longitude, latitude]
 * @param destination - [longitude, latitude]
 * @param units - 'kilometers' or 'meters'
 * @returns Distance in specified units
 */
export const calculateDistance = (
  origin: GeoJSONCoordinate,
  destination: GeoJSONCoordinate,
  units: 'kilometers' | 'meters' = 'kilometers'
): number => {
  const from = turf.point(origin);
  const to = turf.point(destination);
  return turf.distance(from, to, { units });
};

/**
 * Calculates the fare based on distance
 * Uses default rates from config, but can be overridden
 * 
 * Formula: baseFare + ((distance - baseDistance) * farePerKm) for distance > baseDistance
 * 
 * @param distance - Distance in kilometers
 * @param baseFare - Base fare (default from config)
 * @param farePerKm - Additional fare per km (default from config)
 * @returns Calculated fare in PHP (rounded up)
 */
export const calculateFare = (
  distance: number,
  baseFare: number = DEFAULT_FARE_RATES.BASE_FARE,
  farePerKm: number = DEFAULT_FARE_RATES.ADDITIONAL_RATE_PER_KM
): number => {
  const baseDistance = DEFAULT_FARE_RATES.BASE_DISTANCE_KM;

  if (distance <= baseDistance) {
    return baseFare;
  }

  const additionalDistance = distance - baseDistance;
  const additionalFare = additionalDistance * farePerKm;

  return Math.ceil(baseFare + additionalFare); // Round up to nearest peso
};

/**
 * Finds the nearest point on a route line from a given point
 * @param point - [longitude, latitude]
 * @param routeGeometry - Route geometry (LineString)
 * @returns Nearest point coordinates and distance in meters
 */
export const findNearestPointOnRoute = (
  point: GeoJSONCoordinate,
  routeGeometry: RouteGeometry
): { coordinates: GeoJSONCoordinate; distance: number } => {
  const pt = turf.point(point);
  const line = turf.lineString(routeGeometry.coordinates);
  const snapped = turf.nearestPointOnLine(line, pt, { units: 'meters' });
  
  return {
    coordinates: snapped.geometry.coordinates as GeoJSONCoordinate,
    distance: snapped.properties.dist || 0, // Distance in meters
  };
};

/**
 * Calculates the distance along a route between two points
 * @param origin - [longitude, latitude]
 * @param destination - [longitude, latitude]
 * @param routeGeometry - Route geometry (LineString)
 * @returns Distance along route in kilometers
 */
export const calculateRouteDistance = (
  origin: GeoJSONCoordinate,
  destination: GeoJSONCoordinate,
  routeGeometry: RouteGeometry
): number => {
  const line = turf.lineString(routeGeometry.coordinates);

  // Find where origin and destination snap to the route
  const originSnap = turf.nearestPointOnLine(line, turf.point(origin));
  const destSnap = turf.nearestPointOnLine(line, turf.point(destination));

  // Get the distance along the line for both points (in km from start)
  const originLocation = originSnap.properties.location || 0;
  const destLocation = destSnap.properties.location || 0;

  // Return absolute difference (route can be traveled in either direction)
  return Math.abs(destLocation - originLocation);
};

/**
 * Estimates travel time based on distance
 * Average jeepney speed: ~15-20 km/h in traffic
 * @param distanceKm - Distance in kilometers
 * @returns Estimated time in minutes
 */
export const estimateTime = (distanceKm: number): number => {
  const avgSpeed = 18; // km/h
  return Math.round((distanceKm / avgSpeed) * 60);
};

// =============================================================================
// Route Matching - Direct Routes
// =============================================================================

/**
 * Finds all routes that contain BOTH origin and destination within their buffer
 * This is the core "Graph-Lite" matching algorithm
 * 
 * @param origin - [longitude, latitude] of starting point
 * @param destination - [longitude, latitude] of ending point
 * @param routes - Array of route documents with geometry field
 * @param bufferDistance - Buffer distance in meters
 * @returns Matching route documents
 */
export const findMatchingRoutes = (
  origin: GeoJSONCoordinate,
  destination: GeoJSONCoordinate,
  routes: RouteDocument[],
  bufferDistance: number = BUFFER_DISTANCE
): RouteDocument[] => {
  const matchingRoutes: RouteDocument[] = [];

  for (const route of routes) {
    if (!route.geometry || !route.geometry.coordinates) {
      console.warn(`[spatialFilter] Route ${route.routeId} missing geometry, skipping...`);
      continue;
    }

    // Create the buffer once per route and reuse it for both checks
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
      const originLocation = originSnap.properties.location || 0;
      const destLocation = destSnap.properties.location || 0;
      
      if (destLocation <= originLocation) {
        continue;
      }

      matchingRoutes.push(route);
    }
  }

  return matchingRoutes;
};

// =============================================================================
// Transfer Route Logic - Multi-Leg Journey Support (Max 1 Transfer)
// =============================================================================

/**
 * Finds all routes where a point is within the buffer
 * @param point - [longitude, latitude]
 * @param routes - Array of route documents
 * @param bufferDistance - Buffer distance in meters
 * @returns Routes that contain the point within their buffer
 */
export const findRoutesContainingPoint = (
  point: GeoJSONCoordinate,
  routes: RouteDocument[],
  bufferDistance: number = BUFFER_DISTANCE
): RouteDocument[] => {
  const matchingRoutes: RouteDocument[] = [];
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
 * @param routeA - Route document with geometry
 * @param routeB - Route document with geometry
 * @returns Array of intersection points or null if no intersection
 */
export const findRouteIntersections = (
  routeA: RouteDocument,
  routeB: RouteDocument
): IntersectionPoint[] | null => {
  try {
    const lineA = turf.lineString(routeA.geometry.coordinates);
    const lineB = turf.lineString(routeB.geometry.coordinates);

    const intersections = turf.lineIntersect(lineA, lineB);

    if (intersections.features.length === 0) {
      return null;
    }

    // Return all intersection points
    return intersections.features.map((feature) => ({
      coordinates: feature.geometry.coordinates as GeoJSONCoordinate,
      lng: feature.geometry.coordinates[0],
      lat: feature.geometry.coordinates[1],
    }));
  } catch (error) {
    console.warn(
      `[spatialFilter] Error finding intersections between ${routeA.routeId} and ${routeB.routeId}:`,
      error instanceof Error ? error.message : error
    );
    return null;
  }
};

/**
 * Calculates the distance from a point to a route (snap distance)
 * Used for ranking routes by proximity
 * @param point - [longitude, latitude]
 * @param routeGeometry - Route geometry (LineString)
 * @returns Distance in meters
 */
export const getDistanceToRoute = (
  point: GeoJSONCoordinate,
  routeGeometry: RouteGeometry
): number => {
  const pt = turf.point(point);
  const line = turf.lineString(routeGeometry.coordinates);
  const snapped = turf.nearestPointOnLine(line, pt, { units: 'meters' });
  return snapped.properties.dist || 0;
};

/**
 * Finds transfer routes when no direct route exists (Max 1 Transfer)
 * Uses Graph-Lite approach with turf.js intersection detection
 * 
 * @param origin - [longitude, latitude] of starting point
 * @param destination - [longitude, latitude] of ending point
 * @param routes - Array of all route documents
 * @param bufferDistance - Buffer distance in meters
 * @param maxCandidates - Max number of candidate routes to check
 * @returns Array of transfer route options
 */
export const findTransferRoutes = (
  origin: GeoJSONCoordinate,
  destination: GeoJSONCoordinate,
  routes: RouteDocument[],
  bufferDistance: number = BUFFER_DISTANCE,
  maxCandidates: number = MAX_TRANSFER_CANDIDATES
): TransferRouteOption[] => {
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
  const transferOptions: TransferRouteOption[] = [];

  for (const routeA of sortedStartRoutes) {
    for (const routeB of sortedEndRoutes) {
      // Skip if same route (would be a direct route)
      if (routeA.routeId === routeB.routeId) {
        continue;
      }

      // Find intersection points
      const intersections = findRouteIntersections(routeA, routeB);

      if (intersections && intersections.length > 0) {
        // Use the best intersection point as transfer node
        // For multiple intersections, pick the one closest to the midpoint
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

        // Calculate fare for each leg using route's fare as base or default
        const leg1Fare = calculateFare(leg1Distance, routeA.fare || DEFAULT_FARE_RATES.BASE_FARE);
        const leg2Fare = calculateFare(leg2Distance, routeB.fare || DEFAULT_FARE_RATES.BASE_FARE);
        const totalFare = leg1Fare + leg2Fare;

        // Estimate times
        const leg1Time = estimateTime(leg1Distance);
        const leg2Time = estimateTime(leg2Distance);
        const walkingTime = 2; // Estimate 2 min walking at transfer
        const totalTime = leg1Time + leg2Time + walkingTime;

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
              estimatedTime: leg1Time,
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
              estimatedTime: leg2Time,
            },
          ],
          transferPoint: {
            coordinates: bestTransferPoint.coordinates,
            lng: bestTransferPoint.lng,
            lat: bestTransferPoint.lat,
          },
          totalDistance: Math.round(totalDistance * 100) / 100,
          totalFare,
          totalTime,
          walkingTime,
        });
      }
    }
  }

  // Step 5: Sort transfer options by total distance (shortest first)
  transferOptions.sort((a, b) => a.totalDistance - b.totalDistance);

  // Remove duplicate route combinations (keep the one with shortest distance)
  const seen = new Set<string>();
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

// =============================================================================
// Main Search Function
// =============================================================================

/**
 * Comprehensive route search that returns both direct and transfer routes
 * This is the main entry point for the spatial filter service
 * 
 * @param origin - [longitude, latitude]
 * @param destination - [longitude, latitude]
 * @param routes - Array of all route documents
 * @param bufferDistance - Buffer distance in meters
 * @returns Search result with direct and transfer routes
 */
export const searchRoutes = (
  origin: GeoJSONCoordinate,
  destination: GeoJSONCoordinate,
  routes: RouteDocument[],
  bufferDistance: number = BUFFER_DISTANCE
): SpatialSearchResult => {
  console.log('[spatialFilter] Searching routes...');
  console.log('[spatialFilter] Origin:', origin);
  console.log('[spatialFilter] Destination:', destination);
  console.log('[spatialFilter] Available routes:', routes.length);

  // Find direct routes first
  const directRoutes = findMatchingRoutes(origin, destination, routes, bufferDistance);
  console.log('[spatialFilter] Direct routes found:', directRoutes.length);

  // Search for transfers if no direct routes found
  let transferRoutes: TransferRouteOption[] = [];

  if (directRoutes.length === 0) {
    console.log('[spatialFilter] No direct routes, searching for transfers...');
    transferRoutes = findTransferRoutes(origin, destination, routes, bufferDistance);
    console.log('[spatialFilter] Transfer routes found:', transferRoutes.length);
  }

  return {
    directRoutes,
    transferRoutes,
    hasDirectRoute: directRoutes.length > 0,
    hasTransferRoute: transferRoutes.length > 0,
  };
};

// =============================================================================
// Exports
// =============================================================================

export default {
  BUFFER_DISTANCE,
  createRouteBuffer,
  isPointWithinRouteBuffer,
  findMatchingRoutes,
  calculateDistance,
  calculateFare,
  findNearestPointOnRoute,
  calculateRouteDistance,
  estimateTime,
  findRoutesContainingPoint,
  findRouteIntersections,
  getDistanceToRoute,
  findTransferRoutes,
  searchRoutes,
};
