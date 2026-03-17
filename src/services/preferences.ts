/**
 * Preferences Service
 * 
 * Handles user preferences stored in Firestore at `users/{uid}`.
 * Provides functions to initialize, fetch, and update user preferences
 * including saved trips, search history, places discovered, user level, and achievements.
 * 
 * @module services/preferences
 */

import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  arrayUnion, 
  arrayRemove, 
  increment, 
  serverTimestamp 
} from 'firebase/firestore';
import { firestore } from '../config/firebase';
import {
  UserPreferences,
  SavedTrip,
  RecentActivity,
  PlacesDiscovered,
  UserLevel,
  createDefaultPreferences,
  calculateLevelFromExp,
  getExpToNextLevel,
  DEFAULT_USER_PREFERENCES,
} from '../types/user';
import { getAchievementById, ACHIEVEMENTS } from '../data/achievements';

// =============================================================================
// Constants
// =============================================================================

/** Firestore collection name for users */
const USERS_COLLECTION = 'users';

/** Maximum number of search history items to keep */
const MAX_SEARCH_HISTORY = 20;

// =============================================================================
// Initialization Functions
// =============================================================================

/**
 * Initialize user preferences document in Firestore
 * 
 * Checks if the document `users/{uid}` exists. If not, creates it with default values.
 * This should be called when a user logs in to ensure their preferences document exists.
 * 
 * @param uid - User's Firebase UID
 * @returns Promise that resolves when initialization is complete
 * 
 * @example
 * ```ts
 * // In onAuthStateChanged callback
 * if (user) {
 *   await initializeUserPreferences(user.uid);
 * }
 * ```
 */
export const initializeUserPreferences = async (uid: string): Promise<void> => {
  try {
      const userRef = doc(firestore, USERS_COLLECTION, uid);
      const userDoc = await getDoc(userRef);

      if (!userDoc.exists()) {
        console.log('[PreferencesService] Creating default preferences for:', uid);
        
        const defaultPrefs = createDefaultPreferences(uid);
        
        await setDoc(userRef, {
          ...defaultPrefs,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }, { merge: true });
      
      // ✅ Success log for debugging - New preferences created
      console.log('\n╔═══════════════════════════════════════════════════════════════════╗');
      console.log('║          🆕 NEW USER PREFERENCES INITIALIZED 🆕                    ║');
      console.log('╠═══════════════════════════════════════════════════════════════════╣');
      console.log('║  User UID:', uid.padEnd(55), '║');
      console.log('╠───────────────────────────────────────────────────────────────────╣');
      console.log('║  📍 Saved Trips: 0                                                ║');
      console.log('║  🔍 Search History: 0                                             ║');
      console.log('║  🗺️  Places Discovered: 0 (This Month: 0)                          ║');
      console.log('║  ⭐ Level: 1 (EXP: 0/150)                                          ║');
      console.log('║  🏆 Achievements: 0                                                ║');
      console.log('║  📊 Stats: Fresh start!                                           ║');
      console.log('╚═══════════════════════════════════════════════════════════════════╝\n');
      
      console.log('[PreferencesService] Default preferences created');
    } else {
      console.log('[PreferencesService] Preferences document already exists for:', uid);
      
      // Ensure all fields exist (migration for existing users)
      const data = userDoc.data();
      const updates: Record<string, unknown> = {};
      
      if (!data?.savedTrips) {
        updates.savedTrips = [];
      }
      if (!data?.searchHistory) {
        updates.searchHistory = [];
      }
      if (!data?.stats) {
        updates.stats = DEFAULT_USER_PREFERENCES.stats;
      } else {
        // Ensure new stats fields exist
        if (data.stats.tripsCompleted === undefined) {
          updates['stats.tripsCompleted'] = 0;
        }
        if (data.stats.routesSearched === undefined) {
          updates['stats.routesSearched'] = 0;
        }
      }
      // Migration: Add placesDiscovered if missing
      if (!data?.placesDiscovered) {
        updates.placesDiscovered = DEFAULT_USER_PREFERENCES.placesDiscovered;
      }
      // Migration: Add userLevel if missing
      if (!data?.userLevel) {
        updates.userLevel = DEFAULT_USER_PREFERENCES.userLevel;
      }
      // Migration: Add achievementIds if missing
      if (!data?.achievementIds) {
        updates.achievementIds = [];
      }
      
      if (Object.keys(updates).length > 0) {
        await updateDoc(userRef, {
          ...updates,
          updatedAt: serverTimestamp(),
        });
        console.log('[PreferencesService] Migrated missing fields:', Object.keys(updates));
      }
    }
  } catch (error) {
    console.error('[PreferencesService] Error initializing preferences:', error);
    throw error;;
  }
};

