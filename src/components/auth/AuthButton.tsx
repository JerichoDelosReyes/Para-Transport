/**
 * AuthButton Component
 * 
 * A reusable authentication button styled with Para brand colors.
 * Used for "Log in" and "Register" actions on the Welcome Screen.
 * 
 * @module components/auth/AuthButton
 */

import React from 'react';
import { StyleSheet, TouchableOpacity, Text, ViewStyle, TextStyle } from 'react-native';

/**
 * Brand color tokens (matching gluestack-ui.config.ts)
 */
const COLORS = {
  paraBrand: '#E9AE16',
  buttonTextDark: '#20350B',
} as const;

/**
 * Props for AuthButton component
 */
export interface AuthButtonProps {
  /** Button label text */
  text: string;
  /** Callback function when button is pressed */
  onPress: () => void;
  /** Button variant - primary (filled) or outline */
  variant?: 'primary' | 'outline';
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Custom style overrides */
  style?: ViewStyle;
  /** Custom text style overrides */
  textStyle?: TextStyle;
  /** Test ID for testing */
  testID?: string;
}

/**
 * AuthButton Component
 * 
 * A branded button for authentication actions.
 * 
 * @example
 * ```tsx
 * <AuthButton 
 *   text="Log in" 
 *   onPress={() => navigation.navigate('Login')} 
 * />
 * ```
 */
export const AuthButton: React.FC<AuthButtonProps> = ({
  text,
  onPress,
  variant = 'primary',
  disabled = false,
  style,
  textStyle,
  testID,
}) => {
  const isPrimary = variant === 'primary';

  return (
    <TouchableOpacity
      style={[
        styles.button,
        isPrimary ? styles.primaryButton : styles.outlineButton,
        disabled && styles.disabledButton,
        style,
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
      testID={testID}
    >
      <Text
        style={[
          styles.buttonText,
          isPrimary ? styles.primaryText : styles.outlineText,
          disabled && styles.disabledText,
          textStyle,
        ]}
      >
        {text}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    height: 44,
    minWidth: 117,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  primaryButton: {
    backgroundColor: COLORS.paraBrand,
  },
  outlineButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: COLORS.paraBrand,
  },
  disabledButton: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 14,
    fontFamily: 'Inter',
    fontWeight: '600',
  },
  primaryText: {
    color: COLORS.buttonTextDark,
  },
  outlineText: {
    color: COLORS.paraBrand,
  },
  disabledText: {
    opacity: 0.7,
  },
});

export default AuthButton;
