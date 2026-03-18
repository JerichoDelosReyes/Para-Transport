import { useState, useEffect } from 'react';
import routeData from '../data/t4xx-routes.json';

export type RouteFeature = {
  routeCode: string;
  description: string;
  routeDescription: string;
  operator: string;
  distanceKm: number | null;
  status: string;
  notes: string;
  vehicleType: string;
  osmId: number | null;
  hasGeometry: boolean;
};

export type RouteCoord = {
  latitude: number;
  longitude: number;
};

export type JeepneyRoute = {
  properties: RouteFeature;
  coordinates: RouteCoord[];
};

export function useJeepneyRoutes() {
  const [routes, setRoutes] = useState<JeepneyRoute[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const data = routeData as any;
      const parsed: JeepneyRoute[] = (data.features || [])
        .filter((f: any) => f.properties?.hasGeometry && f.geometry?.coordinates?.length >= 2)
        .map((f: any) => ({
          properties: f.properties,
          coordinates: f.geometry.coordinates.map(([lng, lat]: [number, number]) => ({
            latitude: lat,
            longitude: lng,
          })),
        }));
      setRoutes(parsed);
    } catch (err) {
      console.warn('[useJeepneyRoutes] Failed to load route data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  return { routes, loading };
}