// =============================================================================
// Fetch Functions
// =============================================================================

/**
 * Get user preferences from Firestore
 * 
 * Fetches the document `users/{uid}` and returns it as UserPreferences.
 * Returns null if the document doesn't exist or if there's an error.
 * 
 * @param uid - User's Firebase UID
 * @returns UserPreferences object or null if not found
 * 
 * @example
 * ```ts
 * const prefs = await getUserPreferences(user.uid);
 * if (prefs) {
 *   console.log('Saved trips:', prefs.savedTrips);
 * }
 * ```
 */
export const getUserPreferences = async (uid: string): Promise<UserPreferences | null> => {
  try {
    console.log('[PreferencesService] Fetching preferences for:', uid);
    
    const userRef = doc(firestore, USERS_COLLECTION, uid);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
      console.log('[PreferencesService] No preferences found for:', uid);
      return null;
    }

    const data = userDoc.data();
    
    // Map Firestore data to UserPreferences interface
    const preferences: UserPreferences = {
      uid,
      username: data?.username || data?.displayName || '',
      phoneNumber: data?.phoneNumber || '',
      savedTrips: (data?.savedTrips || []).map((trip: Record<string, unknown>) => ({
        id: trip.id as string,
        label: trip.label as string,
        origin: trip.origin as string,
        destination: trip.destination as string,
        coordinates: trip.coordinates as SavedTrip['coordinates'],
        iconType: trip.iconType as SavedTrip['iconType'],
        createdAt: trip.createdAt,
      })),
      searchHistory: data?.searchHistory || [],
      stats: {
        distanceTraveled: data?.stats?.distanceTraveled || 0,
        puvEntered: data?.stats?.puvEntered || 0,
        tripsCompleted: data?.stats?.tripsCompleted || 0,
        routesSearched: data?.stats?.routesSearched || 0,
      },
      placesDiscovered: {
        thisMonth: data?.placesDiscovered?.thisMonth || 0,
        topArea: data?.placesDiscovered?.topArea || '',
        recentActivities: data?.placesDiscovered?.recentActivities || [],
        totalPlaces: data?.placesDiscovered?.totalPlaces || 0,
        monthlyResetDate: data?.placesDiscovered?.monthlyResetDate || new Date().toISOString(),
      },
      userLevel: {
        currentLevel: data?.userLevel?.currentLevel || 1,
        exp: data?.userLevel?.exp || 0,
        expToNextLevel: data?.userLevel?.expToNextLevel || 150,
      },
      achievementIds: data?.achievementIds || [],
    };

    console.log('[PreferencesService] Preferences loaded:', {
      savedTrips: preferences.savedTrips.length,
      searchHistory: preferences.searchHistory.length,
      level: preferences.userLevel.currentLevel,
      exp: preferences.userLevel.exp,
      achievements: preferences.achievementIds.length,
    });

    // ✅ Success log for debugging - Firestore preferences fetched
    console.log('╔══════════════════════════════════════╗');
    console.log('║ ✅ FIRESTORE PREFERENCES LOADED      ║');
    console.log('╠══════════════════════════════════════╣');
    console.log('║ User UID:', uid);
    console.log('╠══════════════════════════════════════╣');
    console.log('║ 📍 SAVED TRIPS:', preferences.savedTrips.length);
    if (preferences.savedTrips.length > 0) {
      preferences.savedTrips.forEach((trip, i) => {
        console.log(`║    ${i + 1}. ${trip.label}: ${trip.origin} → ${trip.destination}`);
      });
    }
    console.log('╠══════════════════════════════════════╣');
    console.log('║ 🔍 SEARCH HISTORY:', preferences.searchHistory.length, 'items');
    console.log('╠══════════════════════════════════════╣');
    console.log('║ 🗺️  PLACES DISCOVERED:');
    console.log('║    This Month:', preferences.placesDiscovered.thisMonth);
    console.log('║    Top Area:', preferences.placesDiscovered.topArea || '(none)');
    console.log('║    Total Places:', preferences.placesDiscovered.totalPlaces);
    console.log('║    Recent Activities:', preferences.placesDiscovered.recentActivities.length);
    console.log('╠══════════════════════════════════════╣');
    console.log('║ ⭐ USER LEVEL:');
    console.log('║    Current Level:', preferences.userLevel.currentLevel);
    console.log('║    Current EXP:', preferences.userLevel.exp);
    console.log('║    EXP to Next:', preferences.userLevel.expToNextLevel);
    console.log('╠══════════════════════════════════════╣');
    console.log('║ 🏆 ACHIEVEMENTS:', preferences.achievementIds.length, 'unlocked');
    if (preferences.achievementIds.length > 0) {
      preferences.achievementIds.forEach((id, i) => {
        console.log(`║    ${i + 1}. ${id}`);
      });
    }
    console.log('╠══════════════════════════════════════╣');
    console.log('║ 📊 STATS:');
    console.log('║    Distance:', preferences.stats.distanceTraveled, 'km');
    console.log('║    PUV Entered:', preferences.stats.puvEntered);
    console.log('║    Trips Completed:', preferences.stats.tripsCompleted);
    console.log('║    Routes Searched:', preferences.stats.routesSearched);
    console.log('╚══════════════════════════════════════╝');
    console.log('======================================');

    return preferences;
  } catch (error) {
    console.error('[PreferencesService] Error fetching preferences:', error);
    return null;
  }
};

