# Transit Graph A* Search Implementation

> **Document Version**: 1.1.0  
> **Last Updated**: January 14, 2026  
> **Status**: Phase 0 & 1 - Complete  
> **Author**: Para Development Team

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Phase 0: Road Network Extraction](#phase-0-road-network-extraction)
4. [Phase 1: Data Structuring](#phase-1-data-structuring)
4. [Phase 2: Graph Service](#phase-2-graph-service)
5. [Phase 3: A* Algorithm](#phase-3-a-algorithm)
6. [Phase 4: API Integration](#phase-4-api-integration)
7. [Data Schemas](#data-schemas)
8. [Testing](#testing)

---

## Overview

### Purpose

This document describes the implementation of a **Layer 2 Transit Graph** with **A* Search** for the Para Mobile application. The system transitions from array-based route filtering to graph-based pathfinding, enabling:

- Multi-route journey planning
- Optimal path calculation with transfers
- Real-time route suggestions based on user location

### Problem Statement

**Current State**: The existing `spatialFilter.js` uses buffer-based matching to find routes where both origin and destination fall within a route's geometry buffer. This approach:
- Only finds single-route journeys
- Cannot suggest route transfers
- Has O(n) complexity for each search

**New State**: A Transit Graph with A* search that:
- Models the transit network as a directed graph
- Supports multi-route journeys with transfers
- Provides optimal paths based on distance
- Has efficient O(E + V log V) pathfinding complexity

### Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Node Definition | Every coordinate point | High granularity for accurate distance calculations |
| Edge Direction | Unidirectional | Follows actual route direction (signboard-based) |
| Transfer Support | Yes | Enables multi-route journey planning |
| Storage | In-memory | Fast lookups, built on server startup |
| Language | JavaScript | Consistent with existing backend codebase |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Para Backend                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐  │
│  │ routes.json │───▶│ GraphBuilder│───▶│ In-Memory Graph     │  │
│  │ (GeoJSON)   │    │             │    │ Map<string, Node>   │  │
│  └─────────────┘    └─────────────┘    └─────────────────────┘  │
│                                                   │              │
│                                                   ▼              │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                     GraphService                             ││
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   ││
│  │  │ findNearest  │  │ aStarSearch  │  │ getTransferNodes │   ││
│  │  │    Node()    │  │     ()       │  │       ()         │   ││
│  │  └──────────────┘  └──────────────┘  └──────────────────┘   ││
│  └─────────────────────────────────────────────────────────────┘│
│                                │                                 │
│                                ▼                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    Express API                               ││
│  │            GET /api/commutes/path                            ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Data Structuring

### Objective

Convert the flat `routes.json` GeoJSON into a graph-friendly adjacency structure.

### Source Data Format

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {
        "routeId": "BDO-SMMOLINO-OUT",
        "routeName": "BDO TO SM MOLINO",
        "vehicleType": "jeep",
        "signboard": "SM MOLINO",
        "direction": "outbound"
      },
      "geometry": {
        "type": "LineString",
        "coordinates": [
          [120.94067, 14.42070],
          [120.94053, 14.42066],
          ...
        ]
      }
    }
  ]
}
```

### Graph Node Schema

```javascript
/**
 * @typedef {Object} GraphEdge
 * @property {string} toNodeId - Target node identifier
 * @property {string} routeId - Route this edge belongs to
 * @property {number} distanceKm - Distance in kilometers
 * @property {string} vehicleType - Vehicle type (jeep, bus, etc.)
 */

/**
 * @typedef {Object} GraphNode
 * @property {string} id - Unique node identifier
 * @property {number} lat - Latitude
 * @property {number} lon - Longitude
 * @property {GraphEdge[]} edges - Outgoing edges
 * @property {string[]} routeIds - Routes passing through this node
 */
```

### Node ID Convention

```
{routeId}:{coordinateIndex}
```

Example: `BDO-SMMOLINO-OUT:0`, `BDO-SMMOLINO-OUT:1`, etc.

### Edge Creation Rules

1. **Sequential Edges**: Connect coordinate[i] to coordinate[i+1] within a route
2. **Transfer Edges**: Connect nodes from different routes within `TRANSFER_RADIUS` (50m)

### Files Created

| File | Purpose |
|------|---------|
| `backend/services/graphBuilder.js` | Graph construction utilities |
| `backend/types/graph.types.js` | JSDoc type definitions |

---

## Phase 2: Graph Service

### Objective

Build and maintain the transit graph in memory with query methods.

### GraphService API

```javascript
class GraphService {
  // Initialize and build graph from routes data
  initialize(routesData)
  
  // Find the nearest graph node to a GPS coordinate
  findNearestNode(lat, lon) → { nodeId, distance }
  
  // Get a node by ID
  getNode(nodeId) → GraphNode | null
  
  // Get all nodes for a route
  getRouteNodes(routeId) → GraphNode[]
  
  // Statistics
  getStats() → { nodeCount, edgeCount, routeCount }
}
```

### Nearest Node Lookup

Uses Haversine distance to find the closest node:

```javascript
findNearestNode(userLat, userLon) {
  let nearest = null;
  let minDistance = Infinity;
  
  for (const [nodeId, node] of this.graph) {
    const dist = haversine(userLat, userLon, node.lat, node.lon);
    if (dist < minDistance) {
      minDistance = dist;
      nearest = nodeId;
    }
  }
  
  return { nodeId: nearest, distance: minDistance };
}
```

---

## Phase 3: A* Algorithm

### Objective

Implement A* pathfinding on the transit graph.

### Algorithm Overview

A* combines:
- **G-Score**: Actual distance traveled from start
- **H-Score**: Heuristic (straight-line distance to goal)
- **F-Score**: G + H (used for priority ordering)

### Priority Queue

A min-heap implementation for efficient node selection:

```javascript
class PriorityQueue {
  enqueue(item, priority)
  dequeue() → item
  isEmpty() → boolean
}
```

### A* Implementation

```javascript
aStarSearch(startNodeId, goalNodeId) {
  // Returns: RouteSegment[] | null
  // RouteSegment: { fromNodeId, toNodeId, routeId, distanceKm }
}
```

### Transfer Handling

When A* traverses a transfer edge (different routeId), it records a route change in the output.

---

## Phase 4: API Integration

### Endpoint

```
GET /api/commutes/path
```

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| startLat | number | Yes | Origin latitude |
| startLon | number | Yes | Origin longitude |
| endLat | number | Yes | Destination latitude |
| endLon | number | Yes | Destination longitude |

### Response Schema

```json
{
  "success": true,
  "data": {
    "path": [
      {
        "fromNodeId": "BDO-SMMOLINO-OUT:0",
        "toNodeId": "BDO-SMMOLINO-OUT:45",
        "routeId": "BDO-SMMOLINO-OUT",
        "routeName": "BDO TO SM MOLINO",
        "vehicleType": "jeep",
        "distanceKm": 2.3
      }
    ],
    "totalDistanceKm": 5.7,
    "transfers": 1,
    "polyline": [
      { "latitude": 14.4207, "longitude": 120.9406 },
      ...
    ]
  }
}
```

---

## Data Schemas

### GraphNode (Full Schema)

```javascript
{
  id: "BDO-SMMOLINO-OUT:0",
  lat: 14.420708364781035,
  lon: 120.94067895979015,
  edges: [
    {
      toNodeId: "BDO-SMMOLINO-OUT:1",
      routeId: "BDO-SMMOLINO-OUT",
      distanceKm: 0.015,
      vehicleType: "jeep",
      isTransfer: false
    }
  ],
  routeIds: ["BDO-SMMOLINO-OUT"]
}
```

### RouteSegment (A* Output)

```javascript
{
  fromNodeId: "BDO-SMMOLINO-OUT:0",
  toNodeId: "BDO-SMMOLINO-OUT:45",
  routeId: "BDO-SMMOLINO-OUT",
  routeName: "BDO TO SM MOLINO",
  vehicleType: "jeep",
  distanceKm: 2.3,
  coordinates: [...] // For polyline rendering
}
```

---

## Testing

### Unit Tests

```bash
# Run graph builder tests
npm test -- --grep "GraphBuilder"

# Run A* algorithm tests
npm test -- --grep "AStar"
```

### Verification Console Logs

Each phase includes verification logs:

```javascript
// Phase 1: Graph Building
console.log('[GraphBuilder] Built graph with X nodes and Y edges');
console.log('[GraphBuilder] Sample node:', graph.get('BDO-SMMOLINO-OUT:0'));

// Phase 2: Nearest Node
console.log('[GraphService] Nearest node to (14.42, 120.94):', result);

// Phase 3: A* Search
console.log('[AStar] Path found with X segments, Y transfers');
```

### Test Coordinates

| Location | Latitude | Longitude |
|----------|----------|-----------|
| BDO Imus | 14.4207 | 120.9407 |
| SM Molino | 14.3841 | 120.9777 |
| Manggahan | 14.4150 | 120.9350 |

---

## Implementation Status

| Phase | Description | Status |
|-------|-------------|--------|
| 0 | Road Network Extraction | ✅ Complete |
| 1 | Data Structuring | ✅ Complete |
| 2 | Graph Service | ⏳ Pending |
| 3 | A* Algorithm | ⏳ Pending |
| 4 | API Integration | ⏳ Pending |

---

## Phase 0: Road Network Extraction

### Objective

Extract road network data from OpenStreetMap PBF file for Layer 1 (GPS snapping and accurate road distances).

### Source Data

- **Input**: `backend/data/philippines-260113.osm.pbf` (561 MB)
- **Output**: `backend/data/roadNetwork.json` (212 MB)

### Bounding Box (Cavite Area)

| Parameter | Value |
|-----------|-------|
| Min Latitude | 14.0 |
| Max Latitude | 14.6 |
| Min Longitude | 120.7 |
| Max Longitude | 121.1 |

### Highway Types Included

```
motorway, motorway_link, trunk, trunk_link,
primary, primary_link, secondary, secondary_link,
tertiary, tertiary_link, residential, service,
unclassified, living_street, pedestrian
```

### Output Structure (Option A: Flat Adjacency List)

```javascript
{
  "metadata": {
    "boundingBox": { "minLat": 14.0, "maxLat": 14.6, "minLon": 120.7, "maxLon": 121.1 },
    "extractedAt": "2026-01-14T14:09:24.205Z",
    "source": "philippines-260113.osm.pbf",
    "nodeCount": 638127,
    "edgeCount": 1299444,
    "wayCount": 1257626
  },
  "nodes": {
    "osm_123456": { "lat": 14.4207, "lon": 120.9407 },
    // ... 638k nodes
  },
  "adjacency": {
    "osm_123456": [
      { "to": "osm_123457", "distanceKm": 0.012, "roadType": "residential" }
    ],
    // ... edges
  }
}
```

### Extraction Statistics

| Metric | Value |
|--------|-------|
| Total OSM Nodes Processed | 87,109,732 |
| Nodes in Bounding Box | 6,280,857 |
| Nodes in Road Network | 638,127 |
| Total Edges | 1,299,444 |
| Highway Ways | 1,257,626 |
| Extraction Time | ~1.5 minutes |
| Output File Size | 212 MB |

### Files Created

| File | Purpose |
|------|---------|
| `backend/scripts/extractRoadGraph.js` | PBF extraction script (run once) |
| `backend/data/roadNetwork.json` | Extracted road network |
| `backend/tests/unit/roadNetwork.test.js` | Verification test |

### Usage

```bash
# Run extraction (one-time)
node backend/scripts/extractRoadGraph.js

# Verify extraction
node backend/tests/unit/roadNetwork.test.js
```

---

## References

- [A* Search Algorithm - Wikipedia](https://en.wikipedia.org/wiki/A*_search_algorithm)
- [Haversine Formula](https://en.wikipedia.org/wiki/Haversine_formula)
- [GTFS Specification](https://gtfs.org/schedule/reference/)
- [Turf.js Documentation](https://turfjs.org/)
