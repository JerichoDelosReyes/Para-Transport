import { useMemo, useState, useEffect } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, Modal, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import JeepIllustration from '../../assets/illustrations/welcomeScreen-jeep.svg';
import { ROUTES } from '../../constants/routes';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../../constants/theme';

export default function PlannerScreen() {
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  const [selectedRoute, setSelectedRoute] = useState<any>(null);
  const [isModalVisible, setModalVisible] = useState(false);

  // Suggestions for autocomplete functionality
  const originSuggestions = ROUTES.map(r => r.legs[0].from).filter((v, i, a) => a.indexOf(v) === i && v.toLowerCase().includes(origin.toLowerCase())).filter(Boolean);
  const destSuggestions = ROUTES.map(r => r.legs[r.legs.length-1].to).filter((v, i, a) => a.indexOf(v) === i && v.toLowerCase().includes(destination.toLowerCase())).filter(Boolean);

  const canSearch = origin.trim().length > 0 && destination.trim().length > 0;

  const handleSearch = () => {
    if (!canSearch) return;
    setSubmitted(true);
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
    }, 1500); // Shimmer wait
  };

  const results = useMemo(() => {
    if (!submitted) return [];
    
    const o = origin.trim().toLowerCase();
    const d = destination.trim().toLowerCase();

    return ROUTES.filter((route) => {
      const matchO = o.length === 0 || route.name.toLowerCase().includes(o) || route.legs[0].from.toLowerCase().includes(o);
      const matchD = d.length === 0 || route.name.toLowerCase().includes(d) || route.legs[route.legs.length-1].to.toLowerCase().includes(d);
      return matchO && matchD;
    });
  }, [origin, destination, submitted]);

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
              onChangeText={(text) => { setOrigin(text); setSubmitted(false); }}
              placeholder="Where are you now?"
              placeholderTextColor={COLORS.textMuted}
            />
          </View>
          {origin.length > 0 && origin.length < 5 && originSuggestions.length > 0 && !submitted && (
            <View style={styles.suggestionsBox}>
              {originSuggestions.slice(0,3).map((s,i) => (
                <TouchableOpacity key={i} onPress={() => {setOrigin(s);}} style={styles.suggestionItem}>
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
              onChangeText={(text) => { setDestination(text); setSubmitted(false); }}
              placeholder="Where are you going?"
              placeholderTextColor={COLORS.textMuted}
            />
          </View>
          {destination.length > 0 && destination.length < 5 && destSuggestions.length > 0 && !submitted && (
            <View style={styles.suggestionsBox}>
              {destSuggestions.slice(0,3).map((s,i) => (
                <TouchableOpacity key={i} onPress={() => {setDestination(s);}} style={styles.suggestionItem}>
                  <Text>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <TouchableOpacity 
            style={[styles.searchButton, !canSearch && { opacity: 0.5 }]} 
            onPress={handleSearch} 
            activeOpacity={0.9}
            disabled={!canSearch}
          >
            <Text style={styles.searchButtonText}>SEARCH</Text>
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

            {isLoading ? (
              <View style={styles.skeletonContainer}>
                 {[1,2,3].map((s) => (
                    <View key={s} style={styles.skeletonCard}>
                       <ActivityIndicator size="small" color={COLORS.navy}/>
                       <Text style={styles.skeletonText}>Loading route...</Text>
                    </View>
                 ))}
              </View>
            ) : results.length === 0 ? (
              <View style={styles.resultCard}>
                <Text style={styles.resultTitle}>No routes found</Text>
                <Text style={styles.resultMeta}>Try nearby landmarks or shorter city names.</Text>
              </View>
            ) : (
              results.map((route: any) => (
                <TouchableOpacity key={route.id} style={styles.resultCard} onPress={() => {
                  setSelectedRoute(route);
                  setModalVisible(true);
                }}>
                  <Text style={styles.resultTitle}>{route.name}</Text>
                  <Text style={styles.resultMeta}>
                    {route.legs.map((leg: any) => leg.mode).join(' • ')}
                  </Text>
                  <View style={styles.resultFooter}>
                    <Text style={styles.resultBadge}>₱{route.total_fare.toFixed(2)}</Text>
                    <Text style={styles.resultTime}>{route.estimated_minutes} min</Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}
      </ScrollView>

      <Modal visible={isModalVisible} animationType="slide" transparent>
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            {selectedRoute && (
              <>
                <Text style={styles.modalTitle}>{selectedRoute.name}</Text>
                <Text style={styles.modalText}>Fare: ₱{selectedRoute.total_fare.toFixed(2)}</Text>
                <Text style={styles.modalText}>Time: {selectedRoute.estimated_minutes} mins</Text>
                <Text style={styles.modalText}>Distance: {selectedRoute.total_km} km</Text>
                <Text style={styles.modalSubtitle}>Directions:</Text>
                {selectedRoute.legs.map((leg: any, i: number) => (
                  <Text key={i} style={styles.modalText}>- {leg.instructions}</Text>
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
  suggestionsBox: { backgroundColor: '#fff', marginHorizontal: 10, borderRadius: 5, padding: 5, marginTop: 5 },
  suggestionItem: { padding: 8, borderBottomWidth: 1, borderBottomColor: '#eee' },
  skeletonContainer: { gap: 10 },
  skeletonCard: { backgroundColor: '#f0f0f0', padding: 20, borderRadius: 10, flexDirection: 'row', alignItems: 'center' },
  skeletonText: { marginLeft: 10, color: '#aaa' },
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
  sectionHeading: {
    fontFamily: 'Cubao',
    fontSize: 24,
    color: COLORS.navy,
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
});
