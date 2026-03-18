import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import JeepIllustration from '../../assets/illustrations/welcomeScreen-jeep.svg';
import { ROUTES } from '../../constants/routes';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../../constants/theme';

export default function PlannerScreen() {
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const results = useMemo(() => {
    if (!submitted) {
      return [];
    }

    const o = origin.trim().toLowerCase();
    const d = destination.trim().toLowerCase();

    return ROUTES.filter((route) => {
      const name = route.name.toLowerCase();
      const matchesOrigin = o.length === 0 || name.includes(o);
      const matchesDestination = d.length === 0 || name.includes(d);
      return matchesOrigin && matchesDestination;
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
              onChangeText={setOrigin}
              placeholder="Where are you now?"
              placeholderTextColor={COLORS.textMuted}
            />
          </View>

          <View style={styles.swapWrap}>
            <TouchableOpacity
              style={styles.swapButton}
              onPress={() => {
                setOrigin(destination);
                setDestination(origin);
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
              onChangeText={setDestination}
              placeholder="Where are you going?"
              placeholderTextColor={COLORS.textMuted}
            />
          </View>

          <TouchableOpacity style={styles.searchButton} onPress={() => setSubmitted(true)} activeOpacity={0.9}>
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
            {results.length === 0 && (
              <View style={styles.resultCard}>
                <Text style={styles.resultTitle}>No routes found</Text>
                <Text style={styles.resultMeta}>Try nearby landmarks or shorter city names.</Text>
              </View>
            )}

            {results.map((route) => (
              <View key={route.id} style={styles.resultCard}>
                <Text style={styles.resultTitle}>{route.name}</Text>
                <Text style={styles.resultMeta}>
                  {route.legs.map((leg) => leg.mode).join(' • ')}
                </Text>
                <View style={styles.resultFooter}>
                  <Text style={styles.resultBadge}>₱{route.total_fare.toFixed(2)}</Text>
                  <Text style={styles.resultTime}>{route.estimated_minutes} min</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
