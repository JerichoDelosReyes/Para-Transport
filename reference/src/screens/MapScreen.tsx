/**
 * MapScreen
 * 
 * Main navigation hub implementing the 3-layer "Decoupled Search" architecture:
 * - Layer 1 (Bottom): MapContainer (The actual map)
 * - Layer 2 (Top Safe Area): TopSearchBar - Pressable that navigates to SearchScreen
 * - Layer 3 (Bottom Sheet): RouteSelectionDrawer - Draggable between collapsed/expanded
 * 
 * Map Modes:
 * 1. Idle Mode: Map centered on user, TopSearchBar visible, drawer collapsed
 * 2. Route Discovery: User selected destination from SearchScreen -> drawer expands -> map draws route
 * 3. Navigation Mode ("Digital Para"): Large text/alerts, monitors distance, "PARA!" when close
 * 
 * Navigation Flow:
 * - User taps TopSearchBar -> navigates to SearchScreen
 * - User selects result on SearchScreen -> navigates back here with selectedDestination params
 * - MapScreen detects params via useEffect and updates map/route
 * 
 * @module screens/MapScreen
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { StyleSheet, View, Keyboard, Alert, Platform, Dimensions, Pressable, InteractionManager } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { Locate, X } from 'lucide-react-native';
import { useToast, Toast, ToastTitle, ToastDescription } from '../../components/ui/toast';

// Components
import { MapContainer, MapContainerRef } from '../components/map/MapContainer';
import { RouteSelectionDrawer } from '../components/map/RouteSelectionDrawer';
import { 
  ActiveNavigationOverlay, 
  useNavigationSteps, 
  useNavigationState 
} from '../components/map/ActiveNavigationOverlay';
import { TransferMarker } from '../components/map/TransferMarker';
import { TopSearchBar } from '../components/map/TopSearchBar';
import { LoadingOverlay } from '../components/map/LoadingOverlay';

// Services
import { searchRoutes, searchRoutesFromApi, IMUS_CENTER } from '../services/routeSearch';
import { ApiServiceError } from '../services/api.service';
import { StopwatchService, saveCommuteSession, formatTime, generateId } from '../services/stopwatch';

// Hooks
import { useUserLocation } from '../hooks/useUserLocation';

// Context
import { useAuth } from '../context/AuthContext';

// Types
import {
  RouteWithDetails,
  RouteSearchResponse,
  DrawerState,
  MapMode,
  GeoJSONCoordinate,
  toGeoJSONCoordinate,
  toMapCoordinate,
  MapCoordinate,
  TransferPoint,
  TransferRoute,
} from '../types/route';
import type { AdaptedSearchResponse, AdaptedRoute } from '../utils/RouteAdapter';

// =============================================================================
// Constants
// =============================================================================

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// Drawer heights (must match RouteSelectionDrawer)
const DRAWER_COLLAPSED_HEIGHT = 80; // Matches MINIMIZED_HEIGHT to cover attributions
const DRAWER_EXPANDED_HEIGHT = SCREEN_HEIGHT * 0.40;

const COLORS = {
  white: '#FFFFFF',
  paraBrand: '#E9AE16',
} as const;

// Spring config for smooth animations
const SPRING_CONFIG = {
  damping: 20,
  stiffness: 150,
  mass: 0.5,
};

/**
 * Default map region - Imus, Cavite
 * Used when user location is not available
 */
const DEFAULT_REGION: MapCoordinate = {
  latitude: IMUS_CENTER[1],  // 14.4296
  longitude: IMUS_CENTER[0], // 120.9367
};

// =============================================================================
// Floating Buttons Component
// =============================================================================

interface FloatingButtonsProps {
  drawerState: DrawerState;
  mapMode: MapMode;
  onRecenter: () => void;
  onClear: () => void;
}

