import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Animated, PanResponder, Dimensions, ActivityIndicator, Platform, Keyboard, TouchableWithoutFeedback, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import MapView, { UrlTile, Marker, Polyline, Callout } from 'react-native-maps';
import { BlurView } from 'expo-blur';
import * as Location from 'expo-location';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../../constants/theme';
import { MAP_CONFIG } from '../../constants/map';
import { useJeepneyRoutes } from '../../hooks/useJeepneyRoutes';

const { height, width } = Dimensions.get('window');

const TRAFFIC = [
  { road: 'Bacoor Boulevard', status: 'Heavy' as const },
  { road: 'Imus Crossing', status: 'Moderate' as const },
  { road: 'Dasmariñas Crossing', status: 'Light' as const },
];

function trafficPill(status: 'Light' | 'Moderate' | 'Heavy') {
  if (status === 'Light') return { backgroundColor: COLORS.successBg, color: COLORS.successText };
  if (status === 'Moderate') return { backgroundColor: COLORS.moderateBg, color: COLORS.moderateText };
  return { backgroundColor: COLORS.heavyBg, color: COLORS.heavyText };
}

const MODES = ['Jeepney', 'Tricycle', 'UV Express', 'Bus', 'LRT'];
const GEOCODING_BASE_URL = process.env.EXPO_PUBLIC_GEOCODING_BASE_URL || 'https://nominatim.openstreetmap.org';
const ROUTING_BASE_URL = 'https://router.project-osrm.org/route/v1/driving';

type MapCoordinate = {
  latitude: number;
  longitude: number;
};

type PlaceSuggestion = {
  id: string;
  title: string;
  subtitle: string;
  latitude: number;
  longitude: number;
};

type LocalLocation = {
  id: string;
  title: string;
  subtitle: string;
  latitude: number;
  longitude: number;
};

const toMapCoordinates = (coordinates: number[][]): MapCoordinate[] =>
  coordinates.map(([lng, lat]) => ({ latitude: lat, longitude: lng }));