// =============================================================================
// Saved Trips Functions
// =============================================================================

/**
 * Add a saved trip to user's preferences
 * 
 * Uses Firestore's arrayUnion to add the trip to the savedTrips array.
 * This ensures atomic updates without overwriting existing trips.
 * 
 * @param uid - User's Firebase UID
 * @param trip - SavedTrip object to add
 * @returns Promise that resolves when the trip is saved
 * 
 * @example
 * ```ts
 * await addSavedTrip(user.uid, {
 *   id: 'trip-123',
 *   label: 'Home',
 *   origin: 'Imus',
 *   destination: 'Bacoor',
 *   coordinates: {
 *     origin: { lat: 14.4297, lng: 120.9367 },
 *     destination: { lat: 14.4585, lng: 120.9620 },
 *   },
 * });
 * ```
 */
export const addSavedTrip = async (uid: string, trip: SavedTrip): Promise<void> => {
  try {
    console.log('[PreferencesService] Adding saved trip:', trip.label);
    
    // Add createdAt timestamp if not provided
    const tripWithTimestamp = {
      ...trip,
      createdAt: trip.createdAt || Date.now(),
    };

    const userRef = doc(firestore, USERS_COLLECTION, uid);
    await updateDoc(userRef, {
      savedTrips: arrayUnion(tripWithTimestamp),
      updatedAt: serverTimestamp(),
    });

    // ✅ Success log for debugging - Saved trip added
    console.log('\n╔═══════════════════════════════════════════════════════════════════╗');
    console.log('║              📍 SAVED TRIP ADDED TO FIRESTORE 📍                  ║');
    console.log('╠═══════════════════════════════════════════════════════════════════╣');
    console.log('║  User UID:', uid.substring(0, 20).padEnd(55), '║');
    console.log('╠───────────────────────────────────────────────────────────────────╣');
    console.log('║  Trip ID:', tripWithTimestamp.id.substring(0, 20).padEnd(56), '║');
    console.log('║  Label:', (`"${tripWithTimestamp.label}"`).padEnd(58), '║');
    console.log('║  Route:', (`${tripWithTimestamp.origin} → ${tripWithTimestamp.destination}`).substring(0, 55).padEnd(58), '║');
    console.log('║  Origin Coords:', (`${tripWithTimestamp.coordinates.origin.lat.toFixed(4)}, ${tripWithTimestamp.coordinates.origin.lng.toFixed(4)}`).padEnd(50), '║');
    console.log('║  Dest Coords:', (`${tripWithTimestamp.coordinates.destination.lat.toFixed(4)}, ${tripWithTimestamp.coordinates.destination.lng.toFixed(4)}`).padEnd(52), '║');
    console.log('╚═══════════════════════════════════════════════════════════════════╝\n');

    console.log('[PreferencesService] Saved trip added successfully');
  } catch (error) {
    console.error('[PreferencesService] Error adding saved trip:', error);
    throw error;
  }
};

/**
 * Remove a saved trip from user's preferences
 * 
 * @param uid - User's Firebase UID
 * @param tripId - ID of the trip to remove
 * @returns Promise that resolves when the trip is removed
 */