const FloatingButtons: React.FC<FloatingButtonsProps> = ({
  drawerState,
  mapMode,
  onRecenter,
  onClear,
}) => {
  // Animated bottom position
  const bottomOffset = useSharedValue(DRAWER_COLLAPSED_HEIGHT + 16);
  const clearOpacity = useSharedValue(mapMode !== 'idle' ? 1 : 0);

  // Update bottom position when drawer state changes
  useEffect(() => {
    const targetHeight = drawerState === 'expanded' 
      ? DRAWER_EXPANDED_HEIGHT + 16
      : DRAWER_COLLAPSED_HEIGHT + 16;
    bottomOffset.value = withSpring(targetHeight, SPRING_CONFIG);
  }, [drawerState]);

  // Update clear button visibility
  useEffect(() => {
    clearOpacity.value = withSpring(mapMode !== 'idle' ? 1 : 0);
  }, [mapMode]);

  // Animated style for recenter button
  const recenterAnimatedStyle = useAnimatedStyle(() => ({
    bottom: bottomOffset.value,
  }));

  // Animated style for clear button (60px above recenter)
  const clearAnimatedStyle = useAnimatedStyle(() => ({
    bottom: bottomOffset.value + 60,
    opacity: clearOpacity.value,
    pointerEvents: clearOpacity.value > 0.5 ? 'auto' : 'none',
  }));

  // Safe clear handler
  const handleClearPress = useCallback(() => {
    if (mapMode !== 'idle') {
      onClear();
    }
  }, [mapMode, onClear]);

  return (
    <>
      {/* Recenter Button */}
      <Animated.View style={[styles.floatingButton, recenterAnimatedStyle]}>
        <Pressable 
          style={styles.buttonInner}
          onPress={onRecenter}
        >
          <Locate size={24} color="#374151" />
        </Pressable>
      </Animated.View>

      {/* Clear/Go Back Button - always rendered, visibility controlled by opacity */}
      <Animated.View style={[styles.floatingButton, clearAnimatedStyle]}>
        <Pressable 
          style={styles.buttonInner}
          onPress={handleClearPress}
        >
          <X size={24} color="#EF4444" />
        </Pressable>
      </Animated.View>
    </>
  );
};

// =============================================================================
// Types
// =============================================================================

/**
 * Selected location from SearchScreen
 */
interface SelectedLocation {
  name: string;
  displayName: string;
  coordinates: [number, number]; // [lng, lat]
  isCurrentLocation?: boolean;
}

