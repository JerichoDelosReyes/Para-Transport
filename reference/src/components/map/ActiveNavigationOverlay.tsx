/**
 * ActiveNavigationOverlay Component
 * 
 * A gamified "Heads-Up Display" (HUD) for active navigation.
 * Replaces the old DigitalParaOverlay with a quest-style experience.
 * 
 * Features:
 * - Top "Quest" Card: Shows current objective with dynamic icons
 * - Bottom XP Bar: Progress through current segment
 * - Transfer Zone detection with visual feedback
 * - Haptic feedback on segment completion
 * 
 * @module components/map/ActiveNavigationOverlay
 */

import React, { useEffect, useCallback, useMemo, useState } from 'react';
import { StyleSheet, View, TouchableOpacity, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,
  Easing,
  cancelAnimation,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { 
  Navigation, 
  Footprints, 
  Bus, 
  Car,
  MapPin,
  X,
  Trophy,
  Zap,
} from 'lucide-react-native';

import { Text } from '../../../components/ui/text';
import {
  RouteWithDetails,
  RouteStop,
  VehicleType,
  MapCoordinate,
} from '../../types/route';

// =============================================================================
// Constants
// =============================================================================

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const COLORS = {
  white: '#FFFFFF',
  black: '#000000',
  paraBrand: '#E9AE16',
  textDark: '#1C1B1F',
  textLight: '#F9FAFB',
  textGray: '#6B7280',
  greenSuccess: '#10B981',
  yellowWarning: '#F59E0B',
  redAlert: '#EF4444',
  cardBg: 'rgba(255, 255, 255, 0.95)',
  overlay: 'rgba(0, 0, 0, 0.5)',
  progressBg: '#E5E7EB',
  progressFill: '#E9AE16',
} as const;

// Distance threshold for transfer zone (meters)
const TRANSFER_ZONE_RADIUS = 50;

// Distance threshold for auto-advancing to next step (meters)
const STEP_COMPLETE_RADIUS = 20;

// =============================================================================
// Types
// =============================================================================

export type StepType = 'walk' | 'ride' | 'transfer' | 'destination';

export interface NavigationStep {
  /** Step index */
  index: number;
  /** Type of step */
  type: StepType;
  /** Instruction text */
  instruction: string;
  /** Detailed description */
  description?: string;
  /** Vehicle type (if ride step) */
  vehicleType?: VehicleType;
  /** Route name (if ride step) */
  routeName?: string;
  /** Start coordinate */
  startCoord: MapCoordinate;
  /** End coordinate */
  endCoord: MapCoordinate;
  /** Distance in meters */
  distance: number;
  /** Estimated time in minutes */
  estimatedTime?: number;
}

export interface ActiveNavigationOverlayProps {
  /** Whether navigation is active */
  isActive: boolean;
  /** Current user location */
  userLocation: MapCoordinate | null;
  /** The route being navigated */
  route: RouteWithDetails;
  /** Destination name */
  destinationName: string;
  /** Navigation steps derived from route */
  steps: NavigationStep[];
  /** Current step index */
  currentStepIndex: number;
  /** Distance to current step end in meters */
  distanceToStepEnd: number;
  /** Progress through current step (0-1) */
  stepProgress: number;
  /** Whether in transfer zone */
  isInTransferZone: boolean;
  /** Total XP earned this trip */
  tripXP?: number;
  /** Callback when user exits navigation */
  onExit: () => void;
  /** Callback when step is completed */
  onStepComplete?: (stepIndex: number) => void;
}

// =============================================================================
// Step Icon Component
// =============================================================================

interface StepIconProps {
  type: StepType;
  vehicleType?: VehicleType;
  size?: number;
  color?: string;
  isAnimating?: boolean;
}

const StepIcon: React.FC<StepIconProps> = ({
  type,
  vehicleType,
  size = 32,
  color = COLORS.textDark,
  isAnimating = false,
}) => {
  // Animated pulse for transfer zone
  const pulseAnim = useSharedValue(1);

  useEffect(() => {
    if (isAnimating) {
      pulseAnim.value = withRepeat(
        withSequence(
          withTiming(1.2, { duration: 500 }),
          withTiming(1, { duration: 500 })
        ),
        -1,
        true
      );
    } else {
      cancelAnimation(pulseAnim);
      pulseAnim.value = 1;
    }
  }, [isAnimating]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseAnim.value }],
  }));

  const getIcon = () => {
    switch (type) {
      case 'walk':
        return <Footprints size={size} color={color} />;
      case 'ride':
        if (vehicleType === 'bus') {
          return <Bus size={size} color={color} />;
        }
        // Default to jeepney-style icon (using Car as closest)
        return <Car size={size} color={color} />;
      case 'transfer':
        return <Navigation size={size} color={color} />;
      case 'destination':
        return <MapPin size={size} color={color} />;
      default:
        return <Navigation size={size} color={color} />;
    }
  };

  return (
    <Animated.View style={animatedStyle}>
      {getIcon()}
    </Animated.View>
  );
};

