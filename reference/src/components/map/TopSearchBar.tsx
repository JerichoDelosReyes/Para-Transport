/**
 * TopSearchBar Component
 * 
 * A Pressable search bar that displays Origin → Destination and navigates to SearchScreen.
 * This is part of the "Decoupled Search" architecture - all typing happens on SearchScreen.
 * 
 * @module components/map/TopSearchBar
 */

import React from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  View,
  Text,
} from 'react-native';
import { Search, MapPin, Navigation, ChevronRight, CircleDot } from 'lucide-react-native';

// =============================================================================
// Types
// =============================================================================

interface SelectedLocation {
  name: string;
  displayName?: string;
  coordinates: [number, number];
  isCurrentLocation?: boolean;
}

export interface TopSearchBarProps {
  /** Callback when search bar is pressed - should navigate to SearchScreen */
  onPress: () => void;
  /** Callback when origin field is pressed specifically */
  onOriginPress?: () => void;
  /** Callback when destination field is pressed specifically */
  onDestinationPress?: () => void;
  /** Selected origin location */
  origin?: SelectedLocation | null;
  /** Selected destination location */
  destination?: SelectedLocation | null;
  /** Optional placeholder text for origin */
  originPlaceholder?: string;
  /** Optional placeholder text for destination */
  destinationPlaceholder?: string;
  /** Whether a route search is active */
  isSearchActive?: boolean;
}

// =============================================================================
// Component
// =============================================================================

/**
 * TopSearchBar displays Origin → Destination and navigates to SearchScreen.
 */
export const TopSearchBar: React.FC<TopSearchBarProps> = ({
  onPress,
  onOriginPress,
  onDestinationPress,
  origin,
  destination,
  originPlaceholder = 'Choose origin',
  destinationPlaceholder = 'Where are you going?',
  isSearchActive = false,
}) => {
  const hasOrigin = !!origin;
  const hasDestination = !!destination;

  console.log('[TopSearchBar] Rendering - hasOrigin:', hasOrigin, 'hasDestination:', hasDestination);

  return (
    <View style={styles.wrapper}>
      <TouchableOpacity
        style={styles.capsule}
        onPress={onPress}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Search for a location"
      >
        <Search size={20} color="#6B7280" style={styles.searchIcon} />
        <Text style={styles.placeholderText}>
          {hasDestination ? destination.name : destinationPlaceholder}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

// =============================================================================
// Styles
// =============================================================================

const styles = StyleSheet.create({
  wrapper: {
    paddingTop: 8,
    paddingBottom: 12,
    paddingHorizontal: 16,
  },
  capsule: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    paddingVertical: 14,
    paddingHorizontal: 18,
    // iOS Shadow
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    // Android Shadow
    elevation: 8,
  },
  searchIcon: {
    marginRight: 12,
  },
  placeholderText: {
    flex: 1,
    fontSize: 16,
    color: '#6B7280',
  },
});

export default TopSearchBar;
