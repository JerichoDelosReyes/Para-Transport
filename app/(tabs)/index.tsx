import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, ActivityIndicator, Platform, Keyboard, TouchableWithoutFeedback, Alert, StatusBar, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import MapView, { Marker, Polyline, Callout } from 'react-native-maps';
import {
  MapView as MapLibreMapView,
  Camera as MapLibreCamera,
  ShapeSource,
  LineLayer,
  PointAnnotation,
  type CameraRef as MapLibreCameraRef,
} from '@maplibre/maplibre-react-native';
import { BlurView } from 'expo-blur';
import * as Location from 'expo-location';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../../constants/theme';
import { MAP_CONFIG } from '../../constants/map';
import { useJeepneyRoutes, JeepneyRoute } from '../../hooks/useJeepneyRoutes';
import { ROUTE_COLORS } from '../../constants/routeVisuals';
import { getRouteDisplayRef } from '../../constants/routeCatalog';
import SearchScreen, { PlaceResult } from '../../components/SearchScreen';
import { splitRouteSegments, buildTransitLegs, TransitLeg } from '../../utils/routeSegments';
import { ProfileButton } from '../../components/ProfileButton';
import { useStore } from '../../store/useStore';
import RouteRecommenderPanel from '../../components/RouteRecommenderPanel';
import { findRoutesForDestination, rankRoutes, MatchedRoute, RankMode } from '../../services/routeSearch';
import { useRoutes } from '../../hooks/useRoutes';
import { useSimulation } from '../../hooks/useSimulation';
import LOCAL_PLACES from '../../data/local_places';
import { fuzzyFilter } from '../../utils/fuzzySearch';

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
const USE_MAPLIBRE = MAP_CONFIG.MAP_RENDERER === 'maplibre';

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

type RouteMetrics = {
  durationMin: number;
  distanceKm: number;
  effectiveDurationMin: number;
  farePhp: number;
  walkMeters: number;
  transferCount: number;
  tricycleLegs: number;
};

type RecommenderCandidate = {
  id: string;
  coordinates: MapCoordinate[];
  summary: { distanceKm: number; durationMin: number };
  legs: TransitLeg[];
  metrics: RouteMetrics;
};

type RecommenderProfile = {
  destinationName?: string;
};

const sumLegDistanceMeters = (legs: TransitLeg[]): number => {
  return legs.reduce((total, leg) => {
    let segmentMeters = 0;
    for (let i = 1; i < leg.coordinates.length; i++) {
      segmentMeters += Math.sqrt(sqDistApprox(leg.coordinates[i - 1], leg.coordinates[i]));
    }
    return total + segmentMeters;
  }, 0);
};

const MODE_SPEED_KMPH: Record<string, number> = {
  walk: 3.8,
  tricycle: 24,
  jeepney: 16,
  bus: 18,
  transit: 15,
};

const MODE_WAIT_MIN: Record<string, number> = {
  walk: 0,
  tricycle: 1.5,
  jeepney: 3.5,
  bus: 4.5,
  transit: 3,
};

const getLegModeKey = (leg: TransitLeg): string => {
  if (!leg.onTransit) return 'walk';
  const t = String(leg.transitInfo?.type || '').toLowerCase();
  if (t.includes('tricycle')) return 'tricycle';
  if (t.includes('jeepney')) return 'jeepney';
  if (t.includes('bus')) return 'bus';
  return 'transit';
};

const computeModeAwareEtaMinutes = (legs: TransitLeg[]): number => {
  let eta = 0;
  let prevTransitMode: string | null = null;

  for (const leg of legs) {
    const mode = getLegModeKey(leg);
    const speed = MODE_SPEED_KMPH[mode] || MODE_SPEED_KMPH.transit;
    const distanceKm = sumLegDistanceMeters([leg]) / 1000;
    eta += (distanceKm / Math.max(speed, 1)) * 60;

    if (leg.onTransit) {
      eta += MODE_WAIT_MIN[mode] || MODE_WAIT_MIN.transit;
      if (prevTransitMode && prevTransitMode !== mode) {
        eta += 1.5;
      }
      prevTransitMode = mode;
    }
  }

  return eta;
};

const parseFareValue = (fare: unknown): number => {
  if (typeof fare === 'number' && Number.isFinite(fare)) return fare;
  if (typeof fare === 'string') {
    const m = fare.match(/\d+(\.\d+)?/);
    if (m) return Number(m[0]);
  }
  return 0;
};

