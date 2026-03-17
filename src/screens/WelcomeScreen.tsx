/**
 * WelcomeScreen
 * 
 * The first screen users see when opening the Para Mobile app.
 * Features an animated "scribble" jeepney illustration, brand tagline,
 * and a single prominent "Log in" button.
 * 
 * @module screens/WelcomeScreen
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthButton } from '../components/auth';

// Import the actual jeepney SVG asset
import JeepneySvg from '../../assets/illustrations/welcomeScreen-jeep.svg';

/**
 * Brand color tokens (matching gluestack-ui.config.ts)
 */
const COLORS = {
  white: '#FFFFFF',
  paraBrand: '#E9AE16',
  paraBrand2: '#284395',
  paraBrand3: '#EF2836',
  textDark900: '#181818',
  textDark500: '#525250',
} as const;

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface JeepneyIllustrationProps {
  size?: number;
}

/**
 * Jeepney Illustration Component
 * Uses the actual SVG asset from assets/illustrations
 */
const JeepneyIllustration: React.FC<JeepneyIllustrationProps> = ({
  size = 350,
}) => {
  return (
    <View style={styles.illustrationContainer}>
      <JeepneySvg width={350} height={350} />
    </View>
  );
};

/**
 * Tagline Component
 * Displays the brand tagline with styled text
 */
const Tagline: React.FC = () => (
  <View style={styles.taglineContainer}>
    {/* Main headline */}
    <View style={styles.headlineContainer}>
      <Text style={styles.headlineExpanded}>STRESS-FREE</Text>
      <Text style={styles.headlineSemi}>COMMUTING</Text>
    </View>
    
    {/* Subtitle with colored words */}
    <View style={styles.subtitleContainer}>
      <Text style={styles.subtitleBase}>
        All in the hands of{' '}
      </Text>
      <Text style={styles.subtitleEvery}>every</Text>
      <Text style={styles.subtitleBase}> </Text>
      <Text style={styles.subtitleFilipino}>Filipino</Text>
    </View>
  </View>
);

/**
 * Props for WelcomeScreen
 */
export interface WelcomeScreenProps {
  /** Navigation object (optional - for when integrated with navigation) */
  navigation?: {
    navigate: (screen: string) => void;
  };
}

/**
 * WelcomeScreen Component
 * 
 * The entry point screen for unauthenticated users.
 * 
 * @example
 * ```tsx
 * <WelcomeScreen navigation={navigation} />
 * ```
 */
export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ navigation }) => {
  // Navigation handler for Login
  const handleLogin = () => {
    console.log('Navigate to Login');
    navigation?.navigate('Login');
  };

  // Navigation handler for Sign Up
  const handleSignUp = () => {
    console.log('Navigate to Sign Up');
    navigation?.navigate('Login'); // For now, go to Login (can be changed later)
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Tagline Section */}
        <Tagline />
        
        {/* Hero Illustration */}
        <JeepneyIllustration size={SCREEN_WIDTH * 0.8} />
        
        {/* Login and Sign Up Actions */}
        <View style={styles.authContainer}>
          <AuthButton
            text="Log in"
            onPress={handleLogin}
            style={styles.loginButton}
            testID="welcome-login-button"
          />
          {/* New to Para? divider */}
          <Text style={styles.dividerText}>New to Para?</Text>
          <Pressable
            onPress={handleSignUp}
            style={styles.signUpButton}
            testID="welcome-signup-button"
          >
            <Text style={styles.signUpButtonText}>Sign Up</Text>
          </Pressable>
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
    alignItems: 'center',
    paddingTop: 100,
    paddingBottom: 40,
  },
  
  // Tagline styles
  taglineContainer: {
    alignItems: 'center',
    gap: 10,
  },
  headlineContainer: {
    alignItems: 'center',
  },
  headlineExpanded: {
    fontFamily: 'CubaoFree2-ExtraExpanded',
    fontSize: 33,
    color: COLORS.textDark900,
    letterSpacing: 1,
    lineHeight: 32,
  },
  headlineSemi: {
    fontFamily: 'CubaoFree2-SemiExpanded',
    fontSize: 33,
    color: COLORS.textDark900,
    letterSpacing: 1,
    lineHeight: 32,
  },
  subtitleContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 10,
  },
  subtitleBase: {
    fontFamily: 'QuiapoFree2-Regular',
    fontSize: 28,
    color: COLORS.textDark500,
    fontStyle: 'italic',
    letterSpacing: 1,
  },
  subtitleEvery: {
    fontFamily: 'QuiapoFree2-Regular',
    fontSize: 28,
    color: COLORS.paraBrand2,
    fontStyle: 'italic',
    letterSpacing: 1,
  },
  subtitleFilipino: {
    fontFamily: 'QuiapoFree2-Regular',
    fontSize: 28,
    color: COLORS.paraBrand3,
    fontStyle: 'italic',
    letterSpacing: 1.2,
  },
  
  // Illustration styles
  illustrationContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  // Auth styles
  authContainer: {
    width: '100%',
    alignItems: 'center',
    gap: 12,
  },
  loginButton: {
    width: '100%',
    height: 60,
  },
  dividerText: {
    fontFamily: 'Inter',
    fontSize: 14,
    color: COLORS.textDark500,
    marginVertical: 4,
  },
  signUpButton: {
    width: '100%',
    height: 60,
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderColor: COLORS.paraBrand,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  signUpButtonText: {
    fontFamily: 'Inter',
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.paraBrand,
  },
});

export default WelcomeScreen;
