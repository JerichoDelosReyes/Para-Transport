import React, { forwardRef, useImperativeHandle, useMemo, useRef, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import MapLibreGL from '@maplibre/maplibre-react-native';
import { MAP_CONFIG } from '../constants/map';
import { COLORS, TYPOGRAPHY, SPACING } from '../constants/theme';
import { mapDiagnostics } from '../services/mapDiagnosticsService';

type LngLat = [number, number];

export type MapMarkerMetadata = {
  label?: string;
  type?: string;
  subtitle?: string;
  routeName?: string;
};

export type MapMarkerInput = {
  id: string;
  coordinate: LngLat;
  children?: React.ReactElement;
  metadata?: MapMarkerMetadata;
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
  fitBounds: (
    northEast: LngLat,
    southWest: LngLat,
    padding?: number | number[],
    duration?: number,
  ) => void;
  setCamera: (options: {
    centerCoordinate?: LngLat;
    zoomLevel?: number;
    pitch?: number;
    heading?: number;
    animationDuration?: number;
    animationMode?: 'easeTo' | 'flyTo' | 'linearTo';
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
  /**
   * External camera control: if provided, overrides internal camera state
   * Allows parent to control camera position dynamically
   */
  externalCameraCenter?: LngLat;
  externalCameraZoom?: number;
  externalCameraPitch?: number;
  externalCameraHeading?: number;
};

// Callout component for displaying marker metadata
interface MapCalloutProps {
  metadata?: MapMarkerMetadata;
  onClose: () => void;
}

const MapCallout: React.FC<MapCalloutProps> = ({ metadata, onClose }) => {
  if (!metadata) return null;

  return (
    <View style={styles.calloutContainer}>
      <View style={styles.calloutContent}>
        {metadata.label && (
          <Text style={styles.calloutLabel} numberOfLines={1}>
            {metadata.label}
          </Text>
        )}
        {metadata.type && (
          <Text style={styles.calloutType} numberOfLines={2}>
            {metadata.type}
          </Text>
        )}
        {metadata.routeName && (
          <Text style={styles.calloutRoute} numberOfLines={1}>
            Route: {metadata.routeName}
          </Text>
        )}
        {metadata.subtitle && (
          <Text style={styles.calloutSubtitle} numberOfLines={1}>
            {metadata.subtitle}
          </Text>
        )}
      </View>
      <TouchableOpacity
        style={styles.calloutClose}
        onPress={onClose}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={styles.calloutCloseText}>×</Text>
      </TouchableOpacity>
    </View>
  );
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
      externalCameraCenter,
      externalCameraZoom,
      externalCameraPitch,
      externalCameraHeading,
    },
    ref,
  ) => {
    const cameraRef = useRef<any>(null);
    const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
    const selectedMarker = markers.find((m) => m.id === selectedMarkerId);
    const mapInitStartRef = useRef<number>(Date.now());
    const isExternalUpdateRef = useRef(false);

    // Log initialization
    useEffect(() => {
      try {
        mapDiagnostics.logStyleResolution(
          MAP_CONFIG.STYLE_URL_STRATEGY,
          styleURL,
          MAP_CONFIG.STYLE_URL_PINNED_VERSION,
          MAP_CONFIG.STYLE_URL_FALLBACK,
        );
        mapDiagnostics.logMapInitStart(initialCenterCoordinate, initialZoomLevel ?? 13);
        mapInitStartRef.current = Date.now();
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        mapDiagnostics.logInitError(error, 'initialization setup');
      }
    }, []);

    // Handle external camera updates from parent (e.g., zoom buttons, locate user)
    useEffect(() => {
      if (!cameraRef.current) return;
      
      // Check if any external camera prop was provided
      if (externalCameraCenter || externalCameraZoom !== undefined || externalCameraPitch !== undefined || externalCameraHeading !== undefined) {
        isExternalUpdateRef.current = true;
        
        cameraRef.current.setCamera({
          centerCoordinate: externalCameraCenter,
          zoomLevel: externalCameraZoom,
          pitch: externalCameraPitch,
          heading: externalCameraHeading,
        });
        
        // Disable flag after camera update so next user interaction is captured
        setTimeout(() => {
          isExternalUpdateRef.current = false;
        }, 100);
      }
    }, [externalCameraCenter, externalCameraZoom, externalCameraPitch, externalCameraHeading]);

    useImperativeHandle(ref, () => ({
      flyTo: (coordinate, duration = 600) => {
        cameraRef.current?.flyTo(coordinate, duration);
      },
      fitBounds: (northEast, southWest, padding = 48, duration = 600) => {
        cameraRef.current?.fitBounds(northEast, southWest, padding, duration);
      },
      setCamera: (options) => {
        cameraRef.current?.setCamera({
          centerCoordinate: options.centerCoordinate,
          zoomLevel: options.zoomLevel,
          pitch: options.pitch,
          heading: options.heading,
          animationDuration: options.animationDuration,
          animationMode: options.animationMode,
        });
      },
    }));

    const lineSource = useMemo(() => toFeatureCollection(lines), [lines]);

    const handleMapReady = async () => {
      try {
        const duration = Date.now() - mapInitStartRef.current;
        mapDiagnostics.logMapReady(duration);

        // Blank-map detection: check if the style has loaded
        // If map is ready but no visible tiles, likely a style/network issue
        if (!styleURL) {
          mapDiagnostics.logBlankMapDetected({
            reason: 'No style URL provided',
            styleURL: styleURL || '(empty)',
          });
        }

        // Call user's onMapReady callback
        if (onMapReady) {
          onMapReady();
        }
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        mapDiagnostics.logInitError(error, 'map ready handler');
      }
    };

    return (
      <MapLibreGL.MapView
        style={{ flex: 1 }}
        mapStyle={styleURL}
        compassEnabled={false}
        rotateEnabled={rotateEnabled}
        pitchEnabled={pitchEnabled}
        zoomEnabled
        scrollEnabled
        onDidFinishLoadingMap={handleMapReady}
        onPress={onMapTouchStart}
        onLongPress={(event: any) => {
          const coords = event?.geometry?.coordinates;
          if (!Array.isArray(coords) || coords.length < 2 || !onMapLongPress) return;
          onMapLongPress([coords[0], coords[1]]);
        }}
        onRegionDidChange={(event: any) => {
          // Skip firing callback if this was an external programmatic update
          if (isExternalUpdateRef.current) return;
          
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
          centerCoordinate={externalCameraCenter ?? initialCenterCoordinate}
          zoomLevel={externalCameraZoom ?? initialZoomLevel}
          minZoomLevel={minZoomLevel}
          maxZoomLevel={maxZoomLevel}
          pitch={externalCameraPitch ?? MAP_CONFIG.THREE_D_CAMERA.defaultPitch}
          heading={externalCameraHeading ?? 0}
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

        {markers.map((marker) => {
          const isSelected = selectedMarkerId === marker.id;
          const hasMetadata = !!marker.metadata;

          return (
            <MapLibreGL.PointAnnotation
              key={marker.id}
              id={marker.id}
              coordinate={marker.coordinate}
              onSelected={() => setSelectedMarkerId(marker.id)}
            >
              <>
                <TouchableOpacity
                  onPress={() => setSelectedMarkerId(marker.id)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  {marker.children || <View style={{ width: 10, height: 10 }} />}
                </TouchableOpacity>
                {isSelected && hasMetadata ? (
                  <MapLibreGL.Callout title={marker.metadata?.label || ''}>
                    <MapCallout
                      metadata={marker.metadata}
                      onClose={() => setSelectedMarkerId(null)}
                    />
                  </MapLibreGL.Callout>
                ) : (
                  <View />
                )}
              </>
            </MapLibreGL.PointAnnotation>
          );
        })}

        {children}
      </MapLibreGL.MapView>
    );
  },
);

MapLibreWrapper.displayName = 'MapLibreWrapper';

const styles = StyleSheet.create({
  calloutContainer: {
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 160,
    maxWidth: 260,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(10,22,40,0.15)',
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  calloutContent: {
    flex: 1,
    marginRight: 8,
  },
  calloutLabel: {
    fontFamily: 'Inter',
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.navy,
    marginBottom: 2,
  },
  calloutType: {
    fontFamily: 'Inter',
    fontSize: 12,
    color: COLORS.textMuted,
    marginBottom: 3,
  },
  calloutRoute: {
    fontFamily: 'Inter',
    fontSize: 11,
    color: '#666666',
    marginBottom: 2,
    fontWeight: '500',
  },
  calloutSubtitle: {
    fontFamily: 'Inter',
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  calloutClose: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -4,
  },
  calloutCloseText: {
    fontSize: 20,
    fontWeight: '300',
    color: '#999999',
  },
});
