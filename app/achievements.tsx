import React from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS, SPACING, TYPOGRAPHY } from '../constants/theme';
import { BADGES } from '../constants/badges';
import { useStore } from '../store/useStore';

import { BADGE_IMAGES } from '../constants/badgeImages';

export default function AchievementsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const user = useStore((state) => state.user);
  const unlockBadge = useStore((state) => state.unlockBadge);

  const getProgress = (badgeId: string) => {
    const trips = (user)?.trips || 0;
    const distance = user?.distance || 0;
    const spent = user?.spent || 0;
    const streak = user?.streak_count || 0;

    switch (badgeId) {
      case 'route_rookie': return trips;
      case 'urban_navigator': return trips;
      case 'frequent_rider': return trips;
      case 'ultimate_commuter': return trips;
      case 'long_hauler': return distance;
      case 'thrifty_commuter': return spent;
      case 'dedicated_commuter': return streak;
      case 'habit_builder': return streak;
      default: return 0; // Default active progress for non-tracked yet
    }
  };

  React.useEffect(() => {
    const currentBadges = user.badges || [];
    BADGES.forEach((badge) => {
      if (!currentBadges.includes(badge.id)) {
        const progress = getProgress(badge.id);
        if (progress >= badge.goal) {
          unlockBadge(badge.id);
        }
      }
    });
  }, [user.trips, user.distance, user.spent, user.streak_count, user.badges]);

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={COLORS.navy} />
        </TouchableOpacity>
      </View>
      <ScrollView 
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.logoContainer}>
          <Image 
            source={require('../assets/logo/icon_achievement.png')} 
            style={styles.logoImage} 
            resizeMode="contain" 
          />
        </View>
        <Text style={styles.pageTitle}>ACHIEVEMENT BADGES</Text>
        
        <View style={styles.grid}>
          {BADGES.map((badge, idx) => {
            const isEarned = user?.badges?.includes(badge.id) || false;
            const progressValue = isEarned ? badge.goal : Math.min(badge.goal, getProgress(badge.id));
            const fillWidth = `${(progressValue / badge.goal) * 100}%`;
            const isLocked = !isEarned;

            return (
              <View key={badge.id || idx} style={[styles.card, isLocked && { opacity: 0.6 }]}>
                <View style={[styles.iconWrapper]}>
                  {BADGE_IMAGES[badge.id] ? (
                    <Image 
                      source={BADGE_IMAGES[badge.id]} 
                      style={[styles.badgeImage, isLocked && { opacity: 0.3 }]} 
                      resizeMode="contain" 
                    />
                  ) : (
                    <Text style={[styles.iconTxt, isLocked && { opacity: 0.3 }]}>
                      {badge.icon}
                    </Text>
                  )}
                  {isLocked && (
                    <View style={styles.lockOverlay}>
                      <Ionicons name="lock-closed" size={16} color="#555" />
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
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.primary, // matched the platform header gold
  },
  header: {
    paddingHorizontal: SPACING.screenX,
    paddingBottom: 10,
    zIndex: 10,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    paddingHorizontal: SPACING.screenX,
    paddingTop: 10,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 8,
  },
  logoImage: {
    width: 200, // scaled up for more prominence
    height: 70,
  },
  pageTitle: {
    fontFamily: 'Inter',
    fontWeight: '800',
    fontSize: 22,
    color: '#1A1A2E',
    textAlign: 'center',
    marginBottom: 30,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  card: {
    width: '48%',
    backgroundColor: '#FAF5E3',
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  iconWrapper: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#d5a944',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  iconTxt: {
    fontSize: 45,
  },
  badgeImage: {
    width: 60,
    height: 60,
  },
  textWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    minHeight: 40,
  },
  badgeName: {
    fontFamily: 'Inter',
    fontWeight: '700',
    fontSize: 13,
    color: '#1A1A2E',
    textAlign: 'center',
    marginBottom: 4,
  },
  badgeDesc: {
    fontFamily: 'Inter',
    fontSize: 11,
    color: '#4B4B4B',
    textAlign: 'center',
    lineHeight: 14,
  },
  progressContainer: {
    height: 6,
    backgroundColor: '#D1CBA8',
    borderRadius: 3,
    width: '80%',
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 3,
  },
  lockOverlay: {
    position: 'absolute',
    bottom: -5,
    right: -5,
    backgroundColor: '#E0E0E0',
    borderRadius: 15,
    width: 30,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  }
});