/**
 * RouteCard Component
 * 
 * Displays a single route option in the route selection drawer.
 * Shows route name, via stops, distance, and fare.
 * Includes expandable transfer details dropdown.
 * 
 * Phase 3 Updates:
 * - Removed Jeepney icon
 * - Enlarged fare text (relative sizing)
 * - Added transfer details dropdown
 * - Pickup point truncation with ellipsis
 * 
 * @module components/map/RouteCard
 */

import React, { useCallback, useState } from 'react';
import { StyleSheet, TouchableOpacity, View, Pressable, LayoutAnimation, Platform, UIManager } from 'react-native';
import { ChevronDown, ChevronUp, MapPin } from 'lucide-react-native';
import { Text } from '../../../components/ui/text';
import {
  RouteWithDetails,
  VehicleType,
  VEHICLE_TYPE_CONFIG,
  TransferLeg,
  getSegmentColor,
} from '../../types/route';

// Enable LayoutAnimation for Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// =============================================================================
// Constants
// =============================================================================

const COLORS = {
  white: '#FFFFFF',
  paraBrand: '#E9AE16',
  textDark: '#1C1B1F',
  textGray: '#6B7280',
  border: '#E5E7EB',
  routeRed: '#D63939',
  routeBlue: '#4285F4',
  routeGreen: '#34A853',
  background: '#F9FAFB',
  lightYellow: '#FFFBF0',
} as const;

// Route color mapping based on route ID pattern
const getRouteColor = (routeId: string): string => {
  if (routeId.includes('01') || routeId.includes('A')) return COLORS.routeRed;
  if (routeId.includes('04') || routeId.includes('B')) return COLORS.routeBlue;
  return COLORS.routeGreen;
};

// =============================================================================
// Props
// =============================================================================

export interface RouteCardProps {
  /** Route data to display */
  route: RouteWithDetails;
  /** Whether this card is selected */
  isSelected?: boolean;
  /** Callback when card is pressed */
  onPress?: (route: RouteWithDetails) => void;
  /** Transfer legs for multi-segment routes (optional) */
  transferLegs?: TransferLeg[];
  /** Test ID for testing */
  testID?: string;
}

// =============================================================================
// Subcomponents
// =============================================================================

/**
 * Route color indicator dot
 */
const RouteIndicator: React.FC<{ color: string }> = ({ color }) => (
  <View style={[styles.routeIndicator, { backgroundColor: color }]} />
);

/**
 * Transfer leg detail row
 */
interface TransferLegRowProps {
  leg: TransferLeg;
  index: number;
  isLast: boolean;
}

const TransferLegRow: React.FC<TransferLegRowProps> = ({ leg, index, isLast }) => {
  const vehicleConfig = VEHICLE_TYPE_CONFIG[leg.route.vehicleType] || VEHICLE_TYPE_CONFIG.jeep;
  const segmentColor = getSegmentColor(index);
  const pickupName = leg.from?.name || 'Pickup Point';
  
  return (
    <View style={[styles.legRow, !isLast && styles.legRowBorder]}>
      {/* Colored segment indicator */}
      <View style={[styles.legIndicator, { backgroundColor: segmentColor }]} />
      
      <View style={styles.legContent}>
        {/* Vehicle type and route name */}
        <View style={styles.legHeader}>
          <Text style={styles.legVehicleIcon}>{vehicleConfig.icon}</Text>
          <Text style={styles.legRouteName} numberOfLines={1}>
            {leg.route.routeName || leg.route.signboard}
          </Text>
        </View>
        
        {/* Pickup point with truncation */}
        <View style={styles.legPickupRow}>
          <MapPin size={12} color={COLORS.textGray} />
          <Text style={styles.legPickupText} numberOfLines={1} ellipsizeMode="tail">
            {pickupName}
          </Text>
        </View>
        
        {/* Distance and fare */}
        <View style={styles.legStats}>
          <Text style={styles.legStatText}>{leg.distance?.toFixed(1) || '0'} km</Text>
          <Text style={styles.legStatDot}>•</Text>
          <Text style={styles.legFare}>₱{leg.fare || 0}</Text>
        </View>
      </View>
    </View>
  );
};

// =============================================================================
// Main Component
// =============================================================================

/**
 * RouteCard displays a single route option with:
 * - Route name and signboard
 * - Via stops (landmarks along the way) with truncation
 * - Distance in km
 * - Large fare display
 * - Expandable transfer details (if multi-segment)
 */
