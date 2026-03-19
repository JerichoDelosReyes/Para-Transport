import React, { useState, useRef, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Animated, ActivityIndicator, Platform, Keyboard, TouchableWithoutFeedback, Alert, ScrollView, PanResponder, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import MapView, { UrlTile, Marker, Polyline } from 'react-native-maps';
import { BlurView } from 'expo-blur';
import * as Location from 'expo-location';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../../constants/theme';
import { MAP_CONFIG } from '../../constants/map';
import { useCommuteRoutes } from '../../hooks/useCommuteRoutes';
import { useJeepneyRoutes } from '../../hooks/useJeepneyRoutes';
import { useTransitData } from '../../hooks/useTransitData';
import { useRouteSuggestions, sortSuggestions, RouteSuggestion, SortMode } from '../../hooks/useRouteSuggestions';
import { haversineDistance } from '../../utils/geoUtils';
import { ProfileButton } from '../../components/ProfileButton';
import { useStore } from '../../store/useStore';

const GEOCODING_BASE_URL = process.env.EXPO_PUBLIC_GEOCODING_BASE_URL || 'https://nominatim.openstreetmap.org';
const ROUTING_BASE_URL = 'https://router.project-osrm.org/route/v1/driving';
const WALKING_ROUTE_URL = 'https://router.project-osrm.org/route/v1/foot';
const WALK_ROUTE_COLOR = '#3AA0E6';

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

type PlaceSuggestion = {
  id: string;
  title: string;
  subtitle: string;
  latitude: number;
  longitude: number;
};

const toMapCoordinates = (coordinates: number[][]): MapCoordinate[] =>
  coordinates.map(([lng, lat]) => ({ latitude: lat, longitude: lng }));

const MIN_WALK_DISTANCE_M = 30;

async function fetchWalkingRoute(from: MapCoordinate, to: MapCoordinate): Promise<MapCoordinate[]> {
  try {
    const res = await fetch(
      `${WALKING_ROUTE_URL}/${from.longitude},${from.latitude};${to.longitude},${to.latitude}?overview=full&geometries=geojson`
    );
    const data = await res.json();
    const coords = data?.routes?.[0]?.geometry?.coordinates;
    if (coords?.length) return toMapCoordinates(coords);
  } catch {}
  return [from, to];
}

const interpolatePoint = (a: MapCoordinate, b: MapCoordinate, t: number): MapCoordinate => ({
  latitude: a.latitude + (b.latitude - a.latitude) * t,
  longitude: a.longitude + (b.longitude - a.longitude) * t,
});

const buildDashedSegments = (
  coordinates: MapCoordinate[],
  dashMeters = 22,
  gapMeters = 16
): MapCoordinate[][] => {
  if (coordinates.length < 2) return [];

  const dashed: MapCoordinate[][] = [];
  let drawing = true;
  let remaining = dashMeters;
  let currentDash: MapCoordinate[] | null = null;

  for (let i = 1; i < coordinates.length; i++) {
    const start = coordinates[i - 1];
    const end = coordinates[i];
    const segmentLength = haversineDistance(start, end);
    if (segmentLength <= 0) continue;

    let travelled = 0;

    while (travelled < segmentLength) {
      const chunk = Math.min(remaining, segmentLength - travelled);
      const t0 = travelled / segmentLength;
      const t1 = (travelled + chunk) / segmentLength;
      const p0 = interpolatePoint(start, end, t0);
      const p1 = interpolatePoint(start, end, t1);

      if (drawing) {
        if (!currentDash) currentDash = [p0];
        const last = currentDash[currentDash.length - 1];
        if (last.latitude !== p0.latitude || last.longitude !== p0.longitude) {
          currentDash.push(p0);
        }
        currentDash.push(p1);
      }

      travelled += chunk;
      remaining -= chunk;

      if (remaining <= 0.0001) {
        if (drawing && currentDash && currentDash.length > 1) {
          dashed.push(currentDash);
          currentDash = null;
        }
        drawing = !drawing;
        remaining = drawing ? dashMeters : gapMeters;
      }
    }
  }

  if (drawing && currentDash && currentDash.length > 1) {
    dashed.push(currentDash);
  }

  return dashed;
};

type WalkingPath = { coordinates: MapCoordinate[]; color: string; midpoint: MapCoordinate; dashSegments: MapCoordinate[][] };

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
  const [matchedCommute, setMatchedCommute] = useState<any>(null); // from useCommuteRoutes
  const [mapRegion, setMapRegion] = useState<MapRegion>(INITIAL_REGION);
  const [routeSuggestions, setRouteSuggestions] = useState<RouteSuggestion[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>('easiest');
  const [selectedSuggestion, setSelectedSuggestion] = useState<RouteSuggestion | null>(null);
  const [walkingPaths, setWalkingPaths] = useState<WalkingPath[]>([]);
  const { routes: commuteRoutes } = useCommuteRoutes();
  const { routes: localRoutes } = useJeepneyRoutes();
  const { routes: transitRoutes, stops: transitStops } = useTransitData();
  const { computeSuggestions } = useRouteSuggestions();
  const selectedTransitRoute = useStore((state) => state.selectedTransitRoute);
  const setSelectedTransitRoute = useStore((state) => state.setSelectedTransitRoute);
  const mapRef = useRef<MapView | null>(null);

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

  // Draggable commute panel
  const screenHeight = Dimensions.get('window').height;
  const PANEL_SNAP_TOP = -(screenHeight * 0.22);
  const PANEL_SNAP_BOTTOM = 0;
  const panelTranslateY = useRef(new Animated.Value(PANEL_SNAP_BOTTOM)).current;
  const panelLastY = useRef(PANEL_SNAP_BOTTOM);
  const panelPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 5,
      onPanResponderGrant: () => {
        panelTranslateY.setOffset(panelLastY.current);
        panelTranslateY.setValue(0);
      },
      onPanResponderMove: Animated.event([null, { dy: panelTranslateY }], { useNativeDriver: false }),
      onPanResponderRelease: (_, g) => {
        panelTranslateY.flattenOffset();
        const raw = panelLastY.current + g.dy;
        const clamped = Math.min(PANEL_SNAP_BOTTOM, Math.max(PANEL_SNAP_TOP, raw));
        const snapTo = clamped < (PANEL_SNAP_TOP + PANEL_SNAP_BOTTOM) / 2 ? PANEL_SNAP_TOP : PANEL_SNAP_BOTTOM;
        panelLastY.current = snapTo;
        Animated.spring(panelTranslateY, {
          toValue: snapTo,
          useNativeDriver: false,
          tension: 80,
          friction: 12,
        }).start();
      },
    })
  ).current;

  useEffect(() => {
    if (routeSuggestions.length > 0) {
      panelLastY.current = PANEL_SNAP_BOTTOM;
      panelTranslateY.setValue(PANEL_SNAP_BOTTOM);
    }
  }, [routeSuggestions.length, PANEL_SNAP_BOTTOM, panelTranslateY]);

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

  useEffect(() => {
    if (routeSuggestions.length > 0) {
      setRouteSuggestions((prev) => sortSuggestions([...prev], sortMode));
    }
  }, [sortMode]);

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

    setSelectedTransitRoute(null);
    setSelectedSuggestion(null);
    setWalkingPaths([]);
    setRouteSuggestions([]);
    setMatchedCommute(null);
    setRouteSummary(null);
    setRouteCoordinates([]);

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

      mapRef.current?.fitToCoordinates([currentLocation, destinationPoint], {
        edgePadding: { top: 120, right: 40, bottom: 220, left: 40 },
        animated: true,
      });

      // Compute transit suggestions
      const suggestions = computeSuggestions(currentLocation, destinationPoint);
      const sortedSuggestions = sortSuggestions(suggestions, sortMode);
      setRouteSuggestions(sortedSuggestions);

      if (sortedSuggestions.length > 0) {
        await handleSelectSuggestion(sortedSuggestions[0], destinationPoint);
      } else {
        Alert.alert('No Transit Route Found', 'No transit route is available yet for this destination.');
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

  const handleMapLongPress = async (e: any) => {
    if (isSearchActive || isRouting) return;

    const { latitude, longitude } = e.nativeEvent.coordinate;
    const pinLocation: MapCoordinate = { latitude, longitude };

    setSelectedTransitRoute(null);
    setSelectedSuggestion(null);
    setWalkingPaths([]);
    setRouteSuggestions([]);
    setMatchedCommute(null);
    setRouteSummary(null);
    setRouteCoordinates([]);

    setDestinationLocation(pinLocation);
    setDestinationQuery('Dropped Pin');
    setIsRouting(true);

    try {
      // Reverse geocode to get a name for the pin
      const reverseParams = new URLSearchParams({
        lat: String(latitude),
        lon: String(longitude),
        format: 'json',
        zoom: '16',
      });

      const reverseResp = await fetch(`${GEOCODING_BASE_URL}/reverse?${reverseParams.toString()}`, {
        headers: { 'Accept-Language': 'en' },
      });

      if (reverseResp.ok) {
        const reverseData = await reverseResp.json();
        const displayName = String(reverseData?.display_name || '').trim();
        if (displayName) {
          const parts = displayName.split(',').map((p: string) => p.trim()).filter(Boolean);
          setDestinationQuery(parts.slice(0, 2).join(', ') || 'Dropped Pin');
        }
      }

      if (!currentLocation) {
        Alert.alert('GPS Not Ready', 'Waiting for your current location.');
        return;
      }

      mapRef.current?.fitToCoordinates([currentLocation, pinLocation], {
        edgePadding: { top: 120, right: 40, bottom: 220, left: 40 },
        animated: true,
      });

      // Compute transit suggestions
      const suggestions = computeSuggestions(currentLocation, pinLocation);
      const sortedSuggestions = sortSuggestions(suggestions, sortMode);
      setRouteSuggestions(sortedSuggestions);

      if (sortedSuggestions.length > 0) {
        await handleSelectSuggestion(sortedSuggestions[0], pinLocation);
      } else {
        Alert.alert('No Transit Route Found', 'No transit route is available yet for this pin.');
      }
    } catch (error) {
      console.warn('[HomeScreen] Pin route failed:', error);
    } finally {
      setIsRouting(false);
    }
  };

  const handleSelectSuggestion = async (suggestion: RouteSuggestion, destinationOverride?: MapCoordinate) => {
    setSelectedSuggestion(suggestion);
    setMatchedCommute(suggestion.commuteGuideMatch || null);
    setRouteSummary({
      distanceKm: suggestion.totalDistanceKm,
      durationMin: suggestion.estimatedMinutes,
    });
    setWalkingPaths([]);

    // Gather all path coordinates to fit map
    const allCoords = suggestion.legs.flatMap((leg) => leg.pathCoordinates);
    if (allCoords.length > 1) {
      mapRef.current?.fitToCoordinates(allCoords, {
        edgePadding: { top: 140, right: 40, bottom: 280, left: 40 },
        animated: true,
      });
    }

    // Build walking segments and fetch road-following paths
    const segments: { from: MapCoordinate; to: MapCoordinate; color: string }[] = [];

    // Walk to first board stop
    if (currentLocation) {
      const board = suggestion.legs[0].boardStop.coordinate;
      if (haversineDistance(currentLocation, board) >= MIN_WALK_DISTANCE_M) {
        segments.push({ from: currentLocation, to: board, color: suggestion.legs[0].route.color });
      }
    }

    // Walk between transfer legs
    for (let i = 0; i < suggestion.legs.length - 1; i++) {
      const alight = suggestion.legs[i].alightStop.coordinate;
      const nextBoard = suggestion.legs[i + 1].boardStop.coordinate;
      if (haversineDistance(alight, nextBoard) >= MIN_WALK_DISTANCE_M) {
        segments.push({ from: alight, to: nextBoard, color: suggestion.legs[i + 1].route.color });
      }
    }

    // Walk from last alight to destination
    const activeDestination = destinationOverride || destinationLocation;
    if (activeDestination) {
      const lastLeg = suggestion.legs[suggestion.legs.length - 1];
      const alight = lastLeg.alightStop.coordinate;
      if (haversineDistance(alight, activeDestination) >= MIN_WALK_DISTANCE_M) {
        segments.push({ from: alight, to: activeDestination, color: lastLeg.route.color });
      }
    }

    // Fetch all walking routes in parallel
    const paths = await Promise.all(
      segments.map(async (seg) => {
        const coords = await fetchWalkingRoute(seg.from, seg.to);
        const mid = coords[Math.floor(coords.length / 2)];
        return {
          coordinates: coords,
          color: WALK_ROUTE_COLOR,
          midpoint: mid,
          dashSegments: buildDashedSegments(coords),
        };
      })
    );
    setWalkingPaths(paths);
  };

  const getModeIcon = (type: string): keyof typeof Ionicons.glyphMap => {
    switch (type) {
      case 'jeepney': return 'car';
      case 'bus': return 'bus';
      case 'share_taxi': return 'car-sport';
      default: return 'bus';
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
        onRegionChangeComplete={(region) => setMapRegion(region)}
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
            coordinate={destinationLocation}
            title="Destination"
            description={destinationQuery}
            tracksViewChanges={false}
            draggable
            onDragEnd={(e) => handleMapLongPress(e)}
          />
        )}

        {selectedTransitRoute?.segments?.map((seg: any[], idx: number) =>
          Array.isArray(seg) && seg.length > 1 ? (
          <Polyline
            key={`selected-transit-${selectedTransitRoute.id}-${idx}`}
            coordinates={seg}
            strokeColor={selectedTransitRoute.color || '#1E88E5'}
            strokeWidth={5}
            lineCap="round"
            lineJoin="round"
          />
          ) : null
        )}

        {/* Selected suggestion leg paths */}
        {selectedSuggestion?.legs.map((leg, idx) => {
          const coords = leg.pathCoordinates;
          // If we have valid coordinates, render them
          if (coords && Array.isArray(coords)) {
            // If we only have 1 coordinate, draw a line from board to alight
            if (coords.length < 2) {
              return (
                <Polyline
                  key={`suggestion-leg-${idx}`}
                  coordinates={[leg.boardStop.coordinate, leg.alightStop.coordinate]}
                  strokeColor={leg.route.color}
                  strokeWidth={5}
                  lineCap="round"
                  lineJoin="round"
                />
              );
            }
            // Otherwise render the full path
            return (
              <Polyline
                key={`suggestion-leg-${idx}`}
                coordinates={coords}
                strokeColor={leg.route.color}
                strokeWidth={5}
                lineCap="round"
                lineJoin="round"
              />
            );
          }
          return null;
        })}

        {/* Selected suggestion stop markers */}
        {selectedSuggestion?.legs.map((leg, idx) => (
          <React.Fragment key={`suggestion-stops-${idx}`}>
            <Marker
              coordinate={leg.boardStop.coordinate}
              title={`Board: ${leg.boardStop.name}`}
              description={leg.route.label}
              tracksViewChanges={false}
              pinColor="green"
            />
            <Marker
              coordinate={leg.alightStop.coordinate}
              title={`Alight: ${leg.alightStop.name}`}
              description={leg.route.label}
              tracksViewChanges={false}
              pinColor="red"
            />
          </React.Fragment>
        ))}

        {/* Road-following dashed walking lines */}
        {walkingPaths.map((wp, idx) => {
          const dashSegments = Array.isArray(wp.dashSegments)
            ? wp.dashSegments
            : buildDashedSegments(wp.coordinates || []);

          return (
            <React.Fragment key={`walk-path-${idx}`}>
              <Polyline
                coordinates={wp.coordinates}
                strokeColor="rgba(130, 140, 150, 0.45)"
                strokeWidth={2}
                lineCap="round"
                lineJoin="round"
              />
              {dashSegments.map((dashCoordinates, dashIdx) => (
                <Polyline
                  key={`walk-path-${idx}-dash-${dashIdx}`}
                  coordinates={dashCoordinates}
                  strokeColor={wp.color}
                  strokeWidth={5}
                  lineCap="round"
                  lineJoin="round"
                />
              ))}
            </React.Fragment>
          );
        })}

        {/* Walking person icon markers at midpoints */}
        {walkingPaths.map((wp, idx) => (
          <Marker
            key={`walk-icon-${idx}`}
            coordinate={wp.midpoint}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
          >
            <View style={[styles.walkIconBubble, { borderColor: wp.color }]}>
              <Ionicons name="walk" size={14} color={wp.color} />
            </View>
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
            <Text style={styles.headerTitle}>HI, JERICHO!</Text>
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


        {routeSummary && (
          <View style={styles.routeSummaryCard}>
            <Text style={styles.routeSummaryTitle}>Route Ready</Text>
            <Text style={styles.routeSummaryValue}>
              {routeSummary.distanceKm.toFixed(1)} km • {Math.ceil(routeSummary.durationMin)} min
            </Text>
          </View>
        )}

        {/* ── Commute Options Draggable Panel ── */}
        {routeSuggestions.length > 0 && (
          <Animated.View
            style={[
              styles.suggestionsContainer,
              { transform: [{ translateY: panelTranslateY }] },
            ]}
          >
            <View {...panelPanResponder.panHandlers} style={styles.dragHandleArea}>
              <View style={styles.panelDragHandle} />
            </View>

            <View style={styles.suggestionsHeaderRow}>
              <Text style={styles.suggestionsTitle}>Commute Options</Text>
            </View>

            <View style={styles.sortPillRow}>
              {(['easiest', 'fastest', 'cheapest'] as SortMode[]).map((mode) => (
                <TouchableOpacity
                  key={mode}
                  style={[styles.sortPill, sortMode === mode && styles.sortPillActive]}
                  onPress={() => {
                    setSortMode(mode);
                    setRouteSuggestions((prev) => sortSuggestions(prev, mode));
                  }}
                >
                  <Text style={[styles.sortPillText, sortMode === mode && styles.sortPillTextActive]}>
                    {mode.charAt(0).toUpperCase() + mode.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <ScrollView style={styles.suggestionScroll} showsVerticalScrollIndicator={false} nestedScrollEnabled>
              {routeSuggestions.map((s, idx) => (
                <TouchableOpacity
                  key={s.id}
                  activeOpacity={0.7}
                  style={[
                    styles.suggestionCardItem,
                    selectedSuggestion?.id === s.id && styles.suggestionCardItemSelected,
                  ]}
                  onPress={() => handleSelectSuggestion(s)}
                >
                  <View style={styles.suggestionCardTop}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name={getModeIcon(s.legs[0].route.type)} size={18} color={s.legs[0].route.color} />
                      <Text style={{ fontWeight: '700', color: COLORS.navy, fontSize: 14 }}>
                        {s.legs.map((l) => l.route.ref || l.route.name).join(' → ')}
                      </Text>
                    </View>
                    {s.legs.length > 1 && (
                      <View style={styles.transferBadge}>
                        <Text style={styles.transferBadgeText}>{s.legs.length - 1}x transfer</Text>
                      </View>
                    )}
                  </View>

                  {/* Legs detail */}
                  {s.legs.map((leg, li) => (
                    <View key={li} style={styles.legSummaryRow}>
                      <View style={[styles.legChip, { backgroundColor: leg.route.color + '22' }]}>
                        <Ionicons name={getModeIcon(leg.route.type)} size={12} color={leg.route.color} />
                        <Text style={[styles.legChipText, { color: leg.route.color }]}>
                          {leg.route.ref || leg.route.name}
                        </Text>
                      </View>
                      <View style={styles.stopsDetail}>
                        <View style={styles.stopDetailRow}>
                          <View style={[styles.stopDot, { backgroundColor: leg.route.color }]} />
                          <Text style={styles.stopDetailText} numberOfLines={1}>{leg.boardStop.name}</Text>
                        </View>
                        <View style={styles.stopDetailRow}>
                          <View style={[styles.stopDot, { backgroundColor: leg.route.color, opacity: 0.5 }]} />
                          <Text style={styles.stopDetailText} numberOfLines={1}>{leg.alightStop.name}</Text>
                        </View>
                      </View>
                      <Text style={styles.legFareText}>₱{leg.fare}</Text>
                    </View>
                  ))}

                  <View style={styles.suggestionTotalsRow}>
                    <Text style={styles.suggestionTotalItem}>₱{s.totalFare}</Text>
                    <Text style={styles.suggestionTotalItem}>{s.totalDistanceKm.toFixed(1)} km</Text>
                    <Text style={styles.suggestionTotalItem}>~{Math.ceil(s.estimatedMinutes)} min</Text>
                  </View>

                  {s.commuteGuideMatch && (
                    <View style={styles.commuteGuideNote}>
                      <Ionicons name="book" size={12} color={COLORS.primary} />
                      <Text style={styles.commuteGuideNoteText}>
                        Matches commute guide: {s.commuteGuideMatch.transport}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              ))}
              {routeSuggestions.length === 0 && (
                <Text style={styles.noSuggestionsText}>No transit options found for this route.</Text>
              )}
            </ScrollView>
          </Animated.View>
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
  walkIconBubble: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  // ── Commute Options Panel ──
  suggestionsContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 24,
    maxHeight: '40%',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -3 },
    elevation: 10,
  },
  dragHandleArea: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  panelDragHandle: {
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#D0D5DD',
  },
  suggestionsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  suggestionsTitle: {
    fontFamily: 'Inter',
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.navy,
  },
  sortPillRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  sortPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: '#F2F4F7',
  },
  sortPillActive: {
    backgroundColor: COLORS.navy,
  },
  sortPillText: {
    fontFamily: 'Inter',
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  sortPillTextActive: {
    color: '#FFFFFF',
  },
  suggestionScroll: {
    paddingHorizontal: 16,
  },
  suggestionCardItem: {
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  suggestionCardItemSelected: {
    borderColor: COLORS.navy,
    backgroundColor: '#EEF2FF',
  },
  suggestionCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  transferBadge: {
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  transferBadgeText: {
    fontFamily: 'Inter',
    fontSize: 10,
    fontWeight: '700',
    color: '#E65100',
  },
  suggestionWalk: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
  },
  legSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  legChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  legChipText: {
    fontFamily: 'Inter',
    fontSize: 11,
    fontWeight: '700',
  },
  stopsDetail: {
    flex: 1,
    gap: 2,
  },
  stopDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  stopDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  stopDetailText: {
    fontFamily: 'Inter',
    fontSize: 11,
    color: COLORS.textMuted,
  },
  legFareText: {
    fontFamily: 'Inter',
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.navy,
  },
  suggestionTotalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 8,
    marginTop: 4,
  },
  suggestionTotalItem: {
    fontFamily: 'Inter',
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.navy,
  },
  commuteGuideNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  commuteGuideNoteText: {
    fontFamily: 'Inter',
    fontSize: 11,
    color: COLORS.primary,
    fontWeight: '600',
  },
  noSuggestionsText: {
    fontFamily: 'Inter',
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
    paddingVertical: 24,
  },
});
