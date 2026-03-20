import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Keyboard,
  Platform,
  StatusBar,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../constants/theme';
import { fuzzyFilter } from '../utils/fuzzySearch';
import { useRecentSearches, RecentSearch } from '../hooks/useRecentSearches';

const GEOCODING_BASE_URL =
  process.env.EXPO_PUBLIC_GEOCODING_BASE_URL || 'https://nominatim.openstreetmap.org';

export type PlaceResult = {
  id: string;
  title: string;
  subtitle: string;
  latitude: number;
  longitude: number;
};

type SearchScreenProps = {
  visible: boolean;
  currentLocationLabel?: string;
  onClose: () => void;
  onSelectRoute: (origin: PlaceResult | null, destination: PlaceResult) => void;
};

export default function SearchScreen({
  visible,
  currentLocationLabel,
  onClose,
  onSelectRoute,
}: SearchScreenProps) {
  const [activeField, setActiveField] = useState<'origin' | 'destination'>('destination');
  const [originText, setOriginText] = useState('');
  const [destinationText, setDestinationText] = useState('');
  const [usingCurrentLocation, setUsingCurrentLocation] = useState(true);

  const [suggestions, setSuggestions] = useState<PlaceResult[]>([]);
  const [isFetching, setIsFetching] = useState(false);

  const { recents, addRecent } = useRecentSearches();

  const originRef = useRef<TextInput>(null);
  const destRef = useRef<TextInput>(null);

  // Reset state when opened
  useEffect(() => {
    if (visible) {
      setOriginText('');
      setDestinationText('');
      setSuggestions([]);
      setUsingCurrentLocation(true);
      setActiveField('destination');
      setTimeout(() => destRef.current?.focus(), 300);
    }
  }, [visible]);

  // Active query text
  const activeQuery = activeField === 'origin' ? originText : destinationText;

  // Geocoding + fuzzy local search
  useEffect(() => {
    const q = activeQuery.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setIsFetching(false);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setIsFetching(true);

      // Local fuzzy match on recents first
      const localMatches = fuzzyFilter(recents, q, (r) => [r.title, r.subtitle], 3).map(
        (r) => r.item as PlaceResult,
      );

      try {
        const params = new URLSearchParams({
          q: `${q}, Cavite, Philippines`,
          format: 'json',
          limit: '8',
          countrycodes: 'ph',
          addressdetails: '0',
        });

        const res = await fetch(`${GEOCODING_BASE_URL}/search?${params.toString()}`, {
          headers: { 'Accept-Language': 'en' },
        });

        if (!res.ok) throw new Error(`${res.status}`);
        const data = await res.json();
        if (cancelled) return;

        const remote: PlaceResult[] = (Array.isArray(data) ? data : [])
          .map((item: any, idx: number) => {
            const dn = String(item.display_name || '').trim();
            const parts = dn.split(',').map((p: string) => p.trim()).filter(Boolean);
            return {
              id: String(item.place_id || `${idx}`),
              title: parts[0] || q,
              subtitle: parts.slice(1).join(', ') || 'Philippines',
              latitude: parseFloat(item.lat),
              longitude: parseFloat(item.lon),
            };
          })
          .filter((p: PlaceResult) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude));

        // Merge: locals first (deduplicated), then remote
        const seenIds = new Set(localMatches.map((l) => l.id));
        const merged = [
          ...localMatches,
          ...remote.filter((r) => !seenIds.has(r.id)),
        ].slice(0, 10);

        setSuggestions(merged);
      } catch {
        if (!cancelled) {
          // Fall back to local results only
          setSuggestions(localMatches);
        }
      } finally {
        if (!cancelled) setIsFetching(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [activeQuery, activeField, recents]);

  const handleSelectPlace = useCallback(
    (place: PlaceResult) => {
      addRecent(place);

      if (activeField === 'origin') {
        setOriginText(place.title);
        setUsingCurrentLocation(false);
        setActiveField('destination');
        setTimeout(() => destRef.current?.focus(), 100);
      } else {
        setDestinationText(place.title);
        // Both fields filled → trigger route
        const origin = usingCurrentLocation ? null : suggestions.find((s) => s.title === originText) || null;
        onSelectRoute(origin, place);
      }
      setSuggestions([]);
    },
    [activeField, originText, usingCurrentLocation, addRecent, onSelectRoute, suggestions],
  );

  const handleRecentPress = useCallback(
    (recent: RecentSearch) => {
      handleSelectPlace(recent);
    },
    [handleSelectPlace],
  );

  

  const displayOrigin = usingCurrentLocation
    ? currentLocationLabel || 'Current Location'
    : originText;

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={styles.container}>
        <SafeAreaView style={styles.safe} edges={['top']}>
          {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="arrow-back" size={24} color={COLORS.navy} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Your Route</Text>
        </View>

        {/* Search Fields */}
        <View style={styles.fieldsContainer}>
          {/* Origin */}
          <View
            style={[
              styles.fieldRow,
              activeField === 'origin' && styles.fieldRowActive,
            ]}
          >
            <View style={[styles.fieldDot, { backgroundColor: '#4A90D9' }]} />
            <TextInput
              ref={originRef}
              style={styles.fieldInput}
              placeholder="Where are you now?"
              placeholderTextColor={COLORS.textMuted}
              value={usingCurrentLocation && !originText ? (currentLocationLabel || 'Current Location') : originText}
              onChangeText={(t) => {
                setOriginText(t);
                if (usingCurrentLocation) {
                  setUsingCurrentLocation(false);
                }
              }}
              onFocus={() => {
                setActiveField('origin');
                if (usingCurrentLocation) {
                  setUsingCurrentLocation(false);
                  setOriginText('');
                }
              }}
              returnKeyType="next"
              onSubmitEditing={() => {
                setActiveField('destination');
                destRef.current?.focus();
              }}
            />
            <TouchableOpacity onPress={() => Alert.alert('Voice Search', 'Speech-to-text integration coming soon!')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="mic" size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Connector dots */}
          <View style={styles.connectorDots}>
            <View style={styles.dot} />
            <View style={styles.dot} />
            <View style={styles.dot} />
          </View>

          {/* Destination */}
          <View
            style={[
              styles.fieldRow,
              activeField === 'destination' && styles.fieldRowActive,
            ]}
          >
            <View style={[styles.fieldDot, { backgroundColor: '#E8A020' }]} />
            <TextInput
              ref={destRef}
              style={styles.fieldInput}
              placeholder="Where are you going?"
              placeholderTextColor={COLORS.textMuted}
              value={destinationText}
              onChangeText={setDestinationText}
              onFocus={() => setActiveField('destination')}
              returnKeyType="search"
              onSubmitEditing={() => {
                if (suggestions.length > 0) {
                  handleSelectPlace(suggestions[0]);
                }
              }}
            />
            <TouchableOpacity onPress={() => Alert.alert('Voice Search', 'Speech-to-text integration coming soon!')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="mic" size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Choose Current Location Button */}
        <TouchableOpacity
          style={styles.currentLocationBtn}
          activeOpacity={0.7}
          onPress={() => {
            if (activeField === 'origin') {
              setUsingCurrentLocation(true);
              setOriginText('');
              setActiveField('destination');
              setTimeout(() => destRef.current?.focus(), 100);
            } else {
              setDestinationText('Current Location');
            }
          }}
        >
          <View style={[styles.resultIcon, { backgroundColor: 'rgba(74,144,217,0.1)', width: 32, height: 32, borderRadius: 16 }]}>
            <Ionicons name="locate" size={16} color="#4A90D9" />
          </View>
          <Text style={[styles.resultTitle, { color: '#4A90D9' }]}>Choose Current Location</Text>
        </TouchableOpacity>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Suggestions or Recents */}
        {activeQuery.trim().length >= 2 ? (
          <>
            {isFetching && suggestions.length === 0 ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color="#E8A020" />
                <Text style={styles.loadingText}>Searching places...</Text>
              </View>
            ) : (
              <FlatList
                data={suggestions}
                keyExtractor={(item) => item.id}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.listContent}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.resultRow}
                    activeOpacity={0.7}
                    onPress={() => handleSelectPlace(item)}
                  >
                    <View style={styles.resultIcon}>
                      <Ionicons name="location" size={18} color="#4A90D9" />
                    </View>
                    <View style={styles.resultTextWrap}>
                      <Text style={styles.resultTitle} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text style={styles.resultSubtitle} numberOfLines={2}>
                        {item.subtitle}
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  !isFetching ? (
                    <Text style={styles.emptyText}>No places found. Try a different search.</Text>
                  ) : null
                }
              />
            )}
          </>
        ) : (
          <>
            {recents.length > 0 && (
              <>
                <View style={styles.sectionHeader}>
                  <Ionicons name="time-outline" size={16} color={COLORS.navy} />
                  <Text style={styles.sectionTitle}>Recent</Text>
                </View>
                <FlatList
                  data={recents}
                  keyExtractor={(item) => item.id}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={styles.listContent}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.resultRow}
                      activeOpacity={0.7}
                      onPress={() => handleRecentPress(item)}
                    >
                      <View style={styles.resultIcon}>
                        <Ionicons name="location" size={18} color="#4A90D9" />
                      </View>
                      <View style={styles.resultTextWrap}>
                        <Text style={styles.resultTitle} numberOfLines={1}>
                          {item.title}
                        </Text>
                        <Text style={styles.resultSubtitle} numberOfLines={2}>
                          {item.subtitle}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  )}
                />
              </>
            )}
          </>
        )}
      </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  safe: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.screenX,
    paddingVertical: 14,
  },
  backBtn: {
    marginRight: 12,
  },
  headerTitle: {
    fontFamily: 'Cubao',
    fontSize: 22,
    color: COLORS.navy,
  },
  fieldsContainer: {
    paddingHorizontal: SPACING.screenX,
    marginBottom: 4,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 50,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  fieldRowActive: {
    borderColor: '#E8A020',
    shadowColor: '#E8A020',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  fieldDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  fieldInput: {
    flex: 1,
    fontFamily: 'Inter',
    fontSize: 15,
    color: COLORS.navy,
    paddingVertical: 0,
  },
  fieldText: {
    flex: 1,
    fontFamily: 'Inter',
    fontSize: 15,
    color: COLORS.textMuted,
  },
  connectorDots: {
    alignItems: 'center',
    paddingLeft: 25,
    gap: 3,
    marginVertical: 2,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(10,22,40,0.2)',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(10,22,40,0.08)',
    marginHorizontal: SPACING.screenX,
    marginTop: 8,
    marginBottom: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SPACING.screenX,
    paddingTop: 16,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontFamily: 'Inter',
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.navy,
  },
  listContent: {
    paddingHorizontal: SPACING.screenX,
  },
  currentLocationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: SPACING.screenX,
  },
  currentLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: SPACING.screenX,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(10,22,40,0.06)',
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(10,22,40,0.06)',
  },
  resultIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(74,144,217,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  resultTextWrap: {
    flex: 1,
  },
  resultTitle: {
    fontFamily: 'Inter',
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.navy,
  },
  resultSubtitle: {
    fontFamily: 'Inter',
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 20,
    paddingHorizontal: SPACING.screenX,
  },
  loadingText: {
    fontFamily: 'Inter',
    fontSize: 13,
    color: COLORS.textMuted,
  },
  emptyText: {
    fontFamily: 'Inter',
    fontSize: 13,
    color: COLORS.textMuted,
    padding: 20,
    textAlign: 'center',
  },
});
