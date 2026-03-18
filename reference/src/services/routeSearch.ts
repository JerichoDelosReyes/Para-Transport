/**
 * Route Search Service
 * 
 * Handles route search using local route data from routes.json.
 * Uses spatial filtering to find routes that service origin and destination.
 * Part of the Graph-Lite architecture - no paid routing APIs.
 * 
 * Phase 1 Update: Now uses spatialFilter.ts for sophisticated buffer analysis
 * and transfer route detection.
 * 
 * @module services/routeSearch
 */

import {
  GeoJSONCoordinate,
  RouteSearchRequest,
  RouteSearchResponse,
  RouteWithDetails,
  GeocodingResult,
  TransferRoute,
  RouteGeometry,
  VehicleType,
  MapCoordinate,
} from '../types/route';

// Import spatial filter service
import {
  searchRoutes as spatialSearchRoutes,
  RouteDocument,
  TransferRouteOption,
  calculateFare as spatialCalculateFare,
  calculateRouteDistance as spatialCalculateRouteDistance,
  estimateTime,
  BUFFER_DISTANCE as SPATIAL_BUFFER_DISTANCE,
} from './spatialFilter';

// Import actual route data
import routesData from '../data/routes.json';

// Import config
import { API_CONFIG, DEFAULT_FARE_RATES } from '../config/constants';

// =============================================================================
// Configuration
// =============================================================================

/**
 * Imus, Cavite center coordinates (default fallback)
 */
export const IMUS_CENTER: GeoJSONCoordinate = [120.9367, 14.4296];

/**
 * Buffer distance in meters for route matching
 * Uses the value from spatialFilter for consistency
 */
const BUFFER_DISTANCE = SPATIAL_BUFFER_DISTANCE;

/**
 * Nominatim (OSM) geocoding base URL
 */
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org';

/**
 * Request timeout in milliseconds
 */
const REQUEST_TIMEOUT = API_CONFIG.TIMEOUT;

// =============================================================================
// Known Locations (Offline Geocoding)
// =============================================================================

/**
 * Known locations in Imus/Bacoor/Cavite area with coordinates
 * These are the destinations our routes actually service
 */
const KNOWN_LOCATIONS: Record<string, { coordinate: GeoJSONCoordinate; aliases: string[] }> = {
  'sm molino': {
    coordinate: [120.9777, 14.3841],
    aliases: ['molino', 'sm molino cavite', 'molino mall'],
  },
  'bdo imus': {
    coordinate: [120.9407, 14.4207],
    aliases: ['bdo', 'bdo imus cavite'],
  },
  'robinsons paliparan': {
    coordinate: [120.9163, 14.4012],
    aliases: ['robpala', 'rob paliparan', 'robinsons pala', 'paliparan'],
  },
  'robinsons imus': {
    coordinate: [120.9385, 14.4030],
    aliases: ['robinson imus', 'robinsons', 'rob imus'],
  },
  'imus': {
    coordinate: [120.9367, 14.4296],
    aliases: ['imus cavite', 'imus city'],
  },
  'bacoor': {
    coordinate: [120.9425, 14.4355],
    aliases: ['bacoor city', 'bacoor cavite', 'sm bacoor'],
  },
  'general trias': {
    coordinate: [120.8814, 14.3869],
    aliases: ['gentri', 'gen trias', 'general trias cavite'],
  },
  'dasmarinas': {
    coordinate: [120.9367, 14.3294],
    aliases: ['dasma', 'dbb', 'dasmarinas cavite', 'sm dasma'],
  },
  'district imus': {
    coordinate: [120.9385, 14.4045],
    aliases: ['district', 'district mall', 'district imus cavite'],
  },
  'manggahan': {
    coordinate: [120.9280, 14.4180],
    aliases: ['manggahan imus'],
  },
  'zapote': {
    coordinate: [120.9650, 14.4480],
    aliases: ['zapote las pinas', 'c5 zapote'],
  },
  'lto imus': {
    coordinate: [120.9320, 14.4100],
    aliases: ['lto', 'lto cavite'],
  },
  'anabu': {
    coordinate: [120.9410, 14.4150],
    aliases: ['anabu imus', 'anabu 1', 'anabu 2'],
  },
  'alapan': {
    coordinate: [120.9350, 14.4250],
    aliases: ['alapan imus'],
  },
  'tanzang luma': {
    coordinate: [120.9300, 14.4180],
    aliases: ['tanzang luma imus'],
  },
};

