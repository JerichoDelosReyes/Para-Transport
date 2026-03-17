/**
 * SavedTripsScreen (Saved Trips)
 * 
 * Displays user's saved/favorite routes (Home, Work, School, etc.)
 * Fetches data from AuthContext's userPreferencesData (synced with Firestore).
 * Accessible from the Home screen header bookmark icon.
 * 
 * @module screens/main/SavedTripsScreen
 */

import React, { useCallback } from 'react';
import {
  StyleSheet,
  FlatList,
  Pressable,
  View,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Home,
  Briefcase,
  GraduationCap,
  MapPin,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';

// Gluestack UI Components
import { Box } from '../../../components/ui/box';
import { Text } from '../../../components/ui/text';
import { VStack } from '../../../components/ui/vstack';
import { HStack } from '../../../components/ui/hstack';

// Auth Context for user data
import { useAuth } from '../../context/AuthContext';

// Types
import { SavedTrip } from '../../types/user';

// =============================================================================
// Constants
// =============================================================================

/**
 * Brand color tokens (matching gluestack-ui.config.ts and Figma)
 */
const COLORS = {
  white: '#FFFFFF',
  paraBrand: '#E9AE16',
  black: '#1C1B1F',
  grayLight: '#EFF1F5',
  grayMedium: '#A09CAB',
  textDark900: '#181818',
  textDark: '#1C1B1F',
  border: '#E5E7EB',
  textGray: '#374151',
} as const;

// =============================================================================
// Types
// =============================================================================

/**
 * Local trip type for UI display (adapts from SavedTrip)
 */
export interface DisplayTrip {
  id: string;
  title: string;
  subtitle: string;
  iconType: 'home' | 'work' | 'school' | 'custom';
  origin?: {
    name: string;
    coordinates: [number, number]; // [lng, lat]
  };
  destination?: {
    name: string;
    coordinates: [number, number]; // [lng, lat]
  };
}

export interface SavedTripsScreenProps {
  navigation?: {
    navigate: (screen: string, params?: object) => void;
    goBack: () => void;
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get the appropriate icon component for a trip type
 */
const getIconForType = (type: DisplayTrip['iconType']): LucideIcon => {
  switch (type) {
    case 'home':
      return Home;
    case 'work':
      return Briefcase;
    case 'school':
      return GraduationCap;
    default:
      return MapPin;
  }
};

// =============================================================================
// Components
// =============================================================================

/**
 * Header with back button and title
 */
interface HeaderProps {
  onBack: () => void;
}

const Header: React.FC<HeaderProps> = ({ onBack }) => (
  <SafeAreaView edges={['top']} style={styles.headerSafeArea}>
    <HStack style={styles.headerContainer}>
      <Pressable onPress={onBack} style={styles.backButton}>
        <ChevronLeft size={28} color={COLORS.black} />
      </Pressable>
      <Text style={styles.headerTitle}>Saved Trips</Text>
      <View style={styles.headerSpacer} />
    </HStack>
  </SafeAreaView>
);

/**
 * Single saved trip card
 */
interface TripCardProps {
  trip: DisplayTrip;
  onPress: (trip: DisplayTrip) => void;
}

const TripCard: React.FC<TripCardProps> = ({ trip, onPress }) => {
  const IconComponent = getIconForType(trip.iconType);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.tripCard,
        pressed && styles.tripCardPressed,
      ]}
      onPress={() => onPress(trip)}
    >
      <HStack style={styles.tripCardContent}>
        {/* Icon */}
        <Box style={styles.tripIconContainer}>
          <IconComponent size={24} color={COLORS.paraBrand} />
        </Box>

        {/* Text Content */}
        <VStack style={styles.tripTextContainer}>
          <Text style={styles.tripTitle}>{trip.title}</Text>
          <Text style={styles.tripSubtitle}>{trip.subtitle}</Text>
        </VStack>

        {/* Chevron */}
        <ChevronRight size={24} color={COLORS.grayMedium} />
      </HStack>
    </Pressable>
  );
};

/**
 * Loading state
 */
