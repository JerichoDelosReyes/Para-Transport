/**
 * TransferMarker Component
 * 
 * Map marker and callout showing transfer point information.
 * Displays where users need to switch vehicles.
 * 
 * Based on Figma design showing floating info cards on map.
 * 
 * @module components/map/TransferMarker
 */

import React, { useState } from 'react';
import { StyleSheet, View, TouchableOpacity } from 'react-native';
import { Marker, Callout } from 'react-native-maps';
import { Text } from '../../../components/ui/text';
import {
  TransferPoint,
  MapCoordinate,
  VEHICLE_TYPE_CONFIG,
  toMapCoordinate,
} from '../../types/route';

// =============================================================================
// Constants
// =============================================================================

const COLORS = {
  white: '#FFFFFF',
  paraBrand: '#E9AE16',
  textDark: '#1C1B1F',
  textGray: '#6B7280',
  shadow: 'rgba(0, 0, 0, 0.15)',
  markerBg: '#FFFFFF',
  markerBorder: '#E5E7EB',
} as const;

// =============================================================================
// Props
// =============================================================================

export interface TransferMarkerProps {
  /** Transfer point data */
  transfer: TransferPoint;
  /** Fare for the next leg (optional) */
  fare?: number;
  /** Callback when marker is pressed */
  onPress?: (transfer: TransferPoint) => void;
}

// =============================================================================
// Subcomponents
// =============================================================================

/**
 * Custom marker view showing transfer icon
 */
const MarkerIcon: React.FC<{ fromIcon: string; toIcon: string }> = ({ fromIcon, toIcon }) => (
  <View style={styles.markerContainer}>
    <View style={styles.markerBubble}>
      <Text style={styles.transferIcon}>{fromIcon}</Text>
      <Text style={styles.arrowIcon}>→</Text>
      <Text style={styles.transferIcon}>{toIcon}</Text>
    </View>
    <View style={styles.markerArrow} />
  </View>
);

/**
 * Callout content showing transfer details
 */
interface CalloutContentProps {
  transfer: TransferPoint;
  fare?: number;
}

const CalloutContent: React.FC<CalloutContentProps> = ({ transfer, fare }) => {
  const fromConfig = VEHICLE_TYPE_CONFIG[transfer.fromVehicle] || VEHICLE_TYPE_CONFIG.jeep;
  const toConfig = VEHICLE_TYPE_CONFIG[transfer.toVehicle] || VEHICLE_TYPE_CONFIG.jeep;

  return (
    <View style={styles.calloutContainer}>
      <Text style={styles.calloutTitle}>
        {toConfig.label} to {transfer.name}
      </Text>
      <Text style={styles.calloutSubtitle}>
        {fromConfig.icon} {fromConfig.label} → {toConfig.icon} {toConfig.label}
      </Text>
      {fare && (
        <View style={styles.fareRow}>
          <Text style={styles.fareSymbol}>₱</Text>
          <Text style={styles.fareAmount}>{fare.toFixed(2)}</Text>
        </View>
      )}
      {transfer.walkingDistance && transfer.walkingDistance > 0 && (
        <Text style={styles.walkingText}>
          🚶 {transfer.walkingDistance}m walk
        </Text>
      )}
    </View>
  );
};

// =============================================================================
// Main Component
// =============================================================================

/**
 * TransferMarker displays a transfer point on the map with a custom marker
 * and an info callout showing the vehicle switch details.
 * 
 * @example
 * <TransferMarker
 *   transfer={{
 *     name: "Palengke",
 *     coordinate: [120.9350, 14.4300],
 *     fromVehicle: "trike",
 *     toVehicle: "jeep",
 *   }}
 *   fare={13}
 *   onPress={(t) => console.log('Transfer:', t.name)}
 * />
 */
