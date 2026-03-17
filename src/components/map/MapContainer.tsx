/**
 * MapContainer Component
 * 
 * Main map wrapper component using react-native-maps with OpenStreetMap tiles.
 * NAV-001: Base map component
 * NAV-002: OSM tile integration (NO Google Maps API)
 * 
 * Architecture: Graph-Lite (No paid routing APIs)
 * 
 * @module components/map/MapContainer
 */

import React, { useRef, useCallback, forwardRef, useImperativeHandle, useEffect } from 'react';
import { StyleSheet, Platform, View, Text } from 'react-native';
import MapView, { UrlTile, Region, MapViewProps, Polyline, Marker } from 'react-native-maps';
import { IMUS_DEFAULT_REGION, type MapRegion, type MapCoordinate } from '../../utils/geoUtils';
import { UserLocationMarker } from './UserLocationMarker';
import {
  RouteWithDetails,
  MapCoordinate as RouteMapCoordinate,
  toMapCoordinates,
  GeoJSONCoordinate,
  getSegmentColor,
  TransferRoute,
} from '../../types/route';

/**
 * OpenStreetMap tile URL template
 * Uses standard OSM tile servers with subdomains for load balancing
 */
const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

/**
 * Alternative OSM tile URL with subdomain support (fallback)
 * Note: Standard OSM tiles don't use subdomains anymore, but this is kept for reference
 */
// const OSM_TILE_URL_WITH_SUBDOMAIN = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

/**
 * Props for MapContainer component
 */
export interface MapContainerProps {
  /** Initial region to display (defaults to Imus, Cavite) */
  initialRegion?: MapRegion;
  /**
   * User's current location (latitude/longitude) to show the blue dot.
   *
   * Note: This intentionally uses only the coordinate portion of the full
   * UserCoordinates object returned by useUserLocation. Additional fields
   * such as accuracy and heading are passed separately via userAccuracy
   * and userHeading props, and other metadata (altitude, speed, timestamp)
   * are not needed by MapContainer.
   */
  userLocation?: MapCoordinate | null;
  /** User's location accuracy in meters */
  userAccuracy?: number | null;
  /** User's heading in degrees */
  userHeading?: number | null;
  /** Whether to show the user location marker */
  showUserLocation?: boolean;
  /**
   * Route to display on the map.
   * When provided, draws a polyline and optionally fits the map to show the route.
   */
  route?: RouteWithDetails | null;
  /**
   * Transfer route with multiple legs (for multicolored polylines).
   * Each leg gets a different random color from SEGMENT_COLORS.
   */
  transferRoute?: TransferRoute | null;
  /**
   * Additional route coordinates to display (for transfer routes or multiple routes).
   * Each array represents a separate route segment.
   */
  additionalRoutes?: GeoJSONCoordinate[][] | null;
  /**
   * Whether to automatically fit the map to show the route when route changes.
   */
  autoFitToRoute?: boolean;
  /**
   * Route line color. Defaults to $paraBrand (#E9AE16).
   */
  routeColor?: string;
  /**
   * Route line width. Defaults to 5.
   */
  routeWidth?: number;
  /**
   * Whether to show route label markers along the path.
   */
  showRouteLabels?: boolean;
  /** Callback when region changes (pan/zoom) */
  onRegionChange?: (region: Region) => void;
  /** Callback when region change completes */
  onRegionChangeComplete?: (region: Region) => void;
  /** Callback when map is pressed */
  onPress?: MapViewProps['onPress'];
  /** Callback when map is long pressed */
  onLongPress?: MapViewProps['onLongPress'];
  /** Child components (markers, polylines, etc.) */
  children?: React.ReactNode;
  /** Custom style for the map container */
  style?: MapViewProps['style'];
  /** Whether the map is interactive */
  scrollEnabled?: boolean;
  /** Whether zoom is enabled */
  zoomEnabled?: boolean;
  /** Whether rotation is enabled */
  rotateEnabled?: boolean;
  /** Whether pitch/tilt is enabled */
  pitchEnabled?: boolean;
}

/**
 * Ref methods exposed by MapContainer
 */
export interface MapContainerRef {
  /** Animate to a specific region */
  animateToRegion: (region: MapRegion, duration?: number) => void;
  /** Animate to a specific coordinate */
  animateToCoordinate: (coordinate: MapCoordinate, duration?: number) => void;
  /** Fit map to show all given coordinates */
  fitToCoordinates: (coordinates: MapCoordinate[], options?: { edgePadding?: { top: number; right: number; bottom: number; left: number }; animated?: boolean }) => void;
  /** Get the underlying MapView ref */
  getMapRef: () => MapView | null;
}

