import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, ActivityIndicator, Platform, Keyboard, TouchableWithoutFeedback, Alert, StatusBar, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker, Polyline, Callout } from 'react-native-maps';
import { BlurView } from 'expo-blur';
import * as Location from 'expo-location';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../../constants/theme';
import { MAP_CONFIG } from '../../constants/map';
import { useJeepneyRoutes, JeepneyRoute } from '../../hooks/useJeepneyRoutes';
import { ROUTE_COLORS } from '../../constants/routeVisuals';
import { getRouteDisplayRef, MAP_ENABLED_ROUTE_CODES } from '../../constants/routeCatalog';
import SearchScreen, { PlaceResult } from '../../components/SearchScreen';
import { splitRouteSegments, buildTransitLegs, scoreTransitLegs, TransitLeg } from '../../utils/routeSegments';
import { ProfileButton } from '../../components/ProfileButton';
import { useStore } from '../../store/useStore';
import RouteRecommenderPanel from '../../components/RouteRecommenderPanel';
import { useSimulation } from '../../hooks/useSimulation';

const GEOCODING_BASE_URL = process.env.EXPO_PUBLIC_GEOCODING_BASE_URL || 'https://nominatim.openstreetmap.org';
const ROUTING_BASE_URL = 'https://router.project-osrm.org/route/v1/driving';

type MapCoordinate = {
  latitude: number;
  longitude: number;
};

type MapRegion = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

