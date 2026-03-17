/**
 * Transit Configuration Model
 * 
 * Stores configurable routing parameters for A* search.
 * Part of Phase 2: GraphService implementation.
 * 
 * @module models/TransitConfig
 * @version 1.0.0
 */

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const TransitConfigSchema = new Schema({
  key: {
    type: String,
    default: 'routing',
    unique: true
  },
  
  // Transfer settings
  transferPenaltyMinutes: {
    type: Number,
    default: 10,
    min: 0,
    max: 60
  },
  
  // Walking limits (in kilometers)
  maxWalkingDistanceKm: {
    type: Number,
    default: 0.5,  // 500m max walk to start/end transit
    min: 0.1,
    max: 2.0
  },
  maxTransferWalkingKm: {
    type: Number,
    default: 0.2,  // 200m max walk between routes for transfer
    min: 0.05,
    max: 0.5
  },
  
  // Walking speed for time calculations (km/h)
  walkingSpeedKmh: {
    type: Number,
    default: 4.5,
    min: 3.0,
    max: 6.0
  },
  
  // Route mapping tolerance (km)
  routeMappingToleranceKm: {
    type: Number,
    default: 0.1,  // 100m tolerance when mapping route coords to road nodes
    min: 0.05,
    max: 0.3
  },
  
  // Search radius for nearest node queries (km)
  maxSearchRadiusKm: {
    type: Number,
    default: 2.0,
    min: 0.5,
    max: 5.0
  }
}, {
  timestamps: true
});

/**
 * Get or create the default configuration
 * @returns {Promise<TransitConfig>}
 */
TransitConfigSchema.statics.getConfig = async function() {
  let config = await this.findOne({ key: 'routing' });
  
  if (!config) {
    console.log('[TransitConfig] Creating default configuration...');
    config = await this.create({ key: 'routing' });
  }
  
  return config;
};

const TransitConfig = mongoose.model('TransitConfig', TransitConfigSchema);

module.exports = TransitConfig;

console.log('[TransitConfig] Model loaded');
