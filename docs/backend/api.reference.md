# Para Mobile Backend — API Reference

> **Version:** 0.1.0  
> **Last Updated:** December 26, 2025  
> **Target Audience:** Contributors and Developers

---

## Table of Contents

1. [Architecture & Implementation Overview](#1-architecture--implementation-overview)
2. [Environment Setup](#2-environment-setup)
3. [API Specification](#3-api-specification)
   - [Health Check](#health-check)
   - [Routes API](#routes-api)
   - [Stops API](#stops-api)
4. [Integration Guide](#4-integration-guide)

---

## 1. Architecture & Implementation Overview

### 1.1 The "Graph-Lite" Approach

Para Mobile does **not** use a Graph Database (e.g., Neo4j) or paid routing APIs (e.g., Google Maps Directions API). Instead, we implement a **"Graph-Lite"** architecture using geometric buffer analysis.

**How It Works:**

1. **Route Data:** All transit routes (jeepney, tricycle, bus) are stored as **GeoJSON LineStrings** in MongoDB.
2. **Buffer Analysis:** When a user searches for routes, the backend creates a "buffer zone" (default: 400 meters) around each route using `turf.js`.
3. **Point-in-Polygon:** The origin and destination coordinates are tested against these buffers. A route is a "match" if **both** points fall within its buffer zone.
4. **Transfer Logic:** If no direct route exists, the system finds two routes whose geometries **intersect** and calculates a transfer point.

**Why This Matters for Dev 2 (Frontend/Maps):**
- The "Search" endpoint expects **coordinates** (`[longitude, latitude]`), not addresses.
- You must capture user taps on the map and send raw coordinates to the backend.
- The backend returns route geometry that you render on the map layer.

---

### 1.2 Tech Stack & Key Libraries

| Technology          | Role                                                                 |
|---------------------|----------------------------------------------------------------------|
| **Node.js**         | Runtime environment                                                  |
| **Express.js**      | HTTP server and routing framework                                    |
| **MongoDB**         | NoSQL database storing routes/stops as GeoJSON documents             |
| **Mongoose**        | ODM for MongoDB with schema validation and 2dsphere indexing         |
| **@turf/turf**      | Core spatial analysis library (buffer creation, point-in-polygon, line intersection, distance calculation) |
| **express-validator** | Input validation & sanitization middleware (security layer)        |
| **cors**            | Cross-Origin Resource Sharing middleware                             |
| **dotenv**          | Environment variable management                                      |
| **Expo**            | React Native development platform and build toolchain                |
| **React Native**    | Cross-platform mobile application framework                          |

---

## 2. Environment Setup

### 2.1 Prerequisites

| Requirement       | Version/Details                                      |
|-------------------|------------------------------------------------------|
| **Node.js**       | v18.x or higher (LTS recommended)                    |
| **npm**           | v9.x or higher                                       |
| **MongoDB**       | v6.x+ (local) or MongoDB Atlas (cloud)               |

**MongoDB Connection String Format:**
```
mongodb://localhost:27017/para-mobile
# or for Atlas:
mongodb+srv://<username>:<password>@<cluster>.mongodb.net/para-mobile
```

### 2.2 Installation

```bash
# 1. Navigate to backend directory
cd backend

# 2. Install dependencies
npm install

# 3. Create environment file
touch .env

# 4. Add required environment variables to .env:
#    PORT=5000
#    MONGODB_URI=mongodb://localhost:27017/para-mobile
#    NODE_ENV=development

# 5. Start development server (with hot-reload)
npm run dev

# 6. Or start production server
npm start
```

### 2.3 Available Scripts

| Script                | Command                  | Description                          |
|-----------------------|--------------------------|--------------------------------------|
| `npm start`           | `node server.js`         | Start production server              |
| `npm run dev`         | `nodemon server.js`      | Start dev server with hot-reload     |
| `npm test`            | `jest`                   | Run all tests                        |
| `npm run test:unit`   | `jest tests/unit`        | Run unit tests only                  |
| `npm run test:integration` | `jest tests/integration` | Run integration tests only      |
| `npm run test:coverage` | `jest --coverage`      | Generate test coverage report        |

### 2.4 Folder Structure

```
backend/
├── server.js              # Entry point, middleware setup, global error handlers
├── package.json           # Dependencies and scripts
│
├── config/
│   └── database.js        # MongoDB connection logic
│
├── models/
│   ├── Route.js           # Route schema (GeoJSON LineString)
│   └── Stop.js            # Stop schema (GeoJSON Point)
│
├── routes/
│   ├── index.js           # Route aggregator
│   ├── routeRoutes.js     # /api/routes endpoints
│   └── stopRoutes.js      # /api/stops endpoints
│
├── services/
│   └── spatialFilter.js   # 🔑 CORE BUSINESS LOGIC (Graph-Lite algorithm)
│
├── data/
│   └── routes.json        # Seed data (manually digitized routes)
│
└── tests/
    ├── setup.js           # Test configuration
    ├── unit/              # Unit tests for spatialFilter.js
    └── integration/       # API integration tests
```

> **Important:** Business logic lives in `/services`, NOT in route controllers. Route files only handle HTTP concerns (validation, request/response).

---

## 3. API Specification

**Base URL:** `http://localhost:5000`

**Common Headers:**
```
Content-Type: application/json
```

---

### Health Check

#### `GET /`

Check if the API server is running.

**Response (200 OK):**
```json
{
  "message": "Para Mobile API is running",
  "version": "1.0.0",
  "timestamp": "2025-12-26T10:30:00.000Z"
}
```

---

### Routes API

Base path: `/api/routes`

---

#### `GET /api/routes`

Retrieve all active transit routes.

**Description:** Returns all routes where `isActive: true`. Use this to populate a route list or render all routes on a map.

**Request Headers:**
```
Content-Type: application/json
```

**Request Body:** None

**Success Response (200 OK):**
```json
{
  "success": true,
  "count": 5,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "routeId": "IMUS-01",
      "routeName": "Imus - Bacoor",
      "vehicleType": "jeepney",
      "geometry": {
        "type": "LineString",
        "coordinates": [
          [120.9367, 14.4296],
          [120.9412, 14.4321],
          [120.9456, 14.4350]
        ]
      },
      "fare": 13,
      "trafficLevel": "moderate",
      "signboard": "IMUS-BACOOR",
      "isActive": true,
      "stops": [],
      "createdAt": "2025-12-20T08:00:00.000Z",
      "updatedAt": "2025-12-20T08:00:00.000Z"
    }
  ]
}
```

**Error Response (500 Internal Server Error):**
```json
{
  "success": false,
  "message": "Server error while fetching routes",
  "error": "Detailed error message (only in development)"
}
```

---

#### `GET /api/routes/:routeId`

Retrieve a single route by its `routeId`.

**Description:** Fetches detailed information for a specific route. The `routeId` is validated and sanitized.

**URL Parameters:**

| Parameter | Type   | Required | Description                |
|-----------|--------|----------|----------------------------|
| `routeId` | String | Yes      | Unique route identifier    |

**Request Headers:**
```
Content-Type: application/json
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "routeId": "IMUS-01",
    "routeName": "Imus - Bacoor",
    "vehicleType": "jeepney",
    "geometry": {
      "type": "LineString",
      "coordinates": [
        [120.9367, 14.4296],
        [120.9412, 14.4321]
      ]
    },
    "fare": 13,
    "trafficLevel": "low",
    "signboard": "IMUS-BACOOR",
    "isActive": true,
    "stops": []
  }
}
```

**Error Response (400 Bad Request) — Validation Error:**
```json
{
  "success": false,
  "errors": [
    {
      "type": "field",
      "value": "",
      "msg": "Route ID is required",
      "path": "routeId",
      "location": "params"
    }
  ]
}
```

**Error Response (404 Not Found):**
```json
{
  "success": false,
  "message": "Route not found"
}
```

---

#### `POST /api/routes/search`

🔑 **Core Endpoint** — Find routes connecting origin and destination.

**Description:** This is the primary endpoint for the "Graph-Lite" route matching algorithm. It:
1. Finds **direct routes** where both origin and destination fall within the route buffer (400m default).
2. If no direct route exists, finds **transfer routes** (max 1 transfer) by detecting route intersections.
3. Returns fare calculations and a recommendation.

**Request Headers:**
```
Content-Type: application/json
```

**Request Body:**

| Field             | Type              | Required | Description                                      |
|-------------------|-------------------|----------|--------------------------------------------------|
| `origin`          | `[Number, Number]`| Yes      | Starting point as `[longitude, latitude]`        |
| `destination`     | `[Number, Number]`| Yes      | Ending point as `[longitude, latitude]`          |
| `bufferDistance`  | `Number`          | No       | Buffer radius in meters (default: `400`)         |
| `includeTransfers`| `Boolean`         | No       | Include transfer routes in response (default: `true`) |

**Example Request Body:**
```json
{
  "origin": [120.9367, 14.4296],
  "destination": [120.9589, 14.4145],
  "bufferDistance": 500,
  "includeTransfers": true
}
```

**Success Response (200 OK) — Direct Route Found:**
```json
{
  "success": true,
  "origin": {
    "coordinates": [120.9367, 14.4296],
    "lng": 120.9367,
    "lat": 14.4296
  },
  "destination": {
    "coordinates": [120.9589, 14.4145],
    "lng": 120.9589,
    "lat": 14.4145
  },
  "bufferDistance": 500,
  "summary": {
    "directRoutesCount": 2,
    "transferRoutesCount": 0,
    "hasDirectRoute": true,
    "hasTransferRoute": false
  },
  "directRoutes": [
    {
      "type": "direct",
      "routeId": "IMUS-01",
      "routeName": "Imus - Bacoor",
      "vehicleType": "jeepney",
      "signboard": "IMUS-BACOOR",
      "trafficLevel": "moderate",
      "geometry": {
        "type": "LineString",
        "coordinates": [[120.9367, 14.4296], [120.9589, 14.4145]]
      },
      "stops": [],
      "calculatedDistance": 3.25,
      "calculatedFare": 13
    }
  ],
  "recommendation": {
    "type": "direct",
    "routeId": "IMUS-01",
    "routeName": "Imus - Bacoor",
    "signboard": "IMUS-BACOOR",
    "vehicleType": "jeepney",
    "distance": 3.25,
    "fare": 13,
    "reason": "Shortest direct route available"
  }
}
```

**Success Response (200 OK) — Transfer Route Found:**
```json
{
  "success": true,
  "origin": {
    "coordinates": [120.9200, 14.4100],
    "lng": 120.9200,
    "lat": 14.4100
  },
  "destination": {
    "coordinates": [120.9800, 14.4500],
    "lng": 120.9800,
    "lat": 14.4500
  },
  "bufferDistance": 400,
  "summary": {
    "directRoutesCount": 0,
    "transferRoutesCount": 1,
    "hasDirectRoute": false,
    "hasTransferRoute": true
  },
  "directRoutes": [],
  "transferRoutes": [
    {
      "type": "transfer",
      "transferCount": 1,
      "legs": [
        {
          "order": 1,
          "route": {
            "routeId": "IMUS-01",
            "routeName": "Imus - Bacoor",
            "vehicleType": "jeepney",
            "signboard": "IMUS-BACOOR",
            "trafficLevel": "low",
            "geometry": { "type": "LineString", "coordinates": [...] }
          },
          "from": {
            "type": "origin",
            "coordinates": [120.9200, 14.4100],
            "lng": 120.9200,
            "lat": 14.4100
          },
          "to": {
            "type": "transfer",
            "coordinates": [120.9500, 14.4300],
            "lng": 120.9500,
            "lat": 14.4300
          },
          "distance": 2.15,
          "fare": 13
        },
        {
          "order": 2,
          "route": {
            "routeId": "BACOOR-02",
            "routeName": "Bacoor - Kawit",
            "vehicleType": "jeepney",
            "signboard": "BACOOR-KAWIT",
            "trafficLevel": "moderate",
            "geometry": { "type": "LineString", "coordinates": [...] }
          },
          "from": {
            "type": "transfer",
            "coordinates": [120.9500, 14.4300],
            "lng": 120.9500,
            "lat": 14.4300
          },
          "to": {
            "type": "destination",
            "coordinates": [120.9800, 14.4500],
            "lng": 120.9800,
            "lat": 14.4500
          },
          "distance": 3.10,
          "fare": 13
        }
      ],
      "transferPoint": {
        "coordinates": [120.9500, 14.4300],
        "lng": 120.9500,
        "lat": 14.4300
      },
      "totalDistance": 5.25,
      "totalFare": 26
    }
  ],
  "recommendation": {
    "type": "transfer",
    "legs": [
      {
        "routeId": "IMUS-01",
        "routeName": "Imus - Bacoor",
        "signboard": "IMUS-BACOOR",
        "vehicleType": "jeepney"
      },
      {
        "routeId": "BACOOR-02",
        "routeName": "Bacoor - Kawit",
        "signboard": "BACOOR-KAWIT",
        "vehicleType": "jeepney"
      }
    ],
    "transferPoint": {
      "coordinates": [120.9500, 14.4300],
      "lng": 120.9500,
      "lat": 14.4300
    },
    "distance": 5.25,
    "fare": 26,
    "reason": "No direct route available; shortest transfer option"
  }
}
```

**Success Response (200 OK) — No Routes Found:**
```json
{
  "success": true,
  "origin": { ... },
  "destination": { ... },
  "bufferDistance": 400,
  "summary": {
    "directRoutesCount": 0,
    "transferRoutesCount": 0,
    "hasDirectRoute": false,
    "hasTransferRoute": false
  },
  "directRoutes": [],
  "recommendation": null,
  "message": "No routes found connecting origin and destination"
}
```

**Error Response (400 Bad Request) — Validation Error:**
```json
{
  "success": false,
  "errors": [
    {
      "type": "field",
      "value": null,
      "msg": "Origin is required",
      "path": "origin",
      "location": "body"
    },
    {
      "type": "field",
      "value": [120.9367],
      "msg": "Destination must be an array of [longitude, latitude]",
      "path": "destination",
      "location": "body"
    }
  ]
}
```

> **Note for Dev 3:** Parse the `errors` array to display field-specific validation messages in the React Native UI.

**Error Response (500 Internal Server Error):**
```json
{
  "success": false,
  "message": "Server error while searching routes",
  "error": "Detailed error message (only in development)"
}
```

---

### Stops API

Base path: `/api/stops`

---

#### `GET /api/stops`

Retrieve all active stops.

**Description:** Returns all stops where `isActive: true`.

**Request Headers:**
```
Content-Type: application/json
```

**Request Body:** None

**Success Response (200 OK):**
```json
{
  "success": true,
  "count": 12,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439022",
      "stopId": "STOP-001",
      "stopName": "Imus City Hall",
      "location": {
        "type": "Point",
        "coordinates": [120.9367, 14.4296]
      },
      "routeIds": ["IMUS-01", "IMUS-02"],
      "stopType": "terminal",
      "description": "Main terminal near city hall",
      "isActive": true,
      "createdAt": "2025-12-20T08:00:00.000Z",
      "updatedAt": "2025-12-20T08:00:00.000Z"
    }
  ]
}
```

---

#### `GET /api/stops/nearby`

Find stops near a geographic location.

**Description:** Uses MongoDB's `$near` geospatial query to find stops within a specified radius.

**Query Parameters:**

| Parameter     | Type   | Required | Default | Description                         |
|---------------|--------|----------|---------|-------------------------------------|
| `lng`         | Number | Yes      | —       | Longitude of search center          |
| `lat`         | Number | Yes      | —       | Latitude of search center           |
| `maxDistance` | Number | No       | `500`   | Maximum distance in meters          |

**Example Request:**
```
GET /api/stops/nearby?lng=120.9367&lat=14.4296&maxDistance=300
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "count": 3,
  "searchLocation": {
    "lng": 120.9367,
    "lat": 14.4296
  },
  "maxDistance": 300,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439022",
      "stopId": "STOP-001",
      "stopName": "Imus City Hall",
      "location": {
        "type": "Point",
        "coordinates": [120.9367, 14.4296]
      },
      "routeIds": ["IMUS-01"],
      "stopType": "terminal",
      "isActive": true
    }
  ]
}
```

**Error Response (400 Bad Request):**
```json
{
  "success": false,
  "message": "Longitude (lng) and latitude (lat) are required"
}
```

---

#### `GET /api/stops/:stopId`

Retrieve a single stop by its `stopId`.

**URL Parameters:**

| Parameter | Type   | Required | Description               |
|-----------|--------|----------|---------------------------|
| `stopId`  | String | Yes      | Unique stop identifier    |

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439022",
    "stopId": "STOP-001",
    "stopName": "Imus City Hall",
    "location": {
      "type": "Point",
      "coordinates": [120.9367, 14.4296]
    },
    "routeIds": ["IMUS-01", "IMUS-02"],
    "stopType": "terminal",
    "isActive": true
  }
}
```

**Error Response (404 Not Found):**
```json
{
  "success": false,
  "message": "Stop not found"
}
```

---

#### `GET /api/stops/route/:routeId`

Retrieve all stops for a specific route.

**URL Parameters:**

| Parameter | Type   | Required | Description                          |
|-----------|--------|----------|--------------------------------------|
| `routeId` | String | Yes      | Route ID to filter stops by          |

**Success Response (200 OK):**
```json
{
  "success": true,
  "count": 5,
  "routeId": "IMUS-01",
  "data": [
    {
      "stopId": "STOP-001",
      "stopName": "Imus City Hall",
      "location": {
        "type": "Point",
        "coordinates": [120.9367, 14.4296]
      },
      "stopType": "terminal"
    }
  ]
}
```

---

## 4. Integration Guide

### 4.1 Calling the Search API (TypeScript/Fetch)

```typescript
interface SearchRequest {
  origin: [number, number];       // [longitude, latitude]
  destination: [number, number];  // [longitude, latitude]
  bufferDistance?: number;
  includeTransfers?: boolean;
}

interface SearchResponse {
  success: boolean;
  origin: { coordinates: [number, number]; lng: number; lat: number };
  destination: { coordinates: [number, number]; lng: number; lat: number };
  bufferDistance: number;
  summary: {
    directRoutesCount: number;
    transferRoutesCount: number;
    hasDirectRoute: boolean;
    hasTransferRoute: boolean;
  };
  directRoutes: DirectRoute[];
  transferRoutes?: TransferRoute[];
  recommendation: Recommendation | null;
  message?: string;
}

interface ValidationError {
  type: string;
  value: unknown;
  msg: string;
  path: string;
  location: string;
}

interface ErrorResponse {
  success: false;
  errors?: ValidationError[];
  message?: string;
}

async function searchRoutes(
  origin: [number, number],
  destination: [number, number]
): Promise<SearchResponse> {
  const API_BASE_URL = 'http://localhost:5000';
  
  const response = await fetch(`${API_BASE_URL}/api/routes/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      origin,
      destination,
      includeTransfers: true,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    // Handle validation errors (400)
    if (response.status === 400 && data.errors) {
      const errorMessages = data.errors.map((e: ValidationError) => e.msg).join(', ');
      throw new Error(`Validation failed: ${errorMessages}`);
    }
    // Handle server errors (500)
    throw new Error(data.message || 'An error occurred');
  }

  return data as SearchResponse;
}

// Usage Example
async function handleRouteSearch() {
  try {
    const result = await searchRoutes(
      [120.9367, 14.4296],  // Origin: Imus City Hall
      [120.9589, 14.4145]   // Destination: Bacoor
    );

    if (result.recommendation) {
      console.log('Recommended Route:', result.recommendation.routeName);
      console.log('Fare:', `₱${result.recommendation.fare}`);
    } else {
      console.log('No routes available');
    }
  } catch (error) {
    console.error('Search failed:', error.message);
  }
}
```

### 4.2 Calling the Search API (Axios)

```typescript
import axios, { AxiosError } from 'axios';

const apiClient = axios.create({
  baseURL: 'http://localhost:5000',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

async function searchRoutes(
  origin: [number, number],
  destination: [number, number]
) {
  try {
    const { data } = await apiClient.post<SearchResponse>('/api/routes/search', {
      origin,
      destination,
      includeTransfers: true,
    });
    return data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<ErrorResponse>;
      
      if (axiosError.response?.status === 400) {
        // Validation error — show field-specific messages
        const errors = axiosError.response.data.errors;
        if (errors) {
          errors.forEach((err) => {
            console.error(`Field "${err.path}": ${err.msg}`);
          });
        }
      }
      throw new Error(axiosError.response?.data.message || 'Request failed');
    }
    throw error;
  }
}
```

### 4.3 Error Handling Patterns for React Native (Dev 3)

```typescript
// Parse express-validator errors into a field-error map
function parseValidationErrors(
  errors: ValidationError[]
): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  
  errors.forEach((error) => {
    if (!fieldErrors[error.path]) {
      fieldErrors[error.path] = error.msg;
    }
  });
  
  return fieldErrors;
}

// Example usage in a React Native component
const handleSearch = async () => {
  setLoading(true);
  setFieldErrors({});
  
  try {
    const result = await searchRoutes(origin, destination);
    setSearchResult(result);
  } catch (error: any) {
    if (error.response?.status === 400 && error.response.data.errors) {
      const parsed = parseValidationErrors(error.response.data.errors);
      setFieldErrors(parsed);
      // Now you can show: fieldErrors.origin, fieldErrors.destination, etc.
    } else {
      Alert.alert('Error', error.message);
    }
  } finally {
    setLoading(false);
  }
};
```

---

## Appendix

### A. Fare Calculation Formula

```
Base Fare: ₱13 (covers first 4 km)
Additional: ₱1.80 per km beyond 4 km

calculatedFare = distance <= 4 
  ? baseFare 
  : Math.ceil(baseFare + (distance - 4) * 1.80)
```

### B. Default Constants

| Constant          | Value   | Description                                   |
|-------------------|---------|-----------------------------------------------|
| `BUFFER_DISTANCE` | 400m    | Default buffer radius for route matching      |
| `baseFare`        | ₱13     | Minimum fare                                  |
| `farePerKm`       | ₱1.80   | Additional fare per kilometer (after 4km)    |
| `baseDistance`    | 4km     | Distance covered by base fare                 |

### C. Vehicle Types (Enum)

```
jeepney | tricycle | bus | cab
```

### D. Stop Types (Enum)

```
terminal | loading_bay | landmark
```

### E. Traffic Levels (Enum)

```
low | moderate | high
```

---

## Changelog

| Version | Date       | Changes                                      |
|---------|------------|----------------------------------------------|
| 0.1.0   | 2025-12-26 | Initial API Reference documentation          |

---

*Document generated for Para Mobile "Graph-Lite" Backend v0.1.0*
