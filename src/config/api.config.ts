/**
 * API Configuration
 * 
 * Centralized configuration for backend API communication.
 * Handles environment detection, base URLs, timeouts, and endpoints.
 * 
 * ⚠️ This configuration is for API REQUESTS only.
 * It does NOT affect database storage or Firebase/Firestore.
 * 
 * @module config/api.config
 * @version 1.0.0
 * @see docs/backend/FRONTEND_INTEGRATION_MANUAL.md (Section 1.1)
 */

import Constants from 'expo-constants';

// =============================================================================
// Environment Detection
// =============================================================================

/**
 * Detect if running in development mode
 */
const isDevelopment = __DEV__;

/**
 * Get the API environment
 * Priority: ENV variable > EAS build profile > __DEV__ check
 */
const getApiEnvironment = (): 'development' | 'production' => {
  // Check EAS build profile first
  const extra = Constants.expoConfig?.extra;
  if (extra?.eas?.buildProfile === 'production') {
    return 'production';
  }
  
  // Fall back to __DEV__ check
  return isDevelopment ? 'development' : 'production';
};

const API_ENVIRONMENT = getApiEnvironment();

// =============================================================================
// Base URL Configuration
// =============================================================================

/**
 * Production API URL (Render deployment)
 * This is the live backend server
 */
const PRODUCTION_URL = 'https://para-rwnn.onrender.com';

/**
 * Development API URLs for different platforms
 * - Android Emulator: 10.0.2.2 maps to host machine's localhost
 * - iOS Simulator: localhost works directly
 * - Physical device: Use your machine's local IP or ngrok tunnel
 */
const DEVELOPMENT_URLS = {
  android: 'http://10.0.2.2:5000',
  ios: 'http://localhost:5000',
  default: 'http://localhost:5000',
} as const;

/**
 * Get the appropriate development URL based on platform
 */
const getDevelopmentUrl = (): string => {
  // Check for custom URL from environment variable
  // Use EXPO_PUBLIC_ prefix for Expo compatibility
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl) {
    return envUrl;
  }
  
  // Default to localhost (works for most dev scenarios)
  return DEVELOPMENT_URLS.default;
};

/**
 * Get the base URL based on environment
 */
const getBaseUrl = (): string => {
  // Allow environment variable override in any environment
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl) {
    return envUrl;
  }
  
  return API_ENVIRONMENT === 'production' ? PRODUCTION_URL : getDevelopmentUrl();
};

// =============================================================================
// API Configuration Export
// =============================================================================

/**
 * Main API configuration object
 * Use this for all backend communication settings
 */
export const API_CONFIG = {
  /**
   * Base URL for all API requests
   * Points to Render production or local dev server
   */
  BASE_URL: getBaseUrl(),
  
  /**
   * Request timeout in milliseconds
   * Set to 30 seconds to handle Render free tier "cold start" delays
   * First request after inactivity can take 30-45 seconds
   */
  TIMEOUT: 30000,
  
  /**
   * Number of retry attempts for failed requests
   */
  RETRY_ATTEMPTS: 3,
  
  /**
   * Delay between retry attempts in milliseconds
   */
  RETRY_DELAY: 1000,
  
  /**
   * Current environment
   */
  ENVIRONMENT: API_ENVIRONMENT,
} as const;

// =============================================================================
// API Endpoints
// =============================================================================

/**
 * All backend API endpoints
 * Matches the routes defined in backend/routes/commuteRoutes.js
 * 
 * @see docs/backend/FRONTEND_INTEGRATION_MANUAL.md (Section 4)
 */
export const ENDPOINTS = {
  // ===== Health & Status =====
  /** Server health check - GET */
  HEALTH: '/api/health',
  
  // ===== Route Search (Phase 4 - A* Pathfinding) =====
  /** Search for routes between two points - POST */
  SEARCH: '/api/commutes/search',
  
  /** List all transit routes - GET */
  ROUTES: '/api/commutes/routes',
  
  /** Find nearby stops - GET */
  NEARBY: '/api/commutes/nearby',
  
  /** Get routing configuration - GET */
  CONFIG: '/api/commutes/config',
  
  /** Calculate fare - GET */
  FARE: '/api/commutes/fare',
  
  // ===== Stopwatch & Tracking =====
  /** Record GPS trace data - POST */
  STOPWATCH: '/api/commutes/stopwatch',
  
  // ===== Legacy Endpoints =====
  /** Commute sessions - GET/POST */
  COMMUTES: '/api/commutes',
} as const;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Build a full API URL from an endpoint
 * @param endpoint - The endpoint path (e.g., ENDPOINTS.SEARCH)
 * @returns Full URL (e.g., https://para-rwnn.onrender.com/api/commutes/search)
 */
export const buildUrl = (endpoint: string): string => {
  return `${API_CONFIG.BASE_URL}${endpoint}`;
};

/**
 * Build a URL with query parameters
 * @param endpoint - The endpoint path
 * @param params - Query parameters object
 * @returns Full URL with query string
 */
export const buildUrlWithParams = (
  endpoint: string,
  params: Record<string, string | number | boolean>
): string => {
  const url = buildUrl(endpoint);
  const searchParams = new URLSearchParams();
  
  Object.entries(params).forEach(([key, value]) => {
    searchParams.append(key, String(value));
  });
  
  const queryString = searchParams.toString();
  return queryString ? `${url}?${queryString}` : url;
};

// =============================================================================
// Type Exports
// =============================================================================

/**
 * Type for endpoint keys
 */
export type EndpointKey = keyof typeof ENDPOINTS;

/**
 * Type for the API config
 */
export type ApiConfigType = typeof API_CONFIG;

// =============================================================================
// Console Log Verification (Development only)
// =============================================================================

if (__DEV__) {
  console.log('🔌 [api.config.ts] API Configuration loaded');
  console.log(`   Environment: ${API_CONFIG.ENVIRONMENT}`);
  console.log(`   Base URL: ${API_CONFIG.BASE_URL}`);
  console.log(`   Timeout: ${API_CONFIG.TIMEOUT}ms`);
}
