/**
 * Road Node Model
 * 
 * Stores road network nodes that have transit coverage.
 * Only nodes with transit routes passing through are stored in MongoDB.
 * Full adjacency data remains in JSON file for performance.
 * 
 * Part of Phase 2: GraphService implementation.
 * 
 * @module models/RoadNode
 * @version 1.0.0
 */

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const RoadNodeSchema = new Schema({
  nodeId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  lat: {
    type: Number,
    required: true
  },
  lon: {
    type: Number,
    required: true
  },
  
  // Transit routes passing through this node
  transitRoutes: {
    type: [String],
    default: []
  },
  
  // Terminal information
  isTerminal: {
    type: Boolean,
    default: false,
    index: true
  },
  terminalFor: {
    type: [String],  // Route IDs where this is a terminal
    default: []
  },
  terminalType: {
    type: String,
    enum: ['start', 'end', 'both', null],
    default: null
  }
}, {
  timestamps: true
});

// Compound index for geospatial-like queries
RoadNodeSchema.index({ lat: 1, lon: 1 });

// Index for transit coverage queries
RoadNodeSchema.index({ transitRoutes: 1 });

const RoadNode = mongoose.model('RoadNode', RoadNodeSchema);

module.exports = RoadNode;

console.log('[RoadNode] Model loaded');
