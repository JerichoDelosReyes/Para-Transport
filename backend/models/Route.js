const mongoose = require('mongoose');

/**
 * Route Schema for Para Mobile
 * Stores jeepney/tricycle/bus routes as GeoJSON LineStrings
 * Supports 2dsphere index for spatial queries
 */
const routeSchema = new mongoose.Schema(
  {
    routeId: {
      type: String,
      required: [true, 'Route ID is required'],
      unique: true,
      trim: true,
      index: true,
    },
    routeName: {
      type: String,
      required: [true, 'Route name is required'],
      trim: true,
    },
    vehicleType: {
      type: String,
      required: [true, 'Vehicle type is required'],
      enum: {
        values: ['jeepney', 'tricycle', 'bus', 'cab'],
        message: '{VALUE} is not a valid vehicle type',
      },
      default: 'jeepney',
    },
    // GeoJSON LineString for the route path
    geometry: {
      type: {
        type: String,
        enum: ['LineString'],
        required: true,
        default: 'LineString',
      },
      coordinates: {
        type: [[Number]], // Array of [longitude, latitude] pairs
        required: [true, 'Route coordinates are required'],
        validate: {
          validator: function (coords) {
            if (!Array.isArray(coords) || coords.length === 0) {
              return false;
            }
            return coords.every(function (point) {
              if (!Array.isArray(point) || point.length !== 2) {
                return false;
              }
              var lon = point[0];
              var lat = point[1];
              if (typeof lon !== 'number' || typeof lat !== 'number') {
                return false;
              }
              if (lon < -180 || lon > 180) {
                return false;
              }
              if (lat < -90 || lat > 90) {
                return false;
              }
              return true;
            });
          },
          message:
            'Each coordinate must be a [longitude, latitude] pair with longitude between -180 and 180 and latitude between -90 and 90.',
        },
        validate: {
          validator: function (value) {
            return Array.isArray(value) && value.length >= 2;
          },
          message: 'Route geometry (LineString) must have at least two coordinate positions',
        },
      },
    },
    fare: {
      type: Number,
      required: [true, 'Fare is required'],
      min: [0, 'Fare cannot be negative'],
      default: 13, // Base fare in PHP
    },
    trafficLevel: {
      type: String,
      enum: {
        values: ['low', 'moderate', 'high'],
        message: '{VALUE} is not a valid traffic level',
      },
      default: 'low',
    },
    // References to Stop documents
    stops: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Stop',
      },
    ],
    // Additional metadata
    signboard: {
      type: String,
      trim: true,
      description: 'The text displayed on the vehicle windshield',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Create 2dsphere index on geometry for spatial queries
routeSchema.index({ geometry: '2dsphere' });

// Index for common queries
routeSchema.index({ vehicleType: 1, isActive: 1 });

/**
 * Static method to find routes within a buffer distance
 * @param {Array} coordinates - [longitude, latitude]
 * @param {Number} maxDistance - Maximum distance in meters
 */
routeSchema.statics.findNearby = function (coordinates, maxDistance = 400) {
  return this.aggregate([
    {
      $geoNear: {
        near: {
          type: 'Point',
          coordinates: coordinates,
        },
        key: 'geometry',
        distanceField: 'distance',
        maxDistance: maxDistance,
        spherical: true,
      },
    },
    {
      $match: {
        isActive: true,
      },
    },
  ]);
};

const Route = mongoose.model('Route', routeSchema);

module.exports = Route;
