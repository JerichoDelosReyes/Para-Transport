/**
 * RouteSelectionDrawer Component
 * 
 * Animated bottom drawer for route selection and navigation controls.
 * Uses react-native-reanimated for smooth animations and gesture handler for dragging.
 * 
 * Part of the "Decoupled Search" architecture:
 * - Search input has been moved to TopSearchBar (separate component)
 * - This drawer focuses on route display and navigation controls
 * - Supports gesture-based dragging between collapsed/expanded states
 * 
 * States:
 * - Collapsed: Destination summary visible (~100px)
 * - Expanded: Route list and details visible (~55% screen height)
 * - Hidden: During navigation mode
 * 
 * @module components/map/RouteSelectionDrawer
 */

import React, { useCallback, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  View,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Navigation, Bookmark, MapPin, ChevronUp } from 'lucide-react-native';

import { Text } from '../../../components/ui/text';
import { RouteCard } from './RouteCard';
import { RouteInfoBar } from './RouteInfoBar';
import {
  RouteWithDetails,
  DrawerState,
  getRouteDistance,
  getRouteTime,
} from '../../types/route';

// =============================================================================
// Constants
// =============================================================================

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const COLORS = {
  white: '#FFFFFF',
  paraBrand: '#E9AE16',
  textDark: '#1C1B1F',
  textGray: '#6B7280',
  placeholder: '#9CA3AF',
  border: '#E5E7EB',
  background: '#F9FAFB',
  inputBg: '#F3F4F6',
} as const;

// Drawer heights - Minimized to "Handle/Glimpse" state
// MINIMIZED: Collapsed state (~80px) - covers map attributions
// MEDIUM: Route preview (~40% screen) - shows route summary
// EXPANDED: Full route details - capped to not overlap status bar + search bar (~120px from top)
const MINIMIZED_HEIGHT = 80; // Increased to cover OSM/Apple attributions
const MEDIUM_HEIGHT = SCREEN_HEIGHT * 0.40;
const TOP_SAFE_MARGIN = 300; // Space for status bar + TopSearchBar
const EXPANDED_HEIGHT = SCREEN_HEIGHT - TOP_SAFE_MARGIN;
const DRAG_THRESHOLD = 50; // Minimum drag distance to trigger state change

// Spring configuration for smooth animations
const SPRING_CONFIG = {
  damping: 20,
  stiffness: 150,
  mass: 0.5,
};

// =============================================================================
// Props
// =============================================================================

export interface RouteSelectionDrawerProps {
  /** Current drawer state */
  drawerState: DrawerState;
  /** Available routes from search */
  routes: RouteWithDetails[];
  /** Currently selected route */
  selectedRoute: RouteWithDetails | null;
  /** Destination name to display in collapsed state */
  destinationName: string;
  /** Whether search/loading is in progress */
  isLoading: boolean;
  /** Callback when a route is selected */
  onRouteSelect: (route: RouteWithDetails) => void;
  /** Callback when "Start Navigation" is pressed */
  onStartNavigation: () => void;
  /** Callback to clear search and collapse */
  onClear: () => void;
  /** Callback to save/bookmark route */
  onBookmark?: () => void;
  /** Callback when search area is pressed - navigates to SearchScreen */
  onSearchPress?: () => void;
  /** Current snap index (0=minimized, 1=medium, 2=expanded) */
  snapIndex?: number;
  /** Callback when snap index changes */
  onSnapIndexChange?: (index: number) => void;
}

// =============================================================================
// Subcomponents
// =============================================================================

/**
 * Drawer handle indicator (also acts as drag target)
 */
const DrawerHandle: React.FC = () => (
  <View style={styles.handleContainer}>
    <View style={styles.handle} />
  </View>
);

/**
 * Minimized/Glimpse state content - shows brief route preview
 * Only displays when there are routes to show (not a search trigger)
 */
interface GlimpseContentProps {
  destinationName: string;
  hasRoutes: boolean;
  routeCount: number;
}

