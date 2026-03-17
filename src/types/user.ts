/**
 * User Types
 * 
 * TypeScript interfaces for user preferences and saved trips.
 * Used for Firestore document structure at `users/{uid}`.
 * 
 * @module types/user
 */

// =============================================================================
// Saved Trip Types
// =============================================================================

/**
 * Coordinate pair for origin/destination
 */
export interface TripCoordinates {
  lat: number;
  lng: number;
}

/**
 * A saved trip/route that the user frequently takes
 */
export interface SavedTrip {
  /** Unique trip identifier */
  id: string;
  /** User-friendly label (e.g., "Home", "Work", "School") */
  label: string;
  /** Origin location name (e.g., "Imus") */
  origin: string;
  /** Destination location name (e.g., "Bacoor") */
  destination: string;
  /** Coordinate data for origin and destination */
  coordinates: {
    origin: TripCoordinates;
    destination: TripCoordinates;
  };
  /** Icon type for display */
  iconType?: 'home' | 'work' | 'school' | 'custom';
  /** Timestamp when the trip was saved */
  createdAt?: Date | number;
}

// =============================================================================
// Places Discovered Types
// =============================================================================

/**
 * Recent activity entry for places discovered
 */
export interface RecentActivity {
  /** Place/location name */
  placeName: string;
  /** Timestamp of the activity */
  timestamp: number;
  /** Type of activity */
  activityType: 'visited' | 'searched' | 'saved';
}

/**
 * Places discovered tracking
 */
export interface PlacesDiscovered {
  /** Number of places discovered this month */
  thisMonth: number;
  /** Most frequently visited area */
  topArea: string;
  /** Recent activities (last 10) */
  recentActivities: RecentActivity[];
  /** Total places ever discovered */
  totalPlaces: number;
  /** Last reset date for monthly counter (ISO string) */
  monthlyResetDate: string;
}

// =============================================================================
// User Level Types
// =============================================================================

/**
 * User level and experience tracking
 */
export interface UserLevel {
  /** Current user level */
  currentLevel: number;
  /** Current experience points */
  exp: number;
  /** Experience needed for next level */
  expToNextLevel: number;
}

/**
 * Level thresholds - EXP required for each level
 */
export const LEVEL_THRESHOLDS: Record<number, number> = {
  1: 0,      // Level 1: 0 EXP (starting level)
  2: 150,    // Level 2: 150 EXP
  3: 400,    // Level 3: 400 EXP
  4: 750,    // Level 4: 750 EXP
  5: 1200,   // Level 5: 1200 EXP
  6: 1800,   // Level 6: 1800 EXP
  7: 2500,   // Level 7: 2500 EXP
  8: 3400,   // Level 8: 3400 EXP
  9: 4500,   // Level 9: 4500 EXP
  10: 6000,  // Level 10: 6000 EXP (Max level)
};

/**
 * Calculate user level from EXP
 * @param exp - Current experience points
 * @returns Current level based on EXP
 */
export const calculateLevelFromExp = (exp: number): number => {
  let level = 1;
  for (const [lvl, threshold] of Object.entries(LEVEL_THRESHOLDS)) {
    if (exp >= threshold) {
      level = parseInt(lvl, 10);
    } else {
      break;
    }
  }
  return Math.min(level, 10); // Max level is 10
};

/**
 * Get EXP required for next level
 * @param currentLevel - Current user level
 * @returns EXP needed for next level, or 0 if max level
 */
export const getExpToNextLevel = (currentLevel: number): number => {
  const nextLevel = currentLevel + 1;
  if (nextLevel > 10) return 0; // Max level reached
  return LEVEL_THRESHOLDS[nextLevel] || 0;
};

/**
 * Get level progress percentage
 * @param exp - Current EXP
 * @param currentLevel - Current level
 * @returns Progress percentage (0-100)
 */
export const getLevelProgress = (exp: number, currentLevel: number): number => {
  if (currentLevel >= 10) return 100; // Max level
  
  const currentThreshold = LEVEL_THRESHOLDS[currentLevel] || 0;
  const nextThreshold = LEVEL_THRESHOLDS[currentLevel + 1] || currentThreshold;
  const expInLevel = exp - currentThreshold;
  const expNeeded = nextThreshold - currentThreshold;
  
  return Math.min(Math.floor((expInLevel / expNeeded) * 100), 100);
};

// =============================================================================
// User Statistics Types
// =============================================================================

/**
 * User statistics
 */
export interface UserStats {
  /** Total distance traveled in kilometers */
  distanceTraveled: number;
  /** Number of PUV (Public Utility Vehicle) entries */
  puvEntered: number;
  /** Total trips completed */
  tripsCompleted: number;
  /** Total routes searched */
  routesSearched: number;
}

// =============================================================================
// Achievement Types
// =============================================================================

/**
 * Basic achievement descriptor
 */
export interface Achievement {
  id: string;
  title: string;
  description?: string;
  icon?: string;
}

// =============================================================================
// User Preferences Types
// =============================================================================

/**
 * User preferences stored in Firestore at `users/{uid}`
 * 
 * This document contains all user-specific data including:
 * - Profile information
 * - Saved trips/routes
 * - Search history
 * - Usage statistics
 * - Places discovered
 * - User level & achievements
 */
export interface UserPreferences {
  /** User's Firebase UID */
  uid: string;
  /** User's display name/username */
  username: string;
  /** User's phone number */
  phoneNumber: string;
  /** Array of saved trips/routes */
  savedTrips: SavedTrip[];
  /** Array of recent search queries */
  searchHistory: string[];
  /** User statistics */
  stats: UserStats;
  /** Places discovered tracking */
  placesDiscovered: PlacesDiscovered;
  /** User level and experience */
  userLevel: UserLevel;
  /** Array of unlocked achievement IDs */
  achievementIds: string[];
}

// =============================================================================
// Default Values
// =============================================================================

/**
 * Get current month reset date (first day of current month)
 */
const getCurrentMonthResetDate = (): string => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
};

/**
 * Default user preferences for new users
 */
export const DEFAULT_USER_PREFERENCES: Omit<UserPreferences, 'uid'> = {
  username: '',
  phoneNumber: '',
  savedTrips: [],
  searchHistory: [],
  stats: {
    distanceTraveled: 0,
    puvEntered: 0,
    tripsCompleted: 0,
    routesSearched: 0,
  },
  placesDiscovered: {
    thisMonth: 0,
    topArea: '',
    recentActivities: [],
    totalPlaces: 0,
    monthlyResetDate: getCurrentMonthResetDate(),
  },
  userLevel: {
    currentLevel: 1,
    exp: 0,
    expToNextLevel: 150,
  },
  achievementIds: [],
};

/**
 * Create default preferences for a new user
 * @param uid - User's Firebase UID
 * @returns Default UserPreferences object
 */
export const createDefaultPreferences = (uid: string): UserPreferences => ({
  uid,
  ...DEFAULT_USER_PREFERENCES,
  placesDiscovered: {
    ...DEFAULT_USER_PREFERENCES.placesDiscovered,
    monthlyResetDate: getCurrentMonthResetDate(),
  },
});