/**
 * Route endpoint mapping - which routes go to which destinations
 */
const ROUTE_DESTINATIONS: Record<string, string[]> = {
  'BDO-SMMOLINO-OUT': ['sm molino'],
  'MANGGAHAN-SMMOLINO-IN': ['manggahan'],
  'MANGGAHAN-SMMOLINO-OUT': ['sm molino'],
  'BDO-ROBPALA-OUT': ['robinsons paliparan'],
  'BDO-GENTRI-OUT': ['general trias'],
  'MANGGAHAN-DISTRICT-OUT': ['district imus'],
  'BDO-DBBC-OUT': ['dasmarinas'],
  'DBB1-LTO-OUT': ['lto imus'],
  'DBB1-BAC-OUT': ['bacoor'],
  'DBB1-BDO-OUT': ['bdo imus'],
  'DBB1-SMB-OUT': ['bacoor'],
  'DBB1-ZAPOTE-OUT': ['zapote'],
  'MOLINO-DISTRICT-IN': ['sm molino'],
  'MOLINO-DISTRICT-OUT': ['district imus'],
  'ROBPALA-SMMOLINO-IN': ['robinsons paliparan'],
};

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Calculate distance between two coordinates using Haversine formula
 * @returns Distance in kilometers
 */
const calculateDistance = (
  coord1: GeoJSONCoordinate,
  coord2: GeoJSONCoordinate
): number => {
  const R = 6371; // Earth's radius in km
  const dLat = ((coord2[1] - coord1[1]) * Math.PI) / 180;
  const dLon = ((coord2[0] - coord1[0]) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((coord1[1] * Math.PI) / 180) *
      Math.cos((coord2[1] * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Calculate total route distance from geometry
 */
const calculateRouteDistance = (coordinates: GeoJSONCoordinate[]): number => {
  let total = 0;
  for (let i = 0; i < coordinates.length - 1; i++) {
    total += calculateDistance(coordinates[i], coordinates[i + 1]);
  }
  return total;
};

/**
 * Calculate fare based on distance (Philippine jeepney rates)
 * Uses centralized fare calculation from spatialFilter
 * Base fare: ₱13 for first 4km, ₱1.80 per km after
 */
const calculateFare = (distanceKm: number): number => {
  return spatialCalculateFare(distanceKm);
};

/**
 * Find closest point on route to a coordinate
 */
const findClosestPointOnRoute = (
  coordinate: GeoJSONCoordinate,
  routeCoordinates: GeoJSONCoordinate[]
): { index: number; distance: number } => {
  let minDistance = Infinity;
  let closestIndex = 0;
  
  for (let i = 0; i < routeCoordinates.length; i++) {
    const dist = calculateDistance(coordinate, routeCoordinates[i]);
    if (dist < minDistance) {
      minDistance = dist;
      closestIndex = i;
    }
  }
  
  return { index: closestIndex, distance: minDistance };
};

/**
 * Check if a coordinate is within buffer distance of a route
 */
const isNearRoute = (
  coordinate: GeoJSONCoordinate,
  routeCoordinates: GeoJSONCoordinate[],
  bufferKm: number = BUFFER_DISTANCE / 1000
): boolean => {
  const { distance } = findClosestPointOnRoute(coordinate, routeCoordinates);
  return distance <= bufferKm;
};

/**
 * Fetch with timeout wrapper
 */
const fetchWithTimeout = async (
  url: string,
  options: RequestInit,
  timeout: number = REQUEST_TIMEOUT
): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
};

// =============================================================================
// Route Processing
// =============================================================================

/**
 * Convert GeoJSON feature to RouteWithDetails
 */
const featureToRoute = (
  feature: typeof routesData.features[0],
  origin: GeoJSONCoordinate,
  destination: GeoJSONCoordinate
): RouteWithDetails => {
  const coordinates = feature.geometry.coordinates as GeoJSONCoordinate[];
  const props = feature.properties;
  
  // Find where origin and destination intersect with route
  const originPoint = findClosestPointOnRoute(origin, coordinates);
  const destPoint = findClosestPointOnRoute(destination, coordinates);
  
  // Calculate relevant portion of route
  const startIdx = Math.min(originPoint.index, destPoint.index);
  const endIdx = Math.max(originPoint.index, destPoint.index);
  const relevantCoords = coordinates.slice(startIdx, endIdx + 1);
  
  // Calculate distance along the route portion user will travel
  const routeDistance = calculateRouteDistance(relevantCoords);
  
  // Generate stops from key points along the route
  const stops = [
    {
      stopId: 'origin',
      name: 'Pickup Point',
      coordinate: coordinates[startIdx],
    },
    {
      stopId: 'mid',
      name: props.routeName.split(' TO ')[0] || 'Via Point',
      coordinate: coordinates[Math.floor((startIdx + endIdx) / 2)],
    },
    {
      stopId: 'dest',
      name: props.signboard,
      coordinate: coordinates[endIdx],
    },
  ];
  
  return {
    type: 'direct',
    routeId: props.routeId,
    routeName: props.routeName,
    signboard: props.signboard,
    vehicleType: props.vehicleType as 'jeep' | 'bus' | 'uv',
    geometry: {
      type: 'LineString',
      coordinates: relevantCoords,
    },
    fare: 13, // Base fare
    calculatedDistance: Math.round(routeDistance * 10) / 10,
    calculatedFare: calculateFare(routeDistance),
    estimatedTime: estimateTime(routeDistance),
    stops,
  };
};

/**
 * Find routes that match the destination
 */
const findMatchingRoutes = (
  destination: string,
  origin: GeoJSONCoordinate,
  destCoord: GeoJSONCoordinate
): RouteWithDetails[] => {
  console.log('[findMatchingRoutes] Destination input:', destination);
  
  const normalizedDest = destination.toLowerCase().trim();
  const matchingRoutes: RouteWithDetails[] = [];
  
  // Find which known location matches the destination
  let matchedLocation: string | null = null;
  
  for (const [locationName, locationData] of Object.entries(KNOWN_LOCATIONS)) {
    if (
      normalizedDest.includes(locationName) ||
      locationData.aliases.some(alias => normalizedDest.includes(alias))
    ) {
      matchedLocation = locationName;
      console.log('[findMatchingRoutes] Matched location:', locationName);
      break;
    }
  }
  
  // Find routes that go to this destination
  for (const [routeId, destinations] of Object.entries(ROUTE_DESTINATIONS)) {
    const servesDestination = matchedLocation
      ? destinations.includes(matchedLocation)
      : destinations.some(d => normalizedDest.includes(d));
    
    if (servesDestination) {
      // Find this route in our data
      const feature = routesData.features.find(
        f => f.properties.routeId === routeId
      );
      
      if (feature) {
        const route = featureToRoute(feature, origin, destCoord);
        matchingRoutes.push(route);
        console.log('[findMatchingRoutes] Added route:', routeId);
      }
    }
  }
  
  // If no specific routes found, find any routes near the destination
  if (matchingRoutes.length === 0) {
    console.log('[findMatchingRoutes] No exact match found, looking for nearby routes');
    for (const feature of routesData.features) {
      const coordinates = feature.geometry.coordinates as GeoJSONCoordinate[];
      
      if (isNearRoute(destCoord, coordinates, 1.0)) { // 1km buffer
        const route = featureToRoute(feature, origin, destCoord);
        matchingRoutes.push(route);
        console.log('[findMatchingRoutes] Added nearby route:', feature.properties.routeId);
        
        if (matchingRoutes.length >= 5) break; // Limit results
      }
    }
  }
  
  // Sort by distance
  matchingRoutes.sort((a, b) => a.calculatedDistance - b.calculatedDistance);
  
  console.log('[findMatchingRoutes] Total routes found:', matchingRoutes.length);
  
  return matchingRoutes.slice(0, 5); // Return top 5
};

// =============================================================================
// Public API
// =============================================================================

/**
 * Geocode a location string to coordinates
 * Uses known locations first, then falls back to Nominatim
 */
export const geocodeLocation = async (
  query: string
): Promise<GeocodingResult | null> => {
  const normalizedQuery = query.toLowerCase().trim();

  // Check known locations first (instant, offline)
  for (const [name, data] of Object.entries(KNOWN_LOCATIONS)) {
    if (
      normalizedQuery.includes(name) ||
      data.aliases.some(alias => normalizedQuery.includes(alias))
    ) {
      return {
        displayName: name
          .split(' ')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' '),
        coordinate: data.coordinate,
        type: 'known_location',
        confidence: 0.95,
      };
    }
  }

  // Try Nominatim geocoding for unknown locations
  try {
    const searchQuery = encodeURIComponent(query + ', Cavite, Philippines');
    const url = NOMINATIM_URL + '/search?q=' + searchQuery + '&format=json&limit=1&countrycodes=ph';

    const response = await fetchWithTimeout(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'ParaMobile/1.0',
      },
    });

    if (response.ok) {
      const results = await response.json();
      if (results.length > 0) {
        const result = results[0];
        return {
          displayName: result.display_name.split(',')[0],
          coordinate: [parseFloat(result.lon), parseFloat(result.lat)],
          type: 'nominatim',
          confidence: parseFloat(result.importance) || 0.7,
        };
      }
    }
  } catch (error) {
    console.warn('[routeSearch] Nominatim geocoding failed:', error);
  }

  // Fallback: return Imus center with low confidence
  console.warn('[routeSearch] Unknown location: "' + query + '", using Imus center');
  return {
    displayName: query,
    coordinate: IMUS_CENTER,
    type: 'fallback',
    confidence: 0.3,
  };
};

