const express = require('express');
const router = express.Router();
const { body, param, validationResult } = require('express-validator');
const Route = require('../models/Route');
const {
  findMatchingRoutes,
  calculateFare,
  calculateRouteDistance,
  findTransferRoutes,
  searchRoutes,
  BUFFER_DISTANCE,
} = require('../services/spatialFilter');

/**
 * Validation middleware helper
 * Checks validation results and returns 400 with errors if validation fails
 */
const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array(),
    });
  }
  next();
};

/**
 * Validation rules for POST /search
 */
const searchValidationRules = [
  body('origin')
    .exists({ checkNull: true })
    .withMessage('Origin is required')
    .isArray({ min: 2, max: 2 })
    .withMessage('Origin must be an array of [longitude, latitude]'),
  body('origin.*')
    .isDecimal()
    .withMessage('Origin values must be decimal numbers'),
  body('destination')
    .exists({ checkNull: true })
    .withMessage('Destination is required')
    .isArray({ min: 2, max: 2 })
    .withMessage('Destination must be an array of [longitude, latitude]'),
  body('destination.*')
    .isDecimal()
    .withMessage('Destination values must be decimal numbers'),
  body('bufferDistance')
    .optional()
    .isFloat({ gt: 0 })
    .withMessage('Buffer distance must be a float greater than 0'),
  body('includeTransfers')
    .optional()
    .isBoolean()
    .withMessage('includeTransfers must be a boolean'),
];

/**
 * Validation rules for GET /:routeId
 */
const routeIdValidationRules = [
  param('routeId')
    .notEmpty()
    .withMessage('Route ID is required')
    .trim()
    .escape(),
];

/**
 * @route   GET /api/routes
 * @desc    Get all active routes
 * @access  Public
 */
router.get('/', async (req, res) => {
  try {
    const routes = await Route.find({ isActive: true })
      .populate('stops')
      .select('-__v');

    res.status(200).json({
      success: true,
      count: routes.length,
      data: routes,
    });
  } catch (error) {
    console.error('Error fetching routes:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching routes',
      error: error.message,
    });
  }
});

/**
 * @route   GET /api/routes/:routeId
 * @desc    Get a single route by routeId
 * @access  Public
 */
router.get('/:routeId', routeIdValidationRules, validateRequest, async (req, res) => {
  try {
    const route = await Route.findOne({
      routeId: req.params.routeId,
      isActive: true,
    }).populate('stops');

    if (!route) {
      return res.status(404).json({
        success: false,
        message: 'Route not found',
      });
    }

    res.status(200).json({
      success: true,
      data: route,
    });
  } catch (error) {
    console.error('Error fetching route:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching route',
      error: error.message,
    });
  }
});

/**
 * @route   POST /api/routes/search
 * @desc    Find routes that match origin and destination (Graph-Lite algorithm)
 *          Returns both direct routes and transfer routes (max 1 transfer)
 * @access  Public
 * @body    { origin: [lng, lat], destination: [lng, lat], bufferDistance?: number, includeTransfers?: boolean }
 */
router.post('/search', searchValidationRules, validateRequest, async (req, res) => {
  try {
    const { origin, destination, bufferDistance, includeTransfers = true } = req.body;

    // Fetch all active routes
    const allRoutes = await Route.find({ isActive: true }).populate('stops');

    const effectiveBufferDistance = bufferDistance || BUFFER_DISTANCE;

    // Use comprehensive search that includes transfer logic
    const searchResult = searchRoutes(
      origin,
      destination,
      allRoutes,
      effectiveBufferDistance
    );

    // Calculate fare for each direct route
    const directRoutesWithFare = searchResult.directRoutes.map((route) => {
      const distance = calculateRouteDistance(origin, destination, route.geometry);
      const calculatedFare = calculateFare(distance, route.fare);

      return {
        type: 'direct',
        routeId: route.routeId,
        routeName: route.routeName,
        vehicleType: route.vehicleType,
        signboard: route.signboard,
        trafficLevel: route.trafficLevel,
        geometry: route.geometry,
        stops: route.stops,
        calculatedDistance: Math.round(distance * 100) / 100,
        calculatedFare,
      };
    });

    // Prepare response
    const response = {
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
      bufferDistance: effectiveBufferDistance,
      summary: {
        directRoutesCount: directRoutesWithFare.length,
        transferRoutesCount: includeTransfers ? searchResult.transferRoutes.length : 0,
        hasDirectRoute: searchResult.hasDirectRoute,
        hasTransferRoute: includeTransfers && searchResult.hasTransferRoute,
      },
      directRoutes: directRoutesWithFare,
    };

    // Include transfer routes if requested and available
    if (includeTransfers) {
      response.transferRoutes = searchResult.transferRoutes;
    }

    // Add recommendation based on results
    if (directRoutesWithFare.length > 0) {
      // Sort a copy of direct routes by distance and pick the shortest
      const bestDirect = [...directRoutesWithFare]
        .sort((a, b) => a.calculatedDistance - b.calculatedDistance)[0];
      response.recommendation = {
        type: 'direct',
        routeId: bestDirect.routeId,
        routeName: bestDirect.routeName,
        distance: bestDirect.calculatedDistance,
        signboard: bestDirect.signboard, 
        vehicleType: bestDirect.vehicleType,
        fare: bestDirect.calculatedFare,
        reason: 'Shortest direct route available',
      };
    } else if (searchResult.transferRoutes.length > 0) {
      const bestTransfer = searchResult.transferRoutes[0]; // Already sorted by distance
      response.recommendation = {
        type: 'transfer',
        legs: bestTransfer.legs.map((leg) => ({
          routeId: leg.route.routeId,
          routeName: leg.route.routeName,
          signboard: leg.route.signboard,
          vehicleType: leg.route.vehicleType,
        })),
        transferPoint: bestTransfer.transferPoint,
        distance: bestTransfer.totalDistance,
        fare: bestTransfer.totalFare,
        reason: 'No direct route available; shortest transfer option',
      };
    } else {
      response.recommendation = null;
      response.message = 'No routes found connecting origin and destination';
    }

    res.status(200).json(response);
  } catch (error) {
    console.error('Error searching routes:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while searching routes',
      error: error.message,
    });
  }
});

module.exports = router;
