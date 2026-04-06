import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import { POI_ICON_MATCH_EXPRESSION, POI_IMAGES, POI_MIN_RENDER_ZOOM } from '../constants/poi';
import { useTheme } from '../src/theme/ThemeContext';
import type { POIFeature, POIFeatureCollection } from '../types/poi';
import { MapLibreComponents } from '../services/mapLibreRuntime';

const ImagesComponent = MapLibreComponents.Images;
const GeoJSONSourceComponent = MapLibreComponents.GeoJSONSource;
const LayerComponent = MapLibreComponents.Layer;
const MarkerComponent = MapLibreComponents.Marker;

type LngLat = [number, number];

type PoiOverlayProps = {
  poiFeatureCollection: POIFeatureCollection | null;
  currentZoom: number;
  activeUserCoordinate?: LngLat;
  minZoomLevel?: number;
  onSelectPoi?: (poi: POIFeature) => void;
};

const getPoiPriority = (feature: POIFeature): number => {
  const poiType = (feature.properties.landmark_type || feature.properties.category || 'other').toLowerCase();

  switch (poiType) {
    case 'terminal':
      return 1;
    case 'shopping_mall':
      return 2;
    case 'hospital':
      return 3;
    case 'school':
      return 4;
    case 'government':
      return 5;
    case 'restaurant':
    case 'coffee_shop':
      return 10;
    case 'convenience_store':
      return 12;
    default:
      return 50;
  }
};

const getLabelGridSizeByZoom = (zoom: number): number => {
  if (zoom >= 18) return 0.00035;
  if (zoom >= 17.5) return 0.00042;
  if (zoom >= 17) return 0.00060;
  if (zoom >= 16.5) return 0.00090;
  if (zoom >= 16) return 0.00125;
  if (zoom >= 15) return 0.00160;
  if (zoom >= 14) return 0.00200;
  if (zoom >= 13) return 0.00240;
  if (zoom >= 12) return 0.00300;
  return 0.00400;
};

const getLabelLimitByZoom = (zoom: number): number => {
  if (zoom >= 18) return 32;
  if (zoom >= 17.5) return 24;
  if (zoom >= 17) return 18;
  if (zoom >= 16.5) return 14;
  if (zoom >= 16) return 10;
  if (zoom >= 15) return 6;
  if (zoom >= 14) return 4;
  if (zoom >= 13) return 3;
  if (zoom >= 12) return 2;
  return 0;
};

const pickVisiblePoiLabels = (
  features: POIFeature[],
  zoom: number,
  activeUserCoordinate?: LngLat,
): POIFeature[] => {
  const maxLabels = getLabelLimitByZoom(zoom);
  if (features.length === 0 || maxLabels <= 0) return [];

  const cellSize = getLabelGridSizeByZoom(zoom);
  const occupied = new Set<string>();

  const sorted = [...features].sort((a, b) => {
    const priorityDiff = getPoiPriority(a) - getPoiPriority(b);
    if (priorityDiff !== 0) return priorityDiff;
    return a.properties.title.localeCompare(b.properties.title);
  });

  const selected: POIFeature[] = [];
  for (const feature of sorted) {
    const [lng, lat] = feature.geometry.coordinates;

    if (activeUserCoordinate) {
      const dLng = lng - activeUserCoordinate[0];
      const dLat = lat - activeUserCoordinate[1];
      if (dLng * dLng + dLat * dLat < 0.0000005) {
        continue;
      }
    }

    const gridX = Math.floor(lng / cellSize);
    const gridY = Math.floor(lat / cellSize);
    const key = `${gridX}:${gridY}`;
    if (occupied.has(key)) continue;

    occupied.add(key);
    selected.push(feature);

    if (selected.length >= maxLabels) break;
  }

  return selected;
};