/**
 * Search for routes between two points
 * 
 * Phase 1 Update: Now uses spatialFilter for sophisticated Graph-Lite routing:
 * - Buffer analysis to find routes servicing both origin and destination
 * - Forward progress validation
 * - Transfer route detection via route intersection
 * - Fare calculation from centralized config
 */
export const searchRoutes = async (
  request: RouteSearchRequest
): Promise<RouteSearchResponse> => {
  console.log('[routeSearch] Search request:', JSON.stringify(request));

  const { origin, destination, bufferDistance = BUFFER_DISTANCE, includeTransfers = true } = request;
  
  console.log('[routeSearch] Origin:', origin);
  console.log('[routeSearch] Destination:', destination);
  console.log('[routeSearch] Buffer distance:', bufferDistance);
  console.log('[routeSearch] Include transfers:', includeTransfers);
  
  // Convert routes.json to RouteDocument format for spatialFilter
  const routeDocuments: RouteDocument[] = routesData.features.map(feature => ({
    routeId: feature.properties.routeId,
    routeName: feature.properties.routeName,
    vehicleType: feature.properties.vehicleType as VehicleType,
    signboard: feature.properties.signboard,
    direction: feature.properties.direction,
    fare: DEFAULT_FARE_RATES.BASE_FARE,
    geometry: {
      type: 'LineString' as const,
      coordinates: feature.geometry.coordinates as GeoJSONCoordinate[],
    },
  }));

  console.log('[routeSearch] Loaded route documents:', routeDocuments.length);

  // Use spatialFilter for route matching
  const spatialResult = spatialSearchRoutes(origin, destination, routeDocuments, bufferDistance);
  
  console.log('[routeSearch] Spatial search results:');
  console.log('  - Direct routes:', spatialResult.directRoutes.length);
  console.log('  - Transfer routes:', spatialResult.transferRoutes.length);

  // Convert direct routes from RouteDocument to RouteWithDetails
  const directRoutes: RouteWithDetails[] = spatialResult.directRoutes.map(routeDoc => {
    // Find the original feature for full coordinate data
    const feature = routesData.features.find(f => f.properties.routeId === routeDoc.routeId);
    if (feature) {
      return featureToRoute(feature, origin, destination);
    }
    // Fallback: create from routeDoc
    const routeDistance = spatialCalculateRouteDistance(origin, destination, routeDoc.geometry);
    return {
      type: 'direct' as const,
      routeId: routeDoc.routeId,
      routeName: routeDoc.routeName,
      signboard: routeDoc.signboard,
      vehicleType: routeDoc.vehicleType,
      geometry: routeDoc.geometry,
      fare: routeDoc.fare || DEFAULT_FARE_RATES.BASE_FARE,
      calculatedDistance: Math.round(routeDistance * 10) / 10,
      calculatedFare: calculateFare(routeDistance),
      estimatedTime: estimateTime(routeDistance),
      stops: [],
    };
  });

  // Convert transfer routes from TransferRouteOption to TransferRoute
  const transferRoutes: TransferRoute[] = includeTransfers 
    ? spatialResult.transferRoutes.map(transferOption => ({
        type: 'transfer' as const,
        transferCount: transferOption.transferCount,
        legs: transferOption.legs.map(leg => ({
          order: leg.order,
          route: {
            routeId: leg.route.routeId,
            routeName: leg.route.routeName,
            vehicleType: leg.route.vehicleType,
            signboard: leg.route.signboard,
            trafficLevel: leg.route.trafficLevel,
            geometry: leg.route.geometry,
          },
          from: leg.from,
          to: leg.to,
          distance: leg.distance,
          fare: leg.fare,
          estimatedTime: leg.estimatedTime,
        })),
        transferPoint: transferOption.transferPoint,
        totalDistance: transferOption.totalDistance,
        totalFare: transferOption.totalFare,
        totalTime: transferOption.totalTime || 0,
        walkingTime: transferOption.walkingTime,
      }))
    : [];

  // Sort direct routes by distance
  directRoutes.sort((a, b) => a.calculatedDistance - b.calculatedDistance);

  // If no routes found via spatial filter, try the legacy name-based matching
  if (directRoutes.length === 0 && transferRoutes.length === 0) {
    console.log('[routeSearch] No spatial matches, trying legacy name-based matching...');
    
    // Find destination name from known locations
    let destName = '';
    for (const [name, data] of Object.entries(KNOWN_LOCATIONS)) {
      const dist = calculateDistance(destination, data.coordinate);
      if (dist < 1.0) {
        destName = name;
        break;
      }
    }
    
    const legacyRoutes = findMatchingRoutes(destName || '', origin, destination);
    
    if (legacyRoutes.length > 0) {
      console.log('[routeSearch] Found legacy routes:', legacyRoutes.length);
      return buildSearchResponse(origin, destination, bufferDistance, legacyRoutes, []);
    }
    
    // Ultimate fallback: return first 3 routes
    console.log('[routeSearch] No matches found, returning fallback routes');
    const fallbackRoutes = routesData.features.slice(0, 3).map(feature => 
      featureToRoute(feature, origin, destination)
    );
    return buildSearchResponse(origin, destination, bufferDistance, fallbackRoutes, []);
  }

  console.log('[routeSearch] Returning spatial filter results');
  directRoutes.forEach((route, idx) => {
    console.log(`  [${idx}] ${route.routeName} - ₱${route.calculatedFare} (${route.calculatedDistance}km)`);
  });
  transferRoutes.forEach((route, idx) => {
    console.log(`  [Transfer ${idx}] ${route.legs.map(l => l.route.signboard).join(' → ')} - ₱${route.totalFare}`);
  });

  return buildSearchResponse(origin, destination, bufferDistance, directRoutes, transferRoutes);
};

