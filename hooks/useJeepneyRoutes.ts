import { useState, useEffect } from 'react';
import routeData from '../data/routes.json';
import tricycleRouteData from '../data/tricycle_routes.json';
import { getRouteDisplayName } from '../constants/routeCatalog';

export type RouteCoord = {
  latitude: number;
  longitude: number;
};

export type StopPoint = {
  coordinate: RouteCoord;
  type: 'terminal' | 'stop';
  label: string;
};

export type RouteProperties = {
  code: string;
  name: string;
  description: string;
  type: string;
  fare: number;
  status: string;
  operator: string;
};

export type JeepneyRoute = {
  properties: RouteProperties;
  coordinates: RouteCoord[];
  stops: StopPoint[];
};

export function useJeepneyRoutes() {
  const [routes, setRoutes] = useState<JeepneyRoute[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const baseData = routeData as any;
      const trikeData = tricycleRouteData as any;
      const mergedRoutes = [...(baseData.routes || []), ...(trikeData.routes || [])];

      const byCode = new Map<string, any>();
      for (const r of mergedRoutes) {
        if (!r?.code) continue;
        // Later source wins for same code (tricycle_routes overrides routes.json)
        byCode.set(r.code, r);
      }
      const allRoutes = Array.from(byCode.values());

      const parsed: JeepneyRoute[] = allRoutes
        .filter((r: any) => r.status === 'active' && r.path?.length >= 2)
        .map((r: any) => {
          const coordinates: RouteCoord[] = r.path.map(([lng, lat]: [number, number]) => ({
            latitude: lat,
            longitude: lng,
          }));

          const stops: StopPoint[] = (r.stops || []).map((s: any, idx: number) => ({
            coordinate: { latitude: s.lat, longitude: s.lng },
            type: idx === 0 || idx === (r.stops.length - 1) ? 'terminal' as const : 'stop' as const,
            label: s.name,
          }));

          return {
            properties: {
              code: r.code,
              name: getRouteDisplayName(r.code, r.name),
              description: r.description,
              type: r.type,
              fare: r.fare,
              status: r.status,
              operator: r.operator || '',
            },
            coordinates,
            stops,
          };
        });
      setRoutes(parsed);
    } catch (err) {
      console.warn('[useJeepneyRoutes] Failed to load route data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  return { routes, loading };
}
