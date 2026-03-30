import { useState, useEffect, useCallback } from 'react';
import { loadRoutes, fetchRoutesFromSupabase, cacheRoutes } from '../services/routeService';
import type { JeepneyRoute } from '../types/routes';

export function useRoutes() {
  const [routes, setRoutes] = useState<JeepneyRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<'supabase' | 'cache' | 'bundled' | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await loadRoutes();
      setRoutes(result.routes);
      setSource(result.source);
    } catch (err: any) {
      console.warn('[useRoutes] Failed to load routes:', err);
      setError(err?.message || 'Failed to load routes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** Force re-fetch from Supabase, ignoring cache. */
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const routes = await fetchRoutesFromSupabase();
      if (routes.length > 0) {
        setRoutes(routes);
        setSource('supabase');
        cacheRoutes(routes);
      }
    } catch (err: any) {
      console.warn('[useRoutes] Refresh failed:', err);
      setError(err?.message || 'Refresh failed');
    } finally {
      setLoading(false);
    }
  }, []);

  return { routes, loading, error, source, refresh };
}
