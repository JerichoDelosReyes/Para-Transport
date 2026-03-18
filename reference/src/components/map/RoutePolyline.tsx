/**
 * RoutePolyline Component
 * 
 * Renders a colored polyline on the map representing a jeepney route.
 * NAV-005: Route visualization
 * NAV-006: Route styling
 * NAV-007: Route interaction
 * 
 * @module components/map/RoutePolyline
 */

import React, { memo, useCallback, useMemo } from 'react';
import { Polyline } from 'react-native-maps';
import type { MapCoordinate } from '../../utils/geoUtils';

/**
 * Traffic status levels for route visualization
 * NAV-010: Traffic overlay support
 */
export type TrafficStatus = 'normal' | 'moderate' | 'heavy';

/**
 * Traffic status color mapping
 */
export const TRAFFIC_COLORS: Record<TrafficStatus, string> = {
  normal: '', // Use route's base color
  moderate: '#FFA500', // Orange
  heavy: '#FF0000', // Red
};

/**
 * Traffic status stroke width adjustments
 */
const TRAFFIC_STROKE_ADJUSTMENT: Record<TrafficStatus, number> = {
  normal: 0,
  moderate: 0,
  heavy: 2, // Increase width for visibility
};

/**
 * Props for RoutePolyline component
 */
export interface RoutePolylineProps {
  /** Route identifier for key and callbacks */
  routeId?: string;
  /** Array of coordinates forming the route line */
  coordinates: MapCoordinate[];
  /** Line color (hex code) */
  color: string;
  /** Line width in pixels */
  strokeWidth?: number;
  /** Line opacity (0-1) */
  opacity?: number;
  /** Whether the route is currently selected/highlighted */
  isSelected?: boolean;
  /** Whether the route is tappable */
  tappable?: boolean;
  /** Callback when route is tapped */
  onPress?: (routeId: string) => void;
  /** Line cap style */
  lineCap?: 'butt' | 'round' | 'square';
  /** Line join style */
  lineJoin?: 'miter' | 'round' | 'bevel';
  /** Line dash pattern [dash, gap] */
  lineDashPattern?: number[];
  /** Z-index for layering */
  zIndex?: number;
  /** Traffic status for color override */
  trafficStatus?: TrafficStatus;
}

/**
 * Default styling constants
 */
const DEFAULT_STROKE_WIDTH = 4;
const SELECTED_STROKE_WIDTH = 6;
const DEFAULT_OPACITY = 0.85;
const SELECTED_OPACITY = 1.0;
const DESELECTED_OPACITY = 0.4;

/**
 * RoutePolyline component for rendering jeepney routes on the map
 * 
 * Features:
 * - Colored route lines with configurable styling
 * - Selection state with visual feedback
 * - Touch interaction support
 * - Performance optimized with React.memo
 * 
 * @param props - RoutePolylineProps
 * @returns React component
 * 
 * @example
 * ```tsx
 * // Basic usage
 * <RoutePolyline
 *   coordinates={route.coordinates}
 *   color="#E53935"
 * />
 * 
 * // With selection and interaction
 * <RoutePolyline
 *   routeId="BDO-SMMOLINO-OUT"
 *   coordinates={route.coordinates}
 *   color={route.color}
 *   isSelected={selectedRouteId === route.id}
 *   tappable={true}
 *   onPress={(id) => setSelectedRouteId(id)}
 * />
 * ```
 */
