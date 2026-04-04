import { useState, useEffect } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ScrollView, Image, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useStore } from '../store/useStore';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../constants/theme';
import { BADGES } from '../constants/badges';
import { BADGE_IMAGES } from '../constants/badgeImages';
import { useTheme } from '../src/theme/ThemeContext';
import { supabase } from '../config/supabaseClient';

function getInitials(name: string) {
  if (!name) return 'PR';
  const parts = name.split(' ');
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

export default function ProfileScreen() {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const user = useStore((state) => state.user);
  const isGuestAccount = (user?.email || '').trim().toLowerCase() === 'guest@para.ph';

  const [currentUserRank, setCurrentUserRank] = useState<number | null>(null);
  const [isLoadingRank, setIsLoadingRank] = useState<boolean>(true);

  useEffect(() => {
    const fetchRank = async () => {
      if (isGuestAccount || !user?.id) {
        setIsLoadingRank(false);
        return;
      }
      try {
        setIsLoadingRank(true);
        const { data, error } = await supabase.rpc('get_user_global_rank', { 
          target_user_id: user.id, 
          target_points: user.points || 0 
        });
        if (!error && data !== null) {
          setCurrentUserRank(data);
        }
      } catch (err) {
        console.error('Failed to fetch rank:', err);
      } finally {
        setIsLoadingRank(false);
      }
    };
    fetchRank();
  }, [user?.id, user?.points, isGuestAccount]);

  const getRankStyle = (rank: number) => {
    switch (rank) {
      case 1:
        return { backgroundColor: '#FEF08A', color: '#854D0E', emoji: '🥇' }; // Gold
      case 2:
        return { backgroundColor: '#E5E7EB', color: '#374151', emoji: '🥈' }; // Silver
      case 3:
        return { backgroundColor: '#FED7AA', color: '#92400E', emoji: '🥉' }; // Bronze
      default:
        return { backgroundColor: 'rgba(0,0,0,0.04)', color: COLORS.navy, emoji: '🏆' }; // Default
    }
  };

  const rankStyle = currentUserRank !== null ? getRankStyle(currentUserRank) : null;

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <View style={[styles.topSection, { paddingTop: insets.top, backgroundColor: isDark ? '#E8A020' : COLORS.primary }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
            <View style={[styles.iconButtonCircle, { backgroundColor: 'rgba(255, 255, 255, 0.2)' }]}>
              <Ionicons name="chevron-back" size={24} color="#0A1628" />
            </View>
          </TouchableOpacity>
          <Text style={[styles.headerTitleText, { color: '#0A1628' }]}>PROFILE</Text>
          <TouchableOpacity onPress={() => router.navigate('/settings')} style={styles.iconButton}>
            <View style={[styles.iconButtonCircle, { backgroundColor: 'rgba(255, 255, 255, 0.2)' }]}>
              <Ionicons name="settings-outline" size={24} color="#0A1628" />
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.bottomSection, { backgroundColor: theme.background }]}>
        <ScrollView 
          style={styles.scrollArea}
          contentContainerStyle={[styles.contentContainer, { paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Avatar Area */}
          <View style={[styles.avatarSection, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
            <View style={[styles.avatar, { borderColor: theme.background }]}>
              <Text style={styles.avatarText}>{getInitials(user?.username || user?.full_name || '')}</Text>
            </View>

            {/* Leaderboard Placement */}
            {!isGuestAccount && (
              (user?.points || 0) === 0 ? (
                <TouchableOpacity 
                  activeOpacity={0.7} 
                  onPress={() => router.navigate('/achievements')} 
                  style={[styles.rankBadge, { backgroundColor: '#F3F4F6' }]}
                >
                  <Text style={[styles.rankNumber, { color: '#6B7280', fontSize: 13 }]}>Ride to rank!</Text>
                </TouchableOpacity>
              ) : isLoadingRank ? (
                <View style={[styles.rankBadge, { width: 70, height: 42, justifyContent: 'center' }]}>
                  <ActivityIndicator size="small" color={COLORS.navy} />
                </View>
              ) : (currentUserRank !== null && rankStyle !== null) ? (
                <TouchableOpacity 
                  activeOpacity={0.7} 
                  onPress={() => router.navigate('/achievements')} 
                  style={[styles.rankBadge, { backgroundColor: rankStyle.backgroundColor }]}
                >
                  <Text style={styles.rankEmoji}>{rankStyle.emoji}</Text>
                  <Text style={[styles.rankNumber, { color: rankStyle.color }]}>#{currentUserRank}</Text>
                </TouchableOpacity>
              ) : null
            )}
          </View>

          {/* Top Info Area */}
          <View style={styles.infoArea}>
            <View style={styles.userInfo}>
              <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>{user?.full_name || 'Passenger'}</Text>
              {user?.username ? (
                <Text style={[styles.username, { color: theme.textSecondary }]}>@{user.username}</Text>
              ) : null}
            </View>

            <View style={styles.quickStatsRow}>
              <TouchableOpacity 
                style={[styles.quickStat, { flexDirection: 'row', gap: 6, alignItems: 'center' }]}
                onPress={() => router.navigate('/broadcasts')}
                activeOpacity={0.7}
              >
                <Ionicons name="radio" size={24} color={theme.text} />
              </TouchableOpacity>

              {!isGuestAccount && (
                <>
                  <View style={[styles.quickStatDivider, { backgroundColor: theme.cardBorder }]} />

                  <TouchableOpacity 
                    style={styles.quickStat}
                    onPress={() => router.navigate('/points-history')}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.quickStatValue, { color: theme.text }]}>{user?.points || 0}</Text>
                    <Text style={[styles.quickStatLabel, { color: theme.textSecondary }]}>Points</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>

          {/* Grid Stats */}
          <View style={styles.gridStats}>
            <View style={[styles.gridCard, { backgroundColor: theme.cardBackground }]}>
              <View style={[styles.gridIconContainer, { backgroundColor: theme.inputBackground }]}>
                <Text style={styles.gridIconText}>🚗</Text>
              </View>
              <Text style={[styles.gridValue, { color: theme.text }]}>{user?.total_trips || 0}</Text>
              <Text style={[styles.gridLabel, { color: theme.textSecondary }]}>Total Trips</Text>
              {(!user?.total_trips || user.total_trips === 0) && (
                <Text style={[styles.gridPrompt, { color: theme.textSecondary }]}>Take your first ride!</Text>
              )}
            </View>
            
            <View style={[styles.gridCard, { backgroundColor: theme.cardBackground }]}>
              <View style={[styles.gridIconContainer, { backgroundColor: theme.inputBackground }]}>
                <Text style={styles.gridIconText}>📍</Text>
              </View>
              <Text style={[styles.gridValue, { color: theme.text }]}>{(user?.total_distance || 0).toFixed(1)} <Text style={[styles.gridValueSmall, { color: theme.textSecondary }]}>km</Text></Text>
              <Text style={[styles.gridLabel, { color: theme.textSecondary }]}>Distance</Text>
              {(!user?.total_distance || user.total_distance === 0) && (
                <Text style={[styles.gridPrompt, { color: theme.textSecondary }]}>Start exploring!</Text>
              )}
            </View>
            
            <View style={[styles.gridCard, { backgroundColor: theme.cardBackground }]}>
              <View style={[styles.gridIconContainer, { backgroundColor: theme.inputBackground }]}>
                <Text style={styles.gridIconText}>💰</Text>
              </View>
              <Text style={[styles.gridValue, { color: theme.text }]}><Text style={[styles.gridValueSmall, { color: theme.textSecondary }]}>₱</Text>{(user?.spent || 0).toFixed(0)}</Text>
              <Text style={[styles.gridLabel, { color: theme.textSecondary }]}>Total Fare</Text>
              {(!user?.spent || user.spent === 0) && (
                <Text style={[styles.gridPrompt, { color: theme.textSecondary }]}>Save on rides!</Text>
              )}
            </View>

            <View style={[styles.gridCard, { backgroundColor: theme.cardBackground }]}>
              <View style={[styles.gridIconContainer, { backgroundColor: theme.inputBackground }]}>
                <Text style={styles.gridIconText}>🔥</Text>
              </View>
              <Text style={[styles.gridValue, { color: theme.text }]}>{user?.streak_count || 0}</Text>
              <Text style={[styles.gridLabel, { color: theme.textSecondary }]}>Current Streak</Text>
              {(!user?.streak_count || user.streak_count === 0) && (
                <Text style={[styles.gridPrompt, { color: theme.textSecondary }]}>Build your streak!</Text>
              )}
            </View>
          </View>

          {/* Badges Section */}
          <View style={[styles.sectionHeaderContainer, isGuestAccount && { opacity: 0.5 }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Leaderboards and Badges</Text>
            <TouchableOpacity onPress={() => isGuestAccount ? Alert.alert('Guest Mode', 'Badges feature is not available for guest mode.') : router.navigate('/achievements')}>
              <Text style={[styles.sectionLink, { color: theme.accent }]}>View All</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.badgesWrapper, isGuestAccount && { opacity: 0.5 }]}>
            {['route_rookie', 'multi_modal_commuter', 'route_comparator']
              .map(id => BADGES.find(b => b.id === id))
              .filter((b): b is import('../constants/badges').Badge => !!b)
              .map((badge) => {
              const isEarned = user?.badges?.includes(badge.id) || false;
              return (
                <TouchableOpacity 
                  key={badge.id} 
                  style={[styles.badgeCard, { backgroundColor: theme.cardBackground }, !isEarned && styles.badgeLocked]}
                  onPress={() => isGuestAccount && Alert.alert('Guest Mode', 'Badges feature is not available for guest mode.')}
                  activeOpacity={isGuestAccount ? 0.8 : 1}
                  disabled={!isGuestAccount}
                >
                                    <View style={styles.profileIconWrapper}>
                    {BADGE_IMAGES[badge.id] ? (
                      <Image 
                        source={BADGE_IMAGES[badge.id]} 
                        style={[styles.badgeImage, !isEarned && { opacity: 0.3 }]} 
                        resizeMode="contain" 
                      />
                    ) : (
                      <Text style={[styles.badgeEmoji, !isEarned && { opacity: 0.3 }]}>{badge.icon}</Text>
                    )}
                  </View>
                  <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.badgeName, { color: theme.text }, !isEarned && { color: theme.textSecondary }]}>{badge.name}</Text>
                  {!isEarned && (
                    <View style={[styles.lockOverlay, { backgroundColor: theme.inputBackground }]}>
                      <Ionicons name="lock-closed" size={14} color={theme.textSecondary} />
                    </View>
                  )}
                </TouchableOpacity>

              );
            })}
          </View>

        </ScrollView>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.screenX,
    paddingVertical: 14,
    height: 64,
  },
  headerTitleText: {
    fontFamily: 'Cubao',
    fontSize: TYPOGRAPHY.screenTitle,
    color: '#000000',
  },
  iconButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconButtonCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  avatarSection: {
    paddingVertical: 16,
    alignItems: 'flex-start',
  },
  avatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#DE9F35',
    borderWidth: 4,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  avatarText: {
    fontFamily: 'Inter',
    fontWeight: '700',
    fontSize: 32,
    color: COLORS.navy,
  },
  rankBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
  },
  rankEmoji: {
    fontSize: 16,
  },
  rankNumber: {
    fontFamily: 'Inter',
    fontWeight: '600',
    fontSize: 15,
    color: COLORS.navy,
  },
  bottomSection: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollArea: {
    flex: 1,
  },
  contentContainer: {
    paddingTop: 8,
    paddingHorizontal: SPACING.screenX,
  },
  infoArea: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  userInfo: {
    flex: 1,
  },
  name: {
    fontFamily: 'Inter',
    fontWeight: '700',
    fontSize: 22,
    color: COLORS.navy,
    marginBottom: 4,
  },
  username: {
    fontFamily: 'Inter',
    fontSize: 16,
    color: COLORS.textMuted,
  },
  quickStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 16,
  },
  quickStat: {
    alignItems: 'center',
  },
  quickStatValue: {
    fontFamily: 'Cubao',
    fontSize: 20,
    color: COLORS.navy,
  },
  quickStatLabel: {
    fontFamily: 'Inter',
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  quickStatDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(0,0,0,0.1)',
    marginHorizontal: 16,
  },
  gridStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 32,
  },
  gridCard: {
    width: '47%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  gridIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.03)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  gridIconText: {
    fontSize: 16,
  },
  gridValue: {
    fontFamily: 'Cubao',
    fontSize: 26,
    color: COLORS.navy,
    marginBottom: 4,
  },
  gridValueSmall: {
    fontSize: 16,
  },
  gridLabel: {
    fontFamily: 'Inter',
    fontSize: 13,
    color: COLORS.textMuted,
  },
  gridPrompt: {
    fontFamily: 'Inter',
    fontSize: 11,
    fontWeight: '600',
    color: '#E8A020',
    marginTop: 6,
  },
  sectionHeaderContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontFamily: 'Inter',
    fontWeight: '700',
    fontSize: 18,
    color: COLORS.navy,
  },
  sectionLink: {
    fontFamily: 'Inter',
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '600',
  },
  badgesWrapper: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  leaderboardPlacementCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.card,
    padding: 16,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  lbPlacementLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  lbTrophyContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFBEB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lbPlacementTitle: {
    fontFamily: 'Inter',
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.navy,
  },
  lbPlacementSubtitle: {
    fontFamily: 'Inter',
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  lbPlacementRight: {
    alignItems: 'flex-end',
  },
  lbRankValue: {
    fontFamily: 'Inter',
    fontSize: 20,
    fontWeight: '800',
    color: '#D97706',
  },
  badgeCard: {
    width: '31%',
    height: 110,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  profileIconWrapper: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#d5a944',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  badgeImage: {
    width: 35,
    height: 35,
  },
  badgeLocked: {
    backgroundColor: 'rgba(0,0,0,0.02)',
  },
  badgeEmoji: {
    fontSize: 32,
  },
  badgeName: {
    fontFamily: 'Inter',
    fontSize: 12,
    color: COLORS.navy,
    textAlign: 'center',
  },
  lockOverlay: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
});
