import React, { forwardRef, useImperativeHandle, useMemo, useRef, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Map, Camera, GeoJSONSource, Layer, Marker, Callout } from '@maplibre/maplibre-react-native';
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
        
        const opts: any = {};
        if (externalCameraCenter) opts.center = externalCameraCenter;
        if (externalCameraZoom !== undefined) opts.zoom = externalCameraZoom;
        if (externalCameraPitch !== undefined) opts.pitch = externalCameraPitch;
        if (externalCameraHeading !== undefined) opts.bearing = externalCameraHeading;

        if (opts.center) {
          cameraRef.current.easeTo(opts);
        } else if (opts.zoom !== undefined) {
          cameraRef.current.zoomTo(opts.zoom, opts);
        }
        
        // Disable flag after camera update so next user interaction is captured
        setTimeout(() => {
          isExternalUpdateRef.current = false;
        }, 100);
      }
    }, [externalCameraCenter, externalCameraZoom, externalCameraPitch, externalCameraHeading]);

    useImperativeHandle(ref, () => ({
      flyTo: (coordinate, duration = 600) => {
        cameraRef.current?.flyTo({ center: coordinate, duration });
      },
      fitBounds: (northEast, southWest, padding = 48, duration = 600) => {
        let viewPadding;
        if (typeof padding === 'number') {
          viewPadding = { top: padding, right: padding, bottom: padding, left: padding };
        } else if (Array.isArray(padding) && padding.length >= 2) {
          viewPadding = { 
            top: padding[0], bottom: padding[0], 
            left: padding[1] || padding[0], right: padding[1] || padding[0] 
          };
        }
        
        cameraRef.current?.fitBounds(
          [southWest[0], southWest[1], northEast[0], northEast[1]],
          { padding: viewPadding, duration }
        );
      },
      setCamera: (options) => {
        const opts: any = {};
        if (options.centerCoordinate) opts.center = options.centerCoordinate;
        if (options.zoomLevel !== undefined) opts.zoom = options.zoomLevel;
        if (options.pitch !== undefined) opts.pitch = options.pitch;
        if (options.heading !== undefined) opts.bearing = options.heading;
        if (options.animationDuration !== undefined) opts.duration = options.animationDuration;

        if (options.animationMode === 'flyTo' && opts.center) {
          cameraRef.current?.flyTo(opts);
        } else if (options.animationMode !== 'flyTo' && options.animationMode !== 'linearTo' && opts.center) {
          cameraRef.current?.easeTo(opts);
        } else if (opts.center) {
          cameraRef.current?.jumpTo(opts);
        } else if (opts.zoom !== undefined) {
          cameraRef.current?.zoomTo(opts.zoom, opts);
        }
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
      <Map
        style={{ flex: 1 }}
        mapStyle={styleURL}
        compass={true}
        compassPosition={{ bottom: 320, right: 16 }}
        compassHiddenFacingNorth={false}
        touchRotate={rotateEnabled}
        touchPitch={pitchEnabled}
        touchZoom={true}
        dragPan={true}
        onDidFinishLoadingMap={handleMapReady}
        onPress={onMapTouchStart}
        onLongPress={(event: any) => {
          // MapLibre v11 gives coordinates in `event.nativeEvent.lngLat`
          const coords = event?.nativeEvent?.lngLat || event?.geometry?.coordinates || event?.lngLat;
          if (!Array.isArray(coords) || coords.length < 2 || !onMapLongPress) return;
          onMapLongPress([coords[0], coords[1]]);
        }}
        onRegionDidChange={(event: any) => {
          // Skip firing callback if this was an external programmatic update
          if (isExternalUpdateRef.current) return;
          
          const viewState = event?.nativeEvent || event;
          const center = viewState?.center;
          if (!viewState || !onCameraChanged) return;

          onCameraChanged({
            centerCoordinate: Array.isArray(center) ? [center[0], center[1]] : undefined,
            zoom: viewState.zoom,
            pitch: viewState.pitch,
            heading: viewState.bearing !== undefined ? viewState.bearing : viewState.heading,
          });
        }}
      >
        <Camera
          ref={cameraRef}
          center={initialCenterCoordinate}
          zoom={initialZoomLevel}
          minZoom={minZoomLevel}
          maxZoom={maxZoomLevel}
          pitch={MAP_CONFIG.THREE_D_CAMERA.defaultPitch}
        />

        {lines.length > 0 ? (
          <GeoJSONSource id="route-lines" data={lineSource as any}>
            <Layer
              id="route-lines-layer"
              type="line"
              style={{
                lineColor: ['coalesce', ['get', 'color'], '#E8A020'],
                lineWidth: ['coalesce', ['get', 'width'], 4],
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          </GeoJSONSource>
        ) : null}

        {markers.map((marker) => {
          const isSelected = selectedMarkerId === marker.id;
          const hasMetadata = !!marker.metadata;

          return (
            <Marker
              key={marker.id}
              id={marker.id}
              lngLat={marker.coordinate}
              onPress={() => setSelectedMarkerId(marker.id)}
            >
              <>
                <TouchableOpacity
                  onPress={() => setSelectedMarkerId(marker.id)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  {marker.children || <View style={{ width: 10, height: 10 }} />}
                </TouchableOpacity>
                {isSelected && hasMetadata ? (
                  <Callout title={marker.metadata?.label || ''}>
                    <MapCallout
                      metadata={marker.metadata}
                      onClose={() => setSelectedMarkerId(null)}
                    />
                  </Callout>
                ) : (
                  <View />
                )}
              </>
            </Marker>
          );
        })}

        {children}
      </Map>
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