/**
 * Build a RouteSearchResponse object
 */
const buildSearchResponse = (
  origin: GeoJSONCoordinate,
  destination: GeoJSONCoordinate,
  bufferDistance: number,
  directRoutes: RouteWithDetails[],
  transferRoutes: TransferRoute[]
): RouteSearchResponse => {
  const hasDirectRoute = directRoutes.length > 0;
  const hasTransferRoute = transferRoutes.length > 0;
  
  // Determine recommendation
  let recommendation = undefined;
  
  if (hasDirectRoute) {
    const bestDirect = directRoutes[0];
    recommendation = {
      type: 'direct' as const,
      routeId: bestDirect.routeId,
      routeName: bestDirect.routeName,
      signboard: bestDirect.signboard,
      vehicleType: bestDirect.vehicleType,
      distance: bestDirect.calculatedDistance,
      fare: bestDirect.calculatedFare,
      reason: 'Shortest direct route to destination',
    };
  } else if (hasTransferRoute) {
    const bestTransfer = transferRoutes[0];
    recommendation = {
      type: 'transfer' as const,
      distance: bestTransfer.totalDistance,
      fare: bestTransfer.totalFare,
      reason: 'Fastest route with 1 transfer',
      legs: bestTransfer.legs.map(leg => ({
        routeId: leg.route.routeId,
        routeName: leg.route.routeName,
        signboard: leg.route.signboard,
        vehicleType: leg.route.vehicleType,
      })),
      transferPoint: bestTransfer.transferPoint,
    };
  }

  return {
    success: true,
    origin: {
      coordinates: origin,
      lng: origin[0],
      lat: origin[1],
    },
    destination: {
      coordinates: destination,
      lng: destination[0],
      lat: destination[1],
    },
    bufferDistance,
    summary: {
      directRoutesCount: directRoutes.length,
      transferRoutesCount: transferRoutes.length,
      hasDirectRoute,
      hasTransferRoute,
    },
    directRoutes,
    transferRoutes,
    recommendation,
  };
};

