/**
 * Commute Routes API
 * 
 * Phase 4: API Integration
 * 
 * Endpoints:
 * - POST /api/commutes/search - Find optimal routes using A* pathfinding
 * - GET /api/commutes/routes - List all available transit routes
 * - POST /api/commutes/stopwatch - Record GPS trace data for segment times
 * - POST /api/commutes - Save completed commute session (legacy)
 * - GET /api/commutes - List commute sessions
 * - GET /api/commutes/:id - Get specific session
 * 
 * @module routes/commuteRoutes
 * @version 2.1.0
 */

const express = require('express');
const router = express.Router();

// Import services
const { GraphService } = require('../services/GraphService');
const AStarPathfinder = require('../services/AStarPathfinder');
const FareCalculator = require('../services/FareCalculator');
const StopwatchService = require('../services/StopwatchService');

// Import server status (hybrid initialization)
let serverModule;
try {
  serverModule = require('../server');
} catch (e) {
  serverModule = null;
}

// Service instances (local fallback for lazy init)
let localGraphService = null;
let localPathfinder = null;
let localFareCalculator = null;
let localStopwatchService = null;
let localServicesInitialized = false;
let localServicesInitializing = false;

/**
 * Get services from server (hybrid) or local instances
 */
function getActiveServices() {
  // Try server-level services first (hybrid init)
  if (serverModule?.isServicesReady?.()) {
    return serverModule.getServices();
  }
  
  // Fallback to local services
  return {
    graphService: localGraphService,
    pathfinder: localPathfinder,
    fareCalculator: localFareCalculator,
    stopwatchService: localStopwatchService,
  };
}

/**
 * Initialize services lazily (fallback when server init not available)
 * @returns {Promise<boolean>}
 */
async function initializeServices() {
  // Check server-level services first
  if (serverModule?.isServicesReady?.()) {
    return true;
  }
  
  if (localServicesInitialized) return true;
  if (localServicesInitializing) {
    // Wait for initialization to complete
    while (localServicesInitializing) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return localServicesInitialized;
  }
  
  localServicesInitializing = true;
  
  try {
    console.log('[CommuteRoutes] Initializing graph services (fallback)...');
    
    // Initialize GraphService
    localGraphService = new GraphService();
    await localGraphService.initialize();
    
    // Initialize supporting services
    localFareCalculator = new FareCalculator();
    localStopwatchService = new StopwatchService();
    
    // Initialize A* pathfinder
    localPathfinder = new AStarPathfinder(localGraphService, localFareCalculator, localStopwatchService);
    
    localServicesInitialized = true;
    console.log('[CommuteRoutes] ✅ Graph services initialized (fallback)');
    return true;
  } catch (error) {
    console.error('[CommuteRoutes] ❌ Failed to initialize services:', error.message);
    localServicesInitializing = false;
    return false;
  } finally {
    localServicesInitializing = false;
  }
}

/**
 * Middleware to ensure services are initialized
 */
async function ensureServices(req, res, next) {
  // Check server-level services first
  if (serverModule?.isServicesReady?.()) {
    return next();
  }
  
  // Check if server is still initializing
  if (serverModule?.serviceStatus?.status === 'initializing') {
    return res.status(503).json({
      success: false,
      error: 'SERVICE_INITIALIZING',
      message: 'Server is starting up. Please try again in a few seconds.',
      status: serverModule.serviceStatus.status,
    });
  }
  
  // Fallback to local init
  if (!localServicesInitialized) {
    const success = await initializeServices();
    if (!success) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: 'Graph services are not available. Please try again later.',
      });
    }
  }
  next();
}

// =============================================================================
// PHASE 4: NEW GRAPH-BASED ENDPOINTS
// =============================================================================

/**
 * POST /api/commutes/search
 * Find optimal routes between two points using A* pathfinding
 * 
 * @param {Object} req.body - Search parameters
 * @param {Object} req.body.origin - Origin coordinates {lat, lon}
 * @param {Object} req.body.destination - Destination coordinates {lat, lon}
 * @param {string} [req.body.mode='TIME'] - Optimization mode (TIME, FARE, DISTANCE)
 * @param {number} [req.body.maxResults=3] - Maximum number of route alternatives
 * @param {number} [req.body.maxWalkingKm] - Maximum walking distance to transit
 * 
 * @returns {Object} Route search results
 */
