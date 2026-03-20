import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Animated, ActivityIndicator, Platform, Keyboard, TouchableWithoutFeedback, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import MapView, { UrlTile, Marker, Polyline, Callout } from 'react-native-maps';
import { BlurView } from 'expo-blur';
import * as Location from 'expo-location';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../../constants/theme';
import { MAP_CONFIG } from '../../constants/map';
import { useCommuteRoutes } from '../../hooks/useCommuteRoutes';
import { useTransitData } from '../../hooks/useTransitData';
import RouteListPanel from '../../components/RouteListPanel';
import { splitRouteSegments } from '../../utils/routeSegments';
import { ProfileButton } from '../../components/ProfileButton';
import { useStore } from '../../store/useStore';

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

const PH_BOUNDS = {
  northEast: { latitude: 21.12, longitude: 126.61 },
  southWest: { latitude: 4.59, longitude: 114.26 },
};

type PlaceSuggestion = {
  id: string;
  title: string;
  subtitle: string;
  latitude: number;
  longitude: number;
};

const toMapCoordinates = (coordinates: number[][]): MapCoordinate[] =>
  coordinates.map(([lng, lat]) => ({ latitude: lat, longitude: lng }));

export default function HomeScreen() {
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [isMapInteracted, setIsMapInteracted] = useState(false);
  const [destinationQuery, setDestinationQuery] = useState('');
  const [originQuery, setOriginQuery] = useState('');
  const [placeSuggestions, setPlaceSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isFetchingSuggestions, setIsFetchingSuggestions] = useState(false);
  const [isRouting, setIsRouting] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<MapCoordinate | null>(null);
  const [destinationLocation, setDestinationLocation] = useState<MapCoordinate | null>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<MapCoordinate[]>([]);
  const [routeSummary, setRouteSummary] = useState<{ distanceKm: number; durationMin: number } | null>(null);
  const [showRoutes, setShowRoutes] = useState(true);
  const [matchedCommute, setMatchedCommute] = useState<any>(null); // from useCommuteRoutes
  const [mapRegion, setMapRegion] = useState<MapRegion>(INITIAL_REGION);
  const { routes: commuteRoutes } = useCommuteRoutes();
  const { routes: transitRoutes, stops: transitStops, loading: transitLoading, error: transitError, refresh: refreshTransit } = useTransitData();
  const [showTransitLayer, setShowTransitLayer] = useState(true);
  const [nearestStop, setNearestStop] = useState<any>(null);
  const user = useStore((state) => state.user);
  const selectedTransitRoute = useStore((state) => state.selectedTransitRoute);
  const setSelectedTransitRoute = useStore((state) => state.setSelectedTransitRoute);
  const mapRef = useRef<MapView | null>(null);
  const displayName = (user?.name || 'Komyuter').split(' ')[0].toUpperCase();

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
  const searchHeightAnim = useRef(new Animated.Value(48)).current;
  const searchOpacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isSearchActive) {
      Animated.parallel([
        Animated.timing(searchHeightAnim, {
          toValue: 120, // Height for expanded search
          duration: 300,
          useNativeDriver: false,
        }),
        Animated.timing(searchOpacityAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: false,
        })
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(searchHeightAnim, {
          toValue: 48,
          duration: 300,
          useNativeDriver: false,
        }),
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

  const selectSuggestion = (suggestion: PlaceSuggestion) => {
    setDestinationQuery(suggestion.title);
    setPlaceSuggestions([]);
  };

  useEffect(() => {
    const query = destinationQuery.trim();
    if (!isSearchActive || query.length < 2) {
      setPlaceSuggestions([]);
      setIsFetchingSuggestions(false);
      return;
    }

    let cancelled = false;
    const debounceTimer = setTimeout(async () => {
      setIsFetchingSuggestions(true);
      try {
        const params = new URLSearchParams({
          q: `${query}, Cavite, Philippines`,
          format: 'json',
          limit: '5',
          countrycodes: 'ph',
          addressdetails: '0',
        });

        const response = await fetch(`${GEOCODING_BASE_URL}/search?${params.toString()}`, {
          headers: {
            'Accept-Language': 'en',
          },
        });

        if (!response.ok) {
          throw new Error(`Suggestion fetch failed (${response.status})`);
        }

        const results = await response.json();
        if (cancelled) {
          return;
        }

        const mapped: PlaceSuggestion[] = (Array.isArray(results) ? results : [])
          .map((item: any, idx: number) => {
            const displayName = String(item.display_name || '').trim();
            const parts = displayName.split(',').map((p) => p.trim()).filter(Boolean);
            const title = parts[0] || query;
            const subtitle = parts.slice(1).join(', ') || 'Cavite, Philippines';
            return {
              id: String(item.place_id || `${displayName}-${idx}`),
              title,
              subtitle,
              latitude: parseFloat(item.lat),
              longitude: parseFloat(item.lon),
            };
          })
          .filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude));

        setPlaceSuggestions(mapped);
      } catch (error) {
        if (!cancelled) {
          console.warn('[HomeScreen] Suggestion search failed:', error);
          setPlaceSuggestions([]);
        }
      } finally {
        if (!cancelled) {
          setIsFetchingSuggestions(false);
        }
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(debounceTimer);
    };
  }, [destinationQuery, isSearchActive]);

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
    if (!selectedTransitRoute?.segments?.length) return;

    const allCoords = selectedTransitRoute.segments.flat();
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

  const handleRouteSearch = async () => {
    Keyboard.dismiss();
    const dest = destinationQuery.trim().toLowerCase();
    const orig = originQuery.trim().toLowerCase() || 'buendia';
    
    if (!dest) {
      Alert.alert('Destination Required', 'Type where you want to go first.');
      return;
    }

    if (!currentLocation) {
      Alert.alert('GPS Not Ready', 'Waiting for your current location. Please try again in a few seconds.');
      return;
    }

    setIsRouting(true);
    try {
      // Match with commuteData
      const matches = commuteRoutes.filter(r => r.destination.toLowerCase().includes(dest));
      let bestMatch = matches.find(r => r.origin.toLowerCase().includes(orig));
      if (!bestMatch && matches.length > 0) {
          bestMatch = matches[0]; // fallback
      }

      if (bestMatch) {
         setMatchedCommute(bestMatch);
      } else {
         setMatchedCommute(null);
         Alert.alert('Route Not Found', 'Sorry, the commute guide data does not fully answer the question for this route.');
      }

      const geocodeParams = new URLSearchParams({
        q: `${destinationQuery}, Cavite, Philippines`,
        format: 'json',
        limit: '1',
        countrycodes: 'ph',
      });

      const geocodeResponse = await fetch(`${GEOCODING_BASE_URL}/search?${geocodeParams.toString()}`, {
        headers: {
          'Accept-Language': 'en',
        },
      });

      if (!geocodeResponse.ok) {
        throw new Error(`Geocoding failed (${geocodeResponse.status})`);
      }

      const geocodeResults = await geocodeResponse.json();
      if (!Array.isArray(geocodeResults) || geocodeResults.length === 0) {
        Alert.alert('Location Not Found', 'Try a more specific destination name.');
        return;
      }

      const destination = geocodeResults[0];
      const destinationPoint: MapCoordinate = {
        latitude: parseFloat(destination.lat),
        longitude: parseFloat(destination.lon),
      };
      setDestinationLocation(destinationPoint);

      const startLng = currentLocation.longitude;
      const startLat = currentLocation.latitude;
      const destLng = destinationPoint.longitude;
      const destLat = destinationPoint.latitude;

      const routeResponse = await fetch(
        `${ROUTING_BASE_URL}/${startLng},${startLat};${destLng},${destLat}?overview=full&geometries=geojson`
      );

      if (!routeResponse.ok) {
        throw new Error(`Routing failed (${routeResponse.status})`);
      }

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

      setIsSearchActive(false);
      setPlaceSuggestions([]);
      Keyboard.dismiss();
    } catch (error) {
      console.warn('[HomeScreen] Route search failed:', error);
      Alert.alert('Search Failed', 'Unable to fetch route right now. Please try again.');
    } finally {
      setIsRouting(false);
    }
  };

  // Handle selecting a transit route from the panel
  const handleSelectTransitRoute = useCallback((route: any) => {
    setSelectedTransitRoute(selectedTransitRoute?.id === route.id ? null : route);
    if (route.coordinates?.length > 0) {
      mapRef.current?.fitToCoordinates(route.coordinates, {
        edgePadding: { top: 120, right: 40, bottom: 200, left: 40 },
        animated: true,
      });
    }
  }, [selectedTransitRoute, setSelectedTransitRoute]);

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

  // Visible routes: show selected route if active, otherwise all (if layer is on)
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


  const handleRegionChangeComplete = (region: MapRegion) => {
    let newLat = region.latitude;
    let newLng = region.longitude;

    if (newLat > PH_BOUNDS.northEast.latitude) newLat = PH_BOUNDS.northEast.latitude;
    if (newLat < PH_BOUNDS.southWest.latitude) newLat = PH_BOUNDS.southWest.latitude;

    if (newLng > PH_BOUNDS.northEast.longitude) newLng = PH_BOUNDS.northEast.longitude;
    if (newLng < PH_BOUNDS.southWest.longitude) newLng = PH_BOUNDS.southWest.longitude;

    if (newLat !== region.latitude || newLng !== region.longitude) {
      const fixedRegion = { ...region, latitude: newLat, longitude: newLng };
      mapRef.current?.animateToRegion(fixedRegion, 100);
    }
  };

  return (
    <View style={styles.screen}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        mapType="none"
        initialRegion={INITIAL_REGION}
        showsUserLocation={true}
        showsMyLocationButton={false}
        showsCompass={false}
        onMapReady={() => setIsMapLoaded(true)}
        onRegionChangeComplete={handleRegionChangeComplete}
        onTouchStart={() => setIsMapInteracted(true)}
        pitchEnabled={false}
        rotateEnabled={false}
        minZoomLevel={10}
        maxZoomLevel={18}
        liteMode={Platform.OS === 'android' && !isMapInteracted}
      >
        <UrlTile
          urlTemplate={MAP_CONFIG.OSM_TILE_URL}
          maximumZ={19}
          minimumZ={1}
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

        {selectedTransitRoute?.segments?.map((seg: any[], idx: number) => (
          <Polyline
            key={`selected-transit-${selectedTransitRoute.id}-${idx}`}
            coordinates={seg}
            strokeColor={selectedTransitRoute.color || '#1E88E5'}
            strokeWidth={5}
            lineCap="round"
            lineJoin="round"
          />
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

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Floating Top Header */}
        <View style={[styles.header, isSearchActive && { zIndex: 10 }]}>
          <View style={styles.headerTopRow}>
            <Text style={styles.headerTitle}>{`HI, ${displayName}!`}</Text>
            <ProfileButton />
          </View>
          <Animated.View style={{ height: searchHeightAnim, overflow: 'hidden' }}>
            <View style={styles.searchContainer}>
              <View style={styles.searchBarRow}>
                {isSearchActive ? (
                   <TouchableOpacity onPress={closeSearch} style={{ marginRight: 8 }}>
                     <Ionicons name="arrow-back" size={20} color={COLORS.navy} />
                   </TouchableOpacity>
                ) : null}
                <View style={[styles.searchBarWrapper, isSearchActive && { elevation: 0, shadowOpacity: 0 }]}>
                   <Ionicons name="search" size={18} color={COLORS.textMuted} />
                   {isSearchActive ? (
                     <TextInput
                       style={styles.activeSearchInput}
                       placeholder="My Location"
                       placeholderTextColor={COLORS.textMuted}
                       value={originQuery}
                       onChangeText={setOriginQuery}
                       returnKeyType="next"
                     />
                   ) : (
                     <Text style={[styles.searchInputText, { color: COLORS.textMuted }]} onPress={() => setIsSearchActive(true)}>
                       {destinationQuery ? `${originQuery || 'My Location'} to ${destinationQuery}` : 'Going Somewhere?'}
                     </Text>
                   )}
                </View>
              </View>

              {/* Expanded search fields */}
              <Animated.View style={{ opacity: searchOpacityAnim, marginTop: 12 }}>
                <View style={styles.dashLine} />
                <View style={styles.searchBarRow}>
                  <View style={[styles.searchBarWrapper, { elevation: 0, shadowOpacity: 0 }]}>
                    <Ionicons name="location" size={18} color="#E8A020" />
                    <TextInput 
                      style={styles.activeSearchInput} 
                      placeholder="Where to go?" 
                      placeholderTextColor={COLORS.textMuted} 
                      value={destinationQuery}
                      onChangeText={(text) => {
                        setDestinationQuery(text);
                      }}
                      autoFocus={isSearchActive}
                      returnKeyType="search"
                      onSubmitEditing={handleRouteSearch}
                    />
                  </View>
                  <TouchableOpacity
                    style={[styles.routeButton, isRouting && styles.routeButtonDisabled]}
                    activeOpacity={0.9}
                    onPress={handleRouteSearch}
                    disabled={isRouting}
                  >
                    {isRouting ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Ionicons name="navigate" size={18} color="#FFFFFF" />
                    )}
                  </TouchableOpacity>
                </View>

                {(destinationQuery.trim().length >= 2 || isFetchingSuggestions) && (
                  <View style={styles.suggestionCard}>
                    {isFetchingSuggestions ? (
                      <View style={styles.suggestionLoadingRow}>
                        <ActivityIndicator size="small" color="#E8A020" />
                        <Text style={styles.suggestionLoadingText}>Looking for places...</Text>
                      </View>
                    ) : placeSuggestions.length > 0 ? (
                      placeSuggestions.map((suggestion) => (
                        <TouchableOpacity
                          key={suggestion.id}
                          style={styles.suggestionRow}
                          activeOpacity={0.8}
                          onPress={() => selectSuggestion(suggestion)}
                        >
                          <View style={styles.suggestionIconWrap}>
                            <Ionicons name="location" size={15} color="#E8A020" />
                          </View>
                          <View style={styles.suggestionTextWrap}>
                            <Text style={styles.suggestionTitle} numberOfLines={1}>{suggestion.title}</Text>
                            <Text style={styles.suggestionSubtitle} numberOfLines={1}>{suggestion.subtitle}</Text>
                          </View>
                        </TouchableOpacity>
                      ))
                    ) : (
                      <Text style={styles.suggestionEmptyText}>No recommendations yet. Try a more specific place.</Text>
                    )}
                  </View>
                )}
              </Animated.View>
            </View>
          </Animated.View>
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

        {/* Transit route list panel */}
        {showTransitLayer && !transitLoading && transitRoutes.length > 0 && !isSearchActive && !destinationLocation && (
          <RouteListPanel
            routes={transitRoutes}
            selectedRouteId={selectedTransitRoute?.id}
            onSelectRoute={handleSelectTransitRoute}
          />
        )}
      </SafeAreaView>

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
    bottom: 118,
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
  header: {
    marginHorizontal: SPACING.screenX,
    marginTop: 10,
    borderRadius: 20,
    padding: 16,
    overflow: 'hidden',
    backgroundColor: '#F5C518',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 8,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  headerTitle: {
    fontFamily: 'Cubao',
    fontSize: TYPOGRAPHY.screenTitle,
    color: '#0A1628',
  },
  searchContainer: {
    width: '100%',
  },
  searchBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchBarWrapper: {
    flex: 1,
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
  }
});
