/**
 * AppleSignInButton Component
 * 
 * A full-width button for "Sign in with Apple" authentication.
 * Styled with Apple's design guidelines - black background with white text.
 * 
 * @module components/auth/AppleSignInButton
 */

import React from 'react';
import { StyleSheet, TouchableOpacity, Text, View, ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

/**
 * Color tokens
 */
const COLORS = {
  black: '#000000',
  textLight: '#EDEDED',
} as const;

/**
 * Apple Logo SVG Component
 */
const AppleLogo: React.FC<{ size?: number; color?: string }> = ({ 
  size = 16, 
  color = COLORS.textLight 
}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.53 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.52-3.74 4.25z"
      fill={color}
    />
  </Svg>
);

/**
 * Props for AppleSignInButton component
 */
export interface AppleSignInButtonProps {
  /** Callback function when button is pressed */
  onPress: () => void;
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Custom style overrides */
  style?: ViewStyle;
  /** Test ID for testing */
  testID?: string;
}

/**
 * AppleSignInButton Component
 * 
 * A full-width button for Apple Sign In following Apple's HIG.
 * 
 * @example
 * ```tsx
 * <AppleSignInButton 
 *   onPress={() => handleAppleSignIn()} 
 * />
 * ```
 */
export const AppleSignInButton: React.FC<AppleSignInButtonProps> = ({
  onPress,
  disabled = false,
  style,
  testID,
}) => {
  return (
    <TouchableOpacity
      style={[
        styles.button,
        disabled && styles.disabledButton,
        style,
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
      testID={testID}
    >
      <View style={styles.content}>
        <AppleLogo size={18} color={COLORS.textLight} />
        <Text style={styles.buttonText}>Sign in with Apple</Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    height: 44,
    backgroundColor: COLORS.black,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  disabledButton: {
    opacity: 0.5,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  buttonText: {
    fontSize: 14,
    fontFamily: 'Inter',
    fontWeight: '600',
    color: COLORS.textLight,
  },
});

export default AppleSignInButton;