export const TransferMarker: React.FC<TransferMarkerProps> = ({
  transfer,
  fare,
  onPress,
}) => {
  const coordinate = toMapCoordinate(transfer.coordinate);
  const fromConfig = VEHICLE_TYPE_CONFIG[transfer.fromVehicle] || VEHICLE_TYPE_CONFIG.jeep;
  const toConfig = VEHICLE_TYPE_CONFIG[transfer.toVehicle] || VEHICLE_TYPE_CONFIG.jeep;

  const handlePress = () => {
    onPress?.(transfer);
  };

  return (
    <Marker
      coordinate={coordinate}
      onPress={handlePress}
      anchor={{ x: 0.5, y: 1 }}
      calloutAnchor={{ x: 0.5, y: 0 }}
    >
      <MarkerIcon fromIcon={fromConfig.icon} toIcon={toConfig.icon} />
      <Callout tooltip style={styles.callout}>
        <CalloutContent transfer={transfer} fare={fare} />
      </Callout>
    </Marker>
  );
};

// =============================================================================
// Alternative: Floating Info Card (Non-Callout)
// =============================================================================

export interface FloatingTransferCardProps {
  /** Transfer point data */
  transfer: TransferPoint;
  /** Fare for this leg */
  fare?: number;
  /** Position offset from marker */
  offsetY?: number;
  /** Callback when card is pressed */
  onPress?: (transfer: TransferPoint) => void;
}

/**
 * Alternative floating card that can be positioned independently.
 * Use this when you want more control over the card position.
 */
export const FloatingTransferCard: React.FC<FloatingTransferCardProps> = ({
  transfer,
  fare,
  onPress,
}) => {
  const toConfig = VEHICLE_TYPE_CONFIG[transfer.toVehicle] || VEHICLE_TYPE_CONFIG.jeep;

  return (
    <TouchableOpacity
      style={styles.floatingCard}
      onPress={() => onPress?.(transfer)}
      activeOpacity={0.9}
    >
      <View style={styles.floatingCardContent}>
        <Text style={styles.floatingTitle}>
          {toConfig.label} to {transfer.name}
        </Text>
        <Text style={styles.floatingSubtitle}>
          Lorem ipsum dolor sit amet.
        </Text>
        {fare && (
          <View style={styles.floatingFare}>
            <Text style={styles.floatingFareText}>₱{fare.toFixed(2)}</Text>
          </View>
        )}
      </View>
      <View style={styles.floatingArrow} />
    </TouchableOpacity>
  );
};

// =============================================================================
// Styles
// =============================================================================

const styles = StyleSheet.create({
  // Marker styles
  markerContainer: {
    alignItems: 'center',
  },
  markerBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.markerBg,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 2,
    borderColor: COLORS.paraBrand,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  transferIcon: {
    fontSize: 16,
  },
  arrowIcon: {
    fontSize: 12,
    marginHorizontal: 4,
    color: COLORS.textGray,
  },
  markerArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: COLORS.paraBrand,
    marginTop: -1,
  },

  // Callout styles
  callout: {
    width: 200,
  },
  calloutContainer: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  calloutTitle: {
    fontFamily: 'Inter',
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textDark,
    marginBottom: 4,
  },
  calloutSubtitle: {
    fontFamily: 'Inter',
    fontSize: 12,
    color: COLORS.textGray,
    marginBottom: 8,
  },
  fareRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  fareSymbol: {
    fontFamily: 'Inter',
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.paraBrand,
    marginRight: 1,
  },
  fareAmount: {
    fontFamily: 'Inter',
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  walkingText: {
    fontFamily: 'Inter',
    fontSize: 11,
    color: COLORS.textGray,
    marginTop: 4,
  },

  // Floating card styles (alternative)
  floatingCard: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 12,
    minWidth: 160,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  floatingCardContent: {
    alignItems: 'flex-start',
  },
  floatingTitle: {
    fontFamily: 'Inter',
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textDark,
    marginBottom: 2,
  },
  floatingSubtitle: {
    fontFamily: 'Inter',
    fontSize: 11,
    color: COLORS.textGray,
    marginBottom: 6,
  },
  floatingFare: {
    marginTop: 4,
  },
  floatingFareText: {
    fontFamily: 'Inter',
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  floatingArrow: {
    position: 'absolute',
    bottom: -8,
    left: '50%',
    marginLeft: -8,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: COLORS.white,
  },
});

export default TransferMarker;
