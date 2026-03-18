/**
 * FareCalculatorScreen (Fare Tab)
 * 
 * Dedicated fare calculator page for checking fares without booking.
 * Displays fare breakdown based on LTFRB/LGU matrix.
 * 
 * Formula: Base ₱13.00 (first 4km) + ₱1.80/km thereafter
 * 
 * @module screens/main/FareCalculatorScreen
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  ScrollView,
  View,
  TextInput,
  Pressable,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  MapPin,
  Navigation,
  Calculator,
  Info,
  AlertCircle,
  X,
} from 'lucide-react-native';

// Services
import { calculateFareBetween, FareResult } from '../../services/fareService';
import { searchSupportedLocations, getSupportedLocations } from '../../services/routeSearch';

// Gluestack UI Components
import { Box } from '../../../components/ui/box';
import { Text } from '../../../components/ui/text';
import { VStack } from '../../../components/ui/vstack';
import { HStack } from '../../../components/ui/hstack';

// =============================================================================
// Constants
// =============================================================================

/**
 * Brand color tokens (matching gluestack-ui.config.ts and Figma)
 */
const COLORS = {
  white: '#FFFFFF',
  paraBrand: '#E9AE16',
  paraBrandLight: '#FFF8E7',
  black: '#1C1B1F',
  grayLight: '#EFF1F5',
  grayMedium: '#A09CAB',
  textDark900: '#181818',
  textDark: '#1C1B1F',
  border: '#E5E7EB',
  textGray: '#374151',
  success: '#10B981',
} as const;

/**
 * Fare calculation constants (from backend/services/spatialFilter.js)
 * Based on LTFRB/LGU authorized rates
 */
const FARE_CONFIG = {
  baseFare: 13, // PHP - First 4km
  baseDistance: 4, // kilometers
  farePerKm: 1.8, // PHP per km after base
} as const;

// =============================================================================
// Types
// =============================================================================

export interface FareCalculatorScreenProps {
  navigation?: {
    navigate: (screen: string, params?: object) => void;
    goBack: () => void;
  };
}

interface FareBreakdown {
  baseFare: number;
  distance: number;
  additionalDistance: number;
  additionalFare: number;
  totalFare: number;
}

/**
 * Extended fare result with route info (from FareService)
 */
interface ExtendedFareResult extends FareBreakdown {
  routeName?: string;
  originName?: string;
  destinationName?: string;
}

/**
 * Error modal state
 */