export const removeSavedTrip = async (uid: string, tripId: string): Promise<void> => {
  try {
    console.log('[PreferencesService] Removing saved trip:', tripId);
    
    // First, get the current trips to find the one to remove
    const userRef = doc(firestore, USERS_COLLECTION, uid);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
      throw new Error('User document not found');
    }

    const data = userDoc.data();
    const currentTrips = data?.savedTrips || [];
    const tripToRemove = currentTrips.find((t: SavedTrip) => t.id === tripId);

    if (tripToRemove) {
      await updateDoc(userRef, {
        savedTrips: arrayRemove(tripToRemove),
        updatedAt: serverTimestamp(),
      });

      console.log('[PreferencesService] Saved trip removed successfully');
    }
  } catch (error) {
    console.error('[PreferencesService] Error removing saved trip:', error);
    throw error;
  }
};

/**
 * Update an existing saved trip
 * 
 * @param uid - User's Firebase UID
 * @param tripId - ID of the trip to update
 * @param updates - Partial trip data to update
 * @returns Promise that resolves when the trip is updated
 */
export const updateSavedTrip = async (
  uid: string,
  tripId: string,
  updates: Partial<Omit<SavedTrip, 'id'>>
): Promise<void> => {
  try {
    console.log('[PreferencesService] Updating saved trip:', tripId);
    
    const userRef = doc(firestore, USERS_COLLECTION, uid);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
      throw new Error('User document not found');
    }

    const data = userDoc.data();
    const currentTrips: SavedTrip[] = data?.savedTrips || [];
    
    const updatedTrips = currentTrips.map((trip) => {
      if (trip.id === tripId) {
        return { ...trip, ...updates };
      }
      return trip;
    });

    await updateDoc(userRef, {
      savedTrips: updatedTrips,
      updatedAt: serverTimestamp(),
    });

    console.log('[PreferencesService] Saved trip updated successfully');
  } catch (error) {
    console.error('[PreferencesService] Error updating saved trip:', error);
    throw error;
  }
};

// =============================================================================
// Search History Functions
// =============================================================================

/**
 * Add a search query to user's search history
 * 
 * @param uid - User's Firebase UID
 * @param query - Search query string to add
 * @returns Promise that resolves when the search is added
 */
export const addSearchHistory = async (uid: string, query: string): Promise<void> => {
  try {
    // Get current history to check for duplicates and limit size
    const userRef = doc(firestore, USERS_COLLECTION, uid);
    const userDoc = await getDoc(userRef);

    const data = userDoc.data();
    let currentHistory: string[] = data?.searchHistory || [];

    // Remove duplicate if exists
    currentHistory = currentHistory.filter((q) => q.toLowerCase() !== query.toLowerCase());

    // Add new query at the beginning
    currentHistory = [query, ...currentHistory].slice(0, MAX_SEARCH_HISTORY);

    await updateDoc(userRef, {
      searchHistory: currentHistory,
      updatedAt: serverTimestamp(),
    });

    console.log('[PreferencesService] Search history updated');
  } catch (error) {
    console.error('[PreferencesService] Error adding search history:', error);
    throw error;
  }
};

/**
 * Clear all search history for a user
 * 
 * @param uid - User's Firebase UID
 * @returns Promise that resolves when history is cleared
 */
export const clearSearchHistory = async (uid: string): Promise<void> => {
  try {
    const userRef = doc(firestore, USERS_COLLECTION, uid);
    await updateDoc(userRef, {
      searchHistory: [],
      updatedAt: serverTimestamp(),
    });

    console.log('[PreferencesService] Search history cleared');
  } catch (error) {
    console.error('[PreferencesService] Error clearing search history:', error);
    throw error;
  }
};

// =============================================================================
// Statistics Functions
// =============================================================================

/**
 * Update user statistics
 * 
 * @param uid - User's Firebase UID
 * @param stats - Partial stats to update (uses increment)
 * @returns Promise that resolves when stats are updated
 */