const computeMetrics = (
  legs: TransitLeg[],
  durationMin: number,
  distanceKm: number,
): RouteMetrics => {
  const transitLegs = legs.filter((leg) => leg.onTransit);
  const walkLegs = legs.filter((leg) => !leg.onTransit);
  const walkMeters = sumLegDistanceMeters(walkLegs);
  const totalMeters = sumLegDistanceMeters(legs);
  const totalDistanceKm = totalMeters > 0 ? totalMeters / 1000 : distanceKm;
  const transferCount = Math.max(0, transitLegs.length - 1);
  const tricycleLegs = transitLegs.filter((leg) => leg.transitInfo?.type === 'tricycle').length;
  const farePhp = transitLegs.reduce((sum, leg) => sum + parseFareValue(leg.transitInfo?.fare), 0);

  const modeAwareEtaMin = computeModeAwareEtaMinutes(legs);

  // Blend algorithm ETA with OSRM baseline for stability while honoring mode speeds.
  const effectiveDurationMin = Math.max(1, modeAwareEtaMin * 0.75 + durationMin * 0.25);

  return {
    durationMin: effectiveDurationMin,
    distanceKm: totalDistanceKm,
    effectiveDurationMin,
    farePhp,
    walkMeters,
    transferCount,
    tricycleLegs,
  };
};

const routeSignature = (legs: TransitLeg[]): string => {
  return legs
    .map((leg) => {
      const mode = leg.transitRouteId || 'walk';
      const len = Math.round(sumLegDistanceMeters([leg]));
      return `${mode}:${len}`;
    })
    .join('|');
};

const candidateModes = (candidate: RecommenderCandidate): Set<string> => {
  const modes = new Set<string>();
  for (const leg of candidate.legs) {
    modes.add(getLegModeKey(leg));
  }
  return modes;
};

