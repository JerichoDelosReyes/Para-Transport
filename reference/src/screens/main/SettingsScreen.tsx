/**
 * SettingsScreen
 * 
 * User settings screen displaying identity information,
 * legal links, and account actions.
 * 
 * @module screens/main/SettingsScreen
 */

import React, { useCallback } from 'react';
import {
  ScrollView,
  StyleSheet,
  Pressable,
  View,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight, FileText, Shield, LogOut } from 'lucide-react-native';

// Gluestack UI Components
import { Box } from '../../../components/ui/box';
import { Text } from '../../../components/ui/text';
import { VStack } from '../../../components/ui/vstack';
import { HStack } from '../../../components/ui/hstack';

// Auth Context
import { useAuth } from '../../context/AuthContext';

// Global Constants
import { LEGAL_URLS } from '../../config/constants';

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
  error: '#DC2626',
} as const;

// =============================================================================
// Types
// =============================================================================

export interface SettingsScreenProps {
  navigation?: {
    navigate: (screen: string, params?: Record<string, any>) => void;
    goBack: () => void;
  };
}

// =============================================================================
// Sub-Components
// =============================================================================

/**
 * Header with back button and title
 */
interface HeaderSectionProps {
  onBack: () => void;
}

const HeaderSection: React.FC<HeaderSectionProps> = ({ onBack }) => {
  return (
    <SafeAreaView edges={['top']} style={styles.headerSafeArea}>
      <View style={styles.headerContainer}>
        <Pressable 
          onPress={onBack} 
          style={styles.backButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ChevronLeft size={24} color={COLORS.black} strokeWidth={2} />
        </Pressable>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.headerSpacer} />
      </View>
    </SafeAreaView>
  );
};

/**
 * Section Header
 */
interface SectionHeaderProps {
  title: string;
}

const SectionHeader: React.FC<SectionHeaderProps> = ({ title }) => (
  <View style={styles.sectionHeader}>
    <Text style={styles.sectionHeaderText}>{title}</Text>
  </View>
);

/**
 * Identity Card - Read-only display of user identifiers
 */
interface IdentityCardProps {
  label: string;
  value: string | null | undefined;
  isUsername?: boolean;
}

const IdentityCard: React.FC<IdentityCardProps> = ({ label, value, isUsername = false }) => (
  <View style={styles.identityCard}>
    <Text style={styles.identityLabel}>{label}</Text>
    <Text style={[
      styles.identityValue,
      isUsername && styles.usernameValue,
    ]}>
      {isUsername && value ? `@${value}` : value || 'Not set'}
    </Text>
  </View>
);

/**
 * Menu Item - Pressable row for navigation/actions
 */
interface MenuItemProps {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  showChevron?: boolean;
  destructive?: boolean;
}

const MenuItem: React.FC<MenuItemProps> = ({ 
  icon, 
  label, 
  onPress, 
  showChevron = true,
  destructive = false,
}) => (
  <Pressable 
    style={styles.menuItem} 
    onPress={onPress}
    android_ripple={{ color: COLORS.grayLight }}
  >
    <View style={styles.menuItemLeft}>
      {icon}
      <Text style={[
        styles.menuItemLabel,
        destructive && styles.menuItemLabelDestructive,
      ]}>
        {label}
      </Text>
    </View>
    {showChevron && (
      <ChevronRight size={20} color={COLORS.grayMedium} />
    )}
  </Pressable>
);

/**
 * Divider
 */
const Divider: React.FC = () => (
  <View style={styles.dividerContainer}>
    <View style={styles.divider} />
  </View>
);

// =============================================================================
// Main Component
// =============================================================================

/**
 * SettingsScreen Component
 * 
 * Displays user identity, legal links, and account actions.
 */