export interface MapScreenProps {
  navigation?: {
    navigate: (screen: string, params?: object) => void;
    goBack: () => void;
  };
  route?: {
    params?: {
      /** Origin selected from SearchScreen */
      selectedOrigin?: SelectedLocation;
      /** Destination selected from SearchScreen */
      selectedDestination?: SelectedLocation;
      /** Type of input (origin or destination) - deprecated, kept for backward compat */
      inputType?: 'origin' | 'destination';
    };
  };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Calculate distance between two coordinates using Haversine formula
 * @returns Distance in meters
 */
const calculateDistance = (
  coord1: MapCoordinate,
  coord2: MapCoordinate
): number => {
  const R = 6371000; // Earth's radius in meters
  const dLat = ((coord2.latitude - coord1.latitude) * Math.PI) / 180;
  const dLon = ((coord2.longitude - coord1.longitude) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((coord1.latitude * Math.PI) / 180) *
      Math.cos((coord2.latitude * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// =============================================================================
// Main Component
// =============================================================================

export const MapScreen: React.FC<MapScreenProps> = ({ navigation, route }) => {
  // Refs
  const mapRef = useRef<MapContainerRef>(null);
  const stopwatchRef = useRef<StopwatchService | null>(null);
  
  // Context
  const { saveLocation } = useAuth();

  // User location hook - handles permissions automatically on mount
  const {
    location: userCoordinates,
    errorMsg: locationError,
    isLoading: locationLoading,
    permissionStatus,
  } = useUserLocation();

  // Initialize stopwatch ref once
  useEffect(() => {
    if (!stopwatchRef.current) {
      stopwatchRef.current = new StopwatchService((elapsed) => {
        // Log elapsed time to console for debugging
        if (elapsed % 5000 < 100) { // Log every ~5 seconds
          console.log('[Stopwatch] Elapsed:', formatTime(elapsed));
        }
      });
    }
    return () => {
      // Cleanup on unmount
      if (stopwatchRef.current?.isRunning()) {
        stopwatchRef.current.stop();
      }
    };
  }, []);

  // Log permission status changes
  useEffect(() => {
    console.log('[MapScreen] Permission status:', permissionStatus, 'Location:', userCoordinates ? 'available' : 'null');
  }, [permissionStatus, userCoordinates]);

  /**
   * Check if coordinates are within the Philippines bounding box
   * Philippines rough bounds: lat 4.5-21.5, lng 116-127
   */
  const isInPhilippines = (lat: number, lng: number): boolean => {
    return lat >= 4.5 && lat <= 21.5 && lng >= 116 && lng <= 127;
  };

  // Map user coordinates to expected format, fallback to Imus if outside Philippines
  const userLocation = useMemo((): MapCoordinate => {
    if (userCoordinates) {
      const { latitude, longitude } = userCoordinates;
      
      // IMPORTANT: If location is outside Philippines (e.g., iOS Simulator default),
      // force it to Imus, Cavite. This handles the simulator's San Francisco default.
      if (!isInPhilippines(latitude, longitude)) {
        console.log('[MapScreen] Location outside Philippines, using Imus default. Got:', latitude, longitude);
        return DEFAULT_REGION;
      }
      
      return { latitude, longitude };
    }
    // Fallback to Imus, Cavite center
    return DEFAULT_REGION;
  }, [userCoordinates]);

  // Track if we have real location vs default (within Philippines)
  const hasRealLocation = userCoordinates !== null && 
    isInPhilippines(userCoordinates.latitude, userCoordinates.longitude);

  // ==========================================================================
  // State
  // ==========================================================================

  // UI State
  const [mapMode, setMapMode] = useState<MapMode>('idle');
  const [drawerState, setDrawerState] = useState<DrawerState>('collapsed');
  const [isSearching, setIsSearching] = useState(false);

  // Origin State
  const [selectedOrigin, setSelectedOrigin] = useState<SelectedLocation | null>(null);
  const [originCoord, setOriginCoord] = useState<MapCoordinate | null>(null);

  // Route State (Legacy - local search)
  const [searchResults, setSearchResults] = useState<RouteSearchResponse | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<RouteWithDetails | null>(null);
  const [destinationName, setDestinationName] = useState('');
  const [destinationCoord, setDestinationCoord] = useState<MapCoordinate | null>(null);
  const [selectedDestination, setSelectedDestination] = useState<SelectedLocation | null>(null);

  // Route State (API - production backend)
  const [apiSearchResults, setApiSearchResults] = useState<AdaptedSearchResponse | null>(null);
  const [selectedApiRoute, setSelectedApiRoute] = useState<AdaptedRoute | null>(null);
  const [useProductionApi, setUseProductionApi] = useState(true); // Toggle for API vs local

  // Navigation State
  const [isNavigating, setIsNavigating] = useState(false);
  const [distanceToDestination, setDistanceToDestination] = useState<number | null>(null);

  // ==========================================================================
  // Derived State
  // ==========================================================================

  // Get routes from search results
  const routes = searchResults?.directRoutes || [];
  
  // Get first transfer route if available (for multicolored polylines)
  const activeTransferRoute: TransferRoute | null = useMemo(() => {
    const transfers = searchResults?.transferRoutes;
    if (transfers && transfers.length > 0) {
      return transfers[0];
    }
    return null;
  }, [searchResults?.transferRoutes]);

  // Derive navigation steps from selected route
  const navigationSteps = useNavigationSteps(selectedRoute, destinationName);
  
  // Get navigation state (step index, progress, transfer zone)
  const navState = useNavigationState(
    userLocation,
    navigationSteps,
    isNavigating
  );

  // Get last stop of selected route as destination
  const routeDestination = useMemo(() => {
    if (!selectedRoute?.geometry?.coordinates) return null;
    const coords = selectedRoute.geometry.coordinates;
    const lastCoord = coords[coords.length - 1];
    return toMapCoordinate(lastCoord);
  }, [selectedRoute]);

  // ==========================================================================
  // Effects
  // ==========================================================================

  // Ref to track if we've already searched for the current params (prevents re-search on location updates)
  const searchTriggeredRef = useRef<string | null>(null);

  /**
   * Handle selectedOrigin and selectedDestination from SearchScreen navigation params
   * This is the core of the "Decoupled Search" architecture
   * 
   * IMPORTANT: userLocation is NOT in deps to prevent infinite loop when using "Current Location"
   */
  useEffect(() => {
    const incomingOrigin = route?.params?.selectedOrigin;
    const incomingDestination = route?.params?.selectedDestination;
    
    // If nothing new, skip
    if (!incomingOrigin && !incomingDestination) {
      return;
    }

    // Create a unique key for this search to prevent duplicate searches
    const searchKey = `${incomingOrigin?.name || ''}-${incomingDestination?.name || ''}`;
    if (searchTriggeredRef.current === searchKey) {
      console.log('[MapScreen] Search already triggered for this params, skipping');
      return;
    }

    console.log('[MapScreen] Received from SearchScreen:', {
      origin: incomingOrigin,
      destination: incomingDestination,
    });

    // Dismiss keyboard just in case
    Keyboard.dismiss();

    // Update origin if provided
    if (incomingOrigin) {
      setSelectedOrigin(incomingOrigin);
      setOriginCoord({
        latitude: incomingOrigin.coordinates[1],
        longitude: incomingOrigin.coordinates[0],
      });
    }

    // Update destination if provided
    if (incomingDestination) {
      setSelectedDestination(incomingDestination);
      setDestinationName(incomingDestination.displayName);
      setDestinationCoord({
        latitude: incomingDestination.coordinates[1],
        longitude: incomingDestination.coordinates[0],
      });
    }

    // Only search if we have both origin and destination
    const effectiveOrigin = incomingOrigin || selectedOrigin;
    const effectiveDestination = incomingDestination || selectedDestination;

    if (!effectiveOrigin || !effectiveDestination) {
      console.log('[MapScreen] Missing origin or destination, not searching yet');
      return;
    }

    // Mark this search as triggered
    searchTriggeredRef.current = searchKey;

    console.log('[MapScreen] Both origin and destination available, searching routes');

    // Trigger route search
    const searchForRoutes = async () => {
      setIsSearching(true);
      setMapMode('searching');

      try {
        // Capture current location ONCE at search time (not reactive to updates)
        // This prevents infinite loops when isCurrentLocation is true
        const currentUserLocation = userLocation;
        
        // Use selected origin coordinates (or user location if origin is current location)
        let originPoint: GeoJSONCoordinate;
        
        if (effectiveOrigin.isCurrentLocation) {
          if (!currentUserLocation) {
            console.warn('[MapScreen] Current location selected but userLocation not available');
            Alert.alert(
              'Location Not Available',
              'Unable to get your current location. Please try again or enter an origin manually.',
              [{ text: 'OK', onPress: () => {
                // Reset state fully on dismiss
                setMapMode('idle');
                setDrawerState('collapsed');
                searchTriggeredRef.current = null;
              }}]
            );
            setIsSearching(false);
            return;
          }
          originPoint = toGeoJSONCoordinate(currentUserLocation);
          console.log('[MapScreen] Using current location as origin:', originPoint);
        } else {
          originPoint = effectiveOrigin.coordinates;
          console.log('[MapScreen] Using selected origin:', originPoint);
        }

        // Validate coordinates
        if (!originPoint || !Array.isArray(originPoint) || originPoint.length !== 2) {
          console.error('[MapScreen] Invalid origin coordinates:', originPoint);
          Alert.alert('Error', 'Invalid origin location. Please try again.', 
            [{ text: 'OK', onPress: () => {
              setMapMode('idle');
              setDrawerState('collapsed');
              searchTriggeredRef.current = null;
            }}]
          );
          setIsSearching(false);
          return;
        }

        if (!effectiveDestination.coordinates || !Array.isArray(effectiveDestination.coordinates) || effectiveDestination.coordinates.length !== 2) {
          console.error('[MapScreen] Invalid destination coordinates:', effectiveDestination.coordinates);
          Alert.alert('Error', 'Invalid destination location. Please try again.',
            [{ text: 'OK', onPress: () => {
              setMapMode('idle');
              setDrawerState('collapsed');
              searchTriggeredRef.current = null;
            }}]
          );
          setIsSearching(false);
          return;
        }

        // =====================================================================
        // PRODUCTION API SEARCH (Phase 4)
        // Try production backend first, fallback to local if it fails
        // =====================================================================
        
        if (useProductionApi) {
          try {
            console.log('[MapScreen] Using PRODUCTION API for search');
            
            const apiResults = await searchRoutesFromApi(
              originPoint,  // [lng, lat] format
              effectiveDestination.coordinates,
              { mode: 'TIME' }
            );

            console.log('[MapScreen] API search results:', {
              routesCount: apiResults.routes.length,
              hasAlternatives: !!apiResults.alternatives.walkingOption,
            });

            setApiSearchResults(apiResults);

            if (apiResults.routes.length > 0) {
              console.log('[MapScreen] Found API routes, selecting first');
              setSelectedApiRoute(apiResults.routes[0]);
              setDrawerState('expanded');
              setMapMode('route-selected');
            } else {
              // No routes from API - show alternatives message
              console.warn('[MapScreen] No API routes found');
              const altMessage = apiResults.alternatives.message || 
                'No transit routes found between these points.';
              
              Alert.alert(
                'No Routes Found',
                altMessage + (apiResults.alternatives.walkingOption?.available 
                  ? `\n\nYou can walk: ${apiResults.alternatives.walkingOption.message}`
                  : ''),
                [{ text: 'OK', onPress: () => {
                  setMapMode('idle');
                  setDrawerState('collapsed');
                  setSelectedApiRoute(null);
                  setApiSearchResults(null);
                  setSelectedOrigin(null);
                  setSelectedDestination(null);
                  setDestinationName('');
                  setDestinationCoord(null);
                  searchTriggeredRef.current = null;
                }}]
              );
            }
          } catch (apiError) {
            console.error('[MapScreen] API search failed:', apiError);
            
            // Handle cold start timeout gracefully
            if (apiError instanceof ApiServiceError) {
              if (apiError.isColdStartTimeout) {
                Alert.alert(
                  'Server Starting Up',
                  'The server is waking up from sleep. This can take 30-45 seconds on first request. Please try again.',
                  [
                    { text: 'Try Again', onPress: () => {
                      searchTriggeredRef.current = null;
                      // Re-trigger search by clearing and setting params again
                    }},
                    { text: 'Cancel', style: 'cancel', onPress: () => {
                      setMapMode('idle');
                      setDrawerState('collapsed');
                      searchTriggeredRef.current = null;
                    }},
                  ]
                );
              } else {
                Alert.alert(
                  'Connection Issue',
                  apiError.message || 'Unable to connect to server. Please check your connection and try again.',
                  [{ text: 'OK', onPress: () => {
                    setMapMode('idle');
                    setDrawerState('collapsed');
                    searchTriggeredRef.current = null;
                  }}]
                );
              }
            } else {
              // Unknown error - fall back to local search
              console.log('[MapScreen] Falling back to LOCAL search');
              throw apiError; // Will be caught by outer catch
            }
            
            setIsSearching(false);
            return;
          }
        } else {
          // ===================================================================
          // LOCAL SEARCH (Legacy fallback)
          // ===================================================================
          console.log('[MapScreen] Using LOCAL search');
          
          const results = await searchRoutes({
            origin: originPoint,
            destination: effectiveDestination.coordinates,
            includeTransfers: true,
          });

          console.log('[MapScreen] Local search results:', {
            directRoutesCount: results.directRoutes.length,
            hasTransfers: results.transferRoutes.length > 0,
            success: results.success,
          });

          setSearchResults(results);

          if (results.directRoutes.length > 0) {
            console.log('[MapScreen] Found routes, selecting first:', results.directRoutes[0].routeName);
            setSelectedRoute(results.directRoutes[0]);
            setDrawerState('expanded');
            setMapMode('route-selected');
          } else {
            console.warn('[MapScreen] No routes found for destination');
            Alert.alert(
              'No Routes Found',
              'No jeepney routes found for this destination. Try a different location.',
              [{ text: 'OK', onPress: () => {
                setMapMode('idle');
                setDrawerState('collapsed');
                setSelectedRoute(null);
                setSearchResults(null);
                setSelectedOrigin(null);
                setSelectedDestination(null);
                setDestinationName('');
                setDestinationCoord(null);
                searchTriggeredRef.current = null;
              }}]
            );
          }
        }
      } catch (error) {
        console.error('[MapScreen] Route search error:', error);
        Alert.alert('Error', 'Failed to search for routes. Please try again.',
          [{ text: 'OK', onPress: () => {
            setMapMode('idle');
            setDrawerState('collapsed');
            searchTriggeredRef.current = null;
          }}]
        );
      } finally {
        setIsSearching(false);
      }
    };

    searchForRoutes();
  }, [route?.params?.selectedOrigin, route?.params?.selectedDestination, useProductionApi]); // Added useProductionApi

  // Update distance to destination during navigation
  useEffect(() => {
    if (!isNavigating || !routeDestination) {
      setDistanceToDestination(null);
      return;
    }

    const distance = calculateDistance(userLocation, routeDestination);
    setDistanceToDestination(distance);
  }, [isNavigating, userLocation, routeDestination]);

  // Center map on user location when first available
  useEffect(() => {
    if (userLocation && mapMode === 'idle') {
      mapRef.current?.animateToCoordinate(userLocation, 500);
    }
  }, [userLocation, mapMode]);

  // ==========================================================================
  // Handlers
  // ==========================================================================

  /**
   * Handle TopSearchBar press - Navigate to SearchScreen
   * Passes existing origin/destination so user can edit them
   * ALWAYS navigates regardless of drawer state
   */
  const handleSearchPress = useCallback((initialFocus: 'origin' | 'destination' = 'destination') => {
    console.log('[MapScreen] handleSearchPress called, navigating to MapSearch');
    
    if (!navigation?.navigate) {
      console.error('[MapScreen] Navigation not available!');
      return;
    }
    
    // Reset search trigger ref to allow new search after editing
    searchTriggeredRef.current = null;
    
    navigation.navigate('MapSearch', {
      initialFocus,
      existingOrigin: selectedOrigin,
      existingDestination: selectedDestination,
    });
  }, [navigation, selectedOrigin, selectedDestination]);

  /**
   * Handle origin field press specifically
   */
  const handleOriginPress = useCallback(() => {
    handleSearchPress('origin');
  }, [handleSearchPress]);

  /**
   * Handle destination field press specifically
   */
  const handleDestinationPress = useCallback(() => {
    handleSearchPress('destination');
  }, [handleSearchPress]);

  /**
   * Handle route selection
   */
  const handleRouteSelect = useCallback((selectedRouteItem: RouteWithDetails) => {
    setSelectedRoute(selectedRouteItem);
  }, []);

  /**
   * Handle start navigation - begins trip tracking with stopwatch
   */
  const handleStartNavigation = useCallback(() => {
    if (!selectedRoute) return;

    console.log('[MapScreen] Starting navigation - initializing stopwatch');

    // Start the stopwatch for commute tracking
    if (stopwatchRef.current) {
      stopwatchRef.current.reset();
      stopwatchRef.current.start();
      console.log('[Stopwatch] Trip started at:', new Date().toISOString());
    }

    setIsNavigating(true);
    setDrawerState('hidden');
    setMapMode('navigating');

    // Fit map to show entire route
    if (selectedRoute.geometry?.coordinates) {
      const coords = selectedRoute.geometry.coordinates;
      const firstCoord = toMapCoordinate(coords[0]);
      const lastCoord = toMapCoordinate(coords[coords.length - 1]);
      
      mapRef.current?.fitToCoordinates([firstCoord, lastCoord, userLocation], {
        edgePadding: { top: 150, right: 50, bottom: 100, left: 50 },
        animated: true,
      });
    }
  }, [selectedRoute, userLocation]);

  /**
   * Handle exit navigation - stops trip tracking and saves session
   */
  const handleExitNavigation = useCallback(async () => {
    console.log('[MapScreen] Exiting navigation - stopping stopwatch');

    // Stop the stopwatch and save session
    if (stopwatchRef.current) {
      const duration = stopwatchRef.current.stop();
      console.log('[Stopwatch] Trip ended. Total duration:', formatTime(duration));

      // Create session for saving
      const session = stopwatchRef.current.toCommuteSession({
        route: selectedRoute ? {
          routeId: selectedRoute.routeId,
          routeName: selectedRoute.routeName,
        } : undefined,
        origin: userLocation ? {
          lat: userLocation.latitude,
          lng: userLocation.longitude,
        } : undefined,
        destination: destinationCoord ? {
          lat: destinationCoord.latitude,
          lng: destinationCoord.longitude,
          name: destinationName,
        } : undefined,
        endTime: new Date(),
      });

      // Save session to backend (async, non-blocking)
      try {
        await saveCommuteSession(session);
        console.log('[Stopwatch] Session saved to backend:', session.id);
      } catch (error) {
        // Show toast on failure instead of silently ignoring
        console.warn('[Stopwatch] Failed to save session:', error);
        Alert.alert(
          'Trip Ended',
          'Your trip has ended, but we couldn\'t save the history. Check your connection.',
          [{ text: 'OK' }]
        );
      }
    }

    setIsNavigating(false);
    setDrawerState('expanded');
    setMapMode('route-selected');
  }, [selectedRoute, userLocation, destinationCoord, destinationName]);

  /**
   * Handle clear/reset - clears route and returns to idle
   * Uses InteractionManager for safe iOS state reset to prevent crashes
   */
  const handleClear = useCallback(() => {
    // Use InteractionManager to ensure animations complete before state reset
    // This prevents iOS crashes from state changes during animations
    InteractionManager.runAfterInteractions(() => {
      // Reset search trigger ref to allow new searches
      searchTriggeredRef.current = null;
      
      // Reset all state to initial values
      setMapMode('idle');
      setDrawerState('collapsed');
      setSelectedRoute(null);
      setSearchResults(null);
      setDestinationName('');
      setDestinationCoord(null);
      setSelectedDestination(null);
      setSelectedOrigin(null);
      setOriginCoord(null);
      setIsNavigating(false);
    });
  }, []);

  /**
   * Handle PARA triggered - logs stopwatch time when user should alight
   */
  const handleParaTriggered = useCallback(() => {
    console.log('[MapScreen] PARA triggered!');
    
    // Log stopwatch time at PARA moment
    if (stopwatchRef.current) {
      const elapsed = stopwatchRef.current.getElapsedTime();
      console.log('[Stopwatch] PARA triggered at elapsed time:', formatTime(elapsed));
    }
    
    // Could log analytics, save trip milestone, etc.
  }, []);

  /**
   * Handle bookmark - saves the destination to favorites
   */
  const handleBookmark = useCallback(async () => {
    if (!destinationName || !destinationCoord) return;
    
    await saveLocation({
      name: destinationName.split(',')[0],
      displayName: destinationName,
      coordinates: [destinationCoord.longitude, destinationCoord.latitude],
      type: 'saved',
    });
    
    Alert.alert('Saved!', 'Location has been added to your favorites.');
  }, [destinationName, destinationCoord, saveLocation]);

  // ==========================================================================
  // Render
  // ==========================================================================

  console.log('[MapScreen] Render - isNavigating:', isNavigating, 'selectedOrigin:', selectedOrigin, 'selectedDestination:', selectedDestination);

  return (
    <View style={styles.container}>
      {/* Map Container - Full screen */}
      <View style={styles.mapContainer}>
        {/* TopSearchBar - Floating on top */}
        {!isNavigating && (
          <SafeAreaView edges={['top']} style={styles.searchBarContainer}>
            <TopSearchBar
              onPress={() => handleSearchPress('destination')}
              onOriginPress={handleOriginPress}
              onDestinationPress={handleDestinationPress}
              origin={selectedOrigin}
              destination={selectedDestination}
              isSearchActive={mapMode !== 'idle'}
            />
          </SafeAreaView>
        )}
        <MapContainer
          ref={mapRef}
          userLocation={userLocation}
          userAccuracy={userCoordinates?.accuracy}
          userHeading={userCoordinates?.heading}
          showUserLocation={true}
          route={selectedRoute}
          transferRoute={activeTransferRoute}
          autoFitToRoute={mapMode === 'route-selected'}
          routeColor={COLORS.paraBrand}
          routeWidth={5}
          showRouteLabels={true}
        >
          {/* Destination Marker */}
          {destinationCoord && mapMode !== 'idle' && (
            <TransferMarker
              transfer={{
                name: destinationName,
                coordinate: toGeoJSONCoordinate(destinationCoord),
                fromVehicle: selectedRoute?.vehicleType || 'jeep',
                toVehicle: 'jeep',
              }}
              fare={selectedRoute?.calculatedFare}
            />
          )}
        </MapContainer>
      </View>

      {/* Floating Action Buttons - Animate with drawer */}
      {!isNavigating && (
        <FloatingButtons
          drawerState={drawerState}
          mapMode={mapMode}
          onRecenter={() => {
            if (userLocation) {
              mapRef.current?.animateToCoordinate(userLocation, 500);
            }
          }}
          onClear={handleClear}
        />
      )}

      {/* Route Selection Drawer (Bottom Sheet) */}
      {!isNavigating && (
        <RouteSelectionDrawer
          drawerState={drawerState}
          routes={routes}
          selectedRoute={selectedRoute}
          destinationName={destinationName}
          isLoading={isSearching}
          onRouteSelect={handleRouteSelect}
          onStartNavigation={handleStartNavigation}
          onClear={handleClear}
          onBookmark={handleBookmark}
          onSearchPress={handleSearchPress}
        />
      )}

      {/* Active Navigation Overlay - Gamified HUD */}
      {selectedRoute && (
        <ActiveNavigationOverlay
          isActive={isNavigating}
          userLocation={userLocation}
          route={selectedRoute}
          destinationName={destinationName}
          steps={navigationSteps}
          currentStepIndex={navState.currentStepIndex}
          distanceToStepEnd={navState.distanceToStepEnd}
          stepProgress={navState.stepProgress}
          isInTransferZone={navState.isInTransferZone}
          tripXP={navState.tripXP}
          onExit={handleExitNavigation}
          onStepComplete={(stepIndex) => {
            console.log('[MapScreen] Step completed:', stepIndex);
          }}
        />
      )}

      {/* Loading Overlay - Full screen with progressive messages */}
      <LoadingOverlay
        visible={isSearching}
        progressiveMessages={true}
      />
    </View>
  );
};

// =============================================================================
// Styles
// =============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  mapContainer: {
    flex: 1,
  },
  searchBarContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  floatingButton: {
    position: 'absolute',
    right: 16,
    zIndex: 5,
  },
  buttonInner: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
});

export default MapScreen;
