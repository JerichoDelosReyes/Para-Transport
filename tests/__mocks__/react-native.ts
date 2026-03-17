/**
 * React Native Mock for Jest Testing
 * Provides minimal mock implementations for React Native components and APIs
 * used in stopwatch.tsx for Node.js test environment
 */

import React from 'react';

// Mock View component
export const View = ({ children, style, ...props }: any) => 
  React.createElement('div', { style, ...props }, children);

// Mock Text component
export const Text = ({ children, style, ...props }: any) => 
  React.createElement('span', { style, ...props }, children);

// Mock TextInput component
export const TextInput = ({ value, onChangeText, placeholder, style, ...props }: any) => 
  React.createElement('input', { 
    value, 
    onChange: (e: any) => onChangeText?.(e.target.value),
    placeholder,
    style,
    ...props 
  });

// Mock TouchableOpacity component
export const TouchableOpacity = ({ children, onPress, style, disabled, ...props }: any) => 
  React.createElement('button', { 
    onClick: onPress, 
    style, 
    disabled,
    ...props 
  }, children);

// Mock ActivityIndicator component
export const ActivityIndicator = ({ size, color, ...props }: any) => 
  React.createElement('div', { 'data-testid': 'activity-indicator', ...props }, 'Loading...');

// Mock Animated API
export const Animated = {
  View,
  Text,
  Value: class AnimatedValue {
    _value: number;
    constructor(value: number) { this._value = value; }
    setValue(value: number) { this._value = value; }
    interpolate(config: any) { return this; }
  },
  timing: (value: any, config: any) => ({
    start: (callback?: () => void) => callback?.(),
  }),
  spring: (value: any, config: any) => ({
    start: (callback?: () => void) => callback?.(),
  }),
  loop: (animation: any) => ({
    start: () => {},
    stop: () => {},
  }),
  createAnimatedComponent: (Component: any) => Component,
};

// Mock StyleSheet
export const StyleSheet = {
  create: <T extends { [key: string]: any }>(styles: T): T => styles,
  flatten: (style: any) => style,
  absoluteFillObject: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
};

// Mock Platform
export const Platform = {
  OS: 'ios' as const,
  select: <T>(obj: { ios?: T; android?: T; default?: T }) => 
    obj.ios ?? obj.default,
  Version: 14,
};

// Mock Vibration
export const Vibration = {
  vibrate: jest.fn(),
  cancel: jest.fn(),
};

// Mock Dimensions
export const Dimensions = {
  get: (dim: 'window' | 'screen') => ({
    width: 375,
    height: 812,
    scale: 2,
    fontScale: 1,
  }),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
};

// Default export for module-style imports
export default {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  StyleSheet,
  Platform,
  Vibration,
  Dimensions,
};

// Type exports (empty but required for TypeScript)
export type ViewStyle = { [key: string]: any };
export type TextStyle = { [key: string]: any };
export type ImageStyle = { [key: string]: any };
