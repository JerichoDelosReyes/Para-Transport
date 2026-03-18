export const MAP_CONFIG = {
  OSM_TILE_URL:
    process.env.EXPO_PUBLIC_OSM_TILE_URL ||
    'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  OSM_ATTRIBUTION: '© OpenStreetMap contributors',
} as const;
