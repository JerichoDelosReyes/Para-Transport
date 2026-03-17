const mongoose = require('mongoose');

/**
 * Stop Schema for Para Mobile
 * Stores jeepney/tricycle/bus stops as GeoJSON Points
 * Supports 2dsphere index for spatial queries
 */
const stopSchema = new mongoose.Schema(
  {
    stopId: {
      type: String,
      required: [true, 'Stop ID is required'],
      unique: true,
      trim: true,
      index: true,
    },
    stopName: {
      type: String,
      required: [true, 'Stop name is required'],
      trim: true,
    },
    // GeoJSON Point for the stop location [longitude, latitude]
    location: {
      type: {
        type: String,
        enum: ['Point'],
        required: true,
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: [true, 'Stop coordinates are required'],
        validate: {
          validator: function (coords) {
            return (
              coords.length === 2 &&
              coords[0] >= -180 &&
              coords[0] <= 180 && // Longitude
              coords[1] >= -90 &&
              coords[1] <= 90 // Latitude
            );
          },
          message: 'Invalid coordinates. Must be [longitude, latitude]',
        },
      },
    },
    // Array of route IDs that pass through this stop
    routeIds: [
      {
        type: String,
        trim: true,
      },
    ],
    // Stop classification
    stopType: {
      type: String,
      enum: {
        values: ['terminal', 'loading_bay', 'landmark'],
        message: '{VALUE} is not a valid stop type',
      },
      default: 'loading_bay',
    },
    // Additional metadata
    description: {
      type: String,
      trim: true,
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

// Create 2dsphere index on location for spatial queries
stopSchema.index({ location: '2dsphere' });

// Compound index for route-based queries
stopSchema.index({ routeIds: 1, isActive: 1 });

/**
 * Static method to find stops within a radius
 * @param {Array} coordinates - [longitude, latitude]
 * @param {Number} maxDistance - Maximum distance in meters
 */
stopSchema.statics.findNearby = function (coordinates, maxDistance = 500) {
  return this.find({
    location: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: coordinates,
        },
        $maxDistance: maxDistance,
      },
    },
    isActive: true,
  });
};

/**
 * Static method to find stops by route ID
 * @param {String} routeId - The route ID to search for
 */
stopSchema.statics.findByRouteId = function (routeId) {
  return this.find({
    routeIds: routeId,
    isActive: true,
  });
};

const Stop = mongoose.model('Stop', stopSchema);

module.exports = Stop;
