import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ScrollView, Image, Alert } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useStore } from '../store/useStore';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../constants/theme';
import { BADGES } from '../constants/badges';
import { BADGE_IMAGES } from '../constants/badgeImages';

function getInitials(name: string) {
  if (!name) return 'PR';
  const parts = name.split(' ');
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const user = useStore((state) => state.user);
  const isGuestAccount = (user?.email || '').trim().toLowerCase() === 'guest@para.ph';

  return (
    <View style={styles.screen}>
      <View style={[styles.topSection, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
            <View style={styles.iconButtonCircle}>
              <Ionicons name="chevron-back" size={24} color={COLORS.navy} />
            </View>
          </TouchableOpacity>
          <Text style={styles.headerTitleText}>PROFILE</Text>
          <TouchableOpacity onPress={() => router.navigate('/settings')} style={styles.iconButton}>
            <View style={styles.iconButtonCircle}>
              <Ionicons name="settings-outline" size={24} color={COLORS.navy} />
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.bottomSection}>
        <ScrollView 
          style={styles.scrollArea}
          contentContainerStyle={[styles.contentContainer, { paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Avatar Area */}
          <View style={styles.avatarSection}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{getInitials(user?.full_name || '')}</Text>
            </View>
          </View>

          {/* Top Info Area */}
          <View style={styles.infoArea}>
            <View style={styles.userInfo}>
              <Text style={styles.name}>{user?.full_name || 'Passenger'}</Text>
            </View>

            <View style={styles.quickStatsRow}>
              <TouchableOpacity 
                style={[styles.quickStat, { flexDirection: 'row', gap: 6, alignItems: 'center' }]}
                onPress={() => router.navigate('/broadcasts')}
                activeOpacity={0.7}
              >
                <Ionicons name="radio" size={24} color={COLORS.navy} />
              </TouchableOpacity>

              <View style={styles.quickStatDivider} />

              <TouchableOpacity 
                style={[styles.quickStat, isGuestAccount && { opacity: 0.5 }]}
                onPress={() => isGuestAccount && Alert.alert('Guest Mode', 'Points feature is not available for guest mode.')}
                activeOpacity={isGuestAccount ? 0.8 : 1}
                disabled={!isGuestAccount}
              >
                <Text style={styles.quickStatValue}>{user?.points || 0}</Text>
                <Text style={styles.quickStatLabel}>Points</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Grid Stats */}
          <View style={styles.gridStats}>
            <View style={styles.gridCard}>
              <View style={styles.gridIconContainer}>
                <Text style={styles.gridIconText}>🚗</Text>
              </View>
              <Text style={styles.gridValue}>{user?.total_trips || 0}</Text>
              <Text style={styles.gridLabel}>Total Trips</Text>
            </View>
            
            <View style={styles.gridCard}>
              <View style={styles.gridIconContainer}>
                <Text style={styles.gridIconText}>📍</Text>
              </View>
              <Text style={styles.gridValue}>{(user?.total_distance || 0).toFixed(1)} <Text style={styles.gridValueSmall}>km</Text></Text>
              <Text style={styles.gridLabel}>Distance</Text>
            </View>
            
            <View style={styles.gridCard}>
              <View style={styles.gridIconContainer}>
                <Text style={styles.gridIconText}>💰</Text>
              </View>
              <Text style={styles.gridValue}><Text style={styles.gridValueSmall}>₱</Text>{(user?.spent || 0).toFixed(0)}</Text>
              <Text style={styles.gridLabel}>Total Fare</Text>
            </View>

            <View style={styles.gridCard}>
              <View style={styles.gridIconContainer}>
                <Text style={styles.gridIconText}>🔥</Text>
              </View>
              <Text style={styles.gridValue}>{user?.streak_count || 0}</Text>
              <Text style={styles.gridLabel}>Current Streak</Text>
            </View>
          </View>

          {/* Badges Section */}
          <View style={[styles.sectionHeaderContainer, isGuestAccount && { opacity: 0.5 }]}>
            <Text style={styles.sectionTitle}>Badges</Text>
            <TouchableOpacity onPress={() => isGuestAccount ? Alert.alert('Guest Mode', 'Badges feature is not available for guest mode.') : router.navigate('/achievements')}>
              <Text style={styles.sectionLink}>View All</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.badgesWrapper, isGuestAccount && { opacity: 0.5 }]}>
            {BADGES.slice(0, 3).map((badge) => {
              const isEarned = user?.badges?.includes(badge.id) || false;
              return (
                <TouchableOpacity 
                  key={badge.id} 
                  style={[styles.badgeCard, !isEarned && styles.badgeLocked]}
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
                  <Text style={[styles.badgeName, !isEarned && { color: COLORS.textMuted }]}>{badge.name}</Text>
                  {!isEarned && (
                    <View style={styles.lockOverlay}>
                      <Ionicons name="lock-closed" size={14} color={COLORS.textMuted} />
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
    width: 50,
    height: 50,
    borderRadius: 25,
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
