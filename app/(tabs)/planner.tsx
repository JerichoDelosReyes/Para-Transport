import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, Modal, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import JeepIllustration from '../../assets/illustrations/welcomeScreen-jeep.svg';
import {
  getTransitPlaceSuggestions,
  PlannedRouteOption,
  searchTransitRoutes,
} from '../../services/transitSearch';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../../constants/theme';

export default function PlannerScreen() {
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [selectedRoute, setSelectedRoute] = useState<PlannedRouteOption | null>(null);
  const [isModalVisible, setModalVisible] = useState(false);
  const [results, setResults] = useState<PlannedRouteOption[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resolvedLocations, setResolvedLocations] = useState<{ origin: string; destination: string } | null>(null);
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    let mounted = true;

    const requestLocation = async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== 'granted') {
          return;
        }

        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        if (!mounted) {
          return;
        }

        setCurrentLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      } catch (error) {
        console.warn('[PlannerScreen] Location permission or lookup failed:', error);
      }
    };

    requestLocation();

    return () => {
      mounted = false;
    };
  }, []);

  const originSuggestions = useMemo(
    () => getTransitPlaceSuggestions(origin, 4),
    [origin]
  );

  const destinationSuggestions = useMemo(
    () => getTransitPlaceSuggestions(destination, 4),
    [destination]
  );

  const canSearch = destination.trim().length > 1 && (origin.trim().length > 0 || Boolean(currentLocation));

  const handleSearch = async () => {
    if (!canSearch) return;

    setSubmitted(true);
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const searchResult = await searchTransitRoutes({
        originQuery: origin,
        destinationQuery: destination,
        currentLocation,
      });

      setResults(searchResult.options);
      setResolvedLocations({
        origin: searchResult.origin.label,
        destination: searchResult.destination.label,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Route search failed.';
      setResults([]);
      setResolvedLocations(null);
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>PLAN ROUTE</Text>
      </View>

      <ScrollView style={{ flex: 1, backgroundColor: COLORS.background }} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.formCard}>
          <View style={styles.inputWrap}>
            <Ionicons name="location" size={18} color={COLORS.navy} />
            <TextInput
              style={styles.input}
              value={origin}
              onChangeText={(text) => {
                setOrigin(text);
                setSubmitted(false);
                setErrorMessage(null);
              }}
              placeholder={currentLocation ? 'Where are you now? (optional)' : 'Where are you now?'}
              placeholderTextColor={COLORS.textMuted}
            />
          </View>

          <TouchableOpacity
            style={[styles.locationHint, !currentLocation && styles.locationHintDisabled]}
            onPress={() => {
              if (currentLocation) {
                setOrigin('Current Location');
                setSubmitted(false);
                setErrorMessage(null);
              }
            }}
            disabled={!currentLocation}
          >
            <Ionicons name="locate" size={14} color={currentLocation ? COLORS.navy : COLORS.textMuted} />
            <Text style={[styles.locationHintText, !currentLocation && styles.locationHintTextDisabled]}>
              {currentLocation ? 'Use Current Location as Origin' : 'Enable location to use current position'}
            </Text>
          </TouchableOpacity>

          {origin.length > 0 && originSuggestions.length > 0 && !submitted && (
            <View style={styles.suggestionsBox}>
              {originSuggestions.slice(0, 3).map((s, i) => (
                <TouchableOpacity key={i} onPress={() => { setOrigin(s); }} style={styles.suggestionItem}>
                  <Text>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={styles.swapWrap}>
            <TouchableOpacity
              style={styles.swapButton}
              onPress={() => {
                const temp = origin;
                setOrigin(destination);
                setDestination(temp);
                setSubmitted(false);
              }}
              activeOpacity={0.9}
            >
              <Ionicons name="swap-vertical" size={16} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <View style={styles.inputWrap}>
            <Ionicons name="flag" size={18} color={COLORS.navy} />
            <TextInput
              style={styles.input}
              value={destination}
              onChangeText={(text) => {
                setDestination(text);
                setSubmitted(false);
                setErrorMessage(null);
              }}
              placeholder="Where are you going?"
              placeholderTextColor={COLORS.textMuted}
            />
          </View>
          {destination.length > 0 && destinationSuggestions.length > 0 && !submitted && (
            <View style={styles.suggestionsBox}>
              {destinationSuggestions.slice(0, 3).map((s, i) => (
                <TouchableOpacity key={i} onPress={() => { setDestination(s); }} style={styles.suggestionItem}>
                  <Text>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <TouchableOpacity 
            style={[styles.searchButton, (!canSearch || isLoading) && { opacity: 0.5 }]} 
            onPress={handleSearch} 
            activeOpacity={0.9}
            disabled={!canSearch || isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color={COLORS.navy} />
            ) : (
              <Text style={styles.searchButtonText}>SEARCH</Text>
            )}
          </TouchableOpacity>
        </View>

        {!submitted && (
          <View style={styles.emptyWrap}>
            <JeepIllustration width={220} height={150} />
            <Text style={styles.emptyTitle}>Saan tayo?</Text>
            <Text style={styles.emptySubtitle}>Set your start and destination to get route options.</Text>
          </View>
        )}

        {submitted && (
          <View style={styles.resultsWrap}>
            <Text style={styles.sectionHeading}>ROUTE RESULTS</Text>

            {resolvedLocations && (
              <Text style={styles.resolvedLabel}>
                {resolvedLocations.origin} to {resolvedLocations.destination}
              </Text>
            )}

            {isLoading ? (
              <View style={styles.skeletonContainer}>
                 {[1,2,3].map((s) => (
                    <View key={s} style={styles.skeletonCard}>
                       <ActivityIndicator size="small" color={COLORS.navy}/>
                       <Text style={styles.skeletonText}>Loading route...</Text>
                    </View>
                 ))}
              </View>
            ) : errorMessage ? (
              <View style={styles.resultCard}>
                <Text style={styles.resultTitle}>Search error</Text>
                <Text style={styles.resultMeta}>{errorMessage}</Text>
              </View>
            ) : results.length === 0 ? (
              <View style={styles.resultCard}>
                <Text style={styles.resultTitle}>No routes found</Text>
                <Text style={styles.resultMeta}>Try nearby landmarks or shorter city names.</Text>
              </View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.horizontalDrawer}
              >
                {results.map((route, idx) => (
                  <TouchableOpacity
                    key={route.id}
                    style={[styles.resultCard, styles.drawerCard, idx === 0 && styles.recommendedCard]}
                    onPress={() => {
                      setSelectedRoute(route);
                      setModalVisible(true);
                    }}
                  >
                    <View style={styles.tagRow}>
                      {route.summaryTags.map((tag) => (
                        <Text key={`${route.id}-${tag}`} style={styles.summaryTag}>{tag}</Text>
                      ))}
                    </View>

                    <Text style={styles.resultTitle}>{route.title}</Text>
                    <Text style={styles.resultMeta}>{route.subtitle}</Text>

                    <View style={styles.resultFooter}>
                      <Text style={styles.resultBadge}>₱{route.totalFare.toFixed(2)}</Text>
                      <Text style={styles.resultTime}>{route.estimatedMinutes} min</Text>
                    </View>

                    <Text style={styles.routeMiniMeta}>
                      {route.totalDistanceKm.toFixed(1)} km • {route.transferCount} transfer{route.transferCount === 1 ? '' : 's'} • {route.walkingMeters} m walk
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        )}
      </ScrollView>

      <Modal visible={isModalVisible} animationType="slide" transparent>
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            {selectedRoute && (
              <>
                <Text style={styles.modalTitle}>{selectedRoute.title}</Text>
                <Text style={styles.modalText}>Fare: ₱{selectedRoute.totalFare.toFixed(2)}</Text>
                <Text style={styles.modalText}>Time: {selectedRoute.estimatedMinutes} mins</Text>
                <Text style={styles.modalText}>Distance: {selectedRoute.totalDistanceKm.toFixed(1)} km</Text>
                <Text style={styles.modalText}>Walking: {selectedRoute.walkingMeters} m</Text>
                {selectedRoute.transferDescription ? (
                  <Text style={styles.modalText}>Transfer: {selectedRoute.transferDescription}</Text>
                ) : null}

                <Text style={styles.modalSubtitle}>Legs:</Text>
                {selectedRoute.legs.map((leg, i) => (
                  <Text key={`${leg.routeId}-${i}`} style={styles.modalText}>
                    {i + 1}. {leg.signboard}: {leg.boardAt} to {leg.alightAt} ({leg.distanceKm.toFixed(1)} km, {leg.estimatedMinutes} min, ₱{leg.fare})
                  </Text>
                ))}

                <Text style={styles.modalSubtitle}>Directions:</Text>
                {selectedRoute.directions.map((instruction, i) => (
                  <Text key={i} style={styles.modalText}>- {instruction}</Text>
                ))}
                <TouchableOpacity style={styles.closeButton} onPress={() => setModalVisible(false)}>
                  <Text style={styles.closeButtonText}>Close Route</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  locationHint: {
    marginTop: 8,
    marginHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  locationHintDisabled: {
    opacity: 0.65,
  },
  locationHintText: {
    fontFamily: 'Inter',
    fontSize: 12,
    color: COLORS.navy,
  },
  locationHintTextDisabled: {
    color: COLORS.textMuted,
  },
  suggestionsBox: { backgroundColor: '#fff', marginHorizontal: 10, borderRadius: 5, padding: 5, marginTop: 5 },
  suggestionItem: { padding: 8, borderBottomWidth: 1, borderBottomColor: '#eee' },
  skeletonContainer: { gap: 10 },
  skeletonCard: { backgroundColor: '#f0f0f0', padding: 20, borderRadius: 10, flexDirection: 'row', alignItems: 'center' },
  skeletonText: { marginLeft: 10, color: '#aaa' },
  resolvedLabel: {
    marginTop: -2,
    marginBottom: 2,
    fontFamily: 'Inter',
    color: COLORS.textMuted,
    fontSize: TYPOGRAPHY.label,
  },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#fff', padding: 20, borderRadius: 10 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 10 },
  modalSubtitle: { fontSize: 16, fontWeight: 'bold', marginTop: 15, marginBottom: 5 },
  modalText: { fontSize: 14, marginBottom: 5 },
  closeButton: { marginTop: 20, padding: 10, backgroundColor: COLORS.navy, borderRadius: 5, alignItems: 'center' },
  closeButtonText: { color: '#fff', fontWeight: 'bold' },
  screen: {
    flex: 1,
    backgroundColor: COLORS.primary,
  },
  header: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.screenX,
    paddingTop: 10,
    paddingBottom: 16,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  headerTitle: {
    fontFamily: 'Cubao',
    fontSize: TYPOGRAPHY.screenTitle,
    color: COLORS.navy,
  },
  content: {
    paddingHorizontal: SPACING.screenX,
    paddingTop: 20,
    paddingBottom: 24,
    gap: SPACING.sectionGap,
  },
  formCard: {
    borderRadius: RADIUS.card,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    padding: SPACING.cardPadding,
  },
  inputWrap: {
    height: 52,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    marginLeft: 8,
    fontFamily: 'Inter',
    fontSize: TYPOGRAPHY.body,
    color: COLORS.textStrong,
  },
  swapWrap: {
    alignItems: 'center',
    marginVertical: 8,
  },
  swapButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchButton: {
    marginTop: 12,
    height: 56,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchButtonText: {
    fontFamily: 'Cubao',
    fontSize: 24,
    color: COLORS.navy,
  },
  emptyWrap: {
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    padding: SPACING.cardPadding,
  },
  emptyTitle: {
    marginTop: 6,
    fontFamily: 'Cubao',
    color: COLORS.navy,
    fontSize: 26,
  },
  emptySubtitle: {
    marginTop: 4,
    textAlign: 'center',
    fontFamily: 'Inter',
    fontSize: TYPOGRAPHY.label,
    color: COLORS.textMuted,
  },
  resultsWrap: {
    gap: SPACING.cardGap,
  },
  horizontalDrawer: {
    gap: 12,
    paddingRight: 8,
  },
  sectionHeading: {
    fontFamily: 'Cubao',
    fontSize: 24,
    color: COLORS.navy,
  },
  drawerCard: {
    width: 280,
  },
  recommendedCard: {
    borderColor: '#E8A020',
    borderWidth: 2,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  summaryTag: {
    fontFamily: 'Inter',
    fontSize: 11,
    color: COLORS.navy,
    backgroundColor: '#FFF5CC',
    borderRadius: RADIUS.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  resultCard: {
    borderRadius: RADIUS.card,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    padding: SPACING.cardPadding,
  },
  resultTitle: {
    fontFamily: 'Inter',
    fontWeight: '700',
    fontSize: TYPOGRAPHY.body,
    color: COLORS.textStrong,
  },
  resultMeta: {
    marginTop: 6,
    fontFamily: 'Inter',
    fontSize: TYPOGRAPHY.label,
    color: COLORS.textMuted,
  },
  resultFooter: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  resultBadge: {
    fontFamily: 'Inter',
    fontWeight: '700',
    fontSize: TYPOGRAPHY.body,
    color: COLORS.navy,
    backgroundColor: '#FFF5CC',
    borderRadius: RADIUS.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  resultTime: {
    fontFamily: 'Inter',
    fontSize: TYPOGRAPHY.label,
    color: COLORS.textLabel,
  },
  routeMiniMeta: {
    marginTop: 10,
    fontFamily: 'Inter',
    fontSize: 12,
    color: COLORS.textMuted,
  },
});
