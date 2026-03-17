/**
 * Services Index
 * 
 * Central export for all application services.
 * Import from here: `import { apiService, searchRoutesFromApi } from '@/services'`
 * 
 * @module services/index
 */

// =============================================================================
// API Service (Production Backend)
// =============================================================================
export { apiService, ApiServiceError } from './api.service';

// =============================================================================
// Route Search
// =============================================================================
export { 
  searchRoutesFromApi, 
  checkApiHealth,
  searchRoutes,
  geocodeLocation,
  reverseGeocode,
  getSupportedLocations,
  IMUS_CENTER,
} from './routeSearch';

// =============================================================================
// Authentication
// =============================================================================
export {
  validatePhoneNumber,
  formatPhoneDisplay,
  validateOTPCode,
  signInWithPhoneNumber,
  confirmCode,
  signOut as authSignOut,
  getCurrentUser,
  onAuthStateChanged,
  PH_COUNTRY_CODE,
  PH_PHONE_LENGTH,
  OTP_LENGTH,
} from './auth';

// =============================================================================
// User Preferences
// =============================================================================
export {
  initializeUserPreferences,
  getUserPreferences,
  addSavedTrip,
  removeSavedTrip,
  addSearchHistory,
  clearSearchHistory,
  generateTripId,
} from './preferences';

// =============================================================================
// Achievements
// =============================================================================
export { ACHIEVEMENTS_LIST, checkAchievements } from './achievements';

// =============================================================================
// Fare Calculation
// =============================================================================
export { calculateFareBetween } from './fareService';

// =============================================================================
// Console Log Verification (Development only)
// =============================================================================

if (__DEV__) {
  console.log('✅ [services/index.ts] Services index loaded');
}
