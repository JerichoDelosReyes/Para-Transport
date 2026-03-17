/**
 * LoginScreen
 * 
 * Clean login screen featuring the minimalistic jeep illustration
 * and Google Sign-In authentication.
 * 
 * @module screens/auth/LoginScreen
 */

import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  View,
  StyleSheet,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Import UI components from gluestack-ui
import { Text } from '../../../components/ui/text';
import { VStack } from '../../../components/ui/vstack';

// Import auth context
import { useAuth } from '../../context/AuthContext';

// Import global constants
import { LEGAL_URLS } from '../../config/constants';

// Import the minimalistic jeep SVG
import MinimalisticJeep from '../../../assets/illustrations/minimalistic-jeep.svg';

/**
 * Brand color tokens (matching gluestack-ui.config.ts)
 */
const COLORS = {
  white: '#FFFFFF',
  paraBrand: '#E9AE16',
  textDark900: '#181818',
  textDark500: '#525250',
  borderLight300: '#868685',
  buttonTextDark: '#1E1E1E',
  googleBlue: '#4285F4',
  googleRed: '#EA4335',
  googleYellow: '#FBBC05',
  googleGreen: '#34A853',
  error: '#DC2626',
} as const;

/**
 * Props for LoginScreen
 */
export interface LoginScreenProps {
  navigation?: {
    navigate: (screen: string) => void;
    goBack: () => void;
  };
}

/**
 * Google Logo Component
 * Renders the official Google "G" logo with proper colors
 */
const GoogleLogo: React.FC<{ size?: number }> = ({ size = 20 }) => (
  <View style={[styles.googleLogoContainer, { width: size, height: size }]}>
    <Text style={[styles.googleG, { fontSize: size * 0.9, lineHeight: size }]}>G</Text>
  </View>
);

/**
 * LoginScreen Component
 * 
 * Welcome screen with Google Sign-In authentication.
 * Clean, minimal design following Para branding.
 */
export const LoginScreen: React.FC<LoginScreenProps> = ({ navigation }) => {
  const { signInWithGoogle, isLoading, error, clearError } = useAuth();
  const [localLoading, setLocalLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  /**
   * Open Privacy Policy link
   */
  const handleOpenPrivacyPolicy = () => {
    Linking.openURL(LEGAL_URLS.PRIVACY_POLICY).catch((err) => {
      console.error('Failed to open Privacy Policy URL:', err);
    });
  };

  /**
   * Open Terms of Service link
   */
  const handleOpenTermsOfService = () => {
    Linking.openURL(LEGAL_URLS.TERMS_OF_SERVICE).catch((err) => {
      console.error('Failed to open Terms of Service URL:', err);
    });
  };

  /**
   * Handle Google Sign-In button press
   * Catches cancellation errors and displays appropriate message
   */
  const handleGoogleSignIn = async () => {
    setLocalLoading(true);
    setLocalError(null);
    clearError();
    
    try {
      const success = await signInWithGoogle();
      if (success) {
        console.log('Google Sign-In successful');
        // Navigation will be handled by App.tsx based on auth state
      }
    } catch (err: any) {
      console.error('Google Sign-In error:', err);
      
      // Handle user cancellation specifically
      if (
        err?.code === 'SIGN_IN_CANCELLED' ||
        err?.code === 'CANCELED' ||
        err?.code === '-5' ||
        err?.message?.includes('cancel') ||
        err?.message?.includes('Cancel')
      ) {
        setLocalError('Sign-in cancelled');
      } else {
        setLocalError(err?.message || 'An error occurred during sign-in');
      }
      // User remains on LoginScreen - no navigation
    } finally {
      setLocalLoading(false);
    }
  };

  const isButtonLoading = isLoading || localLoading;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoid}
      >
        <View style={styles.content}>
          {/* Main Content */}
          <VStack style={styles.mainContent}>
            {/* Illustration */}
            <View style={styles.illustrationContainer}>
              <MinimalisticJeep width={170} height={100} />
            </View>

            {/* Title */}
            <Text style={styles.title}>Let's get you moving.</Text>

            {/* Subtitle */}
            <Text style={styles.subtitle}>
              Sign in to start your journey with Para
            </Text>
          </VStack>

          {/* Bottom Section */}
          <View style={styles.bottomSection}>
            {/* Error Message */}
            {(error || localError) && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{localError || error}</Text>
              </View>
            )}

            {/* Google Sign-In Button */}
            <Pressable
              style={[
                styles.googleButton,
                isButtonLoading && styles.googleButtonDisabled,
              ]}
              onPress={handleGoogleSignIn}
              disabled={isButtonLoading}
            >
              {isButtonLoading ? (
                <ActivityIndicator size="small" color={COLORS.textDark900} />
              ) : (
                <>
                  <GoogleLogo size={20} />
                  <Text style={styles.googleButtonText}>Sign in with Google</Text>
                </>
              )}
            </Pressable>

            {/* Footer */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>
                By continuing, you agree to our{' '}
                <Text 
                  style={styles.footerLink}
                  onPress={handleOpenTermsOfService}
                >
                  Terms of Service
                </Text>
                {' '}and{' '}
                <Text 
                  style={styles.footerLink}
                  onPress={handleOpenPrivacyPolicy}
                >
                  Privacy Policy
                </Text>
              </Text>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  keyboardAvoid: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
  },
  mainContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 40,
  },
  illustrationContainer: {
    marginBottom: 32,
    alignItems: 'center',
  },
  title: {
    fontFamily: 'CubaoFree2-ExtraExpanded',
    fontSize: 39,
    color: COLORS.textDark900,
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontFamily: 'Inter',
    fontSize: 17,
    color: COLORS.textDark500,
    textAlign: 'center',
    lineHeight: 20,
  },
  bottomSection: {
    paddingBottom: 32,
  },
  errorContainer: {
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorText: {
    fontFamily: 'Inter',
    fontSize: 13,
    color: COLORS.error,
    textAlign: 'center',
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.borderLight300,
    borderRadius: 24,
    height: 52,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  googleButtonDisabled: {
    opacity: 0.7,
  },
  googleLogoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleG: {
    fontWeight: '700',
    color: COLORS.googleBlue,
  },
  googleButtonText: {
    fontFamily: 'Inter',
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textDark900,
  },
  footer: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  footerText: {
    fontFamily: 'Inter',
    fontSize: 12,
    color: COLORS.textDark500,
    textAlign: 'center',
    lineHeight: 18,
  },
  footerLink: {
    fontFamily: 'Inter',
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textDark900,
    textDecorationLine: 'underline',
  },
});

export default LoginScreen;
