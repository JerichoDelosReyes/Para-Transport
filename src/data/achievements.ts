/**
 * Achievements Data
 * 
 * Contains all achievement definitions and helper functions.
 * Achievements are unlocked based on user actions and milestones.
 * 
 * @module data/achievements
 */

// =============================================================================
// Achievement Types
// =============================================================================

/**
 * Achievement category types
 */
export type AchievementCategory = 
  | 'exploration'    // Discovering places
  | 'travel'         // Completing trips
  | 'social'         // Sharing, referrals
  | 'milestone'      // Level/EXP milestones
  | 'special';       // Limited time, events

/**
 * Achievement rarity tiers
 */
export type AchievementRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

/**
 * Achievement definition
 */
export interface Achievement {
  /** Unique achievement ID */
  id: string;
  /** Display name */
  name: string;
  /** Achievement description */
  description: string;
  /** Icon name (lucide icon) */
  icon: string;
  /** Achievement category */
  category: AchievementCategory;
  /** Rarity tier */
  rarity: AchievementRarity;
  /** EXP reward for unlocking */
  expReward: number;
  /** Unlock condition description */
  unlockCondition: string;
  /** Whether this achievement is hidden until unlocked */
  isHidden?: boolean;
}

// =============================================================================
// Achievement Definitions
// =============================================================================

/**
 * All available achievements
 */
export const ACHIEVEMENTS: Achievement[] = [
  // ========== EXPLORATION ACHIEVEMENTS ==========
  {
    id: 'ACH_FIRST_DISCOVERY',
    name: 'First Steps',
    description: 'Discover your first place in Para.',
    icon: 'map-pin',
    category: 'exploration',
    rarity: 'common',
    expReward: 10,
    unlockCondition: 'Discover 1 place',
  },
  {
    id: 'ACH_EXPLORER_10',
    name: 'Local Explorer',
    description: 'Discover 10 different places.',
    icon: 'compass',
    category: 'exploration',
    rarity: 'common',
    expReward: 25,
    unlockCondition: 'Discover 10 places',
  },
  {
    id: 'ACH_EXPLORER_50',
    name: 'Area Expert',
    description: 'Discover 50 different places.',
    icon: 'map',
    category: 'exploration',
    rarity: 'uncommon',
    expReward: 50,
    unlockCondition: 'Discover 50 places',
  },
  {
    id: 'ACH_EXPLORER_100',
    name: 'Master Navigator',
    description: 'Discover 100 different places.',
    icon: 'globe',
    category: 'exploration',
    rarity: 'rare',
    expReward: 100,
    unlockCondition: 'Discover 100 places',
  },
  {
    id: 'ACH_MONTHLY_EXPLORER',
    name: 'Monthly Adventurer',
    description: 'Discover 20 places in a single month.',
    icon: 'calendar',
    category: 'exploration',
    rarity: 'uncommon',
    expReward: 40,
    unlockCondition: 'Discover 20 places in one month',
  },

  // ========== TRAVEL ACHIEVEMENTS ==========
  {
    id: 'ACH_FIRST_TRIP',
    name: 'Commuter Newbie',
    description: 'Complete your first trip using Para.',
    icon: 'route',
    category: 'travel',
    rarity: 'common',
    expReward: 15,
    unlockCondition: 'Complete 1 trip',
  },
  {
    id: 'ACH_TRIPS_10',
    name: 'Regular Commuter',
    description: 'Complete 10 trips.',
    icon: 'bus',
    category: 'travel',
    rarity: 'common',
    expReward: 30,
    unlockCondition: 'Complete 10 trips',
  },
  {
    id: 'ACH_TRIPS_50',
    name: 'Seasoned Traveler',
    description: 'Complete 50 trips.',
    icon: 'train',
    category: 'travel',
    rarity: 'uncommon',
    expReward: 75,
    unlockCondition: 'Complete 50 trips',
  },
  {
    id: 'ACH_TRIPS_100',
    name: 'Road Warrior',
    description: 'Complete 100 trips.',
    icon: 'trophy',
    category: 'travel',
    rarity: 'rare',
    expReward: 150,
    unlockCondition: 'Complete 100 trips',
  },
  {
    id: 'ACH_DISTANCE_100KM',
    name: 'Century Rider',
    description: 'Travel a total of 100 kilometers.',
    icon: 'milestone',
    category: 'travel',
    rarity: 'uncommon',
    expReward: 50,
    unlockCondition: 'Travel 100 km total',
  },
  {
    id: 'ACH_DISTANCE_500KM',
    name: 'Long Hauler',
    description: 'Travel a total of 500 kilometers.',
    icon: 'truck',
    category: 'travel',
    rarity: 'rare',
    expReward: 100,
    unlockCondition: 'Travel 500 km total',
  },
  {
    id: 'ACH_PUV_MASTER',
    name: 'PUV Master',
    description: 'Ride 50 different PUVs.',
    icon: 'car',
    category: 'travel',
    rarity: 'rare',
    expReward: 80,
    unlockCondition: 'Enter 50 PUVs',
  },

  // ========== MILESTONE ACHIEVEMENTS ==========
  {
    id: 'ACH_LEVEL_2',
    name: 'Rising Star',
    description: 'Reach Level 2.',
    icon: 'star',
    category: 'milestone',
    rarity: 'common',
    expReward: 0, // No EXP for level achievements to prevent loops
    unlockCondition: 'Reach Level 2',
  },
  {
    id: 'ACH_LEVEL_5',
    name: 'Experienced Traveler',
    description: 'Reach Level 5.',
    icon: 'award',
    category: 'milestone',
    rarity: 'uncommon',
    expReward: 0,
    unlockCondition: 'Reach Level 5',
  },
  {
    id: 'ACH_LEVEL_10',
    name: 'Para Legend',
    description: 'Reach the maximum Level 10.',
    icon: 'crown',
    category: 'milestone',
    rarity: 'legendary',
    expReward: 0,
    unlockCondition: 'Reach Level 10',
  },
  {
    id: 'ACH_SAVED_ROUTES_5',
    name: 'Route Planner',
    description: 'Save 5 favorite routes.',
    icon: 'bookmark',
    category: 'milestone',
    rarity: 'common',
    expReward: 20,
    unlockCondition: 'Save 5 routes',
  },
  {
    id: 'ACH_SAVED_ROUTES_20',
    name: 'Route Collector',
    description: 'Save 20 favorite routes.',
    icon: 'bookmarks',
    category: 'milestone',
    rarity: 'uncommon',
    expReward: 50,
    unlockCondition: 'Save 20 routes',
  },

  // ========== SOCIAL ACHIEVEMENTS ==========
  {
    id: 'ACH_FIRST_SHARE',
    name: 'Sharing is Caring',
    description: 'Share a route with someone.',
    icon: 'share-2',
    category: 'social',
    rarity: 'common',
    expReward: 15,
    unlockCondition: 'Share 1 route',
  },
  {
    id: 'ACH_REFERRAL',
    name: 'Community Builder',
    description: 'Refer a friend to Para.',
    icon: 'users',
    category: 'social',
    rarity: 'uncommon',
    expReward: 50,
    unlockCondition: 'Refer 1 friend',
  },

  // ========== SPECIAL ACHIEVEMENTS ==========
  {
    id: 'ACH_EARLY_ADOPTER',
    name: 'Early Adopter',
    description: 'Join Para during the beta period.',
    icon: 'zap',
    category: 'special',
    rarity: 'epic',
    expReward: 100,
    unlockCondition: 'Join during beta',
    isHidden: true,
  },
  {
    id: 'ACH_NIGHT_OWL',
    name: 'Night Owl',
    description: 'Complete a trip between 12 AM and 5 AM.',
    icon: 'moon',
    category: 'special',
    rarity: 'uncommon',
    expReward: 30,
    unlockCondition: 'Trip between 12-5 AM',
    isHidden: true,
  },
  {
    id: 'ACH_EARLY_BIRD',
    name: 'Early Bird',
    description: 'Complete a trip between 5 AM and 7 AM.',
    icon: 'sunrise',
    category: 'special',
    rarity: 'common',
    expReward: 20,
    unlockCondition: 'Trip between 5-7 AM',
    isHidden: true,
  },
  {
    id: 'ACH_WEEKEND_WARRIOR',
    name: 'Weekend Warrior',
    description: 'Complete 10 trips on weekends.',
    icon: 'calendar-days',
    category: 'special',
    rarity: 'uncommon',
    expReward: 40,
    unlockCondition: '10 weekend trips',
  },
];

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get achievement by ID
 */