export const SettingsScreen: React.FC<SettingsScreenProps> = ({ navigation }) => {
  const { user, userProfile, signOut, isLoading } = useAuth();

  /**
   * Handle back navigation
   */
  const handleBack = useCallback(() => {
    navigation?.goBack();
  }, [navigation]);

  /**
   * Open Privacy Policy
   */
  const handleOpenPrivacyPolicy = useCallback(() => {
    Linking.openURL(LEGAL_URLS.PRIVACY_POLICY).catch((err) => {
      console.error('Failed to open Privacy Policy URL:', err);
      Alert.alert('Error', 'Could not open Privacy Policy');
    });
  }, []);

  /**
   * Open Terms of Service
   */
  const handleOpenTermsOfService = useCallback(() => {
    Linking.openURL(LEGAL_URLS.TERMS_OF_SERVICE).catch((err) => {
      console.error('Failed to open Terms of Service URL:', err);
      Alert.alert('Error', 'Could not open Terms of Service');
    });
  }, []);

  /**
   * Handle logout
   */
  const handleLogout = useCallback(async () => {
    Alert.alert(
      'Log Out',
      'Are you sure you want to log out?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await signOut();
              console.log('[SettingsScreen] Logout successful');
            } catch (error) {
              console.error('[SettingsScreen] Logout error:', error);
              Alert.alert('Error', 'Failed to log out. Please try again.');
            }
          },
        },
      ],
      { cancelable: true }
    );
  }, [signOut]);

  // User data
  const username = userProfile?.username;
  const phoneNumber = userProfile?.phoneNumber;
  const email = userProfile?.email || user?.email;

  return (
    <Box style={styles.container}>
      {/* Header */}
      <HeaderSection onBack={handleBack} />

      {/* Scrollable Content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Section: Identity */}
        <SectionHeader title="Identity" />
        <View style={styles.identitySection}>
          <IdentityCard label="Username" value={username} isUsername />
          <IdentityCard label="Phone Number" value={phoneNumber ? `+63 ${phoneNumber}` : null} />
          <IdentityCard label="Email" value={email} />
        </View>

        <Divider />

        {/* Section: Legal */}
        <SectionHeader title="Legal" />
        <View style={styles.menuSection}>
          <MenuItem
            icon={<Shield size={20} color={COLORS.textDark} />}
            label="Privacy Policy"
            onPress={handleOpenPrivacyPolicy}
          />
          <MenuItem
            icon={<FileText size={20} color={COLORS.textDark} />}
            label="Terms of Service"
            onPress={handleOpenTermsOfService}
          />
        </View>

        <Divider />

        {/* Section: Actions */}
        <SectionHeader title="Account" />
        <View style={styles.menuSection}>
          <MenuItem
            icon={<LogOut size={20} color={COLORS.error} />}
            label="Log Out"
            onPress={handleLogout}
            showChevron={false}
            destructive
          />
        </View>

        {/* App Version */}
        <View style={styles.versionContainer}>
          <Text style={styles.versionText}>Para v1.0.0 (MVP)</Text>
        </View>

        {/* Bottom spacing */}
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
    height: 56,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: 'Inter',
    fontWeight: '600',
    fontSize: 18,
    color: COLORS.black,
  },
  headerSpacer: {
    width: 40,
  },

  // Section Styles
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 8,
  },
  sectionHeaderText: {
    fontFamily: 'Inter',
    fontWeight: '600',
    fontSize: 13,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: COLORS.grayMedium,
  },

  // Identity Section Styles
  identitySection: {
    backgroundColor: COLORS.white,
    paddingHorizontal: 16,
    gap: 16,
  },
  identityCard: {
    backgroundColor: COLORS.grayLight,
    borderRadius: 12,
    padding: 16,
    gap: 4,
  },
  identityLabel: {
    fontFamily: 'Inter',
    fontWeight: '500',
    fontSize: 12,
    color: COLORS.grayMedium,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  identityValue: {
    fontFamily: 'Inter',
    fontWeight: '600',
    fontSize: 16,
    color: COLORS.textDark,
  },
  usernameValue: {
    color: COLORS.paraBrandDark,
  },

  // Menu Styles
  menuSection: {
    backgroundColor: COLORS.white,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: COLORS.white,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  menuItemLabel: {
    fontFamily: 'Inter',
    fontWeight: '500',
    fontSize: 16,
    color: COLORS.textDark,
  },
  menuItemLabelDestructive: {
    color: COLORS.error,
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

  // Version Styles
  versionContainer: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  versionText: {
    fontFamily: 'Inter',
    fontWeight: '400',
    fontSize: 12,
    color: COLORS.grayMedium,
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

export default SettingsScreen;
