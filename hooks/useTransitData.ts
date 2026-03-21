import { useMemo } from 'react';
import routesData from '../data/routes.json';

export type TransitCoord = {
  latitude: number;
  longitude: number;
};

export type TransitStop = {
  id: string;
  coordinate: TransitCoord;
  name: string;
  operator: string;
};

export type TransitRoute = {
  id: string;
  type: string;
  color: string;
  ref: string;
  name: string;
  from: string;
  to: string;
  operator: string;
  coordinates: TransitCoord[];
  stops: TransitStop[];
  verified: boolean;
  fare: number;
};

const ROUTE_COLORS: Record<string, string> = {
  jeepney: '#22C55E',
  bus: '#2563EB',
  share_taxi: '#F59E0B',
};

export function useTransitData() {
  const routes = useMemo<TransitRoute[]>(() => {
    const source = (routesData as any)?.routes || [];

    return source
      .filter((route: any) => Array.isArray(route.path) && route.path.length > 1)
      .map((route: any) => {
        const stops = Array.isArray(route.stops) ? route.stops : [];
        const type = route.type || 'jeepney';

        return {
          id: route.code,
          type,
          color: ROUTE_COLORS[type] || '#FF6B35',
          ref: route.code,
          name: route.name,
          from: stops[0]?.name || '',
          to: stops[stops.length - 1]?.name || '',
          operator: route.operator || '',
          coordinates: route.path.map(([lng, lat]: [number, number]) => ({
            latitude: lat,
            longitude: lng,
          })),
          stops: stops.map((stop: any, index: number) => ({
            id: `${route.code}-stop-${index}`,
            coordinate: {
              latitude: stop.lat,
              longitude: stop.lng,
            },
            name: stop.name,
            operator: route.operator || '',
          })),
          verified: false,
          fare: route.fare || 0,
        };
      });
  }, []);

  return { routes, loading: false };
}
