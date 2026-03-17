/**
 * Models Index
 * 
 * Central export for all Mongoose models.
 * Phase 2: GraphService models added
 * Phase 3: A* Pathfinder models added
 */

// Legacy models (deprecated - will be removed)
// const Route = require('./Route');
// const Stop = require('./Stop');

// Phase 2: Transit graph models
const TransitRoute = require('./TransitRoute');
const TransitConfig = require('./TransitConfig');
const RoadNode = require('./RoadNode');

// Phase 3: A* Pathfinder models
const SegmentTime = require('./SegmentTime');

module.exports = {
  // Legacy (commented out for reference, delete after Phase 2 complete)
  // Route,
  // Stop,
  
  // Phase 2 models
  TransitRoute,
  TransitConfig,
  RoadNode,
  
  // Phase 3 models
  SegmentTime
};
