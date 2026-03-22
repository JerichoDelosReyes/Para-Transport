import React, { useState, useRef, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Animated, PanResponder, Dimensions, ActivityIndicator, Platform, Keyboard, TouchableWithoutFeedback, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import MapView, { UrlTile, Marker, Polyline, Callout, MapPressEvent } from 'react-native-maps';
import { BlurView } from 'expo-blur';
import * as Location from 'expo-location';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../../constants/theme';
import { MAP_CONFIG } from '../../constants/map';
import { useRoutes } from '../../hooks/useRoutes';
import { findRoutesForDestination, rankRoutes, MatchedRoute } from '../../services/routeSearch';
import type { RankMode } from '../../services/routeSearch';
import RouteResultCard from '../../components/RouteResultCard';
import { useStore } from '../../store/useStore';

const { height, width } = Dimensions.get('window');

const MODES = ['Jeepney', 'Tricycle', 'UV Express', 'Bus', 'LRT'];
const GEOCODING_BASE_URL = process.env.EXPO_PUBLIC_GEOCODING_BASE_URL || 'https://nominatim.openstreetmap.org';
const ROUTING_BASE_URL = 'https://router.project-osrm.org/route/v1/driving';
const WALKING_ROUTE_URL = 'https://router.project-osrm.org/route/v1/foot';

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

const toMapCoordinates = (coordinates: number[][]): MapCoordinate[] =>
  coordinates.map(([lng, lat]) => ({ latitude: lat, longitude: lng }));

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
  const [matchedRoutes, setMatchedRoutes] = useState<MatchedRoute[]>([]);
  const [searchMode, setSearchMode] = useState<'idle' | 'results'>('idle');
  const [destinationName, setDestinationName] = useState('');
  const [walkingPaths, setWalkingPaths] = useState<Record<string, MapCoordinate[]>>({});
  const [destinationMarkerKey, setDestinationMarkerKey] = useState(0);
  const { routes: jeepneyRoutes } = useRoutes();
  const { rankTab, setRankTab } = useStore();
  const mapRef = useRef<MapView | null>(null);

  const RANK_TABS: { key: RankMode; label: string }[] = [
    { key: 'easiest', label: 'Easiest' },
    { key: 'fastest', label: 'Fastest' },
    { key: 'cheapest', label: 'Cheapest' },
  ];

  const rankedRoutes = useMemo(
    () => rankRoutes(matchedRoutes, rankTab),
    [matchedRoutes, rankTab],
  );

  // Bottom Sheet Animation state
  const sheetHeight = height * 0.5; // max height of bottom sheet
  const minHeight = 100;
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

  const resetDestinationState = () => {
    setSelectedRoute(null);
    setMatchedRoutes([]);
    setWalkingPaths({});
    setRouteCoordinates([]);
    setRouteSummary(null);
    setSearchMode('idle');
    setDestinationLocation(null);
    setDestinationName('');
    setDestinationMarkerKey((prev) => prev + 1);
  };

  const startFreshDestination = (destinationPoint: MapCoordinate, label: string) => {
    resetDestinationState();
    requestAnimationFrame(() => {
      applyDestination(destinationPoint, label);
    });
  };

  const applyDestination = (destinationPoint: MapCoordinate, label: string) => {
    setDestinationLocation(destinationPoint);
    setDestinationName(label);
    setDestinationQuery(label);
    setWalkingPaths({});
    setRouteCoordinates([]);
    setRouteSummary(null);

    const results = findRoutesForDestination(
      currentLocation,
      destinationPoint,
      jeepneyRoutes,
    );

    setMatchedRoutes(results);
    setSearchMode('results');
    setSelectedRoute(null);
    toggleSheet(true);

    if (results.length > 0) {
      const allCoords = results.flatMap(m => m.legs.flatMap(l => l.route.coordinates));
      mapRef.current?.fitToCoordinates(allCoords, {
        edgePadding: { top: 160, right: 50, bottom: 300, left: 50 },
        animated: true,
      });
    }

    setIsSearchActive(false);
    setPlaceSuggestions([]);
    Keyboard.dismiss();
  };

  const handleMapLongPress = (event: MapPressEvent) => {
    if (!currentLocation) {
      Alert.alert('GPS Not Ready', 'Waiting for your current location. Please try again in a few seconds.');
      return;
    }

    const { latitude, longitude } = event.nativeEvent.coordinate;
    const pinnedPoint: MapCoordinate = { latitude, longitude };
    const pinnedLabel = `Pinned location (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`;
    startFreshDestination(pinnedPoint, pinnedLabel);
  };

  // Fetch road-following walking paths when a route is selected
  useEffect(() => {
    if (!selectedRoute || searchMode !== 'results' || !currentLocation) {
      setWalkingPaths({});
      return;
    }

    const matched = matchedRoutes.find(m =>
      m.legs.map(l => l.route.properties.code).join('+') === selectedRoute
    );
    if (!matched) return;

    const { legs } = matched;
    const segments: { key: string; from: MapCoordinate; to: MapCoordinate }[] = [];

    // Walk to first boarding
    segments.push({ key: 'walk-to-board', from: currentLocation, to: legs[0].boardingPoint });

    // Transfer walks between legs
    for (let i = 0; i < legs.length - 1; i++) {
      segments.push({
        key: `walk-transfer-${i}`,
        from: legs[i].alightingPoint,
        to: legs[i + 1].boardingPoint,
      });
    }

    // Walk from last alight to destination
    if (destinationLocation) {
      segments.push({
        key: 'walk-to-dest',
        from: legs[legs.length - 1].alightingPoint,
        to: destinationLocation,
      });
    }

    let cancelled = false;

    const fetchWalkPaths = async () => {
      const paths: Record<string, MapCoordinate[]> = {};

      await Promise.all(
        segments.map(async (seg) => {
          try {
            const url = `${WALKING_ROUTE_URL}/${seg.from.longitude},${seg.from.latitude};${seg.to.longitude},${seg.to.latitude}?overview=full&geometries=geojson`;
            const res = await fetch(url);
            if (!res.ok) return;
            const data = await res.json();
            const coords = data?.routes?.[0]?.geometry?.coordinates;
            if (coords && Array.isArray(coords)) {
              paths[seg.key] = coords.map(([lng, lat]: [number, number]) => ({
                latitude: lat,
                longitude: lng,
              }));
            }
          } catch {
            // fallback: straight line (will use default)
          }
        })
      );

      if (!cancelled) setWalkingPaths(paths);
    };

    fetchWalkPaths();
    return () => { cancelled = true; };
  }, [selectedRoute, searchMode, currentLocation, destinationLocation, matchedRoutes]);

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
      const geocodeParams = new URLSearchParams({
        q: `${query}, Cavite, Philippines`,
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
      startFreshDestination(destinationPoint, query);

      // If there are matching routes, fit map to show them
      const results = findRoutesForDestination(
        currentLocation,
        destinationPoint,
        jeepneyRoutes,
      );
      if (results.length > 0) {
        const allCoords = results.flatMap(m => m.legs.flatMap(l => l.route.coordinates));
        mapRef.current?.fitToCoordinates(allCoords, {
          edgePadding: { top: 160, right: 50, bottom: 300, left: 50 },
          animated: true,
        });
      } else {
        // Fallback: fetch OSRM driving route for reference
        const startLng = currentLocation.longitude;
        const startLat = currentLocation.latitude;
        const destLng = destinationPoint.longitude;
        const destLat = destinationPoint.latitude;

        try {
          const routeResponse = await fetch(
            `${ROUTING_BASE_URL}/${startLng},${startLat};${destLng},${destLat}?overview=full&geometries=geojson`
          );
          if (routeResponse.ok) {
            const routeResult = await routeResponse.json();
            const bestRoute = routeResult?.routes?.[0];
            if (bestRoute?.geometry?.coordinates) {
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
            }
          }
        } catch {} // Silently fail OSRM — we already show "no transit routes"
      }

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

  const toggleTransitVisuals = () => {
    setShowRoutes((prev) => {
      const next = !prev;
      if (!next) {
        setSelectedRoute(null);
        setWalkingPaths({});
        setRouteCoordinates([]);
      }
      return next;
    });
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
        onLongPress={handleMapLongPress}
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
            key={`destination-${destinationMarkerKey}-${destinationLocation.latitude}-${destinationLocation.longitude}`}
            coordinate={destinationLocation}
            title="Destination"
            description={destinationQuery}
          />
        )}

        {showRoutes && routeCoordinates.length > 1 && (
          <Polyline
            coordinates={routeCoordinates}
            strokeColor="#E8A020"
            strokeWidth={5}
            lineCap="round"
            lineJoin="round"
          />
        )}

        {/* Route Overlays */}
        {jeepneyRoutes.map((route) => {
          const code = route.properties.code;
          const selectedCodes = selectedRoute ? selectedRoute.split('+') : [];
          const isSelected = selectedCodes.includes(code);
          const allMatchedCodes = new Set(matchedRoutes.flatMap(m => m.legs.map(l => l.route.properties.code)));
          const isMatched = allMatchedCodes.has(code);

          // Determine if this route should be hidden
          const isHidden = !showRoutes
            || (searchMode === 'results' && selectedRoute && !isSelected);

          const dimmed = searchMode === 'results' && !isMatched && !isSelected;

          // Trim to boarding → alighting segment when selected in search mode
          let coords = route.coordinates;
          if (!isHidden && isSelected && searchMode === 'results') {
            const matched = matchedRoutes.find(m =>
              m.legs.map(l => l.route.properties.code).join('+') === selectedRoute
            );
            if (matched) {
              const leg = matched.legs.find(l => l.route.properties.code === code);
              if (leg) {
                const nearest = (pt: { latitude: number; longitude: number }) => {
                  let best = 0;
                  let bestD = Infinity;
                  for (let i = 0; i < route.coordinates.length; i++) {
                    const d = (route.coordinates[i].latitude - pt.latitude) ** 2
                            + (route.coordinates[i].longitude - pt.longitude) ** 2;
                    if (d < bestD) { bestD = d; best = i; }
                  }
                  return best;
                };
                const bIdx = nearest(leg.boardingPoint);
                const aIdx = nearest(leg.alightingPoint);
                const start = Math.min(bIdx, aIdx);
                const end = Math.max(bIdx, aIdx);
                coords = route.coordinates.slice(start, end + 1);
              }
            }
          }

          return (
            <Polyline
              key={code}
              coordinates={isHidden ? [] : coords}
              strokeColor={isHidden ? 'rgba(0,0,0,0)' : isSelected ? '#E8A020' : dimmed ? 'rgba(33,150,243,0.2)' : '#2196F3'}
              strokeWidth={isHidden ? 0 : isSelected ? 5 : isMatched ? 4 : 3}
              lineCap="round"
              lineJoin="round"
              lineDashPattern={isSelected ? undefined : [1]}
              tappable={!isHidden}
              onPress={() => {
                if (!isHidden) {
                  setSelectedRoute(isSelected ? null : code);
                }
              }}
            />
          );
        })}

        {/* Boarding guide markers along the selected route(s) */}
        {showRoutes && selectedRoute && (() => {
          const selectedCodes = selectedRoute.split('+');
          return selectedCodes.flatMap((code) => {
            const route = jeepneyRoutes.find(r => r.properties.code === code);
            if (!route) return [];
            return route.stops.map((stop, idx) => {
              const isTerminal = stop.type === 'terminal';
              return (
                <Marker
                  key={`stop-${code}-${idx}`}
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
          });
        })()}

        {/* Walking paths: user → board leg1 → (alight leg1 → walk → board leg2 →) → alight → destination */}
        {showRoutes && searchMode === 'results' && selectedRoute && currentLocation && (() => {
          const matched = matchedRoutes.find(m =>
            m.legs.map(l => l.route.properties.code).join('+') === selectedRoute
          );
          if (!matched) return null;

          const { legs } = matched;
          const firstLeg = legs[0];
          const lastLeg = legs[legs.length - 1];
          const elements: React.ReactNode[] = [];

          // Helper: dashed walking line + walking icon at midpoint
          const walkSegment = (
            from: { latitude: number; longitude: number },
            to: { latitude: number; longitude: number },
            key: string,
          ) => {
            // Use road-following path if available, otherwise straight line
            const routedPath = walkingPaths[key];
            const coords = routedPath && routedPath.length > 1 ? routedPath : [from, to];
            const mid = coords[Math.floor(coords.length / 2)];
            return (
              <React.Fragment key={key}>
                <Polyline
                  coordinates={coords}
                  strokeColor="#555555"
                  strokeWidth={3}
                  lineDashPattern={[8, 8]}
                  lineCap="round"
                />
                <Marker
                  coordinate={mid}
                  anchor={{ x: 0.5, y: 0.5 }}
                  tracksViewChanges={false}
                >
                  <View style={styles.walkingIconBubble}>
                    <Ionicons name="walk" size={16} color="#555555" />
                  </View>
                </Marker>
              </React.Fragment>
            );
          };

          // 1. Walk from current location → first boarding point
          elements.push(walkSegment(currentLocation, firstLeg.boardingPoint, 'walk-to-board'));
          elements.push(
            <Marker
              key="board-first"
              coordinate={firstLeg.boardingPoint}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}
            >
              <View style={styles.boardMarker}>
                <Ionicons name="arrow-up-circle" size={20} color="#FFFFFF" />
              </View>
              <Callout tooltip>
                <View style={styles.stopCallout}>
                  <Text style={styles.stopCalloutLabel}>Board {firstLeg.route.properties.code}</Text>
                  <Text style={styles.stopCalloutType}>🚶 Walk to this point</Text>
                </View>
              </Callout>
            </Marker>
          );

          // 2. Transfer walks between legs
          for (let i = 0; i < legs.length - 1; i++) {
            const alightPoint = legs[i].alightingPoint;
            const nextBoardPoint = legs[i + 1].boardingPoint;

            // Alight marker for current leg
            elements.push(
              <Marker
                key={`alight-${i}`}
                coordinate={alightPoint}
                anchor={{ x: 0.5, y: 0.5 }}
                tracksViewChanges={false}
              >
                <View style={styles.alightMarker}>
                  <Ionicons name="arrow-down-circle" size={20} color="#FFFFFF" />
                </View>
                <Callout tooltip>
                  <View style={styles.stopCallout}>
                    <Text style={styles.stopCalloutLabel}>Alight {legs[i].route.properties.code}</Text>
                    <Text style={styles.stopCalloutType}>🔄 Transfer</Text>
                  </View>
                </Callout>
              </Marker>
            );

            // Walk line between transfer
            elements.push(walkSegment(alightPoint, nextBoardPoint, `walk-transfer-${i}`));

            // Board marker for next leg
            elements.push(
              <Marker
                key={`board-${i + 1}`}
                coordinate={nextBoardPoint}
                anchor={{ x: 0.5, y: 0.5 }}
                tracksViewChanges={false}
              >
                <View style={styles.boardMarker}>
                  <Ionicons name="arrow-up-circle" size={20} color="#FFFFFF" />
                </View>
                <Callout tooltip>
                  <View style={styles.stopCallout}>
                    <Text style={styles.stopCalloutLabel}>Board {legs[i + 1].route.properties.code}</Text>
                    <Text style={styles.stopCalloutType}>🚶 Walk to this point</Text>
                  </View>
                </Callout>
              </Marker>
            );
          }

          // 3. Walk from last alight → destination
          if (destinationLocation) {
            elements.push(
              <Marker
                key="alight-last"
                coordinate={lastLeg.alightingPoint}
                anchor={{ x: 0.5, y: 0.5 }}
                tracksViewChanges={false}
              >
                <View style={styles.alightMarker}>
                  <Ionicons name="arrow-down-circle" size={20} color="#FFFFFF" />
                </View>
                <Callout tooltip>
                  <View style={styles.stopCallout}>
                    <Text style={styles.stopCalloutLabel}>Alight here</Text>
                    <Text style={styles.stopCalloutType}>🚶 Walk to destination</Text>
                  </View>
                </Callout>
              </Marker>
            );
            elements.push(walkSegment(lastLeg.alightingPoint, destinationLocation, 'walk-to-dest'));
          }

          return <>{elements}</>;
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
        <View style={styles.quickActionsRow}>
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

          {/* Toggle transit routes visibility */}
          <TouchableOpacity
            style={styles.routeToggleBtn}
            activeOpacity={0.8}
            onPress={toggleTransitVisuals}
          >
            <Ionicons
              name={showRoutes ? 'bus' : 'bus-outline'}
              size={20}
              color={showRoutes ? '#2196F3' : COLORS.textMuted}
            />
          </TouchableOpacity>
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
            {searchMode === 'results' ? (
              <View style={styles.sheetHeaderRow}>
                <Text style={styles.sheetHeaderTitle}>AVAILABLE ROUTES</Text>
                <TouchableOpacity
                  style={styles.clearButton}
                  onPress={() => {
                    setSearchMode('idle');
                    setMatchedRoutes([]);
                    setSelectedRoute(null);
                    setDestinationLocation(null);
                    setRouteCoordinates([]);
                    setRouteSummary(null);
                    setDestinationName('');
                    setDestinationQuery('');
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close-circle" size={22} color={COLORS.textMuted} />
                </TouchableOpacity>
              </View>
            ) : (
              <Text style={styles.sheetHeaderTitle}>ROUTE FINDER</Text>
            )}
          </View>
        </TouchableOpacity>

        <ScrollView 
          showsVerticalScrollIndicator={false} 
          contentContainerStyle={styles.sheetContent}
          bounces={false}
        >
          {searchMode === 'results' ? (
            <View style={styles.cardList}>
              {destinationName ? (
                <Text style={styles.routeResultSubtitle}>
                  {matchedRoutes.length} route{matchedRoutes.length !== 1 ? 's' : ''} to {destinationName}
                </Text>
              ) : null}

              {/* Ranking Tabs */}
              {matchedRoutes.length > 1 && (
                <View style={styles.rankTabsRow}>
                  {RANK_TABS.map((tab) => (
                    <TouchableOpacity
                      key={tab.key}
                      style={[styles.rankTab, rankTab === tab.key && styles.rankTabActive]}
                      activeOpacity={0.8}
                      onPress={() => setRankTab(tab.key)}
                    >
                      <Text style={[styles.rankTabText, rankTab === tab.key && styles.rankTabTextActive]}>
                        {tab.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {matchedRoutes.length > 0 ? (
                rankedRoutes.map((matched, index) => {
                  const id = matched.legs.map(l => l.route.properties.code).join('+');
                  const badgeLabel = index === 0 && rankedRoutes.length > 1
                    ? RANK_TABS.find(t => t.key === rankTab)!.label
                    : undefined;
                  return (
                    <RouteResultCard
                      key={id}
                      matched={matched}
                      isSelected={selectedRoute === id}
                      badgeLabel={badgeLabel}
                      onPress={(pressedId) => {
                        setSelectedRoute(selectedRoute === pressedId ? null : pressedId);
                      }}
                    />
                  );
                })
              ) : (
                <View style={styles.emptyResultCard}>
                  <Ionicons name="bus-outline" size={36} color={COLORS.textMuted} />
                  <Text style={styles.emptyResultTitle}>No transit routes found</Text>
                  <Text style={styles.emptyResultText}>
                    No jeepney routes pass near both your location and this destination. Try a different place.
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.cardList}>
              <View style={styles.emptyResultCard}>
                <Ionicons name="search-outline" size={36} color={COLORS.textMuted} />
                <Text style={styles.emptyResultTitle}>Search a destination</Text>
                <Text style={styles.emptyResultText}>
                  Enter a destination above to see available transit route options.
                </Text>
              </View>
            </View>
          )}
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
  quickActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    marginHorizontal: SPACING.screenX,
    gap: 8,
  },
  quickActionsContainer: {
    flex: 1,
  },
  routeToggleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(10,22,40,0.08)',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
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
  walkingIconBubble: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#555555',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  boardMarker: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  alightMarker: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F44336',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: SPACING.screenX,
  },
  clearButton: {
    padding: 4,
  },
  routeResultSubtitle: {
    fontFamily: 'Inter',
    fontSize: TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    marginBottom: 4,
  },
  emptyResultCard: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 20,
    gap: 8,
  },
  emptyResultTitle: {
    fontFamily: 'Inter',
    fontSize: TYPOGRAPHY.body,
    fontWeight: '700',
    color: COLORS.navy,
  },
  emptyResultText: {
    fontFamily: 'Inter',
    fontSize: TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
  rankTabsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  rankTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(10,22,40,0.08)',
    alignItems: 'center',
  },
  rankTabActive: {
    backgroundColor: '#E8A020',
    borderColor: '#E8A020',
  },
  rankTabText: {
    fontFamily: 'Inter',
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.navy,
  },
  rankTabTextActive: {
    color: '#FFFFFF',
  },
});
