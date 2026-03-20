import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions, ActivityIndicator, Platform, Keyboard, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import MapView, { UrlTile, Marker, Polyline, Callout, Region } from 'react-native-maps';
import { BlurView } from 'expo-blur';
import * as Location from 'expo-location';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../../constants/theme';
import { MAP_CONFIG } from '../../constants/map';
import { useCommuteRoutes } from '../../hooks/useCommuteRoutes';
import { useTransitData } from '../../hooks/useTransitData';
import RouteListPanel from '../../components/RouteListPanel';
import SearchScreen, { PlaceResult } from '../../components/SearchScreen';
import { splitRouteSegments } from '../../utils/routeSegments';

const { height, width } = Dimensions.get('window');

const MODES = ['Jeepney', 'Tricycle', 'UV Express', 'Bus', 'LRT'];
const ROUTING_BASE_URL = 'https://router.project-osrm.org/route/v1/driving';

type MapCoordinate = {
  latitude: number;
  longitude: number;
};

const PH_BOUNDS = MAP_CONFIG.PHILIPPINES_BOUNDS;
const PH_CENTER_LAT = (PH_BOUNDS.minLatitude + PH_BOUNDS.maxLatitude) / 2;
const PH_CENTER_LNG = (PH_BOUNDS.minLongitude + PH_BOUNDS.maxLongitude) / 2;
const PH_MAX_LAT_DELTA = PH_BOUNDS.maxLatitude - PH_BOUNDS.minLatitude;
const PH_MAX_LNG_DELTA = PH_BOUNDS.maxLongitude - PH_BOUNDS.minLongitude;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const clampToPhilippinesRegion = (region: Region): Region => {
  const latitudeDelta = clamp(region.latitudeDelta, 0.002, PH_MAX_LAT_DELTA);
  const longitudeDelta = clamp(region.longitudeDelta, 0.002, PH_MAX_LNG_DELTA);

  const minCenterLat = PH_BOUNDS.minLatitude + latitudeDelta / 2;
  const maxCenterLat = PH_BOUNDS.maxLatitude - latitudeDelta / 2;
  const minCenterLng = PH_BOUNDS.minLongitude + longitudeDelta / 2;
  const maxCenterLng = PH_BOUNDS.maxLongitude - longitudeDelta / 2;

  return {
    latitude: clamp(region.latitude, minCenterLat, maxCenterLat),
    longitude: clamp(region.longitude, minCenterLng, maxCenterLng),
    latitudeDelta,
    longitudeDelta,
  };
};

const regionsAreClose = (a: Region, b: Region): boolean => (
  Math.abs(a.latitude - b.latitude) < 0.0001 &&
  Math.abs(a.longitude - b.longitude) < 0.0001 &&
  Math.abs(a.latitudeDelta - b.latitudeDelta) < 0.0001 &&
  Math.abs(a.longitudeDelta - b.longitudeDelta) < 0.0001
);

const toMapCoordinates = (coordinates: number[][]): MapCoordinate[] =>
  coordinates.map(([lng, lat]) => ({ latitude: lat, longitude: lng }));

