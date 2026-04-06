let mapLibreModule: any = null;
let mapLibreLoadError: unknown = null;

try {
  // Some builds (for example Expo Go) do not include MapLibre native binaries.
  mapLibreModule = require('@maplibre/maplibre-react-native');
} catch (error) {
  mapLibreLoadError = error;
}

export const MapLibreModule = mapLibreModule;
export const mapLibreRuntimeLoadError = mapLibreLoadError;

const resolvedMapLibreModule = mapLibreModule?.default ?? mapLibreModule;

export const MapLibreComponents = {
  Map: resolvedMapLibreModule?.Map,
  Camera: resolvedMapLibreModule?.Camera,
  GeoJSONSource: resolvedMapLibreModule?.GeoJSONSource ?? resolvedMapLibreModule?.ShapeSource,
  Layer: resolvedMapLibreModule?.Layer ?? resolvedMapLibreModule?.SymbolLayer,
  Marker: resolvedMapLibreModule?.Marker,
  Callout: resolvedMapLibreModule?.Callout,
  Images: resolvedMapLibreModule?.Images,
  ShapeSource: resolvedMapLibreModule?.ShapeSource ?? resolvedMapLibreModule?.GeoJSONSource,
  SymbolLayer: resolvedMapLibreModule?.SymbolLayer ?? resolvedMapLibreModule?.Layer,
  PointAnnotation: resolvedMapLibreModule?.PointAnnotation,
};
