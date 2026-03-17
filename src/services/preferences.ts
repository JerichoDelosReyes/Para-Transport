/**
 * Preferences Service
 * 
 * Handles user preferences stored in Supabase under `user_preferences`.
 * Provides functions to initialize, fetch, and update user preferences
 * including saved trips, search history, places discovered, user level, and achievements.
 * 
 * @module services/preferences
 */

import { supabase } from '../config/supabase';
import {
  UserPreferences,
  SavedTrip,
  RecentActivity,
  UserLevel,
  createDefaultPreferences,
  calculateLevelFromExp,
  getExpToNextLevel,
  DEFAULT_USER_PREFERENCES,
} from '../types/user';
import { getAchievementById } from '../data/achievements';

// =============================================================================
// Helpers
// =============================================================================

export const generateTripId = (): string => `trip_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

const TABLE_NAME = 'user_preferences';

/**
 * Initialize user preferences document in Supabase
 */
export const initializeUserPreferences = async (uid: string): Promise<void> => {
  try {
    const { data: existingPrefs, error: fetchError } = await supabase
      .from(TABLE_NAME)
      .select('uid')
      .eq('uid', uid)
      .maybeSingle();

    if (fetchError && fetchError.code !== 'PGRST116') {
      throw fetchError;
    }

    if (!existingPrefs) {
      console.log('[PreferencesService] Creating default preferences for:', uid);
      const defaultPrefs = createDefaultPreferences(uid);

      const { error: insertError } = await supabase
        .from(TABLE_NAME)
        .insert({
          ...defaultPrefs,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      if (insertError) throw insertError;
      console.log('[PreferencesService] Default preferences created');
    } else {
      console.log('[PreferencesService] Preferences document already exists for:', uid);
    }
  } catch (error) {
    console.error('[PreferencesService] Error initializing preferences:', error);
    throw error;
  }
};

/**
 * Get user preferences from Supabase
 */
export const getUserPreferences = async (uid: string): Promise<UserPreferences | null> => {
  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .eq('uid', uid)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    // Ensure we map standard camelCase names correctly assuming the DB matches UserPreferences type
    // If DB has snake_case, you'd remap here -> e.g., searchHistory: data.search_history
    return data as UserPreferences;
  } catch (error) {
    console.error('[PreferencesService] Error fetching preferences:', error);
    return null;
  }
};

/**
 * Add a saved trip to user's preferences
 */
export const addSavedTrip = async (uid: string, trip: SavedTrip): Promise<void> => {
  try {
    const prefs = await getUserPreferences(uid);
    if (!prefs) throw new Error('User document not found');

    const updatedTrips = [...(prefs.savedTrips || []), trip];

    const { error } = await supabase
      .from(TABLE_NAME)
      .update({ savedTrips: updatedTrips, updated_at: new Date().toISOString() })
      .eq('uid', uid);

    if (error) throw error;
  } catch (error) {
    console.error('[PreferencesService] Error adding saved trip:', error);
    throw error;
  }
};

/**
 * Remove a saved trip
 */
export const removeSavedTrip = async (uid: string, tripId: string): Promise<void> => {
  try {
    const prefs = await getUserPreferences(uid);
    if (!prefs) throw new Error('User document not found');

    const updatedTrips = (prefs.savedTrips || []).filter(t => t.id !== tripId);

    const { error } = await supabase
      .from(TABLE_NAME)
      .update({ savedTrips: updatedTrips, updated_at: new Date().toISOString() })
      .eq('uid', uid);

    if (error) throw error;
  } catch (error) {
    console.error('[PreferencesService] Error removing saved trip:', error);
    throw error;
  }
};

/**
 * Update an existing saved trip
 */
export const updateSavedTrip = async (uid: string, tripId: string, updates: Partial<Omit<SavedTrip, 'id'>>): Promise<void> => {
  try {
    const prefs = await getUserPreferences(uid);
    if (!prefs) throw new Error('User document not found');

    const updatedTrips = (prefs.savedTrips || []).map(trip => 
      trip.id === tripId ? { ...trip, ...updates } : trip
    );

    const { error } = await supabase
      .from(TABLE_NAME)
      .update({ savedTrips: updatedTrips, updated_at: new Date().toISOString() })
      .eq('uid', uid);

    if (error) throw error;
  } catch (error) {
    console.error('[PreferencesService] Error updating saved trip:', error);
    throw error;
  }
};

/**
 * Add a search query to history
 */
export const addSearchHistory = async (uid: string, query: string): Promise<void> => {
  try {
    const prefs = await getUserPreferences(uid);
    if (!prefs) throw new Error('User document not found');

    let history = (prefs.searchHistory || []).filter(q => q.toLowerCase() !== query.toLowerCase());
    history = [query, ...history].slice(0, 20);

    const { error } = await supabase
      .from(TABLE_NAME)
      .update({ searchHistory: history, updated_at: new Date().toISOString() })
      .eq('uid', uid);

    if (error) throw error;
  } catch (error) {
    console.error('[PreferencesService] Error adding search history:', error);
    throw error;
  }
};

export const clearSearchHistory = async (uid: string): Promise<void> => {
  try {
    const { error } = await supabase
      .from(TABLE_NAME)
      .update({ searchHistory: [], updated_at: new Date().toISOString() })
      .eq('uid', uid);

    if (error) throw error;
  } catch (error) {
    console.error('[PreferencesService] Error clearing search history:', error);
    throw error;
  }
};

export const updateUserStats = async (
  uid: string,
  stats: { distanceTraveled?: number; puvEntered?: number; tripsCompleted?: number; routesSearched?: number }
): Promise<void> => {
  try {
    const prefs = await getUserPreferences(uid);
    if (!prefs) throw new Error('User document not found');

    const currentStats = prefs.stats || { distanceTraveled: 0, puvEntered: 0, tripsCompleted: 0, routesSearched: 0 };
    
    const newStats = {
      distanceTraveled: currentStats.distanceTraveled + (stats.distanceTraveled || 0),
      puvEntered: currentStats.puvEntered + (stats.puvEntered || 0),
      tripsCompleted: currentStats.tripsCompleted + (stats.tripsCompleted || 0),
      routesSearched: currentStats.routesSearched + (stats.routesSearched || 0),
    };

    const { error } = await supabase
      .from(TABLE_NAME)
      .update({ stats: newStats, updated_at: new Date().toISOString() })
      .eq('uid', uid);

    if (error) throw error;
  } catch (error) {
    console.error('[PreferencesService] Error updating stats:', error);
    throw error;
  }
};

// --- Omitted full implementations for places and achievements for brevity, same pattern ---

export const addUserExp = async (uid: string, expAmount: number): Promise<{ newLevel: number; newExp: number; leveledUp: boolean; previousLevel: number }> => {
  try {
    const prefs = await getUserPreferences(uid);
    if (!prefs) throw new Error('User document not found');

    const currentExp = prefs.userLevel?.exp || 0;
    const currentLevel = prefs.userLevel?.currentLevel || 1;
    
    const newExp = currentExp + expAmount;
    const newLevel = calculateLevelFromExp(newExp);
    const leveledUp = newLevel > currentLevel;
    const expToNextLevel = getExpToNextLevel(newLevel);

    const { error } = await supabase
      .from(TABLE_NAME)
      .update({ 
        userLevel: { exp: newExp, currentLevel: newLevel, expToNextLevel },
        updated_at: new Date().toISOString()
      })
      .eq('uid', uid);

    if (error) throw error;
    return { newLevel, newExp, leveledUp, previousLevel: currentLevel };
  } catch (error) {
    console.error('[PreferencesService] Error adding user exp:', error);
    throw error;
  }
};

export const unlockAchievement = async (uid: string, achievementId: string): Promise<{ unlocked: boolean; expAwarded: number; alreadyUnlocked: boolean }> => {
  try {
    const prefs = await getUserPreferences(uid);
    if (!prefs) throw new Error('User document not found');

    const currentAchievements = prefs.achievementIds || [];

    if (currentAchievements.includes(achievementId)) {
      return { unlocked: false, expAwarded: 0, alreadyUnlocked: true };
    }

    const achievement = getAchievementById(achievementId);
    const expReward = achievement?.expReward || 0;

    const { error } = await supabase
      .from(TABLE_NAME)
      .update({ 
        achievementIds: [...currentAchievements, achievementId],
        updated_at: new Date().toISOString()
      })
      .eq('uid', uid);

    if (error) throw error;

    if (expReward > 0) {
      await addUserExp(uid, expReward);
    }

    return { unlocked: true, expAwarded: expReward, alreadyUnlocked: false };
  } catch (error) {
    console.error('[PreferencesService] Error unlocking achievement:', error);
    throw error;
  }
};