/**
 * MapContainer component with OpenStreetMap tiles
 * 
 * This component wraps react-native-maps MapView and configures it to use
 * OpenStreetMap tiles instead of Google Maps, following the Graph-Lite architecture.
 * 
 * Features:
 * - OSM tile layer via UrlTile
 * - Default viewport centered on Imus, Cavite
 * - User location display (Blue Dot)
 * - Platform-specific optimizations
 * 
 * @example
 * ```tsx
 * const mapRef = useRef<MapContainerRef>(null);
 * 
 * <MapContainer
 *   ref={mapRef}
 *   userLocation={location}
 *   showUserLocation={true}
 *   onRegionChangeComplete={(region) => console.log('Region:', region)}
 * >
 *   <RoutePolyline coordinates={routeCoords} />
 *   <StopMarker coordinate={stopCoord} title="Palengke" />
 * </MapContainer>
 * ```
 */
export const MapContainer = forwardRef<MapContainerRef, MapContainerProps>(
  (
    {
      initialRegion = IMUS_DEFAULT_REGION,
      userLocation,
      userAccuracy,
      userHeading,
      showUserLocation = true,
      route,
      transferRoute,
      additionalRoutes,
      autoFitToRoute = true,
      routeColor = '#E9AE16', // $paraBrand
      routeWidth = 5,
      showRouteLabels = false,
      onRegionChange,
      onRegionChangeComplete,
      onPress,
      onLongPress,
      children,
      style,
      scrollEnabled = true,
      zoomEnabled = true,
      rotateEnabled = true,
      pitchEnabled = false, // Disabled by default for 2D navigation
    },
    ref
  ) => {
    const mapRef = useRef<MapView>(null);

    /**
     * Expose imperative methods via ref
     */
    useImperativeHandle(ref, () => ({
      animateToRegion: (region: MapRegion, duration = 500) => {
        mapRef.current?.animateToRegion(region, duration);
      },
      animateToCoordinate: (coordinate: MapCoordinate, duration = 500) => {
        mapRef.current?.animateToRegion(
          {
            ...coordinate,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          },
          duration
        );
      },
      fitToCoordinates: (coordinates, options) => {
        mapRef.current?.fitToCoordinates(coordinates, {
          edgePadding: options?.edgePadding ?? { top: 50, right: 50, bottom: 50, left: 50 },
          animated: options?.animated ?? true,
        });
      },
      getMapRef: () => mapRef.current,
    }));

    /**
     * Handle region change with debouncing consideration
     */
    const handleRegionChange = useCallback(
      (region: Region) => {
        onRegionChange?.(region);
      },
      [onRegionChange]
    );

    const handleRegionChangeComplete = useCallback(
      (region: Region) => {
        onRegionChangeComplete?.(region);
      },
      [onRegionChangeComplete]
    );

    /**
     * Auto-fit map to route when route changes
     */
    useEffect(() => {
      if (route && autoFitToRoute && route.geometry?.coordinates?.length > 0) {
        const coordinates = toMapCoordinates(route.geometry.coordinates);
        
        // Add small delay to ensure map is ready
        const timeoutId = setTimeout(() => {
          mapRef.current?.fitToCoordinates(coordinates, {
            edgePadding: { top: 100, right: 50, bottom: 300, left: 50 }, // Extra bottom padding for drawer
            animated: true,
          });
        }, 300);

        return () => clearTimeout(timeoutId);
      }
    }, [route, autoFitToRoute]);

    /**
     * Get route coordinates for polyline
     */
    const routeCoordinates = route?.geometry?.coordinates
      ? toMapCoordinates(route.geometry.coordinates)
      : null;

    /**
     * Get route label position (middle of route)
     */
    const routeLabelPosition = routeCoordinates && routeCoordinates.length > 2
      ? routeCoordinates[Math.floor(routeCoordinates.length / 2)]
      : null;

    return (
      <View style={[styles.container, style]}>
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={initialRegion}
          // Platform-specific map type configuration
          // Android: 'none' to show only UrlTile
          // iOS: 'standard' with UrlTile overlay (iOS handles 'none' differently)
          mapType="none"

          // Disable default Google Maps features

          showsUserLocation={false} // We use custom UserLocationMarker
          showsMyLocationButton={false}
          showsCompass={true}
          showsScale={true}
          showsBuildings={false}
          showsTraffic={false} // No Google Traffic layer
          showsIndoors={false}
          showsPointsOfInterest={false} // Disable Google POIs
          // Interaction settings
          scrollEnabled={scrollEnabled}
          zoomEnabled={zoomEnabled}
          rotateEnabled={rotateEnabled}
          pitchEnabled={pitchEnabled}
          // Performance optimizations
          loadingEnabled={true}
          loadingIndicatorColor="#4285F4"
          loadingBackgroundColor="#F5F5F5"
          moveOnMarkerPress={false}
          // Event handlers
          onRegionChange={handleRegionChange}
          onRegionChangeComplete={handleRegionChangeComplete}
          onPress={onPress}
          onLongPress={onLongPress}
          // Accessibility
          accessible={true}
          accessibilityLabel="Map showing Imus, Cavite area"
        >
          {/* OpenStreetMap Tile Layer */}
          <UrlTile
            urlTemplate={OSM_TILE_URL}
            maximumZ={19}
            minimumZ={1}
            flipY={false}
            zIndex={-1}
            // OSM tile server attribution (required by OSM license)
            // Note: Attribution should be shown in UI, not in tile component
          />

          {/* User Location Marker (Blue Dot) */}
          {showUserLocation && userLocation && (
            <UserLocationMarker
              coordinate={userLocation}
              accuracy={userAccuracy}
              heading={userHeading}
              showAccuracyCircle={true}
            />
          )}

          {/* Transfer Route - Multiple colored segments */}
          {transferRoute && transferRoute.legs?.map((leg, index) => {
            const legCoords = leg.route?.geometry?.coordinates;
            if (!legCoords || legCoords.length === 0) return null;
            
            return (
              <Polyline
                key={`transfer-leg-${index}`}
                coordinates={toMapCoordinates(legCoords)}
                strokeColor={getSegmentColor(index)}
                strokeWidth={routeWidth + 1}
                lineCap="round"
                lineJoin="round"
              />
            );
          })}

          {/* Direct Route Polyline - Split into multicolored segments */}
          {!transferRoute && routeCoordinates && routeCoordinates.length > 0 && (() => {
            // Split route into segments for multicolored display
            const numSegments = Math.min(10, Math.max(3, Math.ceil(routeCoordinates.length / 20)));
            const segmentSize = Math.ceil(routeCoordinates.length / numSegments);
            const segments: typeof routeCoordinates[] = [];
            
            for (let i = 0; i < routeCoordinates.length - 1; i += segmentSize) {
              // Include one overlapping point for seamless connection
              const end = Math.min(i + segmentSize + 1, routeCoordinates.length);
              segments.push(routeCoordinates.slice(i, end));
            }
            
            return segments.map((segment, index) => (
              <Polyline
                key={`route-segment-${index}`}
                coordinates={segment}
                strokeColor={getSegmentColor(index)}
                strokeWidth={routeWidth}
                lineCap="round"
                lineJoin="round"
              />
            ));
          })()}

          {/* Additional Routes (for multiple route options - dashed) */}
          {additionalRoutes?.map((coords, index) => (
            <Polyline
              key={`route-${index}`}
              coordinates={toMapCoordinates(coords)}
              strokeColor={getSegmentColor(index)}
              strokeWidth={routeWidth - 1}
              lineCap="round"
              lineJoin="round"
              lineDashPattern={[10, 5]}
            />
          ))}

          {/* Route Label Marker */}
          {showRouteLabels && route && routeLabelPosition && (
            <Marker
              coordinate={routeLabelPosition}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <View style={styles.routeLabelContainer}>
                <Text style={styles.routeLabelText}>
                  {route.signboard || route.routeId.split('-').pop()}
                </Text>
              </View>
            </Marker>
          )}

          {/* Child components (custom markers, etc.) */}
          {children}
        </MapView>

        {/* OSM Attribution (Required by OpenStreetMap license) */}
        <View style={styles.attribution}>
          <Text style={styles.attributionText}>© OpenStreetMap contributors</Text>
        </View>
      </View>
    );
  }
);

MapContainer.displayName = 'MapContainer';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    zIndex: 0, // Ensure map is at base layer
  },
  map: {
    flex: 1,
    zIndex: 0,
  },
  attribution: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
  },
  attributionText: {
    fontSize: 10,
    color: '#666666',
  },
  routeLabelContainer: {
    backgroundColor: '#E9AE16',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  routeLabelText: {
    fontFamily: 'Inter',
    fontSize: 12,
    fontWeight: '700',
    color: '#1C1B1F',
  },
});

export default MapContainer;
