import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../constants/theme';

export default function JourneySummaryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  
  const multiplier = Number(params.multiplier || 1);
  const distance = Number(params.distance || 6).toFixed(1);
  const fare = Number(params.fare || 29).toFixed(2);
  const points = Number(params.points || 35);
  const time = Number(params.time || 15);

  return (
    <View style={styles.screen}>
      <View style={[styles.topSection, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>JOURNEY SUMMARY</Text>
        </View>
      </View>

      <View style={styles.content}>
        <View style={styles.metricsWrap}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Distance</Text>
            <Text style={styles.metricValue}>{distance} km</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Fare</Text>
            <Text style={styles.metricValue}>₱{fare}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Time Elapsed</Text>
            <Text style={styles.metricValue}>{time} min</Text>
          </View>
        </View>

        <View style={styles.pointsCard}>
          <Text style={styles.pointsLabel}>Points Earned</Text>
          <Text style={styles.pointsValue}>+{points}</Text>
          {multiplier > 1 && <Text style={styles.multiplierText}>({multiplier}x Multiplier!)</Text>}
          <Text style={styles.badge}>🏅</Text>
        </View>
      </View>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 24) }]}>
        <TouchableOpacity style={styles.primaryButton} activeOpacity={0.9} onPress={() => router.replace('/(tabs)')}>
          <Text style={styles.primaryText}>Confirm Fare</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  topSection: {
    backgroundColor: COLORS.primary,
    zIndex: 10,
  },
  header: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    height: 64,
  },
  headerTitle: {
    fontFamily: 'Cubao',
    fontSize: TYPOGRAPHY.screenTitle,
    color: '#000000',
  },
  content: {
    flex: 1,
    paddingHorizontal: SPACING.screenX,
    paddingTop: 28,
    gap: SPACING.sectionGap,
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
  multiplierText: {
    fontFamily: "Inter",
    fontSize: 16,
    color: COLORS.primary,
    marginTop: 4,
    textAlign: "center",
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
    paddingTop: 16,
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
});