export const getAchievementById = (id: string): Achievement | undefined => {
  return ACHIEVEMENTS.find((a) => a.id === id);
};

/**
 * Get achievements by category
 */
export const getAchievementsByCategory = (category: AchievementCategory): Achievement[] => {
  return ACHIEVEMENTS.filter((a) => a.category === category);
};

/**
 * Get achievements by rarity
 */
export const getAchievementsByRarity = (rarity: AchievementRarity): Achievement[] => {
  return ACHIEVEMENTS.filter((a) => a.rarity === rarity);
};

/**
 * Get unlocked achievements from IDs
 */
export const getUnlockedAchievements = (achievementIds: string[]): Achievement[] => {
  return achievementIds
    .map((id) => getAchievementById(id))
    .filter((a): a is Achievement => a !== undefined);
};

/**
 * Get locked achievements (not yet unlocked)
 */
export const getLockedAchievements = (achievementIds: string[]): Achievement[] => {
  return ACHIEVEMENTS.filter(
    (a) => !achievementIds.includes(a.id) && !a.isHidden
  );
};

/**
 * Calculate total EXP from achievements
 */
export const calculateAchievementExp = (achievementIds: string[]): number => {
  return achievementIds.reduce((total, id) => {
    const achievement = getAchievementById(id);
    return total + (achievement?.expReward || 0);
  }, 0);
};

/**
 * Rarity color mapping for UI
 */
export const RARITY_COLORS: Record<AchievementRarity, string> = {
  common: '#9CA3AF',     // Gray
  uncommon: '#10B981',   // Green
  rare: '#3B82F6',       // Blue
  epic: '#8B5CF6',       // Purple
  legendary: '#F59E0B',  // Gold/Amber
};

/**
 * Get rarity display name
 */
export const getRarityDisplayName = (rarity: AchievementRarity): string => {
  return rarity.charAt(0).toUpperCase() + rarity.slice(1);
};
