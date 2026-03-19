/**
 * Hook to fetch, cache, and parse Overpass transit data for Cavite.
 * Provides routes, stops, loading state, error state, and a refresh function.
 *
 * Fetches routes and stops in parallel via separate optimized queries.
 * Uses 24-hour cache with stale fallback on network errors.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchTransitRoutes, fetchTransitStops } from '../services/overpassService';
import {
  getCachedTransitData,
  getStaleCachedTransitData,
  setCachedTransitData,
} from '../services/cacheService';
import { parseRouteElements, parseStopElements } from '../utils/parseRoutes';

export function useTransitData() {
  const [routes, setRoutes] = useState([]);
  const [stops, setStops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Try fresh cache first
      const cached = await getCachedTransitData();
      if (cached?.routeElements && cached?.stopElements) {
        const parsedRoutes = parseRouteElements(cached.routeElements);
        const parsedStops = parseStopElements(cached.stopElements);
        if (mountedRef.current) {
          setRoutes(parsedRoutes);
          setStops(parsedStops);
          setLoading(false);
        }
        return;
      }

      // Fetch routes and stops in parallel
      const [routeData, stopData] = await Promise.all([
        fetchTransitRoutes(),
        fetchTransitStops(),
      ]);

      // Cache the raw elements
      await setCachedTransitData({
        routeElements: routeData.elements,
        stopElements: stopData.elements,
      });

      const parsedRoutes = parseRouteElements(routeData.elements);
      const parsedStops = parseStopElements(stopData.elements);

      if (mountedRef.current) {
        setRoutes(parsedRoutes);
        setStops(parsedStops);
      }
    } catch (err) {
      console.warn('[useTransitData] Fetch failed, trying stale cache:', err.message);

      // Fall back to stale cache
      try {
        const stale = await getStaleCachedTransitData();
        if (stale?.routeElements && stale?.stopElements) {
          const parsedRoutes = parseRouteElements(stale.routeElements);
          const parsedStops = parseStopElements(stale.stopElements);
          if (mountedRef.current) {
            setRoutes(parsedRoutes);
            setStops(parsedStops);
          }
        } else {
          if (mountedRef.current) {
            setError(err.message || 'Failed to load transit data');
          }
        }
      } catch {
        if (mountedRef.current) {
          setError(err.message || 'Failed to load transit data');
        }
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { routes, stops, loading, error, refresh: load };
}
