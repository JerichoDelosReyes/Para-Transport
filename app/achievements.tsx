import React from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS, SPACING, TYPOGRAPHY, RADIUS } from '../constants/theme';
import { useStore } from '../store/useStore';
import { supabase } from '../config/supabaseClient';

import { BADGE_IMAGES } from '../constants/badgeImages';

export default function AchievementsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const user = useStore((state) => state.user);
  const unlockBadge = useStore((state) => state.unlockBadge);
  const badgesData = useStore((state) => state.badgesData);

  const [leaderboard, setLeaderboard] = React.useState<any[]>([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = React.useState(true);
  const [currentUserRank, setCurrentUserRank] = React.useState<number | null>(null);

  React.useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        setLoadingLeaderboard(true);
        // We use an RPC since RLS prevents users from reading others by default
        const { data, error } = await supabase.rpc('get_top_leaderboard', { limit_val: 3 });
        
        if (error) {
          console.error('Error fetching leaderboard (did you run the SQL migration?):', error);
        } else if (data) {
          setLeaderboard(data);
        }

        if (user && user.id && user.email !== 'guest@para.ph') {
          const { data: rankData, error: rankError } = await supabase.rpc('get_user_global_rank', { 
            target_user_id: user.id, 
            target_points: user.points || 0 
          });
          
          if (!rankError && rankData !== null) {
            setCurrentUserRank(rankData);
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingLeaderboard(false);
      }
    };

    fetchLeaderboard();
  }, [user]);

  const getProgress = (badge: any) => {
    return Number((user as any)[badge.condition_type]) || 0;
  };

  React.useEffect(() => {
    const currentBadges = user.badges || [];
    badgesData.forEach((badge) => {
      if (!currentBadges.includes(badge.id)) {
        const progress = getProgress(badge);
        if (progress >= badge.condition_value) {
          unlockBadge(badge.id);
        }
      }
    });
  }, [user.total_trips, user.total_distance, user.spent, user.streak_count, user.badges, badgesData]);

  return (
    <View style={styles.screen}>
      <View style={[styles.topSection, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
            <View style={styles.iconButtonCircle}>
              <Ionicons name="chevron-back" size={24} color={COLORS.navy} />
            </View>
          </TouchableOpacity>
          <Text style={styles.headerTitleText}>ACHIEVEMENTS</Text>
          <View style={{ width: 44, height: 44 }} />
        </View>
      </View>

      <View style={styles.bottomSection}>
        <ScrollView 
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
        >
          {user?.email !== 'guest@para.ph' && (
            <>
              <View style={styles.sectionHeader}>
                <Ionicons name="trophy" size={24} color="#E8A020" />
                <Text style={styles.sectionTitle}>LEADERBOARD</Text>
              </View>
              
              <View style={styles.leaderboardContainer}>
                {loadingLeaderboard ? (
                  <ActivityIndicator size="small" color={COLORS.primary} style={{ marginTop: 24, marginBottom: 24 }} />
                ) : leaderboard.length === 0 ? (
                  <Text style={styles.emptyText}>No users ranked yet.</Text>
                ) : (
                  <>
                    {leaderboard.map((lbUser, index) => {
                      const isMe = lbUser.id === user?.id;
                      // Determine the name to show 
                      const displayName = lbUser.username ? `${lbUser.username}` : (lbUser.full_name || 'Anonymous User');
                      
                      return (
                        <View key={lbUser.id || index} style={[styles.leaderboardCard, isMe && styles.leaderboardCardMe]}>
                          <View style={[styles.rankContainer, styles.rankContainerTop]}>
                            <Text style={[styles.rankText, styles.rankTextTop]}>#{index + 1}</Text>
                          </View>
                          <View style={styles.lbInfo}>
                            <Text style={[styles.lbName, isMe && styles.lbNameMe]} numberOfLines={1}>
                              {displayName}
                            </Text>
                          </View>
                          <View style={styles.pointsContainer}>
                            <Text style={[styles.pointsText, styles.pointsTextTop]}>{lbUser.points || 0}</Text>
                            <Text style={styles.pointsLabel}>PTS</Text>
                          </View>
                        </View>
                      );
                    })}
                    
                    {user?.points === 0 ? (
                      <>
                        <View style={styles.leaderboardDivider} />
                        <View style={[styles.leaderboardCard, styles.leaderboardCardMe, { borderBottomWidth: 0, justifyContent: 'center' }]}>
                          <Text style={[styles.lbName, { textAlign: 'center', color: '#666', fontStyle: 'italic' }]}>
                            Take your first ride to get on the leaderboard!
                          </Text>
                        </View>
                      </>
                    ) : currentUserRank && user?.id && !leaderboard.some(lb => lb.id === user.id) ? (
                      <>
                        <View style={styles.leaderboardDivider} />
                        <View style={[styles.leaderboardCard, styles.leaderboardCardMe, { borderBottomWidth: 0 }]}>
                          <View style={styles.rankContainer}>
                            <Text style={styles.rankText}>#{currentUserRank}</Text>
                          </View>
                          <View style={styles.lbInfo}>
                            <Text style={[styles.lbName, styles.lbNameMe]} numberOfLines={1}>
                              {user.username ? `${user.username}` : (user.full_name || 'Anonymous User')}
                            </Text>
                          </View>
                          <View style={styles.pointsContainer}>
                            <Text style={styles.pointsText}>{user.points || 0}</Text>
                            <Text style={styles.pointsLabel}>PTS</Text>
                          </View>
                        </View>
                      </>
                    ) : null}
                  </>
                )}
              </View>
            </>
          )}

          <View style={[styles.sectionHeader, user?.email !== 'guest@para.ph' ? { marginTop: 32 } : {}]}>
            <Ionicons name="medal" size={24} color="#E8A020" />
            <Text style={styles.sectionTitle}>BADGES</Text>
          </View>

          <View style={styles.grid}>
            {[...badgesData].sort((a, b) => a.condition_value - b.condition_value).map((badge, idx) => {
              const isEarned = user?.badges?.includes(badge.id) || false;
              const progressValue = isEarned ? badge.condition_value : Math.min(badge.condition_value, getProgress(badge));
              const fillWidth = `${(progressValue / badge.condition_value) * 100}%`;
              const isLocked = !isEarned;

              return (
                <View key={badge.id || idx} style={[styles.card, isLocked && { opacity: 0.7 }]}>
                  <View style={[styles.iconWrapper, isEarned && styles.iconWrapperEarned]}>
                    {badge.icon_url || BADGE_IMAGES[badge.id] ? (
                      <Image 
                        source={(badge.icon_url && badge.icon_url.startsWith('http')) ? { uri: badge.icon_url } : BADGE_IMAGES[badge.id]} 
                        style={[styles.badgeImage, isLocked && { opacity: 0.3 }]} 
                        resizeMode="contain" 
                      />
                    ) : (
                      <Text style={[styles.iconTxt, isLocked && { opacity: 0.3 }]}>
                        🏆
                      </Text>
                    )}
                    {isLocked && (
                      <View style={styles.lockOverlay}>
                        <Ionicons name="lock-closed" size={14} color={COLORS.textMuted} />
                      </View>
                    )}
                  </View>
                  <View style={styles.textWrapper}>
                    <Text style={[styles.badgeName]}>{badge.name}</Text>
                    <Text style={[styles.badgeDesc]}>
                      {badge.description}
                    </Text>
                  </View>
                  
                  <View style={[styles.progressContainer]}>
                    <View style={[styles.progressBar, { width: fillWidth as any }]} />
                  </View>
                </View>
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
  },
  bottomSection: {
    flex: 1,
  },
  content: {
    paddingHorizontal: SPACING.screenX,
    paddingTop: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  sectionTitle: {
    fontFamily: 'Cubao',
    fontSize: 22,
    color: COLORS.navy,
  },
  leaderboardContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.card,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
    marginBottom: 16,
  },
  leaderboardCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.04)',
  },
  leaderboardCardMe: {
    backgroundColor: '#FFFBEB', // Light yellow tint for the user
  },
  leaderboardDivider: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.06)',
    marginHorizontal: 16,
    marginVertical: 4,
  },
  rankContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rankContainerTop: {
    backgroundColor: '#FEF08A',
  },
  rankText: {
    fontFamily: 'Inter',
    fontSize: 14,
    fontWeight: '700',
    color: '#4B5563',
  },
  rankTextTop: {
    color: '#854D0E',
  },
  lbInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  lbName: {
    fontFamily: 'Inter',
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.navy,
  },
  lbNameMe: {
    color: '#D97706',
    fontWeight: '700',
  },
  pointsContainer: {
    alignItems: 'flex-end',
  },
  pointsText: {
    fontFamily: 'Inter',
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.navy,
  },
  pointsTextTop: {
    color: '#B45309',
  },
  pointsLabel: {
    fontFamily: 'Inter',
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  emptyText: {
    fontFamily: 'Inter',
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: 'center',
    padding: 24,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  card: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.card,
    padding: 16,
    alignItems: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  iconWrapper: {
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: '#d5a944',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  iconWrapperEarned: {
    // Keep styling structure
  },
  iconTxt: {
    fontSize: 36,
  },
  badgeImage: {
    width: 60,
    height: 60,
  },
  textWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    minHeight: 44,
  },
  badgeName: {
    fontFamily: 'Inter',
    fontWeight: '700',
    fontSize: 14,
    color: COLORS.navy,
    textAlign: 'center',
    marginBottom: 4,
  },
  badgeDesc: {
    fontFamily: 'Inter',
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 16,
  },
  progressContainer: {
    height: 6,
    backgroundColor: 'rgba(10,22,40,0.1)',
    borderRadius: 3,
    width: '100%',
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#E8A020',
    borderRadius: 3,
  },
  lockOverlay: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.05)',
  }
});