router.post('/search', ensureServices, async (req, res) => {
  try {
    const { origin, destination, mode, maxResults, maxWalkingKm } = req.body;
    const { pathfinder, graphService } = getActiveServices();

    // Validate required fields
    if (!origin || !destination) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Missing required fields: origin and destination',
      });
    }

    if (typeof origin.lat !== 'number' || typeof origin.lon !== 'number') {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Invalid origin coordinates. Expected {lat: number, lon: number}',
      });
    }

    if (typeof destination.lat !== 'number' || typeof destination.lon !== 'number') {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Invalid destination coordinates. Expected {lat: number, lon: number}',
      });
    }

    // Validate mode if provided
    const validModes = ['TIME', 'FARE', 'DISTANCE'];
    if (mode && !validModes.includes(mode.toUpperCase())) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: `Invalid mode: ${mode}. Must be one of: ${validModes.join(', ')}`,
      });
    }

    console.log('[CommuteRoutes] Search request:', {
      origin: `${origin.lat.toFixed(6)}, ${origin.lon.toFixed(6)}`,
      destination: `${destination.lat.toFixed(6)}, ${destination.lon.toFixed(6)}`,
      mode: mode || 'TIME',
    });

    // Execute A* search
    const results = await pathfinder.findPath(
      origin.lat,
      origin.lon,
      destination.lat,
      destination.lon,
      {
        mode: mode?.toUpperCase() || 'TIME',
        maxResults: maxResults || 3,
        maxWalkingKm: maxWalkingKm,
      }
    );

    // Build alternatives object (always provided)
    const alternatives = buildAlternatives(origin, destination, graphService, results);

    // Always return 200 - even when no routes found
    // Empty routes + alternatives is a valid response
    if (!results.success || !results.results || results.results.length === 0) {
      console.log('[CommuteRoutes] No routes found, returning alternatives');
      
      return res.status(200).json({
        success: true,
        data: {
          routes: [],
          alternatives,
          summary: {
            totalRoutes: 0,
            searchTimeMs: results.searchTimeMs || 0,
            origin,
            destination,
            mode: mode?.toUpperCase() || 'TIME',
          },
        },
      });
    }

    console.log('[CommuteRoutes] Search completed:', {
      routesFound: results.results.length,
      searchTimeMs: results.searchTimeMs,
    });

    res.status(200).json({
      success: true,
      data: {
        routes: results.results,
        alternatives,
        summary: {
          totalRoutes: results.results.length,
          searchTimeMs: results.searchTimeMs,
          origin,
          destination,
          mode: mode?.toUpperCase() || 'TIME',
        },
      },
    });

  } catch (error) {
    console.error('[CommuteRoutes] Search error:', error);
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Internal server error during route search',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * Build alternatives response for route search
 * @param {Object} origin - Origin coordinates
 * @param {Object} destination - Destination coordinates  
 * @param {Object} graphService - GraphService instance
 * @param {Object} results - Search results
 * @returns {Object} Alternatives object
 */
function buildAlternatives(origin, destination, graphService, results) {
  const alternatives = {
    walkingOption: null,
    nearbyOriginStops: [],
    nearbyDestinationStops: [],
    message: '',
  };
  
  // Calculate walking option
  const walkingDistanceKm = haversineDistance(
    origin.lat, origin.lon,
    destination.lat, destination.lon
  );
  const walkingTimeMinutes = Math.round((walkingDistanceKm / 4.5) * 60);
  
  if (walkingDistanceKm <= 2.0) { // Walkable distance threshold
    alternatives.walkingOption = {
      available: true,
      distanceKm: Math.round(walkingDistanceKm * 1000) / 1000,
      timeMinutes: walkingTimeMinutes,
      message: `Walk directly (${(walkingDistanceKm * 1000).toFixed(0)}m, ~${walkingTimeMinutes} min)`,
    };
  }
  
  // Find nearby stops
  if (graphService?.findNearestTransitNodes) {
    try {
      alternatives.nearbyOriginStops = graphService.findNearestTransitNodes(
        origin.lat, origin.lon, 0.5, 5
      ).map(formatNearbyStop);
      
      alternatives.nearbyDestinationStops = graphService.findNearestTransitNodes(
        destination.lat, destination.lon, 0.5, 5
      ).map(formatNearbyStop);
    } catch (e) {
      console.warn('[CommuteRoutes] Could not find nearby stops:', e.message);
    }
  }
  
  // Set message based on results
  if (!results.success || results.results?.length === 0) {
    if (alternatives.walkingOption) {
      alternatives.message = 'No transit routes found, but walking is an option.';
    } else if (alternatives.nearbyOriginStops.length === 0) {
      alternatives.message = 'No transit stops found near your origin. Try moving to a main road.';
    } else if (alternatives.nearbyDestinationStops.length === 0) {
      alternatives.message = 'No transit stops found near your destination. Try a different endpoint.';
    } else {
      alternatives.message = 'No transit routes connect these points directly. Consider breaking your trip into segments.';
    }
  } else {
    alternatives.message = `Found ${results.results.length} route option(s).`;
  }
  
  return alternatives;
}

/**
 * Format nearby stop for API response
 */
function formatNearbyStop(stop) {
  return {
    nodeId: stop.nodeId,
    lat: stop.lat,
    lon: stop.lon,
    distanceKm: stop.distanceKm,
    distanceMeters: Math.round(stop.distanceKm * 1000),
    isTerminal: stop.isTerminal || false,
    routes: stop.routes || [],
  };
}

/**
 * Calculate distance between two points using Haversine formula
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * GET /api/commutes/routes
 * List all available transit routes
 * 
 * @query {string} [vehicleType] - Filter by vehicle type
 * @query {string} [direction] - Filter by direction (inbound/outbound)
 * @query {boolean} [includeNodes=false] - Include road node sequences
 * 
 * @returns {Object} List of transit routes
 */
router.get('/routes', ensureServices, async (req, res) => {
  try {
    const { vehicleType, direction, includeNodes } = req.query;
    const { graphService } = getActiveServices();

    const routes = graphService.getAllRoutes();
    
    // Apply filters
    let filteredRoutes = routes;
    
    if (vehicleType) {
      filteredRoutes = filteredRoutes.filter(r => r.vehicleType === vehicleType);
    }
    
    if (direction) {
      filteredRoutes = filteredRoutes.filter(r => r.direction === direction);
    }

    // Transform for API response
    const responseRoutes = filteredRoutes.map(route => ({
      routeId: route.routeId,
      routeName: route.routeName,
      vehicleType: route.vehicleType,
      signboard: route.signboard,
      direction: route.direction,
      startTerminal: route.startTerminal,
      endTerminal: route.endTerminal,
      ...(includeNodes === 'true' && { nodeCount: route.roadNodeSequence?.length || 0 }),
    }));

    console.log('[CommuteRoutes] Routes list:', {
      total: responseRoutes.length,
      filters: { vehicleType, direction },
    });

    res.status(200).json({
      success: true,
      data: {
        routes: responseRoutes,
        total: responseRoutes.length,
        filters: {
          vehicleType: vehicleType || null,
          direction: direction || null,
        },
      },
    });

  } catch (error) {
    console.error('[CommuteRoutes] Routes list error:', error);
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Internal server error while fetching routes',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * POST /api/commutes/stopwatch
 * Record GPS trace data for automatic segment time tracking
 * 
 * @param {Object} req.body - GPS trace data
 * @param {string} req.body.routeId - Route ID being tracked
 * @param {Array} req.body.trace - Array of GPS points with timestamps
 * @param {string} req.body.vehicleType - Type of vehicle
 * 
 * @returns {Object} Recording result
 */
router.post('/stopwatch', ensureServices, async (req, res) => {
  try {
    const { routeId, trace, vehicleType } = req.body;
    const { stopwatchService, graphService } = getActiveServices();

    // Validate required fields
    if (!routeId || !trace || !vehicleType) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Missing required fields: routeId, trace, vehicleType',
      });
    }

    if (!Array.isArray(trace) || trace.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'trace must be an array with at least 2 GPS points',
      });
    }

    console.log('[CommuteRoutes] Stopwatch recording:', {
      routeId,
      traceLength: trace.length,
      vehicleType,
    });

    // Process GPS trace through StopwatchService
    const result = await stopwatchService.recordGPSTrace({
      routeId,
      trace,
      vehicleType,
      graphService,
    });

    console.log('[CommuteRoutes] Stopwatch result:', {
      recorded: result.recordedSegments,
      skipped: result.skippedSegments,
      warnings: result.warnings?.length || 0,
    });

    res.status(201).json({
      success: true,
      data: {
        routeId,
        recordedSegments: result.recordedSegments,
        skippedSegments: result.skippedSegments,
        warnings: result.warnings || [],
        message: `Recorded ${result.recordedSegments} segment times`,
      },
    });

  } catch (error) {
    console.error('[CommuteRoutes] Stopwatch error:', error);
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Internal server error while recording GPS trace',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * GET /api/commutes/config
 * Get current routing configuration
 */
router.get('/config', ensureServices, (req, res) => {
  try {
    const { graphService, fareCalculator } = getActiveServices();
    const config = graphService.getConfig();
    
    res.status(200).json({
      success: true,
      data: {
        transferPenaltyMinutes: config.transferPenaltyMinutes,
        maxWalkingDistanceKm: config.maxWalkingDistanceKm,
        maxTransferWalkingKm: config.maxTransferWalkingKm,
        routeMappingToleranceKm: config.routeMappingToleranceKm,
        walkingSpeedKmh: config.walkingSpeedKmh,
        supportedVehicleTypes: fareCalculator.getSupportedVehicleTypes(),
      },
    });
  } catch (error) {
    console.error('[CommuteRoutes] Config error:', error);
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Internal server error while fetching configuration',
    });
  }
});

