/**
 * StatisticsDetailScreen
 * 
 * A generic detail screen that displays expanded statistics data
 * when a user clicks on a stat card from the ProfileScreen.
 * 
 * @module screens/main/StatisticsDetailScreen
 */

import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Pressable,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ChevronLeft,
  Map,
  Bus,
  Building2,
  Star,
  TrendingUp,
  Calendar,
} from 'lucide-react-native';

// Gluestack UI Components
import { Box } from '../../../components/ui/box';
import { Text } from '../../../components/ui/text';
import { VStack } from '../../../components/ui/vstack';

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
  textDark900: '#181818',
  textDark: '#1C1B1F',
  border: '#E5E7EB',
  success: '#22C55E',
} as const;

/**
 * Stat type to icon mapping
 */
const STAT_ICONS: Record<string, React.ComponentType<any>> = {
  distance: Map,
  puv: Bus,
  places: Building2,
  level: Star,
};

/**
 * Mock recent activity data for each stat type
 */
const MOCK_ACTIVITY: Record<string, Array<{ date: string; value: string; description: string }>> = {
  distance: [
    { date: 'Today', value: '3.2 km', description: 'Route to SM City' },
    { date: 'Yesterday', value: '5.1 km', description: 'Commute to work' },
    { date: '2 days ago', value: '2.8 km', description: 'Quick errand run' },
    { date: '3 days ago', value: '7.5 km', description: 'Weekend trip' },
  ],
  puv: [
    { date: 'Today', value: '2', description: 'Jeepney rides' },
    { date: 'Yesterday', value: '3', description: 'Bus and jeepney' },
    { date: '2 days ago', value: '1', description: 'Single jeepney ride' },
    { date: '3 days ago', value: '4', description: 'Multiple transfers' },
  ],
  places: [
    { date: 'Today', value: '1', description: 'New café discovered' },
    { date: 'Yesterday', value: '2', description: 'Park and restaurant' },
    { date: '2 days ago', value: '0', description: 'Familiar routes only' },
    { date: '3 days ago', value: '3', description: 'Explored new area' },
  ],
  level: [
    { date: 'This week', value: '+50 XP', description: 'Completed daily goals' },
    { date: 'Last week', value: '+120 XP', description: 'Achievement unlocked' },
    { date: '2 weeks ago', value: '+30 XP', description: 'Regular commute' },
    { date: '3 weeks ago', value: '+80 XP', description: 'First PUV ride' },
  ],
};

/**
 * Descriptions for each stat type
 */
const STAT_DESCRIPTIONS: Record<string, string> = {
  distance: 'Total kilometers traveled using public transportation.',
  puv: 'Number of Public Utility Vehicles you have ridden.',
  places: 'Unique locations and landmarks you have discovered.',
  level: 'Your commuter experience level based on activity.',
};

// =============================================================================
// Types
// =============================================================================

export interface StatisticsDetailScreenProps {
  navigation?: {
    goBack: () => void;
    navigate: (screen: string, params?: Record<string, any>) => void;
  };
  route?: {
    params: {
      type: string;
      title: string;
      value: string;
    };
  };
}

// =============================================================================
// Sub-Components
// =============================================================================

/**
 * Header with back button
 */
interface HeaderProps {
  title: string;
  onBack: () => void;
}

const Header: React.FC<HeaderProps> = ({ title, onBack }) => {
  return (
    <SafeAreaView edges={['top']} style={styles.headerSafeArea}>
      <View style={styles.headerContainer}>
        <Pressable onPress={onBack} style={styles.backButton}>
          <ChevronLeft size={24} color={COLORS.black} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.headerSpacer} />
      </View>
    </SafeAreaView>
  );
};

/**
 * Main Stat Display with large value
 */
interface StatDisplayProps {
  icon: React.ComponentType<any>;
  value: string;
  description: string;
}

