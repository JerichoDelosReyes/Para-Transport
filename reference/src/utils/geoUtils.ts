/**
 * Geo Utilities
 * 
 * Helper functions for coordinate transformations and geographic calculations.
 * Uses @turf/turf for spatial computations aligned with Graph-Lite architecture.
 * 
 * @module utils/geoUtils
 * @requires @turf/turf
 */

import * as turf from '@turf/turf';
import type { Position, Feature, Point, LineString } from 'geojson';

/**
 * Coordinate type for react-native-maps
 */
export interface MapCoordinate {
  latitude: number;
  longitude: number;
}

/**
 * Region type for react-native-maps viewport
 */
export interface MapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

/**
 * Bounding box type [west, south, east, north]
 */
export type BoundingBox = [number, number, number, number];

/**
 * Default viewport centered on Imus, Cavite
 * NAV-001: City center coordinates for initial map load
 */
export const IMUS_CENTER: MapCoordinate = {
  latitude: 14.4296,
  longitude: 120.9367,
};

/**
 * Default zoom region for city-level navigation (zoom ~13-14)
 */
export const IMUS_DEFAULT_REGION: MapRegion = {
  ...IMUS_CENTER,
  latitudeDelta: 0.0322, // Approximately zoom level 14
  longitudeDelta: 0.0221,
};

/**
 * Convert GeoJSON Position [lng, lat] to MapCoordinate {latitude, longitude}
 * 
 * @param position - GeoJSON position array [longitude, latitude]
 * @returns MapCoordinate object for react-native-maps
 * 
 * @example
 * ```ts
 * const coord = positionToCoordinate([120.9367, 14.4296]);
 * // Returns: { latitude: 14.4296, longitude: 120.9367 }
 * ```
 */
export const positionToCoordinate = (position: Position): MapCoordinate => ({
  latitude: position[1],
  longitude: position[0],
});

/**
 * Convert MapCoordinate to GeoJSON Position [lng, lat]
 * 
 * @param coordinate - MapCoordinate object
 * @returns GeoJSON position array [longitude, latitude]
 */
export const coordinateToPosition = (coordinate: MapCoordinate): Position => [
  coordinate.longitude,
  coordinate.latitude,
];

/**
 * Convert array of GeoJSON positions to MapCoordinates
 * Useful for rendering Polylines from GeoJSON LineStrings
 * 
 * @param positions - Array of GeoJSON positions
 * @returns Array of MapCoordinates for react-native-maps
 */
export const positionsToCoordinates = (positions: Position[]): MapCoordinate[] =>
  positions.map(positionToCoordinate);

/**
 * Calculate distance between two coordinates in meters
 * Uses turf.js for accurate geodesic calculations
 * 
 * @param from - Starting coordinate
 * @param to - Ending coordinate
 * @returns Distance in meters
 */
export const calculateDistance = (from: MapCoordinate, to: MapCoordinate): number => {
  const fromPoint = turf.point(coordinateToPosition(from));
  const toPoint = turf.point(coordinateToPosition(to));
  
  // Returns distance in kilometers, convert to meters
  return turf.distance(fromPoint, toPoint, { units: 'meters' });
};

/**
 * Check if a coordinate is within a specified radius of a center point
 * 
 * @param center - Center coordinate
 * @param point - Point to check
 * @param radiusMeters - Radius in meters
 * @returns True if point is within radius
 */
export const isWithinRadius = (
  center: MapCoordinate,
  point: MapCoordinate,
  radiusMeters: number
): boolean => {
  return calculateDistance(center, point) <= radiusMeters;
};

/**
 * Find the nearest point on a line to a given coordinate
 * Useful for snapping user location to a route
 * 
 * @param coordinate - User coordinate
 * @param lineCoordinates - Array of coordinates forming the line
 * @returns Nearest point on the line and distance to it
 */
export const findNearestPointOnLine = (
  coordinate: MapCoordinate,
  lineCoordinates: MapCoordinate[]
): { point: MapCoordinate; distance: number } => {
  const point = turf.point(coordinateToPosition(coordinate));
  const line = turf.lineString(lineCoordinates.map(coordinateToPosition));
  
  const nearestPoint = turf.nearestPointOnLine(line, point);
  
  return {
    point: positionToCoordinate(nearestPoint.geometry.coordinates),
    distance: (nearestPoint.properties?.dist ?? 0) * 1000, // Convert km to meters
  };
};

/**
 * Calculate the bounding box for an array of coordinates
 * Useful for fitting map view to show all points
 * 
 * @param coordinates - Array of coordinates
 * @param padding - Optional padding percentage (0-1)
 * @returns MapRegion that encompasses all coordinates
 */
export const calculateBoundingRegion = (
  coordinates: MapCoordinate[],
  padding: number = 0.1
): MapRegion => {
  if (coordinates.length === 0) {
    return IMUS_DEFAULT_REGION;
  }

  if (coordinates.length === 1) {
    return {
      ...coordinates[0],
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    };
  }

  const points = turf.featureCollection(
    coordinates.map((c) => turf.point(coordinateToPosition(c)))
  );
  
  const bbox = turf.bbox(points) as BoundingBox;
  const [west, south, east, north] = bbox;

  const latDelta = (north - south) * (1 + padding);
  const lngDelta = (east - west) * (1 + padding);

  return {
    latitude: (north + south) / 2,
    longitude: (east + west) / 2,
    latitudeDelta: Math.max(latDelta, 0.01),
    longitudeDelta: Math.max(lngDelta, 0.01),
  };
};

/**
 * Format distance for display
 * 
 * @param meters - Distance in meters
 * @returns Formatted string (e.g., "500 m" or "1.2 km")
 */
export const formatDistance = (meters: number): string => {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
};

/**
 * Format duration for display
 * 
 * @param seconds - Duration in seconds
 * @returns Formatted string (e.g., "5 min" or "1 hr 30 min")
 */
export const formatDuration = (seconds: number): string => {
  const minutes = Math.round(seconds / 60);
  
  if (minutes < 60) {
    return `${minutes} min`;
  }
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  if (remainingMinutes === 0) {
    return `${hours} hr`;
  }
  
  return `${hours} hr ${remainingMinutes} min`;
};

// [PLACEHOLDER] - Logic for Traffic-Weighted Distance
// TODO: Implement distance calculation that factors in traffic conditions
// from the crowdsourced traffic layer (Stopwatch Data -> Backend Traffic Layer)
// Currently returns raw distance without traffic weighting
export const calculateTrafficWeightedDistance = (
  from: MapCoordinate,
  to: MapCoordinate
): number => {
  // Returns raw distance for now
  return calculateDistance(from, to);
};

/**
 * Calculate an estimated time of arrival (ETA) for a given distance.
 *
 * [PLACEHOLDER] - Real-time, traffic-aware ETA logic is not yet implemented.
 * Currently returns a static ETA based on an average jeepney speed.
 *
 * @param distanceMeters - Travel distance in meters.
 * @param _trafficFactor - Placeholder for future traffic-based adjustment.
 *                         Currently ignored; reserved for future implementation.
 * @returns ETA in seconds based on a fixed average speed.
 */
export const calculateETA = (
  distanceMeters: number,
  _trafficFactor: number = 1.0
): number => {
  // NOTE: _trafficFactor is currently unused and reserved for future
  // traffic-based ETA calculation once backend traffic data is integrated.
  // Average jeepney speed: ~15 km/h in city traffic
  const AVERAGE_SPEED_MPS = 15 * 1000 / 3600; // ~4.17 m/s
  return distanceMeters / AVERAGE_SPEED_MPS;
};