/**
 * GET /api/commutes/nearby
 * Find nearby transit stops from a location
 * 
 * @query {number} lat - Latitude
 * @query {number} lon - Longitude
 * @query {number} [radius=0.5] - Search radius in km
 * @query {number} [limit=10] - Maximum results
 */
router.get('/nearby', ensureServices, (req, res) => {
  try {
    const { graphService } = getActiveServices();
    const lat = parseFloat(req.query.lat);
    const lon = parseFloat(req.query.lon);
    const radius = parseFloat(req.query.radius) || 0.5;
    const limit = parseInt(req.query.limit) || 10;

    if (isNaN(lat) || isNaN(lon)) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Invalid coordinates. lat and lon must be numbers.',
      });
    }

    const nearbyNodes = graphService.findNearestTransitNodes(lat, lon, radius, limit);

    // Enrich with route information
    const results = nearbyNodes.map(node => {
      const routeDetails = node.transitRoutes.map(routeId => {
        const route = graphService.getRouteInfo(routeId);
        return {
          routeId,
          routeName: route?.routeName || routeId,
          vehicleType: route?.vehicleType || 'unknown',
          signboard: route?.signboard || '',
        };
      });

      return {
        nodeId: node.nodeId,
        lat: node.lat,
        lon: node.lon,
        distanceKm: Math.round(node.distance * 1000) / 1000,
        distanceMeters: Math.round(node.distance * 1000),
        isTerminal: node.isTerminal,
        routes: routeDetails,
      };
    });

    console.log('[CommuteRoutes] Nearby search:', {
      location: `${lat.toFixed(6)}, ${lon.toFixed(6)}`,
      found: results.length,
    });

    res.status(200).json({
      success: true,
      data: {
        location: { lat, lon },
        radius: radius,
        results: results,
        total: results.length,
      },
    });

  } catch (error) {
    console.error('[CommuteRoutes] Nearby error:', error);
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Internal server error while searching nearby stops',
    });
  }
});