export const updateUserStats = async (
  uid: string,
  stats: { distanceTraveled?: number; puvEntered?: number; tripsCompleted?: number; routesSearched?: number }
): Promise<void> => {
  try {
    const updates: Record<string, unknown> = {
      updatedAt: serverTimestamp(),
    };

    if (stats.distanceTraveled !== undefined) {
      updates['stats.distanceTraveled'] = increment(stats.distanceTraveled);
    }
    if (stats.puvEntered !== undefined) {
      updates['stats.puvEntered'] = increment(stats.puvEntered);
    }
    if (stats.tripsCompleted !== undefined) {
      updates['stats.tripsCompleted'] = increment(stats.tripsCompleted);
    }
    if (stats.routesSearched !== undefined) {
      updates['stats.routesSearched'] = increment(stats.routesSearched);
    }

    const userRef = doc(firestore, USERS_COLLECTION, uid);
    await updateDoc(userRef, updates);

    console.log('\n╔═══════════════════════════════════════════════════════════════════╗');
    console.log('║              📊 USER STATS UPDATED 📊                              ║');
    console.log('╠═══════════════════════════════════════════════════════════════════╣');
    if (stats.distanceTraveled) console.log(`║  🚗 Distance Traveled: +${stats.distanceTraveled} km`.padEnd(68) + '║');
    if (stats.puvEntered) console.log(`║  🚌 PUV Entered: +${stats.puvEntered}`.padEnd(68) + '║');
    if (stats.tripsCompleted) console.log(`║  ✅ Trips Completed: +${stats.tripsCompleted}`.padEnd(68) + '║');
    if (stats.routesSearched) console.log(`║  🔍 Routes Searched: +${stats.routesSearched}`.padEnd(68) + '║');
    console.log('╚═══════════════════════════════════════════════════════════════════╝\n');
  } catch (error) {
    console.error('[PreferencesService] Error updating stats:', error);
    throw error;
  }
};

// =============================================================================
// Places Discovered Functions
// =============================================================================

/**
 * Add a discovered place
 * 
 * @param uid - User's Firebase UID
 * @param placeName - Name of the place
 * @param activityType - Type of activity
 * @returns Promise that resolves when place is added
 */
export const addPlaceDiscovered = async (
  uid: string,
  placeName: string,
  activityType: RecentActivity['activityType'] = 'visited'
): Promise<void> => {
  try {
    const userRef = doc(firestore, USERS_COLLECTION, uid);
    const userDoc = await getDoc(userRef);

    const data = userDoc.data();
    const placesDiscovered = data?.placesDiscovered || DEFAULT_USER_PREFERENCES.placesDiscovered;
    
    // Check if we need to reset monthly counter
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    const storedMonth = placesDiscovered.monthlyResetDate?.slice(0, 7);
    const shouldResetMonthly = currentMonth !== storedMonth;

    // Create new activity
    const newActivity: RecentActivity = {
      placeName,
      timestamp: Date.now(),
      activityType,
    };

    // Keep only last 10 activities
    const updatedActivities = [newActivity, ...(placesDiscovered.recentActivities || [])].slice(0, 10);

    const updates: Record<string, unknown> = {
      'placesDiscovered.recentActivities': updatedActivities,
      'placesDiscovered.totalPlaces': increment(1),
      updatedAt: serverTimestamp(),
    };

    if (shouldResetMonthly) {
      updates['placesDiscovered.thisMonth'] = 1;
      updates['placesDiscovered.monthlyResetDate'] = new Date().toISOString();
    } else {
      updates['placesDiscovered.thisMonth'] = increment(1);
    }

    await updateDoc(userRef, updates);

    console.log('╔══════════════════════════════════════╗');
    console.log('║ 🗺️  PLACE DISCOVERED ADDED           ║');
    console.log('╠══════════════════════════════════════╣');
    console.log('║ Place:', placeName);
    console.log('║ Activity:', activityType);
    console.log('║ This Month:', shouldResetMonthly ? '1 (reset)' : '+1');
    console.log('║ Total Places: +1');
    console.log('╚══════════════════════════════════════╝');
  } catch (error) {
    console.error('[PreferencesService] Error adding place discovered:', error);
    throw error;
  }
};

/**
 * Update top area based on most visited
 * 
 * @param uid - User's Firebase UID
 * @param area - Area name
 */
