/**
 * Hook to load parsed Overpass transit data for Cavite.
 * Provides routes, stops, loading state, error state, and a refresh function.
 *
 * It natively imports the pre-parsed dataset bundling to avoid slow
 * 60MB raw data downloads over the mobile network on cold starts.
 */
import { useState, useCallback } from 'react';
import bundledTransitData from '../data/parsed_transit_data.json';

export function useTransitData() {
  const [routes, setRoutes] = useState(bundledTransitData?.routes || []);
  const [stops, setStops] = useState(bundledTransitData?.stops || []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    // Keeping this interface for compatibility with any refresh buttons
    // The data is statically bundled and parsed, so no external fetch is needed.
    setLoading(true);
    setError(null);
    try {
      setRoutes(bundledTransitData?.routes || []);
      setStops(bundledTransitData?.stops || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);
  return { routes, stops, loading, error, refresh: load };
}