// =============================================================================
// Progress Bar Component
// =============================================================================

interface ProgressBarProps {
  progress: number; // 0 to 1
  label?: string;
  showXP?: boolean;
  xpAmount?: number;
}

const ProgressBar: React.FC<ProgressBarProps> = ({
  progress,
  label = 'Segment Progress',
  showXP = false,
  xpAmount = 0,
}) => {
  const progressWidth = useSharedValue(0);

  useEffect(() => {
    progressWidth.value = withSpring(Math.min(Math.max(progress, 0), 1) * 100, {
      damping: 15,
      stiffness: 100,
    });
  }, [progress]);

  const animatedProgressStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value}%`,
  }));

  return (
    <View style={styles.progressContainer}>
      <View style={styles.progressHeader}>
        <Text style={styles.progressLabel}>{label}</Text>
        {showXP && (
          <View style={styles.xpBadge}>
            <Zap size={14} color={COLORS.paraBrand} />
            <Text style={styles.xpText}>{xpAmount} XP</Text>
          </View>
        )}
      </View>
      <View style={styles.progressTrack}>
        <Animated.View style={[styles.progressFill, animatedProgressStyle]} />
      </View>
      <Text style={styles.progressPercent}>{Math.round(progress * 100)}%</Text>
    </View>
  );
};

// =============================================================================
// Main Component
// =============================================================================

export const ActiveNavigationOverlay: React.FC<ActiveNavigationOverlayProps> = ({
  isActive,
  userLocation,
  route,
  destinationName,
  steps,
  currentStepIndex,
  distanceToStepEnd,
  stepProgress,
  isInTransferZone,
  tripXP = 0,
  onExit,
  onStepComplete,
}) => {
  const insets = useSafeAreaInsets();
  const [lastCompletedStep, setLastCompletedStep] = useState(-1);

  // Get current step
  const currentStep = steps[currentStepIndex];
  const isLastStep = currentStepIndex === steps.length - 1;

  // Card background animation for transfer zone
  const cardBgAnim = useSharedValue(0);

  useEffect(() => {
    if (isInTransferZone) {
      cardBgAnim.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 800 }),
          withTiming(0, { duration: 800 })
        ),
        -1,
        true
      );
    } else {
      cancelAnimation(cardBgAnim);
      cardBgAnim.value = 0;
    }
  }, [isInTransferZone]);

  const animatedCardStyle = useAnimatedStyle(() => {
    const backgroundColor = interpolate(
      cardBgAnim.value,
      [0, 1],
      [0, 1]
    );
    
    return {
      backgroundColor: isInTransferZone
        ? `rgba(233, 174, 22, ${0.95 + backgroundColor * 0.05})`
        : COLORS.cardBg,
    };
  });

  // Haptic feedback on step completion
  useEffect(() => {
    if (currentStepIndex > lastCompletedStep && lastCompletedStep >= 0) {
      // Trigger success haptic
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setLastCompletedStep(currentStepIndex);
      onStepComplete?.(currentStepIndex - 1);
    } else if (lastCompletedStep === -1 && currentStepIndex === 0) {
      setLastCompletedStep(0);
    }
  }, [currentStepIndex, lastCompletedStep, onStepComplete]);

  // Format distance
  const formatDistance = (meters: number): string => {
    if (meters < 1000) {
      return `${Math.round(meters)}m`;
    }
    return `${(meters / 1000).toFixed(1)}km`;
  };

  // Don't render if not active
  if (!isActive || !currentStep) {
    return null;
  }

  return (
    <View style={styles.container} pointerEvents="box-none">
      {/* Top Quest Card */}
      <Animated.View 
        style={[
          styles.topCard, 
          { marginTop: insets.top + 60 }, // Below search bar
          animatedCardStyle,
        ]}
      >
        <View style={styles.topCardContent}>
          {/* Icon */}
          <View style={[
            styles.iconContainer,
            isInTransferZone && styles.iconContainerHighlight,
          ]}>
            <StepIcon
              type={currentStep.type}
              vehicleType={currentStep.vehicleType}
              size={36}
              color={isInTransferZone ? COLORS.white : COLORS.paraBrand}
              isAnimating={isInTransferZone}
            />
          </View>

          {/* Text Content */}
          <View style={styles.topCardText}>
            <Text style={[
              styles.instructionText,
              isInTransferZone && styles.instructionTextHighlight,
            ]}>
              {currentStep.instruction}
            </Text>
            {currentStep.description && (
              <Text style={[
                styles.descriptionText,
                isInTransferZone && styles.descriptionTextHighlight,
              ]}>
                {currentStep.description}
              </Text>
            )}
            <Text style={[
              styles.distanceText,
              isInTransferZone && styles.distanceTextHighlight,
            ]}>
              {formatDistance(distanceToStepEnd)} remaining
              {currentStep.estimatedTime && ` • ${currentStep.estimatedTime} min`}
            </Text>
          </View>
        </View>

        {/* Step indicator */}
        <View style={styles.stepIndicator}>
          <Text style={[
            styles.stepIndicatorText,
            isInTransferZone && styles.stepIndicatorTextHighlight,
          ]}>
            Step {currentStepIndex + 1} of {steps.length}
          </Text>
        </View>
      </Animated.View>

      {/* Bottom XP Bar Card - positioned above tab bar (80px) to cover attributions */}
      <View style={[styles.bottomCard, { marginBottom: 80 }]}>
        {/* Progress Bar */}
        <ProgressBar
          progress={stepProgress}
          label="Segment Progress"
          showXP={true}
          xpAmount={tripXP}
        />

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Distance Left</Text>
            <Text style={styles.statValue}>{formatDistance(distanceToStepEnd)}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Destination</Text>
            <Text style={styles.statValue} numberOfLines={1}>
              {destinationName}
            </Text>
          </View>
        </View>

        {/* End Trip Button */}
        <TouchableOpacity
          style={styles.endTripButton}
          onPress={onExit}
          activeOpacity={0.7}
        >
          <X size={18} color={COLORS.white} />
          <Text style={styles.endTripText}>End Trip</Text>
        </TouchableOpacity>
      </View>

      {/* Celebration overlay when reaching destination */}
      {isLastStep && distanceToStepEnd < STEP_COMPLETE_RADIUS && (
        <View style={styles.celebrationOverlay}>
          <Trophy size={64} color={COLORS.paraBrand} />
          <Text style={styles.celebrationText}>You've Arrived!</Text>
          <Text style={styles.celebrationSubtext}>+{tripXP} XP Earned</Text>
        </View>
      )}
    </View>
  );
};

// =============================================================================
// Hook: useNavigationSteps
// =============================================================================

/**
 * Derives navigation steps from route stops
 */
export const useNavigationSteps = (
  route: RouteWithDetails | null,
  destinationName: string
): NavigationStep[] => {
  return useMemo(() => {
    if (!route?.stops || route.stops.length === 0) {
      return [];
    }

    const steps: NavigationStep[] = [];
    const stops = route.stops;

    // Create steps from stops
    stops.forEach((stop, index) => {
      const isFirst = index === 0;
      const isLast = index === stops.length - 1;
      const nextStop = stops[index + 1];

      // Calculate distance to next stop (rough estimate)
      const distance = nextStop
        ? calculateDistanceBetweenCoords(
            { latitude: stop.coordinate[1], longitude: stop.coordinate[0] },
            { latitude: nextStop.coordinate[1], longitude: nextStop.coordinate[0] }
          )
        : 0;

      if (isFirst) {
        // First step: Board the vehicle
        steps.push({
          index: steps.length,
          type: 'ride',
          instruction: `Board ${route.routeName || 'Jeepney'}`,
          description: `at ${stop.name}`,
          vehicleType: route.vehicleType,
          routeName: route.routeName,
          startCoord: { latitude: stop.coordinate[1], longitude: stop.coordinate[0] },
          endCoord: nextStop 
            ? { latitude: nextStop.coordinate[1], longitude: nextStop.coordinate[0] }
            : { latitude: stop.coordinate[1], longitude: stop.coordinate[0] },
          distance,
          estimatedTime: Math.ceil(distance / 500), // ~30km/h avg
        });
      } else if (isLast) {
        // Last step: Arrive at destination
        steps.push({
          index: steps.length,
          type: 'destination',
          instruction: `Arrive at ${destinationName}`,
          description: `Near ${stop.name}`,
          startCoord: { latitude: stops[index - 1].coordinate[1], longitude: stops[index - 1].coordinate[0] },
          endCoord: { latitude: stop.coordinate[1], longitude: stop.coordinate[0] },
          distance: 0,
          estimatedTime: 0,
        });
      } else if (stop.isMajor) {
        // Major stop: Potential transfer point
        steps.push({
          index: steps.length,
          type: 'transfer',
          instruction: `Passing ${stop.name}`,
          description: 'Major landmark',
          startCoord: { latitude: stop.coordinate[1], longitude: stop.coordinate[0] },
          endCoord: nextStop
            ? { latitude: nextStop.coordinate[1], longitude: nextStop.coordinate[0] }
            : { latitude: stop.coordinate[1], longitude: stop.coordinate[0] },
          distance,
          estimatedTime: Math.ceil(distance / 500),
        });
      }
    });

    return steps;
  }, [route, destinationName]);
};

/**
 * Calculate distance between two coordinates using Haversine formula
 */
const calculateDistanceBetweenCoords = (
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
// Hook: useNavigationState
// =============================================================================

export interface NavigationState {
  currentStepIndex: number;
  distanceToStepEnd: number;
  stepProgress: number;
  isInTransferZone: boolean;
  tripXP: number;
}

/**
 * Manages navigation state based on user location and steps
 */
export const useNavigationState = (
  userLocation: MapCoordinate | null,
  steps: NavigationStep[],
  isNavigating: boolean
): NavigationState => {
  const [state, setState] = useState<NavigationState>({
    currentStepIndex: 0,
    distanceToStepEnd: 0,
    stepProgress: 0,
    isInTransferZone: false,
    tripXP: 0,
  });

  useEffect(() => {
    if (!isNavigating || !userLocation || steps.length === 0) {
      return;
    }

    const currentStep = steps[state.currentStepIndex];
    if (!currentStep) return;

    // Calculate distance to step end
    const distanceToEnd = calculateDistanceBetweenCoords(
      userLocation,
      currentStep.endCoord
    );

    // Calculate progress (0-1)
    const totalDistance = currentStep.distance || 100;
    const progress = Math.max(0, Math.min(1, 1 - distanceToEnd / totalDistance));

    // Check if in transfer zone
    const isInZone = distanceToEnd < TRANSFER_ZONE_RADIUS;

    // Check if should advance to next step
    const shouldAdvance = distanceToEnd < STEP_COMPLETE_RADIUS && 
                          state.currentStepIndex < steps.length - 1;

    setState(prev => {
      const newIndex = shouldAdvance ? prev.currentStepIndex + 1 : prev.currentStepIndex;
      const xpGain = shouldAdvance ? 10 : 0; // 10 XP per step completed

      return {
        currentStepIndex: newIndex,
        distanceToStepEnd: distanceToEnd,
        stepProgress: progress,
        isInTransferZone: isInZone,
        tripXP: prev.tripXP + xpGain,
      };
    });
  }, [userLocation, steps, isNavigating, state.currentStepIndex]);

  // Reset state when navigation stops
  useEffect(() => {
    if (!isNavigating) {
      setState({
        currentStepIndex: 0,
        distanceToStepEnd: 0,
        stepProgress: 0,
        isInTransferZone: false,
        tripXP: 0,
      });
    }
  }, [isNavigating]);

  return state;
};

// =============================================================================
// Styles
// =============================================================================

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },
  
  // Top Card
  topCard: {
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  topCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(233, 174, 22, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  iconContainerHighlight: {
    backgroundColor: COLORS.paraBrand,
  },
  topCardText: {
    flex: 1,
  },
  instructionText: {
    fontFamily: 'QuiapoFree2-Regular',
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textDark,
    marginBottom: 4,
  },
  instructionTextHighlight: {
    color: COLORS.textDark,
  },
  descriptionText: {
    fontFamily: 'Inter',
    fontSize: 14,
    color: COLORS.textGray,
    marginBottom: 4,
  },
  descriptionTextHighlight: {
    color: COLORS.textDark,
  },
  distanceText: {
    fontFamily: 'Inter',
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.paraBrand,
  },
  distanceTextHighlight: {
    color: COLORS.textDark,
  },
  stepIndicator: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
  },
  stepIndicatorText: {
    fontFamily: 'Inter',
    fontSize: 12,
    color: COLORS.textGray,
    textAlign: 'center',
  },
  stepIndicatorTextHighlight: {
    color: COLORS.textDark,
  },

  // Bottom Card
  bottomCard: {
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 16,
    backgroundColor: COLORS.cardBg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },

  // Progress Bar
  progressContainer: {
    marginBottom: 16,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressLabel: {
    fontFamily: 'Inter',
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.textGray,
  },
  xpBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(233, 174, 22, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  xpText: {
    fontFamily: 'Inter',
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.paraBrand,
    marginLeft: 4,
  },
  progressTrack: {
    height: 8,
    backgroundColor: COLORS.progressBg,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.progressFill,
    borderRadius: 4,
  },
  progressPercent: {
    fontFamily: 'Inter',
    fontSize: 11,
    color: COLORS.textGray,
    textAlign: 'right',
    marginTop: 4,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  statItem: {
    flex: 1,
  },
  statLabel: {
    fontFamily: 'Inter',
    fontSize: 11,
    color: COLORS.textGray,
    marginBottom: 2,
  },
  statValue: {
    fontFamily: 'Inter',
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textDark,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    marginHorizontal: 16,
  },

  // End Trip Button
  endTripButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.redAlert,
    paddingVertical: 12,
    borderRadius: 12,
  },
  endTripText: {
    fontFamily: 'Inter',
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.white,
    marginLeft: 8,
  },

  // Celebration
  celebrationOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  celebrationText: {
    fontFamily: 'QuiapoFree2-Regular',
    fontSize: 32,
    fontWeight: '700',
    color: COLORS.textDark,
    marginTop: 16,
  },
  celebrationSubtext: {
    fontFamily: 'Inter',
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.paraBrand,
    marginTop: 8,
  },
});

export default ActiveNavigationOverlay;