export const updateTopArea = async (uid: string, area: string): Promise<void> => {
  try {
    const userRef = doc(firestore, USERS_COLLECTION, uid);
    await updateDoc(userRef, {
      'placesDiscovered.topArea': area,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('[PreferencesService] Error updating top area:', error);
    throw error;
  }
};

// =============================================================================
// User Level & EXP Functions
// =============================================================================

/**
 * Add experience points to user
 * Automatically calculates and updates level if threshold is reached
 * 
 * @param uid - User's Firebase UID
 * @param expAmount - Amount of EXP to add
 * @returns Object containing new level info and whether level up occurred
 */
export const addUserExp = async (
  uid: string,
  expAmount: number
): Promise<{ newLevel: number; newExp: number; leveledUp: boolean; previousLevel: number }> => {
  try {
    const userRef = doc(firestore, USERS_COLLECTION, uid);
    const userDoc = await getDoc(userRef);

    const data = userDoc.data();
    const currentExp = data?.userLevel?.exp || 0;
    const currentLevel = data?.userLevel?.currentLevel || 1;
    
    const newExp = currentExp + expAmount;
    const newLevel = calculateLevelFromExp(newExp);
    const leveledUp = newLevel > currentLevel;
    const expToNextLevel = getExpToNextLevel(newLevel);

    await updateDoc(userRef, {
      'userLevel.exp': newExp,
      'userLevel.currentLevel': newLevel,
      'userLevel.expToNextLevel': expToNextLevel,
      updatedAt: serverTimestamp(),
    });

    console.log('╔══════════════════════════════════════╗');
    console.log('║ ⭐ USER EXP UPDATED                  ║');
    console.log('╠══════════════════════════════════════╣');
    console.log('║ Added EXP: +' + expAmount);
    console.log('║ Total EXP:', currentExp, '→', newExp);
    console.log('║ Level:', currentLevel, '→', newLevel);
    console.log('║ EXP to Next Level:', expToNextLevel);
    if (leveledUp) {
      console.log('╠══════════════════════════════════════╣');
      console.log('║ 🎉🎉🎉 LEVEL UP! 🎉🎉🎉              ║');
      console.log('║ Congratulations! Now Level', newLevel, '!');
    }
    console.log('╚══════════════════════════════════════╝');

    return { newLevel, newExp, leveledUp, previousLevel: currentLevel };
  } catch (error) {
    console.error('[PreferencesService] Error adding user exp:', error);
    throw error;
  }
};

/**
 * Set user level directly (admin use)
 */
export const setUserLevel = async (uid: string, level: number, exp: number): Promise<void> => {
  try {
    const userRef = doc(firestore, USERS_COLLECTION, uid);
    await updateDoc(userRef, {
      'userLevel.currentLevel': level,
      'userLevel.exp': exp,
      'userLevel.expToNextLevel': getExpToNextLevel(level),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('[PreferencesService] Error setting user level:', error);
    throw error;
  }
};

// =============================================================================
// Achievement Functions
// =============================================================================

/**
 * Unlock an achievement for user
 * Also awards EXP reward from the achievement
 * 
 * @param uid - User's Firebase UID
 * @param achievementId - Achievement ID to unlock
 * @returns Object containing whether achievement was newly unlocked and EXP awarded
 */
export const unlockAchievement = async (
  uid: string,
  achievementId: string
): Promise<{ unlocked: boolean; expAwarded: number; alreadyUnlocked: boolean }> => {
  try {
    const userRef = doc(firestore, USERS_COLLECTION, uid);
    const userDoc = await getDoc(userRef);

    const data = userDoc.data();
    const currentAchievements: string[] = data?.achievementIds || [];

    // Check if already unlocked
    if (currentAchievements.includes(achievementId)) {
      console.log('[PreferencesService] Achievement already unlocked:', achievementId);
      return { unlocked: false, expAwarded: 0, alreadyUnlocked: true };
    }

    // Get achievement data for EXP reward
    const achievement = getAchievementById(achievementId);
    const expReward = achievement?.expReward || 0;

    // Add achievement to array
    await updateDoc(userRef, {
      achievementIds: arrayUnion(achievementId),
      updatedAt: serverTimestamp(),
    });

    // Award EXP if any
    if (expReward > 0) {
      await addUserExp(uid, expReward);
    }

    console.log('╔══════════════════════════════════════╗');
    console.log('║ 🏆 ACHIEVEMENT UNLOCKED!             ║');
    console.log('╠══════════════════════════════════════╣');
    console.log('║ ID:', achievementId);
    console.log('║ Name:', achievement?.name || 'Unknown');
    console.log('║ Description:', achievement?.description || '');
    console.log('║ Category:', achievement?.category || 'Unknown');
    console.log('║ Rarity:', achievement?.rarity || 'common');
    console.log('║ EXP Reward: +' + expReward);
    console.log('╚══════════════════════════════════════╝');

    return { unlocked: true, expAwarded: expReward, alreadyUnlocked: false };
  } catch (error) {
    console.error('[PreferencesService] Error unlocking achievement:', error);
    throw error;
  }
};

/**
 * Check and unlock achievements based on current stats
 * Call this after updating stats to automatically unlock achievements
 * 
 * @param uid - User's Firebase UID
 * @returns Array of newly unlocked achievement IDs
 */
export const checkAndUnlockAchievements = async (uid: string): Promise<string[]> => {
  try {
    const prefs = await getUserPreferences(uid);
    if (!prefs) return [];

    const newlyUnlocked: string[] = [];
    const { stats, placesDiscovered, userLevel, savedTrips, achievementIds } = prefs;

    // Helper to check and unlock
    const tryUnlock = async (id: string, condition: boolean) => {
      if (condition && !achievementIds.includes(id)) {
        const result = await unlockAchievement(uid, id);
        if (result.unlocked) {
          newlyUnlocked.push(id);
        }
      }
    };

    // Exploration achievements
    await tryUnlock('ACH_FIRST_DISCOVERY', placesDiscovered.totalPlaces >= 1);
    await tryUnlock('ACH_EXPLORER_10', placesDiscovered.totalPlaces >= 10);
    await tryUnlock('ACH_EXPLORER_50', placesDiscovered.totalPlaces >= 50);
    await tryUnlock('ACH_EXPLORER_100', placesDiscovered.totalPlaces >= 100);
    await tryUnlock('ACH_MONTHLY_EXPLORER', placesDiscovered.thisMonth >= 20);

    // Travel achievements
    await tryUnlock('ACH_FIRST_TRIP', stats.tripsCompleted >= 1);
    await tryUnlock('ACH_TRIPS_10', stats.tripsCompleted >= 10);
    await tryUnlock('ACH_TRIPS_50', stats.tripsCompleted >= 50);
    await tryUnlock('ACH_TRIPS_100', stats.tripsCompleted >= 100);
    await tryUnlock('ACH_DISTANCE_100KM', stats.distanceTraveled >= 100);
    await tryUnlock('ACH_DISTANCE_500KM', stats.distanceTraveled >= 500);
    await tryUnlock('ACH_PUV_MASTER', stats.puvEntered >= 50);

    // Saved routes achievements
    await tryUnlock('ACH_SAVED_ROUTES_5', savedTrips.length >= 5);
    await tryUnlock('ACH_SAVED_ROUTES_20', savedTrips.length >= 20);

    // Level achievements
    await tryUnlock('ACH_LEVEL_2', userLevel.currentLevel >= 2);
    await tryUnlock('ACH_LEVEL_5', userLevel.currentLevel >= 5);
    await tryUnlock('ACH_LEVEL_10', userLevel.currentLevel >= 10);

    if (newlyUnlocked.length > 0) {
      console.log('\n╔═══════════════════════════════════════════════════════════════════╗');
      console.log('║              🎯 AUTO-UNLOCKED ACHIEVEMENTS 🎯                      ║');
      console.log('╠═══════════════════════════════════════════════════════════════════╣');
      console.log('║  Count:', newlyUnlocked.length.toString().padEnd(57), '║');
      console.log('╠───────────────────────────────────────────────────────────────────╣');
      newlyUnlocked.forEach((id, index) => {
        const achievement = ACHIEVEMENTS.find(a => a.id === id);
        if (achievement) {
          console.log(`║  ${index + 1}. ${achievement.icon} ${achievement.name}`.padEnd(68) + '║');
          console.log(`║     "${achievement.description}"`.padEnd(68) + '║');
          console.log(`║     Rarity: ${achievement.rarity.toUpperCase()} | +${achievement.expReward} EXP`.padEnd(68) + '║');
        } else {
          console.log(`║  ${index + 1}. ${id}`.padEnd(68) + '║');
        }
      });
      console.log('╚═══════════════════════════════════════════════════════════════════╝\n');
    }

    return newlyUnlocked;
  } catch (error) {
    console.error('[PreferencesService] Error checking achievements:', error);
    return [];
  }
};

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Generate a unique ID for a saved trip
 * @returns Unique trip ID string
 */
export const generateTripId = (): string => {
  return `trip-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Generate a unique ID for an achievement (admin use)
 * @param prefix - Optional prefix for the ID
 * @returns Unique achievement ID string
 */
export const generateAchievementId = (prefix: string = 'ACH'): string => {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
};