const INITIAL_REGION: MapRegion = {
  latitude: 14.4296,
  longitude: 120.9367,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

const PH_BOUNDS = MAP_CONFIG.PHILIPPINES_BOUNDS;

const toMapCoordinates = (coordinates: number[][]): MapCoordinate[] =>
  coordinates.map(([lng, lat]) => ({ latitude: lat, longitude: lng }));

const sqDistApprox = (a: MapCoordinate, b: MapCoordinate): number => {
  const DEG = 111_320;
  const dLat = (a.latitude - b.latitude) * DEG;
  const dLng =
    (a.longitude - b.longitude) *
    DEG *
    Math.cos(((a.latitude + b.latitude) / 2) * (Math.PI / 180));
  return dLat * dLat + dLng * dLng;
};

export default function HomeScreen() {
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
  const [mapRegion, setMapRegion] = useState<MapRegion>(INITIAL_REGION);
  const { routes: gpxRoutes } = useJeepneyRoutes();

  // Normalize GPX routes to a unified transit shape
  const transitRoutes = useMemo(() => {
    const mapReadyRoutes = gpxRoutes.filter((r: JeepneyRoute) =>
      MAP_ENABLED_ROUTE_CODES.includes(r.properties.code as any)
    );

    const normalized = mapReadyRoutes.map((r: JeepneyRoute) => ({
      id: r.properties.code,
      type: r.properties.type,
      color: (ROUTE_COLORS as Record<string, string>)[r.properties.type] || '#FF6B35',
      ref: getRouteDisplayRef(r.properties.code, r.properties.code),
      name: r.properties.name,
      from: r.stops[0]?.label || '',
      to: r.stops[r.stops.length - 1]?.label || '',
      operator: r.properties.operator || '',
      coordinates: r.coordinates,
      stops: r.stops.map((s, idx) => ({
        id: `${r.properties.code}-stop-${idx}`,
        coordinate: s.coordinate,
        name: s.label,
        type: s.type,
        operator: r.properties.operator || '',
      })),
      verified: true,
      fare: r.properties.fare,
    }));
    return normalized;
  }, [gpxRoutes]);
  const transitStops = useMemo(() => {
    return transitRoutes.flatMap((route: any) => route.stops || []);
  }, [transitRoutes]);
  const [showTransitLayer, setShowTransitLayer] = useState(false);
  const [nearestStop, setNearestStop] = useState<any>(null);
  const user = useStore((state) => state.user);
  const selectedTransitRoute = useStore((state) => state.selectedTransitRoute);
  const setSelectedTransitRoute = useStore((state) => state.setSelectedTransitRoute);
  const pendingRouteSearch = useStore((state) => state.pendingRouteSearch);
  const setPendingRouteSearch = useStore((state) => state.setPendingRouteSearch);
  const mapRef = useRef<MapView | null>(null);
  const [showRecommender, setShowRecommender] = useState(false);
  const [simAutoFollow, setSimAutoFollow] = useState(true);

  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

  const handleZoomIn = () => {
    const next: MapRegion = {
      ...mapRegion,
      latitudeDelta: clamp(mapRegion.latitudeDelta * 0.7, 0.0025, 0.4),
      longitudeDelta: clamp(mapRegion.longitudeDelta * 0.7, 0.0025, 0.4),
    };
    setMapRegion(next);
    mapRef.current?.animateToRegion(next, 250);
  };

  const handleZoomOut = () => {
    const next: MapRegion = {
      ...mapRegion,
      latitudeDelta: clamp(mapRegion.latitudeDelta / 0.7, 0.0025, 0.4),
      longitudeDelta: clamp(mapRegion.longitudeDelta / 0.7, 0.0025, 0.4),
    };
    setMapRegion(next);
    mapRef.current?.animateToRegion(next, 250);
  };

  const handleLocateUser = () => {
    if (currentLocation) {
      if (
        currentLocation.latitude < MAP_CONFIG.PHILIPPINES_BOUNDS.minLatitude ||
        currentLocation.latitude > MAP_CONFIG.PHILIPPINES_BOUNDS.maxLatitude ||
        currentLocation.longitude < MAP_CONFIG.PHILIPPINES_BOUNDS.minLongitude ||
        currentLocation.longitude > MAP_CONFIG.PHILIPPINES_BOUNDS.maxLongitude
      ) {
        Alert.alert('Out of Range', 'Your current location is outside the Philippines.');
        return;
      }
      const next: MapRegion = {
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };
      setMapRegion(next);
      mapRef.current?.animateToRegion(next, 500);
    } else {
      Alert.alert('Location Not Found', 'We are still getting your current location.');
    }
  };

  // Search Expand Animation
  const searchOpacityAnim = useRef(new Animated.Value(0)).current;

  // Search Expand Animation (moved pending search handler below)

  useEffect(() => {
    if (isSearchActive) {
      Animated.parallel([
        Animated.timing(searchOpacityAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: false,
        })
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(searchOpacityAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: false,
        })
      ]).start();
      Keyboard.dismiss();
    }
  }, [isSearchActive]);

  const closeSearch = () => setIsSearchActive(false);

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

  useEffect(() => {
    if (!selectedTransitRoute?.coordinates?.length) return;

    const allCoords = selectedTransitRoute.coordinates;
    if (allCoords.length > 1) {
      setRouteCoordinates([]);
      setDestinationLocation(null);
      setRouteSummary(null);

      mapRef.current?.fitToCoordinates(allCoords, {
        edgePadding: { top: 140, right: 40, bottom: 220, left: 40 },
        animated: true,
      });
    }
  }, [selectedTransitRoute]);

  // Find the nearest stop to the user's current location

  const handleClearRoute = useCallback((clearOrigin = true, clearDestination = true) => {
    if (clearDestination) setDestinationQuery('');
    if (clearOrigin) setOriginQuery('');
    setDestinationLocation(null);
    setRouteCoordinates([]);
    setRouteSummary(null);
    setPendingRouteSearch(null);
    setSelectedTransitRoute(null);
  }, [setPendingRouteSearch, setSelectedTransitRoute]);

  const handleSearchSelectRoute = useCallback(async (origin: PlaceResult | null, destination: PlaceResult) => {
    setIsSearchActive(false);
    setDestinationQuery(destination.title);
    setOriginQuery(origin?.title || '');
    
    const destinationPoint: MapCoordinate = {
      latitude: destination.latitude,
      longitude: destination.longitude,
    };
    setDestinationLocation(destinationPoint);
    
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
      // Fetch multiple OSRM alternatives so we can pick the one with least walking
      const routeResponse = await fetch(
        `${ROUTING_BASE_URL}/${startPoint.longitude},${startPoint.latitude};${destinationPoint.longitude},${destinationPoint.latitude}?overview=full&geometries=geojson&alternatives=3`
      );
      if (!routeResponse.ok) throw new Error(`Routing failed (${routeResponse.status})`);
      const routeResult = await routeResponse.json();
      const osrmRoutes = routeResult?.routes;
      if (!osrmRoutes || osrmRoutes.length === 0 || !osrmRoutes[0]?.geometry?.coordinates) {
        Alert.alert('Route Not Found', 'No drivable route found for this destination.');
        return;
      }

      // Score each alternative by transit coverage (less walking = better)
      let bestIdx = 0;
      let bestScore = Infinity;

      for (let i = 0; i < osrmRoutes.length; i++) {
        const route = osrmRoutes[i];
        if (!route?.geometry?.coordinates) continue;
        const coords = toMapCoordinates(route.geometry.coordinates);
        const legs = buildTransitLegs(coords, transitRoutes as any[], 50, 150);
        const score = scoreTransitLegs(legs, 300);
        if (score < bestScore) {
          bestScore = score;
          bestIdx = i;
        }
      }

      const chosenRoute = osrmRoutes[bestIdx];
      const mappedCoordinates = toMapCoordinates(chosenRoute.geometry.coordinates);
      setRouteCoordinates(mappedCoordinates);
      setRouteSummary({
        distanceKm: chosenRoute.distance / 1000,
        durationMin: chosenRoute.duration / 60,
      });
      mapRef.current?.fitToCoordinates(mappedCoordinates, {
        edgePadding: { top: 120, right: 40, bottom: 220, left: 40 },
        animated: true,
      });
      setShowRecommender(true);
    } catch (error) {
      console.warn('[HomeScreen] Route search failed:', error);
      Alert.alert('Search Failed', 'Unable to fetch route right now. Please try again.');
    } finally {
      setIsRouting(false);
    }
  }, [currentLocation, transitRoutes]);

  // Automatically process pending route searches (e.g. from Saved routes page)
  useEffect(() => {
    const processPendingSearch = async () => {
      if (!pendingRouteSearch) return;

      const { origin, destination } = pendingRouteSearch;
      setIsRouting(true);
      
      try {
        let originPlace: PlaceResult | null = null;
        
        // 1. Geocode origin if it's not our current location
        if (origin && origin.toLowerCase() !== 'current location' && origin.toLowerCase() !== 'your location') {
          const originQueryText = origin.includes('Philippines') ? origin : `${origin}, Cavite, Philippines`;
          const originParams = new URLSearchParams({
            q: originQueryText,
            format: 'json',
            limit: '1',
            countrycodes: 'ph',
          });
          const originRes = await fetch(`${GEOCODING_BASE_URL}/search?${originParams.toString()}`);
          if (!originRes.ok) throw new Error(`Geocoding origin failed`);
          const originData = await originRes.json();
          
          if (originData && originData[0]) {
            originPlace = {
              id: originData[0].place_id?.toString() || Math.random().toString(),
              title: origin,
              subtitle: originData[0].display_name || '',
              latitude: parseFloat(originData[0].lat),
              longitude: parseFloat(originData[0].lon),
            };
          }
        }

        // 2. Geocode destination
        const destQueryText = destination.includes('Philippines') ? destination : `${destination}, Cavite, Philippines`;
        const destParams = new URLSearchParams({
          q: destQueryText,
          format: 'json',
          limit: '1',
          countrycodes: 'ph',
        });
        const destRes = await fetch(`${GEOCODING_BASE_URL}/search?${destParams.toString()}`);
        if (!destRes.ok) throw new Error(`Geocoding destination failed`);
        const destData = await destRes.json();

        if (!destData || destData.length === 0) {
          Alert.alert('Route Error', 'Could not locate the destination for this route.');
          setIsRouting(false);
          setPendingRouteSearch(null);
          return;
        }

        const destPlace: PlaceResult = {
          id: destData[0].place_id?.toString() || Math.random().toString(),
          title: destination,
          subtitle: destData[0].display_name || '',
          latitude: parseFloat(destData[0].lat),
          longitude: parseFloat(destData[0].lon),
        };

        // 3. Call the search hander
        await handleSearchSelectRoute(originPlace, destPlace);
        setPendingRouteSearch(null); // Clear after successful processing

      } catch (err) {
        console.error('Failed to process pending route:', err);
        Alert.alert('Error', 'Failed to load the saved route location.');
        setIsRouting(false);
        setPendingRouteSearch(null);
      }
    };

    if (pendingRouteSearch) {
      processPendingSearch();
    }
  }, [pendingRouteSearch, handleSearchSelectRoute]);

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
    for (const stop of transitStops as any[]) {
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
      const nearestRegion: MapRegion = {
        latitude: closest.coordinate.latitude,
        longitude: closest.coordinate.longitude,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      };
      //mapRegionRef.current = nearestRegion;
      mapRef.current?.animateToRegion(nearestRegion, 600);
    }
  }, [currentLocation, transitStops]);

  // Visible routes: always show selected route; otherwise show all if transit layer is on
  const visibleTransitRoutes = useMemo(() => {
    if (selectedTransitRoute) {
      return selectedTransitRoute.coordinates ? [selectedTransitRoute] : [];
    }
    if (!showTransitLayer) return [];
    return transitRoutes;
  }, [showTransitLayer, selectedTransitRoute, transitRoutes]);

  // Visible stops: always show stops for selected route; otherwise show all if transit layer is on
  const visibleTransitStops = useMemo(() => {
    if (selectedTransitRoute?.stops?.length > 0) return selectedTransitRoute.stops;
    if (!showTransitLayer) return [];
    return transitStops;
  }, [showTransitLayer, selectedTransitRoute, transitStops]);

  // Split searched route into on-transit (solid) and walking (dashed) segments
  const routeSegments = useMemo(() => {
    if (routeCoordinates.length < 2) return [];
    return splitRouteSegments(routeCoordinates, transitRoutes, 50);
  }, [routeCoordinates, transitRoutes]);

  // Build multi-leg transit journey plan
  const transitLegs = useMemo((): TransitLeg[] => {
    if (routeCoordinates.length < 2) return [];
    return buildTransitLegs(routeCoordinates, transitRoutes as any[], 50, 150);
  }, [routeCoordinates, transitRoutes]);

  // Simulation — uses the actual searched route coordinates and transit legs
  const sim = useSimulation(routeCoordinates, transitLegs);


  // Auto-follow camera during simulation playback
  useEffect(() => {
    if (sim.state === 'playing' && sim.position && simAutoFollow && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: sim.position.latitude,
        longitude: sim.position.longitude,
        latitudeDelta: 0.012,
        longitudeDelta: 0.012,
      }, 200);
    }
  }, [sim.position, sim.state, simAutoFollow]);

  const handleRegionChangeComplete = (region: MapRegion) => {
    let newLat = region.latitude;
    let newLng = region.longitude;

    if (newLat > PH_BOUNDS.maxLatitude) newLat = PH_BOUNDS.maxLatitude;
    if (newLat < PH_BOUNDS.minLatitude) newLat = PH_BOUNDS.minLatitude;

    if (newLng > PH_BOUNDS.maxLongitude) newLng = PH_BOUNDS.maxLongitude;
    if (newLng < PH_BOUNDS.minLongitude) newLng = PH_BOUNDS.minLongitude;

    if (newLat !== region.latitude || newLng !== region.longitude) {
      const fixedRegion = { ...region, latitude: newLat, longitude: newLng };
      setMapRegion(fixedRegion);
      mapRef.current?.animateToRegion(fixedRegion, 100);
    } else {
      setMapRegion(region); // Important: Keep track of panning/zooming so buttons zoom in on the CURRENT view instead of snapping back to the initial coord
    }
  };

  return (
    <View style={styles.screen}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        mapType="standard"
        initialRegion={INITIAL_REGION}
        showsUserLocation={true}
        showsMyLocationButton={false}
        showsCompass={false}
        onMapReady={() => setIsMapLoaded(true)}
        onRegionChangeComplete={handleRegionChangeComplete}
        onTouchStart={() => {
          setIsMapInteracted(true);
          // Disable auto-follow when user touches map during simulation
          if (sim.state === 'playing') setSimAutoFollow(false);
        }}
        pitchEnabled={false}
        rotateEnabled={false}
        minZoomLevel={10}
        maxZoomLevel={18}
        liteMode={Platform.OS === 'android' && !isMapInteracted}
      >
        

        {destinationLocation && (
          <Marker
            coordinate={destinationLocation}
            title="Destination"
            description={destinationQuery}
            tracksViewChanges={false}
          />
        )}

        {/* Render searched route: solid for transit, dashed for walking */}
        {routeSegments.map((seg, idx) => (
          <Polyline
            key={`route-seg-${idx}`}
            coordinates={seg.coordinates}
            strokeColor={seg.onTransit ? '#E8A020' : '#999999'}
            strokeWidth={seg.onTransit ? 5 : 3}
            lineDashPattern={seg.onTransit ? undefined : [10, 6]}
            lineCap="round"
            lineJoin="round"
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

        {/* Board & drop-off markers for each transit leg */}
        {transitLegs.map((leg, idx) =>
          leg.onTransit ? (
            <React.Fragment key={`board-alight-${idx}`}>
              {/* Board marker */}
              <Marker
                coordinate={leg.boardAt}
                tracksViewChanges={false}
                anchor={{ x: 0.5, y: 0.5 }}
              >
                <View style={styles.boardMarker}>
                  <Ionicons name="arrow-up-circle" size={14} color="#FFFFFF" />
                </View>
                <Callout tooltip>
                  <View style={styles.stopCallout}>
                    <Text style={styles.stopCalloutLabel}>Board Here</Text>
                    <Text style={styles.stopCalloutType}>
                      Ride {leg.transitInfo?.type || 'transit'} heading to {leg.transitInfo?.to || leg.alightLabel}
                    </Text>
                  </View>
                </Callout>
              </Marker>
              {/* Drop-off marker */}
              <Marker
                coordinate={leg.alightAt}
                tracksViewChanges={false}
                anchor={{ x: 0.5, y: 0.5 }}
              >
                <View style={styles.alightMarker}>
                  <Ionicons name="arrow-down-circle" size={14} color="#FFFFFF" />
                </View>
                <Callout tooltip>
                  <View style={styles.stopCallout}>
                    <Text style={styles.stopCalloutLabel}>Drop-off Point</Text>
                    <Text style={styles.stopCalloutType}>
                      Get off near {leg.alightLabel}
                    </Text>
                  </View>
                </Callout>
              </Marker>
            </React.Fragment>
          ) : null
        )}

        {/* Transfer point markers between transit legs */}
        {transitLegs.map((leg, idx) => {
          if (!leg.onTransit) return null;
          const nextTransitLeg = transitLegs.slice(idx + 1).find(l => l.onTransit);
          if (!nextTransitLeg) return null;

          // Do not show transfer marker unless the next transit leg gives
          // a meaningful destination-distance improvement.
          const destinationPoint = routeCoordinates[routeCoordinates.length - 1];
          if (!destinationPoint) return null;
          const currentToDest = sqDistApprox(leg.alightAt, destinationPoint);
          const nextToDest = sqDistApprox(nextTransitLeg.alightAt, destinationPoint);
          const relativeGain = currentToDest > 0
            ? (currentToDest - nextToDest) / currentToDest
            : 0;
          if (relativeGain < 0.15) return null;

          // Show a transfer marker where this transit leg ends
          return (
            <Marker
              key={`transfer-${idx}`}
              coordinate={leg.alightAt}
              tracksViewChanges={false}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <View style={styles.transferMarker}>
                <Ionicons name="swap-vertical" size={14} color="#FFFFFF" />
              </View>
              <Callout tooltip>
                <View style={styles.stopCallout}>
                  <Text style={styles.stopCalloutLabel}>Transfer Point</Text>
                  <Text style={styles.stopCalloutType}>
                    Get off at {leg.alightLabel}, then ride {nextTransitLeg.transitInfo?.ref || nextTransitLeg.transitInfo?.name || 'next transit'}
                  </Text>
                </View>
              </Callout>
            </Marker>
          );
        })}

        {/* Simulation animated marker — moves along the actual searched route */}
        {sim.position && sim.state !== 'idle' && (
          <Marker
            coordinate={sim.position}
            tracksViewChanges={true}
            anchor={{ x: 0.5, y: 0.5 }}
            flat
          >
            <View style={styles.simMarker}>
              <View style={[
                styles.simMarkerInner,
                sim.currentSegInfo && { backgroundColor: sim.currentSegInfo.color },
              ]}>
                <Ionicons
                  name={sim.currentSegInfo?.onTransit ? 'bus' : 'walk'}
                  size={16}
                  color="#FFFFFF"
                />
              </View>
            </View>
          </Marker>
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

      {/* Map Controls */}
      <View style={styles.mapControls}>
        <BlurView intensity={35} tint="light" style={styles.locateGlassWrap}>
          <TouchableOpacity style={styles.locateButton} onPress={handleLocateUser} activeOpacity={0.8}>
            <Ionicons name="locate" size={21} color={COLORS.navy} />
          </TouchableOpacity>
        </BlurView>

        <BlurView intensity={35} tint="light" style={styles.zoomGlassWrap}>
          <TouchableOpacity style={[styles.zoomButton, styles.zoomButtonTop]} onPress={handleZoomIn} activeOpacity={0.8}>
            <Ionicons name="add" size={20} color={COLORS.navy} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.zoomButton} onPress={handleZoomOut} activeOpacity={0.8}>
            <Ionicons name="remove" size={20} color={COLORS.navy} />
          </TouchableOpacity>
        </BlurView>
      </View>

      {/* Route Options toggle button — only visible when a route is active */}
      {routeSummary && !showRecommender && (
        <View style={styles.recommenderToggle}>
          <BlurView intensity={35} tint="light" style={styles.recommenderGlassWrap}>
            <TouchableOpacity
              style={styles.recommenderButton}
              onPress={() => setShowRecommender(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="options" size={21} color={COLORS.navy} />
            </TouchableOpacity>
          </BlurView>
        </View>
      )}


      {/* Dim map when search is active */}
      {isSearchActive && (
        <TouchableWithoutFeedback onPress={closeSearch}>
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1, opacity: searchOpacityAnim }]} />
        </TouchableWithoutFeedback>
      )}

      {/* Map Loading Indicator */}
      {!isMapLoaded && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#E8A020" />
        </View>
      )}

      {/* Route Calculating Indicator */}
      {isRouting && (
        <View style={styles.routingOverlay}>
          <BlurView intensity={40} tint="dark" style={styles.routingCard}>
            <ActivityIndicator size="small" color="#E8A020" />
            <Text style={styles.routingText}>Finding your route…</Text>
          </BlurView>
        </View>
      )}

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Floating Top Header */}
        <View style={[styles.header, isSearchActive && { zIndex: 10 }]}>
          <TouchableOpacity
              style={styles.searchPillWrapper}
              activeOpacity={0.8}
              onPress={() => setIsSearchActive(true)}
            >
              <Image 
                source={require('../../assets/logo/icon_achievement.png')} 
                style={{ width: 48, height: 20 }} 
                resizeMode="contain"
              />
              <Text style={[styles.searchInputText, {color: COLORS.textMuted, flex: 1, marginLeft: 6}]} numberOfLines={1}>
                {destinationQuery ? `${originQuery || 'My Location'} → ${destinationQuery}` : `Saan tayo, ${(user?.name || 'Komyuter').split(' ')[0]}?`}
              </Text>
              <TouchableOpacity 
                onPress={() => Alert.alert('Voice Search', 'Speech-to-text integration coming soon! (Requires a native voice plugin)')} 
                style={{ paddingHorizontal: 8 }}
              >
                <Ionicons name="mic" size={20} color={COLORS.textMuted} />
              </TouchableOpacity>
              <ProfileButton />
            </TouchableOpacity>
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

          {/* Simulation Play Button — only visible when a route has been searched */}
          {routeCoordinates.length >= 2 && (
            <TouchableOpacity
              style={[
                styles.simPlayToggle,
                sim.state === 'playing' && styles.simPlayToggleActive,
              ]}
              onPress={() => {
                if (sim.state === 'idle') {
                  setSimAutoFollow(true);
                }
                sim.togglePlayPause();
              }}
              activeOpacity={0.85}
            >
              <Ionicons
                name={sim.state === 'playing' ? 'pause' : 'play'}
                size={16}
                color={sim.state === 'playing' ? '#FFFFFF' : COLORS.navy}
              />
              <Text style={[
                styles.simPlayToggleText,
                sim.state === 'playing' && { color: '#FFFFFF' },
              ]}>
                {sim.state === 'idle' ? 'Simulate' : sim.state === 'playing' ? 'Pause' : sim.state === 'paused' ? 'Resume' : 'Replay'}
              </Text>
            </TouchableOpacity>
          )}

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

        </View>

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

        {selectedTransitRoute ? (
          <View style={styles.transitRouteCard}>
            <View style={styles.transitRouteHeader}>
              <View style={[styles.transitTypeBadge, { backgroundColor: selectedTransitRoute.color || '#1E88E5' }]}>
                <Text style={styles.transitTypeBadgeText}>{selectedTransitRoute.label || 'Transit'}</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedTransitRoute(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={22} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.transitRouteTitle} numberOfLines={1}>
              {selectedTransitRoute.ref ? `[${selectedTransitRoute.ref}] ` : ''}{selectedTransitRoute.name}
            </Text>
            {(selectedTransitRoute.from || selectedTransitRoute.to) ? (
              <Text style={styles.transitRouteMeta} numberOfLines={1}>
                {selectedTransitRoute.from}{selectedTransitRoute.from && selectedTransitRoute.to ? ' -> ' : ''}{selectedTransitRoute.to}
              </Text>
            ) : null}
          </View>
        ) : null}
      </SafeAreaView>
      {/* Simulation segment info banner */}
      {sim.state !== 'idle' && (
        <View style={styles.simBanner}>
          {/* Top row: segment info + playback controls */}
          <View style={styles.simBannerTopRow}>
            {sim.currentSegInfo ? (
              <View style={styles.simBannerSegInfo}>
                <View style={[styles.simBannerDot, { backgroundColor: sim.currentSegInfo.color }]} />
                <Text style={styles.simBannerText} numberOfLines={1}>
                  {sim.currentSegInfo.label}
                </Text>
              </View>
            ) : (
              <View style={styles.simBannerSegInfo}>
                <Text style={styles.simBannerText}>Ready to simulate</Text>
              </View>
            )}
            {sim.state === 'finished' && (
              <Text style={styles.simBannerFinished}>Arrived!</Text>
            )}
          </View>

          {/* Progress bar */}
          <View style={styles.simProgressBarBg}>
            <View style={[styles.simProgressBarFill, { width: `${Math.round(sim.progress * 100)}%` }]} />
          </View>

          {/* Playback control row */}
          <View style={styles.simControlRow}>
            {/* Stop */}
            <TouchableOpacity
              style={styles.simControlBtn}
              onPress={() => { sim.reset(); setSimAutoFollow(true); }}
              activeOpacity={0.7}
            >
              <Ionicons name="stop-circle" size={28} color="#E53935" />
            </TouchableOpacity>

            {/* Play / Pause */}
            <TouchableOpacity
              style={styles.simControlBtnMain}
              onPress={() => {
                if (sim.state === 'idle' || sim.state === 'finished') setSimAutoFollow(true);
                sim.togglePlayPause();
              }}
              activeOpacity={0.7}
            >
              <Ionicons
                name={sim.state === 'playing' ? 'pause-circle' : 'play-circle'}
                size={44}
                color={sim.state === 'playing' ? COLORS.navy : '#E8A020'}
              />
            </TouchableOpacity>

            {/* Replay (visible when finished or paused) */}
            <TouchableOpacity
              style={styles.simControlBtn}
              onPress={() => {
                sim.reset();
                setSimAutoFollow(true);
                // Small delay so reset takes effect before play
                setTimeout(() => sim.play(), 50);
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="reload-circle" size={28} color={COLORS.navy} />
            </TouchableOpacity>
          </View>

          {/* Speed selector row */}
          <View style={styles.simSpeedRow}>
            <Text style={styles.simSpeedLabel}>Speed:</Text>
            {[1, 2, 3, 5].map((s) => (
              <TouchableOpacity
                key={`banner-speed-${s}`}
                style={[styles.simSpeedChip, sim.speed === s && styles.simSpeedChipActive]}
                onPress={() => sim.setSpeed(s)}
                activeOpacity={0.85}
              >
                <Text style={[styles.simSpeedChipText, sim.speed === s && styles.simSpeedChipTextActive]}>
                  {s}x
                </Text>
              </TouchableOpacity>
            ))}
            {/* Re-follow button */}
            {!simAutoFollow && (
              <TouchableOpacity
                style={styles.simFollowBtn}
                onPress={() => setSimAutoFollow(true)}
                activeOpacity={0.85}
              >
                <Ionicons name="locate" size={14} color="#E8A020" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* Route Recommender Panel */}
      <RouteRecommenderPanel
        visible={showRecommender}
        routeSummary={routeSummary}
        transitLegs={transitLegs}
        onClose={() => setShowRecommender(false)}
      />

      {/* Full-screen search */}
      <SearchScreen
        visible={isSearchActive}
        currentLocationLabel="Current Location"
        initialOrigin={pendingRouteSearch ? pendingRouteSearch.origin : originQuery}
        initialDestination={pendingRouteSearch ? pendingRouteSearch.destination : destinationQuery}
        onClearRoute={handleClearRoute}
        onClose={() => {
          setIsSearchActive(false);
          setPendingRouteSearch(null); // Clear pending search when closed
        }}
        onSelectRoute={(origin, dest) => {
          setPendingRouteSearch(null); // Clear pending search on successful route
          if (!origin && currentLocation) {
            if (
              currentLocation.latitude < MAP_CONFIG.PHILIPPINES_BOUNDS.minLatitude ||
              currentLocation.latitude > MAP_CONFIG.PHILIPPINES_BOUNDS.maxLatitude ||
              currentLocation.longitude < MAP_CONFIG.PHILIPPINES_BOUNDS.minLongitude ||
              currentLocation.longitude > MAP_CONFIG.PHILIPPINES_BOUNDS.maxLongitude
            ) {
              Alert.alert('Out of Range', 'Your current location is outside the Philippines.');
              return;
            }
          }
          handleSearchSelectRoute(origin, dest);
        }}
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

  mapControls: {
    position: 'absolute',
    right: 16,
    bottom: 90,
    zIndex: 10,
    alignItems: 'flex-end',
  },
  locateGlassWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.65)',
    backgroundColor: 'rgba(255,255,255,0.35)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
    elevation: 6,
    marginBottom: 12,
  },
  locateButton: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  zoomGlassWrap: {
    width: 48,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.65)',
    backgroundColor: 'rgba(255,255,255,0.35)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
    elevation: 6,
  },
  zoomButton: {
    width: 48,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  zoomButtonTop: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(10,22,40,0.12)',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 240, 232, 0.6)',
    zIndex: 0,
  },
  routingOverlay: {
    position: 'absolute',
    top: '45%',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 50,
  },
  routingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    overflow: 'hidden',
  },
  routingText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 10,
  },
  header: {
    paddingHorizontal: SPACING.screenX,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) + 10 : 10,
    width: '100%',
    zIndex: 10,
    elevation: 10,
  },
  searchPillWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 30,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  searchInputText: {
    flex: 1,
    marginLeft: 8,
    fontFamily: 'Inter',
    fontSize: TYPOGRAPHY.label,
  },
  activeSearchInput: {
    flex: 1,
    marginLeft: 8,
    fontFamily: 'Inter',
    fontSize: TYPOGRAPHY.label,
    color: COLORS.navy,
  },
  suggestionCard: {
    marginTop: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(10,22,40,0.08)',
    overflow: 'hidden',
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(10,22,40,0.06)',
  },
  suggestionIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(232,160,32,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  suggestionTextWrap: {
    flex: 1,
  },
  suggestionTitle: {
    fontFamily: 'Inter',
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.navy,
  },
  suggestionSubtitle: {
    marginTop: 1,
    fontFamily: 'Inter',
    fontSize: 11,
    color: COLORS.textMuted,
  },
  suggestionLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  suggestionLoadingText: {
    fontFamily: 'Inter',
    fontSize: 12,
    color: COLORS.textMuted,
  },
  suggestionEmptyText: {
    fontFamily: 'Inter',
    fontSize: 12,
    color: COLORS.textMuted,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  dashLine: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.05)',
    marginVertical: 6,
    marginLeft: 30,
  },
  routeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E8A020',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  routeButtonDisabled: {
    opacity: 0.7,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(10,22,40,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  quickActionsContainer: {
    marginTop: 16,
    marginHorizontal: SPACING.screenX,
  },
  routeSummaryCard: {
    position: 'absolute',
    bottom: 90,
    left: SPACING.screenX,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(10,22,40,0.08)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    zIndex: 10,
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
  transitRouteCard: {
    marginTop: 12,
    marginHorizontal: SPACING.screenX,
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: 'rgba(10,22,40,0.08)',
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  transitRouteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  transitTypeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
  },
  transitTypeBadgeText: {
    fontFamily: 'Inter',
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  transitRouteTitle: {
    fontFamily: 'Inter',
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.navy,
  },
  transitRouteMeta: {
    marginTop: 4,
    fontFamily: 'Inter',
    fontSize: 12,
    color: COLORS.textMuted,
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
  boardMarker: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#16A34A',
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
  alightMarker: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#E53935',
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
  transferMarker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#3B82F6',
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
  nearestStopMarker: {
    backgroundColor: '#E8A020',
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 3,
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
  recommenderToggle: {
    position: 'absolute',
    left: 16,
    bottom: 88,
    zIndex: 10,
  },
  recommenderGlassWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.65)',
    backgroundColor: 'rgba(255,255,255,0.35)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
    elevation: 6,
  },
  recommenderButton: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Simulation styles
  simPlayToggle: {
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
  simPlayToggleActive: {
    backgroundColor: '#E8A020',
    borderColor: '#E8A020',
  },
  simPlayToggleText: {
    fontFamily: 'Inter',
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.navy,
  },
  simMarker: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(232,160,32,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  simMarkerInner: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#E8A020',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  simBanner: {
    position: 'absolute',
    bottom: 90,
    left: SPACING.screenX,
    right: SPACING.screenX,
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(10,22,40,0.08)',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
    zIndex: 10,
  },
  simBannerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  simBannerSegInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  simBannerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  simBannerText: {
    fontFamily: 'Inter',
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.navy,
    flex: 1,
  },
  simBannerFinished: {
    fontFamily: 'Inter',
    fontSize: 13,
    fontWeight: '700',
    color: '#4CAF50',
    marginLeft: 8,
  },
  simProgressBarBg: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(10,22,40,0.08)',
  },
  simProgressBarFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E8A020',
  },
  simControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    marginTop: 12,
  },
  simControlBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  simControlBtnMain: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  simSpeedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
  },
  simSpeedLabel: {
    fontFamily: 'Inter',
    fontSize: 11,
    color: COLORS.textMuted,
    marginRight: 2,
  },
  simSpeedChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
    backgroundColor: 'rgba(10,22,40,0.05)',
  },
  simSpeedChipActive: {
    backgroundColor: COLORS.navy,
  },
  simSpeedChipText: {
    fontFamily: 'Inter',
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.navy,
  },
  simSpeedChipTextActive: {
    color: '#FFFFFF',
  },
  simFollowBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(232,160,32,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
});
