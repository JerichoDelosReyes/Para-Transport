/**
 * UserLocationMarker Component
 * 
 * Renders the user's current location as a "Blue Dot" marker on the map.
 * NAV-003: User location visualization
 * 
 * @module components/map/UserLocationMarker
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Marker, Circle } from 'react-native-maps';
import type { MapCoordinate } from '../../utils/geoUtils';

/**
 * Props for UserLocationMarker component
 */
export interface UserLocationMarkerProps {
  /** User's current coordinates */
  coordinate: MapCoordinate;
  /** Accuracy radius in meters (optional) */
  accuracy?: number | null;
  /** User's heading/bearing in degrees (optional) */
  heading?: number | null;
  /** Whether to show the accuracy circle */
  showAccuracyCircle?: boolean;
  /** Custom z-index for marker layering */
  zIndex?: number;
}

/**
 * Blue dot marker showing user's current location
 * 
 * Features:
 * - Pulsing blue dot for visibility
 * - Optional accuracy circle showing GPS precision
 * - Heading indicator when available
 * 
 * @param props - UserLocationMarkerProps
 * @returns React component
 * 
 * @example
 * ```tsx
 * <UserLocationMarker
 *   coordinate={{ latitude: 14.4296, longitude: 120.9367 }}
 *   accuracy={10}
 *   showAccuracyCircle={true}
 * />
 * ```
 */
export const UserLocationMarker: React.FC<UserLocationMarkerProps> = ({
  coordinate,
  accuracy,
  heading,
  showAccuracyCircle = true,
  zIndex = 999,
}) => {
  // Don't render accuracy circle if accuracy is null or very large (> 100m)
  const shouldShowAccuracy = showAccuracyCircle && accuracy && accuracy < 100;

  return (
    <>
      {/* Accuracy Circle */}
      {shouldShowAccuracy && (
        <Circle
          center={coordinate}
          radius={accuracy}
          strokeColor="rgba(66, 133, 244, 0.3)"
          fillColor="rgba(66, 133, 244, 0.1)"
          strokeWidth={1}
          zIndex={zIndex - 1}
        />
      )}

      {/* User Location Marker (Blue Dot) */}
      <Marker
        coordinate={coordinate}
        anchor={{ x: 0.5, y: 0.5 }}
        flat={true}
        rotation={heading ?? 0}
        zIndex={zIndex}
        tracksViewChanges={false} // Performance optimization
      >
        <View style={styles.markerContainer}>
          {/* Outer ring (pulse effect background) */}
          <View style={styles.outerRing} />
          
          {/* Inner blue dot */}
          <View style={styles.innerDot}>
            {/* White center highlight */}
            <View style={styles.centerHighlight} />
          </View>

          {/* Heading indicator arrow (when heading is available) */}
          {heading !== null && heading !== undefined && (
            <View style={[styles.headingArrow, { transform: [{ rotate: `${heading}deg` }] }]} />
          )}
        </View>
      </Marker>
    </>
  );
};

const styles = StyleSheet.create({
  markerContainer: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outerRing: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(66, 133, 244, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(66, 133, 244, 0.4)',
  },
  innerDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#4285F4', // Google Blue
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    // Shadow for depth
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 4,
  },
  centerHighlight: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    marginTop: -2,
    marginLeft: -2,
  },
  headingArrow: {
    position: 'absolute',
    top: -8,
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderBottomWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#4285F4',
  },
});

export default UserLocationMarker;