const StatDisplay: React.FC<StatDisplayProps> = ({
  icon: IconComponent,
  value,
  description,
}) => {
  return (
    <View style={styles.statDisplayContainer}>
      {/* Large Icon */}
      <View style={styles.largeIconContainer}>
        <IconComponent size={80} color={COLORS.paraBrand} strokeWidth={1.5} />
      </View>

      {/* Large Value */}
      <Text style={styles.largeValue}>{value}</Text>

      {/* Description */}
      <Text style={styles.statDescription}>{description}</Text>
    </View>
  );
};

/**
 * Trend Indicator
 */
const TrendIndicator: React.FC = () => {
  return (
    <View style={styles.trendContainer}>
      <View style={styles.trendIconWrapper}>
        <TrendingUp size={16} color={COLORS.success} />
      </View>
      <Text style={styles.trendText}>+12% from last week</Text>
    </View>
  );
};

/**
 * Recent Activity Section
 */
interface RecentActivityProps {
  statType: string;
}

const RecentActivity: React.FC<RecentActivityProps> = ({ statType }) => {
  const activities = MOCK_ACTIVITY[statType] || MOCK_ACTIVITY.distance;

  return (
    <View style={styles.activityContainer}>
      {/* Section Title */}
      <View style={styles.activityHeader}>
        <Calendar size={20} color={COLORS.textDark} />
        <Text style={styles.activityTitle}>Recent Activity</Text>
      </View>

      {/* Activity List */}
      <View style={styles.activityList}>
        {activities.map((activity, index) => (
          <View key={index} style={styles.activityItem}>
            <View style={styles.activityLeft}>
              <Text style={styles.activityDate}>{activity.date}</Text>
              <Text style={styles.activityDescription}>
                {activity.description}
              </Text>
            </View>
            <Text style={styles.activityValue}>{activity.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

/**
 * Info Card
 */
interface InfoCardProps {
  title: string;
  value: string;
  subtitle: string;
}

const InfoCard: React.FC<InfoCardProps> = ({ title, value, subtitle }) => {
  return (
    <View style={styles.infoCard}>
      <Text style={styles.infoCardTitle}>{title}</Text>
      <Text style={styles.infoCardValue}>{value}</Text>
      <Text style={styles.infoCardSubtitle}>{subtitle}</Text>
    </View>
  );
};

// =============================================================================
// Main Component
// =============================================================================

/**
 * StatisticsDetailScreen Component
 * 
 * Generic detail view that adapts based on the stat type passed via route params.
 * Shows the stat value prominently with related activity history.
 */
export const StatisticsDetailScreen: React.FC<StatisticsDetailScreenProps> = ({
  navigation,
  route,
}) => {
  // Extract params with defaults
  const type = route?.params?.type || 'distance';
  const title = route?.params?.title || 'Statistics';
  const value = route?.params?.value || 'No Data';

  // Get the appropriate icon
  const IconComponent = STAT_ICONS[type] || Map;
  const description = STAT_DESCRIPTIONS[type] || STAT_DESCRIPTIONS.distance;

  /**
   * Handle back navigation
   */
  const handleBack = () => {
    if (navigation?.goBack) {
      navigation.goBack();
    }
  };

  // Generate mock summary cards based on stat type
  const summaryCards = getSummaryCards(type);

  return (
    <Box style={styles.container}>
      {/* Header */}
      <Header title={title} onBack={handleBack} />

      {/* Scrollable Content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Main Stat Display */}
        <StatDisplay
          icon={IconComponent}
          value={value}
          description={description}
        />

        {/* Trend Indicator */}
        <TrendIndicator />

        {/* Summary Cards */}
        <View style={styles.summaryRow}>
          {summaryCards.map((card, index) => (
            <InfoCard
              key={index}
              title={card.title}
              value={card.value}
              subtitle={card.subtitle}
            />
          ))}
        </View>

        {/* Recent Activity */}
        <RecentActivity statType={type} />

        {/* Bottom spacing */}
        <Box style={styles.bottomSpacer} />
      </ScrollView>
    </Box>
  );
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generate summary cards based on stat type
 */
function getSummaryCards(type: string): Array<{
  title: string;
  value: string;
  subtitle: string;
}> {
  switch (type) {
    case 'distance':
      return [
        { title: 'This Week', value: '18.6 km', subtitle: 'Total distance' },
        { title: 'Best Day', value: '7.5 km', subtitle: 'Saturday' },
      ];
    case 'puv':
      return [
        { title: 'This Week', value: '10', subtitle: 'Total rides' },
        { title: 'Favorite', value: 'Jeepney', subtitle: '70% of rides' },
      ];
    case 'places':
      return [
        { title: 'This Month', value: '12', subtitle: 'New places' },
        { title: 'Top Area', value: 'Makati', subtitle: '5 discoveries' },
      ];
    case 'level':
      return [
        { title: 'Current Level', value: 'Level 1', subtitle: 'Star Commuter' },
        { title: 'Next Level', value: '150 XP', subtitle: 'Remaining' },
      ];
    default:
      return [
        { title: 'Summary', value: 'N/A', subtitle: 'No data available' },
        { title: 'Status', value: 'N/A', subtitle: 'No data available' },
      ];
  }
}

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
    height: 56,
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  headerTitle: {
    flex: 1,
    fontFamily: 'Inter',
    fontWeight: '600',
    fontSize: 18,
    lineHeight: 24,
    color: COLORS.black,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 40,
  },

  // Stat Display Styles
  statDisplayContainer: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 24,
  },
  largeIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: COLORS.grayLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  largeValue: {
    fontFamily: 'Inter',
    fontWeight: '700',
    fontSize: 48,
    lineHeight: 56,
    color: COLORS.paraBrand,
    textAlign: 'center',
    marginBottom: 8,
  },
  statDescription: {
    fontFamily: 'Inter',
    fontWeight: '400',
    fontSize: 16,
    lineHeight: 24,
    color: COLORS.grayMedium,
    textAlign: 'center',
    maxWidth: 280,
  },

  // Trend Styles
  trendContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: COLORS.grayLight,
    borderRadius: 20,
    alignSelf: 'center',
    marginBottom: 24,
    gap: 6,
  },
  trendIconWrapper: {
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  trendText: {
    fontFamily: 'Inter',
    fontWeight: '500',
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.success,
  },

  // Summary Cards Styles
  summaryRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 24,
  },
  infoCard: {
    flex: 1,
    backgroundColor: COLORS.grayLight,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  infoCardTitle: {
    fontFamily: 'Inter',
    fontWeight: '400',
    fontSize: 12,
    lineHeight: 16,
    color: COLORS.grayMedium,
    marginBottom: 4,
  },
  infoCardValue: {
    fontFamily: 'Inter',
    fontWeight: '700',
    fontSize: 24,
    lineHeight: 32,
    color: COLORS.textDark,
    marginBottom: 2,
  },
  infoCardSubtitle: {
    fontFamily: 'Inter',
    fontWeight: '400',
    fontSize: 12,
    lineHeight: 16,
    color: COLORS.grayMedium,
  },

  // Activity Styles
  activityContainer: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  activityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  activityTitle: {
    fontFamily: 'Inter',
    fontWeight: '600',
    fontSize: 18,
    lineHeight: 24,
    color: COLORS.textDark,
  },
  activityList: {
    backgroundColor: COLORS.grayLight,
    borderRadius: 16,
    overflow: 'hidden',
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.white,
  },
  activityLeft: {
    flex: 1,
  },
  activityDate: {
    fontFamily: 'Inter',
    fontWeight: '600',
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.textDark,
    marginBottom: 2,
  },
  activityDescription: {
    fontFamily: 'Inter',
    fontWeight: '400',
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.grayMedium,
  },
  activityValue: {
    fontFamily: 'Inter',
    fontWeight: '600',
    fontSize: 16,
    lineHeight: 24,
    color: COLORS.paraBrand,
  },

  // Scroll View
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 16,
  },
  bottomSpacer: {
    height: 40,
  },
});

export default StatisticsDetailScreen;