const GlimpseContent: React.FC<GlimpseContentProps> = ({
  destinationName,
  hasRoutes,
  routeCount,
}) => {
  // If no routes, show minimal text hint to pull up
  if (!hasRoutes) {
    return (
      <View style={styles.glimpseContent}>
        <View style={styles.glimpseHint}>
          <ChevronUp size={16} color={COLORS.textGray} />
          <Text style={styles.glimpseHintText}>Pull up for details</Text>
        </View>
      </View>
    );
  }

  // Show brief route summary
  return (
    <View style={styles.glimpseContent}>
      <View style={styles.glimpseRow}>
        <View style={styles.glimpseIconContainer}>
          <MapPin size={16} color={COLORS.paraBrand} />
        </View>
        <Text style={styles.glimpseDestination} numberOfLines={1}>
          {destinationName?.split(',')[0] || 'Destination'}
        </Text>
        <View style={styles.glimpseRouteCount}>
          <Text style={styles.glimpseRouteCountText}>
            {routeCount} route{routeCount !== 1 ? 's' : ''}
          </Text>
          <ChevronUp size={14} color={COLORS.textGray} />
        </View>
      </View>
    </View>
  );
};

/**
 * Start Navigation button
 */
interface NavigationButtonProps {
  onPress: () => void;
  onBookmark?: () => void;
  disabled?: boolean;
}

