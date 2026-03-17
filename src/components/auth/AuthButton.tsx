/**
 * AuthButton Component
 * 
 * A reusable authentication button styled with Para brand colors.
 * Features premium Apple-inspired design with gradients, sophisticated shadows,
 * and refined glassmorphism effects.
 * 
 * @module components/auth/AuthButton
 */

import React, { useRef } from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  Text,
  ViewStyle,
  TextStyle,
  Animated,
  View,
} from 'react-native';

/**
 * Brand color tokens (matching gluestack-ui.config.ts)
 */
const COLORS = {
  paraBrand: '#E9AE16',
  paraBrandLight: '#F5C844',
  paraBrandDark: '#D49A0C',
  buttonTextDark: '#20350B',
  white: '#FFFFFF',
  shadow: '#000000',
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
 * Incorporates Apple design principles with smooth animations and
 * sophisticated depth effects.
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
  const scaleValue = useRef(new Animated.Value(1)).current;
  const opacityValue = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    if (disabled) return;
    Animated.parallel([
      Animated.spring(scaleValue, {
        toValue: 0.95,
        useNativeDriver: true,
        friction: 8,
      }),
      Animated.timing(opacityValue, {
        toValue: 0.85,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handlePressOut = () => {
    if (disabled) return;
    Animated.parallel([
      Animated.spring(scaleValue, {
        toValue: 1,
        useNativeDriver: true,
        friction: 8,
      }),
      Animated.timing(opacityValue, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start();
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={1}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      testID={testID}
    >
      <Animated.View
        style={[
          styles.buttonContainer,
          {
            transform: [{ scale: scaleValue }],
            opacity: disabled ? 0.5 : opacityValue,
          },
        ]}
      >
        {/* Outer glow shadow */}
        <View style={[styles.glowShadow, isPrimary && styles.glowShadowPrimary]} />
        
        {/* Medium shadow layer */}
        <View style={[styles.mediumShadow, isPrimary && styles.mediumShadowPrimary]} />
        
        {/* Main button */}
        {isPrimary ? (
          <View
            style={[styles.button, styles.primaryButton, style]}
          >
            <Text style={[styles.buttonText, styles.primaryText, textStyle]}>
              {text}
            </Text>
          </View>
        ) : (
          <View style={[styles.button, styles.outlineButton, style]}>
            <Text style={[styles.buttonText, styles.outlineText, textStyle]}>
              {text}
            </Text>
          </View>
        )}
      </Animated.View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  buttonContainer: {
    position: 'relative',
    width: '100%',
  },

  // Premium glow shadow effect
  glowShadow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 18,
    zIndex: 0,
  },
  glowShadowPrimary: {
    shadowColor: COLORS.paraBrand,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 12,
  },

  // Medium shadow for depth
  mediumShadow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 18,
    zIndex: 1,
  },
  mediumShadowPrimary: {
    shadowColor: COLORS.paraBrand,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },

  // Main button
  button: {
    height: 60,
    minWidth: 120,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    zIndex: 2,
    overflow: 'hidden',
  },

  primaryButton: {
    backgroundColor: COLORS.paraBrand,
    borderTopWidth: 1.5,
    borderTopColor: 'rgba(255, 255, 255, 0.6)',
  },

  outlineButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    borderWidth: 1.5,
    borderColor: COLORS.paraBrand,
    borderTopColor: 'rgba(255, 255, 255, 0.9)',
    shadowColor: COLORS.paraBrand,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 7,
  },

  buttonText: {
    fontSize: 17,
    fontFamily: 'Inter',
    fontWeight: '600',
    letterSpacing: 0.4,
  },

  primaryText: {
    color: COLORS.buttonTextDark,
    textShadowColor: 'rgba(0, 0, 0, 0.1)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

  outlineText: {
    color: COLORS.paraBrand,
    fontWeight: '700',
  },
});

export default AuthButton;