export const RouteCard: React.FC<RouteCardProps> = ({
  route,
  isSelected = false,
  onPress,
  transferLegs,
  testID,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const routeColor = getRouteColor(route.routeId);
  const hasTransfers = transferLegs && transferLegs.length > 1;
  
  // Format via stops as "Via A → B → C" with truncation
  const viaStops = route.stops
    ?.slice(0, 3)
    .map((s) => s.name)
    .join(' → ') || route.routeName;

  const handlePress = useCallback(() => {
    onPress?.(route);
  }, [onPress, route]);

  const toggleExpand = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsExpanded(prev => !prev);
  }, []);

  return (
    <View style={[styles.container, isSelected && styles.containerSelected]}>
      {/* Main card content - pressable */}
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.7}
        testID={testID}
      >
        {/* Top Row: Route indicator, name, and ETA */}
        <View style={styles.topRow}>
          <View style={styles.routeNameContainer}>
            <RouteIndicator color={routeColor} />
            <Text style={styles.routeName}>
              Route {route.signboard || route.routeId.split('-').pop()}
            </Text>
          </View>
          <Text style={styles.eta}>{route.estimatedTime} min</Text>
        </View>

        {/* Via Stops - with ellipsis truncation */}
        <View style={styles.viaStopsContainer}>
          <Text style={styles.viaStops} numberOfLines={1} ellipsizeMode="tail">
            Via {viaStops}
          </Text>
        </View>

        {/* Bottom Row: Distance and Fare (no vehicle icon) */}
        <View style={styles.bottomRow}>
          <Text style={styles.distance}>{route.calculatedDistance.toFixed(1)} km</Text>
          
          {/* Large Fare Display */}
          <View style={styles.fareContainer}>
            <Text style={styles.fareSymbol}>₱</Text>
            <Text style={styles.fareAmount}>{route.calculatedFare}</Text>
          </View>
        </View>
      </TouchableOpacity>

      {/* Transfer Details Toggle Button */}
      {hasTransfers && (
        <Pressable style={styles.expandButton} onPress={toggleExpand}>
          <Text style={styles.expandButtonText}>
            {isExpanded ? 'Hide Details' : `View ${transferLegs.length} Transfers`}
          </Text>
          {isExpanded ? (
            <ChevronUp size={16} color={COLORS.paraBrand} />
          ) : (
            <ChevronDown size={16} color={COLORS.paraBrand} />
          )}
        </Pressable>
      )}

      {/* Expanded Transfer Details */}
      {isExpanded && hasTransfers && (
        <View style={styles.transferDetails}>
          {transferLegs.map((leg, index) => (
            <TransferLegRow
              key={`leg-${index}`}
              leg={leg}
              index={index}
              isLast={index === transferLegs.length - 1}
            />
          ))}
        </View>
      )}
    </View>
  );
};

// =============================================================================
// Styles
// =============================================================================

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  containerSelected: {
    borderColor: COLORS.paraBrand,
    borderWidth: 2,
    backgroundColor: COLORS.lightYellow,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  routeNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  routeIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  routeName: {
    fontFamily: 'Inter',
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textDark,
  },
  eta: {
    fontFamily: 'Inter',
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.textGray,
  },
  viaStopsContainer: {
    marginLeft: 18,
    marginBottom: 12,
    maxWidth: '90%',
  },
  viaStops: {
    fontFamily: 'Inter',
    fontSize: 13,
    color: COLORS.textGray,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  distance: {
    fontFamily: 'Inter',
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.textGray,
  },
  fareContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    backgroundColor: COLORS.paraBrand,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
  },
  fareSymbol: {
    fontFamily: 'Inter',
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.white,
    marginRight: 2,
  },
  fareAmount: {
    fontFamily: 'Inter',
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.white,
  },
  
  // Expand Button
  expandButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 12,
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  expandButtonText: {
    fontFamily: 'Inter',
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.paraBrand,
    marginRight: 4,
  },
  
  // Transfer Details Section
  transferDetails: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  legRow: {
    flexDirection: 'row',
    paddingVertical: 10,
  },
  legRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  legIndicator: {
    width: 4,
    borderRadius: 2,
    marginRight: 12,
  },
  legContent: {
    flex: 1,
  },
  legHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  legVehicleIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  legRouteName: {
    fontFamily: 'Inter',
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textDark,
    flex: 1,
  },
  legPickupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  legPickupText: {
    fontFamily: 'Inter',
    fontSize: 12,
    color: COLORS.textGray,
    marginLeft: 4,
    flex: 1,
  },
  legStats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legStatText: {
    fontFamily: 'Inter',
    fontSize: 12,
    color: COLORS.textGray,
  },
  legStatDot: {
    marginHorizontal: 6,
    color: COLORS.textGray,
  },
  legFare: {
    fontFamily: 'Inter',
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.paraBrand,
  },
});

export default RouteCard;