const NavigationButton: React.FC<NavigationButtonProps> = ({
  onPress,
  onBookmark,
  disabled = false,
}) => (
  <View style={styles.navigationButtonContainer}>
    <TouchableOpacity
      style={[styles.startButton, disabled && styles.startButtonDisabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
    >
      <Navigation size={20} color={COLORS.textDark} style={styles.navIcon} />
      <Text style={styles.startButtonText}>Start Navigation</Text>
    </TouchableOpacity>
    {onBookmark && (
      <TouchableOpacity style={styles.bookmarkButton} onPress={onBookmark}>
        <Bookmark size={22} color={COLORS.textDark} />
      </TouchableOpacity>
    )}
  </View>
);

/**
 * Empty state when no routes found
 */
const EmptyState: React.FC<{ message: string }> = ({ message }) => (
  <View style={styles.emptyState}>
    <Text style={styles.emptyStateText}>{message}</Text>
  </View>
);

// =============================================================================
// Main Component
// =============================================================================

/**
 * RouteSelectionDrawer is the main UI for searching and selecting routes.
 * It animates between collapsed (search bar) and expanded (route list) states.
 * 
 * @example
 * <RouteSelectionDrawer
 *   drawerState={drawerState}
 *   routes={searchResults}
 *   selectedRoute={selectedRoute}
 *   searchQuery={query}
 *   isLoading={loading}
 *   onRouteSelect={setSelectedRoute}
 *   onStartNavigation={startNav}
 *   onClear={clearSearch}
 *   onSearchPress={() => navigation.navigate('MapSearch')}
 * />
 */
export const RouteSelectionDrawer: React.FC<RouteSelectionDrawerProps> = ({
  drawerState,
  routes,
  selectedRoute,
  destinationName,
  isLoading,
  onRouteSelect,
  onStartNavigation,
  onClear,
  onBookmark,
  onSearchPress,
  snapIndex = 0,
  onSnapIndexChange,
}) => {
  const insets = useSafeAreaInsets();
  
  // Snap points array: [minimized, medium, expanded]
  const snapPoints = [MINIMIZED_HEIGHT, MEDIUM_HEIGHT, EXPANDED_HEIGHT];
  
  // Animated height value - starts minimized
  const animatedHeight = useSharedValue(MINIMIZED_HEIGHT);
  
  // Track current snap index for gesture handling
  const currentSnapIndex = useSharedValue(snapIndex);

  // Update height based on drawer state and snap index
  useEffect(() => {
    switch (drawerState) {
      case 'collapsed':
        // Collapsed now means minimized (handle-only)
        animatedHeight.value = withSpring(MINIMIZED_HEIGHT, SPRING_CONFIG);
        currentSnapIndex.value = 0;
        break;
      case 'expanded':
        // When routes arrive, expand to medium (40%) to show route preview
        animatedHeight.value = withSpring(MEDIUM_HEIGHT, SPRING_CONFIG);
        currentSnapIndex.value = 1;
        break;
      case 'hidden':
        animatedHeight.value = withSpring(0, SPRING_CONFIG);
        currentSnapIndex.value = 0;
        break;
    }
  }, [drawerState, animatedHeight, currentSnapIndex]);

  // Gesture handler for dragging using new Gesture API
  const startHeight = useSharedValue(MINIMIZED_HEIGHT);
  
  /**
   * Find nearest snap point index based on current height
   */
  const findNearestSnapIndex = (height: number): number => {
    'worklet';
    let nearestIndex = 0;
    let minDistance = Math.abs(height - snapPoints[0]);
    
    for (let i = 1; i < snapPoints.length; i++) {
      const distance = Math.abs(height - snapPoints[i]);
      if (distance < minDistance) {
        minDistance = distance;
        nearestIndex = i;
      }
    }
    return nearestIndex;
  };
  
  const panGesture = Gesture.Pan()
    .onStart(() => {
      startHeight.value = animatedHeight.value;
    })
    .onUpdate((event) => {
      // Dragging up = negative translationY = increase height
      const newHeight = startHeight.value - event.translationY;
      // Clamp between minimized and expanded heights
      animatedHeight.value = Math.min(
        EXPANDED_HEIGHT,
        Math.max(MINIMIZED_HEIGHT, newHeight)
      );
    })
    .onEnd((event) => {
      // Determine final state based on velocity and position
      const velocity = event.velocityY;
      const currentHeight = animatedHeight.value;
      const currentIndex = currentSnapIndex.value;
      
      // Fast swipe takes priority - move to next/prev snap point
      if (Math.abs(velocity) > 500) {
        if (velocity < 0) {
          // Swiped up - go to next snap point (higher)
          const nextIndex = Math.min(currentIndex + 1, snapPoints.length - 1);
          animatedHeight.value = withSpring(snapPoints[nextIndex], SPRING_CONFIG);
          currentSnapIndex.value = nextIndex;
        } else {
          // Swiped down - go to previous snap point (lower)
          const prevIndex = Math.max(currentIndex - 1, 0);
          animatedHeight.value = withSpring(snapPoints[prevIndex], SPRING_CONFIG);
          currentSnapIndex.value = prevIndex;
        }
      } else {
        // Slow drag - snap to nearest point
        const nearestIndex = findNearestSnapIndex(currentHeight);
        animatedHeight.value = withSpring(snapPoints[nearestIndex], SPRING_CONFIG);
        currentSnapIndex.value = nearestIndex;
      }
    });

  // Animated style for drawer container
  const animatedContainerStyle = useAnimatedStyle(() => ({
    height: animatedHeight.value + insets.bottom,
    opacity: interpolate(
      animatedHeight.value,
      [0, MINIMIZED_HEIGHT],
      [0, 1],
      Extrapolation.CLAMP
    ),
  }));

  // Animated style for expanded content (route list) - fades in after medium height
  const animatedContentStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      animatedHeight.value,
      [MINIMIZED_HEIGHT, MEDIUM_HEIGHT * 0.5, MEDIUM_HEIGHT],
      [0, 0.3, 1],
      Extrapolation.CLAMP
    ),
  }));
  
  // Animated style for glimpse/minimized content - visible only when minimized
  const animatedGlimpseStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      animatedHeight.value,
      [MINIMIZED_HEIGHT, MINIMIZED_HEIGHT + 40],
      [1, 0],
      Extrapolation.CLAMP
    ),
  }));

  // Calculate summary info from selected route or first route
  const summaryRoute = selectedRoute || routes[0];
  const summaryEta = summaryRoute ? getRouteTime(summaryRoute) : 0;
  const summaryDistance = summaryRoute ? getRouteDistance(summaryRoute) : 0;

  // Memoize route list rendering
  const routeList = useMemo(() => {
    if (isLoading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.paraBrand} />
          <Text style={styles.loadingText}>Finding routes...</Text>
        </View>
      );
    }

    if (routes.length === 0 && destinationName) {
      return <EmptyState message="No routes found. Try a different destination." />;
    }

    if (routes.length === 0) {
      return <EmptyState message="Select a destination to find routes." />;
    }

    return (
      <ScrollView
        style={styles.routeList}
        contentContainerStyle={styles.routeListContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionTitle}>Suggested Routes</Text>
        {routes.map((route) => (
          <RouteCard
            key={route.routeId}
            route={route}
            isSelected={selectedRoute?.routeId === route.routeId}
            onPress={onRouteSelect}
          />
        ))}
      </ScrollView>
    );
  }, [routes, selectedRoute, isLoading, destinationName, onRouteSelect]);

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={[styles.container, animatedContainerStyle]}>
        {/* Drag Handle - Always visible */}
        <DrawerHandle />
        
        {/* Glimpse Content - Shows when minimized */}
        <Animated.View style={[styles.glimpseContainer, animatedGlimpseStyle]}>
          <GlimpseContent
            destinationName={destinationName}
            hasRoutes={routes.length > 0}
            routeCount={routes.length}
          />
        </Animated.View>

        {/* Expanded Content - Route list and details */}
        <Animated.View style={[styles.expandedContent, animatedContentStyle]}>
          {/* Info Bar - Only show when routes available */}
          {routes.length > 0 && !isLoading && (
            <RouteInfoBar eta={summaryEta} distance={summaryDistance} />
          )}

          {/* Route List */}
          {routeList}

          {/* Start Navigation Button */}
          {selectedRoute && (
            <NavigationButton
              onPress={onStartNavigation}
              onBookmark={onBookmark}
              disabled={isLoading}
            />
          )}
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
};

