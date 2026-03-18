/**
 * Global Constants
 * 
 * Centralized configuration for app-wide constants including
 * legal URLs, API endpoints, and other shared values.
 * 
 * @module config/constants
 */

import Constants from 'expo-constants';

// =============================================================================
// Environment Detection
// =============================================================================

/**
 * Detect the current runtime environment
 * - 'development': Local dev build (expo start)
 * - 'tunnel': Expo tunnel mode (--tunnel flag)
 * - 'preview': EAS preview/development builds
 * - 'production': EAS production builds / Expo Cloud
 */
const getEnvironment = (): 'development' | 'tunnel' | 'preview' | 'production' => {
  // Check for EAS build profiles via extra config
  const extra = Constants.expoConfig?.extra;
  if (extra?.eas?.buildProfile) {
    const profile = extra.eas.buildProfile as string;
    if (profile === 'production') return 'production';
    if (profile === 'preview') return 'preview';
  }
  
  // Check if running in Expo Go or dev client
  if (__DEV__) {
    // Check for tunnel mode via manifest hostUri
    const hostUri = Constants.expoConfig?.hostUri || '';
    if (hostUri.includes('.ngrok') || hostUri.includes('tunnel')) {
      return 'tunnel';
    }
    return 'development';
  }
  
  return 'production';
};

export const ENVIRONMENT = getEnvironment();

// =============================================================================
// API Configuration
// =============================================================================

/**
 * API endpoint URLs based on environment
 * Supports local development, tunnel mode, and production deployments
 */
const API_URLS: Record<typeof ENVIRONMENT, string> = {
  // Local development - use localhost
  development: 'http://localhost:5000',
  // Tunnel mode - use ngrok URL (update this when tunnel starts)
  tunnel: 'http://localhost:5000', // Will work via Expo proxy
  // EAS Preview builds
  preview: 'https://para-api-preview.onrender.com', // TODO: Update with actual preview URL
  // Production builds
  production: 'https://para-api.onrender.com', // TODO: Update with actual production URL
};

/**
 * Current API base URL based on detected environment
 */
export const API_BASE_URL = API_URLS[ENVIRONMENT];

/**
 * API endpoints
 */
export const API_ENDPOINTS = {
  /** Health check */
  HEALTH: '/api/health',
  /** Routes search */
  ROUTES_SEARCH: '/api/routes/search',
  /** Get all routes */
  ROUTES: '/api/routes',
  /** Get single route by ID */
  ROUTE_BY_ID: (routeId: string) => `/api/routes/${routeId}`,
  /** Stops endpoints */
  STOPS: '/api/stops',
  /** Commute history */
  COMMUTES: '/api/commutes',
} as const;

/**
 * API request configuration
 */
export const API_CONFIG = {
  /** Request timeout in milliseconds */
  TIMEOUT: 10000,
  /** Retry attempts for failed requests */
  RETRY_ATTEMPTS: 3,
  /** Delay between retries in milliseconds */
  RETRY_DELAY: 1000,
} as const;

/**
 * Map tile configuration
 * Use EXPO_PUBLIC_OSM_TILE_URL to switch providers (MapTiler/Stadia/OpenMapTiles)
 */
export const MAP_CONFIG = {
  OSM_TILE_URL:
    process.env.EXPO_PUBLIC_OSM_TILE_URL ||
    'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  OSM_ATTRIBUTION: '© OpenStreetMap contributors',
} as const;

/**
 * Geocoding configuration
 * Use EXPO_PUBLIC_GEOCODING_BASE_URL to point to your backend geocoding proxy.
 */
export const GEOCODING_CONFIG = {
  BASE_URL:
    process.env.EXPO_PUBLIC_GEOCODING_BASE_URL ||
    'https://nominatim.openstreetmap.org',
  SEARCH_PATH: '/search',
  REVERSE_PATH: '/reverse',
  COUNTRY_CODE: 'ph',
  VIEWBOX: '116.0,4.5,127.0,21.5',
  MIN_QUERY_LENGTH: 2,
  MAX_RESULTS: 10,
  ACCEPT_LANGUAGE: 'en',
} as const;

// =============================================================================
// Fare Configuration (Fetched defaults - backend is source of truth)
// =============================================================================

/**
 * Default fare rates - used as fallback when backend is unavailable
 * Backend response should always override these values
 */
export const DEFAULT_FARE_RATES = {
  /** Base fare in PHP */
  BASE_FARE: 13,
  /** Distance covered by base fare in km */
  BASE_DISTANCE_KM: 4,
  /** Additional fare per km after base distance */
  ADDITIONAL_RATE_PER_KM: 1.80,
} as const;

// =============================================================================
// Legal URLs
// =============================================================================

/**
 * Legal document URLs for the Para app.
 * Used across LoginScreen, CompleteDetailsScreen, and SettingsScreen.
 */
export const LEGAL_URLS = {
  /** Privacy Policy document URL */
  PRIVACY_POLICY: 'https://github.com/noxen-cv/Para/wiki/Privacy-Policy',
  /** Terms of Service document URL */
  TERMS_OF_SERVICE: 'https://github.com/noxen-cv/Para/wiki/Terms-of-Services',
} as const;

// =============================================================================
// App Configuration
// =============================================================================

/**
 * App-wide configuration constants
 */
export const APP_CONFIG = {
  /** App name */
  APP_NAME: 'Para',
  /** Support email */
  SUPPORT_EMAIL: 'support@para.app',
} as const;

// =============================================================================
// Validation Rules
// =============================================================================

/**
 * Input validation rules
 */
export const VALIDATION = {
  /** Minimum username length */
  USERNAME_MIN_LENGTH: 3,
  /** Maximum username length */
  USERNAME_MAX_LENGTH: 20,
  /** Phone number length (excluding country code) */
  PHONE_NUMBER_LENGTH: 10,
} as const;
