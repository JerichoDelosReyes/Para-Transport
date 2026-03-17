# Phase 2: GraphService & Transit-Road Integration

> **Document Version**: 1.0.0  
> **Last Updated**: January 14, 2026  
> **Status**: Implementation  
> **Author**: Para Development Team

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Data Models](#data-models)
4. [Services](#services)
5. [Implementation Steps](#implementation-steps)
6. [API Reference](#api-reference)
7. [Configuration](#configuration)
8. [Testing](#testing)

---

## Overview

### Purpose

Phase 2 implements the **GraphService** - a unified service that combines the OSM road network with transit route metadata to enable multi-route A* pathfinding.

### Key Principle

> **Transit routes are metadata overlays on the road network, not a separate graph.**

This means:
- A* search runs on the **road network** (638k nodes)
- Transit routes define which road segments have transit service
- Users can walk on any road, but only ride transit on marked segments

### Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Transit Graph | Metadata only | Smaller memory, road-accurate paths |
| Road Network Storage | Hybrid (MongoDB + JSON) | Balance speed vs storage |
| Transfer Points | Overlaps + Terminals | Maximum connectivity |
| Transfer Penalty | Configurable | Tune for real-world behavior |
| Walking Limit | 500m (start/end), 200m (transfers) | Realistic constraints |
| Route Direction | Respected | Matches real transit behavior |

---

## Architecture

### System Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         PARA ROUTING SYSTEM                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  SOURCE DATA                                                             │
│  ┌─────────────────┐         ┌─────────────────────────────────────┐    │
│  │ routes.json     │         │ roadNetwork.json                    │    │
│  │ (Original)      │         │ (638k nodes, 1.3M edges)            │    │
│  └────────┬────────┘         └──────────────────┬──────────────────┘    │
│           │                                     │                        │
│           ▼                                     ▼                        │
│  ┌─────────────────┐         ┌─────────────────────────────────────┐    │
│  │ TransitMapper   │         │ Road Network Splitter               │    │
│  │ - Extract meta  │         │ - Nodes → MongoDB                   │    │
│  │ - Map to roads  │         │ - Adjacency → JSON file             │    │
│  └────────┬────────┘         └──────────────────┬──────────────────┘    │
│           │                                     │                        │
│           ▼                                     ▼                        │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                         MONGODB                                  │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │    │
│  │  │TransitRoute │  │ RoadNode    │  │ TransitConfig           │  │    │
│  │  │ 15 docs     │  │ ~2.5k docs  │  │ 1 doc                   │  │    │
│  │  │ (metadata)  │  │ (w/transit) │  │ (settings)              │  │    │
│  │  └─────────────┘  └─────────────┘  └─────────────────────────┘  │    │
│  └──────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                     roadAdjacency.json                           │    │
│  │                     (Edges only, ~150MB)                         │    │
│  └──────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│                                 ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                      GRAPH SERVICE                               │    │
│  │                                                                  │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │    │
│  │  │ Road Graph   │  │ Transit Meta │  │ Config               │   │    │
│  │  │ 638k nodes   │  │ 15 routes    │  │ Penalties/Limits     │   │    │
│  │  └──────────────┘  └──────────────┘  └──────────────────────┘   │    │
│  │                                                                  │    │
│  │  Methods:                                                        │    │
│  │  - initialize()                                                  │    │
│  │  - findNearestRoadNode(lat, lon)                                │    │
│  │  - getTransitRoutesAtNode(nodeId)                               │    │
│  │  - getRouteInfo(routeId)                                        │    │
│  └──────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Initialization (one-time script)**
   - Read `routes.json` → Extract metadata → Map to road nodes
   - Split `roadNetwork.json` → Nodes to MongoDB, Adjacency to file
   - Save `TransitRoute`, `RoadNode`, `TransitConfig` to MongoDB

2. **Server Startup**
   - Load `roadAdjacency.json` into memory
   - Load `RoadNode` collection from MongoDB
   - Load `TransitRoute` collection from MongoDB
   - Load `TransitConfig` from MongoDB

3. **Query Flow**
   - User provides start/end coordinates
   - Find nearest road nodes
   - A* search on road network with transit awareness
   - Return path with walking + transit segments

---

## Data Models

### TransitRoute Schema

```javascript
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
    enum: ['jeep', 'bus', 'uv', 'tricycle'],
    default: 'jeep'
  },
  signboard: String,
  direction: {
    type: String,
    enum: ['inbound', 'outbound'],
    required: true
  },
  
  // Terminals
  startTerminal: {
    roadNodeId: { type: String, required: true },
    lat: { type: Number, required: true },
    lon: { type: Number, required: true }
  },
  endTerminal: {
    roadNodeId: { type: String, required: true },
    lat: { type: Number, required: true },
    lon: { type: Number, required: true }
  },
  
  // Route path as road node sequence
  roadNodeSequence: [String],
  
  // Statistics
  totalDistanceKm: Number,
  nodeCount: Number,
  
  // Status
  isActive: { type: Boolean, default: true }
}, { timestamps: true });
```

### RoadNode Schema

```javascript
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
  transitRoutes: [String],
  
  // Is this a terminal?
  isTerminal: { type: Boolean, default: false },
  terminalFor: [String]  // Route IDs if terminal
}, { timestamps: true });

// Geospatial index for nearest node queries
RoadNodeSchema.index({ lat: 1, lon: 1 });
```

### TransitConfig Schema

```javascript
const TransitConfigSchema = new Schema({
  key: {
    type: String,
    default: 'routing',
    unique: true
  },
  
  // Transfer settings
  transferPenaltyMinutes: {
    type: Number,
    default: 10
  },
  
  // Walking limits (in kilometers)
  maxWalkingDistanceKm: {
    type: Number,
    default: 0.5  // 500m
  },
  maxTransferWalkingKm: {
    type: Number,
    default: 0.2  // 200m
  },
  
  // Walking speed for time calculations
  walkingSpeedKmh: {
    type: Number,
    default: 4.5
  },
  
  // Mapping tolerance
  routeMappingToleranceKm: {
    type: Number,
    default: 0.1  // 100m
  }
}, { timestamps: true });
```

---

## Services

### TransitMapper

Maps transit route coordinates to road network nodes.

```javascript
/**
 * Map a single transit route to road nodes
 * @param {Object} routeFeature - GeoJSON feature from routes.json
 * @param {Object} roadNetwork - Road network data
 * @param {Number} toleranceKm - Max distance for mapping (default 0.1km)
 * @returns {Object} Transit metadata with road node sequence
 */
function mapRouteToRoadNetwork(routeFeature, roadNetwork, toleranceKm = 0.1)

/**
 * Map all transit routes to road network
 * @param {Object} routesGeoJSON - Full routes.json content
 * @param {Object} roadNetwork - Road network data
 * @returns {Array} Array of transit metadata objects
 */
function mapAllRoutes(routesGeoJSON, roadNetwork)

/**
 * Mark road nodes with transit coverage
 * @param {Array} transitRoutes - Mapped transit routes
 * @param {Object} roadNodes - Road node map
 * @returns {Object} Road nodes with transitRoutes arrays populated
 */
function markTransitCoverage(transitRoutes, roadNodes)
```

### GraphService

Main service for graph operations.

```javascript
const GraphService = {
  // State
  _roadNodes: null,        // Map<nodeId, {lat, lon, transitRoutes}>
  _roadAdjacency: null,    // Map<nodeId, edges[]>
  _transitRoutes: null,    // Map<routeId, TransitRoute>
  _config: null,           // TransitConfig object
  _initialized: false,
  _initializing: false,

  /**
   * Initialize the graph service
   * Loads all data from MongoDB and JSON files
   */
  async initialize(),

  /**
   * Find nearest road node to a coordinate
   * @param {Number} lat - Latitude
   * @param {Number} lon - Longitude
   * @param {Number} maxDistanceKm - Maximum search radius (default from config)
   * @returns {Object|null} { nodeId, distanceKm, node } or null if none found
   */
  async findNearestRoadNode(lat, lon, maxDistanceKm),

  /**
   * Get transit routes passing through a node
   * @param {String} nodeId - Road node ID
   * @returns {Array} Array of route IDs
   */
  getTransitRoutesAtNode(nodeId),

  /**
   * Get full transit route information
   * @param {String} routeId - Route ID
   * @returns {Object|null} TransitRoute object
   */
  getRouteInfo(routeId),

  /**
   * Get routing configuration
   * @returns {Object} TransitConfig
   */
  getConfig(),

  /**
   * Get service statistics
   * @returns {Object} { roadNodes, transitRoutes, initialized }
   */
  getStats(),

  /**
   * Check if service is ready
   * @returns {Boolean}
   */
  isInitialized()
};
```

---

## Implementation Steps

### Step 2.1: Create MongoDB Schemas

Create Mongoose schemas for `TransitRoute`, `RoadNode`, and `TransitConfig`.

### Step 2.2: Create TransitMapper Service

Implement route-to-road mapping logic with:
- Haversine distance for nearest node search
- 100m tolerance for mapping
- Edge marking for transit coverage

### Step 2.3: Create Initialization Script

`initTransitData.js`:
1. Load `routes.json` and `roadNetwork.json`
2. Map all routes to road nodes
3. Save `TransitRoute` documents to MongoDB
4. Save `RoadNode` documents (transit-covered only) to MongoDB
5. Save default `TransitConfig` to MongoDB
6. Generate `transitMetadata.json` as cache
7. Split road network: nodes to DB, adjacency to `roadAdjacency.json`

### Step 2.4: Create GraphService

Implement the main service with:
- Async initialization
- Auto-initialize on first query
- Nearest node search with configurable radius
- Transit route lookups

### Step 2.5: Integrate with Server

Modify `server.js` to:
- Initialize GraphService after MongoDB connection
- Log readiness status

### Step 2.6: Clean Up Old Files

Delete deprecated files:
- `backend/models/Route.js`
- `backend/models/Stop.js`
- `backend/data/routes.json` (after migration)

---

## Configuration

### Default Values

| Parameter | Default | Description |
|-----------|---------|-------------|
| `transferPenaltyMinutes` | 10 | Wait time penalty at transfers |
| `maxWalkingDistanceKm` | 0.5 | Max walk to start/end transit |
| `maxTransferWalkingKm` | 0.2 | Max walk between routes |
| `walkingSpeedKmh` | 4.5 | Average walking speed |
| `routeMappingToleranceKm` | 0.1 | Max distance for route mapping |

### Updating Configuration

```javascript
// Via MongoDB shell or admin API
db.transitconfigs.updateOne(
  { key: 'routing' },
  { $set: { transferPenaltyMinutes: 15 } }
);
```

---

## Testing

### Test Script

Run: `node backend/tests/unit/graphService.test.js`

### Test Cases

| # | Test | Expected |
|---|------|----------|
| 1 | Initialization | All data loads, no errors |
| 2 | findNearestRoadNode - Imus | Node within 50m |
| 3 | findNearestRoadNode - Far | null (beyond max radius) |
| 4 | getTransitRoutesAtNode - Transit node | Array of route IDs |
| 5 | getTransitRoutesAtNode - Non-transit node | Empty array |
| 6 | getRouteInfo - Valid route | Full route object |
| 7 | getRouteInfo - Invalid route | null |
| 8 | Auto-initialization | Works on first query |

### Console Output

```
[GraphService] Initializing...
[GraphService] Loading road adjacency from file...
[GraphService] Loading road nodes from MongoDB...
[GraphService] Loading transit routes from MongoDB...
[GraphService] Loading config from MongoDB...
[GraphService] ✅ Initialized: 638127 road nodes, 15 transit routes
```

---

## File Structure

```
backend/
├── data/
│   ├── roadNetwork.json       # Original (keep as backup)
│   ├── roadAdjacency.json     # Edges only (generated)
│   └── transitMetadata.json   # Cache (generated)
├── models/
│   ├── TransitRoute.js        # NEW
│   ├── TransitConfig.js       # NEW
│   ├── RoadNode.js            # NEW
│   └── index.js               # Updated exports
├── services/
│   ├── GraphService.js        # NEW
│   ├── TransitMapper.js       # NEW
│   ├── graphBuilder.js        # Existing (refactored)
│   └── spatialFilter.js       # Existing (unchanged)
├── scripts/
│   ├── extractRoadGraph.js    # Existing
│   └── initTransitData.js     # NEW
└── tests/
    └── unit/
        ├── graphBuilder.test.js   # Existing
        ├── roadNetwork.test.js    # Existing
        └── graphService.test.js   # NEW
```

---

## References

- [Phase 0: Road Network Extraction](./transit-graph-astar.md#phase-0-road-network-extraction)
- [Phase 1: Data Structuring](./transit-graph-astar.md#phase-1-data-structuring)
- [A* Algorithm - Wikipedia](https://en.wikipedia.org/wiki/A*_search_algorithm)
- [Haversine Formula](https://en.wikipedia.org/wiki/Haversine_formula)
