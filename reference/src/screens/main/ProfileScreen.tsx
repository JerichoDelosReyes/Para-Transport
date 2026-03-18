/**
 * ProfileScreen (Me Tab)
 * 
 * User profile dashboard displaying user info, achievements carousel,
 * statistics grid, and menu options.
 * Matches Figma design: node 63-764
 * 
 * @module screens/main/ProfileScreen
 */

import React, { useCallback } from 'react';
import {
  ScrollView,
  StyleSheet,
  Pressable,
  View,
  Image,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  User,
  Share2,
  Settings,
  Trophy,
  ChevronRight,
  Map,
  Bus,
  Building2,
  Star,
  Home,
  Briefcase,
  GraduationCap,
  Armchair,
  House,
  Camera,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';

// Gluestack UI Components
import { Box } from '../../../components/ui/box';
import { Text } from '../../../components/ui/text';
import { VStack } from '../../../components/ui/vstack';
import { HStack } from '../../../components/ui/hstack';

// Auth Context
import { useAuth } from '../../context/AuthContext';

// Achievements Service
import { Achievement } from '../../services/achievements';

// =============================================================================
// Constants
// =============================================================================

/**
 * Brand color tokens (matching gluestack-ui.config.ts and Figma)
 */
const COLORS = {
  white: '#FFFFFF',
  paraBrand: '#E9AE16',
  paraBrandDark: '#A57E1B',
  black: '#1C1B1F',
  grayLight: '#EFF1F5',
  grayMedium: '#A09CAB',
  textDark500: '#6B7280',
  textDark900: '#181818',
  textDark: '#1C1B1F',
  border: '#E5E7EB',
} as const;

/**
 * Icon mapping for achievements
 */
const ACHIEVEMENT_ICONS: Record<string, typeof Home> = {
  home: Home,
  briefcase: Briefcase,
  graduation: GraduationCap,
  armchair: Armchair,
  house: House,
  trophy: Trophy,
};

/**
 * Statistics items for the 2x2 grid (mapped to userPreferencesData.stats keys)
 */
const STATISTICS = [
  {
    id: 'distance',
    icon: Map,
    label: 'Distance Traveled',
    valueKey: 'distanceTraveled',
    unit: 'km',
  },
  {
    id: 'puv',
    icon: Bus,
    label: 'PUVs entered',
    valueKey: 'puvEntered',
    unit: '',
  },
  {
    id: 'places',
    icon: Building2,
    label: 'Places Discovered',
    valueKey: 'placesDiscovered',
    unit: '',
  },
  {
    id: 'level',
    icon: Star,
    label: 'User Level',
    valueKey: 'commuterLevel',
    unit: '',
  },
];

// =============================================================================
// Types
// =============================================================================

export interface ProfileScreenProps {
  navigation?: {
    navigate: (screen: string, params?: Record<string, any>) => void;
  };
}

// =============================================================================
// Sub-Components
// =============================================================================

/**
 * Header Section with Menu title and icons
 */
interface HeaderSectionProps {
  onSettingsPress?: () => void;
}

const HeaderSection: React.FC<HeaderSectionProps> = ({ onSettingsPress }) => {
  return (
    <SafeAreaView edges={['top']} style={styles.headerSafeArea}>
      <View style={styles.headerContainer}>
        <Text style={styles.headerTitle}>Menu</Text>
        <Pressable style={styles.headerIconButton} onPress={onSettingsPress}>
          <Settings size={24} color={COLORS.black} />
        </Pressable>
      </View>
    </SafeAreaView>
  );
};

/**
 * User Profile Card with editable avatar
 */
interface UserProfileCardProps {
  displayName: string | null;
  photoURL: string | null;
  badge: string;
  username?: string | null;
  onAvatarPress?: () => void;
}

const UserProfileCard: React.FC<UserProfileCardProps> = ({
  displayName,
  photoURL,
  badge,
  username,
  onAvatarPress,
}) => {
  const initials = displayName
    ? displayName
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : 'GU';

  return (
    <View style={styles.profileCardContainer}>
      {/* Avatar with Camera Badge */}
      <Pressable onPress={onAvatarPress} style={styles.avatarWrapper}>
        <View style={styles.avatarContainer}>
          {photoURL ? (
            <Image source={{ uri: photoURL }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <User size={24} color={COLORS.textDark} />
            </View>
          )}
        </View>
        {/* Camera Badge */}
        <View style={styles.cameraBadge}>
          <Camera size={14} color={COLORS.white} />
        </View>
      </Pressable>

      {/* User Info */}
      <View style={styles.userInfoContainer}>
        <Text style={styles.userName}>{displayName || 'Guest User'}</Text>
        {username && (
          <Text style={styles.userHandle}>@{username}</Text>
        )}
        <Text style={styles.userBadge}>{badge}</Text>
      </View>

      {/* Share Button */}
      <Pressable style={styles.shareButton}>
        <Share2 size={24} color={COLORS.textDark} />
      </Pressable>
    </View>
  );
};

/**
 * Horizontal Divider
 */
const Divider: React.FC = () => (
  <View style={styles.dividerContainer}>
    <View style={styles.divider} />
  </View>
);

/**
 * Achievements Section with horizontal scroll (dynamic)
 */
interface AchievementsSectionProps {
  achievements: Achievement[];
}

const AchievementsSection: React.FC<AchievementsSectionProps> = ({ achievements }) => {
  return (
    <View style={styles.achievementsContainer}>
      {/* Header */}
      <View style={styles.achievementsHeader}>
        <View style={styles.achievementsTitleRow}>
          <Trophy size={16} color={COLORS.textDark} />
          <Text style={styles.achievementsTitle}>Achievements</Text>
        </View>
        <Pressable>
          <ChevronRight size={10} color={COLORS.textDark} />
        </Pressable>
      </View>

      {/* Achievements Carousel or Empty State */}
      {achievements.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.achievementsScroll}
          nestedScrollEnabled
        >
          {achievements.map((achievement) => {
            const IconComponent = ACHIEVEMENT_ICONS[achievement.icon || 'trophy'] || Trophy;
            return (
              <Pressable key={achievement.id} style={styles.achievementItem}>
                <View style={styles.achievementIconContainer}>
                  <IconComponent size={24} color={COLORS.textDark} />
                </View>
                <Text style={styles.achievementLabel}>{achievement.title}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : (
        <View style={styles.achievementsEmptyState}>
          <Text style={styles.achievementsEmptyText}>
            No achievements yet. Start riding to unlock!
          </Text>
        </View>
      )}
    </View>
  );
};

/**
 * Statistics Title Section
 */
const StatisticsTitleSection: React.FC = () => {
  return (
    <View style={styles.statsTitleContainer}>
      <View style={styles.statsTitleRow}>
        <View style={styles.statsIconWrapper}>
          <View style={styles.statsIconInner}>
            <View style={[styles.statsIconBar, { width: 4, height: 12 }]} />
            <View style={[styles.statsIconBar, { width: 4, height: 8 }]} />
            <View style={[styles.statsIconBar, { width: 4, height: 16 }]} />
          </View>
        </View>
        <Text style={styles.statsTitle}>Statistics</Text>
      </View>
    </View>
  );
};

/**
 * Statistics Grid (2x2)
 */
interface StatisticsGridProps {
  onStatPress: (statType: string, label: string, value: string) => void;
  userStats: Record<string, string | number>;
}

const StatisticsGrid: React.FC<StatisticsGridProps> = ({
  onStatPress,
  userStats,
}) => {
  return (
    <View style={styles.statsGridContainer}>
      <View style={styles.statsGridInner}>
        {/* Row 1 */}
        <View style={styles.statsRow}>
          {STATISTICS.slice(0, 2).map((stat) => {
            const IconComponent = stat.icon;
            const value = userStats[stat.valueKey];
            const displayValue = value
              ? `${value}${stat.unit ? ` ${stat.unit}` : ''}`
              : 'No Data';

            return (
              <Pressable
                key={stat.id}
                style={styles.statCard}
                onPress={() => onStatPress(stat.id, stat.label, displayValue)}
              >
                <IconComponent size={24} color={COLORS.textDark} />
                <Text style={styles.statLabel}>{stat.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Row 2 */}
        <View style={styles.statsRow}>
          {STATISTICS.slice(2, 4).map((stat) => {
            const IconComponent = stat.icon;
            const value = userStats[stat.valueKey];
            const displayValue = value
              ? `${value}${stat.unit ? ` ${stat.unit}` : ''}`
              : 'No Data';

            return (
              <Pressable
                key={stat.id}
                style={styles.statCard}
                onPress={() => onStatPress(stat.id, stat.label, displayValue)}
              >
                <IconComponent size={24} color={COLORS.textDark} />
                <Text style={styles.statLabel}>{stat.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
};

// =============================================================================
// Main Component
// =============================================================================

/**
 * ProfileScreen Component
 * 
 * Main profile/menu screen for the "Me" tab.
 * Displays user info, achievements, statistics, and logout option.
 */
export const ProfileScreen: React.FC<ProfileScreenProps> = ({ navigation }) => {
  const {
    user,
    userProfile,
    currentStats,
    unlockedAchievements,
    updatePhotoURL,
    userPreferencesData,
  } = useAuth();

  // Build userStats from context (with graceful fallbacks)
  const userStats = {
    distanceTraveled: currentStats?.distanceTraveled ?? 0,
    puvEntered: currentStats?.puvEntered ?? 0,
    placesDiscovered: userPreferencesData?.placesDiscovered?.totalPlaces ?? 0,
    commuterLevel: userPreferencesData?.userLevel?.currentLevel ?? 1,
  };

  // User display data
  const displayName = userProfile?.displayName || user?.displayName || null;
  const photoURL = userProfile?.photoURL || user?.photoURL || null;
  const userBadge = `Level ${userStats.commuterLevel} Commuter`;

  /**
   * Handle avatar press - launch image picker
   */
  const handleAvatarPress = useCallback(async () => {
    try {
      // Request permission
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Please allow access to your photo library to change your profile picture.'
        );
        return;
      }

      // Launch image picker
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]?.uri) {
        const uri = result.assets[0].uri;
        await updatePhotoURL(uri);
        console.log('[ProfileScreen] Profile photo updated');
      }
    } catch (error) {
      console.error('[ProfileScreen] Image picker error:', error);
      Alert.alert('Error', 'Failed to update profile photo. Please try again.');
    }
  }, [updatePhotoURL]);

  /**
   * Handle statistics card press
   */
  const handleStatPress = useCallback(
    (statType: string, label: string, value: string) => {
      if (navigation) {
        navigation.navigate('StatisticsDetail', {
          type: statType,
          title: label,
          value: value,
        });
      }
    },
    [navigation]
  );

  /**
   * Handle settings navigation
   */
  const handleSettingsPress = useCallback(() => {
    navigation?.navigate('Settings');
  }, [navigation]);

  // Get username from profile
  const username = userProfile?.username || null;

  return (
    <Box style={styles.container}>
      {/* Header */}
      <HeaderSection onSettingsPress={handleSettingsPress} />

      {/* Scrollable Content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* User Profile Card */}
        <UserProfileCard
          displayName={displayName}
          photoURL={photoURL}
          badge={userBadge}
          username={username}
          onAvatarPress={handleAvatarPress}
        />

        {/* Divider */}
        <Divider />

        {/* Achievements Section (Dynamic) */}
        <AchievementsSection achievements={unlockedAchievements} />

        {/* Divider */}
        <Divider />

        {/* Statistics Title */}
        <StatisticsTitleSection />

        {/* Statistics Grid (Dynamic) */}
        <StatisticsGrid onStatPress={handleStatPress} userStats={userStats} />

        {/* Bottom spacing for tab bar */}
        <Box style={styles.bottomSpacer} />
      </ScrollView>
    </Box>
  );
};

// =============================================================================
// Styles
// =============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },

  // Header Styles
  headerSafeArea: {
    backgroundColor: COLORS.paraBrand,
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    height: 68,
  },
  headerTitle: {
    fontFamily: 'Inter',
    fontWeight: '600',
    fontSize: 32,
    lineHeight: 40,
    color: COLORS.black,
  },
  headerIconButton: {
    padding: 8,
  },

  // Profile Card Styles
  profileCardContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 17,
    paddingVertical: 12,
    backgroundColor: COLORS.white,
    gap: 12,
  },
  avatarWrapper: {
    position: 'relative',
  },
  avatarContainer: {
    width: 64,
    height: 64,
    borderRadius: 48,
    backgroundColor: COLORS.grayLight,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: 64,
    height: 64,
    borderRadius: 48,
  },
  avatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 48,
    backgroundColor: COLORS.grayLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.paraBrand,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  userInfoContainer: {
    flex: 1,
    gap: 2,
  },
  userName: {
    fontFamily: 'Inter',
    fontWeight: '600',
    fontSize: 16,
    lineHeight: 24,
    color: COLORS.textDark,
  },
  userHandle: {
    fontFamily: 'Inter',
    fontWeight: '500',
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.paraBrandDark,
  },
  userBadge: {
    fontFamily: 'Inter',
    fontWeight: '400',
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.grayMedium,
  },
  shareButton: {
    padding: 8,
  },

  // Divider Styles
  dividerContainer: {
    backgroundColor: COLORS.white,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    width: '100%',
  },

  // Achievements Styles
  achievementsContainer: {
    backgroundColor: COLORS.white,
    paddingVertical: 6,
  },
  achievementsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  achievementsTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  achievementsTitle: {
    fontFamily: 'Inter',
    fontWeight: '600',
    fontSize: 13,
    letterSpacing: 0.2,
    color: COLORS.textDark,
  },
  achievementsScroll: {
    paddingHorizontal: 16,
    gap: 12,
  },
  achievementItem: {
    alignItems: 'center',
    paddingHorizontal: 4,
    gap: 8,
  },
  achievementIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 32,
    backgroundColor: COLORS.grayLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  achievementLabel: {
    fontFamily: 'Inter',
    fontWeight: '600',
    fontSize: 13,
    letterSpacing: 0.2,
    color: COLORS.textDark,
    textAlign: 'center',
  },
  achievementsEmptyState: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  achievementsEmptyText: {
    fontFamily: 'Inter',
    fontWeight: '400',
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.textDark500,
  },

  // Statistics Title Styles
  statsTitleContainer: {
    backgroundColor: COLORS.white,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  statsTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statsIconWrapper: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statsIconInner: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
  },
  statsIconBar: {
    backgroundColor: COLORS.textDark,
    borderRadius: 1,
  },
  statsTitle: {
    fontFamily: 'Inter',
    fontWeight: '600',
    fontSize: 20,
    lineHeight: 32,
    color: COLORS.textDark,
  },

  // Statistics Grid Styles
  statsGridContainer: {
    backgroundColor: COLORS.white,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  statsGridInner: {
    gap: 8,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.grayLight,
    borderRadius: 16,
    padding: 16,
    gap: 4,
  },
  statLabel: {
    fontFamily: 'Inter',
    fontWeight: '600',
    fontSize: 13,
    letterSpacing: 0.2,
    color: COLORS.textDark,
  },

  // Scroll View
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 16,
  },
  bottomSpacer: {
    height: 80,
  },
});

export default ProfileScreen;