export const RoutePolyline: React.FC<RoutePolylineProps> = memo(
  ({
    routeId,
    coordinates,
    color,
    strokeWidth,
    opacity,
    isSelected = false,
    tappable = true,
    onPress,
    lineCap = 'round',
    lineJoin = 'round',
    lineDashPattern,
    zIndex = 1,
    trafficStatus = 'normal',
  }) => {
    /**
     * Calculate effective color based on traffic status
     * Traffic status overrides the route's base color
     */
    const effectiveColor = useMemo(() => {
      if (trafficStatus !== 'normal' && TRAFFIC_COLORS[trafficStatus]) {
        return TRAFFIC_COLORS[trafficStatus];
      }
      return color;
    }, [color, trafficStatus]);

    /**
     * Calculate effective stroke width based on selection and traffic state
     */
    const effectiveStrokeWidth = useMemo(() => {
      const baseWidth = strokeWidth ?? (isSelected ? SELECTED_STROKE_WIDTH : DEFAULT_STROKE_WIDTH);
      const trafficAdjustment = TRAFFIC_STROKE_ADJUSTMENT[trafficStatus] || 0;
      return baseWidth + trafficAdjustment;
    }, [strokeWidth, isSelected, trafficStatus]);

    /**
     * Calculate effective opacity based on selection state
     * When a route is selected, other routes become more transparent
     */
    const effectiveOpacity = opacity ?? (isSelected ? SELECTED_OPACITY : DEFAULT_OPACITY);

    /**
     * Handle polyline press
     */
    const handlePress = useCallback(() => {
      if (onPress && routeId) {
        onPress(routeId);
      }
    }, [onPress, routeId]);

    // Don't render if no coordinates
    if (!coordinates || coordinates.length < 2) {
      console.warn(`[RoutePolyline] Invalid coordinates for route: ${routeId}`);
      return null;
    }

    return (
      <Polyline
        coordinates={coordinates}
        strokeColor={effectiveColor}
        strokeWidth={effectiveStrokeWidth}
        lineCap={lineCap}
        lineJoin={lineJoin}
        lineDashPattern={lineDashPattern}
        tappable={tappable}
        onPress={handlePress}
        zIndex={isSelected ? zIndex + 10 : zIndex}
        // Performance: Disable geodesic for straight segments
        geodesic={false}
      />
    );
  },
  // Custom comparison for memo - only re-render when relevant props change
  (prevProps, nextProps) => {
    return (
      prevProps.routeId === nextProps.routeId &&
      prevProps.color === nextProps.color &&
      prevProps.strokeWidth === nextProps.strokeWidth &&
      prevProps.opacity === nextProps.opacity &&
      prevProps.isSelected === nextProps.isSelected &&
      prevProps.coordinates === nextProps.coordinates &&
      prevProps.zIndex === nextProps.zIndex &&
      prevProps.trafficStatus === nextProps.trafficStatus
    );
  }
);

RoutePolyline.displayName = 'RoutePolyline';

/**
 * Props for rendering multiple routes with selection support
 */
export interface RoutePolylinesProps {
  /** Array of route data */
  routes: Array<{
    id: string;
    coordinates: MapCoordinate[];
    color: string;
    /** Traffic status for this route */
    trafficStatus?: TrafficStatus;
  }>;
  /** Currently selected route ID (optional) */
  selectedRouteId?: string | null;
  /** Callback when a route is pressed */
  onRoutePress?: (routeId: string) => void;
  /** Base stroke width for routes */
  strokeWidth?: number;
  /** Opacity for deselected routes when a route is selected */
  deselectedOpacity?: number;
  /** Whether to show traffic overlay colors */
  showTrafficOverlay?: boolean;
}

/**
 * RoutePolylines component for rendering multiple routes
 * 
 * Handles selection state and renders routes with appropriate styling.
 * Selected routes appear highlighted while others fade.
 * 
 * @example
 * ```tsx
 * const { routes } = useRouteData();
 * const [selectedId, setSelectedId] = useState<string | null>(null);
 * 
 * <RoutePolylines
 *   routes={routes}
 *   selectedRouteId={selectedId}
 *   onRoutePress={setSelectedId}
 * />
 * ```
 */
export const RoutePolylines: React.FC<RoutePolylinesProps> = memo(
  ({
    routes,
    selectedRouteId,
    onRoutePress,
    strokeWidth = DEFAULT_STROKE_WIDTH,
    deselectedOpacity = DESELECTED_OPACITY,
    showTrafficOverlay = false,
  }) => {
    return (
      <>
        {routes.map((route) => {
          const isSelected = selectedRouteId === route.id;
          const hasSelection = selectedRouteId !== null && selectedRouteId !== undefined;
          
          return (
            <RoutePolyline
              key={route.id}
              routeId={route.id}
              coordinates={route.coordinates}
              color={route.color}
              strokeWidth={strokeWidth}
              opacity={hasSelection && !isSelected ? deselectedOpacity : undefined}
              isSelected={isSelected}
              tappable={true}
              onPress={onRoutePress}
              trafficStatus={showTrafficOverlay ? route.trafficStatus : 'normal'}
            />
          );
        })}
      </>
    );
  }
);

RoutePolylines.displayName = 'RoutePolylines';

export default RoutePolyline;
