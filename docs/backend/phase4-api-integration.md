# Phase 4: API Integration

## Overview

Phase 4 completes the backend route search redesign by exposing the A* pathfinding algorithm through REST API endpoints. These endpoints allow the React Native frontend to search for optimal routes, list available transit routes, record GPS traces for segment timing, and calculate fares.

## API Endpoints

### Base URL
```
http://localhost:5000/api/commutes
```

### Route Search

#### `POST /search`
Find optimal routes between two points using A* pathfinding.

**Request Body:**
```json
{
  "origin": {
    "lat": 14.4207,
    "lon": 120.9407
  },
  "destination": {
    "lat": 14.3841,
    "lon": 120.9777
  },
  "mode": "TIME",       // Optional: TIME (default), FARE, or DISTANCE
  "maxResults": 3,       // Optional: Maximum route alternatives (default: 3)
  "maxWalkingKm": 0.5    // Optional: Maximum walking distance to transit
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "routes": [
      {
        "rank": 1,
        "summary": {
          "totalTimeMinutes": 25,
          "totalFare": 26,
          "totalDistanceKm": 5.5,
          "transferCount": 1
        },
        "segments": [
          {
            "type": "WALK",
            "distanceKm": 0.1,
            "timeMinutes": 1.5,
            "from": { "lat": 14.4207, "lon": 120.9407 },
            "to": { "lat": 14.4210, "lon": 120.9410 }
          },
          {
            "type": "TRANSIT",
            "routeId": "BDO-SMMOLINO-OUT",
            "routeName": "BDO TO SM MOLINO",
            "vehicleType": "jeep",
            "signboard": "SM MOLINO",
            "distanceKm": 5.0,
            "fare": 13,
            "timeMinutes": 20,
            "boardAt": { "lat": 14.4210, "lon": 120.9410 },
            "alightAt": { "lat": 14.3845, "lon": 120.9770 }
          },
          {
            "type": "WALK",
            "distanceKm": 0.1,
            "timeMinutes": 1.5
          }
        ]
      }
    ],
    "summary": {
      "totalRoutes": 1,
      "searchTimeMs": 50,
      "origin": { "lat": 14.4207, "lon": 120.9407 },
      "destination": { "lat": 14.3841, "lon": 120.9777 },
      "mode": "TIME"
    }
  }
}
```

### Transit Routes

#### `GET /routes`
List all available transit routes.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `vehicleType` | string | Filter by vehicle type (jeep, bus, uv, etc.) |
| `direction` | string | Filter by direction (inbound, outbound) |
| `includeNodes` | boolean | Include node count in response |

**Response:**
```json
{
  "success": true,
  "data": {
    "routes": [
      {
        "routeId": "BDO-SMMOLINO-OUT",
        "routeName": "BDO TO SM MOLINO",
        "vehicleType": "jeep",
        "signboard": "SM MOLINO",
        "direction": "outbound",
        "startTerminal": "BDO Imus",
        "endTerminal": "SM Molino"
      }
    ],
    "total": 15,
    "filters": {
      "vehicleType": null,
      "direction": null
    }
  }
}
```

### Nearby Stops

#### `GET /nearby`
Find nearby transit stops from a location.

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `lat` | number | Yes | Latitude |
| `lon` | number | Yes | Longitude |
| `radius` | number | No | Search radius in km (default: 0.5) |
| `limit` | number | No | Maximum results (default: 10) |

**Response:**
```json
{
  "success": true,
  "data": {
    "location": { "lat": 14.4207, "lon": 120.9407 },
    "radius": 0.5,
    "results": [
      {
        "nodeId": "osm_12345",
        "lat": 14.4210,
        "lon": 120.9410,
        "distanceKm": 0.05,
        "distanceMeters": 50,
        "isTerminal": false,
        "routes": [
          {
            "routeId": "BDO-SMMOLINO-OUT",
            "routeName": "BDO TO SM MOLINO",
            "vehicleType": "jeep",
            "signboard": "SM MOLINO"
          }
        ]
      }
    ],
    "total": 1
  }
}
```

### Routing Configuration

#### `GET /config`
Get current routing configuration.

**Response:**
```json
{
  "success": true,
  "data": {
    "transferPenaltyMinutes": 10,
    "maxWalkingDistanceKm": 0.5,
    "maxTransferWalkingKm": 0.3,
    "routeMappingToleranceKm": 0.1,
    "walkingSpeedKmh": 4.5,
    "supportedVehicleTypes": ["jeep", "jeepney", "bus", "bus_aircon", "uv", "tricycle", "cab"]
  }
}
```

### Fare Calculation

#### `GET /fare`
Calculate fare for a specific vehicle type and distance.

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `vehicleType` | string | Yes | Vehicle type |
| `distanceKm` | number | Yes | Distance in kilometers |

**Response:**
```json
{
  "success": true,
  "data": {
    "vehicleType": "jeep",
    "distanceKm": 5,
    "baseFare": 13,
    "baseDistance": 4,
    "additionalKm": 1,
    "additionalFare": 1.8,
    "totalFare": 14.8
  }
}
```

### GPS Trace Recording (Stopwatch)

#### `POST /stopwatch`
Record GPS trace data for automatic segment time tracking.

