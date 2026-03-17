# Phase 3: A* Pathfinder Implementation

> **Version**: 1.0.0  
> **Last Updated**: January 14, 2026  
> **Status**: Implementation

## Overview

This phase implements the A* pathfinding algorithm with transit awareness, fare calculation, and real-time segment tracking via the Stopwatch service.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         API Request                                  │
│              POST /api/routes/search                                │
│         { origin: {lat, lon}, destination: {lat, lon} }             │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      AStarPathfinder                                │
├─────────────────────────────────────────────────────────────────────┤
│  • findPath(origin, destination, options)                           │
│  • Optimization modes: TIME | FARE | DISTANCE                       │
│  • Returns top 3 alternative routes                                 │
├─────────────────────────────────────────────────────────────────────┤
│                         USES                                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────────┐ │
│  │GraphService │  │FareCalculator│  │StopwatchService            │ │
│  │  • nodes    │  │  • by type  │  │  • getSegmentTime()        │ │
│  │  • edges    │  │  • transfers│  │  • recordSegment()         │ │
│  │  • routes   │  │             │  │  • uses SegmentTime model  │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        Response                                      │
│  {                                                                  │
│    routes: [                                                        │
│      { totalDistance, totalTime, totalFare, transfers, segments }  │
│    ]                                                                │
│  }                                                                  │
└─────────────────────────────────────────────────────────────────────┘
```

## Components

### 1. AStarPathfinder (`services/AStarPathfinder.js`)

Main pathfinding service using A* algorithm.

#### Methods

```javascript
class AStarPathfinder {
  constructor(graphService, fareCalculator, stopwatchService)
  
  // Main entry point
  async findPath(originLat, originLon, destLat, destLon, options = {})
  
  // Options:
  // - mode: 'TIME' | 'FARE' | 'DISTANCE' (default: 'TIME')
  // - maxResults: number (default: 3)
  // - maxWalkingKm: number (default: from config)
  // - maxTransferWalkingKm: number (default: from config)
}
```

#### Response Format

```javascript
{
  success: true,
  results: [
    {
      rank: 1,
      optimizedFor: 'TIME',
      summary: {
        totalDistanceKm: 5.2,
        totalTimeMinutes: 25,
        totalFare: 26.00,  // ₱26
        transferCount: 1,
        walkingDistanceKm: 0.3
      },
      segments: [
        {
          type: 'WALK',
          from: { lat, lon, nodeId },
          to: { lat, lon, nodeId },
          distanceKm: 0.15,
          timeMinutes: 2
        },
        {
          type: 'TRANSIT',
          routeId: 'BDO-SMMOLINO-OUT',
          routeName: 'BDO TO SM MOLINO',
          vehicleType: 'jeep',
          signboard: 'SM MOLINO',
          from: { lat, lon, nodeId },
          to: { lat, lon, nodeId },
          distanceKm: 3.5,
          timeMinutes: 14,
          fare: 13.00
        },
        {
          type: 'TRANSFER',
          from: { lat, lon, nodeId },
          to: { lat, lon, nodeId },
          distanceKm: 0.1,
          timeMinutes: 12,  // includes transfer penalty
          walkingMinutes: 2,
          waitingMinutes: 10  // transfer penalty
        },
        // ... more segments
      ]
    },
    // ... up to 3 results
  ]
}
```

### 2. FareCalculator (`services/FareCalculator.js`)

Calculates fare based on vehicle type and distance.

#### Fare Structure

| Vehicle Type | Base Fare (₱) | First KM | Additional (₱/km) |
|--------------|---------------|----------|-------------------|
| `jeep`       | 13.00         | 4        | 1.80              |
| `bus`        | 15.00         | 5        | 2.65              |
| `bus_aircon` | 18.00         | 5        | 3.00              |
| `uv`         | 30.00         | 4        | 2.50              |

#### Methods

```javascript
class FareCalculator {
  // Calculate fare for a single segment
  calculateFare(vehicleType, distanceKm)
  
  // Calculate total fare for a journey (handles transfers)
  calculateTotalFare(segments)
  
  // Get fare breakdown
  getFareBreakdown(vehicleType, distanceKm)
}
```

### 3. StopwatchService (`services/StopwatchService.js`)

Tracks and stores real travel times for segments.

#### Methods

```javascript
class StopwatchService {
  // Record a completed segment (called by mobile app)
  async recordSegment(routeId, fromNodeId, toNodeId, timeSeconds, vehicleType)
  
  // Get average time for a segment (used by A*)
  async getSegmentTime(routeId, fromNodeId, toNodeId)
  
  // Get estimated time using default speed (fallback)
  getEstimatedTime(distanceKm, vehicleType)
  
