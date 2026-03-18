/**
 * MapSearchScreen (Location Search)
 * 
 * Redesigned dual-field search screen with both Origin and Destination inputs.
 * Features:
 * - "Use Current Location" button for Origin
 * - Auto-focus flow from Origin to Destination
 * - Para-branded permission modal
 * 
 * @module screens/main/MapSearchScreen
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  TextInput,
  FlatList,
  Pressable,
  Keyboard,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import {
  Search,
  MapPin,
  Navigation,
  ChevronLeft,
  X,
  Clock,
  Star,
  CircleDot,
  LocateFixed,
} from 'lucide-react-native';

// Gluestack UI Components
import { Box } from '../../../components/ui/box';
import { Text } from '../../../components/ui/text';
import { VStack } from '../../../components/ui/vstack';
import { HStack } from '../../../components/ui/hstack';

// Custom Components
import { LocationPermissionModal } from '../../components/map/LocationPermissionModal';
import { GEOCODING_CONFIG } from '../../config/constants';

// =============================================================================
// Constants
// =============================================================================

/**
 * Brand color tokens
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
} as const;

/**
 * Nominatim (OSM) geocoding configuration
 */
const NOMINATIM_CONFIG = {
  baseUrl: GEOCODING_CONFIG.BASE_URL,
  // Bounding box for Philippines (focus search results)
  viewbox: GEOCODING_CONFIG.VIEWBOX,
  // Center on Cavite area for better local results
  countryCode: GEOCODING_CONFIG.COUNTRY_CODE,
  debounceMs: 300,
  minQueryLength: GEOCODING_CONFIG.MIN_QUERY_LENGTH,
  maxResults: GEOCODING_CONFIG.MAX_RESULTS,
} as const;

// =============================================================================
// Types
// =============================================================================

/**
 * Selected location data structure
 */
interface SelectedLocation {
  name: string;
  displayName: string;
  coordinates: [number, number]; // [lng, lat]
  isCurrentLocation?: boolean;
}

export interface MapSearchScreenProps {
  navigation?: {
    navigate: (screen: string, params?: object) => void;
    goBack: () => void;
  };
  route?: {
    params?: {
      /** Initial focus field */
      initialFocus?: 'origin' | 'destination';
      /** Pre-filled origin */
      existingOrigin?: SelectedLocation;
      /** Pre-filled destination */
      existingDestination?: SelectedLocation;
      returnScreen?: string;
    };
  };
}

interface LocationSuggestion {
  id: string;
  name: string;
  displayName: string;
  coordinates: [number, number]; // [lng, lat]
  type: string;
  importance: number;
}

interface RecentSearch {
  id: string;
  name: string;
  displayName: string;
  coordinates: [number, number];
  timestamp: number;
}

// =============================================================================
// API Functions
// =============================================================================

/**
 * Search locations using OSM Nominatim API
 */
