import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import JeepIllustration from '../../assets/illustrations/welcomeScreen-jeep2.svg';
import { ROUTES } from '../../constants/routes';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../../constants/theme';

export default function SavedScreen() {
  const savedRoutes = ROUTES.slice(0, 3);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>SAVED</Text>
      </View>

      <ScrollView style={{ flex: 1, backgroundColor: COLORS.background }} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {savedRoutes.length === 0 && (
          <View style={styles.emptyState}>
            <JeepIllustration width={220} height={150} />
            <Text style={styles.emptyTitle}>Wala pang saved.</Text>
          </View>
        )}

        {savedRoutes.map((route) => (
          <View key={route.id} style={styles.card}>
            <View style={styles.cardTop}>
              <Text style={styles.routeName}>{route.name}</Text>
              <Ionicons name="heart" size={18} color={COLORS.primary} />
            </View>
            <Text style={styles.legSummary}>{route.legs.map((leg) => leg.mode).join(' • ')}</Text>
            <View style={styles.cardBottom}>
              <Text style={styles.fare}>₱{route.total_fare.toFixed(2)}</Text>
              <TouchableOpacity style={styles.ghostButton} activeOpacity={0.9}>
                <Text style={styles.ghostButtonText}>View</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
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
    gap: SPACING.cardGap,
  },
  emptyState: {
    alignItems: 'center',
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    backgroundColor: COLORS.card,
    padding: SPACING.cardPadding,
  },
  emptyTitle: {
    marginTop: 8,
    fontFamily: 'Cubao',
    fontSize: 24,
    color: COLORS.navy,
  },
  card: {
    borderRadius: RADIUS.card,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    padding: SPACING.cardPadding,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  routeName: {
    flex: 1,
    marginRight: 8,
    fontFamily: 'Inter',
    fontWeight: '700',
    fontSize: TYPOGRAPHY.body,
    color: COLORS.textStrong,
  },
  legSummary: {
    marginTop: 6,
    fontFamily: 'Inter',
    fontSize: TYPOGRAPHY.label,
    color: COLORS.textMuted,
  },
  cardBottom: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fare: {
    fontFamily: 'Cubao',
    fontSize: 28,
    color: COLORS.navy,
  },
  ghostButton: {
    borderRadius: RADIUS.pill,
    borderWidth: 1.2,
    borderColor: COLORS.navy,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: COLORS.card,
  },
  ghostButtonText: {
    fontFamily: 'Inter',
    fontSize: TYPOGRAPHY.label,
    fontWeight: '600',
    color: COLORS.navy,
  },
});
