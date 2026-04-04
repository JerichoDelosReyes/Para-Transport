import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, ActivityIndicator, Platform, Keyboard, TouchableWithoutFeedback, Alert, StatusBar, Image, InteractionManager } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useNavigation } from 'expo-router';
import { BlurView } from 'expo-blur';
import * as Location from 'expo-location';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../../constants/theme';
import { MAP_CONFIG } from '../../constants/map';
import type { JeepneyRoute } from '../../types/routes';
import * as Notifications from 'expo-notifications';
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});
import { ROUTE_COLORS } from '../../constants/routeVisuals';
import SearchScreen, { PlaceResult, TransitRouteType } from '../../components/SearchScreen';
import { buildTransitLegs, TransitLeg } from '../../utils/routeSegments';
import { GuidanceStep, generateGuidanceSteps, calculateDistance } from '../../utils/guidanceEngine';
import * as Haptics from 'expo-haptics';
import { ProfileButton } from '../../components/ProfileButton';
import { useStore } from '../../store/useStore';
import RouteRecommenderPanel from '../../components/RouteRecommenderPanel';
import { findRoutesForDestination, rankRoutes, MatchedRoute, RankMode } from '../../services/routeSearch';
import { useRoutes } from '../../hooks/useRoutes';
import { useSimulation } from '../../hooks/useSimulation';
import { loadRoutes } from '../../services/routeService';
import { MapLibreWrapper, type MapLibreWrapperHandle, type MapLineInput, type MapMarkerInput } from '../../components/MapLibreWrapper';
import { mapDiagnostics } from '../../services/mapDiagnosticsService';

const GEOCODING_BASE_URL = process.env.EXPO_PUBLIC_GEOCODING_BASE_URL || 'https://nominatim.openstreetmap.org';
const ROUTING_BASE_URL = 'https://router.project-osrm.org/route/v1';
const ROUTING_NEAREST_BASE_URL = 'https://router.project-osrm.org/nearest/v1';
const WALK_ROUTING_PROFILE = 'walking';
const MAX_WALK_PATH_POINTS = 140;
const WALK_PATH_CACHE_LIMIT = 400;
const MAX_RANKED_ROUTE_OPTIONS = 5;

type MapCoordinate = {
  latitude: number;
  longitude: number;
};

type WalkPathResolveOptions = {
  keepDestinationOnRoad?: boolean;
};

type MapRegion = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

type MapBounds = {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
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

const sampleCoordinates = (coordinates: MapCoordinate[], maxPoints: number): MapCoordinate[] => {
  if (coordinates.length <= maxPoints) return coordinates;
  const step = (coordinates.length - 1) / (maxPoints - 1);
  const sampled: MapCoordinate[] = [];

  for (let i = 0; i < maxPoints - 1; i++) {
    sampled.push(coordinates[Math.round(i * step)]);
  }

  sampled.push(coordinates[coordinates.length - 1]);
  return sampled;
};

const pathLengthMeters = (coordinates: MapCoordinate[]): number => {
  if (coordinates.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < coordinates.length; i++) {
    total += Math.sqrt(sqDistApprox(coordinates[i - 1], coordinates[i]));
  }
  return total;
};

const sqDistApprox = (a: MapCoordinate, b: MapCoordinate): number => {
  const DEG = 111_320;
  const dLat = (a.latitude - b.latitude) * DEG;
  const dLng =
    (a.longitude - b.longitude) *
    DEG *
    Math.cos(((a.latitude + b.latitude) / 2) * (Math.PI / 180));
  return dLat * dLat + dLng * dLng;
};

const getSlicedMapCoordinates = (leg: any): MapCoordinate[] => {
  const fullCoords = leg.route.coordinates;
  if (!fullCoords || fullCoords.length === 0) return [];
  
  let bIdx = 0; let aIdx = fullCoords.length - 1;
  let minDistB = Infinity; let minDistA = Infinity;
  
  for (let i = 0; i < fullCoords.length; i++) {
    const db = sqDistApprox(fullCoords[i], leg.boardingPoint);
    if (db < minDistB) { minDistB = db; bIdx = i; }
    const da = sqDistApprox(fullCoords[i], leg.alightingPoint);
    if (da < minDistA) { minDistA = da; aIdx = i; }
  }
  
  const segment: MapCoordinate[] = [];
  if (bIdx <= aIdx) {
    for (let i = bIdx; i <= aIdx; i++) segment.push(fullCoords[i]);
  } else {
    for (let i = bIdx; i >= aIdx; i--) segment.push(fullCoords[i]);
  }
  return segment;
};

const buildBoundsFromCoordinates = (coordinates: MapCoordinate[]): MapBounds | null => {
  if (!coordinates || coordinates.length === 0) return null;

  let minLat = Number.POSITIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  let minLng = Number.POSITIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;

  for (const c of coordinates) {
    if (c.latitude < minLat) minLat = c.latitude;
    if (c.latitude > maxLat) maxLat = c.latitude;
    if (c.longitude < minLng) minLng = c.longitude;
    if (c.longitude > maxLng) maxLng = c.longitude;
  }

  return { minLat, maxLat, minLng, maxLng };
};

const regionToBounds = (region: MapRegion, padRatio = 0.25): MapBounds => {
  const latPad = region.latitudeDelta * (0.5 + padRatio);
  const lngPad = region.longitudeDelta * (0.5 + padRatio);
  return {
    minLat: region.latitude - latPad,
    maxLat: region.latitude + latPad,
    minLng: region.longitude - lngPad,
    maxLng: region.longitude + lngPad,
  };
};

const boundsIntersect = (a: MapBounds, b: MapBounds): boolean => {
  return !(
    a.maxLat < b.minLat ||
    a.minLat > b.maxLat ||
    a.maxLng < b.minLng ||
    a.minLng > b.maxLng
  );
};

const pointInBounds = (point: MapCoordinate, bounds: MapBounds): boolean => {
  return (
    point.latitude >= bounds.minLat &&
    point.latitude <= bounds.maxLat &&
    point.longitude >= bounds.minLng &&
    point.longitude <= bounds.maxLng
  );
};

type VehicleRouteType = 'jeepney' | 'bus';

const normalizeTransitRouteType = (value: unknown): VehicleRouteType | null => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized.includes('bus')) return 'bus';
  if (normalized.includes('jeepney')) return 'jeepney';
  return null;
};

const selectedTypeAllowsRouteType = (
  selectedType: TransitRouteType,
  routeType: VehicleRouteType | null,
): boolean => {
  if (!routeType) return false;
  if (selectedType === 'combo') return routeType === 'jeepney' || routeType === 'bus';
  return routeType === selectedType;
};

const routeMatchesSelectedType = (
  route: JeepneyRoute,
  selectedType: TransitRouteType,
): boolean => {
  return selectedTypeAllowsRouteType(selectedType, normalizeTransitRouteType(route?.properties?.type));
};

const routeTypeLabel = (routeType: TransitRouteType): string => {
  if (routeType === 'bus') return 'Bus';
  if (routeType === 'jeepney') return 'Jeepney';
  return 'Jeep + Bus';
};

const roundCoordForKey = (value: number): string => value.toFixed(5);

const toLngLat = (coordinate: MapCoordinate): [number, number] => [coordinate.longitude, coordinate.latitude];

const latDeltaToZoom = (latitudeDelta: number): number => {
  const safeDelta = Math.max(0.00001, latitudeDelta);
  const zoom = Math.log2(360 / safeDelta);
  return Math.max(0, Math.min(20, zoom));
};

const zoomToLatDelta = (zoomLevel: number): number => {
  const safeZoom = Math.max(0, Math.min(20, zoomLevel));
  return 360 / Math.pow(2, safeZoom);
};

const makeWalkPathCacheKey = (from: MapCoordinate, to: MapCoordinate): string => {
  return `${roundCoordForKey(from.latitude)},${roundCoordForKey(from.longitude)}|${roundCoordForKey(to.latitude)},${roundCoordForKey(to.longitude)}`;
};

