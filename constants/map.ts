const mapTilerKey = process.env.EXPO_PUBLIC_MAPTILER_KEY;
const mapTilerStyle = process.env.EXPO_PUBLIC_MAPTILER_STYLE || 'openstreetmap';
const cartoLightNoLabelsUrl = 'https://basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png';
const canonicalLightStyleUrl =
  'https://paragisstorage.blob.core.windows.net/styles/style-v20260406-001.json';
const canonicalDarkStyleUrl =
  'https://paragisstorage.blob.core.windows.net/styles/style-v20260403-002.json';
const canonicalStyleUrl = canonicalDarkStyleUrl;

const styleUrlStrategy = process.env.EXPO_PUBLIC_PARAGIS_STYLE_STRATEGY || 'pinned';
const pinnedStyleUrl = process.env.EXPO_PUBLIC_PARAGIS_STYLE_URL_PINNED || '';
const fallbackStyleUrl =
  process.env.EXPO_PUBLIC_PARAGIS_STYLE_URL_FALLBACK ||
  process.env.EXPO_PUBLIC_PARAGIS_STYLE_URL ||
  canonicalStyleUrl;

const resolvedStyleUrl =
  styleUrlStrategy === 'latest'
    ? fallbackStyleUrl
    : pinnedStyleUrl || fallbackStyleUrl;

const mapTilerUrl = mapTilerKey
  ? `https://api.maptiler.com/maps/${mapTilerStyle}/{z}/{x}/{y}.jpg?key=${mapTilerKey}`
  : '';

export const MAP_CONFIG = {
  MAP_RENDERER: 'maplibre',
  MAPLIBRE_STYLE_URL: process.env.EXPO_PUBLIC_MAPLIBRE_STYLE_URL || canonicalStyleUrl,
  MAPLIBRE_STYLE_LIGHT_URL:
    process.env.EXPO_PUBLIC_PARAGIS_STYLE_URL_LIGHT || canonicalLightStyleUrl,
  MAPLIBRE_STYLE_DARK_URL:
    process.env.EXPO_PUBLIC_PARAGIS_STYLE_URL_DARK || canonicalDarkStyleUrl,
  CANONICAL_STYLE_URL: canonicalStyleUrl,
  STYLE_URL_STRATEGY: styleUrlStrategy,
  STYLE_URL_PINNED_VERSION: pinnedStyleUrl,
  STYLE_URL_FALLBACK: fallbackStyleUrl,
  RESOLVED_STYLE_URL: resolvedStyleUrl,
  FEATURE_USE_MAPLIBRE: process.env.EXPO_PUBLIC_FEATURE_USE_MAPLIBRE === '1',
  THREE_D_CAMERA: {
    minPitch: 0,
    defaultPitch: 45,
    maxPitch: 60,
  },
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