export default function PoiOverlay({
  poiFeatureCollection,
  currentZoom,
  activeUserCoordinate,
  minZoomLevel = POI_MIN_RENDER_ZOOM,
  onSelectPoi,
}: PoiOverlayProps) {
  const { isDark } = useTheme();

  if (!GeoJSONSourceComponent || !LayerComponent) {
    return null;
  }

  const hasPoiFeatures = !!poiFeatureCollection && poiFeatureCollection.features.length > 0;

  const poiById = useMemo(() => {
    if (!poiFeatureCollection) return new Map<string, POIFeature>();
    return new Map(poiFeatureCollection.features.map((feature) => [String(feature.id), feature]));
  }, [poiFeatureCollection]);

  const visiblePoiLabels = useMemo(() => {
    if (!hasPoiFeatures || !poiFeatureCollection) return [];
    return pickVisiblePoiLabels(poiFeatureCollection.features, currentZoom, activeUserCoordinate);
  }, [hasPoiFeatures, poiFeatureCollection, currentZoom, activeUserCoordinate]);

  const iconLayerStyle = useMemo(
    () => ({
      iconImage: POI_ICON_MATCH_EXPRESSION,
      iconSize: ['interpolate', ['linear'], ['zoom'], 13, 0.26, 15, 0.35, 17, 0.5, 19, 0.62],
      iconAllowOverlap: false,
      iconIgnorePlacement: false,
      iconAnchor: 'bottom',
      iconPadding: 22,
      textColor: isDark ? '#FFFFFF' : '#0A1628',
      textHaloColor: isDark ? '#000000' : '#FFFFFF',
      symbolSortKey: [
        'match',
        ['coalesce', ['get', 'landmark_type'], ['get', 'category'], 'other'],
        'terminal',
        1,
        'shopping_mall',
        2,
        'hospital',
        3,
        'school',
        4,
        'government',
        5,
        'restaurant',
        10,
        'coffee_shop',
        10,
        'convenience_store',
        12,
        50,
      ],
    }),
    [isDark],
  );

  if (!hasPoiFeatures || !poiFeatureCollection) return null;

  const handlePoiPress = (event: any) => {
    if (!onSelectPoi) return;

    const pressedFeature = event?.features?.[0];
    const pressedId =
      pressedFeature?.properties?.id ??
      pressedFeature?.id ??
      event?.payload?.id;

    if (pressedId == null) return;

    const selected = poiById.get(String(pressedId));
    if (selected) {
      onSelectPoi(selected);
    }
  };

  return (
    <>
      {ImagesComponent ? <ImagesComponent images={POI_IMAGES as any} /> : null}
      <GeoJSONSourceComponent
        id="poi-source"
        data={poiFeatureCollection as any}
        onPress={handlePoiPress}
      >
        <LayerComponent
          id="poi-symbol-layer"
          type="symbol"
          minZoomLevel={minZoomLevel}
          maxZoomLevel={22}
          style={iconLayerStyle as any}
        />
      </GeoJSONSourceComponent>

      {MarkerComponent
        ? visiblePoiLabels.map((feature) => (
            <MarkerComponent
              key={`poi-label-${feature.id}`}
              id={`poi-label-${feature.id}`}
              lngLat={feature.geometry.coordinates as [number, number]}
              onPress={() => onSelectPoi?.(feature)}
            >
              <View collapsable={false} style={{ paddingLeft: 12 }}>
                <Text
                  style={{
                    fontSize: 11,
                    color: isDark ? '#FFFFFF' : '#0A1628',
                    textShadowColor: isDark ? '#000000' : '#FFFFFF',
                    textShadowRadius: 2,
                    fontWeight: '600',
                    paddingHorizontal: 6,
                    paddingVertical: 10,
                    borderRadius: 6,
                    overflow: 'hidden',
                    maxWidth: 120,
                  }}
                  numberOfLines={2}
                >
                  {feature.properties.title}
                </Text>
              </View>
            </MarkerComponent>
          ))
        : null}
    </>
  );
}