const candidateHasMode = (candidate: RecommenderCandidate, mode: string): boolean => {
  return candidateModes(candidate).has(mode);
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
  const [matchedRoutes, setMatchedRoutes] = useState<MatchedRoute[]>([]);
  const [rankTab, setRankTab] = useState<RankMode>('easiest');
  const [rankedRoutes, setRankedRoutes] = useState<MatchedRoute[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<MatchedRoute | null>(null);
  const [mapRegion, setMapRegion] = useState<MapRegion>(INITIAL_REGION);
  const { routes: gpxRoutes } = useRoutes();

  useEffect(() => {
    setRankedRoutes(rankRoutes(matchedRoutes, rankTab));
  }, [matchedRoutes, rankTab]);

  useEffect(() => {
    const route = matchedRoutes.find(m => m.legs.map((l: any) => l.route.properties.code).join('+') === selectedRouteId) || null;
    setSelectedRoute(route);
    if (route) {
      setRouteSummary({ distanceKm: route.distanceKm || 0, durationMin: route.estimatedMinutes || Math.round((route.distanceKm || 0) * 12) });
      const newCoords = route.legs.flatMap((leg: any) => leg.route.coordinates);
      if (newCoords && newCoords.length >= 2) {
        setRouteCoordinates(newCoords);
      } else {
        setRouteCoordinates([]);
      }
    } else {
      setRouteSummary(null);
      setRouteCoordinates([]);
    }
  }, [selectedRouteId, matchedRoutes]);

  // Normalize GPX routes to a unified transit shape
  const transitRoutes = useMemo(() => {
    const normalized = gpxRoutes.map((r: JeepneyRoute) => ({
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
  const addHistory = useStore((state) => state.addHistory);
  const updateLatestHistoryFare = useStore((state) => state.updateLatestHistoryFare);
  const addTripStats = useStore((state) => state.addTripStats);
  const mapRef = useRef<MapView | null>(null);
  const mapLibreCameraRef = useRef<MapLibreCameraRef | null>(null);
  const tripStatRecordedRef = useRef(false);
  const [showRecommender, setShowRecommender] = useState(false);
  const [simAutoFollow, setSimAutoFollow] = useState(true);
  const [simBlink, setSimBlink] = useState(true);

  const selectedOptionLabel = useMemo(() => {
    if (!selectedRouteId) return 'Current Route';
    return selectedRoute?.legs.map((l: any) => l.route.properties.code).join('+') || 'Current Route';
  }, [selectedRouteId, selectedRoute]);

  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

  const regionToZoomLevel = (region: MapRegion): number => {
    const zoom = Math.log2(360 / Math.max(region.longitudeDelta, 0.0001));
    return clamp(zoom, 10, 18);
  };

  const animateRegion = (next: MapRegion, durationMs: number) => {
    if (USE_MAPLIBRE) {
      mapLibreCameraRef.current?.setCamera({
        centerCoordinate: [next.longitude, next.latitude],
        zoomLevel: regionToZoomLevel(next),
        animationDuration: durationMs,
        animationMode: 'easeTo',
      });
      return;
    }

    mapRef.current?.animateToRegion(next, durationMs);
  };

  const fitRouteCoordinates = (allCoords: MapCoordinate[]) => {
    if (allCoords.length === 0) return;

    if (USE_MAPLIBRE) {
      let minLat = Infinity;
      let maxLat = -Infinity;
      let minLng = Infinity;
      let maxLng = -Infinity;

      for (const coord of allCoords) {
        minLat = Math.min(minLat, coord.latitude);
        maxLat = Math.max(maxLat, coord.latitude);
        minLng = Math.min(minLng, coord.longitude);
        maxLng = Math.max(maxLng, coord.longitude);
      }

      mapLibreCameraRef.current?.fitBounds(
        [maxLng, maxLat],
        [minLng, minLat],
        [160, 50, 300, 50],
        700,
      );
      return;
    }

    mapRef.current?.fitToCoordinates(allCoords, {
      edgePadding: { top: 160, right: 50, bottom: 300, left: 50 },
      animated: true,
    });
  };

  const handleZoomIn = () => {
    const next: MapRegion = {
      ...mapRegion,
      latitudeDelta: clamp(mapRegion.latitudeDelta * 0.7, 0.0025, 0.4),
      longitudeDelta: clamp(mapRegion.longitudeDelta * 0.7, 0.0025, 0.4),
    };
    setMapRegion(next);
    animateRegion(next, 250);
  };

  const handleZoomOut = () => {
    const next: MapRegion = {
      ...mapRegion,
      latitudeDelta: clamp(mapRegion.latitudeDelta / 0.7, 0.0025, 0.4),
      longitudeDelta: clamp(mapRegion.longitudeDelta / 0.7, 0.0025, 0.4),
    };
    setMapRegion(next);
    animateRegion(next, 250);
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
      animateRegion(next, 500);
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



  // Find the nearest stop to the user's current location

  const handleClearRoute = useCallback((clearOrigin = true, clearDestination = true) => {
    if (clearDestination) setDestinationQuery('');
    if (clearOrigin) setOriginQuery('');
    setDestinationLocation(null);
    setMatchedRoutes([]);
    setSelectedRouteId(null);
    setPendingRouteSearch(null);
    setSelectedTransitRoute(null);
  }, [setPendingRouteSearch, setSelectedTransitRoute]);



  const handleSearchSelectRoute = useCallback((origin: PlaceResult | null, destination: PlaceResult) => {
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
      animateRegion({ ...destinationPoint, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 600);
      return;
    }

    try {
      setIsRouting(true);
      const results = findRoutesForDestination(
        startPoint,
        destinationPoint,
        gpxRoutes,
      );

      setMatchedRoutes(results);
      setSelectedRouteId(null);
      setShowRecommender(true);

      if (results.length > 0) {
        const allCoords = results.flatMap(m => m.legs.flatMap((l: any) => l.route.coordinates));
        fitRouteCoordinates(allCoords);

        // Delay route highlight by 300ms to allow bottom sheet intro animation to pop smoothly
        setTimeout(() => {
           const firstRanked = rankRoutes(results, 'easiest')[0];
           if (firstRanked) {
             const firstId = firstRanked.legs.map((l: any) => l.route.properties.code).join('+');
             setSelectedRouteId(firstId);
           }
        }, 300);
      } else {
        animateRegion({ ...destinationPoint, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 600);
      }

      Keyboard.dismiss();
      
      const h_origin = origin ? { name: origin.title, lat: origin.latitude, lon: origin.longitude } : null;
      const initialFare = results.length > 0 ? (results[0].estimatedFare || 0) : 0;
      addHistory({
        id: Date.now().toString(),
        origin: h_origin,
        destination: { name: destination.title, lat: destination.latitude, lon: destination.longitude },
        fare: initialFare,
        timestamp: Date.now(),
      });
      
    } catch (error) {
      console.warn('[HomeScreen] Route search failed:', error);
    } finally {
      setIsRouting(false);
    }
  }, [currentLocation, gpxRoutes]);

  // Automatically process pending route searches (e.g. from Saved routes page)
  useEffect(() => {
    const processPendingSearch = async () => {
      if (!pendingRouteSearch) return;

      const { origin, destination } = pendingRouteSearch;
      setIsRouting(true);

      // Helper: resolve a place name — check local places first, then Nominatim
      const resolvePlace = async (name: string): Promise<PlaceResult | null> => {
        const localHit = fuzzyFilter(LOCAL_PLACES, name, (p) => [p.title, p.subtitle], 1);
        if (localHit.length > 0) {
          const p = localHit[0].item;
          return { id: p.id, title: p.title, subtitle: p.subtitle, latitude: p.latitude, longitude: p.longitude };
        }
        const params = new URLSearchParams({
          q: name,
          format: 'json',
          limit: '1',
          countrycodes: 'ph',
          viewbox: '120.7,14.55,121.1,14.35',
          bounded: '0',
          addressdetails: '0',
        });
        const res = await fetch(`${GEOCODING_BASE_URL}/search?${params.toString()}`, {
          headers: { 'Accept-Language': 'en' },
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (!data || data.length === 0) return null;
        return {
          id: data[0].place_id?.toString() || Math.random().toString(),
          title: name,
          subtitle: data[0].display_name || '',
          latitude: parseFloat(data[0].lat),
          longitude: parseFloat(data[0].lon),
        };
      };
      
      try {
        let originPlace: PlaceResult | null = null;
        
        // 1. Resolve origin if it's not our current location
        if (origin) {
          if (typeof origin === 'object' && origin.lat !== undefined && origin.lon !== undefined) {
            originPlace = {
              id: `origin-${Date.now()}`,
              title: origin.name || 'Saved Origin',
              subtitle: '',
              latitude: origin.lat,
              longitude: origin.lon
            };
          } else if (typeof origin === 'string' && origin.toLowerCase() !== 'current location' && origin.toLowerCase() !== 'your location') {
            originPlace = await resolvePlace(origin);
          }
        }

        // 2. Resolve destination
        let destPlace: PlaceResult | null = null;
        if (destination) {
          if (typeof destination === 'object' && destination.lat !== undefined && destination.lon !== undefined) {
            destPlace = {
              id: `dest-${Date.now()}`,
              title: destination.name || 'Saved Destination',
              subtitle: '',
              latitude: destination.lat,
              longitude: destination.lon
            };
          } else if (typeof destination === 'string') {
            destPlace = await resolvePlace(destination);
          }
        }

        if (!destPlace) {
          Alert.alert('Route Error', 'Could not locate the destination for this route.');
          setIsRouting(false);
          setPendingRouteSearch(null);
          return;
        }

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
      animateRegion(nearestRegion, 600);
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

  // Build multi-leg transit journey plan (Fixes: Walk lines, transfer segments + correct plotting)
  const transitLegs = useMemo((): TransitLeg[] => {
    if (selectedRoute?.legs && selectedRoute.legs.length > 0) {
      const legs: TransitLeg[] = [];
      const originPoint = currentLocation; 

      selectedRoute.legs.forEach((leg: any, idx: number) => {
        const fullCoords = leg.route.coordinates;
        let bIdx = 0; let aIdx = fullCoords.length - 1;
        let minDistB = Infinity; let minDistA = Infinity;
        
        for (let i = 0; i < fullCoords.length; i++) {
          const db = sqDistApprox(fullCoords[i], leg.boardingPoint);
          if (db < minDistB) { minDistB = db; bIdx = i; }
          const da = sqDistApprox(fullCoords[i], leg.alightingPoint);
          if (da < minDistA) { minDistA = da; aIdx = i; }
        }
        
        // Isolate transit polyline between board and alight points
        const segment = [];
        if (bIdx <= aIdx) {
          for (let i = bIdx; i <= aIdx; i++) segment.push(fullCoords[i]);
        } else {
          for (let i = bIdx; i >= aIdx; i--) segment.push(fullCoords[i]);
        }

        // 1. Walk from start or prev stop to this board
        const prevPoint = idx === 0 ? originPoint : selectedRoute.legs[idx-1].alightingPoint;
        if (prevPoint) {
           legs.push({
             transitRouteId: 'walk',
             coordinates: [prevPoint, leg.boardingPoint],
             onTransit: false,
             transitInfo: null,
             boardAt: prevPoint,
             alightAt: leg.boardingPoint,
             boardLabel: '', alightLabel: ''
           });
        }

        // 2. Focused Transit segment 
        const meta = (transitRoutes as any[]).find((r) => r.id === leg.route.properties.code);
        legs.push({
          transitRouteId: leg.route.properties.code,
          coordinates: segment,
          onTransit: true,
          transitInfo: meta || null,
          boardAt: leg.boardingPoint,
          alightAt: leg.alightingPoint,
          boardLabel: '',
          alightLabel: ''
        });
      });

      // 3. Walk from last alight to destination
      if (destinationLocation && selectedRoute.legs.length > 0) {
         const lastAlight = selectedRoute.legs[selectedRoute.legs.length - 1].alightingPoint;
         legs.push({
           transitRouteId: 'walk',
           coordinates: [lastAlight, destinationLocation],
           onTransit: false,
           transitInfo: null,
           boardAt: lastAlight,
           alightAt: destinationLocation,
           boardLabel: '', alightLabel: ''
         });
      }

      return legs;
    }
    
    if (routeCoordinates.length < 2) return [];
    return buildTransitLegs(routeCoordinates, transitRoutes as any[], 55, 120);
  }, [selectedRoute, routeCoordinates, transitRoutes, currentLocation, destinationLocation]);

  // Simulation — uses the actual searched route coordinates and transit legs
  const sim = useSimulation(routeCoordinates, transitLegs);

  const topRightSummaryText = useMemo(() => {
    if (sim.state !== 'idle') {
      return `${Math.max(0, sim.remainingDistanceKm).toFixed(1)} km left • ${Math.max(0, Math.round(sim.remainingEtaMin))} min left`;
    }
    if (!routeSummary) return null;
    return `${routeSummary.distanceKm.toFixed(1)} km • ${Math.round(routeSummary.durationMin)} min`;
  }, [sim.state, sim.remainingDistanceKm, sim.remainingEtaMin, routeSummary]);

  // During simulation, blink the vehicle/walk badge so the merged user marker
  // alternates between identity and current travel mode.
  useEffect(() => {
    if (sim.state !== 'playing') {
      setSimBlink(true);
      return;
    }
    const id = setInterval(() => setSimBlink((v) => !v), 700);
    return () => clearInterval(id);
  }, [sim.state]);

  // Record trip stats when simulation finishes (once per run)
  useEffect(() => {
    if (sim.state === 'idle') {
      tripStatRecordedRef.current = false;
      return;
    }
    if (sim.state === 'finished' && !tripStatRecordedRef.current) {
      tripStatRecordedRef.current = true;
      const distKm = routeSummary?.distanceKm ?? 0;
      const fareAmt = selectedRoute?.estimatedFare ?? 0;
      addTripStats({ distance: distKm, fare: fareAmt, points: Math.max(1, Math.round(distKm * 2)) });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sim.state]);

  const activeUserPosition = useMemo(() => {
    if (sim.state !== 'idle' && sim.position) return sim.position;
    return currentLocation;
  }, [sim.state, sim.position, currentLocation]);

  const simPointIndex = useMemo(() => {
    if (!sim.position || sim.state === 'idle' || routeCoordinates.length < 2) return -1;
    let bestIdx = 0;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < routeCoordinates.length; i++) {
      const d = sqDistApprox(sim.position, routeCoordinates[i]);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    return bestIdx;
  }, [sim.position, sim.state, routeCoordinates]);

  const visibleTransitLegs = useMemo(() => {
    if (simPointIndex < 0) return transitLegs;

    let cursor = 0;
    const pruned: TransitLeg[] = [];
    for (const leg of transitLegs) {
      const legLen = leg.coordinates.length;
      const advance = Math.max(legLen - 1, 1);
      const legStart = cursor;
      const legEnd = cursor + advance;
      cursor = legEnd;

      // Already passed this whole leg
      if (simPointIndex >= legEnd) continue;

      // Entire leg is still ahead
      if (simPointIndex <= legStart) {
        pruned.push(leg);
        continue;
      }

      // We are currently inside this leg; keep only the remaining tail.
      const localStart = Math.min(legLen - 1, Math.max(0, simPointIndex - legStart));
      const remainingCoords = leg.coordinates.slice(localStart);
      if (remainingCoords.length >= 2) {
        pruned.push({ ...leg, coordinates: remainingCoords });
      }
    }

    return pruned;
  }, [transitLegs, simPointIndex]);

  const visibleTransitMarkers = useMemo(() => {
    const markers: Array<{
      leg: TransitLeg;
      idx: number;
      showBoard: boolean;
      showDrop: boolean;
    }> = [];

    let cursor = 0;
    for (let idx = 0; idx < transitLegs.length; idx++) {
      const leg = transitLegs[idx];
      const legLen = leg.coordinates.length;
      const advance = Math.max(legLen - 1, 1);
      const legStart = cursor;
      const legEnd = cursor + advance;
      cursor = legEnd;

      if (!leg.onTransit) continue;

      if (simPointIndex < 0) {
        markers.push({ leg, idx, showBoard: true, showDrop: true });
        continue;
      }

      const showBoard = simPointIndex < legStart;
      const showDrop = simPointIndex < legEnd;
      if (showBoard || showDrop) {
        markers.push({ leg, idx, showBoard, showDrop });
      }
    }

    return markers;
  }, [transitLegs, simPointIndex]);


  // Auto-follow camera during simulation playback
  useEffect(() => {
    if (sim.state === 'playing' && sim.position && simAutoFollow) {
      animateRegion({
        latitude: sim.position.latitude,
        longitude: sim.position.longitude,
        latitudeDelta: 0.012,
        longitudeDelta: 0.012,
      }, 200);
    }
  }, [sim.position, sim.state, simAutoFollow]);

  const handleRegionChangeComplete = (region: MapRegion) => {
    if (USE_MAPLIBRE) return;

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
      {USE_MAPLIBRE ? (
        <MapLibreMapView
          style={StyleSheet.absoluteFillObject}
          mapStyle={MAP_CONFIG.MAPLIBRE_STYLE_URL}
          onDidFinishLoadingMap={() => setIsMapLoaded(true)}
          onPress={() => {
            setIsMapInteracted(true);
            if (sim.state === 'playing') setSimAutoFollow(false);
          }}
          pitchEnabled={false}
          rotateEnabled={false}
          compassEnabled={false}
          logoEnabled={false}
          attributionEnabled={false}
          zoomEnabled
          scrollEnabled
        >
          <MapLibreCamera
            ref={mapLibreCameraRef}
            defaultSettings={{
              centerCoordinate: [INITIAL_REGION.longitude, INITIAL_REGION.latitude],
              zoomLevel: regionToZoomLevel(INITIAL_REGION),
            }}
            minZoomLevel={10}
            maxZoomLevel={18}
            maxBounds={{
              ne: [PH_BOUNDS.maxLongitude, PH_BOUNDS.maxLatitude],
              sw: [PH_BOUNDS.minLongitude, PH_BOUNDS.minLatitude],
            }}
          />

          {activeUserPosition ? (
            <PointAnnotation
              id="user-position"
              coordinate={[activeUserPosition.longitude, activeUserPosition.latitude]}
            >
              <View style={styles.liveUserMarker}>
                <View style={styles.liveUserCore}>
                  <Ionicons name="person" size={13} color="#FFFFFF" />
                </View>
              </View>
            </PointAnnotation>
          ) : null}

          {destinationLocation ? (
            <PointAnnotation
              id="destination-position"
              coordinate={[destinationLocation.longitude, destinationLocation.latitude]}
            >
              <View style={styles.terminalMarker} />
            </PointAnnotation>
          ) : null}

          {visibleTransitLegs.map((leg, idx) => {
            const shape: GeoJSON.Feature<GeoJSON.LineString> = {
              type: 'Feature',
              geometry: {
                type: 'LineString',
                coordinates: leg.coordinates.map((c) => [c.longitude, c.latitude]),
              },
              properties: {},
            };

            return (
              <ShapeSource id={`route-seg-source-${idx}`} key={`route-seg-source-${idx}`} shape={shape}>
                <LineLayer
                  id={`route-seg-line-${idx}`}
                  style={{
                    lineColor: leg.onTransit ? '#E8A020' : '#888888',
                    lineWidth: leg.onTransit ? 5 : 3,
                    lineOpacity: 0.9,
                  }}
                />
              </ShapeSource>
            );
          })}

          {!destinationLocation && visibleTransitRoutes.map((route: any) => {
            const routeShape: GeoJSON.Feature<GeoJSON.LineString> = {
              type: 'Feature',
              geometry: {
                type: 'LineString',
                coordinates: route.coordinates.map((c: MapCoordinate) => [c.longitude, c.latitude]),
              },
              properties: {},
            };

            return (
              <ShapeSource id={`transit-route-source-${route.id}`} key={`transit-route-source-${route.id}`} shape={routeShape}>
                <LineLayer
                  id={`transit-route-line-${route.id}`}
                  style={{
                    lineColor: selectedTransitRoute?.id === route.id ? route.color : `${route.color}AA`,
                    lineWidth: selectedTransitRoute?.id === route.id ? 5 : 3,
                    lineOpacity: 0.8,
                  }}
                />
              </ShapeSource>
            );
          })}

          {!destinationLocation && visibleTransitStops.map((stop: any) => (
            <PointAnnotation
              key={`transit-stop-ml-${stop.id}`}
              id={`transit-stop-ml-${stop.id}`}
              coordinate={[stop.coordinate.longitude, stop.coordinate.latitude]}
            >
              <View style={[
                styles.transitStopMarker,
                nearestStop?.id === stop.id && styles.nearestStopMarker,
              ]}>
                <Ionicons name="ellipse" size={6} color="#FFFFFF" />
              </View>
            </PointAnnotation>
          ))}
        </MapLibreMapView>
      ) : (
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        mapType="standard"
        initialRegion={INITIAL_REGION}
        showsUserLocation={false}
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
        

        {activeUserPosition && (
          <Marker
            coordinate={activeUserPosition}
            tracksViewChanges={sim.state !== 'idle'}
            anchor={{ x: 0.5, y: 0.5 }}
            flat={sim.state !== 'idle'}
          >
            <View style={styles.liveUserMarker}>
              <View style={styles.liveUserCore}>
                <Ionicons name="person" size={13} color="#FFFFFF" />
              </View>
              {sim.state !== 'idle' && simBlink && sim.currentSegInfo ? (
                <View style={[
                  styles.liveUserBadge,
                  { backgroundColor: sim.currentSegInfo.color || '#E8A020' },
                ]}>
                  {sim.currentSegInfo?.vehicleType === 'jeepney' ? (
                    <Image source={require('../../assets/icons/jeepney-icon.png')} style={styles.liveUserBadgeIcon} />
                  ) : sim.currentSegInfo?.vehicleType === 'bus' ? (
                    <Image source={require('../../assets/icons/bus-icon.png')} style={styles.liveUserBadgeIcon} />
                  ) : sim.currentSegInfo?.vehicleType === 'tricycle' ? (
                    <Image source={require('../../assets/icons/tricycle-icon.png')} style={styles.liveUserBadgeIcon} />
                  ) : (
                    <Ionicons name="walk" size={11} color="#FFFFFF" />
                  )}
                </View>
              ) : null}
            </View>
          </Marker>
        )}

        {destinationLocation && (
          <Marker
            coordinate={destinationLocation}
            title="Destination"
            description={destinationQuery}
            tracksViewChanges={false}
          />
        )}

        {/* Render searched route: mode-colored for transit, dashed for walking */}
        {visibleTransitLegs.map((leg, idx) => {
          return (
            <Polyline
              key={`route-seg-${idx}`}
              coordinates={leg.coordinates}
              strokeColor={leg.onTransit ? '#E8A020' : '#888888'}
              strokeWidth={leg.onTransit ? 5 : 3}
              lineDashPattern={leg.onTransit ? undefined : [10, 6]}
              lineCap="round"
              lineJoin="round"
            />
          );
        })}

        {/* Board & drop-off markers for each transit leg */}
        {visibleTransitMarkers.map(({ leg, idx, showBoard, showDrop }) => (
          <React.Fragment key={`board-alight-${idx}`}>
            {/* Board marker */}
            {showBoard ? (
              <Marker
                coordinate={leg.boardAt}
                tracksViewChanges={false}
                anchor={{ x: 0.5, y: 0.5 }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <View style={styles.boardMarker}>
                  <Ionicons name="arrow-up-circle" size={14} color="#FFFFFF" />
                </View>
                <Callout tooltip>
                  <View style={styles.stopCallout}>
                    <Text style={styles.stopCalloutLabel}>Board Here</Text>
                    <Text style={styles.stopCalloutType}>
                      Ride {leg.transitInfo?.type || 'transit'}
                    </Text>
                  </View>
                </Callout>
              </Marker>
            ) : null}

            {/* Drop-off marker */}
            {showDrop ? (
              <Marker
                coordinate={leg.alightAt}
                tracksViewChanges={false}
                anchor={{ x: 0.5, y: 0.5 }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <View style={styles.alightMarker}>
                  <Ionicons name="arrow-down-circle" size={14} color="#FFFFFF" />
                </View>
                <Callout tooltip>
                  <View style={styles.stopCallout}>
                    <Text style={styles.stopCalloutLabel}>Drop-off Point</Text>
                    <Text style={styles.stopCalloutType}>
                      Drop off here
                    </Text>
                  </View>
                </Callout>
              </Marker>
            ) : null}
          </React.Fragment>
        ))}

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
  )}

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
        
        <View style={styles.chatbotWrap}>
          <TouchableOpacity style={styles.locateButton} onPress={() => router.push('/ai-chatbot')} activeOpacity={0.8}>
            <Image 
              source={require('../../assets/AIChatbot/IDLE.png')} 
              style={{ width: 36, height: 36, resizeMode: 'contain' }} 
            />
          </TouchableOpacity>
        </View>
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
              style={styles.simPlayToggle}
              onPress={() => {
                if (sim.state === 'idle') {
                  setSimAutoFollow(true);
                }
                sim.togglePlayPause();
              }}
              activeOpacity={0.85}
            >
              <Ionicons
                name={'car'}
                size={20}
                color={COLORS.navy}
              />
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

          {/* Live summary card — right side of the controls row */}
          {routeSummary && topRightSummaryText && (
            <>
              <View style={{ flex: 1 }} />
              <View style={styles.topRightSummaryCard}>
                <Text style={styles.topRightSummaryTitle} numberOfLines={1}>
                  {sim.state !== 'idle' ? `${selectedOptionLabel} (Live)` : selectedOptionLabel}
                </Text>
                <Text style={styles.topRightSummaryValue}>
                  {topRightSummaryText}
                </Text>
              </View>
            </>
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
      {/* Route Recommender Panel */}
      <RouteRecommenderPanel
        visible={showRecommender}
        matchedRoutes={matchedRoutes}
        rankedRoutes={rankedRoutes}
        rankTab={rankTab}
        setRankTab={setRankTab}
        selectedRoute={selectedRouteId}
        setSelectedRoute={(id: string | null) => setSelectedRouteId(id)}
        destinationName={destinationQuery}
        onClose={() => {
          setShowRecommender(false);
          // Wait briefly for slide-out dismissal logic before clearing polylines to prevent visual pop
          setTimeout(() => {
            setSelectedRouteId(null);
            setRouteCoordinates([]);
            setMatchedRoutes([]);
            setDestinationLocation(null);
          }, 300);
        }}
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
  chatbotWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    overflow: 'hidden',
    backgroundColor: '#CBA962',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
    elevation: 6,
    marginBottom: -16, // Move it further down
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
    marginBottom: 16,
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
  topRightSummaryCard: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(10,22,40,0.08)',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    maxWidth: 200,
  },
  topRightSummaryTitle: {
    fontFamily: 'Inter',
    fontSize: 10,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  topRightSummaryValue: {
    marginTop: 2,
    fontFamily: 'Inter',
    fontSize: 13,
    color: COLORS.navy,
    fontWeight: '700',
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
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minWidth: 160,
    maxWidth: 260,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
    borderWidth: 1,
    borderColor: 'rgba(10,22,40,0.1)',
  },
  stopCalloutLabel: {
    fontFamily: 'Inter',
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.navy,
  },
  stopCalloutType: {
    fontFamily: 'Inter',
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 3,
    lineHeight: 18,
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
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(10,22,40,0.08)',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  liveUserMarker: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(14,165,233,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveUserCore: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#0EA5E9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  liveUserBadge: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveUserBadgeIcon: {
    width: 10,
    height: 10,
    resizeMode: 'contain',
    tintColor: '#FFFFFF',
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
  simMarkerIcon: {
    width: 16,
    height: 16,
    resizeMode: 'contain',
    tintColor: '#FFFFFF',
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
  simBannerIcon: {
    width: 18,
    height: 18,
    resizeMode: 'contain',
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