/**
 * GET /api/commutes/fare
 * Calculate fare for a route
 * 
 * @query {string} vehicleType - Vehicle type
 * @query {number} distanceKm - Distance in kilometers
 */
router.get('/fare', ensureServices, (req, res) => {
  try {
    const { fareCalculator } = getActiveServices();
    const vehicleType = req.query.vehicleType;
    const distanceKm = parseFloat(req.query.distanceKm);

    if (!vehicleType || isNaN(distanceKm)) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Required query parameters: vehicleType (string), distanceKm (number)',
      });
    }

    const breakdown = fareCalculator.getFareBreakdown(vehicleType, distanceKm);

    res.status(200).json({
      success: true,
      data: breakdown,
    });

  } catch (error) {
    console.error('[CommuteRoutes] Fare error:', error);
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Internal server error while calculating fare',
    });
  }
});

// =============================================================================
// LEGACY ENDPOINTS (kept for backward compatibility)
// =============================================================================

// Simple in-memory storage for commute sessions (in production, use MongoDB)
let commuteSessions = [];

/**
 * POST /api/commutes
 * Save a completed commute session
 * 
 * @param {Object} req.body - Commute session data
 * @param {string} req.body.id - Unique session identifier
 * @param {string} req.body.startTime - ISO timestamp when commute started
 * @param {string} req.body.endTime - ISO timestamp when commute ended
 * @param {number} req.body.duration - Total duration in milliseconds
 * @param {Object} req.body.route - Route information
 * @param {Object} req.body.origin - Origin coordinates
 * @param {Object} req.body.destination - Destination coordinates
 * @param {boolean} req.body.isPaused - Whether session was paused
 * @param {number} req.body.pausedDuration - Total paused duration
 * 
 * @returns {Object} Success response with saved session data
 * @returns {number} 201 - Created
 * @returns {number} 400 - Bad request
 * @returns {number} 500 - Server error
 */
