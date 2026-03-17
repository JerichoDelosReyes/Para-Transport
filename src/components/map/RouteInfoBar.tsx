/**
 * RouteInfoBar Component
 * 
 * Displays ETA and Distance pills at the top of the route selection drawer.
 * Option C implementation: Shows ETA + Distance (both calculable from backend data).
 * 
 * @module components/map/RouteInfoBar
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../../../components/ui/text';
import { Clock, MapPin } from 'lucide-react-native';

// =============================================================================
// Constants
// =============================================================================

const COLORS = {
  white: '#FFFFFF',
  paraBrand: '#E9AE16',
  textDark: '#1C1B1F',
  textGray: '#6B7280',
  border: '#E5E7EB',
  pillBg: '#F3F4F6',
  etaBlue: '#3B82F6',
  distanceGreen: '#10B981',
} as const;

// =============================================================================
// Props
// =============================================================================

export interface RouteInfoBarProps {
  /** Estimated time in minutes */
  eta: number;
  /** Distance in kilometers */
  distance: number;
  /** Custom style for container */
  style?: object;
}

// =============================================================================
// Subcomponents
// =============================================================================

interface InfoPillProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueColor: string;
}

/**
 * Individual info pill showing icon, label, and value
 */
const InfoPill: React.FC<InfoPillProps> = ({ icon, label, value, valueColor }) => (
  <View style={styles.pill}>
    <View style={styles.pillIcon}>{icon}</View>
    <View style={styles.pillContent}>
      <Text style={styles.pillLabel}>{label}</Text>
      <Text style={[styles.pillValue, { color: valueColor }]}>{value}</Text>
    </View>
  </View>
);

// =============================================================================
// Main Component
// =============================================================================

/**
 * RouteInfoBar displays summary information about the selected route.
 * Shows ETA and Distance in pill format.
 * 
 * @example
 * <RouteInfoBar
 *   eta={12}
 *   distance={5.2}
 * />
 */
export const RouteInfoBar: React.FC<RouteInfoBarProps> = ({
  eta,
  distance,
  style,
}) => {
  // Format ETA display
  const etaDisplay = eta >= 60 
    ? `${Math.floor(eta / 60)}h ${eta % 60}m`
    : `${eta} min`;
  
  // Format distance display
  const distanceDisplay = distance >= 10
    ? `${Math.round(distance)} km`
    : `${distance.toFixed(1)} km`;

  return (
    <View style={[styles.container, style]}>
      <InfoPill
        icon={<Clock size={18} color={COLORS.etaBlue} />}
        label="ETA"
        value={etaDisplay}
        valueColor={COLORS.etaBlue}
      />
      <InfoPill
        icon={<MapPin size={18} color={COLORS.distanceGreen} />}
        label="Distance"
        value={distanceDisplay}
        valueColor={COLORS.distanceGreen}
      />
    </View>
  );
};

// =============================================================================
// Styles
// =============================================================================

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.pillBg,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    minWidth: 130,
  },
  pillIcon: {
    marginRight: 10,
  },
  pillContent: {
    alignItems: 'flex-start',
  },
  pillLabel: {
    fontFamily: 'Inter',
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.textGray,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pillValue: {
    fontFamily: 'Inter',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 2,
  },
});

export default RouteInfoBar;
