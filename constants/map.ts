const mapTilerKey = process.env.EXPO_PUBLIC_MAPTILER_KEY;
const mapTilerStyle = process.env.EXPO_PUBLIC_MAPTILER_STYLE || 'openstreetmap';
const cartoLightNoLabelsUrl = 'https://basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png';
const canonicalStyleUrl =
  'https://paragisstorage.blob.core.windows.net/maps/v1/style.json';

const mapTilerUrl = mapTilerKey
  ? `https://api.maptiler.com/maps/${mapTilerStyle}/{z}/{x}/{y}.jpg?key=${mapTilerKey}`
  : '';

export const MAP_CONFIG = {
  MAP_RENDERER: 'maplibre',
  MAPLIBRE_STYLE_URL: process.env.EXPO_PUBLIC_MAPLIBRE_STYLE_URL || canonicalStyleUrl,
  OSM_TILE_URL:
    process.env.EXPO_PUBLIC_OSM_TILE_URL ||
    process.env.EXPO_PUBLIC_LIGHT_TILE_URL ||
    mapTilerUrl ||
    cartoLightNoLabelsUrl,
  OSM_ATTRIBUTION:
    mapTilerUrl
      ? '© MapTiler © OpenStreetMap contributors'
      : '© CARTO © OpenStreetMap contributors',
  PHILIPPINES_BOUNDS: {
    minLatitude: 4.5,
    maxLatitude: 21.5,
    minLongitude: 116.0,
    maxLongitude: 127.5,
  },
} as const;
