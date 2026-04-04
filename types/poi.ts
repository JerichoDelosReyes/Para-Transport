export type POIBounds = {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
};

export type POIRow = {
  id: string;
  title: string;
  latitude: number;
  longitude: number;
  landmark_type: string;
  category?: string | null;
};

export type POIFeatureProperties = {
  id: string;
  title: string;
  landmark_type: string;
  category?: string | null;
};

export type POIFeature = {
  type: 'Feature';
  id: string;
  properties: POIFeatureProperties;
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
};

export type POIFeatureCollection = {
  type: 'FeatureCollection';
  features: POIFeature[];
};

export const EMPTY_POI_FEATURE_COLLECTION: POIFeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};
