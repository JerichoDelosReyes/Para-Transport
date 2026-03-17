/**
 * HomeScreen (Home Dashboard)
 * 
 * The main dashboard screen displaying map, traffic conditions, and fare calculator.
 * Matches Figma design: node 56-531
 * 
 * @module screens/HomeScreen
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  ScrollView,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  View as RNView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, UrlTile, PROVIDER_DEFAULT } from 'react-native-maps';
import {
  Search,
  Bookmark,
  RefreshCw,
  ChevronRight,
  MapPin,
  Home,
  Briefcase,
  GraduationCap,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';

// Gluestack UI Components
import { Box } from '../../components/ui/box';
import { Text } from '../../components/ui/text';

// Hooks and Context
import { useUserLocation } from '../hooks/useUserLocation';
import { useAuth } from '../context/AuthContext';

// Types
import { SavedTrip } from '../types/user';

/**
 * Brand color tokens (matching Figma design)
 */
const COLORS = {
  white: '#FFFFFF',
  paraBrand: '#E9AE16',
  black: '#1C1B1F',
  grayLight: '#EFF1F5',
  grayMedium: '#A09CAB',
  gray600: '#757575',
  textDark: '#111827',
  textGray: '#374151',
  trafficLight: '#79FF94',
  trafficModerate: '#E4DE2E',
  trafficHeavy: '#D63939',
  border: '#E5E7EB',
} as const;

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MAP_HEIGHT = 212;