export default function HomeScreen() {
  const [selectedMode, setSelectedMode] = useState('Jeepney');
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [isMapInteracted, setIsMapInteracted] = useState(false);
  const [destinationQuery, setDestinationQuery] = useState('');
  const [originQuery, setOriginQuery] = useState('');
  const [isRouting, setIsRouting] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<MapCoordinate | null>(null);
  const [destinationLocation, setDestinationLocation] = useState<MapCoordinate | null>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<MapCoordinate[]>([]);
  const [routeSummary, setRouteSummary] = useState<{ distanceKm: number; durationMin: number } | null>(null);
  const [showRoutes, setShowRoutes] = useState(true);
  const [matchedCommute, setMatchedCommute] = useState<any>(null); // from useCommuteRoutes
  const { routes: commuteRoutes } = useCommuteRoutes();
  const { routes: transitRoutes, stops: transitStops, loading: transitLoading, error: transitError, refresh: refreshTransit } = useTransitData();
  const [selectedTransitRoute, setSelectedTransitRoute] = useState<any>(null);
  const [showTransitLayer, setShowTransitLayer] = useState(true);
  const [nearestStop, setNearestStop] = useState<any>(null);
  const mapRef = useRef<MapView | null>(null);
  const lastClampedRegionRef = useRef<Region | null>(null);
  const currentRegionRef = useRef<Region>({
    latitude: PH_CENTER_LAT,
    longitude: PH_CENTER_LNG,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  });



  // Handle selecting a transit route from the panel
  const handleSelectTransitRoute = useCallback((route: any) => {
    setSelectedTransitRoute((prev: any) => prev?.id === route.id ? null : route);
    if (route.coordinates?.length > 0) {
      mapRef.current?.fitToCoordinates(route.coordinates, {
        edgePadding: { top: 120, right: 40, bottom: 200, left: 40 },
        animated: true,
      });
    }
  }, []);

  // Find the nearest stop to the user's current location
  const handleFindNearestStop = useCallback(() => {
    if (!currentLocation) {
      Alert.alert('GPS Not Ready', 'Waiting for your current location.');
      return;
    }
    if (transitStops.length === 0) {
      Alert.alert('No Stops', 'No transit stops loaded yet.');
      return;
    }

    let closest: any = null;
    let closestDist = Infinity;
    for (const stop of transitStops) {
      const dlat = stop.coordinate.latitude - currentLocation.latitude;
      const dlng = stop.coordinate.longitude - currentLocation.longitude;
      const dist = dlat * dlat + dlng * dlng;
      if (dist < closestDist) {
        closestDist = dist;
        closest = stop;
      }
    }

    if (closest) {
      setNearestStop(closest);
      mapRef.current?.animateToRegion({
        latitude: closest.coordinate.latitude,
        longitude: closest.coordinate.longitude,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      }, 600);
    }
  }, [currentLocation, transitStops]);

  const handleRegionChangeComplete = useCallback((region: Region) => {
    currentRegionRef.current = region;
    const clampedRegion = clampToPhilippinesRegion(region);

    if (regionsAreClose(region, clampedRegion)) {
      return;
    }

    if (
      lastClampedRegionRef.current &&
      regionsAreClose(lastClampedRegionRef.current, clampedRegion)
    ) {
      return;
    }

    lastClampedRegionRef.current = clampedRegion;
    mapRef.current?.animateToRegion(clampedRegion, 0);
  }, []);

  // Visible routes: if a route is selected show only that, otherwise show all
  const visibleTransitRoutes = useMemo(() => {
    if (!showTransitLayer) return [];
    if (selectedTransitRoute) return [selectedTransitRoute];
    return transitRoutes;
  }, [showTransitLayer, selectedTransitRoute, transitRoutes]);

  // Visible stops: show stops for selected route or all stops
  const visibleTransitStops = useMemo(() => {
    if (!showTransitLayer) return [];
    if (selectedTransitRoute?.stops?.length > 0) return selectedTransitRoute.stops;
    return transitStops;
  }, [showTransitLayer, selectedTransitRoute, transitStops]);

  // Split searched route into on-transit (solid) and walking (dashed) segments
  const routeSegments = useMemo(() => {
    if (routeCoordinates.length < 2) return [];
    return splitRouteSegments(routeCoordinates, transitRoutes, 200);
  }, [routeCoordinates, transitRoutes]);



  useEffect(() => {
    let locationSubscription: Location.LocationSubscription | null = null;

    const startLocationTracking = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          return;
        }

        const initial = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        setCurrentLocation({
          latitude: initial.coords.latitude,
          longitude: initial.coords.longitude,
        });

        locationSubscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            distanceInterval: 10,
            timeInterval: 4000,
          },
          (position) => {
            setCurrentLocation({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            });
          }
        );
      } catch (error) {
        console.warn('[HomeScreen] Location tracking failed:', error);
      }
    };

    startLocationTracking();

    return () => {
      locationSubscription?.remove();
    };
  }, []);

  const handleSearchSelectRoute = useCallback(async (origin: PlaceResult | null, destination: PlaceResult) => {
    setIsSearchActive(false);
    setDestinationQuery(destination.title);

    const dest = destination.title.trim().toLowerCase();
    const orig = origin?.title.trim().toLowerCase() || 'buendia';

    // Match commute data
    const matches = commuteRoutes.filter((r: any) => r.destination.toLowerCase().includes(dest));
    let bestMatch = matches.find((r: any) => r.origin.toLowerCase().includes(orig));
    if (!bestMatch && matches.length > 0) bestMatch = matches[0];
    setMatchedCommute(bestMatch || null);

    const destinationPoint: MapCoordinate = {
      latitude: destination.latitude,
      longitude: destination.longitude,
    };
    setDestinationLocation(destinationPoint);

    // Determine start point
    const startPoint = origin
      ? { latitude: origin.latitude, longitude: origin.longitude }
      : currentLocation;

    if (!startPoint) {
      mapRef.current?.animateToRegion({
        ...destinationPoint,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 600);
      return;
    }

    if (origin) {
      setOriginQuery(origin.title);
    }

    setIsRouting(true);
    try {
      const routeResponse = await fetch(
        `${ROUTING_BASE_URL}/${startPoint.longitude},${startPoint.latitude};${destinationPoint.longitude},${destinationPoint.latitude}?overview=full&geometries=geojson`
      );

      if (!routeResponse.ok) throw new Error(`Routing failed (${routeResponse.status})`);

      const routeResult = await routeResponse.json();
      const bestRoute = routeResult?.routes?.[0];
      if (!bestRoute?.geometry?.coordinates) {
        Alert.alert('Route Not Found', 'No drivable route found for this destination.');
        return;
      }

      const mappedCoordinates = toMapCoordinates(bestRoute.geometry.coordinates);
      setRouteCoordinates(mappedCoordinates);
      setRouteSummary({
        distanceKm: bestRoute.distance / 1000,
        durationMin: bestRoute.duration / 60,
      });

      mapRef.current?.fitToCoordinates(mappedCoordinates, {
        edgePadding: { top: 120, right: 40, bottom: 220, left: 40 },
        animated: true,
      });
    } catch (error) {
      console.warn('[HomeScreen] Route search failed:', error);
      Alert.alert('Search Failed', 'Unable to fetch route right now. Please try again.');
    } finally {
      setIsRouting(false);
    }
  }, [currentLocation, commuteRoutes]);

  return (
    <View style={styles.screen}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        mapType="none"
        initialRegion={{
          latitude: PH_CENTER_LAT,
          longitude: PH_CENTER_LNG,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
        showsUserLocation={true}
        showsMyLocationButton={false}
        showsCompass={false}
        onMapReady={() => setIsMapLoaded(true)}
        onTouchStart={() => setIsMapInteracted(true)}
        onRegionChangeComplete={handleRegionChangeComplete}
        pitchEnabled={false}
        rotateEnabled={false}
        minZoomLevel={10}
        maxZoomLevel={18}
        liteMode={Platform.OS === 'android' && !isMapInteracted}
      >
        <UrlTile
          urlTemplate={MAP_CONFIG.OSM_TILE_URL}
          maximumZ={19}
          minimumZ={6}
          flipY={false}
          zIndex={1}
          shouldReplaceMapContent={true}
        />

        {destinationLocation && (
          <Marker
            coordinate={destinationLocation}
            title="Destination"
            description={destinationQuery}
            tracksViewChanges={false}
          />
        )}

        {routeSegments.map((seg, idx) => (
          <Polyline
            key={`route-seg-${idx}`}
            coordinates={seg.coordinates}
            strokeColor={seg.onTransit ? '#E8A020' : '#999999'}
            strokeWidth={seg.onTransit ? 5 : 3}
            lineCap="round"
            lineJoin="round"
            lineDashPattern={seg.onTransit ? undefined : [10, 6]}
          />
        ))}

        {/* Walking indicator markers at transition points */}
        {routeSegments.map((seg, idx) =>
          !seg.onTransit && seg.coordinates.length >= 2 ? (
            <Marker
              key={`walk-marker-${idx}`}
              coordinate={seg.coordinates[0]}
              tracksViewChanges={false}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <View style={styles.walkMarker}>
                <Ionicons name="walk" size={14} color="#FFFFFF" />
              </View>
            </Marker>
          ) : null
        )}

        {/* Transit route polylines (hidden when a search route is active) */}
        {!destinationLocation && visibleTransitRoutes.map((route: any) => (
          <Polyline
            key={`transit-route-${route.id}`}
            coordinates={route.coordinates}
            strokeColor={selectedTransitRoute?.id === route.id ? route.color : route.color + 'AA'}
            strokeWidth={selectedTransitRoute?.id === route.id ? 5 : 3}
            lineCap="round"
            lineJoin="round"
          />
        ))}

        {/* Transit stop markers (hidden when a search route is active) */}
        {!destinationLocation && visibleTransitStops.map((stop: any) => (
          <Marker
            key={`transit-stop-${stop.id}`}
            coordinate={stop.coordinate}
            tracksViewChanges={false}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={[
              styles.transitStopMarker,
              nearestStop?.id === stop.id && styles.nearestStopMarker,
            ]}>
              <Ionicons name="ellipse" size={6} color="#FFFFFF" />
            </View>
            <Callout tooltip>
              <View style={styles.stopCallout}>
                <Text style={styles.stopCalloutLabel}>{stop.name}</Text>
                {stop.operator ? <Text style={styles.stopCalloutType}>{stop.operator}</Text> : null}
              </View>
            </Callout>
          </Marker>
        ))}
      </MapView>

      {/* Map Control Buttons */}
      <View style={styles.mapControls}>
        <TouchableOpacity
          style={[styles.mapControlBtn, { marginBottom: 8 }]}
          onPress={() => {
            if (currentLocation) {
              mapRef.current?.animateToRegion({
                latitude: currentLocation.latitude,
                longitude: currentLocation.longitude,
                latitudeDelta: 0.005,
                longitudeDelta: 0.005,
              }, 600);
            } else {
              Alert.alert('GPS Not Ready', 'Waiting for your current location.');
            }
          }}
        >
          <Ionicons name="locate" size={20} color={COLORS.navy} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.mapControlBtn}
          onPress={() => {
            const r = currentRegionRef.current;
            mapRef.current?.animateToRegion({
              ...r,
              latitudeDelta: r.latitudeDelta / 2,
              longitudeDelta: r.longitudeDelta / 2,
            }, 300);
          }}
        >
          <Ionicons name="add" size={22} color={COLORS.navy} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.mapControlBtn}
          onPress={() => {
            const r = currentRegionRef.current;
            mapRef.current?.animateToRegion({
              ...r,
              latitudeDelta: Math.min(r.latitudeDelta * 2, 10),
              longitudeDelta: Math.min(r.longitudeDelta * 2, 10),
            }, 300);
          }}
        >
          <Ionicons name="remove" size={22} color={COLORS.navy} />
        </TouchableOpacity>
      </View>

      {/* Map Loading Indicator */}
      {!isMapLoaded && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#E8A020" />
        </View>
      )}

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Floating Top Header */}
        <BlurView intensity={80} tint="light" style={styles.header}>
          <Text style={styles.headerTitle}>HI, JERICHO!</Text>
          <View style={styles.searchContainer}>
            <TouchableOpacity
              style={styles.searchBarWrapper}
              activeOpacity={0.8}
              onPress={() => setIsSearchActive(true)}
            >
              <Ionicons name="search" size={18} color={COLORS.textMuted} />
              <Text style={styles.searchInputText} numberOfLines={1}>
                {destinationQuery ? `${originQuery || 'My Location'} → ${destinationQuery}` : 'Going Somewhere?'}
              </Text>
            </TouchableOpacity>
          </View>
        </BlurView>

        {/* Floating Quick Actions */}
        <View style={styles.quickActionsContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modeScroll}>
            {MODES.map(mode => (
              <TouchableOpacity
                key={mode}
                style={[styles.modePill, selectedMode === mode && styles.modePillActive]}
                onPress={() => setSelectedMode(mode)}
              >
                <Text style={[styles.modePillText, selectedMode === mode && styles.modePillTextActive]}>{mode}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Transit layer controls */}
        <View style={styles.transitControlsRow}>
          <TouchableOpacity
            style={[styles.transitToggle, showTransitLayer && styles.transitToggleActive]}
            onPress={() => setShowTransitLayer(prev => !prev)}
            activeOpacity={0.85}
          >
            <Ionicons name="git-branch" size={16} color={showTransitLayer ? '#FFFFFF' : COLORS.navy} />
            <Text style={[styles.transitToggleText, showTransitLayer && { color: '#FFFFFF' }]}>
              Transit
            </Text>
          </TouchableOpacity>

          {showTransitLayer && (
            <TouchableOpacity
              style={styles.nearestStopBtn}
              onPress={handleFindNearestStop}
              activeOpacity={0.85}
            >
              <Ionicons name="navigate" size={14} color={COLORS.navy} />
              <Text style={styles.nearestStopBtnText}>Nearest Stop</Text>
            </TouchableOpacity>
          )}

          {transitLoading && showTransitLayer && (
            <ActivityIndicator size="small" color="#E8A020" style={{ marginLeft: 8 }} />
          )}
        </View>

        {transitError && showTransitLayer && (
          <View style={styles.transitErrorCard}>
            <Ionicons name="warning" size={16} color="#E53935" />
            <Text style={styles.transitErrorText}>Transit: {transitError}</Text>
            <TouchableOpacity onPress={refreshTransit}>
              <Text style={styles.transitRetryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {nearestStop && showTransitLayer && (
          <View style={styles.nearestStopCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="location" size={16} color="#E8A020" />
              <Text style={styles.nearestStopName}>{nearestStop.name}</Text>
            </View>
            <TouchableOpacity onPress={() => setNearestStop(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>
        )}

        {routeSummary && (
          <View style={styles.routeSummaryCard}>
            <Text style={styles.routeSummaryTitle}>Route Ready</Text>
            <Text style={styles.routeSummaryValue}>
              {routeSummary.distanceKm.toFixed(1)} km • {Math.ceil(routeSummary.durationMin)} min
            </Text>
          </View>
        )}

        {/* Matched Commute Route Info */}
        {matchedCommute && (
          <View style={styles.routeInfoCard}>
            <View style={styles.routeInfoHeader}>
              <View style={styles.routeCodeBadge}>
                <Text style={styles.routeCodeText}>{matchedCommute.transport}</Text>
              </View>
              <TouchableOpacity onPress={() => setMatchedCommute(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={24} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.routeInfoTitle}>
              {matchedCommute.origin} to {matchedCommute.destination}
            </Text>
            {matchedCommute.schedule ? (
              <Text style={styles.routeInfoDesc}>Schedule: {matchedCommute.schedule}</Text>
            ) : null}
            {matchedCommute.notes ? (
              <Text style={styles.routeInfoDesc}>Notes: {matchedCommute.notes}</Text>
            ) : null}
            <View style={styles.routeInfoMeta}>
              <Text style={styles.routeInfoMetaText}>
                <Ionicons name="cash" size={12} color={COLORS.textMuted} /> {matchedCommute.fare || 'Unknown fare'}
              </Text>
              <Text style={styles.routeInfoMetaText} numberOfLines={1}>
                <Ionicons name="bus" size={12} color={COLORS.textMuted} /> {matchedCommute.transport}
              </Text>
            </View>
          </View>
        )}
      </SafeAreaView>

      {/* Transit route list panel */}
      {showTransitLayer && !transitLoading && transitRoutes.length > 0 && (
        <RouteListPanel
          routes={transitRoutes}
          selectedRouteId={selectedTransitRoute?.id}
          onSelectRoute={handleSelectTransitRoute}
        />
      )}

      {/* Full-screen search */}
      <SearchScreen
        visible={isSearchActive}
        currentLocationLabel="Current Location"
        onClose={() => setIsSearchActive(false)}
        onSelectRoute={handleSearchSelectRoute}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  safeArea: {
    flex: 1,
    pointerEvents: 'box-none',
    zIndex: 2,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 240, 232, 0.6)',
    zIndex: 0,
  },
  header: {
    marginHorizontal: SPACING.screenX,
    marginTop: 10,
    borderRadius: 20,
    padding: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(245, 240, 232, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  headerTitle: {
    fontFamily: 'Cubao',
    fontSize: TYPOGRAPHY.screenTitle,
    color: '#E8A020',
    marginBottom: 10,
    textShadowColor: 'rgba(0,0,0,0.1)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  searchContainer: {
    width: '100%',
  },
  searchBarWrapper: {
    width: '100%',
    height: 48,
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.pill,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  searchInputText: {
    flex: 1,
    marginLeft: 8,
    fontFamily: 'Inter',
    fontSize: TYPOGRAPHY.label,
    color: COLORS.textMuted,
  },
  quickActionsContainer: {
    marginTop: 16,
    marginHorizontal: SPACING.screenX,
  },
  routeSummaryCard: {
    marginTop: 6,
    marginHorizontal: SPACING.screenX,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(10,22,40,0.08)',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  routeSummaryTitle: {
    fontFamily: 'Inter',
    fontSize: 11,
    color: COLORS.textMuted,
  },
  routeSummaryValue: {
    fontFamily: 'Inter',
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.navy,
    marginTop: 2,
  },
  modeScroll: {
    paddingBottom: 10,
    gap: 8,
  },
  modePill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(10,22,40,0.08)',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    marginRight: 8,
  },
  modePillActive: {
    backgroundColor: '#E8A020',
    borderColor: '#E8A020',
  },
  modePillText: {
    fontFamily: 'Inter',
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.navy,
  },
  modePillTextActive: {
    color: '#FFFFFF',
  },
  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 10,
    zIndex: 10,
  },
  sheetHeaderWrapper: {
    width: '100%',
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
  },
  dragHandleContainer: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 20,
    width: '100%',
  },
  dragHandle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(10,22,40,0.2)',
    marginBottom: 12,
  },
  sheetHeaderTitle: {
    fontFamily: 'Cubao',
    fontSize: 24,
    color: COLORS.navy,
    letterSpacing: 0.1,
  },
  sheetContent: {
    paddingHorizontal: SPACING.screenX,
    paddingBottom: 40,
  },
  cardList: {
    gap: SPACING.cardGap,
  },
  trafficCard: {
    borderRadius: RADIUS.card,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    padding: SPACING.cardPadding,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  trafficLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  trafficRoad: {
    fontFamily: 'Inter',
    fontSize: TYPOGRAPHY.body,
    fontWeight: '500',
    color: COLORS.navy,
  },
  statusPill: {
    borderRadius: RADIUS.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusText: {
    fontFamily: 'Inter',
    fontSize: TYPOGRAPHY.caption,
    fontWeight: '700',
  },
  routeInfoCard: {
    position: 'absolute',
    bottom: 120,
    left: SPACING.screenX,
    right: SPACING.screenX,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    borderWidth: 1,
    borderColor: 'rgba(10,22,40,0.06)',
  },
  routeInfoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  routeCodeBadge: {
    backgroundColor: '#2196F3',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  routeCodeText: {
    fontFamily: 'Inter',
    fontSize: TYPOGRAPHY.caption,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  routeInfoTitle: {
    fontFamily: 'Inter',
    fontSize: TYPOGRAPHY.body,
    fontWeight: '700',
    color: COLORS.navy,
    marginBottom: 4,
  },
  routeInfoDesc: {
    fontFamily: 'Inter',
    fontSize: TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    lineHeight: 18,
    marginBottom: 8,
  },
  routeInfoMeta: {
    flexDirection: 'row',
    gap: 16,
  },
  routeInfoMetaText: {
    fontFamily: 'Inter',
    fontSize: TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    flexShrink: 1,
  },
  terminalMarker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E8A020',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  stopMarker: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#2196F3',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  stopCallout: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 120,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(10,22,40,0.08)',
  },
  stopCalloutLabel: {
    fontFamily: 'Inter',
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.navy,
  },
  stopCalloutType: {
    fontFamily: 'Inter',
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  // Transit layer styles
  transitStopMarker: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#1E88E5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  nearestStopMarker: {
    backgroundColor: '#E8A020',
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 3,
  },
  transitControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    marginHorizontal: SPACING.screenX,
    gap: 8,
  },
  transitToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: RADIUS.pill,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(10,22,40,0.08)',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  transitToggleActive: {
    backgroundColor: '#0A1628',
    borderColor: '#0A1628',
  },
  transitToggleText: {
    fontFamily: 'Inter',
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.navy,
  },
  nearestStopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: RADIUS.pill,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(10,22,40,0.08)',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  nearestStopBtnText: {
    fontFamily: 'Inter',
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.navy,
  },
  transitErrorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    marginHorizontal: SPACING.screenX,
    backgroundColor: 'rgba(229,57,53,0.08)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(229,57,53,0.2)',
  },
  transitErrorText: {
    fontFamily: 'Inter',
    fontSize: 12,
    color: '#E53935',
    flex: 1,
  },
  transitRetryText: {
    fontFamily: 'Inter',
    fontSize: 12,
    fontWeight: '700',
    color: '#E53935',
  },
  nearestStopCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    marginHorizontal: SPACING.screenX,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(232,160,32,0.3)',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  nearestStopName: {
    fontFamily: 'Inter',
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.navy,
  },
  mapControls: {
    position: 'absolute',
    right: 16,
    bottom: 140,
    zIndex: 3,
    alignItems: 'center',
  },
  mapControlBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  walkMarker: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#666666',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
});