/**
 * Get route details by ID
 */
export const getRouteDetails = async (
  routeId: string
): Promise<RouteWithDetails | null> => {
  const feature = routesData.features.find(
    f => f.properties.routeId === routeId
  );
  
  if (!feature) {
    return null;
  }
  
  return featureToRoute(feature, IMUS_CENTER, IMUS_CENTER);
};

/**
 * Reverse geocode coordinates to location name
 */
export const reverseGeocode = async (
  coordinate: GeoJSONCoordinate
): Promise<string | null> => {
  // Check known locations first
  for (const [name, data] of Object.entries(KNOWN_LOCATIONS)) {
    const dist = calculateDistance(coordinate, data.coordinate);
    if (dist < 0.5) { // Within 500m
      return name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }
  }
  
  // Try Nominatim
  try {
    const url = NOMINATIM_URL + '/reverse?lat=' + coordinate[1] + '&lon=' + coordinate[0] + '&format=json';

    const response = await fetchWithTimeout(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'ParaMobile/1.0',
      },
    });

    if (response.ok) {
      const result = await response.json();
      if (result.display_name) {
        return result.display_name.split(',').slice(0, 2).join(',').trim();
      }
    }
  } catch (error) {
    console.warn('[routeSearch] Reverse geocoding failed:', error);
  }

  return null;
};