interface ErrorModalState {
  visible: boolean;
  title: string;
  message: string;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Calculates the fare based on distance
 * Formula: baseFare + ((distance - 4km) * farePerKm) for distance > 4km
 * Mirrors backend/services/spatialFilter.js calculateFare function
 * 
 * @param distance - Distance in kilometers
 * @returns Fare breakdown object
 */
const calculateFare = (distance: number): FareBreakdown => {
  const { baseFare, baseDistance, farePerKm } = FARE_CONFIG;

  if (distance <= 0) {
    return {
      baseFare,
      distance: 0,
      additionalDistance: 0,
      additionalFare: 0,
      totalFare: baseFare,
    };
  }

  if (distance <= baseDistance) {
    return {
      baseFare,
      distance,
      additionalDistance: 0,
      additionalFare: 0,
      totalFare: baseFare,
    };
  }

  const additionalDistance = distance - baseDistance;
  const additionalFare = additionalDistance * farePerKm;
  const totalFare = Math.ceil(baseFare + additionalFare); // Round up to nearest peso

  return {
    baseFare,
    distance,
    additionalDistance,
    additionalFare,
    totalFare,
  };
};

/**
 * Format currency in Philippine Peso
 */
const formatPeso = (amount: number): string => {
  return `₱${amount.toFixed(2)}`;
};

// =============================================================================
// Components
// =============================================================================

/**
 * Header with brand styling
 */
const Header: React.FC = () => (
  <SafeAreaView edges={['top']} style={styles.headerSafeArea}>
    <VStack style={styles.headerContainer}>
      <Text style={styles.headerTitle}>Fare Matrix</Text>
      <Text style={styles.headerSubtitle}>PUV Fare Calculator</Text>
    </VStack>
  </SafeAreaView>
);

/**
 * Location input section with suggestions
 */
interface LocationInputProps {
  origin: string;
  destination: string;
  onOriginChange: (text: string) => void;
  onDestinationChange: (text: string) => void;
  onCalculate: () => void;
  isLoading: boolean;
  originSuggestions: string[];
  destinationSuggestions: string[];
  onSelectOriginSuggestion: (location: string) => void;
  onSelectDestinationSuggestion: (location: string) => void;
  showOriginSuggestions: boolean;
  showDestinationSuggestions: boolean;
  onOriginFocus: () => void;
  onOriginBlur: () => void;
  onDestinationFocus: () => void;
  onDestinationBlur: () => void;
}

const LocationInput: React.FC<LocationInputProps> = ({
  origin,
  destination,
  onOriginChange,
  onDestinationChange,
  onCalculate,
  isLoading,
  originSuggestions,
  destinationSuggestions,
  onSelectOriginSuggestion,
  onSelectDestinationSuggestion,
  showOriginSuggestions,
  showDestinationSuggestions,
  onOriginFocus,
  onOriginBlur,
  onDestinationFocus,
  onDestinationBlur,
}) => (
  <VStack style={styles.inputSection}>
    {/* Origin Input - higher z-index so suggestions appear above destination */}
    <VStack style={[styles.inputGroup, { zIndex: 20 }]}>
      <Text style={styles.inputLabel}>Origin</Text>
      <HStack style={styles.inputContainer}>
        <MapPin size={20} color={COLORS.paraBrand} />
        <TextInput
          style={styles.textInput}
          placeholder="e.g. Imus, BDO Imus"
          placeholderTextColor={COLORS.grayMedium}
          value={origin}
          onChangeText={onOriginChange}
          onFocus={onOriginFocus}
          onBlur={onOriginBlur}
          editable={!isLoading}
        />
      </HStack>
      {/* Origin Suggestions */}
      {showOriginSuggestions && originSuggestions.length > 0 && (
        <VStack style={styles.suggestionsContainer}>
          {originSuggestions.map((suggestion, index) => (
            <Pressable
              key={index}
              style={styles.suggestionItem}
              onPress={() => onSelectOriginSuggestion(suggestion)}
            >
              <MapPin size={14} color={COLORS.paraBrand} />
              <Text style={styles.suggestionText}>{suggestion}</Text>
            </Pressable>
          ))}
        </VStack>
      )}
    </VStack>

    {/* Destination Input - lower z-index than origin */}
    <VStack style={[styles.inputGroup, { zIndex: 10 }]}>
      <Text style={styles.inputLabel}>Destination</Text>
      <HStack style={styles.inputContainer}>
        <Navigation size={20} color={COLORS.paraBrand} />
        <TextInput
          style={styles.textInput}
          placeholder="e.g. SM Molino, Robinsons"
          placeholderTextColor={COLORS.grayMedium}
          value={destination}
          onChangeText={onDestinationChange}
          onFocus={onDestinationFocus}
          onBlur={onDestinationBlur}
          editable={!isLoading}
        />
      </HStack>
      {/* Destination Suggestions */}
      {showDestinationSuggestions && destinationSuggestions.length > 0 && (
        <VStack style={styles.suggestionsContainer}>
          {destinationSuggestions.map((suggestion, index) => (
            <Pressable
              key={index}
              style={styles.suggestionItem}
              onPress={() => onSelectDestinationSuggestion(suggestion)}
            >
              <Navigation size={14} color={COLORS.paraBrand} />
              <Text style={styles.suggestionText}>{suggestion}</Text>
            </Pressable>
          ))}
        </VStack>
      )}
    </VStack>

    {/* Calculate Button - Primary CTA */}
    <Pressable
      style={({ pressed }) => [
        styles.calculateButton,
        pressed && styles.calculateButtonPressed,
        isLoading && styles.calculateButtonDisabled,
      ]}
      onPress={onCalculate}
      disabled={isLoading}
    >
      <Text style={styles.calculateButtonText}>
        {isLoading ? 'Calculating...' : 'Calculate Fare'}
      </Text>
    </Pressable>
  </VStack>
);

/**
 * Fare breakdown result card
 */
interface FareResultCardProps {
  breakdown: ExtendedFareResult | null;
}

const FareResultCard: React.FC<FareResultCardProps> = ({ breakdown }) => {
  if (!breakdown) {
    return (
      <Box style={styles.resultCard}>
        <VStack style={styles.emptyResult}>
          <Calculator size={48} color={COLORS.grayMedium} />
          <Text style={styles.emptyResultText}>
            Enter origin and destination to calculate fare
          </Text>
        </VStack>
      </Box>
    );
  }

  return (
    <VStack style={styles.resultCard}>
      {/* Route Info - if available */}
      {breakdown.routeName && (
        <View style={styles.routeInfoBadge}>
          <Text style={styles.routeInfoText}>
            🚐 {breakdown.routeName}
          </Text>
        </View>
      )}

      {/* Total Fare - Large Display */}
      <VStack style={styles.totalFareSection}>
        <Text style={styles.totalFareLabel}>Estimated Fare</Text>
        <Text style={styles.totalFareAmount}>
          {formatPeso(breakdown.totalFare)}
        </Text>
        <Text style={styles.distanceText}>
          {breakdown.originName && breakdown.destinationName
            ? `${breakdown.originName} → ${breakdown.destinationName}`
            : `for ${breakdown.distance.toFixed(1)} km`}
        </Text>
        {breakdown.originName && breakdown.destinationName && (
          <Text style={styles.distanceSubtext}>
            {breakdown.distance.toFixed(1)} km
          </Text>
        )}
      </VStack>

      {/* Divider */}
      <View style={styles.resultDivider} />

      {/* Fare Breakdown */}
      <VStack style={styles.breakdownSection}>
        <Text style={styles.breakdownTitle}>Fare Breakdown</Text>

        {/* Base Fare */}
        <HStack style={styles.breakdownRow}>
          <Text style={styles.breakdownLabel}>
            Base Fare (First {FARE_CONFIG.baseDistance}km)
          </Text>
          <Text style={styles.breakdownValue}>
            {formatPeso(breakdown.baseFare)}
          </Text>
        </HStack>

        {/* Additional Distance */}
        {breakdown.additionalDistance > 0 && (
          <HStack style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>
              Additional ({breakdown.additionalDistance.toFixed(1)}km × {formatPeso(FARE_CONFIG.farePerKm)})
            </Text>
            <Text style={styles.breakdownValue}>
              {formatPeso(breakdown.additionalFare)}
            </Text>
          </HStack>
        )}

        {/* Divider */}
        <View style={styles.breakdownDivider} />

        {/* Total */}
        <HStack style={styles.breakdownRow}>
          <Text style={styles.breakdownTotalLabel}>Total</Text>
          <Text style={styles.breakdownTotalValue}>
            {formatPeso(breakdown.totalFare)}
          </Text>
        </HStack>
      </VStack>
    </VStack>
  );
};

/**
 * Info footer with rate source
 */
const InfoFooter: React.FC = () => (
  <HStack style={styles.infoFooter}>
    <Info size={16} color={COLORS.textGray} />
    <Text style={styles.infoText}>
      Rates Implemention is still in development. Actual fare may vary based on route and vehicle type.
    </Text>
  </HStack>
);

/**
 * Themed Error Modal Component
 */
interface ErrorModalProps {
  visible: boolean;
  title: string;
  message: string;
  onClose: () => void;
}

const ErrorModal: React.FC<ErrorModalProps> = ({
  visible,
  title,
  message,
  onClose,
}) => (
  <Modal
    visible={visible}
    transparent
    animationType="fade"
    onRequestClose={onClose}
  >
    <View style={styles.modalOverlay}>
      <View style={styles.modalContainer}>
        {/* Close Button */}
        <Pressable style={styles.modalCloseButton} onPress={onClose}>
          <X size={24} color={COLORS.textGray} />
        </Pressable>

        {/* Icon */}
        <View style={styles.modalIconContainer}>
          <AlertCircle size={48} color={COLORS.paraBrand} />
        </View>

        {/* Title */}
        <Text style={styles.modalTitle}>{title}</Text>

        {/* Message */}
        <Text style={styles.modalMessage}>{message}</Text>

        {/* Action Button */}
        <Pressable
          style={({ pressed }) => [
            styles.modalButton,
            pressed && styles.modalButtonPressed,
          ]}
          onPress={onClose}
        >
          <Text style={styles.modalButtonText}>Got it</Text>
        </Pressable>
      </View>
    </View>
  </Modal>
);

/**
 * Quick fare reference card
 */
const QuickReference: React.FC = () => (
  <VStack style={styles.quickRefCard}>
    <Text style={styles.quickRefTitle}>Quick Reference</Text>
    <HStack style={styles.quickRefRow}>
      <VStack style={styles.quickRefItem}>
        <Text style={styles.quickRefValue}>{formatPeso(FARE_CONFIG.baseFare)}</Text>
        <Text style={styles.quickRefLabel}>First {FARE_CONFIG.baseDistance}km</Text>
      </VStack>
      <View style={styles.quickRefDivider} />
      <VStack style={styles.quickRefItem}>
        <Text style={styles.quickRefValue}>{formatPeso(FARE_CONFIG.farePerKm)}</Text>
        <Text style={styles.quickRefLabel}>Per km after</Text>
      </VStack>
    </HStack>
  </VStack>
);

// =============================================================================
// Main Component
// =============================================================================

export const FareCalculatorScreen: React.FC<FareCalculatorScreenProps> = ({ navigation }) => {
  // Input state
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  
  // Loading state
  const [isLoading, setIsLoading] = useState(false);
  
  // Result state
  const [fareResult, setFareResult] = useState<ExtendedFareResult | null>(null);

  // Error modal state
  const [errorModal, setErrorModal] = useState<ErrorModalState>({
    visible: false,
    title: '',
    message: '',
  });

  // Compute suggestions based on input
  const originSuggestions = useMemo(() => {
    if (origin.length < 2) return [];
    return searchSupportedLocations(origin, 4);
  }, [origin]);

  const destinationSuggestions = useMemo(() => {
    if (destination.length < 2) return [];
    return searchSupportedLocations(destination, 4);
  }, [destination]);

  // Track focus state for showing/hiding suggestions
  const [originFocused, setOriginFocused] = useState(false);
  const [destinationFocused, setDestinationFocused] = useState(false);

  // Determine if suggestions should be shown
  // Hide if: not focused, or input exactly matches a suggestion
  const showOriginSuggestions = useMemo(() => {
    if (!originFocused) return false;
    // Hide if input exactly matches a known location (case-insensitive)
    const exactMatch = originSuggestions.some(
      (s) => s.toLowerCase() === origin.toLowerCase()
    );
    return !exactMatch;
  }, [originFocused, origin, originSuggestions]);

  const showDestinationSuggestions = useMemo(() => {
    if (!destinationFocused) return false;
    // Hide if input exactly matches a known location (case-insensitive)
    const exactMatch = destinationSuggestions.some(
      (s) => s.toLowerCase() === destination.toLowerCase()
    );
    return !exactMatch;
  }, [destinationFocused, destination, destinationSuggestions]);

  /**
   * Handle selecting an origin suggestion
   */
  const handleSelectOriginSuggestion = useCallback((location: string) => {
    setOrigin(location);
    setOriginFocused(false); // Hide suggestions after selection
    Keyboard.dismiss();
  }, []);

  /**
   * Handle selecting a destination suggestion
   */
  const handleSelectDestinationSuggestion = useCallback((location: string) => {
    setDestination(location);
    setDestinationFocused(false); // Hide suggestions after selection
    Keyboard.dismiss();
  }, []);

  /**
   * Show themed error modal
   */
  const showError = useCallback((title: string, message: string) => {
    setErrorModal({
      visible: true,
      title,
      message,
    });
  }, []);

  /**
   * Close error modal
   */
  const closeErrorModal = useCallback(() => {
    setErrorModal((prev) => ({ ...prev, visible: false }));
  }, []);

  /**
   * Handle fare calculation using FareService
   */
  const handleCalculate = useCallback(async () => {
    Keyboard.dismiss();
    
    // Validate inputs
    if (!origin.trim() || !destination.trim()) {
      showError(
        'Missing Information',
        'Please enter both origin and destination to calculate fare.'
      );
      return;
    }

    setIsLoading(true);
    setFareResult(null);

    try {
      // Call FareService
      const result = await calculateFareBetween({
        origin: origin.trim(),
        destination: destination.trim(),
      });

      if (result.success) {
        // Map response to local FareBreakdown format
        const { data } = result;
        setFareResult({
          baseFare: data.breakdown.baseFare,
          distance: data.distance,
          additionalDistance: data.breakdown.additionalDistance,
          additionalFare: data.breakdown.additionalFare,
          totalFare: data.breakdown.totalFare,
          routeName: data.route.routeName,
          originName: data.originName,
          destinationName: data.destinationName,
        });
      } else {
        // Show error modal with appropriate message
        const errorTitles: Record<string, string> = {
          GEOCODING_FAILED: 'Location Not Found',
          NO_ROUTE_FOUND: 'No Route Available',
          INVALID_INPUT: 'Invalid Input',
          NETWORK_ERROR: 'Connection Error',
          UNKNOWN_ERROR: 'Oops!',
        };
        
        const errorResult = result as { success: false; error: { code: string; message: string } };
        showError(
          errorTitles[errorResult.error.code] || 'Error',
          errorResult.error.message
        );
      }
    } catch (error) {
      console.error('[FareCalculatorScreen] Error:', error);
      showError(
        'Something Went Wrong',
        'Please try again later.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [origin, destination, showError]);

  return (
    <Box style={styles.container}>
      <Header />
      
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Quick Reference */}
          <QuickReference />

          {/* Input Section */}
          <LocationInput
            origin={origin}
            destination={destination}
            onOriginChange={setOrigin}
            onDestinationChange={setDestination}
            onCalculate={handleCalculate}
            isLoading={isLoading}
            originSuggestions={originSuggestions}
            destinationSuggestions={destinationSuggestions}
            onSelectOriginSuggestion={handleSelectOriginSuggestion}
            onSelectDestinationSuggestion={handleSelectDestinationSuggestion}
            showOriginSuggestions={showOriginSuggestions}
            showDestinationSuggestions={showDestinationSuggestions}
            onOriginFocus={() => setOriginFocused(true)}
            onOriginBlur={() => setTimeout(() => setOriginFocused(false), 150)}
            onDestinationFocus={() => setDestinationFocused(true)}
            onDestinationBlur={() => setTimeout(() => setDestinationFocused(false), 150)}
          />

          {/* Result Section */}
          <FareResultCard breakdown={fareResult} />

          {/* Info Footer */}
          <InfoFooter />

          {/* Bottom Spacer */}
          <View style={styles.bottomSpacer} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Error Modal */}
      <ErrorModal
        visible={errorModal.visible}
        title={errorModal.title}
        message={errorModal.message}
        onClose={closeErrorModal}
      />
    </Box>
  );
};

// =============================================================================
// Styles
// =============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },

  // Header Styles
  headerSafeArea: {
    backgroundColor: COLORS.paraBrand,
  },
  headerContainer: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: 'CubaoFree2-Regular',
    fontSize: 28,
    lineHeight: 36,
    color: COLORS.black,
  },
  headerSubtitle: {
    fontFamily: 'Inter',
    fontSize: 14,
    color: COLORS.textDark,
    marginTop: 2,
  },

  // Quick Reference Card
  quickRefCard: {
    backgroundColor: COLORS.paraBrandLight,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.paraBrand,
  },
  quickRefTitle: {
    fontFamily: 'Inter',
    fontWeight: '600',
    fontSize: 14,
    color: COLORS.textDark,
    marginBottom: 12,
    textAlign: 'center',
  },
  quickRefRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  quickRefItem: {
    alignItems: 'center',
    flex: 1,
  },
  quickRefValue: {
    fontFamily: 'Inter',
    fontWeight: '700',
    fontSize: 24,
    color: COLORS.textDark900,
  },
  quickRefLabel: {
    fontFamily: 'Inter',
    fontSize: 12,
    color: COLORS.textGray,
    marginTop: 4,
  },
  quickRefDivider: {
    width: 1,
    height: 40,
    backgroundColor: COLORS.paraBrand,
  },

  // Input Section Styles
  inputSection: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  inputGroup: {
    marginBottom: 13,
    position: 'relative',
  },
  inputLabel: {
    fontFamily: 'Inter',
    fontWeight: '600',
    fontSize: 14,
    color: COLORS.textDark,
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.grayLight,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
  },
  textInput: {
    flex: 1,
    fontFamily: 'Inter',
    fontSize: 16,
    color: COLORS.textDark900,
  },
  suggestionsContainer: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 4,
    backgroundColor: COLORS.white,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    zIndex: 100,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.grayLight,
  },
  suggestionText: {
    fontFamily: 'Inter',
    fontSize: 14,
    color: COLORS.textDark,
  },
  calculateButton: {
    marginTop: 20,
  },
  calculateButtonPressed: {
    opacity: 0.9,
  },
  calculateButtonDisabled: {
    opacity: 0.6,
  },
  calculateButtonText: {
    fontFamily: 'Inter',
    fontWeight: '700',
    fontSize: 18,
    color: COLORS.black,
    letterSpacing: 0.5,
    backgroundColor: COLORS.paraBrand,
    borderRadius: 50,
    paddingVertical: 18,
    paddingHorizontal: 32,
    overflow: 'hidden',
    textAlign: 'center',
  },

