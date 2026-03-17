const express = require('express');
const router = express.Router();
const Stop = require('../models/Stop');

/**
 * @route   GET /api/stops
 * @desc    Get all active stops
 * @access  Public
 */
router.get('/', async (req, res) => {
  try {
    const stops = await Stop.find({ isActive: true }).select('-__v');

    res.status(200).json({
      success: true,
      count: stops.length,
      data: stops,
    });
  } catch (error) {
    console.error('Error fetching stops:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching stops',
      error: error.message,
    });
  }
});

/**
 * @route   GET /api/stops/nearby
 * @desc    Find stops near a location
 * @access  Public
 * @query   lng, lat, maxDistance (in meters, default 500)
 */
router.get('/nearby', async (req, res) => {
  try {
    const { lng, lat, maxDistance = 500 } = req.query;

    if (!lng || !lat) {
      return res.status(400).json({
        success: false,
        message: 'Longitude (lng) and latitude (lat) are required',
      });
    }

    const coordinates = [parseFloat(lng), parseFloat(lat)];
    const distance = parseInt(maxDistance);

    const stops = await Stop.findNearby(coordinates, distance);

    res.status(200).json({
      success: true,
      count: stops.length,
      searchLocation: { lng: coordinates[0], lat: coordinates[1] },
      maxDistance: distance,
      data: stops,
    });
  } catch (error) {
    console.error('Error finding nearby stops:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while finding nearby stops',
      error: error.message,
    });
  }
});

/**
 * @route   GET /api/stops/:stopId
 * @desc    Get a single stop by stopId
 * @access  Public
 */
router.get('/:stopId', async (req, res) => {
  try {
    const stop = await Stop.findOne({
      stopId: req.params.stopId,
      isActive: true,
    });

    if (!stop) {
      return res.status(404).json({
        success: false,
        message: 'Stop not found',
      });
    }

    res.status(200).json({
      success: true,
      data: stop,
    });
  } catch (error) {
    console.error('Error fetching stop:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching stop',
      error: error.message,
    });
  }
});

/**
 * @route   GET /api/stops/route/:routeId
 * @desc    Get all stops for a specific route
 * @access  Public
 */
router.get('/route/:routeId', async (req, res) => {
  try {
    const stops = await Stop.findByRouteId(req.params.routeId);

    res.status(200).json({
      success: true,
      count: stops.length,
      routeId: req.params.routeId,
      data: stops,
    });
  } catch (error) {
    console.error('Error fetching stops for route:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching stops for route',
      error: error.message,
    });
  }
});

module.exports = router;