// =============================================================================
// Styles
// =============================================================================

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 10,
    overflow: 'hidden',
  },
  handleContainer: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 4,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: COLORS.border,
    borderRadius: 2,
  },
  // Glimpse/Minimized Content Styles
  glimpseContainer: {
    position: 'absolute',
    top: 20,
    left: 0,
    right: 0,
  },
  glimpseContent: {
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  glimpseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  glimpseIconContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.inputBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  glimpseDestination: {
    flex: 1,
    fontFamily: 'Inter',
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.textDark,
  },
  glimpseRouteCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  glimpseRouteCountText: {
    fontFamily: 'Inter',
    fontSize: 12,
    color: COLORS.textGray,
  },
  glimpseHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  glimpseHintText: {
    fontFamily: 'Inter',
    fontSize: 12,
    color: COLORS.textGray,
  },
  // Expanded Content Styles
  expandedContent: {
    flex: 1,
  },
  sectionTitle: {
    fontFamily: 'QuiapoFree2-Regular',
    fontSize: 18,
    fontWeight: '400',
    color: COLORS.textDark,
    marginBottom: 12,
    marginLeft: 4,
    letterSpacing: 0.5,
  },
  routeList: {
    flex: 1,
  },
  routeListContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    fontFamily: 'Inter',
    fontSize: 14,
    color: COLORS.textGray,
    marginTop: 12,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 24,
  },
  emptyStateText: {
    fontFamily: 'Inter',
    fontSize: 14,
    color: COLORS.textGray,
    textAlign: 'center',
  },
  navigationButtonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  startButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.paraBrand,
    borderRadius: 14,
    paddingVertical: 14,
    marginRight: 12,
  },
  startButtonDisabled: {
    opacity: 0.6,
  },
  navIcon: {
    marginRight: 8,
  },
  startButtonText: {
    fontFamily: 'Inter',
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textDark,
  },
  bookmarkButton: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.inputBg,
    borderRadius: 12,
  },
});

export default RouteSelectionDrawer;
