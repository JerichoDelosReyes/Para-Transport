import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../../store/useStore';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../../constants/theme';

export default function ProfileScreen() {
  const user = useStore((state) => state.user);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>PROFILE</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.card}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={26} color={COLORS.navy} />
          </View>
          <Text style={styles.name}>{user.name}</Text>
          <Text style={styles.email}>{user.email}</Text>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.smallCard}>
            <Text style={styles.smallLabel}>Points</Text>
            <Text style={styles.smallValue}>{user.points}</Text>
          </View>
          <View style={styles.smallCard}>
            <Text style={styles.smallLabel}>Streak</Text>
            <Text style={styles.smallValue}>{user.streak_count}</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.button} activeOpacity={0.9}>
          <Text style={styles.buttonText}>Edit Profile</Text>
        </TouchableOpacity>
      </View>
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
    gap: SPACING.sectionGap,
  },
  card: {
    borderRadius: RADIUS.card,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center',
    padding: SPACING.cardPadding,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFF5CC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    marginTop: 10,
    fontFamily: 'Cubao',
    fontSize: 30,
    color: COLORS.navy,
  },
  email: {
    marginTop: 2,
    fontFamily: 'Inter',
    fontSize: TYPOGRAPHY.label,
    color: COLORS.textMuted,
  },
  statsRow: {
    flexDirection: 'row',
    gap: SPACING.cardGap,
  },
  smallCard: {
    flex: 1,
    borderRadius: RADIUS.card,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    padding: SPACING.cardPadding,
  },
  smallLabel: {
    fontFamily: 'Inter',
    fontSize: TYPOGRAPHY.label,
    color: COLORS.textLabel,
  },
  smallValue: {
    marginTop: 6,
    fontFamily: 'Cubao',
    fontSize: 28,
    color: COLORS.navy,
  },
  button: {
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
  buttonText: {
    fontFamily: 'Inter',
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.navy,
  },
});