// Default location (Manila, Philippines) for fallback
const DEFAULT_REGION = {
  latitude: 14.5995,
  longitude: 120.9842,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

/**
 * Format current time as "h:mm AM/PM"
 */
const formatCurrentTime = (): string => {
  const now = new Date();
  return now.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

/**
 * Header Section with Search Bar and Saved Trips Button
 * Fills full width with auto gap between search bar and bookmark icon
 */
interface HeaderSectionProps {
  onSearchPress: () => void;
  onSavedTripsPress: () => void;
}

const HeaderSection: React.FC<HeaderSectionProps> = ({
  onSearchPress,
  onSavedTripsPress,
}) => {
  return (
    <SafeAreaView edges={['top']} style={styles.headerSafeArea}>
      <RNView style={styles.searchContainer}>
        {/* Search Bar - flex: 1 to fill available space, navigates to Map */}
        <TouchableOpacity
          style={styles.searchInputWrapper}
          onPress={onSearchPress}
          activeOpacity={0.7}
        >
          <RNView style={styles.searchInputInner}>
            <Search size={24} color={COLORS.grayMedium} />
            <Text style={styles.searchPlaceholder}>Going Somewhere?</Text>
          </RNView>
        </TouchableOpacity>

        {/* Saved Trips Button - fixed at right edge */}
        <TouchableOpacity style={styles.filterButton} onPress={onSavedTripsPress}>
          <Bookmark size={28} color={COLORS.black} />
        </TouchableOpacity>
      </RNView>
    </SafeAreaView>
  );
};

/**
 * Horizontal Divider
 */
const Divider: React.FC = () => (
  <Box style={styles.dividerContainer}>
    <RNView style={styles.divider} />
  </Box>
);

/**
 * Get the appropriate icon component for a trip type
 */
const getIconForType = (type?: SavedTrip['iconType']): LucideIcon => {
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

/**
 * Saved Trips Section
 * Displays user's saved trips/routes with quick navigation
 */
interface SavedTripsSectionProps {
  savedTrips: SavedTrip[];
  isLoading: boolean;
  onTripPress: (trip: SavedTrip) => void;
  onViewAllPress: () => void;
}

const SavedTripsSection: React.FC<SavedTripsSectionProps> = ({
  savedTrips,
  isLoading,
  onTripPress,
  onViewAllPress,
}) => {
  // Loading state
  if (isLoading) {
    return (
      <RNView style={styles.savedTripsContainer}>
        <RNView style={styles.savedTripsTitleRow}>
          <Text style={styles.savedTripsTitle}>Saved Trips</Text>
        </RNView>
        <RNView style={styles.savedTripsLoadingContainer}>
          <ActivityIndicator size="small" color={COLORS.paraBrand} />
        </RNView>
      </RNView>
    );
  }

  // Empty state
  if (savedTrips.length === 0) {
    return (
      <RNView style={styles.savedTripsContainer}>
        <RNView style={styles.savedTripsTitleRow}>
          <Text style={styles.savedTripsTitle}>Saved Trips</Text>
        </RNView>
        <RNView style={styles.savedTripsEmptyContainer}>
          <MapPin size={24} color={COLORS.grayMedium} />
          <Text style={styles.savedTripsEmptyText}>
            No saved routes yet. Save your frequent trips!
          </Text>
        </RNView>
      </RNView>
    );
  }

  // Display up to 3 saved trips
  const displayTrips = savedTrips.slice(0, 3);

  return (
    <RNView style={styles.savedTripsContainer}>
      {/* Title Row with View All */}
      <RNView style={styles.savedTripsTitleRow}>
        <Text style={styles.savedTripsTitle}>Saved Trips</Text>
        {savedTrips.length > 3 && (
          <TouchableOpacity onPress={onViewAllPress}>
            <Text style={styles.savedTripsViewAll}>View All</Text>
          </TouchableOpacity>
        )}
      </RNView>

      {/* Trip Cards */}
      <RNView style={styles.savedTripsCards}>
        {displayTrips.map((trip) => {
          const IconComponent = getIconForType(trip.iconType);
          return (
            <TouchableOpacity
              key={trip.id}
              style={styles.savedTripCard}
              onPress={() => onTripPress(trip)}
              activeOpacity={0.7}
            >
              <RNView style={styles.savedTripIconContainer}>
                <IconComponent size={20} color={COLORS.paraBrand} />
              </RNView>
              <RNView style={styles.savedTripContent}>
                <Text style={styles.savedTripLabel} numberOfLines={1}>
                  {trip.label}
                </Text>
                <Text style={styles.savedTripRoute} numberOfLines={1}>
                  {trip.origin} → {trip.destination}
                </Text>
              </RNView>
              <ChevronRight size={20} color={COLORS.grayMedium} />
            </TouchableOpacity>
          );
        })}
      </RNView>
    </RNView>
  );
};

/**
 * Map Widget Section
 */
interface MapWidgetProps {
  currentTime: string;
  onRefresh: () => void;
  isRefreshing: boolean;
  userLocation: {
    latitude: number;
    longitude: number;
  } | null;
}

const MapWidget: React.FC<MapWidgetProps> = ({
  currentTime,
  onRefresh,
  isRefreshing,
  userLocation,
}) => {
  const mapRef = useRef<MapView>(null);
  
  const region = userLocation
    ? {
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      }
    : DEFAULT_REGION;

  return (
    <RNView style={styles.mapSectionContainer}>
      {/* Title Row */}
      <RNView style={styles.mapTitleContainer}>
        <Text style={styles.mapSectionTitle}>Latest in the Area</Text>
        <RNView style={styles.mapTimeRow}>
          <Text style={styles.mapTimeText}>as of today at {currentTime}</Text>
          <TouchableOpacity onPress={onRefresh} disabled={isRefreshing}>
            <RefreshCw
              size={11}
              color={COLORS.gray600}
              style={isRefreshing ? { opacity: 0.5 } : undefined}
            />
          </TouchableOpacity>
        </RNView>
      </RNView>

      {/* Map View */}
      <RNView style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={PROVIDER_DEFAULT}
          initialRegion={region}
          region={region}
          showsUserLocation={false}
          showsMyLocationButton={false}
          showsCompass={false}
          scrollEnabled={true}
          zoomEnabled={true}
          pitchEnabled={false}
          rotateEnabled={false}
          // Hide Apple Maps legal label by pushing it off-screen
          legalLabelInsets={{ top: 0, left: 0, bottom: -100, right: -100 }}
          // Additional props to minimize default map UI
          showsScale={false}
          showsBuildings={false}
          showsTraffic={false}
          showsIndoors={false}
          showsPointsOfInterest={false}
        >
          <UrlTile
            urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            maximumZ={19}
            flipY={false}
          />
          <Marker
            coordinate={{
              latitude: region.latitude,
              longitude: region.longitude,
            }}
            anchor={{ x: 0.5, y: 1 }}
          >
            <RNView style={styles.markerContainer}>
              <MapPin size={60} color={COLORS.paraBrand} fill={COLORS.paraBrand} />
            </RNView>
          </Marker>
        </MapView>
        {/* Overlay to cover any remaining legal text at bottom */}
        <RNView style={styles.mapAttributionOverlay} />
      </RNView>
    </RNView>
  );
};

/**
 * Traffic Conditions Section
 * Shows "No Data" placeholder as per requirements (no backend data yet)
 */
const TrafficConditionsSection: React.FC = () => {
  return (
    <Box style={styles.trafficContainer}>
      {/* Title */}
      <Text style={styles.trafficTitle}>Live Traffic Near Location</Text>

      {/* No Data Placeholder */}
      <Box style={styles.noDataContainer}>
        <Text style={styles.noDataText}>No Data</Text>
      </Box>
    </Box>
  );
};

/**
 * Fare Calculator Section
 */
interface FareCalculatorSectionProps {
  onCalculatePress: () => void;
}

const FareCalculatorSection: React.FC<FareCalculatorSectionProps> = ({
  onCalculatePress,
}) => {
  return (
    <RNView style={styles.fareOuterContainer}>
      {/* Section Title */}
      <RNView style={styles.fareTitleContainer}>
        <Text style={styles.fareSectionTitle}>Fare Calculator</Text>
      </RNView>

      {/* Fare Card */}
      <RNView style={styles.fareCard}>
        {/* Subtitle */}
        <Text style={styles.fareSubtitle}>Minimum Fare Amount</Text>

        {/* Price Display */}
        <RNView style={styles.farePriceContainer}>
          <Text style={styles.farePrice}>₱13.00</Text>
        </RNView>

        {/* Divider */}
        <RNView style={styles.fareCardDivider} />

        {/* Calculate Button */}
        <TouchableOpacity style={styles.calculateButton} onPress={onCalculatePress}>
          <Text style={styles.calculateText}>Calculate Destination</Text>
          <ChevronRight size={24} color={COLORS.black} />
        </TouchableOpacity>
      </RNView>
    </RNView>
  );
};

/**
 * HomeScreen Component
 */
export interface HomeScreenProps {
  navigation?: {
    navigate: (screen: string, params?: object) => void;
  };
}

export const HomeScreen: React.FC<HomeScreenProps> = ({ navigation }) => {
  const [currentTime, setCurrentTime] = useState(formatCurrentTime());
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const { location, refreshLocation } = useUserLocation();
  const { userPreferencesData, isLoadingPreferences } = useAuth();

  // Get saved trips from user preferences
  const savedTrips = userPreferencesData?.savedTrips || [];

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    setCurrentTime(formatCurrentTime());
    await refreshLocation();
    setTimeout(() => setIsRefreshing(false), 500);
  }, [refreshLocation]);

  // Navigation handlers
  const handleSearchPress = useCallback(() => {
    // Navigate to MapSearch screen for location input
    navigation?.navigate('MapSearch', { inputType: 'destination' });
  }, [navigation]);

  const handleSavedTripsPress = useCallback(() => {
    // Navigate to Saved Trips screen
    navigation?.navigate('SavedTrips');
  }, [navigation]);

  const handleCalculatePress = useCallback(() => {
    // Navigate to Fare Calculator screen (via tab)
    navigation?.navigate('Fare');
  }, [navigation]);

  // Handle saved trip press - navigate to map with coordinates
  const handleSavedTripPress = useCallback((trip: SavedTrip) => {
    navigation?.navigate('Map', {
      prefilledOrigin: {
        name: trip.origin,
        coordinates: [trip.coordinates.origin.lng, trip.coordinates.origin.lat],
      },
      prefilledDestination: {
        name: trip.destination,
        coordinates: [trip.coordinates.destination.lng, trip.coordinates.destination.lat],
      },
    });
  }, [navigation]);

  useEffect(() => {
    setCurrentTime(formatCurrentTime());
  }, []);

  const userLocation = location
    ? { latitude: location.latitude, longitude: location.longitude }
    : null;

  return (
    <Box style={styles.container}>
      {/* Header with Search */}
      <HeaderSection
        onSearchPress={handleSearchPress}
        onSavedTripsPress={handleSavedTripsPress}
      />

      {/* Scrollable Content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Saved Trips Section */}
        <SavedTripsSection
          savedTrips={savedTrips}
          isLoading={isLoadingPreferences}
          onTripPress={handleSavedTripPress}
          onViewAllPress={handleSavedTripsPress}
        />

        {/* Divider */}
        <Divider />

        {/* Map Widget with Title */}
        <MapWidget
          currentTime={currentTime}
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
          userLocation={userLocation}
        />

        {/* Traffic Conditions */}
        <TrafficConditionsSection />

        {/* Divider */}
        <Divider />

        {/* Fare Calculator */}
        <FareCalculatorSection onCalculatePress={handleCalculatePress} />

        {/* Bottom spacing for tab bar */}
        <Box style={styles.bottomSpacer} />
      </ScrollView>
    </Box>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  
  // Header Styles
  headerSafeArea: {
    backgroundColor: COLORS.paraBrand,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 12,
    paddingTop: 8,
    gap: 6,
  },
  searchInputWrapper: {
    flex: 1,
  },
  searchInputInner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.grayLight,
    borderRadius: 32,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  searchPlaceholder: {
    fontFamily: 'Inter',
    fontSize: 14,
    color: COLORS.grayMedium,
    lineHeight: 20,
  },
  filterButton: {
    width: 32,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Divider Styles
  dividerContainer: {
    backgroundColor: COLORS.white,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    width: '100%',
  },

  // Map Widget Styles
  mapSectionContainer: {
    backgroundColor: COLORS.white,
  },
  mapTitleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  mapSectionTitle: {
    fontFamily: 'CubaoFree2-Regular',
    fontSize: 20,
    lineHeight: 32,
    color: COLORS.black,
  },
  mapTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  mapTimeText: {
    fontFamily: 'Inter',
    fontSize: 10,
    color: COLORS.gray600,
    lineHeight: 20,
  },
  mapContainer: {
    marginHorizontal: 16,
    marginVertical: 12,
    height: MAP_HEIGHT,
    borderRadius: 12,
    overflow: 'hidden',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  markerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Overlay to hide Apple Maps legal attribution
  mapAttributionOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 20,
    backgroundColor: COLORS.white,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },

  // Traffic Styles
  trafficContainer: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    marginHorizontal: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  trafficTitle: {
    fontFamily: 'Inter',
    fontWeight: '600',
    fontSize: 14,
    lineHeight: 24,
    color: COLORS.textDark,
    marginBottom: 10,
  },
  noDataContainer: {
    paddingVertical: 40,
    paddingHorizontal: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noDataText: {
    fontFamily: 'Inter',
    fontSize: 14,
    color: COLORS.grayMedium,
  },

  // Fare Calculator Styles
  fareOuterContainer: {
    backgroundColor: COLORS.white,
  },
  fareTitleContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  fareSectionTitle: {
    fontFamily: 'Inter',
    fontWeight: '600',
    fontSize: 20,
    lineHeight: 32,
    color: COLORS.black,
  },
  fareCard: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    marginHorizontal: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  fareSubtitle: {
    fontFamily: 'Inter',
    fontWeight: '600',
    fontSize: 14,
    lineHeight: 24,
    color: COLORS.textDark,
  },
  farePriceContainer: {
    alignItems: 'flex-end',
    marginTop: 8,
  },
  farePrice: {
    fontFamily: 'Inter',
    fontWeight: '700',
    fontSize: 72,
    lineHeight: 86,
    color: COLORS.black,
    letterSpacing: -2.16,
  },
  fareCardDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 8,
  },
  calculateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingVertical: 4,
  },
  calculateText: {
    fontFamily: 'Inter',
    fontWeight: '600',
    fontSize: 16,
    lineHeight: 24,
    color: COLORS.black,
  },

  // Saved Trips Styles
  savedTripsContainer: {
    backgroundColor: COLORS.white,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  savedTripsTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  savedTripsTitle: {
    fontFamily: 'CubaoFree2-Regular',
    fontSize: 20,
    lineHeight: 28,
    color: COLORS.black,
  },
  savedTripsViewAll: {
    fontFamily: 'Inter',
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.paraBrand,
  },
  savedTripsLoadingContainer: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  savedTripsEmptyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.grayLight,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    gap: 12,
  },
  savedTripsEmptyText: {
    flex: 1,
    fontFamily: 'Inter',
    fontSize: 14,
    color: COLORS.grayMedium,
    lineHeight: 20,
  },
  savedTripsCards: {
    gap: 8,
  },
  savedTripCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 12,
  },
  savedTripIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.grayLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  savedTripContent: {
    flex: 1,
    gap: 2,
  },
  savedTripLabel: {
    fontFamily: 'Inter',
    fontWeight: '600',
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.textDark,
  },
  savedTripRoute: {
    fontFamily: 'Inter',
    fontSize: 12,
    lineHeight: 16,
    color: COLORS.grayMedium,
  },

  // Scroll View
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 16,
  },
  bottomSpacer: {
    height: 80,
  },
});

export default HomeScreen;