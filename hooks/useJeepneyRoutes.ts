import { useState, useEffect } from 'react';
import transitData from '../data/transit.routes.generated.json';

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
  signboard: string;
  direction: 'forward' | 'reverse';
  sourceFile: string;
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
      const data = transitData as any;
      const parsed: JeepneyRoute[] = (data.routes || [])
        .filter((r: any) => r?.geometry?.type === 'LineString' && r?.geometry?.coordinates?.length >= 2)
        .map((r: any) => {
          const coordinates: RouteCoord[] = r.geometry.coordinates.map(([lng, lat]: [number, number]) => ({
            latitude: lat,
            longitude: lng,
          }));

          const stops: StopPoint[] = (r.stops || []).map((s: any, idx: number) => ({
            coordinate: {
              latitude: s.coordinate[1],
              longitude: s.coordinate[0],
            },
            type: s.type === 'terminal' ? 'terminal' as const : 'stop' as const,
            label: s.name || `Stop ${idx + 1}`,
          }));

          return {
            properties: {
              code: r.routeId,
              name: r.routeName,
              description: `${r.routeName} (${r.direction})`,
              type: r.vehicleType,
              fare: 13,
              status: 'active',
              operator: '',
              signboard: r.signboard,
              direction: r.direction,
              sourceFile: r.sourceFile,
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
