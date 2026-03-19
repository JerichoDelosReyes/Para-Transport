import { StyleSheet, Text, TouchableOpacity, View, ScrollView, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useNavigation } from 'expo-router';
import { StackActions } from '@react-navigation/native';
import { useStore } from '../../store/useStore';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../../constants/theme';

const MOCK_BADGES = [
  { id: '1', name: 'First Ride', emoji: '🎉', earned: true },
  { id: '2', name: 'Night Owl', emoji: '🦉', earned: true },
  { id: '3', name: 'Early Bird', emoji: '🌅', earned: false },
  { id: '4', name: 'Explorer', emoji: '🗺️', earned: false },
];

function getInitials(name: string) {
  if (!name) return 'PR';
  const parts = name.split(' ');
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

export default function ProfileScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const user = useStore((state) => state.user);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>PROFILE</Text>
      </View>

      <ScrollView 
        style={{ flex: 1, backgroundColor: COLORS.background }} 
        contentContainerStyle={styles.content} 
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.card, styles.identityCard]}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{getInitials(user?.name || '')}</Text>
          </View>
          <View style={styles.identityTextContainer}>
            <Text style={styles.name}>{user?.name || 'Passenger'}</Text>
            <Text style={styles.email}>{user?.email || 'user@example.com'}</Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.smallCard}>
            <Text style={styles.smallLabel}>Points</Text>
            <Text style={styles.smallValue}>{user?.points || 0}</Text>
          </View>
          <View style={styles.smallCard}>
            <Text style={styles.smallLabel}>Streak</Text>
            <View style={styles.streakValueContainer}>
              <Text style={styles.smallValue}>{user?.streak_count || 0}</Text>
              <Text style={styles.streakEmoji}>🔥</Text>
            </View>
          </View>
        </View>

        <Text style={styles.displayHeading}>MY STATS</Text>
        <View style={styles.card}>
          <View style={styles.statRow}>
            <Text style={styles.statRowLabel}>Total Trips</Text>
            <Text style={styles.statRowValue}>{(user as any)?.trips || 0}</Text>
          </View>
          <View style={[styles.statRow, styles.rowDivider]}>
            <Text style={styles.statRowLabel}>Total Distance</Text>
            <Text style={styles.statRowValue}>{((user as any)?.distance || 0).toFixed(1)} km</Text>
          </View>
          <View style={[styles.statRow, styles.rowDivider]}>
            <Text style={styles.statRowLabel}>Total Fare Spent</Text>
            <Text style={styles.statRowValue}>₱ {((user as any)?.spent || 0).toFixed(2)}</Text>
          </View>
        </View>

        <Text style={styles.displayHeading}>BADGES</Text>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          contentContainerStyle={styles.badgesScroll}
        >
          {MOCK_BADGES.map((badge) => (
            <View key={badge.id} style={[styles.badgeCard, !badge.earned && styles.badgeLocked]}>
              <Text style={[styles.badgeEmoji, !badge.earned && { opacity: 0.3 }]}>{badge.emoji}</Text>
              <Text style={[styles.badgeName, !badge.earned && { color: COLORS.textMuted }]}>{badge.name}</Text>
              {!badge.earned && (
                <View style={styles.lockOverlay}>
                  <Ionicons name="lock-closed" size={14} color={COLORS.textMuted} />
                </View>
              )}
            </View>
          ))}
        </ScrollView>

        <Text style={styles.displayHeading}>SETTINGS</Text>
        <View style={[styles.card, styles.settingsCard]}>
          <TouchableOpacity style={styles.settingRow} activeOpacity={0.7}>
            <Text style={styles.settingLabel}>Edit Profile</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
          </TouchableOpacity>
          <View style={[styles.settingRow, styles.rowDivider]}>
            <Text style={styles.settingLabel}>Notifications</Text>
            <Switch 
              trackColor={{ false: 'rgba(0,0,0,0.1)', true: COLORS.primary }}
              thumbColor={COLORS.card}
              value={true}
              style={{ transform: [{ scale: 0.9 }] }}
            />
          </View>
          <TouchableOpacity style={[styles.settingRow, styles.rowDivider]} activeOpacity={0.7}>
            <Text style={styles.settingLabel}>About Para</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.settingRow, styles.rowDivider]} 
            activeOpacity={0.7}
            onPress={() => {
              const parent = navigation.getParent();
              if (parent) {
                parent.dispatch(StackActions.replace('index'));
              } else {
                router.replace('/');
              }
            }}
          >
            <Text style={[styles.settingLabel, { color: '#ff4444' }]}>Log out</Text>
            <Ionicons name="log-out-outline" size={20} color="#ff4444" />
          </TouchableOpacity>
        </View>
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
    paddingTop: 18,
    paddingBottom: 28,
  },
  displayHeading: {
    fontFamily: 'Cubao',
    fontSize: 24,
    color: COLORS.navy,
    letterSpacing: 0.1,
    marginTop: 28,
    marginBottom: 8,
  },
  card: {
    borderRadius: RADIUS.card,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    padding: SPACING.cardPadding,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  identityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginTop: 0,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  avatarText: {
    fontFamily: 'Cubao',
    fontSize: 24,
    color: COLORS.navy,
    letterSpacing: 1,
    paddingTop: 4,
  },
  identityTextContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  name: {
    fontFamily: 'Cubao',
    fontSize: 24,
    color: COLORS.navy,
    letterSpacing: 0.5,
  },
  email: {
    marginTop: -2,
    fontFamily: 'Inter',
    fontSize: TYPOGRAPHY.caption,
    color: COLORS.textMuted,
  },
  statsRow: {
    flexDirection: 'row',
    gap: SPACING.cardGap,
    marginTop: 20,
  },
  smallCard: {
    flex: 1,
    borderRadius: RADIUS.card,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    padding: SPACING.cardPadding,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  smallLabel: {
    fontFamily: 'Inter',
    fontSize: TYPOGRAPHY.caption,
    color: COLORS.textMuted,
  },
  streakValueContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  smallValue: {
    marginTop: 4,
    fontFamily: 'Cubao',
    fontSize: 32,
    color: COLORS.navy,
  },
  streakEmoji: {
    fontSize: 16,
    marginLeft: 4,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  statRowLabel: {
    fontFamily: 'Inter',
    fontSize: TYPOGRAPHY.body,
    color: COLORS.textStrong,
  },
  statRowValue: {
    fontFamily: 'Cubao',
    fontSize: 20,
    color: COLORS.navy,
  },
  rowDivider: {
    borderTopWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  badgesScroll: {
    gap: 12,
    paddingBottom: 4,
  },
  badgeCard: {
    width: 90,
    height: 100,
    borderRadius: RADIUS.card,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  badgeLocked: {
    backgroundColor: 'rgba(0,0,0,0.02)',
  },
  badgeEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  badgeName: {
    fontFamily: 'Inter',
    fontSize: TYPOGRAPHY.caption,
    color: COLORS.navy,
    textAlign: 'center',
  },
  lockOverlay: {
    position: 'absolute',
    top: 6,
    right: 6,
  },
  settingsCard: {
    padding: 0,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 52,
    paddingHorizontal: SPACING.cardPadding,
  },
  settingLabel: {
    fontFamily: 'Inter',
    fontSize: TYPOGRAPHY.body,
    color: COLORS.textStrong,
  },
});