function normalizeQuery(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function haversineKm(a: MapCoordinate, b: MapCoordinate): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export default function HomeScreen() {
  const [selectedMode, setSelectedMode] = useState('Jeepney');
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [isMapInteracted, setIsMapInteracted] = useState(false);
  const [isSheetExpanded, setIsSheetExpanded] = useState(false);
  const [destinationQuery, setDestinationQuery] = useState('');
  const [placeSuggestions, setPlaceSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isFetchingSuggestions, setIsFetchingSuggestions] = useState(false);
  const [isRouting, setIsRouting] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<MapCoordinate | null>(null);
  const [destinationLocation, setDestinationLocation] = useState<MapCoordinate | null>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<MapCoordinate[]>([]);
  const [routeSummary, setRouteSummary] = useState<{ distanceKm: number; durationMin: number } | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);
  const [showRoutes, setShowRoutes] = useState(true);
  const { routes: jeepneyRoutes } = useJeepneyRoutes();
  const mapRef = useRef<MapView | null>(null);

  const localLocations = React.useMemo<LocalLocation[]>(() => {
    const byName = new Map<string, LocalLocation>();

    for (const route of jeepneyRoutes) {
      for (const stop of route.stops) {
        const title = stop.label?.trim();
        if (!title || /^stop candidate/i.test(title)) {
          continue;
        }

        const key = normalizeQuery(title);
        if (!key) {
          continue;
        }

        if (!byName.has(key)) {
          byName.set(key, {
            id: `local-${key}`,
            title,
            subtitle: 'Cavite, Philippines',
            latitude: stop.coordinate.latitude,
            longitude: stop.coordinate.longitude,
          });
        }
      }
    }

    return [...byName.values()].sort((a, b) => a.title.localeCompare(b.title, 'en'));
  }, [jeepneyRoutes]);

  const getLocalMatches = React.useCallback((query: string, limit = 8): LocalLocation[] => {
    const q = normalizeQuery(query);
    if (!q) {
      return localLocations.slice(0, limit);
    }

    const exact = localLocations.filter((item) => normalizeQuery(item.title) === q);
    const startsWith = localLocations.filter((item) => normalizeQuery(item.title).startsWith(q));
    const includes = localLocations.filter((item) => normalizeQuery(item.title).includes(q));

    const merged = [...exact, ...startsWith, ...includes];
    const seen = new Set<string>();
    const result: LocalLocation[] = [];

    for (const item of merged) {
      if (seen.has(item.id)) {
        continue;
      }
      seen.add(item.id);
      result.push(item);
      if (result.length >= limit) {
        break;
      }
    }

    return result;
  }, [localLocations]);

  // Bottom Sheet Animation state
  const sheetHeight = height * 0.5; // max height of bottom sheet
  const minHeight = 100; // min peek height to show "LIVE TRAFFIC"
  const slideAnim = useRef(new Animated.Value(sheetHeight - minHeight)).current;

  // Search Expand Animation
  const searchHeightAnim = useRef(new Animated.Value(48)).current;
  const searchOpacityAnim = useRef(new Animated.Value(0)).current;

  const toggleSheet = (expand = true) => {
    setIsSheetExpanded(expand);
    Animated.spring(slideAnim, {
      toValue: expand ? 0 : sheetHeight - minHeight,
      useNativeDriver: true,
      tension: 60,
      friction: 10,
    }).start();
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dy) > 5;
      },
      onPanResponderMove: (e, gestureState) => {
        const newVal = isSheetExpanded ? gestureState.dy : sheetHeight - minHeight + gestureState.dy;
        if (newVal > 0 && newVal < sheetHeight - minHeight + 50) {
          slideAnim.setValue(newVal);
        }
      },
      onPanResponderRelease: (e, gestureState) => {
        if (gestureState.dy > 50) {
          toggleSheet(false);
        } else if (gestureState.dy < -50) {
          toggleSheet(true);
        } else {
          toggleSheet(isSheetExpanded);
        }
      },
    })
  ).current;

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
      const localMatches = getLocalMatches(query, 6);

      console.log(`User Search: ${query}`);
      console.log(
        `Available Locations for ${query} {\n${localMatches.map((loc) => `  ${loc.title}`).join('\n')}\n}`
      );

      if (localMatches.length >= 6) {
        setPlaceSuggestions(localMatches);
        setIsFetchingSuggestions(false);
        return;
      }

      setIsFetchingSuggestions(true);
      try {
        const params = new URLSearchParams({
          q: `${query}, Cavite, Philippines`,
          format: 'json',
          limit: '5',
          countrycodes: 'ph',
          viewbox: '120.78,14.52,121.06,14.20',
          bounded: '1',
          addressdetails: '0',
        });

        const response = await fetch(`${GEOCODING_BASE_URL}/search?${params.toString()}`, {
          headers: {
            'Accept-Language': 'en',
            'User-Agent': 'Para-Transport-iOS/1.0',
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

        const mergedMap = new Map<string, PlaceSuggestion>();

        for (const local of localMatches) {
          mergedMap.set(`local:${normalizeQuery(local.title)}`, local);
        }

        for (const item of mapped) {
          const key = `remote:${normalizeQuery(item.title)}:${Math.round(item.latitude * 10000)}:${Math.round(item.longitude * 10000)}`;
          if (!mergedMap.has(key)) {
            mergedMap.set(key, item);
          }
        }

        setPlaceSuggestions([...mergedMap.values()].slice(0, 8));
      } catch (error) {
        if (!cancelled) {
          console.warn('[HomeScreen] Suggestion search failed:', error);
          setPlaceSuggestions(localMatches);
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

  const handleRouteSearch = async () => {
    const query = destinationQuery.trim();
    if (!query) {
      Alert.alert('Destination Required', 'Type where you want to go first.');
      return;
    }

    if (!currentLocation) {
      Alert.alert('GPS Not Ready', 'Waiting for your current location. Please try again in a few seconds.');
      return;
    }

    setIsRouting(true);
    try {
      const localMatches = getLocalMatches(query, 6);
      console.log(`User Search: ${query}`);
      console.log(
        `Available Locations for ${query} {\n${localMatches.map((loc) => `  ${loc.title}`).join('\n')}\n}`
      );

      let destinationPoint: MapCoordinate | null = null;

      if (localMatches.length > 0) {
        destinationPoint = {
          latitude: localMatches[0].latitude,
          longitude: localMatches[0].longitude,
        };
      } else {
        const geocodeParams = new URLSearchParams({
          q: `${query}, Cavite, Philippines`,
          format: 'json',
          limit: '3',
          countrycodes: 'ph',
          viewbox: '120.78,14.52,121.06,14.20',
          bounded: '1',
        });

        const geocodeResponse = await fetch(`${GEOCODING_BASE_URL}/search?${geocodeParams.toString()}`, {
          headers: {
            'Accept-Language': 'en',
            'User-Agent': 'Para-Transport-iOS/1.0',
          },
        });

        if (!geocodeResponse.ok) {
          throw new Error(`Geocoding failed (${geocodeResponse.status})`);
        }

        const geocodeResults = await geocodeResponse.json();
        if (!Array.isArray(geocodeResults) || geocodeResults.length === 0) {
          Alert.alert('Location Not Found', 'Try a more specific destination name in Cavite.');
          return;
        }

        const destination = geocodeResults[0];
        const latitude = parseFloat(destination.lat);
        const longitude = parseFloat(destination.lon);

        if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
          destinationPoint = {
            latitude,
            longitude,
          };
        }
      }

      if (!destinationPoint || !Number.isFinite(destinationPoint.latitude) || !Number.isFinite(destinationPoint.longitude)) {
        throw new Error('Destination coordinates are invalid');
      }

      setDestinationLocation(destinationPoint);

      const startLng = currentLocation.longitude;
      const startLat = currentLocation.latitude;
      const destLng = destinationPoint.longitude;
      const destLat = destinationPoint.latitude;

      if ([startLng, startLat, destLng, destLat].some((value) => !Number.isFinite(value))) {
        throw new Error('Invalid routing coordinates');
      }

      if (haversineKm(currentLocation, destinationPoint) < 0.05) {
        setRouteCoordinates([currentLocation, destinationPoint]);
        setRouteSummary({
          distanceKm: 0.05,
          durationMin: 1,
        });
        Alert.alert('You are already near this destination.');
        return;
      }

      const routeResponse = await fetch(
        `${ROUTING_BASE_URL}/${startLng},${startLat};${destLng},${destLat}?overview=full&geometries=geojson`
      );

      if (!routeResponse.ok) {
        if (routeResponse.status === 400) {
          const fallbackDistanceKm = haversineKm(currentLocation, destinationPoint);
          const fallbackDurationMin = Math.max(2, Math.round((fallbackDistanceKm / 20) * 60));
          const fallbackCoordinates = [currentLocation, destinationPoint];

          setRouteCoordinates(fallbackCoordinates);
          setRouteSummary({
            distanceKm: fallbackDistanceKm,
            durationMin: fallbackDurationMin,
          });

          mapRef.current?.fitToCoordinates(fallbackCoordinates, {
            edgePadding: { top: 120, right: 40, bottom: 220, left: 40 },
            animated: true,
          });

          Alert.alert('Route Fallback', 'No drivable OSRM path found. Showing direct path to destination.');
          setIsSearchActive(false);
          setPlaceSuggestions([]);
          Keyboard.dismiss();
          return;
        }

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

  return (
    <View style={styles.screen}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        initialRegion={{
          latitude: 14.4296,
          longitude: 120.9367,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
        showsUserLocation={true}
        onMapReady={() => setIsMapLoaded(true)}
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
          />
        )}

        {routeCoordinates.length > 1 && (
          <Polyline
            coordinates={routeCoordinates}
            strokeColor="#E8A020"
            strokeWidth={5}
            lineCap="round"
            lineJoin="round"
          />
        )}

        {/* Route Overlays */}
        {showRoutes && selectedMode === 'Jeepney' && jeepneyRoutes.map((route) => {
          const isSelected = selectedRoute === route.properties.code;
          return (
            <Polyline
              key={route.properties.code}
              coordinates={route.coordinates}
              strokeColor={isSelected ? '#E8A020' : '#2196F3'}
              strokeWidth={isSelected ? 5 : 3}
              lineCap="round"
              lineJoin="round"
              lineDashPattern={isSelected ? undefined : [1]}
              tappable
              onPress={() => {
                setSelectedRoute(isSelected ? null : route.properties.code);
              }}
            />
          );
        })}

        {/* Boarding guide markers along the selected route */}
        {showRoutes && selectedMode === 'Jeepney' && selectedRoute && (() => {
          const route = jeepneyRoutes.find(r => r.properties.code === selectedRoute);
          if (!route) return null;
          return route.stops.map((stop, idx) => {
            const isTerminal = stop.type === 'terminal';
            return (
              <Marker
                key={`stop-${selectedRoute}-${idx}`}
                coordinate={stop.coordinate}
                anchor={{ x: 0.5, y: 0.5 }}
                tracksViewChanges={false}
              >
                <View style={isTerminal ? styles.terminalMarker : styles.stopMarker}>
                  <Ionicons
                    name={isTerminal ? 'bus' : 'ellipse'}
                    size={isTerminal ? 16 : 8}
                    color="#FFFFFF"
                  />
                </View>
                <Callout tooltip>
                  <View style={styles.stopCallout}>
                    <Text style={styles.stopCalloutLabel}>{stop.label}</Text>
                    <Text style={styles.stopCalloutType}>
                      {isTerminal ? '🚏 Terminal' : '📍 Boarding Point'}
                    </Text>
                  </View>
                </Callout>
              </Marker>
            );
          });
        })()}
      </MapView>

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
        <BlurView intensity={80} tint="light" style={[styles.header, isSearchActive && { zIndex: 10 }]}>
          <Text style={styles.headerTitle}>HI, JERICHO!</Text>
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
                     <Text style={[styles.searchInputText, { color: COLORS.navy }]}>My Location</Text>
                   ) : (
                     <Text style={[styles.searchInputText, { color: COLORS.textMuted }]} onPress={() => setIsSearchActive(true)}>
                       {destinationQuery || 'Going Somewhere?'}
                     </Text>
                   )}
                </View>
                {!isSearchActive && (
                  <TouchableOpacity style={styles.iconButton} activeOpacity={0.85}>
                    <Ionicons name="options-outline" size={20} color={COLORS.navy} />
                  </TouchableOpacity>
                )}
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

        {routeSummary && (
          <View style={styles.routeSummaryCard}>
            <Text style={styles.routeSummaryTitle}>Route Ready</Text>
            <Text style={styles.routeSummaryValue}>
              {routeSummary.distanceKm.toFixed(1)} km • {Math.ceil(routeSummary.durationMin)} min
            </Text>
          </View>
        )}

        {/* Selected Route Info */}
        {selectedRoute && (() => {
          const route = jeepneyRoutes.find(r => r.properties.code === selectedRoute);
          if (!route) return null;
          return (
            <View style={styles.routeInfoCard}>
              <View style={styles.routeInfoHeader}>
                <View style={styles.routeCodeBadge}>
                  <Text style={styles.routeCodeText}>{route.properties.code}</Text>
                </View>
                <TouchableOpacity onPress={() => setSelectedRoute(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={24} color={COLORS.textMuted} />
                </TouchableOpacity>
              </View>
              <Text style={styles.routeInfoTitle}>{route.properties.name}</Text>
              {route.properties.description ? (
                <Text style={styles.routeInfoDesc} numberOfLines={3}>{route.properties.description}</Text>
              ) : null}
              <View style={styles.routeInfoMeta}>
                <Text style={styles.routeInfoMetaText}>
                  <Ionicons name="cash" size={12} color={COLORS.textMuted} /> ₱{route.properties.fare}
                </Text>
                {route.properties.operator ? (
                  <Text style={styles.routeInfoMetaText} numberOfLines={1}>
                    <Ionicons name="bus" size={12} color={COLORS.textMuted} /> {route.properties.operator}
                  </Text>
                ) : null}
              </View>
            </View>
          );
        })()}
      </SafeAreaView>

      {/* Draggable Bottom Sheet */}
      <Animated.View
        style={[
          styles.bottomSheet,
          {
            height: sheetHeight,
            transform: [
              {
                translateY: slideAnim.interpolate({
                  inputRange: [0, sheetHeight - minHeight],
                  outputRange: [0, sheetHeight - minHeight],
                  extrapolate: 'clamp',
                }),
              },
            ],
          },
        ]}
      >
        <TouchableOpacity 
          activeOpacity={0.9} 
          onPress={() => toggleSheet(!isSheetExpanded)}
          style={styles.sheetHeaderWrapper}
        >
          <View {...panResponder.panHandlers} style={styles.dragHandleContainer}>
            <View style={styles.dragHandle} />
            <Text style={styles.sheetHeaderTitle}>LIVE TRAFFIC</Text>
          </View>
        </TouchableOpacity>

        <ScrollView 
          showsVerticalScrollIndicator={false} 
          contentContainerStyle={styles.sheetContent}
          bounces={false}
        >
          <View style={styles.cardList}>
            {TRAFFIC.map((item) => {
              const pill = trafficPill(item.status);
              return (
                <View key={item.road} style={styles.trafficCard}>
                  <View style={styles.trafficLeft}>
                    <Ionicons name="ellipse" size={8} color="rgba(10,22,40,0.28)" />
                    <Text style={styles.trafficRoad}>{item.road}</Text>
                  </View>
                  <View style={[styles.statusPill, { backgroundColor: pill.backgroundColor }]}>
                    <Text style={[styles.statusText, { color: pill.color }]}>{item.status}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </ScrollView>
      </Animated.View>
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
});
