const mapTilerKey = process.env.EXPO_PUBLIC_MAPTILER_KEY;
const mapTilerStyle = process.env.EXPO_PUBLIC_MAPTILER_STYLE || 'openstreetmap';

const mapTilerUrl = mapTilerKey
  ? `https://api.maptiler.com/maps/${mapTilerStyle}/{z}/{x}/{y}.jpg?key=${mapTilerKey}`
  : '';

export const MAP_CONFIG = {
  OSM_TILE_URL:
    process.env.EXPO_PUBLIC_OSM_TILE_URL ||
    mapTilerUrl ||
    'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  OSM_ATTRIBUTION: mapTilerUrl
    ? '© MapTiler © OpenStreetMap contributors'
    : '© OpenStreetMap contributors',
} as const;
