import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../constants/theme';

export default function JourneySummaryScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.screen}>
      <View style={{ flex: 1, backgroundColor: COLORS.background }}><View style={styles.content}>
        <Text style={styles.title}>JOURNEY SUMMARY</Text>

        <View style={styles.metricsWrap}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Distance</Text>
            <Text style={styles.metricValue}>6.0 km</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Fare</Text>
            <Text style={styles.metricValue}>₱29.00</Text>
          </View>
        </View>

        <View style={styles.pointsCard}>
          <Text style={styles.pointsLabel}>Points Earned</Text>
          <Text style={styles.pointsValue}>+35</Text>
          <Text style={styles.badge}>🏅</Text>
        </View>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.primaryButton} activeOpacity={0.9} onPress={() => router.replace('/(tabs)')}>
          <Text style={styles.primaryText}>Confirm Fare</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} activeOpacity={0.9}>
          <Text style={styles.secondaryText}>Share</Text>
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
  secondaryText: {
    fontFamily: 'Inter',
    fontSize: TYPOGRAPHY.body,
    fontWeight: '600',
    color: COLORS.navy,
  },
});