  // Bulk record from GPS trace (automatic tracking)
  async recordGPSTrace(routeId, trace)
  // trace: [{nodeId, timestamp}, ...]
}
```

#### Default Speed Estimates (km/h)

| Vehicle Type | City Speed | Highway Speed |
|--------------|------------|---------------|
| `jeep`       | 15         | 25            |
| `bus`        | 20         | 40            |
| `uv`         | 25         | 50            |
| `walking`    | 4.5        | 4.5           |

### 4. SegmentTime Model (`models/SegmentTime.js`)

MongoDB schema for storing tracked segment times.

```javascript
{
  routeId: String,        // e.g., 'BDO-SMMOLINO-OUT'
  fromNodeId: String,     // Road node ID
  toNodeId: String,       // Road node ID
  vehicleType: String,    // 'jeep', 'bus', etc.
  
  // Aggregated statistics
  avgTimeSeconds: Number,
  minTimeSeconds: Number,
  maxTimeSeconds: Number,
  sampleCount: Number,
  
  // Time of day buckets (optional, for rush hour awareness)
  timeOfDay: {
    morning: { avg, count },    // 6am - 9am
    midday: { avg, count },     // 9am - 4pm
    evening: { avg, count },    // 4pm - 8pm
    night: { avg, count }       // 8pm - 6am
  },
  
  lastUpdated: Date
}
```

## A* Algorithm Details

### Cost Function

The cost function varies by optimization mode:

```javascript
// DISTANCE mode
cost = edgeDistanceKm

// TIME mode
cost = segmentTimeMinutes + (isTransfer ? transferPenaltyMinutes : 0)

// FARE mode
cost = segmentFare + (isTransfer ? baseFare : 0)
```

### Heuristic Function

```javascript
// Straight-line distance to destination (admissible heuristic)
h(node) = haversineDistance(node, destination)

// Adjusted for mode:
// - DISTANCE: h(node)
// - TIME: h(node) / maxSpeed * 60  // minutes
// - FARE: h(node) * avgFarePerKm
```

### State Representation

Each node in the A* search has:

```javascript
{
  nodeId: String,
  currentRouteId: String | null,  // null if walking
  g: Number,                       // cost from start
  h: Number,                       // heuristic to goal
  f: Number,                       // g + h
  parent: NodeState,              // for path reconstruction
  segmentType: 'WALK' | 'TRANSIT' | 'TRANSFER'
}
```

### Expansion Rules

1. **If walking**: Can board any transit route at this node
2. **If on transit**: 
   - Continue on same route (follow roadNodeSequence)
   - Exit and walk (within maxTransferWalkingKm)
   - Transfer to another route (if available at this node)
3. **Transfer constraint**: Apply transferPenaltyMinutes

## File Structure

```
backend/
├── models/
│   ├── index.js                 # Updated with SegmentTime
│   └── SegmentTime.js           # NEW
├── services/
│   ├── AStarPathfinder.js       # NEW
│   ├── FareCalculator.js        # NEW
│   ├── GraphService.js          # Existing
│   ├── StopwatchService.js      # NEW
│   └── TransitMapper.js         # Existing
├── tests/unit/
│   ├── astar.test.js            # NEW
│   ├── fareCalculator.test.js   # NEW
│   ├── graphService.test.js     # Existing
│   └── stopwatch.test.js        # NEW
└── docs/backend/
    └── phase3-astar-pathfinder.md  # This file
```

## Configuration

Uses `TransitConfig` model (existing):

```javascript
{
  transferPenaltyMinutes: 10,     // Wait time at transfer
  maxWalkingDistanceKm: 0.5,      // Max walk to start/end transit
  maxTransferWalkingKm: 0.2,      // Max walk between routes
  walkingSpeedKmh: 4.5
}
```

## Testing Strategy

### Unit Tests

1. **FareCalculator**
   - Fare within base distance
   - Fare exceeding base distance
   - Different vehicle types
   - Total fare with transfers

2. **StopwatchService**
   - Record segment time
   - Get average time (with data)
   - Get estimated time (fallback)
   - Time of day bucketing

3. **AStarPathfinder**
   - Simple direct route (no transfer)
   - Route requiring transfer
   - Three optimization modes
   - Walking at start/end
   - No path found scenario

### Integration Tests

- End-to-end path search
- Real data from roadAdjacency.json
- Performance with large graph

## Usage Example

```javascript
const { getGraphService } = require('./services/GraphService');
const FareCalculator = require('./services/FareCalculator');
const StopwatchService = require('./services/StopwatchService');
const AStarPathfinder = require('./services/AStarPathfinder');

// Initialize services
const graphService = getGraphService();
await graphService.initialize();

const fareCalculator = new FareCalculator();
const stopwatchService = new StopwatchService();
const pathfinder = new AStarPathfinder(graphService, fareCalculator, stopwatchService);

// Find paths
const results = await pathfinder.findPath(
  14.4207, 120.9407,  // Origin: BDO
  14.4152, 120.9847,  // Destination: SM Molino
  { mode: 'TIME', maxResults: 3 }
);

console.log(results);
```

## Next Steps (Phase 4)

1. Create API endpoint: `POST /api/routes/search`
2. Integrate with frontend map display
3. Add GPS tracking integration for automatic stopwatch
4. Implement path caching for frequently searched routes

---

**Document Version History**

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | Jan 14, 2026 | Initial implementation |