const fetchRoadPath = async (
  from: MapCoordinate,
  to: MapCoordinate,
  profile: 'walking',
  options?: WalkPathResolveOptions,
): Promise<MapCoordinate[] | null> => {
  const coords = `${from.longitude},${from.latitude};${to.longitude},${to.latitude}`;
  const params = new URLSearchParams({
    overview: 'full',
    geometries: 'geojson',
    alternatives: 'false',
    steps: 'false',
  });

  const url = `${ROUTING_BASE_URL}/${profile}/${coords}?${params.toString()}`;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const data = await response.json();
    const geometry = data?.routes?.[0]?.geometry?.coordinates;
    if (!Array.isArray(geometry) || geometry.length < 2) return null;

    const mapped = sampleCoordinates(toMapCoordinates(geometry), MAX_WALK_PATH_POINTS);
    if (mapped.length < 2) return null;

    // Keep exact segment endpoints so transfer joins stay visually connected.
    mapped[0] = from;
    if (!options?.keepDestinationOnRoad) {
      mapped[mapped.length - 1] = to;
    }
    return mapped;
  } catch {
    return null;
  }
};

const fetchNearestRoadPoint = async (
  point: MapCoordinate,
  profile: 'walking',
): Promise<MapCoordinate | null> => {
  const coord = `${point.longitude},${point.latitude}`;
  const params = new URLSearchParams({ number: '1' });
  const url = `${ROUTING_NEAREST_BASE_URL}/${profile}/${coord}?${params.toString()}`;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const data = await response.json();
    const location = data?.waypoints?.[0]?.location;
    if (!Array.isArray(location) || location.length < 2) return null;

    const longitude = Number(location[0]);
    const latitude = Number(location[1]);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

    return { latitude, longitude };
  } catch {
    return null;
  }
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
  const insets = useSafeAreaInsets();
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [mapLoadError, setMapLoadError] = useState<string | null>(null);
  const [isMapInteracted, setIsMapInteracted] = useState(false);
  const [destinationQuery, setDestinationQuery] = useState('');
  const [originQuery, setOriginQuery] = useState('');
  const [selectedRouteType, setSelectedRouteType] = useState<TransitRouteType>('jeepney');
  const [isRouting, setIsRouting] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<MapCoordinate | null>(null);
  const [currentLocationLabel, setCurrentLocationLabel] = useState<string>('Current Location');
  const [destinationLocation, setDestinationLocation] = useState<MapCoordinate | null>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<MapCoordinate[]>([]);
  const [routeSummary, setRouteSummary] = useState<{ distanceKm: number; durationMin: number } | null>(null);
  const [matchedRoutes, setMatchedRoutes] = useState<MatchedRoute[]>([]);
  const [rankTab, setRankTab] = useState<RankMode>('easiest');
  const [rankedRoutes, setRankedRoutes] = useState<MatchedRoute[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<MatchedRoute | null>(null);
  const [transitLegs, setTransitLegs] = useState<TransitLeg[]>([]);
  const [mapRegion, setMapRegion] = useState<MapRegion>(INITIAL_REGION);
  // Track programmatic camera updates (zoom buttons, locate user) to pass to MapLibreWrapper
  const [programmaticCamera, setProgrammaticCamera] = useState<{
    center?: [number, number];
    zoom?: number;
    pitch?: number;
    heading?: number;
  } | null>(null);
  const { routes: transitDataRoutes } = useRoutes();
  const routesBySelectedType = useMemo(() => {
    return transitDataRoutes.filter((route) => routeMatchesSelectedType(route, selectedRouteType));
  }, [transitDataRoutes, selectedRouteType]);
  const selectedRouteTypeLabel = useMemo(
    () => routeTypeLabel(selectedRouteType),
    [selectedRouteType],
  );

  useEffect(() => {
    setRankedRoutes(rankRoutes(matchedRoutes, rankTab).slice(0, MAX_RANKED_ROUTE_OPTIONS));
  }, [matchedRoutes, rankTab]);

  const lastZoomedRouteIdRef = useRef<string | null>(null);

  useEffect(() => {
    const route = matchedRoutes.find(m => m.legs.map((l: any) => l.route.properties.code).join('+') === selectedRouteId) || null;
    setSelectedRoute(route);
    if (route) {
      setRouteSummary({ distanceKm: route.distanceKm || 0, durationMin: route.estimatedMinutes || Math.round((route.distanceKm || 0) * 12) });
      const newCoords = route.legs.flatMap((leg: any) => leg.route.coordinates);
      
      if (newCoords && newCoords.length >= 2) {
        setRouteCoordinates(sampleCoordinates(newCoords, 700));
        
        if (lastZoomedRouteIdRef.current !== selectedRouteId) {
          lastZoomedRouteIdRef.current = selectedRouteId;
          
          // Build a trimmed bounding point array specific to the user's travel points
          const trimCoords = [];
          if (currentLocation) trimCoords.push(currentLocation);
          const boardingPoint = route.legs[0]?.boardingPoint;
          if (boardingPoint) trimCoords.push(boardingPoint);
          const alightingPoint = route.legs[route.legs.length - 1]?.alightingPoint;
          if (alightingPoint) trimCoords.push(alightingPoint);
          if (destinationLocation) trimCoords.push(destinationLocation);

          fitToCoordinates(trimCoords, 600);
        }
      } else {
        setRouteCoordinates([]);
        
        if (lastZoomedRouteIdRef.current !== selectedRouteId) {
          lastZoomedRouteIdRef.current = selectedRouteId;
          const originObj = route.legs[0]?.boardingPoint || currentLocation;
          const destObj = route.legs[route.legs.length - 1]?.alightingPoint || destinationLocation;
          
          if (originObj && destObj) {
            const midLat = (originObj.latitude + destObj.latitude) / 2;
            const midLng = (originObj.longitude + destObj.longitude) / 2;
            animateCamera({
              center: { latitude: midLat, longitude: midLng },
              zoom: 14,
            }, 600);
          }
        }
      }
    } else {
      setRouteSummary(null);
      setRouteCoordinates([]);
      lastZoomedRouteIdRef.current = null;
    }
  }, [selectedRouteId, matchedRoutes, currentLocation, destinationLocation]);

  // Normalize route data to a unified transit shape
  const transitRoutes = useMemo(() => {
    const normalized = routesBySelectedType.map((r: JeepneyRoute) => {
      // Keep map rendering lightweight by using pre-sampled route coordinates.
      const compactCoords = sampleCoordinates(r.coordinates, 320);

      return {
        id: r.properties.code,
        type: r.properties.type,
        color: (ROUTE_COLORS as Record<string, string>)[r.properties.type] || '#FF6B35',
        ref: r.properties.code,
        name: r.properties.name,
        from: r.stops[0]?.label || '',
        to: r.stops[r.stops.length - 1]?.label || '',
        operator: r.properties.operator || '',
        coordinates: compactCoords,
        bbox: buildBoundsFromCoordinates(compactCoords),
        stops: r.stops.map((s, idx) => ({
          id: `${r.properties.code}-stop-${idx}`,
          coordinate: s.coordinate,
          name: s.label,
          type: s.type,
          operator: r.properties.operator || '',
        })),
        verified: true,
        fare: r.properties.fare,
      };
    });
    return normalized;
  }, [routesBySelectedType]);
  const transitStops = useMemo(() => {
    return transitRoutes.flatMap((route: any) => route.stops || []);
  }, [transitRoutes]);
  const [showTransitLayer, setShowTransitLayer] = useState(false);
  const user = useStore((state) => state.user);
  const isGuestAccount = (user?.email || '').trim().toLowerCase() === 'guest@para.ph';
  const selectedTransitRoute = useStore((state) => state.selectedTransitRoute);
  const setSelectedTransitRoute = useStore((state) => state.setSelectedTransitRoute);
  const pendingRouteSearch = useStore((state) => state.pendingRouteSearch);
  const setPendingRouteSearch = useStore((state) => state.setPendingRouteSearch);
  const addHistory = useStore((state) => state.addHistory);
  const updateLatestHistoryFare = useStore((state) => state.updateLatestHistoryFare);
  const addTripStats = useStore((state) => state.addTripStats);
  const mapRef = useRef<MapLibreWrapperHandle | null>(null);
  const navigation = useNavigation<any>();
  const walkPathCacheRef = useRef<Map<string, MapCoordinate[]>>(new Map());
  const walkPathRequestRef = useRef(0);
  const tripStatRecordedRef = useRef(false);
  const hasInitiallyPannedRef = useRef(false);
  const [showRecommender, setShowRecommender] = useState(false);
  const [simAutoFollow, setSimAutoFollow] = useState(true);
  const [simBlink, setSimBlink] = useState(true);

  // Active Journey Guidance state
  const [isGuidanceActive, setIsGuidanceActive] = useState(false);
  const [guidanceSteps, setGuidanceSteps] = useState<GuidanceStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const guidancePanY = useRef(new Animated.Value(-200)).current;
  const guidanceStepFadeAnim = useRef(new Animated.Value(1)).current;
  const [journeySummaryData, setJourneySummaryData] = useState<{distanceMeters: number; startTime: number} | null>(null);
  // Setup diagnostics callbacks
  useEffect(() => {
    mapDiagnostics.onBlankMapDetectedCallback((details) => {
      console.warn('[MapScreen] Blank map detected:', details);
      // Could show user alert or retry logic here
    });

    return () => {
      // Optional: cleanup or report diagnostics on unmount
    };
  }, []);

  const selectedOptionLabel = useMemo(() => {
    if (!selectedRouteId) return 'Current Route';
    return selectedRoute?.legs.map((l: any) => l.route.properties.code).join('+') || 'Current Route';
  }, [selectedRouteId, selectedRoute]);

  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

  const animateToRegion = useCallback((region: MapRegion, duration = 250) => {
    mapRef.current?.setCamera({
      centerCoordinate: [region.longitude, region.latitude],
      zoomLevel: latDeltaToZoom(region.latitudeDelta),
      animationDuration: duration,
    });
  }, []);

  const animateCamera = useCallback((options: {
    center?: MapCoordinate;
    zoom?: number;
    heading?: number;
    pitch?: number;
    animationMode?: 'easeTo' | 'flyTo' | 'linearTo';
  }, duration = 250) => {
    // Apply pitch guardrails: clamp between min and max allowed values
    let constrainedPitch = options.pitch;
    if (constrainedPitch !== undefined) {
      const { minPitch, maxPitch } = MAP_CONFIG.THREE_D_CAMERA;
      constrainedPitch = Math.max(minPitch, Math.min(maxPitch, constrainedPitch));
    }

    mapRef.current?.setCamera({
      centerCoordinate: options.center ? toLngLat(options.center) : undefined,
      zoomLevel: options.zoom,
      heading: options.heading,
      pitch: constrainedPitch,
      animationDuration: duration,
      animationMode: options.animationMode,
    });
  }, []);

  const locateCameraDurationMs = useCallback((from: MapCoordinate, to: MapCoordinate): number => {
    const distanceMeters = Math.sqrt(sqDistApprox(from, to));
    // Smooth "hover" feel: farther pans take longer, clamped to practical bounds.
    return clamp(Math.round(420 + distanceMeters * 0.45), 450, 1400);
  }, []);

  const fitToCoordinates = useCallback((coordinates: MapCoordinate[], duration = 600) => {
    if (coordinates.length === 0) return;
    if (coordinates.length === 1) {
      mapRef.current?.flyTo(toLngLat(coordinates[0]), duration);
      return;
    }

    const bounds = buildBoundsFromCoordinates(coordinates);
    if (!bounds) return;

    mapRef.current?.fitBounds(
      [bounds.maxLng, bounds.maxLat],
      [bounds.minLng, bounds.minLat],
      [80, 60, 300, 60],
      duration,
    );
  }, []);

  const handleZoomIn = () => {
    const next: MapRegion = {
      ...mapRegion,
      latitudeDelta: clamp(mapRegion.latitudeDelta * 0.7, 0.0025, 0.4),
      longitudeDelta: clamp(mapRegion.longitudeDelta * 0.7, 0.0025, 0.4),
    };
    setMapRegion(next);
    
    // Set programmatic camera to trigger MapLibreWrapper update
    setProgrammaticCamera({
      center: [next.longitude, next.latitude],
      zoom: latDeltaToZoom(next.latitudeDelta),
    });
    
    animateCamera(
      {
        center: { latitude: next.latitude, longitude: next.longitude },
        zoom: latDeltaToZoom(next.latitudeDelta),
        animationMode: 'easeTo',
      },
      250,
    );
  };

  const handleZoomOut = () => {
    const next: MapRegion = {
      ...mapRegion,
      latitudeDelta: clamp(mapRegion.latitudeDelta / 0.7, 0.0025, 0.4),
      longitudeDelta: clamp(mapRegion.longitudeDelta / 0.7, 0.0025, 0.4),
    };
    setMapRegion(next);
    
    // Set programmatic camera to trigger MapLibreWrapper update
    setProgrammaticCamera({
      center: [next.longitude, next.latitude],
      zoom: latDeltaToZoom(next.latitudeDelta),
    });
    
    animateCamera(
      {
        center: { latitude: next.latitude, longitude: next.longitude },
        zoom: latDeltaToZoom(next.latitudeDelta),
        animationMode: 'easeTo',
      },
      250,
    );
  };

  const handleLocateUser = useCallback(() => {
    if (!currentLocation) {
      Alert.alert('Location Not Found', 'We are still getting your current location.');
      return;
    }

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
      latitudeDelta: mapRegion.latitudeDelta,
      longitudeDelta: mapRegion.longitudeDelta,
    };

    const duration = locateCameraDurationMs(
      { latitude: mapRegion.latitude, longitude: mapRegion.longitude },
      currentLocation,
    );

    setMapRegion(next);
    
    // Set programmatic camera to trigger MapLibreWrapper update
    setProgrammaticCamera({
      center: [currentLocation.longitude, currentLocation.latitude],
      zoom: latDeltaToZoom(next.latitudeDelta),
      pitch: 0,
      heading: 0,
    });
    
    animateCamera(
      {
        center: currentLocation,
        zoom: latDeltaToZoom(next.latitudeDelta),
        heading: 0,
        pitch: 0,
        animationMode: 'easeTo',
      },
      duration,
    );
  }, [currentLocation, mapRegion.latitude, mapRegion.longitude, mapRegion.latitudeDelta, mapRegion.longitudeDelta, locateCameraDurationMs, animateCamera]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('tabPress', () => {
      if (navigation.isFocused()) {
        handleLocateUser();
      }
    });
    return unsubscribe;
  }, [navigation, handleLocateUser]);

  // Initial map pan to user location
  useEffect(() => {
    if (isMapLoaded && currentLocation && !hasInitiallyPannedRef.current && !pendingRouteSearch && !selectedTransitRoute) {
      if (
        currentLocation.latitude >= MAP_CONFIG.PHILIPPINES_BOUNDS.minLatitude &&
        currentLocation.latitude <= MAP_CONFIG.PHILIPPINES_BOUNDS.maxLatitude &&
        currentLocation.longitude >= MAP_CONFIG.PHILIPPINES_BOUNDS.minLongitude &&
        currentLocation.longitude <= MAP_CONFIG.PHILIPPINES_BOUNDS.maxLongitude
      ) {
        hasInitiallyPannedRef.current = true;
        const next: MapRegion = {
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
          latitudeDelta: mapRegion.latitudeDelta,
          longitudeDelta: mapRegion.longitudeDelta,
        };
        const duration = locateCameraDurationMs(
          { latitude: INITIAL_REGION.latitude, longitude: INITIAL_REGION.longitude },
          currentLocation,
        );
        setMapRegion(next);
        animateCamera({
          center: currentLocation,
          zoom: latDeltaToZoom(next.latitudeDelta),
          heading: 0,
          pitch: 0,
          animationMode: 'easeTo',
        }, duration);
      }
    }
  }, [isMapLoaded, currentLocation, pendingRouteSearch, selectedTransitRoute, mapRegion.latitudeDelta, mapRegion.longitudeDelta, locateCameraDurationMs, animateCamera]);

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

        try {
          const geocoded = await Location.reverseGeocodeAsync({
            latitude: initial.coords.latitude,
            longitude: initial.coords.longitude,
          });
          if (geocoded && geocoded.length > 0) {
            const top = geocoded[0];
            const parts = [top.name || top.street, top.district || top.city].filter(Boolean);
            if (parts.length > 0) {
              setCurrentLocationLabel(parts.join(', '));
            }
          }
        } catch (e) {}

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



  const handleSearchSelectRoute = useCallback(async (origin: PlaceResult | null, destination: PlaceResult) => {
    setIsSearchActive(false);

    const actualOrigin = origin || (currentLocation ? {
      id: 'current-location',
      title: currentLocationLabel,
      subtitle: '',
      latitude: currentLocation.latitude,
      longitude: currentLocation.longitude
    } as PlaceResult : null);

    setDestinationQuery(destination.title);
    setOriginQuery(actualOrigin?.title || '');
    
    const destinationPoint: MapCoordinate = {
      latitude: destination.latitude,
      longitude: destination.longitude,
    };
    setDestinationLocation(destinationPoint);
    
    const startPoint = actualOrigin
      ? { latitude: actualOrigin.latitude, longitude: actualOrigin.longitude }
      : currentLocation;
      
    if (!startPoint) {
      animateToRegion({ ...destinationPoint, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 600);
      return;
    }

    try {
      setIsRouting(true);

      let routesForSearch = routesBySelectedType;

      const bufferCandidates = [500, 900, 1400, 2200];
      let yieldedBeforeMatching = false;
      const yieldBeforeMatching = async () => {
        if (yieldedBeforeMatching) return;
        yieldedBeforeMatching = true;
        await new Promise<void>((resolve) => {
          InteractionManager.runAfterInteractions(() => resolve());
        });
      };

      const runRouteMatch = (candidateRoutes: JeepneyRoute[]): MatchedRoute[] => {
        let matched: MatchedRoute[] = [];
        for (const bufferMeters of bufferCandidates) {
          matched = findRoutesForDestination(
            startPoint,
            destinationPoint,
            candidateRoutes,
            bufferMeters,
          );
          if (matched.length > 0) break;
        }
        return matched;
      };

      // Fast path: match against already loaded routes first.
      let results: MatchedRoute[] = [];
      if (routesForSearch.length > 0) {
        await yieldBeforeMatching();
        results = runRouteMatch(routesForSearch);
      }

      // Fallback path: refresh from source only when local set is empty
      // or when the first pass finds no candidates.
      if (results.length === 0) {
        const loaded = await loadRoutes();
        const latestByType = loaded.routes.filter((route) => routeMatchesSelectedType(route, selectedRouteType));
        if (latestByType.length > 0) {
          routesForSearch = latestByType;
          await yieldBeforeMatching();
          results = runRouteMatch(routesForSearch);
        }
      }

      if (routesForSearch.length === 0) {
        Alert.alert(
          'No Routes Available',
          `No ${selectedRouteTypeLabel.toLowerCase()} routes are loaded yet. Try switching to the other route type.`,
        );
        return;
      }

      setMatchedRoutes(results);
      setSelectedRouteId(null);
      setShowRecommender(true);

      if (results.length > 0) {
        const firstRanked = rankRoutes(results, 'easiest')[0];
        if (firstRanked) {
          const firstId = firstRanked.legs.map((l: any) => l.route.properties.code).join('+');
          
          // Delay route highlight by 300ms to allow bottom sheet intro animation to pop smoothly
          setTimeout(() => {
            setSelectedRouteId(firstId);
          }, 300);
        }
      } else {
        animateToRegion({ ...destinationPoint, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 600);
      }

      Keyboard.dismiss();
      
      const h_origin = actualOrigin ? { name: actualOrigin.title, lat: actualOrigin.latitude, lon: actualOrigin.longitude } : null;
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
  }, [currentLocation, routesBySelectedType, selectedRouteType, selectedRouteTypeLabel, addHistory]);

  const handleMapLongPress = useCallback(async (coordinatePair: [number, number]) => {
    if (isRouting) return;

    try {
      const coordinate: MapCoordinate = {
        latitude: coordinatePair[1],
        longitude: coordinatePair[0],
      };

      if (
        coordinate.latitude < MAP_CONFIG.PHILIPPINES_BOUNDS.minLatitude ||
        coordinate.latitude > MAP_CONFIG.PHILIPPINES_BOUNDS.maxLatitude ||
        coordinate.longitude < MAP_CONFIG.PHILIPPINES_BOUNDS.minLongitude ||
        coordinate.longitude > MAP_CONFIG.PHILIPPINES_BOUNDS.maxLongitude
      ) {
        mapDiagnostics.logEvent('warn', 'Long-press outside Philippines bounds', {
          lat: coordinate.latitude,
          lng: coordinate.longitude,
        });
        Alert.alert('Out of Range', 'Please choose a destination inside the Philippines map area.');
        return;
      }

      let destTitle = 'Dropped Pin';
      try {
        const geocoded = await Location.reverseGeocodeAsync({
          latitude: coordinate.latitude,
          longitude: coordinate.longitude,
        });
        if (geocoded && geocoded.length > 0) {
          const top = geocoded[0];
          const parts = [top.name || top.street, top.district || top.city].filter(Boolean);
          if (parts.length > 0) {
            destTitle = parts.join(', ');
          }
        }
      } catch (e) {
        mapDiagnostics.logEvent('info', 'Geocode reverse lookup (non-critical error)', {
          lat: coordinate.latitude,
          lng: coordinate.longitude,
        });
      }

      const destinationPlace: PlaceResult = {
        id: `pin-${Date.now()}`,
        title: destTitle,
        subtitle: `${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}`,
        latitude: coordinate.latitude,
        longitude: coordinate.longitude,
      };

      await handleSearchSelectRoute(null, destinationPlace);
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      mapDiagnostics.logInitError(error, 'handleMapLongPress');
    }
  }, [handleSearchSelectRoute, isRouting]);

  // Automatically process pending route searches (e.g. from Saved routes page)
  useEffect(() => {
    const processPendingSearch = async () => {
      if (!pendingRouteSearch) return;

      const { origin, destination } = pendingRouteSearch;
      setIsRouting(true);

      // Helper: resolve a place name with Nominatim geocoding
      const resolvePlace = async (name: string): Promise<PlaceResult | null> => {
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

  const resolveWalkPathOnRoad = useCallback(async (
    from: MapCoordinate,
    to: MapCoordinate,
    options?: WalkPathResolveOptions,
  ): Promise<MapCoordinate[]> => {
    const keepDestinationOnRoad = options?.keepDestinationOnRoad === true;
    const destinationMode = options?.keepDestinationOnRoad ? 'road-end' : 'exact-end';
    const cacheKey = `${makeWalkPathCacheKey(from, to)}|${destinationMode}`;
    const reverseCacheAllowed = !keepDestinationOnRoad;
    const reverseKey = `${makeWalkPathCacheKey(to, from)}|${destinationMode}`;
    const cache = walkPathCacheRef.current;

    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const reverseCached = reverseCacheAllowed ? cache.get(reverseKey) : undefined;
    if (reverseCached && reverseCached.length >= 2) {
      const reversed = [...reverseCached].reverse();
      cache.set(cacheKey, reversed);
      return reversed;
    }

    let routedPath = await fetchRoadPath(from, to, WALK_ROUTING_PROFILE, options);
    let snappedDestination: MapCoordinate | null = null;

    // Retry with nearest walkable-road snaps first so walking legs stay
    // road-following even when exact endpoints are off-network.
    if (!routedPath) {
      const [snappedFrom, snappedTo] = await Promise.all([
        fetchNearestRoadPoint(from, WALK_ROUTING_PROFILE),
        fetchNearestRoadPoint(to, WALK_ROUTING_PROFILE),
      ]);

      if (snappedTo) snappedDestination = snappedTo;

      if (snappedFrom && snappedTo) {
        routedPath = await fetchRoadPath(snappedFrom, snappedTo, WALK_ROUTING_PROFILE, {
          keepDestinationOnRoad: true,
        });
      } else if (keepDestinationOnRoad && snappedTo) {
        routedPath = await fetchRoadPath(from, snappedTo, WALK_ROUTING_PROFILE, {
          keepDestinationOnRoad: true,
        });
      }
    }

    const fallbackPath = [from, keepDestinationOnRoad && snappedDestination ? snappedDestination : to];
    const resolved = (routedPath && routedPath.length >= 2 ? routedPath : fallbackPath).map((pt) => ({
      latitude: pt.latitude,
      longitude: pt.longitude,
    }));

    // Ensure exact joins to transit legs.
    resolved[0] = from;
    if (!keepDestinationOnRoad) {
      resolved[resolved.length - 1] = to;
    }

    cache.set(cacheKey, resolved);
    if (cache.size > WALK_PATH_CACHE_LIMIT) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey) cache.delete(oldestKey);
    }

    return resolved;
  }, []);

  useEffect(() => {
    if (!selectedTransitRoute) return;
    const selectedType = normalizeTransitRouteType((selectedTransitRoute as any).type);
    if (selectedType && !selectedTypeAllowsRouteType(selectedRouteType, selectedType)) {
      setSelectedTransitRoute(null);
    }
  }, [selectedTransitRoute, selectedRouteType, setSelectedTransitRoute]);

  // Visible routes: always show selected route; otherwise show all if transit layer is on
  const visibleTransitRoutes = useMemo(() => {
    if (selectedTransitRoute) {
      const selectedType = normalizeTransitRouteType((selectedTransitRoute as any).type);
      if (selectedType && !selectedTypeAllowsRouteType(selectedRouteType, selectedType)) return [];
      return selectedTransitRoute.coordinates ? [selectedTransitRoute] : [];
    }
    if (!showTransitLayer) return [];

    const viewportBounds = regionToBounds(mapRegion, 0.35);
    return transitRoutes.filter((route: any) => {
      if (!route.bbox) return true;
      return boundsIntersect(route.bbox, viewportBounds);
    });
  }, [showTransitLayer, selectedTransitRoute, selectedRouteType, transitRoutes, mapRegion]);

  // Visible stops: always show stops for selected route; otherwise show all if transit layer is on
  const visibleTransitStops = useMemo(() => {
    if (selectedTransitRoute?.stops?.length > 0) {
      const selectedType = normalizeTransitRouteType((selectedTransitRoute as any).type);
      if (!selectedType || selectedTypeAllowsRouteType(selectedRouteType, selectedType)) {
        return selectedTransitRoute.stops;
      }
      return [];
    }
    if (!showTransitLayer) return [];

    const viewportBounds = regionToBounds(mapRegion, 0.2);
    return transitStops.filter((stop: any) => pointInBounds(stop.coordinate, viewportBounds));
  }, [showTransitLayer, selectedTransitRoute, selectedRouteType, transitStops, mapRegion]);

  // Build multi-leg transit journey plan (Fixes: Walk lines, transfer segments + correct plotting)
  const baseTransitLegs = useMemo((): TransitLeg[] => {
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

  useEffect(() => {
    let isCancelled = false;
    const requestId = ++walkPathRequestRef.current;

    const hydrateWalkLegs = async () => {
      if (baseTransitLegs.length === 0) {
        setTransitLegs([]);
        return;
      }

      // Render base legs immediately, then replace walking segments with road-following paths.
      setTransitLegs(baseTransitLegs);

      const walkLegEntries = baseTransitLegs
        .map((leg, idx) => ({ leg, idx }))
        .filter(({ leg }) => !leg.onTransit && leg.coordinates.length >= 2);

      if (walkLegEntries.length === 0) return;

      const resolved = await Promise.all(
        walkLegEntries.map(async ({ leg, idx }) => {
          const from = leg.coordinates[0];
          const to = leg.coordinates[leg.coordinates.length - 1];
          const isFinalDestinationWalk = idx === baseTransitLegs.length - 1;
          const path = await resolveWalkPathOnRoad(from, to, {
            keepDestinationOnRoad: isFinalDestinationWalk,
          });
          return { idx, path };
        }),
      );

      if (isCancelled || requestId !== walkPathRequestRef.current) return;

      const nextLegs = baseTransitLegs.map((leg) => ({
        ...leg,
        coordinates: [...leg.coordinates],
      }));

      for (const item of resolved) {
        if (!item.path || item.path.length < 2) continue;
        const isFinalWalkLeg = item.idx === nextLegs.length - 1 && !nextLegs[item.idx].onTransit;
        const preservedAlightAt = nextLegs[item.idx].alightAt;
        nextLegs[item.idx] = {
          ...nextLegs[item.idx],
          coordinates: item.path,
          boardAt: item.path[0],
          alightAt: isFinalWalkLeg ? preservedAlightAt : item.path[item.path.length - 1],
        };
      }

      setTransitLegs(nextLegs);
    };

    hydrateWalkLegs();

    return () => {
      isCancelled = true;
    };
  }, [baseTransitLegs, resolveWalkPathOnRoad]);

  // Derive a perfect, continuous coordinate path matching transitLegs sequences
  const simCoordinates = useMemo(() => {
    if (!transitLegs || transitLegs.length === 0) return routeCoordinates;
    const flat: MapCoordinate[] = [];
    for (let i = 0; i < transitLegs.length; i++) {
      const legCoords = transitLegs[i].coordinates;
      if (!legCoords || legCoords.length === 0) continue;
      
      if (i === transitLegs.length - 1) {
        for (let j = 0; j < legCoords.length; j++) flat.push(legCoords[j]);
      } else {
        const maxJ = legCoords.length > 1 ? legCoords.length - 1 : 1;
        for (let j = 0; j < maxJ; j++) flat.push(legCoords[j]);
      }
    }
    return flat.length >= 2 ? flat : routeCoordinates;
  }, [transitLegs, routeCoordinates]);

  // Simulation — uses the contiguous coordinate list for real-world playback
  const sim = useSimulation(simCoordinates, transitLegs);

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

  

  const activeUserPosition = useMemo(() => {
    if (sim.state !== 'idle' && sim.position) return sim.position;
    return currentLocation;
  }, [sim.state, sim.position, currentLocation]);

  const simPointIndex = useMemo(() => {
    if (!sim.position || sim.state === 'idle' || simCoordinates.length < 2) return -1;
    let bestIdx = 0;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < simCoordinates.length; i++) {
      const d = sqDistApprox(sim.position, simCoordinates[i]);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    return bestIdx;
  }, [sim.position, sim.state, simCoordinates]);

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

  const mapLines = useMemo<MapLineInput[]>(() => {
    const lines: MapLineInput[] = [];

    visibleTransitLegs.forEach((leg, idx) => {
      if (!leg.coordinates || leg.coordinates.length < 2) return;
      lines.push({
        id: `route-seg-${idx}`,
        coordinates: leg.coordinates.map(toLngLat),
        color: leg.onTransit ? '#E8A020' : '#888888',
        width: leg.onTransit ? 5 : 3,
      });
    });

    if (!destinationLocation) {
      visibleTransitRoutes.forEach((route: any) => {
        if (!route.coordinates || route.coordinates.length < 2) return;
        lines.push({
          id: `transit-route-${route.id}`,
          coordinates: route.coordinates.map(toLngLat),
          color: selectedTransitRoute?.id === route.id ? route.color : `${route.color}AA`,
          width: selectedTransitRoute?.id === route.id ? 5 : 3,
        });
      });
    }

    return lines;
  }, [visibleTransitLegs, destinationLocation, visibleTransitRoutes, selectedTransitRoute?.id]);

  const mapMarkers = useMemo<MapMarkerInput[]>(() => {
    const markers: MapMarkerInput[] = [];

    if (activeUserPosition) {
      markers.push({
        id: 'active-user-position',
        coordinate: toLngLat(activeUserPosition),
        children: (
          <View style={styles.liveUserMarker}>
            <View style={styles.liveUserCore}>
              <Ionicons name="person" size={13} color="#FFFFFF" />
            </View>
          </View>
        ),
        metadata: {
          label: 'Your Location',
          type: 'Current position',
        },
      });
    }

    if (destinationLocation) {
      markers.push({
        id: 'destination-marker',
        coordinate: toLngLat(destinationLocation),
        children: (
          <View style={styles.alightMarker}>
            <Ionicons name="location" size={14} color="#FFFFFF" />
          </View>
        ),
        metadata: {
          label: destinationQuery || 'Destination',
          type: 'Drop-off point',
        },
      });
    }

    visibleTransitMarkers.forEach(({ leg, idx, showBoard, showDrop }) => {
      if (showBoard) {
        markers.push({
          id: `board-${idx}`,
          coordinate: toLngLat(leg.boardAt),
          children: (
            <View style={styles.boardMarker}>
              <Ionicons name="arrow-up-circle" size={14} color="#FFFFFF" />
            </View>
          ),
          metadata: {
            label: leg.transitInfo?.name || `Route ${idx + 1}`,
            type: 'Board here',
            routeName: leg.transitInfo?.name,
            subtitle: leg.boardLabel,
          },
        });
      }

      if (showDrop) {
        markers.push({
          id: `drop-${idx}`,
          coordinate: toLngLat(leg.alightAt),
          children: (
            <View style={styles.alightMarker}>
              <Ionicons name="arrow-down-circle" size={14} color="#FFFFFF" />
            </View>
          ),
          metadata: {
            label: leg.transitInfo?.name || `Route ${idx + 1}`,
            type: 'Alight here',
            routeName: leg.transitInfo?.name,
            subtitle: leg.alightLabel,
          },
        });
      }
    });

    if (!destinationLocation) {
      visibleTransitStops.forEach((stop: any) => {
        markers.push({
          id: `transit-stop-${stop.id}`,
          coordinate: toLngLat(stop.coordinate),
          children: (
            <View style={[
              styles.transitStopMarker,
            ]}>
              <Ionicons name="ellipse" size={6} color="#FFFFFF" />
            </View>
          ),
          metadata: {
            label: stop.name || `Stop ${stop.id}`,
            type: 'Transit stop',
            subtitle: `ID: ${stop.id}`,
          },
        });
      });
    }

    return markers;
  }, [activeUserPosition, destinationLocation, visibleTransitMarkers, destinationQuery, visibleTransitStops]);

  // Log marker/line updates for diagnostics
  useEffect(() => {
    if (mapMarkers.length > 0) {
      mapDiagnostics.logOverlayEvent('marker', mapMarkers.length, 'updated');
    }
  }, [mapMarkers.length]);

  useEffect(() => {
    if (mapLines.length > 0) {
      mapDiagnostics.logOverlayEvent('line', mapLines.length, 'updated');
    }
  }, [mapLines.length]);

  // Auto-follow camera during simulation playback
  useEffect(() => {
    if (sim.state === 'playing' && sim.position && simAutoFollow && mapRef.current) {
      animateCamera({
        center: {
          latitude: sim.position.latitude,
          longitude: sim.position.longitude,
        },
      }, 50); // Match the 50ms TICK_MS exactly for smoother 20fps camera tracking
    }
  }, [sim.position, sim.state, simAutoFollow, animateCamera]);

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
      animateToRegion(fixedRegion, 100);
    } else {
      setMapRegion(region); // Important: Keep track of panning/zooming so buttons zoom in on the CURRENT view instead of snapping back to the initial coord
    }
  };

  const handleCameraChange = useCallback((payload: {
    centerCoordinate?: [number, number];
    zoom?: number;
    pitch?: number;
    heading?: number;
  }) => {
    if (payload.centerCoordinate && payload.zoom !== undefined) {
      const zoom = payload.zoom;
      const nextRegion: MapRegion = {
        latitude: payload.centerCoordinate[1],
        longitude: payload.centerCoordinate[0],
        latitudeDelta: zoomToLatDelta(zoom),
        longitudeDelta: zoomToLatDelta(zoom),
      };
      setMapRegion(nextRegion);
    }
  }, [setMapRegion]);

  const handleRouteTypeChange = useCallback((nextType: TransitRouteType) => {
    if (nextType === selectedRouteType) return;

    setSelectedRouteType(nextType);
    setSelectedTransitRoute(null);
    setShowRecommender(false);
    setMatchedRoutes([]);
    setSelectedRouteId(null);
    setSelectedRoute(null);
    setTransitLegs([]);
    setRouteCoordinates([]);
    setRouteSummary(null);
    setDestinationLocation(null);
    setDestinationQuery('');

    if (sim.state !== 'idle') {
      sim.reset();
    }
  }, [selectedRouteType, setSelectedTransitRoute, sim]);

  const stopGuidance = React.useCallback(() => {
    Notifications.dismissAllNotificationsAsync();
    Animated.timing(guidancePanY, {
      toValue: -200,
      duration: 300,
      useNativeDriver: true
    }).start(() => {
      setIsGuidanceActive(false);
      setGuidanceSteps([]);
      setCurrentStepIndex(0);
      setJourneySummaryData(null);
    });
  }, [guidancePanY]);

  const startGuidance = React.useCallback(async (id: string, targetRoute: MatchedRoute) => {
    setSelectedRouteId(id);
    
    Location.getLastKnownPositionAsync().then(locationPos => {
      const startLoc = locationPos ? locationPos.coords : currentLocation;
      if (!startLoc || !destinationLocation) {
        Alert.alert('Location Required', 'Cannot start journey without location data.');
        return;
      }
      
      const steps = generateGuidanceSteps(
        targetRoute, 
        startLoc, 
        destinationLocation
      );
      
      setGuidanceSteps(steps);
      setCurrentStepIndex(0);
      setJourneySummaryData({
        distanceMeters: Math.round((targetRoute.distanceKm || 0) * 1000),
        startTime: Date.now()
      });
      setIsGuidanceActive(true);
      setShowRecommender(false);
      setIsSearchActive(false);
      
      Animated.spring(guidancePanY, {
        toValue: 0,
        tension: 60,
        friction: 12,
        useNativeDriver: true
      }).start();
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Notifications.requestPermissionsAsync().then(({ status }) => {
          if (status === 'granted') {
            Notifications.scheduleNotificationAsync({
              content: {
                title: 'Navigating with PARA 📍',
                body: 'You are currently in a journey. Stay alert!',
                sticky: true,
                autoDismiss: false,
              },
              trigger: null,
            });
          }
        });
    });
  }, [currentLocation, destinationLocation, guidancePanY]);

  // Step progression & Off-route logic
  const boardTimeRef = React.useRef(0);
  const isAdvancingRef = React.useRef(false);

  const handleGuidanceLocationUpdate = React.useCallback((latitude: number, longitude: number, isSim: boolean = false, isSimFinished: boolean = false) => {
    if (!isGuidanceActive || guidanceSteps.length === 0 || currentStepIndex >= guidanceSteps.length) return;
    if (isAdvancingRef.current) return;
    
    const currentStep = guidanceSteps[currentStepIndex];
    if (!currentStep) return;
    
    const dist = calculateDistance(latitude, longitude, currentStep.coordinate.latitude, currentStep.coordinate.longitude);
  
    let shouldAdvance = false;
    
    if (isSim) {
      if (isSimFinished) {
        shouldAdvance = true;
      } else if (dist <= 150) {
        shouldAdvance = true;
      }
    } else {
      if (currentStep.type === 'board') {
        if (dist <= 30) {
          if (boardTimeRef.current === 0) boardTimeRef.current = Date.now();
          else if (Date.now() - boardTimeRef.current > 5000) shouldAdvance = true;
        } else {
          boardTimeRef.current = 0;
        }
      } else if (currentStep.type === 'ride' || currentStep.type === 'transfer' || currentStep.type === 'alight') {
        if (dist <= 50) shouldAdvance = true;
      } else if (currentStep.type === 'walk' || currentStep.type === 'arrive') {
        if (dist <= 20) shouldAdvance = true;
      }
    }

    if (shouldAdvance) {
      isAdvancingRef.current = true;
      boardTimeRef.current = 0;
      if (currentStep.type === 'arrive') {
          Notifications.dismissAllNotificationsAsync();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setTimeout(() => {
          setIsGuidanceActive(false);
          isAdvancingRef.current = false;
          const timePassedSecs = Math.round((Date.now() - (journeySummaryData?.startTime || Date.now())) / 1000);
          const actualMinutes = Math.max(1, Math.round(timePassedSecs / 60));
          
          (() => {
            const distKm = (journeySummaryData?.distanceMeters || 0) / 1000;
            const fareAmt = selectedRoute?.estimatedFare || 0;
            
            const now = new Date();
            const hour = now.getHours();
            const min = now.getMinutes();
            const day = now.getDay();
            const timeVal = hour + min / 60;
            
            let multiplier = 1.0;
            
            // Morning Rush: 6:00 AM - 9:00 AM
            if (timeVal >= 6 && timeVal <= 9) {
              multiplier = 1.5;
            }
            // Evening Rush: 4:30 PM - 8:00 PM
            else if (timeVal >= 16.5 && timeVal <= 20) {
              multiplier = 1.5;
            }
            
            // Worst Time: Friday 5:00 PM - 6:00 PM
            if (day === 5 && timeVal >= 17 && timeVal <= 18) {
              multiplier = 2.0; 
            }

            const basePoints = Math.max(1, Math.round(distKm * 2));
            const totalPoints = Math.round(basePoints * multiplier);
            
            addTripStats({ distance: distKm, fare: fareAmt, points: totalPoints });
            
            router.navigate({
              pathname: '/journey-summary',
              params: {
                distance: distKm,
                time: actualMinutes,
                fare: fareAmt,
                points: totalPoints,
                multiplier: multiplier
              }
            });
          })();
        }, 2000);
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        Animated.timing(guidanceStepFadeAnim, {
            toValue: 0,
            duration: 150,
            useNativeDriver: true
        }).start(() => {
            setCurrentStepIndex(prev => prev + 1);
            Animated.timing(guidanceStepFadeAnim, {
                toValue: 1,
                duration: 150,
                useNativeDriver: true
            }).start(() => {
                // Free the lock only after complete transition!
                isAdvancingRef.current = false;
            });
        });
      }
    }
  }, [isGuidanceActive, guidanceSteps, currentStepIndex, guidanceStepFadeAnim, router, journeySummaryData, selectedRoute]);

  // Real GPS step progression
  React.useEffect(() => {
    if (!isGuidanceActive || guidanceSteps.length === 0) return;
    if (sim.state !== 'idle') return;
    
    let locationSubscriber: Location.LocationSubscription | null = null;
    const startWatching = async () => {
      locationSubscriber = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 5 },
        (loc) => handleGuidanceLocationUpdate(loc.coords.latitude, loc.coords.longitude)
      );
    };
    startWatching();
    return () => { if (locationSubscriber) locationSubscriber.remove(); };
  }, [isGuidanceActive, guidanceSteps, sim.state, handleGuidanceLocationUpdate]);

  // Simulation step progression
  React.useEffect(() => {
    if (!isGuidanceActive || sim.state === 'idle' || !sim.position) return;
    handleGuidanceLocationUpdate(sim.position.latitude, sim.position.longitude, true, sim.state === 'finished');
  }, [isGuidanceActive, sim.state, sim.position, handleGuidanceLocationUpdate]);

  return (
    <View style={styles.screen}>
      <MapLibreWrapper
        ref={mapRef}
        styleURL={MAP_CONFIG.RESOLVED_STYLE_URL}
        initialCenterCoordinate={[INITIAL_REGION.longitude, INITIAL_REGION.latitude]}
        initialZoomLevel={latDeltaToZoom(INITIAL_REGION.latitudeDelta)}
        minZoomLevel={10}
        maxZoomLevel={18}
        pitchEnabled
        rotateEnabled
        lines={mapLines}
        markers={mapMarkers}
        onMapReady={() => setIsMapLoaded(true)}
        onCameraChanged={(payload) => {
          const center = payload.centerCoordinate;
          if (!center) return;

          const zoom = payload.zoom ?? latDeltaToZoom(mapRegion.latitudeDelta);
          const nextRegion: MapRegion = {
            latitude: center[1],
            longitude: center[0],
            latitudeDelta: zoomToLatDelta(zoom),
            longitudeDelta: zoomToLatDelta(zoom),
          };

          handleRegionChangeComplete(nextRegion);
          handleCameraChange(payload);
        }}
        onMapLongPress={handleMapLongPress}
        onMapTouchStart={() => {
          setIsMapInteracted(true);
          if (sim.state === 'playing') setSimAutoFollow(false);
        }}
        externalCameraCenter={programmaticCamera?.center}
        externalCameraZoom={programmaticCamera?.zoom}
        externalCameraPitch={programmaticCamera?.pitch}
        externalCameraHeading={programmaticCamera?.heading}
      />

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

        <View style={[styles.chatbotWrap]}>
          <TouchableOpacity 
            style={styles.locateButton} 
            onPress={() => router.push('/ai-chatbot')} 
            activeOpacity={0.8}
          >
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
          <BlurView intensity={35} tint="light" style={[styles.recommenderGlassWrap, { marginBottom: 12 }]}>
            <TouchableOpacity
              style={styles.recommenderButton}
              onPress={() => setShowRecommender(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="list" size={21} color={COLORS.navy} />
            </TouchableOpacity>
          </BlurView>
          
          <BlurView intensity={35} tint="light" style={styles.recommenderGlassWrap}>
            <TouchableOpacity
              style={styles.recommenderButton}
              onPress={() => {
                setSelectedRouteId(null);
                setRouteCoordinates([]);
                setMatchedRoutes([]);
                setDestinationLocation(null);
                setRouteSummary(null);
                setDestinationQuery('');
                setOriginQuery('');
                sim.reset();
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="close" size={24} color={COLORS.navy} />
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
          <ActivityIndicator size="large" color={COLORS.primary} />
          {mapLoadError ? (
            <Text style={{ marginTop: 10, color: COLORS.textMuted, fontSize: 12 }}>{mapLoadError}</Text>
          ) : null}
        </View>
      )}

      {/* Route Calculating Indicator */}
      {isRouting && (
        <View style={styles.routingOverlay}>
          <BlurView intensity={40} tint="dark" style={styles.routingCard}>
            <ActivityIndicator size="small" color={COLORS.primary} />
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
                {destinationQuery ? `${originQuery || currentLocationLabel} → ${destinationQuery}` : `Saan tayo, ${user?.username || 'Komyuter'}?`}
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

        {/* Guidance Overlay */}
        {isGuidanceActive && guidanceSteps.length > 0 && (
          <Animated.View style={[styles.guidanceCardContainer, { transform: [{ translateY: guidancePanY }] }]}>
            <View style={[styles.guidanceCard, { paddingTop: Math.max(insets.top, 24) + 16, position: 'relative' }]}>
              <TouchableOpacity style={[styles.guidanceCloseBtn, { top: Math.max(insets.top, 24) + 8, right: 16 }]} onPress={stopGuidance}>
                <Ionicons name="close" size={20} color={COLORS.textMuted} />
              </TouchableOpacity>
              <View style={styles.guidanceIconBox}>
                <Ionicons 
                  name={
                    guidanceSteps[currentStepIndex].type === 'walk' ? 'walk' :
                    guidanceSteps[currentStepIndex].type === 'board' ? 'bus' :
                    guidanceSteps[currentStepIndex].type === 'ride' ? 'arrow-forward' :
                    guidanceSteps[currentStepIndex].type === 'transfer' ? 'swap-horizontal' :
                    guidanceSteps[currentStepIndex].type === 'alight' ? 'arrow-down' : 'checkmark-circle'
                  } 
                  size={24} color={COLORS.primary} 
                />
              </View>
              <View style={styles.guidanceTextWrap}>
                <Animated.View style={{ opacity: guidanceStepFadeAnim }}>
                  <Text style={styles.guidanceInstruction}>{guidanceSteps[currentStepIndex]?.instruction}</Text>
                  {currentStepIndex + 1 < guidanceSteps.length && (
                    <Text style={styles.guidanceNextInstruction}>
                      <Text style={{fontWeight:'700'}}>Then: </Text>
                      {guidanceSteps[currentStepIndex + 1]?.instruction}
                    </Text>
                  )}
                </Animated.View>
              </View>
              <View style={styles.guidanceEtaWrap}>
                <Text style={styles.guidanceEta}>{Math.ceil((guidanceSteps[currentStepIndex]?.durationSeconds || 0) / 60)}</Text>
                <Text style={styles.guidanceEtaMin}>min</Text>
              </View>
            </View>
            <View style={styles.guidanceProgressBar}>
              {guidanceSteps.map((step, idx) => (
                <View key={step.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={[
                    styles.guidanceDot,
                    idx < currentStepIndex && styles.guidanceDotDone,
                    idx === currentStepIndex && styles.guidanceDotActive
                  ]} />
                  {idx < guidanceSteps.length - 1 && (
                    <View style={[styles.guidanceLine, idx < currentStepIndex && styles.guidanceLineDone]} />
                  )}
                </View>
              ))}
            </View>
          </Animated.View>
        )}

        {/* Transit layer controls */}
        <View style={styles.transitControlsContainer}>
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

            {/* Simulation Play Button (top row, only when idle) */}
            {simCoordinates.length >= 2 && sim.state === 'idle' && (
              <TouchableOpacity
                style={styles.simPlayToggle}
                onPress={() => {
                  setSimAutoFollow(true);
                  sim.play();
                }}
                activeOpacity={0.85}
              >
                <Ionicons
                  name="play"
                  size={20}
                  color={COLORS.navy}
                  style={{ marginLeft: 2 }}
                />
              </TouchableOpacity>
            )}

            {/* Live summary card — right side of the controls row */}
            {routeSummary && topRightSummaryText && (
              <>
                <View style={{ flex: 1 }} />
                <View style={[styles.topRightSummaryCard, { flexShrink: 1 }]}>
                  <Text style={styles.topRightSummaryTitle} numberOfLines={1}>
                    {sim.state !== 'idle' ? `${selectedOptionLabel} (Live)` : selectedOptionLabel}
                  </Text>
                  <Text style={styles.topRightSummaryValue} numberOfLines={2}>
                    {topRightSummaryText}
                  </Text>
                </View>
              </>
            )}
          </View>


        </View>



        {selectedTransitRoute &&
        (!normalizeTransitRouteType((selectedTransitRoute as any).type) ||
          selectedTypeAllowsRouteType(
            selectedRouteType,
            normalizeTransitRouteType((selectedTransitRoute as any).type),
          )) ? (
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

        {/* Simulation Panel */}
        {sim.state !== 'idle' && (
          <View style={[styles.simPanelWrapper]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              
              {/* Play/Pause/Replay Button */}
              <TouchableOpacity 
                style={[styles.simPlayPauseBtn, { width: 44, height: 44, borderRadius: 22, flexShrink: 0 }]} 
                onPress={() => {
                  if (sim.state === 'finished') {
                    sim.reset(); sim.play();
                  } else {
                    sim.togglePlayPause();
                  }
                }}
              >
                <Ionicons name={sim.state === 'playing' ? 'pause' : sim.state === 'finished' ? 'refresh' : 'play'} size={22} color="#FFFFFF" style={sim.state === 'playing' || sim.state === 'finished' ? {} : { marginLeft: 3 }} />
              </TouchableOpacity>

              {/* Title & Controls */}
              <View style={{ flex: 1, justifyContent: 'center' }}>
                <Text style={[styles.simPanelStatusText, { fontSize: 13 }]} numberOfLines={1}>
                  {destinationQuery ? `${originQuery || currentLocationLabel} → ${destinationQuery}` : sim.currentSegInfo?.label || 'Walking...'}
                </Text>
                
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                  <TouchableOpacity 
                    style={[styles.simSpeedPill, styles.simSpeedPillActive, { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 4 }]}
                    onPress={() => sim.setSpeed(sim.speed === 0.8 ? 1 : sim.speed === 1 ? 2 : sim.speed === 2 ? 3 : 0.8)}
                  >
                    <Ionicons name="speedometer-outline" size={12} color="#FFFFFF" />
                    <Text style={[styles.simSpeedPillText, styles.simSpeedPillTextActive, { fontSize: 11 }]}>
                      {sim.speed}x
                    </Text>
                  </TouchableOpacity>
                  
                  <Text style={{ fontSize: 11, color: '#71717A', marginLeft: 8, marginRight: 4, fontWeight: '500' }} numberOfLines={1}>
                    {sim.state === 'finished' ? 'Arrived' : `${Math.max(0, sim.remainingDistanceKm).toFixed(1)} km left`}
                  </Text>
                  {sim.currentSegInfo?.vehicleType === 'jeepney' ? (
                    <Ionicons name="bus-outline" size={14} color="#71717A" />
                  ) : sim.currentSegInfo?.vehicleType === 'bus' ? (
                    <Ionicons name="bus" size={14} color="#71717A" />
                  ) : sim.currentSegInfo?.vehicleType === 'tricycle' ? (
                    <Ionicons name="bicycle" size={14} color="#71717A" />
                  ) : (
                    <Ionicons name="walk" size={14} color="#71717A" />
                  )}
                </View>
              </View>

              {/* Close Button */}
              <TouchableOpacity style={{ alignSelf: 'flex-start', padding: 4, marginRight: -4, marginTop: -4 }} onPress={() => sim.reset()} hitSlop={{top: 8, bottom:8, left:8, right:8}}>
                <Ionicons name="close" size={20} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Bottom Progress Bar */}
            <View style={[styles.simProgressBarTrack, { height: 3, marginTop: 12, marginBottom: 0, backgroundColor: '#F3F4F6' }]}>
              <View style={[styles.simProgressBarFill, { width: `${sim.progress * 100}%`, backgroundColor: COLORS.primary }]} />
            </View>
          </View>
        )}

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
        onStartJourney={(id) => {
          const route = matchedRoutes.find(m => m.legs.map(l => l.route.properties.code).join('+') === id);
          if (route) startGuidance(id, route);
        }}
        routeTypeLabel={selectedRouteTypeLabel}
        onClose={() => {
          setShowRecommender(false);
        }}
      />

      {/* Full-screen search */}
      <SearchScreen
        visible={isSearchActive}
        currentLocationLabel={currentLocationLabel}
        initialOrigin={pendingRouteSearch ? pendingRouteSearch.origin : originQuery}
        initialDestination={pendingRouteSearch ? pendingRouteSearch.destination : destinationQuery}
        selectedRouteType={selectedRouteType}
        onSelectRouteType={handleRouteTypeChange}
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
  guidanceCardContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 999,
  },
  guidanceCloseBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    zIndex: 10,
    padding: 4,
  },

  guidanceCard: {
    backgroundColor: COLORS.background,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    paddingHorizontal: 24,
    paddingBottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
    borderTopWidth: 0,
  },
  guidanceIconBox: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(245,197,24,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  guidanceTextWrap: {
    flex: 1,
  },
  guidanceInstruction: {
    fontFamily: 'Inter',
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.navy,
    marginBottom: 4,
  },
  guidanceNextInstruction: {
    fontFamily: 'Inter',
    fontSize: 12,
    color: COLORS.textMuted,
  },
  guidanceEtaWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  guidanceEta: {
    fontFamily: 'Inter',
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.primary,
  },
  guidanceEtaMin: {
    fontFamily: 'Inter',
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginTop: -2,
  },
  guidanceProgressBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingHorizontal: 8,
  },
  guidanceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E0E0E0',
  },
  guidanceDotDone: {
    backgroundColor: COLORS.primary,
  },
  guidanceDotActive: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.primary,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  guidanceLine: {
    width: 24,
    height: 2,
    backgroundColor: '#E0E0E0',
    marginHorizontal: 4,
  },
  guidanceLineDone: {
    backgroundColor: COLORS.primary,
  },
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  safeArea: {
    ...StyleSheet.absoluteFillObject,
    pointerEvents: 'box-none',
    zIndex: 2,
  },

  mapControls: {
    position: 'absolute',
    right: 16,
    bottom: 86,
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
    marginBottom: 0,
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
    flexShrink: 1,
    maxWidth: 160,
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
    backgroundColor: COLORS.primary,
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
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
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
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: COLORS.primary,
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
    backgroundColor: COLORS.primary,
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
  transitControlsContainer: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    marginTop: 8,
    marginHorizontal: SPACING.screenX,
    gap: 8,
  },
  transitControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
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
  simPanelWrapper: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 100 : 110, // Above the tab bar
    left: 70,
    right: 70,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 100,
  },
  simPanelHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  simPanelStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  simPanelStatusText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.navy,
  },
  simArrivedText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4CAF50',
  },
  simProgressBarTrack: {
    height: 4,
    backgroundColor: '#F3DFB0',
    borderRadius: 2,
    marginTop: 4,
    marginBottom: 12,
    overflow: 'hidden',
  },
  simProgressBarFill: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 2,
  },
  simMainControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    marginBottom: 12,
  },
  simStopBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#DE5046',
    alignItems: 'center',
    justifyContent: 'center',
  },
  simStopSquare: {
    width: 12,
    height: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 3,
  },
  simPlayPauseBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  simReplayBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0A1628',
    alignItems: 'center',
    justifyContent: 'center',
  },
  simSpeedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  simSpeedLabel: {
    fontSize: 13,
    color: '#71717A',
    marginRight: 4,
  },
  simSpeedPill: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
  },
  simSpeedPillActive: {
    backgroundColor: '#0A1628',
  },
  simSpeedPillText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.navy,
  },
  simSpeedPillTextActive: {
    color: '#FFFFFF',
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
    backgroundColor: COLORS.primary,
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
