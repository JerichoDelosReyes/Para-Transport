/**
 * Global Type Declarations for Para Mobile
 * 
 * Provides type definitions for global variables and missing module types.
 */

/// <reference types="react" />

/**
 * React Native development flag
 * Available in React Native runtime
 */
declare const __DEV__: boolean;

/**
 * SVG Module Declaration
 * Allows importing SVG files as React components
 */
declare module '*.svg' {
  import React from 'react';
  import { SvgProps } from 'react-native-svg';
  const content: React.FC<SvgProps>;
  export default content;
}

/**
 * Expo Location types extension
 */
declare module 'expo-location' {
  export interface LocationSubscription {
    remove(): void;
  }
  
  export interface LocationObject {
    coords: {
      latitude: number;
      longitude: number;
      altitude: number | null;
      accuracy: number | null;
      altitudeAccuracy: number | null;
      heading: number | null;
      speed: number | null;
    };
    timestamp: number;
  }

  export interface LocationOptions {
    accuracy?: Accuracy;
    timeInterval?: number;
    distanceInterval?: number;
  }

  export enum Accuracy {
    Lowest = 1,
    Low = 2,
    Balanced = 3,
    High = 4,
    Highest = 5,
    BestForNavigation = 6,
  }

  export interface PermissionResponse {
    status: 'granted' | 'denied' | 'undetermined';
    granted: boolean;
    canAskAgain: boolean;
  }

  export function requestForegroundPermissionsAsync(): Promise<PermissionResponse>;
  export function getForegroundPermissionsAsync(): Promise<PermissionResponse>;
  export function getCurrentPositionAsync(options?: LocationOptions): Promise<LocationObject>;
  export function watchPositionAsync(
    options: LocationOptions,
    callback: (location: LocationObject) => void
  ): Promise<LocationSubscription>;
}

/**
 * Gluestack UI theme extension types
 */
declare module '@gluestack-ui/themed' {
  interface Theme {
    colors: {
      paraBrand: string;
      paraBrand2: string;
      paraBrand3: string;
      textDark900: string;
      textDark500: string;
      textLight: string;
      buttonTextDark: string;
    };
  }
}
