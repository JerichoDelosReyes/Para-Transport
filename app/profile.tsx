import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ScrollView, Image } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useStore } from '../store/useStore';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../constants/theme';

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
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const user = useStore((state) => state.user);

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
          <TouchableOpacity onPress={() => router.push('/settings')} style={styles.iconButton}>
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
              <Text style={styles.avatarText}>{getInitials(user?.name || '')}</Text>
            </View>
          </View>

          {/* Top Info Area */}
          <View style={styles.infoArea}>
            <View style={styles.userInfo}>
              <Text style={styles.name}>{user?.name || 'Passenger'}</Text>
              <Text style={styles.email}>{user?.email || 'user@example.com'}</Text>
            </View>

            <View style={styles.quickStatsRow}>
              <View style={styles.quickStat}>
                <Text style={styles.quickStatValue}>{user?.points || 0}</Text>
                <Text style={styles.quickStatLabel}>Points</Text>
              </View>
              <View style={styles.quickStatDivider} />
              <View style={styles.quickStat}>
                <Text style={styles.quickStatValue}>{user?.streak_count || 0}</Text>
                <Text style={styles.quickStatLabel}>Streak</Text>
              </View>
            </View>
          </View>

          {/* Grid Stats */}
          <View style={styles.gridStats}>
            <View style={styles.gridCard}>
              <View style={styles.gridIconContainer}>
                <Text style={styles.gridIconText}>🚗</Text>
              </View>
              <Text style={styles.gridValue}>{(user as any)?.trips || 0}</Text>
              <Text style={styles.gridLabel}>Total Trips</Text>
            </View>
            
            <View style={styles.gridCard}>
              <View style={styles.gridIconContainer}>
                <Text style={styles.gridIconText}>📍</Text>
              </View>
              <Text style={styles.gridValue}>{((user as any)?.distance || 0).toFixed(1)} <Text style={styles.gridValueSmall}>km</Text></Text>
              <Text style={styles.gridLabel}>Distance</Text>
            </View>
            
            <View style={styles.gridCard}>
              <View style={styles.gridIconContainer}>
                <Text style={styles.gridIconText}>💰</Text>
              </View>
              <Text style={styles.gridValue}><Text style={styles.gridValueSmall}>₱</Text>{((user as any)?.spent || 0).toFixed(0)}</Text>
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
          <View style={styles.sectionHeaderContainer}>
            <Text style={styles.sectionTitle}>Badges</Text>
            <TouchableOpacity>
              <Text style={styles.sectionLink}>View All</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.badgesWrapper}>
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
  email: {
    fontFamily: 'Inter',
    fontSize: 14,
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
  badgeLocked: {
    backgroundColor: 'rgba(0,0,0,0.02)',
  },
  badgeEmoji: {
    fontSize: 32,
    marginBottom: 8,
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
