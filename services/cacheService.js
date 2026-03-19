/**
 * Cache Service using AsyncStorage.
 * Caches Overpass transit data locally with a 24-hour expiry.
 * Falls back to stale cache when network fetch fails.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_KEY = 'PARA_TRANSIT_CACHE_v4';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Retrieves cached transit data if it exists and hasn't expired.
 * @returns {Promise<Object|null>} Cached data or null
 */
export async function getCachedTransitData() {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;

    const cached = JSON.parse(raw);
    if (!cached || !cached.timestamp || !cached.data) return null;

    const age = Date.now() - cached.timestamp;
    if (age > CACHE_TTL_MS) return null;

    return cached.data;
  } catch (err) {
    console.warn('[CacheService] Failed to read cache:', err);
    return null;
  }
}

/**
 * Retrieves cached data regardless of expiry (stale fallback).
 * @returns {Promise<Object|null>} Cached data or null
 */
export async function getStaleCachedTransitData() {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;

    const cached = JSON.parse(raw);
    return cached?.data || null;
  } catch (err) {
    console.warn('[CacheService] Failed to read stale cache:', err);
    return null;
  }
}

/**
 * Saves transit data to cache with current timestamp.
 * @param {Object} data - The transit data to cache
 */
export async function setCachedTransitData(data) {
  try {
    const payload = JSON.stringify({
      timestamp: Date.now(),
      data,
    });
    await AsyncStorage.setItem(CACHE_KEY, payload);
  } catch (err) {
    console.warn('[CacheService] Failed to write cache:', err);
  }
}
