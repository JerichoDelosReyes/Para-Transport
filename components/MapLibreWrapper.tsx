import React, { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { View } from 'react-native';
import MapLibreGL from '@maplibre/maplibre-react-native';
import { MAP_CONFIG } from '../constants/map';

type LngLat = [number, number];

export type MapMarkerInput = {
  id: string;
  coordinate: LngLat;
  children?: React.ReactElement;
};

export type MapLineInput = {
  id: string;
  coordinates: LngLat[];
  color?: string;
  width?: number;
  dashArray?: number[];
};

export type MapLibreWrapperHandle = {
  flyTo: (coordinate: LngLat, duration?: number) => void;
  setCamera: (options: {
    centerCoordinate?: LngLat;
    zoomLevel?: number;
    pitch?: number;
    heading?: number;
    animationDuration?: number;
  }) => void;
};

export type MapLibreWrapperProps = {
  styleURL?: string;
  initialCenterCoordinate: LngLat;
  initialZoomLevel?: number;
  minZoomLevel?: number;
  maxZoomLevel?: number;
  pitchEnabled?: boolean;
  rotateEnabled?: boolean;
  onMapReady?: () => void;
  onMapTouchStart?: () => void;
  onMapLongPress?: (coordinate: LngLat) => void;
  onCameraChanged?: (payload: {
    centerCoordinate?: LngLat;
    zoom?: number;
    pitch?: number;
    heading?: number;
  }) => void;
  markers?: MapMarkerInput[];
  lines?: MapLineInput[];
  children?: React.ReactNode;
};

const toFeatureCollection = (lines: MapLineInput[]) => ({
  type: 'FeatureCollection',
  features: lines
    .filter((line) => line.coordinates.length >= 2)
    .map((line) => ({
      type: 'Feature',
      id: line.id,
      properties: {
        color: line.color || '#E8A020',
        width: line.width || 4,
        dashArray: line.dashArray,
      },
      geometry: {
        type: 'LineString',
        coordinates: line.coordinates,
      },
    })),
});

export const MapLibreWrapper = forwardRef<MapLibreWrapperHandle, MapLibreWrapperProps>(
  (
    {
      styleURL = MAP_CONFIG.RESOLVED_STYLE_URL,
      initialCenterCoordinate,
      initialZoomLevel = 13,
      minZoomLevel = 10,
      maxZoomLevel = 18,
      pitchEnabled = true,
      rotateEnabled = true,
      onMapReady,
      onMapTouchStart,
      onMapLongPress,
      onCameraChanged,
      markers = [],
      lines = [],
      children,
    },
    ref,
  ) => {
    const cameraRef = useRef<any>(null);

    useImperativeHandle(ref, () => ({
      flyTo: (coordinate, duration = 600) => {
        cameraRef.current?.flyTo(coordinate, duration);
      },
      setCamera: (options) => {
        cameraRef.current?.setCamera({
          centerCoordinate: options.centerCoordinate,
          zoomLevel: options.zoomLevel,
          pitch: options.pitch,
          heading: options.heading,
          animationDuration: options.animationDuration,
        });
      },
    }));

    const lineSource = useMemo(() => toFeatureCollection(lines), [lines]);

    return (
      <MapLibreGL.MapView
        style={{ flex: 1 }}
        mapStyle={styleURL}
        compassEnabled={false}
        rotateEnabled={rotateEnabled}
        pitchEnabled={pitchEnabled}
        zoomEnabled
        scrollEnabled
        onDidFinishLoadingMap={onMapReady}
        onPress={onMapTouchStart}
        onLongPress={(event: any) => {
          const coords = event?.geometry?.coordinates;
          if (!Array.isArray(coords) || coords.length < 2 || !onMapLongPress) return;
          onMapLongPress([coords[0], coords[1]]);
        }}
        onRegionDidChange={(event: any) => {
          const properties = event?.properties;
          const center = event?.geometry?.coordinates;
          if (!properties || !onCameraChanged) return;

          onCameraChanged({
            centerCoordinate: Array.isArray(center) ? [center[0], center[1]] : undefined,
            zoom: properties.zoomLevel,
            pitch: properties.pitch,
            heading: properties.heading,
          });
        }}
      >
        <MapLibreGL.Camera
          ref={cameraRef}
          centerCoordinate={initialCenterCoordinate}
          zoomLevel={initialZoomLevel}
          minZoomLevel={minZoomLevel}
          maxZoomLevel={maxZoomLevel}
          pitch={MAP_CONFIG.THREE_D_CAMERA.defaultPitch}
        />

        {lines.length > 0 ? (
          <MapLibreGL.ShapeSource id="route-lines" shape={lineSource as any}>
            <MapLibreGL.LineLayer
              id="route-lines-layer"
              style={{
                lineColor: ['coalesce', ['get', 'color'], '#E8A020'],
                lineWidth: ['coalesce', ['get', 'width'], 4],
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          </MapLibreGL.ShapeSource>
        ) : null}

        {markers.map((marker) => (
          <MapLibreGL.PointAnnotation
            key={marker.id}
            id={marker.id}
            coordinate={marker.coordinate}
          >
            {marker.children || <View style={{ width: 10, height: 10 }} />}
          </MapLibreGL.PointAnnotation>
        ))}

        {children}
      </MapLibreGL.MapView>
    );
  },
);

MapLibreWrapper.displayName = 'MapLibreWrapper';
