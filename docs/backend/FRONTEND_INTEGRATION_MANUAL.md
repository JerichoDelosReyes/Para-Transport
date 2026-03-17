# Para Mobile Backend — Frontend Integration Manual

> **Document Version:** 1.0.0  
> **API Version:** 2.0.0 (Phase 4)  
> **Last Updated:** January 15, 2026  
> **Status:** Production Ready  
> **Target Audience:** Frontend Developers, Mobile Engineers, QA Engineers

---

## Table of Contents

1. [Quick Start](#1-quick-start)
2. [Architecture Overview](#2-architecture-overview)
3. [Authentication](#3-authentication)
4. [API Endpoints Reference](#4-api-endpoints-reference)
5. [Data Models & TypeScript Interfaces](#5-data-models--typescript-interfaces)
6. [Integration Patterns](#6-integration-patterns)
7. [Error Handling](#7-error-handling)
8. [Real-Time Features](#8-real-time-features)
9. [Testing & Debugging](#9-testing--debugging)
10. [Migration Guide](#10-migration-guide)
11. [FAQ & Troubleshooting](#11-faq--troubleshooting)

---

## 1. Quick Start

### 1.1 Base Configuration

```typescript
// src/config/api.config.ts

export const API_CONFIG = {
  // ⚠️ FOR MOBILE TESTING: Replace localhost with your Ngrok/Tunnel URL
  // Example: 'https://a1b2-c3d4.ngrok-free.app'
  // You can set this via the EXPO_PUBLIC_API_URL environment variable
  BASE_URL: process.env.API_URL || 'http://localhost:5000', 
  TIMEOUT: 30000, // 30 seconds
  RETRY_ATTEMPTS: 3,

export const ENDPOINTS = {
  // Health & Status
  HEALTH: '/api/health',
  
  // Route Search (Phase 4 - A* Pathfinding)
  SEARCH: '/api/commutes/search',
  ROUTES: '/api/commutes/routes',
  NEARBY: '/api/commutes/nearby',
  CONFIG: '/api/commutes/config',
  FARE: '/api/commutes/fare',
  
  // Stopwatch & Tracking
  STOPWATCH: '/api/commutes/stopwatch',
  
  // Legacy Commute Sessions
  COMMUTES: '/api/commutes',
};
```

### 1.2 Minimum Viable Integration

```typescript
// Simplest route search example
const searchRoutes = async (
  origin: { lat: number; lon: number },
  destination: { lat: number; lon: number }
) => {
  const response = await fetch(`${API_CONFIG.BASE_URL}/api/commutes/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`, // Required for authenticated endpoints
    },
    body: JSON.stringify({ origin, destination, mode: 'TIME' }),
  });
  
  return response.json();
};
```

### 1.3 Server Readiness Check

**⚠️ IMPORTANT:** Always check server health before making requests.

```typescript
const checkServerReady = async (): Promise<boolean> => {
  try {
    const response = await fetch(`${API_CONFIG.BASE_URL}/api/health`, {
      headers: { 'Authorization': `Bearer ${authToken}` },
    });
    const data = await response.json();
    return data.status === 'ready';
  } catch {
    return false;
  }
};

// Usage: Wait for server before app is fully functional
const initializeApp = async () => {
  let ready = false;
  let attempts = 0;
  
  while (!ready && attempts < 10) {
    ready = await checkServerReady();
    if (!ready) {
      await new Promise(r => setTimeout(r, 2000)); // Wait 2 seconds
      attempts++;
    }
  }
  
  if (!ready) {
    showOfflineMode(); // Graceful degradation
  }
};
```

---

## 2. Architecture Overview

### 2.1 System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PARA MOBILE ARCHITECTURE                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐         ┌─────────────────────────────────────────┐   │
│  │  React Native   │         │           Node.js Backend               │   │
│  │     Mobile      │  HTTP   │                                         │   │
│  │   Application   │◄───────►│  ┌─────────────────────────────────┐   │   │
│  │                 │   REST  │  │        Express Router           │   │   │
│  │  • Route Search │         │  │   /api/commutes/*               │   │   │
│  │  • Stopwatch    │         │  └──────────────┬──────────────────┘   │   │
│  │  • Map Display  │         │                 │                       │   │
│  │  • Fare Display │         │  ┌──────────────▼──────────────────┐   │   │
│  └─────────────────┘         │  │       Service Layer             │   │   │
│                              │  │  • GraphService                 │   │   │
│                              │  │  • AStarPathfinder              │   │   │
│                              │  │  • FareCalculator               │   │   │
│                              │  │  • StopwatchService             │   │   │
│                              │  └──────────────┬──────────────────┘   │   │
│                              │                 │                       │   │
│                              │  ┌──────────────▼──────────────────┐   │   │
│                              │  │        Data Layer               │   │   │
│                              │  │  • MongoDB Atlas                │   │   │
│                              │  │  • roadAdjacency.json           │   │   │
│                              │  └─────────────────────────────────┘   │   │
│                              └─────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Request Flow

```
User Taps "Search"
       │
       ▼
┌─────────────────┐
│ Capture GPS     │  ← React Native Location API
│ Coordinates     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ POST /search    │  ← Frontend sends {origin, destination, mode}
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ A* Pathfinding  │  ← Backend finds optimal routes
│ Algorithm       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Return Routes   │  ← Backend returns routes with segments
│ + Alternatives  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Render Results  │  ← Frontend displays routes on map
│ on Map          │
└─────────────────┘
```

### 2.3 Key Concepts

| Concept | Description | Frontend Responsibility |
|---------|-------------|------------------------|
| **Road Node** | A point on the road network (from OSM) | Display on map when debugging |
| **Transit Route** | A jeepney/bus route with fixed path | Render as polyline on map |
| **Segment** | Part of a journey (WALK, TRANSIT, TRANSFER) | Display step-by-step instructions |
| **Entry/Exit Point** | Where user boards/alights transit | Show as markers on map |
| **Transfer Point** | Where user switches routes | Show transfer instructions |

---

## 3. Authentication

### 3.1 Authentication Flow

```typescript
// All authenticated endpoints require Bearer token
const authHeaders = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${userToken}`,
};
```

### 3.2 Endpoint Authentication Requirements

| Endpoint | Auth Required | Notes |
|----------|---------------|-------|
| `GET /` | ❌ No | Basic health check |
| `GET /api/health` | ✅ Yes | Detailed service status |
| `POST /api/commutes/search` | ✅ Yes | Route search |
| `GET /api/commutes/routes` | ✅ Yes | List routes |
| `GET /api/commutes/nearby` | ✅ Yes | Find nearby stops |
| `GET /api/commutes/config` | ✅ Yes | Get configuration |
| `GET /api/commutes/fare` | ✅ Yes | Calculate fare |
| `POST /api/commutes/stopwatch` | ✅ Yes | Record GPS traces |

---

## 4. API Endpoints Reference

### 4.1 Health Check

#### `GET /api/health` 🔒

Check service initialization status and health.

**Request:**
```typescript
const checkHealth = async () => {
  const response = await fetch(`${BASE_URL}/api/health`, {
    headers: authHeaders,
  });
  return response.json();
};
```

**Response:**
```typescript
interface HealthResponse {
  status: 'ready' | 'initializing' | 'failed';
  environment: string; // e.g., 'development' | 'production'
  services: {
    mongodb: { connected: boolean };
    graphService: {
      initialized: boolean;
      nodeCount: number;
      routeCount: number;
    };
  };
  uptime: number; // seconds
  timestamp: string;
}
```

**Example Response:**
```json
{
  "status": "ready",
  "environment": "production",
  "services": {
    "mongodb": { "connected": true },
    "graphService": {
      "initialized": true,
      "nodeCount": 867,
      "routeCount": 15
    }
  },
  "uptime": 3600,
  "timestamp": "2026-01-15T10:30:00.000Z"
}
```

---

### 4.2 Route Search

#### `POST /api/commutes/search` 🔒

Find optimal routes between two points using A* pathfinding.

**Request:**
```typescript
interface SearchRequest {
  origin: {
    lat: number;  // Latitude (e.g., 14.4207)
    lon: number;  // Longitude (e.g., 120.9407)
  };
  destination: {
    lat: number;
    lon: number;
  };
  mode?: 'TIME' | 'FARE' | 'DISTANCE';  // Default: 'TIME'
  maxResults?: number;  // Default: 3
  maxWalkingKm?: number;  // Override config default
}

// Example
const searchRoutes = async (request: SearchRequest) => {
  const response = await fetch(`${BASE_URL}/api/commutes/search`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify(request),
  });
  return response.json();
};
```

**Response:**
```typescript
interface SearchResponse {
  success: true;
  data: {
    routes: RouteResult[];
    alternatives: AlternativeOptions;
    summary: SearchSummary;
  };
}

interface RouteResult {
  rank: number;
  summary: {
    totalTimeMinutes: number;
    totalFare: number;
    totalDistanceKm: number;
    transferCount: number;
  };
  segments: Segment[];
}

interface Segment {
  type: 'WALK' | 'TRANSIT' | 'TRANSFER';
  
  // For all types
  distanceKm: number;
  timeMinutes: number;
  from: { lat: number; lon: number };
  to: { lat: number; lon: number };
  
  // For TRANSIT only
  routeId?: string;
  routeName?: string;
  vehicleType?: 'jeep' | 'jeepney' | 'bus' | 'uv' | 'tricycle' | 'cab';
  signboard?: string;
  fare?: number;
  boardAt?: { lat: number; lon: number };
  alightAt?: { lat: number; lon: number };
  
  // For map rendering
  polyline?: [number, number][];  // Array of [lon, lat] coordinates
  
  // For step-by-step instructions
  instruction?: string;  // e.g., "Walk 100m to BDO Imus"
}

interface AlternativeOptions {
  walkingOption: {
    available: boolean;
    distanceKm: number;
    timeMinutes: number;
    message: string;  // e.g., "Walk directly (1.2 km, ~16 min)"
    polyline?: [number, number][];
  } | null;
  nearbyOriginStops: NearbyStop[];
  nearbyDestinationStops: NearbyStop[];
  message: string;  // e.g., "No transit routes connect these points"
}

interface SearchSummary {
  totalRoutes: number;
  searchTimeMs: number;
  origin: { lat: number; lon: number };
  destination: { lat: number; lon: number };
  mode: 'TIME' | 'FARE' | 'DISTANCE';
}
```

**Example Usage:**
```typescript
// Search for fastest route
const result = await searchRoutes({
  origin: { lat: 14.4207, lon: 120.9407 },
  destination: { lat: 14.3841, lon: 120.9777 },
  mode: 'TIME',
});

if (result.data.routes.length > 0) {
  // Display route options
  displayRouteOptions(result.data.routes);
} else {
  // Show alternatives
  displayAlternatives(result.data.alternatives);
}
```

---

### 4.3 List Transit Routes

#### `GET /api/commutes/routes` 🔒

Get all available transit routes.

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `vehicleType` | string | No | Filter by vehicle type |
| `direction` | string | No | Filter by direction (inbound/outbound) |
| `includeNodes` | boolean | No | Include node count |

**Response:**
```typescript
interface RoutesResponse {
  success: true;
  data: {
    routes: TransitRoute[];
    total: number;
    filters: {
      vehicleType: string | null;
      direction: string | null;
    };
  };
}

interface TransitRoute {
  routeId: string;
  routeName: string;
  vehicleType: 'jeep' | 'jeepney' | 'bus' | 'uv' | 'tricycle' | 'cab';
  signboard: string;
  direction: 'inbound' | 'outbound';
  startTerminal: string;
  endTerminal: string;
  nodeCount?: number;  // Only if includeNodes=true
}
```

**Example:**
```typescript
// Get all jeepney routes
const jeepRoutes = await fetch(
  `${BASE_URL}/api/commutes/routes?vehicleType=jeep`,
  { headers: authHeaders }
).then(r => r.json());
```

---

### 4.4 Find Nearby Stops

#### `GET /api/commutes/nearby` 🔒

Find transit stops near a location.

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `lat` | number | Yes | Latitude |
| `lon` | number | Yes | Longitude |
| `radius` | number | No | Search radius in km (default: 0.5) |
| `limit` | number | No | Max results (default: 10) |

**Response:**
```typescript
interface NearbyResponse {
  success: true;
  data: {
    location: { lat: number; lon: number };
    radius: number;
    results: NearbyStop[];
    total: number;
  };
}

interface NearbyStop {
  nodeId: string;
  lat: number;
  lon: number;
  distanceKm: number;
  distanceMeters: number;
  isTerminal: boolean;
  routes: {
    routeId: string;
    routeName: string;
    vehicleType: string;
    signboard: string;
  }[];
}
```

**Example:**
```typescript
// Find stops within 500m of user location
const nearbyStops = await fetch(
  `${BASE_URL}/api/commutes/nearby?lat=14.4207&lon=120.9407&radius=0.5`,
  { headers: authHeaders }
).then(r => r.json());
```

---

### 4.5 Get Configuration

#### `GET /api/commutes/config` 🔒

Get routing configuration values.

**Response:**
```typescript
interface ConfigResponse {
  success: true;
  data: {
    transferPenaltyMinutes: number;  // Default: 10
    maxWalkingDistanceKm: number;    // Default: 0.5
    maxTransferWalkingKm: number;    // Default: 0.3
    routeMappingToleranceKm: number; // Default: 0.1
    walkingSpeedKmh: number;         // Default: 4.5
    supportedVehicleTypes: string[];
  };
}
```

---

### 4.6 Calculate Fare

#### `GET /api/commutes/fare` 🔒

Calculate fare for a specific vehicle type and distance.

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `vehicleType` | string | Yes | Vehicle type |
| `distanceKm` | number | Yes | Distance in kilometers |

**Response:**
```typescript
interface FareResponse {
  success: true;
  data: {
    vehicleType: string;
    distanceKm: number;
    baseFare: number;
    baseDistance: number;
    additionalKm: number;
    additionalFare: number;
    totalFare: number;
  };
}
```

**Example:**
```typescript
// Calculate jeepney fare for 5km
const fare = await fetch(
  `${BASE_URL}/api/commutes/fare?vehicleType=jeep&distanceKm=5`,
  { headers: authHeaders }
).then(r => r.json());

// Response: { totalFare: 14.8, baseFare: 13, additionalFare: 1.8 }
```

---

### 4.7 Record GPS Trace (Stopwatch)

#### `POST /api/commutes/stopwatch` 🔒

Record GPS trace data for automatic segment time tracking.

**Request:**
```typescript
interface StopwatchRequest {
  routeId: string;
  vehicleType: string;
  trace: GPSPoint[];
}

interface GPSPoint {
  lat: number;
  lon: number;
  timestamp: number;  // Unix timestamp in milliseconds
}

// Example: Real-time tracking sends every second
const recordTrace = async (routeId: string, vehicleType: string, trace: GPSPoint[]) => {
  const response = await fetch(`${BASE_URL}/api/commutes/stopwatch`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ routeId, vehicleType, trace }),
  });
  return response.json();
};
```

**Response:**
```typescript
interface StopwatchResponse {
  success: true;
  data: {
    routeId: string;
    recordedSegments: number;
    skippedSegments: number;
    warnings: string[];  // e.g., ["Point 3 was 150m from nearest road node"]
    message: string;
  };
}
```

**Example Usage (Real-time tracking):**
```typescript
// In React Native with location tracking
import * as Location from 'expo-location';

class GPSTracker {
  private trace: GPSPoint[] = [];
  private routeId: string;
  private vehicleType: string;
  
  constructor(routeId: string, vehicleType: string) {
    this.routeId = routeId;
    this.vehicleType = vehicleType;
  }
  
  startTracking() {
    Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 1000,  // Every second
        distanceInterval: 10, // Or every 10 meters
      },
      (location) => {
        this.trace.push({
          lat: location.coords.latitude,
          lon: location.coords.longitude,
          timestamp: location.timestamp,
        });
      }
    );
  }
  
  async stopAndUpload() {
    if (this.trace.length < 2) return;
    
    const result = await recordTrace(
      this.routeId,
      this.vehicleType,
      this.trace
    );
    
    if (result.data.warnings.length > 0) {
      console.warn('GPS tracking warnings:', result.data.warnings);
    }
    
    return result;
  }
}
```

---

## 5. Data Models & TypeScript Interfaces

### 5.1 Complete Type Definitions

```typescript
// src/types/api.types.ts

// ============================================================================
// Coordinates
// ============================================================================

export interface Coordinate {
  lat: number;
  lon: number;
}

export type GeoJSONCoordinate = [number, number]; // [longitude, latitude]

// ============================================================================
// Vehicle Types
// ============================================================================

export type VehicleType = 
  | 'jeep' 
  | 'jeepney' 
  | 'bus' 
  | 'bus_aircon' 
  | 'uv' 
  | 'tricycle' 
  | 'cab';

// ============================================================================
// Search
// ============================================================================

export interface SearchRequest {
  origin: Coordinate;
  destination: Coordinate;
  mode?: OptimizationMode;
  maxResults?: number;
  maxWalkingKm?: number;
}

export type OptimizationMode = 'TIME' | 'FARE' | 'DISTANCE';

export interface SearchResponse {
  success: boolean;
  data: {
    routes: RouteResult[];
    alternatives: AlternativeOptions;
    summary: SearchSummary;
  };
}

// ============================================================================
// Route Result
// ============================================================================

export interface RouteResult {
  rank: number;
  summary: RouteSummary;
  segments: Segment[];
}

export interface RouteSummary {
  totalTimeMinutes: number;
  totalFare: number;
  totalDistanceKm: number;
  transferCount: number;
}

export type SegmentType = 'WALK' | 'TRANSIT' | 'TRANSFER';

export interface Segment {
  type: SegmentType;
  distanceKm: number;
  timeMinutes: number;
  from: Coordinate;
  to: Coordinate;
  
  // Transit-specific
  routeId?: string;
  routeName?: string;
  vehicleType?: VehicleType;
  signboard?: string;
  fare?: number;
  boardAt?: Coordinate;
  alightAt?: Coordinate;
  
  // Map rendering
  polyline?: GeoJSONCoordinate[];
  
  // Instructions
  instruction?: string;
}

// ============================================================================
// Alternatives
// ============================================================================

export interface AlternativeOptions {
  walkingOption: WalkingOption | null;
  nearbyOriginStops: NearbyStop[];
  nearbyDestinationStops: NearbyStop[];
  message: string;
}

export interface WalkingOption {
  available: boolean;
  distanceKm: number;
  timeMinutes: number;
  message: string;
  polyline?: GeoJSONCoordinate[];
}

export interface NearbyStop {
  nodeId: string;
  lat: number;
  lon: number;
  distanceKm: number;
  distanceMeters: number;
  isTerminal: boolean;
  routes: RouteInfo[];
}

export interface RouteInfo {
  routeId: string;
  routeName: string;
  vehicleType: VehicleType;
  signboard: string;
}

// ============================================================================
// Health & Status
// ============================================================================

export type ServiceStatus = 'ready' | 'initializing' | 'failed';

export interface HealthResponse {
  status: ServiceStatus;
  environment: string; // 'development' | 'production'
  services: {
    mongodb: { connected: boolean };
    graphService: {
      initialized: boolean;
      nodeCount: number;
      routeCount: number;
    };
  };
  uptime: number;
  timestamp: string;
}

// ============================================================================
// Error Responses
// ============================================================================

export interface ApiError {
  success: false;
  error: ErrorCode;
  message: string;
  details?: string;
}

export type ErrorCode = 
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'NO_ROUTE_FOUND'
  | 'SERVICE_UNAVAILABLE'
  | 'SERVICE_INITIALIZING'
  | 'UNAUTHORIZED'
  | 'SERVER_ERROR';
```

---

## 6. Integration Patterns

### 6.1 API Service Class

```typescript
// src/services/api.service.ts

import { API_CONFIG, ENDPOINTS } from '../config/api.config';
import type {
  SearchRequest,
  SearchResponse,
  HealthResponse,
  ApiError,
} from '../types/api.types';

class ApiService {
  private baseUrl: string;
  private authToken: string | null = null;
  
  constructor() {
    this.baseUrl = API_CONFIG.BASE_URL;
  }
  
  setAuthToken(token: string) {
    this.authToken = token;
  }
  
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(this.authToken && { 'Authorization': `Bearer ${this.authToken}` }),
      ...options.headers,
    };
    
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new ApiServiceError(data as ApiError);
    }
    
    return data as T;
  }
  
  // Health Check
  async checkHealth(): Promise<HealthResponse> {
    return this.request<HealthResponse>(ENDPOINTS.HEALTH);
  }
  
  // Route Search
  async searchRoutes(request: SearchRequest): Promise<SearchResponse> {
    return this.request<SearchResponse>(ENDPOINTS.SEARCH, {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }
  
  // Get Routes List
  async getRoutes(filters?: { vehicleType?: string; direction?: string }) {
    const params = new URLSearchParams(filters as Record<string, string>);
    return this.request(`${ENDPOINTS.ROUTES}?${params}`);
  }
  
  // Find Nearby Stops
  async findNearbyStops(lat: number, lon: number, radius = 0.5) {
    return this.request(
      `${ENDPOINTS.NEARBY}?lat=${lat}&lon=${lon}&radius=${radius}`
    );
  }
  
  // Calculate Fare
  async calculateFare(vehicleType: string, distanceKm: number) {
    return this.request(
      `${ENDPOINTS.FARE}?vehicleType=${vehicleType}&distanceKm=${distanceKm}`
    );
  }
  
  // Record GPS Trace
  async recordGPSTrace(
    routeId: string,
    vehicleType: string,
    trace: Array<{ lat: number; lon: number; timestamp: number }>
  ) {
    return this.request(ENDPOINTS.STOPWATCH, {
      method: 'POST',
      body: JSON.stringify({ routeId, vehicleType, trace }),
    });
  }
}

class ApiServiceError extends Error {
  code: string;
  details?: string;
  
  constructor(error: ApiError) {
    super(error.message);
    this.code = error.error;
    this.details = error.details;
  }
}

export const apiService = new ApiService();
export { ApiServiceError };
```

### 6.2 React Hook Pattern

```typescript
// src/hooks/useRouteSearch.ts

import { useState, useCallback } from 'react';
import { apiService } from '../services/api.service';
import type { SearchRequest, SearchResponse, RouteResult } from '../types/api.types';

interface UseRouteSearchResult {
  search: (request: SearchRequest) => Promise<void>;
  routes: RouteResult[];
  alternatives: SearchResponse['data']['alternatives'] | null;
  isLoading: boolean;
  error: string | null;
}

export const useRouteSearch = (): UseRouteSearchResult => {
  const [routes, setRoutes] = useState<RouteResult[]>([]);
  const [alternatives, setAlternatives] = useState<SearchResponse['data']['alternatives'] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const search = useCallback(async (request: SearchRequest) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await apiService.searchRoutes(request);
      setRoutes(response.data.routes);
      setAlternatives(response.data.alternatives);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
      setRoutes([]);
      setAlternatives(null);
    } finally {
      setIsLoading(false);
    }
  }, []);
  
  return { search, routes, alternatives, isLoading, error };
};
```

### 6.3 Map Integration Pattern

```typescript
// src/components/RouteMap.tsx

import React from 'react';
import MapView, { Polyline, Marker } from 'react-native-maps';
import type { Segment, Coordinate } from '../types/api.types';

interface RouteMapProps {
  segments: Segment[];
  origin: Coordinate;
  destination: Coordinate;
}

const SEGMENT_COLORS = {
  WALK: '#4CAF50',      // Green for walking
  TRANSIT: '#2196F3',   // Blue for transit
  TRANSFER: '#FF9800',  // Orange for transfer
};

export const RouteMap: React.FC<RouteMapProps> = ({
  segments,
  origin,
  destination,
}) => {
  return (
    <MapView
      style={{ flex: 1 }}
      initialRegion={{
        latitude: origin.lat,
        longitude: origin.lon,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      }}
    >
      {/* Origin Marker */}
      <Marker
        coordinate={{ latitude: origin.lat, longitude: origin.lon }}
        title="Start"
        pinColor="green"
      />
      
      {/* Destination Marker */}
      <Marker
        coordinate={{ latitude: destination.lat, longitude: destination.lon }}
        title="End"
        pinColor="red"
      />
      
      {/* Route Segments */}
      {segments.map((segment, index) => (
        <React.Fragment key={index}>
          {/* Segment Polyline */}
          {segment.polyline && (
            <Polyline
              coordinates={segment.polyline.map(([lon, lat]) => ({
                latitude: lat,
                longitude: lon,
              }))}
              strokeColor={SEGMENT_COLORS[segment.type]}
              strokeWidth={4}
            />
          )}
          
          {/* Board/Alight Markers for Transit */}
          {segment.type === 'TRANSIT' && segment.boardAt && (
            <Marker
              coordinate={{
                latitude: segment.boardAt.lat,
                longitude: segment.boardAt.lon,
              }}
              title={`Board: ${segment.signboard}`}
              description={segment.routeName}
            />
          )}
        </React.Fragment>
      ))}
    </MapView>
  );
};
```

---

## 7. Error Handling

### 7.1 Error Codes Reference

| Code | HTTP Status | Description | User Action |
|------|-------------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid request parameters | Fix input and retry |
| `UNAUTHORIZED` | 401 | Missing or invalid token | Re-authenticate |
| `NOT_FOUND` | 404 | Resource not found | Check ID/parameters |
| `NO_ROUTE_FOUND` | 200 | No routes between points | Show alternatives |
| `SERVICE_INITIALIZING` | 503 | Services starting up | Wait and retry |
| `SERVICE_UNAVAILABLE` | 503 | Services failed to start | Contact support |
| `SERVER_ERROR` | 500 | Internal error | Retry or report bug |

### 7.2 Error Handling Pattern

```typescript
// src/utils/errorHandler.ts

import { ApiServiceError } from '../services/api.service';

export const handleApiError = (error: unknown): string => {
  if (error instanceof ApiServiceError) {
    switch (error.code) {
      case 'SERVICE_INITIALIZING':
        return 'Server is starting up. Please wait a moment...';
      case 'SERVICE_UNAVAILABLE':
        return 'Service temporarily unavailable. Please try again later.';
      case 'VALIDATION_ERROR':
        return 'Invalid input. Please check your search parameters.';
      case 'UNAUTHORIZED':
        return 'Session expired. Please log in again.';
      default:
        return error.message;
    }
  }
  
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return 'Network error. Please check your connection.';
  }
  
  return 'An unexpected error occurred.';
};
```

---

## 8. Real-Time Features

### 8.1 GPS Tracking for Stopwatch

```typescript
// src/hooks/useGPSTracking.ts

import { useState, useRef, useCallback, useEffect } from 'react';
import * as Location from 'expo-location';
import { apiService } from '../services/api.service';

interface GPSPoint {
  lat: number;
  lon: number;
  timestamp: number;
}

export const useGPSTracking = (routeId: string, vehicleType: string) => {
  const [isTracking, setIsTracking] = useState(false);
  const [pointCount, setPointCount] = useState(0);
  const traceRef = useRef<GPSPoint[]>([]);
  const subscriptionRef = useRef<Location.LocationSubscription | null>(null);
  
  const startTracking = useCallback(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      throw new Error('Location permission denied');
    }
    
    traceRef.current = [];
    setPointCount(0);
    
    subscriptionRef.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 1000,  // Every 1 second
        distanceInterval: 5, // Or every 5 meters
      },
      (location) => {
        const point: GPSPoint = {
          lat: location.coords.latitude,
          lon: location.coords.longitude,
          timestamp: location.timestamp,
        };
        traceRef.current.push(point);
        setPointCount(prev => prev + 1);
      }
    );
    
    setIsTracking(true);
  }, []);
  
  const stopTracking = useCallback(async () => {
    if (subscriptionRef.current) {
      subscriptionRef.current.remove();
      subscriptionRef.current = null;
    }
    
    setIsTracking(false);
    
    if (traceRef.current.length < 2) {
      return { recorded: 0, warnings: ['Not enough GPS points collected'] };
    }
    
    // Upload trace to backend
    const result = await apiService.recordGPSTrace(
      routeId,
      vehicleType,
      traceRef.current
    );
    
    return result.data;
  }, [routeId, vehicleType]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current.remove();
      }
    };
  }, []);
  
  return {
    isTracking,
    pointCount,
    startTracking,
    stopTracking,
  };
};
```

---

## 9. Testing & Debugging

### 9.1 API Testing Checklist

| Test Case | Endpoint | Expected Result |
|-----------|----------|-----------------|
| Server ready | `GET /api/health` | `status: "ready"` |
| Valid search | `POST /api/commutes/search` | Routes array (may be empty) |
| Invalid coords | `POST /api/commutes/search` | `400 VALIDATION_ERROR` |
| No auth token | `POST /api/commutes/search` | `401 UNAUTHORIZED` |
| No routes found | Search in uncovered area | `200` with alternatives |
| Nearby stops | `GET /api/commutes/nearby` | Array of stops |

### 9.2 Debug Mode

```typescript
// Enable verbose logging in development
const DEBUG = __DEV__;

