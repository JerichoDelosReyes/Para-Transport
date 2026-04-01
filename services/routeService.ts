import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../config/supabaseClient';
import type { JeepneyRoute, RouteCoord, StopPoint } from '../types/routes';

const CACHE_KEY = '@para_routes_cache_v3_roadsnapped';
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour

interface CachedData {
  routes: JeepneyRoute[];
  cachedAt: number;
}

/** Transform a Supabase route row + its stops into the app's JeepneyRoute shape. */
function toJeepneyRoute(
  row: any,
  stops: any[],
  vehicleType: 'jeepney' | 'tricycle' | 'bus' | 'uv' = 'jeepney'
): JeepneyRoute {
  const pathData = Array.isArray(row.path_data) ? row.path_data : [];

  const coordinates: RouteCoord[] = pathData.map((coord: number[]) => ({
    latitude: coord[1],
    longitude: coord[0],
  }));

  const sortedStops = [...stops].sort((a, b) => a.stop_order - b.stop_order);
  const mappedStops: StopPoint[] = sortedStops.map((s, idx) => ({
    coordinate: { latitude: Number(s.latitude), longitude: Number(s.longitude) },
    type: idx === 0 || idx === sortedStops.length - 1 ? 'terminal' : 'stop',
    label: s.stop_name,
  }));

  return {
    properties: {
      code: row.route_code ?? row.source_relation_id ?? '',
      name: row.label ?? row.name ?? '',
      description: row.description ?? '',
      type: vehicleType,
      fare: Number(row.fare_base) || 0,
      status: row.status ?? 'active',
      operator: row.operator ?? '',
      fromLabel: row.from_label ?? undefined,
      toLabel: row.to_label ?? undefined,
      network: row.network ?? undefined,
    },
    coordinates,
    stops: mappedStops,
  };
}

type RouteSource = 'supabase' | 'cache';

/** Fetch all active routes + their stops from Supabase. */
export async function fetchRoutesFromSupabase(): Promise<JeepneyRoute[]> {
  const routeTypes: Array<{ table: string, stopTable: string, type: 'jeepney' | 'tricycle' | 'bus' | 'uv' }> = [
    { table: 'jeepney_routes', stopTable: 'jeepney_route_stops', type: 'jeepney' },
    { table: 'tricycle_routes', stopTable: 'tricycle_route_stops', type: 'tricycle' },
    { table: 'bus_routes', stopTable: 'bus_route_stops', type: 'bus' },
    { table: 'uv_express_routes', stopTable: 'uv_express_route_stops', type: 'uv' },
  ];

  let allMappedRoutes: JeepneyRoute[] = [];

  for (const { table, stopTable, type } of routeTypes) {
    try {
      // 1. Fetch routes
      const { data: routeRows, error: routeErr } = await supabase
        .from(table)
        .select('*')
        .eq('is_active', true)
        .order('label');

      if (routeErr || !routeRows || routeRows.length === 0) continue;

      // 2. Fetch all stops for these routes in one query
      const routeIds = routeRows.map((r: any) => r.id);
      const { data: stopRows, error: stopErr } = await supabase
        .from(stopTable)
        .select('*')
        .in('route_id', routeIds)
        .order('stop_order');

      if (stopErr) continue;

      // 3. Group stops by route_id
      const stopsByRoute: Record<string, any[]> = {};
      for (const stop of stopRows || []) {
        if (!stopsByRoute[stop.route_id]) stopsByRoute[stop.route_id] = [];
        stopsByRoute[stop.route_id].push(stop);
      }

      // 4. Assemble JeepneyRoute objects
      const mapped = routeRows
        .filter((r: any) => {
          const path = Array.isArray(r.path_data) ? r.path_data : [];
          return path.length >= 2;
        })
        .map((r: any) => toJeepneyRoute(r, stopsByRoute[r.id] || [], type));
        
      allMappedRoutes = allMappedRoutes.concat(mapped);
    } catch (e) {
      console.warn(`[routeService] Failed to fetch ${type} routes from Supabase:`, e);
    }
  }

  return allMappedRoutes;
}

/** Read cached routes from AsyncStorage. Returns null if missing/expired. */
export async function getCachedRoutes(): Promise<JeepneyRoute[] | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached: CachedData = JSON.parse(raw);
    if (Date.now() - cached.cachedAt > CACHE_TTL_MS) return null;
    return cached.routes;
  } catch {
    return null;
  }
}

/** Write routes to AsyncStorage cache. */
export async function cacheRoutes(routes: JeepneyRoute[]): Promise<void> {
  try {
    const data: CachedData = { routes, cachedAt: Date.now() };
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    // Silently fail — cache is best-effort
  }
}

/**
 * Load routes with a 2-tier fallback strategy:
 *   1. Supabase (live data)
 *   2. AsyncStorage cache (offline / Supabase down)
 */
export async function loadRoutes(): Promise<{ routes: JeepneyRoute[]; source: RouteSource }> {
  // 1. Try Supabase
  try {
    const routes = await fetchRoutesFromSupabase();
    if (routes.length > 0) {
      cacheRoutes(routes); // fire-and-forget
      console.log(`[routeService] Loaded ${routes.length} routes from Supabase`);
      return { routes, source: 'supabase' };
    }
  } catch (err) {
    console.warn('[routeService] Supabase fetch failed, trying cache:', err);
  }

  // 2. Try cache
  try {
    const cached = await getCachedRoutes();
    if (cached && cached.length > 0) {
      console.log(`[routeService] Loaded ${cached.length} routes from cache`);
      return { routes: cached, source: 'cache' };
    }
  } catch {
    // fall through
  }

  console.warn('[routeService] No routes available from Supabase or cache');
  return { routes: [], source: 'cache' };
}