**Request Body:**
```json
{
  "routeId": "BDO-SMMOLINO-OUT",
  "vehicleType": "jeep",
  "trace": [
    { "lat": 14.4207, "lon": 120.9407, "timestamp": 1736956800000 },
    { "lat": 14.4210, "lon": 120.9410, "timestamp": 1736956860000 },
    { "lat": 14.4215, "lon": 120.9420, "timestamp": 1736956920000 }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "routeId": "BDO-SMMOLINO-OUT",
    "recordedSegments": 2,
    "skippedSegments": 0,
    "message": "Recorded 2 segment times"
  }
}
```

## Legacy Endpoints

The following endpoints are maintained for backward compatibility:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/` | Save completed commute session |
| `GET` | `/` | List saved commute sessions |
| `GET` | `/:id` | Get specific commute session |

## Error Responses

All endpoints return consistent error responses:

```json
{
  "success": false,
  "error": "ERROR_CODE",
  "message": "Human-readable error message",
  "details": "Additional details (development only)"
}
```

| Error Code | HTTP Status | Description |
|------------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid request parameters |
| `NOT_FOUND` | 404 | Resource not found |
| `NO_ROUTE_FOUND` | 404 | No route found between points |
| `SERVICE_UNAVAILABLE` | 503 | Graph services not initialized |
| `SERVER_ERROR` | 500 | Internal server error |

## Service Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    commuteRoutes.js                         │
│                   (Express Router)                          │
├─────────────────────────────────────────────────────────────┤
│  /search     /routes    /nearby    /config    /stopwatch    │
│      │           │          │          │           │        │
└──────┼───────────┼──────────┼──────────┼───────────┼────────┘
       │           │          │          │           │
       ▼           ▼          ▼          ▼           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Service Layer                            │
├────────────────┬─────────────┬──────────────┬───────────────┤
│ AStarPathfinder│GraphService │FareCalculator│StopwatchService│
│                │             │              │               │
│ • findPath()   │• getAllRoutes()│• calculateFare()│• recordGPSTrace()│
│                │• findNearestTransitNodes()│• getFareBreakdown()│  │
│                │• getConfig()│              │               │
└────────────────┴─────────────┴──────────────┴───────────────┘
       │                │
       ▼                ▼
┌─────────────────────────────────────────────────────────────┐
│                    Data Layer                               │
├───────────────┬──────────────┬──────────────┬───────────────┤
│  MongoDB      │ MongoDB      │  MongoDB     │   JSON File   │
│  TransitRoute │ TransitConfig│  SegmentTime │roadAdjacency.json│
│               │              │              │               │
└───────────────┴──────────────┴──────────────┴───────────────┘
```

## Service Initialization

Services are lazily initialized on first API request:

1. **GraphService** - Loads road network and transit metadata
2. **FareCalculator** - Initializes fare matrix
3. **StopwatchService** - Sets up default speed estimates
4. **AStarPathfinder** - Combines all services for pathfinding

If initialization fails, endpoints return `503 SERVICE_UNAVAILABLE`.

## Testing

Run API tests:
```bash
cd backend
npm test -- tests/unit/commuteRoutes.test.js
```

**Test Coverage:**
- 19 tests covering all Phase 4 endpoints
- Validation tests for required parameters
- Error handling tests
- Legacy endpoint compatibility tests

## Usage Example (React Native)

```javascript
// Search for routes
const searchRoutes = async (origin, destination, mode = 'TIME') => {
  const response = await fetch('http://localhost:5000/api/commutes/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      origin: { lat: origin.latitude, lon: origin.longitude },
      destination: { lat: destination.latitude, lon: destination.longitude },
      mode,
    }),
  });
  return response.json();
};

// Find nearby stops
const findNearbyStops = async (location) => {
  const response = await fetch(
    `http://localhost:5000/api/commutes/nearby?lat=${location.latitude}&lon=${location.longitude}&radius=0.5`
  );
  return response.json();
};

// Calculate fare
const calculateFare = async (vehicleType, distanceKm) => {
  const response = await fetch(
    `http://localhost:5000/api/commutes/fare?vehicleType=${vehicleType}&distanceKm=${distanceKm}`
  );
  return response.json();
};
```

## Summary

Phase 4 completes the backend redesign with:

| Feature | Endpoint | Description |
|---------|----------|-------------|
| **Route Search** | `POST /search` | A* pathfinding with TIME/FARE/DISTANCE modes |
| **Route List** | `GET /routes` | All transit routes with filtering |
| **Nearby Stops** | `GET /nearby` | Find transit stops near location |
| **Configuration** | `GET /config` | Routing parameters |
| **Fare Calculator** | `GET /fare` | Calculate fare for distance |
| **Stopwatch** | `POST /stopwatch` | Record GPS traces for timing |

**Total Implementation:**
- **Phase 0**: 638k road nodes extracted from OSM
- **Phase 1**: Graph builder with 1.3M edges
- **Phase 2**: GraphService with MongoDB integration
- **Phase 3**: A* pathfinder with 3 optimization modes
- **Phase 4**: 6 REST API endpoints + 3 legacy endpoints

**Test Coverage:** 182 tests across 9 test suites
