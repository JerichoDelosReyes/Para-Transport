/**
 * Transit Route Model
 * 
 * Stores transit route metadata mapped to road network nodes.
 * Part of Phase 2: GraphService implementation.
 * 
 * @module models/TransitRoute
 * @version 1.0.0
 */

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const TransitRouteSchema = new Schema({
  routeId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  routeName: {
    type: String,
    required: true
  },
  vehicleType: {
    type: String,
    enum: ['jeep', 'jeepney', 'bus', 'uv', 'tricycle', 'cab'],
    default: 'jeep'
  },
  signboard: {
    type: String,
    default: ''
  },
  direction: {
    type: String,
    enum: ['inbound', 'outbound'],
    required: true
  },
  
  // Start terminal (first stop)
  startTerminal: {
    roadNodeId: { type: String, required: true },
    lat: { type: Number, required: true },
    lon: { type: Number, required: true }
  },
  
  // End terminal (last stop)
  endTerminal: {
    roadNodeId: { type: String, required: true },
    lat: { type: Number, required: true },
    lon: { type: Number, required: true }
  },
  
  // Full route as sequence of road node IDs
  roadNodeSequence: {
    type: [String],
    required: true
  },
  
  // Statistics
  totalDistanceKm: {
    type: Number,
    default: 0
  },
  nodeCount: {
    type: Number,
    default: 0
  },
  
  // Status
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes for common queries
TransitRouteSchema.index({ vehicleType: 1 });
TransitRouteSchema.index({ isActive: 1 });
TransitRouteSchema.index({ 'startTerminal.roadNodeId': 1 });
TransitRouteSchema.index({ 'endTerminal.roadNodeId': 1 });

const TransitRoute = mongoose.model('TransitRoute', TransitRouteSchema);

module.exports = TransitRoute;

console.log('[TransitRoute] Model loaded');