router.post('/', (req, res) => {
  try {
    const {
      id,
      startTime,
      endTime,
      duration,
      route,
      origin,
      destination,
      isPaused,
      pausedDuration,
    } = req.body;

    // Validate required fields
    if (!id || !startTime || !duration) {
      console.error('[Commutes API] Missing required fields:', { id, startTime, duration });
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Missing required fields: id, startTime, duration',
      });
    }

    // Create session object
    const session = {
      id,
      startTime: new Date(startTime),
      endTime: endTime ? new Date(endTime) : null,
      duration,
      route: route || null,
      origin: origin || null,
      destination: destination || null,
      isPaused: isPaused || false,
      pausedDuration: pausedDuration || 0,
      savedAt: new Date(),
    };

    // Store session (in production, save to MongoDB)
    commuteSessions.push(session);

    console.log('[Commutes API] Session saved successfully:', {
      id: session.id,
      duration: session.duration,
      route: session.route?.routeName || 'unknown',
    });

    // Return saved session
    res.status(201).json({
      success: true,
      data: session,
      message: 'Commute session saved successfully',
    });

  } catch (error) {
    console.error('[Commutes API] Error saving session:', error);
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Internal server error while saving commute session',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * GET /api/commutes
 * Retrieve all saved commute sessions
 * 
 * @query {number} limit - Maximum number of sessions to return (default: 50)
 * @query {number} offset - Number of sessions to skip (default: 0)
 * 
 * @returns {Object} Array of commute sessions
 * @returns {number} 200 - OK
 */
router.get('/', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const paginatedSessions = commuteSessions.slice(offset, offset + limit);

    console.log('[Commutes API] Retrieved sessions:', {
      total: commuteSessions.length,
      returned: paginatedSessions.length,
      offset,
      limit,
    });

    res.status(200).json({
      success: true,
      data: paginatedSessions,
      pagination: {
        total: commuteSessions.length,
        returned: paginatedSessions.length,
        limit,
        offset,
      },
    });

  } catch (error) {
    console.error('[Commutes API] Error retrieving sessions:', error);
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Internal server error while retrieving commute sessions',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * GET /api/commutes/:id
 * Retrieve a specific commute session by ID
 * 
 * @param {string} id - Session ID
 * 
 * @returns {Object} Commute session
 * @returns {number} 200 - OK
 * @returns {number} 404 - Not found
 */
router.get('/:id', (req, res) => {
  try {
    const session = commuteSessions.find(s => s.id === req.params.id);

    if (!session) {
      console.warn('[Commutes API] Session not found:', req.params.id);
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: `Commute session with id ${req.params.id} not found`,
      });
    }

    console.log('[Commutes API] Retrieved session:', session.id);

    res.status(200).json({
      success: true,
      data: session,
    });

  } catch (error) {
    console.error('[Commutes API] Error retrieving session:', error);
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Internal server error while retrieving commute session',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

module.exports = router;
