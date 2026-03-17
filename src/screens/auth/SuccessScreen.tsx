/**
 * SuccessScreen (Congratulations)
 * 
 * Displayed after successful registration to congratulate the user.
 * Features a checkmark icon, congratulations message, and navigation arrow.
 * 
 * @module screens/auth/SuccessScreen
 */

import React from 'react';
import { View, Pressable, StyleSheet, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Import UI components from gluestack-ui
import { Text } from '../../../components/ui/text';
import { VStack } from '../../../components/ui/vstack';
import { Box } from '../../../components/ui/box';

// Import SVG icons
import CustomCheck from '../../../assets/icons/customCheck.svg';
import CustomArrowForward from '../../../assets/icons/customArrow_forward.svg';

// Auth context
import { useAuth } from '../../context/AuthContext';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

/**
 * Brand color tokens (matching gluestack-ui.config.ts and Figma design)
 */
const COLORS = {
  white: '#FFFFFF',
  black: '#0E0F0C',
  gray500: '#898989',
} as const;

/**
 * Props for SuccessScreen
 */
export interface SuccessScreenProps {
  navigation?: {
    navigate: (screen: string, params?: object) => void;
    replace: (screen: string, params?: object) => void;
    reset: (options: { index: number; routes: { name: string }[] }) => void;
  };
}

/**
 * SuccessScreen Component
 * 
 * Congratulations screen shown after successful registration.
 * Matches the Figma design with centered content and navigation arrow.
 */
export const SuccessScreen: React.FC<SuccessScreenProps> = ({ navigation }) => {
  const { completeOnboarding } = useAuth();

  /**
   * Handle arrow press - mark onboarding complete and navigate to main app
   */
  const handleStartJourney = async () => {
    // Mark onboarding as complete in Firestore
    await completeOnboarding();
    
    // Reset navigation stack and go to MainTabs (Bottom Tab Navigator)
    navigation?.reset({
      index: 0,
      routes: [{ name: 'MainTabs' }],
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Main Content - Centered */}
        <View style={styles.mainSection}>
          {/* Congratulations Group */}
          <VStack style={styles.congratulationsGroup}>
            {/* Checkmark Icon */}
            <Box style={styles.iconContainer}>
              <CustomCheck width={139} height={139} />
            </Box>

            {/* Title */}
            <Text style={styles.title}>CONGRATULATIONS</Text>

            {/* Body Text */}
            <Text style={styles.bodyText}>
              Your account is ready to use. You can now use Para for your Road trip Commuting.
            </Text>
          </VStack>
        </View>

        {/* Arrow Navigation - Lower Section */}
        <View style={styles.arrowSection}>
          <Pressable 
            onPress={handleStartJourney} 
            style={styles.arrowButton}
            accessibilityLabel="Start your journey"
            accessibilityRole="button"
          >
            <CustomArrowForward width={46} height={46} />
          </Pressable>
          <Text style={styles.arrowLabel}>Click to start your journey</Text>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
  },
  mainSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60, // Push content slightly up from true center
  },
  congratulationsGroup: {
    alignItems: 'center',
    width: '100%',
    maxWidth: 280,
  },
  iconContainer: {
    width: 139,
    height: 139,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontFamily: 'CubaoFree2-ExtraExpanded',
    fontSize: 13,
    letterSpacing: 0.13,
    lineHeight: 20,
    color: COLORS.black,
    textAlign: 'center',
    textTransform: 'uppercase',
    marginTop: 8,
  },
  bodyText: {
    fontFamily: 'Inter',
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 14,
    color: COLORS.gray500,
    textAlign: 'center',
    marginTop: 8,
  },
  arrowSection: {
    alignItems: 'center',
    paddingBottom: 80,
  },
  arrowButton: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  arrowLabel: {
    fontFamily: 'QuiapoFree2-Regular',
    fontSize: 13,
    letterSpacing: 0.13,
    lineHeight: 20,
    color: COLORS.black,
    textAlign: 'center',
  },
});

export default SuccessScreen;
