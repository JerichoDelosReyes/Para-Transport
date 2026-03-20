import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../constants/theme';
import { useStore } from '../store/useStore';

export default function JourneySummaryScreen() {
  const router = useRouter();
  const route = useStore((state) => state.activeJourneyRoute);
  const originLabel = useStore((state) => state.activeJourneyOriginLabel);
  const destinationLabel = useStore((state) => state.activeJourneyDestinationLabel);

  if (!route) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={{ flex: 1, backgroundColor: COLORS.background }}>
          <View style={styles.content}>
            <Text style={styles.title}>JOURNEY SUMMARY</Text>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>No active route selected.</Text>
              <Text style={styles.metricLabel}>Go back to Planner and pick a route first.</Text>
            </View>
          </View>
          <View style={styles.footer}>
            <TouchableOpacity style={styles.primaryButton} activeOpacity={0.9} onPress={() => router.replace('/(tabs)/planner')}>
              <Text style={styles.primaryText}>Back To Planner</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={{ flex: 1, backgroundColor: COLORS.background }}><View style={styles.content}>
        <Text style={styles.title}>JOURNEY SUMMARY</Text>

        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>{originLabel || 'Origin'}</Text>
          <Text style={styles.metricLabel}>to</Text>
          <Text style={styles.metricLabel}>{destinationLabel || 'Destination'}</Text>
        </View>

        <View style={styles.metricsWrap}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Distance • ETA</Text>
            <Text style={styles.metricValue}>{route.totalDistanceKm.toFixed(1)} km</Text>
            <Text style={styles.metricLabel}>{route.estimatedMinutes} mins</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Fare • Transfers</Text>
            <Text style={styles.metricValue}>₱{route.totalFare.toFixed(2)}</Text>
            <Text style={styles.metricLabel}>{route.transferCount} transfer{route.transferCount === 1 ? '' : 's'}</Text>
          </View>
        </View>

        <View style={styles.pointsCard}>
          <Text style={styles.pointsLabel}>Trip Type</Text>
          <Text style={styles.pointsValue}>{route.type === 'direct' ? 'Direct' : 'Transfer'}</Text>
          <Text style={styles.badge}>🏅</Text>
        </View>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.primaryButton} activeOpacity={0.9} onPress={() => router.push('/journey')}>
          <Text style={styles.primaryText}>Start Guidance</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} activeOpacity={0.9} onPress={() => router.replace('/(tabs)/planner')}>
          <Text style={styles.secondaryText}>Back To Planner</Text>
        </TouchableOpacity>
      </View></View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.primary,
  },
  content: {
    flex: 1,
    paddingHorizontal: SPACING.screenX,
    paddingTop: 28,
    gap: SPACING.sectionGap,
  },
  title: {
    fontFamily: 'Cubao',
    fontSize: TYPOGRAPHY.screenTitle,
    color: COLORS.navy,
  },
  metricsWrap: {
    gap: SPACING.cardGap,
  },
  metricCard: {
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    backgroundColor: COLORS.card,
    padding: SPACING.cardPadding,
  },
  metricLabel: {
    fontFamily: 'Inter',
    fontSize: TYPOGRAPHY.label,
    color: COLORS.textLabel,
  },
  metricValue: {
    marginTop: 6,
    fontFamily: 'Cubao',
    fontSize: 44,
    color: COLORS.navy,
  },
  pointsCard: {
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    backgroundColor: '#FFF5CC',
    padding: SPACING.cardPadding,
    alignItems: 'center',
  },
  pointsLabel: {
    fontFamily: 'Inter',
    fontSize: TYPOGRAPHY.label,
    color: COLORS.textLabel,
  },
  pointsValue: {
    marginTop: 6,
    fontFamily: 'Cubao',
    fontSize: 52,
    color: COLORS.navy,
  },
  badge: {
    marginTop: 4,
    fontSize: 46,
  },
  footer: {
    paddingHorizontal: SPACING.screenX,
    paddingBottom: 24,
    gap: SPACING.cardGap,
  },
  primaryButton: {
    height: 56,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 6,
  },
  primaryText: {
    fontFamily: 'Inter',
    fontSize: TYPOGRAPHY.body,
    fontWeight: '700',
    color: '#0A1628',
  },
  secondaryButton: {
    height: 56,
    borderRadius: RADIUS.pill,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DFDFDF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  secondaryText: {
    fontFamily: 'Inter',
    fontSize: TYPOGRAPHY.body,
    fontWeight: '600',
    color: COLORS.navy,
  },
});