  // Result Card Styles
  resultCard: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 25,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 1,
    borderWidth: 1,
    zIndex: 1,
    borderColor: COLORS.border,
  },
  emptyResult: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 12,
    
  },
  emptyResultText: {
    fontFamily: 'Inter',
    fontSize: 14,
    color: COLORS.grayMedium,
    textAlign: 'center',
    zIndex:1
  },
  totalFareSection: {
    alignItems: 'center',
    paddingBottom: 16,
  },
  totalFareLabel: {
    fontFamily: 'Inter',
    fontSize: 14,
    color: COLORS.textGray,
    marginBottom: 4,
  },
  totalFareAmount: {
    fontFamily: 'Inter',
    fontWeight: '700',
    fontSize: 56,
    lineHeight: 64,
    color: COLORS.textDark900,
    letterSpacing: -1.5,
  },
  distanceText: {
    fontFamily: 'Inter',
    fontSize: 14,
    color: COLORS.grayMedium,
    marginTop: 4,
  },
  resultDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 16,
  },
  breakdownSection: {
    gap: 8,
  },
  breakdownTitle: {
    fontFamily: 'Inter',
    fontWeight: '600',
    fontSize: 14,
    color: COLORS.textDark,
    marginBottom: 8,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  breakdownLabel: {
    fontFamily: 'Inter',
    fontSize: 14,
    color: COLORS.textGray,
  },
  breakdownValue: {
    fontFamily: 'Inter',
    fontWeight: '500',
    fontSize: 14,
    color: COLORS.textDark,
  },
  breakdownDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 8,
  },
  breakdownTotalLabel: {
    fontFamily: 'Inter',
    fontWeight: '600',
    fontSize: 16,
    color: COLORS.textDark900,
  },
  breakdownTotalValue: {
    fontFamily: 'Inter',
    fontWeight: '700',
    fontSize: 18,
    color: COLORS.paraBrand,
  },

  // Info Footer Styles
  infoFooter: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    backgroundColor: COLORS.grayLight,
    borderRadius: 8,
    gap: 8,
  },
  infoText: {
    flex: 1,
    fontFamily: 'Inter',
    fontSize: 12,
    color: COLORS.textGray,
    lineHeight: 18,
  },

  // Route Info Badge
  routeInfoBadge: {
    backgroundColor: COLORS.paraBrandLight,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
    alignSelf: 'flex-start',
  },
  routeInfoText: {
    fontFamily: 'Inter',
    fontWeight: '600',
    fontSize: 13,
    color: COLORS.textDark,
  },
  distanceSubtext: {
    fontFamily: 'Inter',
    fontSize: 12,
    color: COLORS.grayMedium,
    marginTop: 2,
  },

  // Error Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContainer: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  modalCloseButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    padding: 4,
  },
  modalIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.paraBrandLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontFamily: 'Inter',
    fontWeight: '700',
    fontSize: 20,
    color: COLORS.textDark900,
    textAlign: 'center',
    marginBottom: 8,
  },
  modalMessage: {
    fontFamily: 'Inter',
    fontSize: 15,
    color: COLORS.textGray,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  modalButton: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 50,
    backgroundColor: COLORS.paraBrand,
    alignItems: 'center',
  },
  modalButtonPressed: {
    opacity: 0.9,
  },
  modalButtonText: {
    fontFamily: 'Inter',
    fontWeight: '700',
    fontSize: 16,
    color: COLORS.black,
  },

  // Bottom Spacer
  bottomSpacer: {
    height: 80,
  },
});

export default FareCalculatorScreen;