/**
 * Get list of supported location names for suggestions
 * @returns Array of location names that are supported
 */
export const getSupportedLocations = (): string[] => {
  return Object.keys(KNOWN_LOCATIONS).map(name =>
    name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  );
};

/**
 * Search for matching locations based on user input
 * @param query - User's search query
 * @param limit - Max results to return (default 5)
 * @returns Array of matching location names
 */
export const searchSupportedLocations = (query: string, limit: number = 5): string[] => {
  if (!query || query.length < 2) return [];
  
  const normalizedQuery = query.toLowerCase().trim();
  const matches: string[] = [];

  for (const [name, data] of Object.entries(KNOWN_LOCATIONS)) {
    // Check main name
    if (name.includes(normalizedQuery)) {
      matches.push(name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '));
      continue;
    }
    
    // Check aliases
    for (const alias of data.aliases) {
      if (alias.includes(normalizedQuery)) {
        matches.push(name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '));
        break;
      }
    }
  }

  return matches.slice(0, limit);
};

// =============================================================================
// Production API Search (Phase 4)
// =============================================================================

import { apiService, ApiServiceError } from './api.service';
import type { SearchRequest, SearchResponse, Coordinate } from '../types/api.types';
import { 
  adaptSearchResponse, 
  mapCoordinateToApi,
  type AdaptedSearchResponse 
} from '../utils/RouteAdapter';

/**
 * Search for routes using the PRODUCTION backend API
 * 
 * This function calls the Render-hosted backend and transforms the response
 * for use with react-native-maps components.
 * 
 * Features:
 * - Uses A* pathfinding algorithm on backend
 * - Returns multiple route options with segments
 * - Handles Render cold start gracefully
 * - Full type safety with adapted response
 * 
 * @param origin - Origin coordinates [lng, lat] or {latitude, longitude}
 * @param destination - Destination coordinates [lng, lat] or {latitude, longitude}
 * @param options - Additional search options
 * @returns Adapted search response ready for map rendering
 * 
 * @example
 * ```ts
 * const result = await searchRoutesFromApi(
 *   { latitude: 14.4207, longitude: 120.9407 },
 *   { latitude: 14.3841, longitude: 120.9777 }
 * );
 * 
 * if (result.routes.length > 0) {
 *   // Render route on map
 *   const bestRoute = result.routes[0];
 *   bestRoute.segments.forEach(seg => {
 *     // Draw polyline with seg.coordinates and seg.color
 *   });
 * }
 * ```
 */
export const searchRoutesFromApi = async (
  origin: GeoJSONCoordinate | MapCoordinate,
  destination: GeoJSONCoordinate | MapCoordinate,
  options?: {
    mode?: 'TIME' | 'FARE' | 'DISTANCE';
    maxResults?: number;
    maxWalkingKm?: number;
  }
): Promise<AdaptedSearchResponse> => {
  console.log('[routeSearch] searchRoutesFromApi called');
  console.log('  Origin:', origin);
  console.log('  Destination:', destination);
  console.log('  Options:', options);

  // Convert coordinates to API format { lat, lon }
  const toApiCoordinate = (coord: GeoJSONCoordinate | MapCoordinate): Coordinate => {
    if (Array.isArray(coord)) {
      // GeoJSON [lng, lat] -> { lat, lon }
      return { lat: coord[1], lon: coord[0] };
    } else {
      // MapCoordinate { latitude, longitude } -> { lat, lon }
      return { lat: coord.latitude, lon: coord.longitude };
    }
  };

  const request: SearchRequest = {
    origin: toApiCoordinate(origin),
    destination: toApiCoordinate(destination),
    mode: options?.mode || 'TIME',
    maxResults: options?.maxResults,
    maxWalkingKm: options?.maxWalkingKm,
  };

  console.log('[routeSearch] API request:', JSON.stringify(request));

  try {
    // Call the backend API
    const response = await apiService.searchRoutes(request);
    
    console.log('[routeSearch] API response received');
    console.log('  Success:', response.success);
    console.log('  Routes found:', response.data.routes.length);

    // Adapt the response for map rendering
    const adapted = adaptSearchResponse(response);
    
    console.log('[routeSearch] Response adapted');
    console.log('  Adapted routes:', adapted.routes.length);

    return adapted;
  } catch (error) {
    console.error('[routeSearch] API search failed:', error);
    
    // Re-throw ApiServiceError with context
    if (error instanceof ApiServiceError) {
      throw error;
    }
    
    // Wrap unknown errors
    throw new ApiServiceError(
      'Failed to search routes',
      'SERVER_ERROR',
      { details: error instanceof Error ? error.message : 'Unknown error' }
    );
  }
};

/**
 * Check if the backend API is available
 * Useful for showing offline mode or retry UI
 */
export const checkApiHealth = async (): Promise<boolean> => {
  return apiService.isServerReady();
};

// =============================================================================
// Export Default
// =============================================================================

export default {
  searchRoutes,
  searchRoutesFromApi,
  checkApiHealth,
  getRouteDetails,
  geocodeLocation,
  reverseGeocode,
  getSupportedLocations,
  searchSupportedLocations,
  IMUS_CENTER,
};