const searchLocations = async (query: string): Promise<LocationSuggestion[]> => {
  if (query.length < NOMINATIM_CONFIG.minQueryLength) {
    return [];
  }

  try {
    const params = new URLSearchParams({
      q: query,
      format: 'json',
      addressdetails: '1',
      limit: NOMINATIM_CONFIG.maxResults.toString(),
      countrycodes: NOMINATIM_CONFIG.countryCode,
      viewbox: NOMINATIM_CONFIG.viewbox,
      bounded: '0', // Prefer but don't limit to viewbox
    });

    const response = await fetch(
      `${NOMINATIM_CONFIG.baseUrl}/search?${params.toString()}`,
      {
        headers: {
          'User-Agent': 'ParaMobile/1.0 (contact@para.ph)',
          'Accept-Language': 'en',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    return data.map((item: any) => ({
      id: item.place_id.toString(),
      name: item.name || item.display_name.split(',')[0],
      displayName: item.display_name,
      coordinates: [parseFloat(item.lon), parseFloat(item.lat)] as [number, number],
      type: item.type || item.class,
      importance: item.importance || 0,
    }));
  } catch (error) {
    console.error('[MapSearchScreen] Search error:', error);
    return [];
  }
};

// =============================================================================
// Components
// =============================================================================

/**
 * Active input field indicator
 */
type ActiveField = 'origin' | 'destination' | null;

/**
 * Dual-field Search Header
 * Shows both Origin and Destination inputs with visual connection
 */
interface DualSearchHeaderProps {
  // Origin field
  originValue: string;
  originSelected: SelectedLocation | null;
  onOriginChange: (text: string) => void;
  onOriginFocus: () => void;
  onOriginClear: () => void;
  originRef: React.RefObject<TextInput>;
  // Destination field
  destinationValue: string;
  destinationSelected: SelectedLocation | null;
  onDestinationChange: (text: string) => void;
  onDestinationFocus: () => void;
  onDestinationClear: () => void;
  destinationRef: React.RefObject<TextInput>;
  // Actions
  onBack: () => void;
  onUseCurrentLocation: () => void;
  // State
  activeField: ActiveField;
  isLoadingLocation: boolean;
}

const DualSearchHeader: React.FC<DualSearchHeaderProps> = ({
  originValue,
  originSelected,
  onOriginChange,
  onOriginFocus,
  onOriginClear,
  originRef,
  destinationValue,
  destinationSelected,
  onDestinationChange,
  onDestinationFocus,
  onDestinationClear,
  destinationRef,
  onBack,
  onUseCurrentLocation,
  activeField,
  isLoadingLocation,
}) => {
  const originDisplayText = originSelected?.isCurrentLocation 
    ? 'Current Location' 
    : originSelected?.name || originValue;
  
  const destDisplayText = destinationSelected?.name || destinationValue;

  return (
    <SafeAreaView edges={['top']} style={styles.headerSafeArea}>
      <View style={styles.headerContainer}>
        <View style={styles.headerTopRow}>
          {/* Back Button */}
          <Pressable onPress={onBack} style={styles.backButton}>
            <ChevronLeft size={28} color={COLORS.white} />
          </Pressable>

          {/* Input Fields Container */}
          <View style={styles.inputFieldsContainer}>
            {/* Origin Field */}
            <View style={styles.inputRow}>
              <View style={styles.inputContainer}>
                <CircleDot 
                  size={18} 
                  color={activeField === 'origin' ? COLORS.paraBrand : COLORS.grayMedium} 
                />
                {originSelected ? (
                  <Pressable 
                    style={styles.selectedFieldPressable}
                    onPress={onOriginFocus}
                  >
                    <Text 
                      style={[
                        styles.selectedText,
                        originSelected.isCurrentLocation && { color: '#22C55E' },
                      ]} 
                      numberOfLines={1}
                    >
                      {originDisplayText}
                    </Text>
                  </Pressable>
                ) : (
                  <TextInput
                    ref={originRef}
                    style={styles.searchInput}
                    placeholder="Enter origin..."
                    placeholderTextColor={COLORS.grayMedium}
                    value={originValue}
                    onChangeText={onOriginChange}
                    onFocus={onOriginFocus}
                    returnKeyType="next"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                )}
                {(originSelected || originValue.length > 0) && (
                  <Pressable onPress={onOriginClear} hitSlop={8} style={styles.clearButton}>
                    <X size={16} color={COLORS.grayMedium} />
                  </Pressable>
                )}
              </View>
              
              {/* Use Current Location Button */}
              <Pressable 
                onPress={onUseCurrentLocation}
                style={({ pressed }) => [
                  styles.locationButton,
                  pressed && styles.locationButtonPressed,
                ]}
                disabled={isLoadingLocation}
              >
                {isLoadingLocation ? (
                  <ActivityIndicator size="small" color={COLORS.white} />
                ) : (
                  <LocateFixed size={30} color={COLORS.white} />
                )}
              </Pressable>
            </View>

            {/* Connector Line */}
            <View style={styles.connectorLine} />

            {/* Destination Field */}
            <View style={styles.inputRow}>
              <View style={[styles.inputContainer, styles.destinationContainer]}>
                <MapPin 
                  size={18} 
                  color={activeField === 'destination' ? COLORS.paraBrand : COLORS.grayMedium} 
                />
                {destinationSelected ? (
                  <Pressable 
                    style={styles.selectedFieldPressable}
                    onPress={onDestinationFocus}
                  >
                    <Text style={styles.selectedText} numberOfLines={1}>
                      {destDisplayText}
                    </Text>
                  </Pressable>
                ) : (
                  <TextInput
                    ref={destinationRef}
                    style={styles.searchInput}
                    placeholder="Where are you going?"
                    placeholderTextColor={COLORS.grayMedium}
                    value={destinationValue}
                    onChangeText={onDestinationChange}
                    onFocus={onDestinationFocus}
                    returnKeyType="search"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                )}
                {(destinationSelected || destinationValue.length > 0) && (
                  <Pressable onPress={onDestinationClear} hitSlop={8} style={styles.clearButton}>
                    <X size={16} color={COLORS.grayMedium} />
                  </Pressable>
                )}
              </View>
            </View>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
};

/**
 * Single suggestion item
 */
interface SuggestionItemProps {
  suggestion: LocationSuggestion;
  onPress: (suggestion: LocationSuggestion) => void;
}

const SuggestionItem: React.FC<SuggestionItemProps> = ({ suggestion, onPress }) => (
  <Pressable
    style={({ pressed }) => [
      styles.suggestionItem,
      pressed && styles.suggestionItemPressed,
    ]}
    onPress={() => onPress(suggestion)}
  >
    <HStack style={styles.suggestionContent}>
      <Box style={styles.suggestionIconContainer}>
        <MapPin size={20} color={COLORS.paraBrand} />
      </Box>
      <VStack style={styles.suggestionTextContainer}>
        <Text style={styles.suggestionName} numberOfLines={1}>
          {suggestion.name}
        </Text>
        <Text style={styles.suggestionAddress} numberOfLines={2}>
          {suggestion.displayName}
        </Text>
      </VStack>
    </HStack>
  </Pressable>
);

/**
 * Recent search item
 */
interface RecentItemProps {
  item: RecentSearch;
  onPress: (item: RecentSearch) => void;
}

const RecentItem: React.FC<RecentItemProps> = ({ item, onPress }) => (
  <Pressable
    style={({ pressed }) => [
      styles.suggestionItem,
      pressed && styles.suggestionItemPressed,
    ]}
    onPress={() => onPress(item)}
  >
    <HStack style={styles.suggestionContent}>
      <Box style={styles.recentIconContainer}>
        <Clock size={18} color={COLORS.grayMedium} />
      </Box>
      <VStack style={styles.suggestionTextContainer}>
        <Text style={styles.suggestionName} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.suggestionAddress} numberOfLines={1}>
          {item.displayName}
        </Text>
      </VStack>
    </HStack>
  </Pressable>
);

/**
 * Loading indicator
 */
const LoadingIndicator: React.FC = () => (
  <View style={styles.loadingContainer}>
    <ActivityIndicator size="small" color={COLORS.paraBrand} />
    <Text style={styles.loadingText}>Searching...</Text>
  </View>
);

/**
 * Empty state
 */
interface EmptyStateProps {
  query: string;
}

const EmptyState: React.FC<EmptyStateProps> = ({ query }) => (
  <VStack style={styles.emptyContainer}>
    <Search size={48} color={COLORS.grayMedium} />
    <Text style={styles.emptyTitle}>
      {query.length > 0 ? 'No results found' : 'Search for a location'}
    </Text>
    <Text style={styles.emptySubtitle}>
      {query.length > 0
        ? 'Try a different search term'
        : 'Type at least 2 characters to search'}
    </Text>
  </VStack>
);

/**
 * Quick suggestions (known locations)
 */
interface QuickSuggestionsProps {
  onSelect: (suggestion: LocationSuggestion) => void;
}

const QUICK_LOCATIONS: LocationSuggestion[] = [
  {
    id: 'quick-1',
    name: 'SM Molino',
    displayName: 'SM City Molino, Bacoor, Cavite',
    coordinates: [120.9777, 14.3841],
    type: 'mall',
    importance: 1,
  },
  {
    id: 'quick-2',
    name: 'Robinsons Paliparan',
    displayName: 'Robinsons Place Paliparan, Dasmariñas, Cavite',
    coordinates: [120.9163, 14.4012],
    type: 'mall',
    importance: 1,
  },
  {
    id: 'quick-3',
    name: 'BDO Imus',
    displayName: 'BDO Imus Branch, Imus, Cavite',
    coordinates: [120.9407, 14.4207],
    type: 'bank',
    importance: 1,
  },
  {
    id: 'quick-4',
    name: 'District Imus',
    displayName: 'District Mall, Imus, Cavite',
    coordinates: [120.9385, 14.4045],
    type: 'mall',
    importance: 1,
  },
];

const QuickSuggestions: React.FC<QuickSuggestionsProps> = ({ onSelect }) => (
  <VStack style={styles.quickSection}>
    <HStack style={styles.sectionHeader}>
      <Star size={16} color={COLORS.paraBrand} />
      <Text style={styles.sectionTitle}>Popular Destinations</Text>
    </HStack>
    {QUICK_LOCATIONS.map((location) => (
      <SuggestionItem
        key={location.id}
        suggestion={location}
        onPress={onSelect}
      />
    ))}
  </VStack>
);

// =============================================================================
// Main Component
// =============================================================================

export const MapSearchScreen: React.FC<MapSearchScreenProps> = ({
  navigation,
  route,
}) => {
  const initialFocus = route?.params?.initialFocus || 'destination';
  const existingOrigin = route?.params?.existingOrigin || null;
  const existingDestination = route?.params?.existingDestination || null;

  // ==========================================================================
  // State
  // ==========================================================================
  
  // Active field tracking
  const [activeField, setActiveField] = useState<ActiveField>(initialFocus);
  
  // Origin state
  const [originQuery, setOriginQuery] = useState('');
  const [originSelected, setOriginSelected] = useState<SelectedLocation | null>(existingOrigin);
  
  // Destination state
  const [destinationQuery, setDestinationQuery] = useState('');
  const [destinationSelected, setDestinationSelected] = useState<SelectedLocation | null>(existingDestination);
  
  // Search state
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [recentSearches] = useState<RecentSearch[]>([]); // TODO: Persist to AsyncStorage
  
  // Permission modal state
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);

  // ==========================================================================
  // Refs
  // ==========================================================================
  
  const originRef = useRef<TextInput>(null);
  const destinationRef = useRef<TextInput>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // ==========================================================================
  // Auto-focus on mount
  // ==========================================================================
  
  useEffect(() => {
    const timer = setTimeout(() => {
      if (initialFocus === 'origin' && !originSelected) {
        originRef.current?.focus();
      } else if (!destinationSelected) {
        destinationRef.current?.focus();
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [initialFocus, originSelected, destinationSelected]);

  // ==========================================================================
  // Debounced Search
  // ==========================================================================
  
  const performSearch = useCallback(async (query: string) => {
    if (query.length < NOMINATIM_CONFIG.minQueryLength) {
      setSuggestions([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    // Clear previous debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(async () => {
      const results = await searchLocations(query);
      setSuggestions(results);
      setIsLoading(false);
    }, NOMINATIM_CONFIG.debounceMs);
  }, []);

  // ==========================================================================
  // Origin Handlers
  // ==========================================================================
  
  const handleOriginChange = useCallback((text: string) => {
    setOriginQuery(text);
    setOriginSelected(null);
    performSearch(text);
  }, [performSearch]);

  const handleOriginFocus = useCallback(() => {
    setActiveField('origin');
    if (originSelected) {
      setOriginSelected(null);
      setOriginQuery('');
    }
    setSuggestions([]);
  }, [originSelected]);

  const handleOriginClear = useCallback(() => {
    setOriginQuery('');
    setOriginSelected(null);
    setSuggestions([]);
    setActiveField('origin');
    originRef.current?.focus();
  }, []);

  // ==========================================================================
  // Destination Handlers
  // ==========================================================================
  
  const handleDestinationChange = useCallback((text: string) => {
    setDestinationQuery(text);
    setDestinationSelected(null);
    performSearch(text);
  }, [performSearch]);

  const handleDestinationFocus = useCallback(() => {
    setActiveField('destination');
    if (destinationSelected) {
      setDestinationSelected(null);
      setDestinationQuery('');
    }
    setSuggestions([]);
  }, [destinationSelected]);

  const handleDestinationClear = useCallback(() => {
    setDestinationQuery('');
    setDestinationSelected(null);
    setSuggestions([]);
    setActiveField('destination');
    destinationRef.current?.focus();
  }, []);

  // ==========================================================================
  // Current Location Handler
  // ==========================================================================
  
  const handleUseCurrentLocation = useCallback(async () => {
    setIsLoadingLocation(true);
    
    try {
      // Check if permission is already granted
      const { status } = await Location.getForegroundPermissionsAsync();
      
      if (status === 'granted') {
        // Permission already granted - get location directly
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        
        handlePermissionGranted({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });
      } else if (status === 'denied') {
        // Previously denied - show modal with settings option
        setIsLoadingLocation(false);
        setPermissionDenied(true);
        setShowPermissionModal(true);
      } else {
        // Not determined yet - show permission modal
        setIsLoadingLocation(false);
        setShowPermissionModal(true);
      }
    } catch (error) {
      console.error('[MapSearchScreen] Error checking permission:', error);
      setIsLoadingLocation(false);
      setShowPermissionModal(true);
    }
  }, []);

  const handlePermissionGranted = useCallback((coords: { latitude: number; longitude: number }) => {
    setIsLoadingLocation(false);
    setPermissionDenied(false);
    setShowPermissionModal(false);
    
    // Set origin to current location
    const currentLocation: SelectedLocation = {
      name: 'Current Location',
      displayName: 'Your current location',
      coordinates: [coords.longitude, coords.latitude],
      isCurrentLocation: true,
    };
    
    setOriginSelected(currentLocation);
    setOriginQuery('');
    
    // Auto-focus to destination field
    setActiveField('destination');
    setTimeout(() => {
      destinationRef.current?.focus();
    }, 100);
  }, []);

  const handlePermissionDenied = useCallback(() => {
    setIsLoadingLocation(false);
    setPermissionDenied(true);
    setShowPermissionModal(false);
  }, []);

  // ==========================================================================
  // Navigation Handlers
  // ==========================================================================
  
  const handleBack = useCallback(() => {
    Keyboard.dismiss();
    navigation?.goBack();
  }, [navigation]);

  const handleSelectSuggestion = useCallback(
    (suggestion: LocationSuggestion) => {
      const selectedLocation: SelectedLocation = {
        name: suggestion.name,
        displayName: suggestion.displayName,
        coordinates: suggestion.coordinates,
      };

      if (activeField === 'origin') {
        // Set origin and move to destination
        setOriginSelected(selectedLocation);
        setOriginQuery('');
        setSuggestions([]);
        setActiveField('destination');
        
        setTimeout(() => {
          destinationRef.current?.focus();
        }, 100);
      } else {
        // Set destination
        setDestinationSelected(selectedLocation);
        setDestinationQuery('');
        setSuggestions([]);
        
        // If origin is already set, navigate back with both values
        if (originSelected) {
          Keyboard.dismiss();
          console.log('[MapSearchScreen] Both fields filled, navigating back');
          
          navigation?.navigate('MainTabs', {
            screen: 'Map',
            params: {
              selectedOrigin: {
                name: originSelected.name,
                displayName: originSelected.displayName,
                coordinates: originSelected.coordinates,
                isCurrentLocation: originSelected.isCurrentLocation,
              },
              selectedDestination: {
                name: selectedLocation.name,
                displayName: selectedLocation.displayName,
                coordinates: selectedLocation.coordinates,
              },
            },
          });
        }
      }
    },
    [activeField, originSelected, destinationSelected, navigation]
  );

  // Auto-navigate when both fields are filled
  useEffect(() => {
    if (originSelected && destinationSelected) {
      console.log('[MapSearchScreen] Both fields selected, navigating...');
      
      Keyboard.dismiss();
      
      navigation?.navigate('MainTabs', {
        screen: 'Map',
        params: {
          selectedOrigin: {
            name: originSelected.name,
            displayName: originSelected.displayName,
            coordinates: originSelected.coordinates,
            isCurrentLocation: originSelected.isCurrentLocation,
          },
          selectedDestination: {
            name: destinationSelected.name,
            displayName: destinationSelected.displayName,
            coordinates: destinationSelected.coordinates,
          },
        },
      });
    }
  }, [originSelected, destinationSelected, navigation]);

  // ==========================================================================
  // Cleanup
  // ==========================================================================
  
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  // ==========================================================================
  // Render Helpers
  // ==========================================================================
  
  const renderSuggestion = ({ item }: { item: LocationSuggestion }) => (
    <SuggestionItem suggestion={item} onPress={handleSelectSuggestion} />
  );

  const currentQuery = activeField === 'origin' ? originQuery : destinationQuery;
  const showQuickSuggestions = currentQuery.length < NOMINATIM_CONFIG.minQueryLength;

  // ==========================================================================
  // Render
  // ==========================================================================
  
  return (
    <Box style={styles.container}>
      <DualSearchHeader
        // Origin props
        originValue={originQuery}
        originSelected={originSelected}
        onOriginChange={handleOriginChange}
        onOriginFocus={handleOriginFocus}
        onOriginClear={handleOriginClear}
        originRef={originRef}
        // Destination props
        destinationValue={destinationQuery}
        destinationSelected={destinationSelected}
        onDestinationChange={handleDestinationChange}
        onDestinationFocus={handleDestinationFocus}
        onDestinationClear={handleDestinationClear}
        destinationRef={destinationRef}
        // Actions
        onBack={handleBack}
        onUseCurrentLocation={handleUseCurrentLocation}
        // State
        activeField={activeField}
        isLoadingLocation={isLoadingLocation}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.content}
      >
        {isLoading ? (
          <LoadingIndicator />
        ) : showQuickSuggestions ? (
          <FlatList
            data={[]}
            renderItem={() => null}
            ListHeaderComponent={
              <>
                {recentSearches.length > 0 && (
                  <VStack style={styles.recentSection}>
                    <HStack style={styles.sectionHeader}>
                      <Clock size={16} color={COLORS.grayMedium} />
                      <Text style={styles.sectionTitle}>Recent Searches</Text>
                    </HStack>
                    {recentSearches.slice(0, 3).map((item) => (
                      <RecentItem
                        key={item.id}
                        item={item}
                        onPress={(recent) => handleSelectSuggestion({
                          id: recent.id,
                          name: recent.name,
                          displayName: recent.displayName,
                          coordinates: recent.coordinates,
                          type: 'recent',
                          importance: 1,
                        })}
                      />
                    ))}
                  </VStack>
                )}
                <QuickSuggestions onSelect={handleSelectSuggestion} />
              </>
            }
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          />
        ) : suggestions.length > 0 ? (
          <FlatList
            data={suggestions}
            renderItem={renderSuggestion}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          />
        ) : (
          <EmptyState query={currentQuery} />
        )}
      </KeyboardAvoidingView>

      {/* Location Permission Modal */}
      <LocationPermissionModal
        visible={showPermissionModal}
        onClose={() => setShowPermissionModal(false)}
        onPermissionGranted={handlePermissionGranted}
        onPermissionDenied={handlePermissionDenied}
        wasPreviouslyDenied={permissionDenied}
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
  content: {
    flex: 1,
  },

  // Header Styles
  headerSafeArea: {
    backgroundColor: COLORS.paraBrand,
  },
  headerContainer: {
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  inputFieldsContainer: {
    flex: 1,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inputContainer: {
    flex: 3,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 24,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'Inter',
    fontSize: 15,
    color: COLORS.textDark900,
    paddingVertical: 0,
  },
  selectedFieldPressable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectedText: {
    flex: 1,
    fontFamily: 'Inter',
    fontSize: 15,
    color: COLORS.textDark900,
  },
  clearButton: {
    padding: 4,
  },
  locationButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationButtonPressed: {
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  connectorLine: {
    width: 2,
    height: 12,
    backgroundColor: COLORS.white,
    opacity: 0.5,
    marginLeft: 56,
    borderRadius: 1,
  },
  destinationContainer: {
    marginRight: 44,
  },

  // List Styles
  listContent: {
    paddingVertical: 8,
  },

  // Suggestion Item Styles
  suggestionItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  suggestionItemPressed: {
    backgroundColor: COLORS.grayLight,
  },
  suggestionContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  suggestionIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.paraBrandLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recentIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.grayLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  suggestionTextContainer: {
    flex: 1,
    gap: 2,
  },
  suggestionName: {
    fontFamily: 'Inter',
    fontWeight: '600',
    fontSize: 16,
    color: COLORS.textDark900,
  },
  suggestionAddress: {
    fontFamily: 'Inter',
    fontSize: 13,
    color: COLORS.textGray,
    lineHeight: 18,
  },

  // Section Styles
  quickSection: {
    paddingTop: 8,
  },
  recentSection: {
    paddingTop: 8,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sectionTitle: {
    fontFamily: 'Inter',
    fontWeight: '600',
    fontSize: 14,
    color: COLORS.textGray,
  },

  // Loading Styles
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 12,
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
    paddingHorizontal: 32,
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
  },
});

export default MapSearchScreen;