const logRequest = (endpoint: string, data: any) => {
  if (DEBUG) {
    console.log(`[API Request] ${endpoint}`, JSON.stringify(data, null, 2));
  }
};

const logResponse = (endpoint: string, data: any) => {
  if (DEBUG) {
    console.log(`[API Response] ${endpoint}`, JSON.stringify(data, null, 2));
  }
};
```

---

## 10. Migration Guide

### 10.1 From Legacy Search API

**Old (v1):**
```typescript
// Legacy spatial filter approach
POST /api/routes/search
{ origin: [120.94, 14.42], destination: [120.97, 14.38] }
```

**New (v2 - Phase 4):**
```typescript
// A* pathfinding approach
POST /api/commutes/search
{
  origin: { lat: 14.42, lon: 120.94 },
  destination: { lat: 14.38, lon: 120.97 },
  mode: 'TIME'
}
```

**Key Differences:**
| Aspect | v1 (Legacy) | v2 (Phase 4) |
|--------|-------------|--------------|
| Coordinate format | `[lon, lat]` array | `{lat, lon}` object |
| Algorithm | Buffer-based | A* pathfinding |
| Transfers | Basic intersection | Multi-hop optimization |
| Response | Direct/transfer routes | Ranked alternatives |

---

## 11. FAQ & Troubleshooting

### Q1: Getting 503 SERVICE_INITIALIZING on startup?
**A:** The backend needs 2-3 seconds to load the road network graph. Implement retry logic:
```typescript
// Wait for server with exponential backoff
```

### Q2: Search returns empty routes but I know routes exist?
**A:** Check:
1. Origin/destination within Cavite coverage area
2. Coordinates in correct format `{lat, lon}` not `[lon, lat]`
3. `maxWalkingKm` not too restrictive

### Q3: GPS trace returns many warnings?
**A:** Common causes:
1. Low GPS accuracy - use `Location.Accuracy.BestForNavigation`
2. User is far from any road - expected in some areas
3. Timestamp gaps > 1 hour between points

### Q4: How to test without real GPS?
**A:** Use mock trace data:
```typescript
const mockTrace = [
  { lat: 14.4207, lon: 120.9407, timestamp: Date.now() - 60000 },
  { lat: 14.4210, lon: 120.9410, timestamp: Date.now() - 30000 },
  { lat: 14.4215, lon: 120.9415, timestamp: Date.now() },
];
```

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-01-15 | Backend Team | Initial Phase 4 documentation |

---

**End of Document**