const LoadingState: React.FC = () => (
  <VStack style={styles.loadingContainer}>
    <ActivityIndicator size="large" color={COLORS.paraBrand} />
    <Text style={styles.loadingText}>Loading saved trips...</Text>
  </VStack>
);

/**
 * Empty state when no trips are saved
 */
const EmptyState: React.FC = () => (
  <VStack style={styles.emptyContainer}>
    <MapPin size={48} color={COLORS.grayMedium} />
    <Text style={styles.emptyTitle}>No Saved Trips</Text>
    <Text style={styles.emptySubtitle}>
      Your saved trips will appear here when you bookmark routes
    </Text>
  </VStack>
);

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Convert SavedTrip from UserPreferences to DisplayTrip for UI
 */
const convertToDisplayTrip = (trip: SavedTrip): DisplayTrip => ({
  id: trip.id,
  title: trip.label,
  subtitle: `${trip.origin} → ${trip.destination}`,
  iconType: trip.iconType || 'custom',
  origin: {
    name: trip.origin,
    coordinates: [trip.coordinates.origin.lng, trip.coordinates.origin.lat],
  },
  destination: {
    name: trip.destination,
    coordinates: [trip.coordinates.destination.lng, trip.coordinates.destination.lat],
  },
});

// =============================================================================
// Main Component
// =============================================================================

export const SavedTripsScreen: React.FC<SavedTripsScreenProps> = ({ navigation }) => {
  const { userPreferencesData, isLoadingPreferences } = useAuth();

  // Convert saved trips from UserPreferences to DisplayTrip format
  const savedTrips: DisplayTrip[] = (userPreferencesData?.savedTrips || []).map(convertToDisplayTrip);

  const handleBack = useCallback(() => {
    navigation?.goBack();
  }, [navigation]);

  const handleTripPress = useCallback((trip: DisplayTrip) => {
    // Navigate to Map with pre-filled origin/destination
    if (trip.origin && trip.destination) {
      navigation?.navigate('Map', {
        prefilledOrigin: trip.origin,
        prefilledDestination: trip.destination,
      });
    }
  }, [navigation]);

  const renderItem = useCallback(({ item }: { item: DisplayTrip }) => (
    <TripCard trip={item} onPress={handleTripPress} />
  ), [handleTripPress]);

  return (
    <Box style={styles.container}>
      <Header onBack={handleBack} />

      {isLoadingPreferences ? (
        <LoadingState />
      ) : (
        <FlatList
          data={savedTrips}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.listContent,
            savedTrips.length === 0 && styles.listContentEmpty,
          ]}
          ListEmptyComponent={<EmptyState />}
          showsVerticalScrollIndicator={false}
        />
      )}
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

  // Header Styles
  headerSafeArea: {
    backgroundColor: COLORS.paraBrand,
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    flex: 1,
    fontFamily: 'CubaoFree2-Regular',
    fontSize: 24,
    lineHeight: 32,
    color: COLORS.black,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 40,
  },

  // List Styles
  listContent: {
    padding: 16,
    paddingBottom: 32,
  },
  listContentEmpty: {
    flex: 1,
  },

  // Trip Card Styles
  tripCard: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    marginBottom: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tripCardPressed: {
    backgroundColor: COLORS.grayLight,
  },
  tripCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  tripIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.grayLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tripTextContainer: {
    flex: 1,
    gap: 2,
  },
  tripTitle: {
    fontFamily: 'Inter',
    fontWeight: '600',
    fontSize: 16,
    lineHeight: 24,
    color: COLORS.textDark900,
  },
  tripSubtitle: {
    fontFamily: 'Inter',
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.textGray,
  },

  // Loading State Styles
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontFamily: 'Inter',
    fontSize: 14,
    color: COLORS.grayMedium,
  },

  // Empty State Styles
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
    gap: 12,
  },
  emptyTitle: {
    fontFamily: 'Inter',
    fontWeight: '600',
    fontSize: 18,
    color: COLORS.textDark900,
    marginTop: 8,
  },
  emptySubtitle: {
    fontFamily: 'Inter',
    fontSize: 14,
    color: COLORS.grayMedium,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});

export default SavedTripsScreen;
