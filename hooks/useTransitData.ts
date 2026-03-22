// Re-export types from canonical location
export type { RouteCoord as TransitCoord } from '../types/routes';
export type { JeepneyRoute } from '../types/routes';

export type TransitStop = {
  id: string;
  coordinate: { latitude: number; longitude: number };
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
  coordinates: { latitude: number; longitude: number }[];
  stops: TransitStop[];
  verified: boolean;
  fare: number;
};

// Re-export hook for backward compatibility
export { useRoutes as useTransitData } from './useRoutes';
