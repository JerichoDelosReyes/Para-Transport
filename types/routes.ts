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
