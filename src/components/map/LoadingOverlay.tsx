/**
 * Loading Overlay Component
 * 
 * Full-screen loading overlay with progressive messages.
 * Designed for Render free tier cold start delays (30-45 seconds).
 * 
 * @module components/map/LoadingOverlay
 */

import React, { useState, useEffect, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Animated,
  Dimensions,
} from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// =============================================================================
// Types
// =============================================================================

export interface LoadingOverlayProps {
  /** Whether to show the overlay */
  visible: boolean;
  /** Custom loading message (overrides progressive messages) */
  message?: string;
  /** Enable progressive messages for cold start */
  progressiveMessages?: boolean;
  /** Callback when user might want to cancel */
  onCancel?: () => void;
}

// =============================================================================
// Progressive Messages
// =============================================================================

/**
 * Messages shown progressively during long loading times
 * Designed for Render cold start UX
 */
const PROGRESSIVE_MESSAGES = [
  { delay: 0, message: 'Searching for routes...' },
  { delay: 5000, message: 'Connecting to server...' },
  { delay: 10000, message: 'Server is waking up...' },
  { delay: 20000, message: 'Almost there, please wait...' },
  { delay: 30000, message: 'This is taking longer than usual...' },
  { delay: 45000, message: 'Still working on it...' },
];

// =============================================================================
// Component
// =============================================================================

/**
 * Full-screen loading overlay with progressive messaging
 * 
 * Features:
 * - Smooth fade in/out animation
 * - Progressive messages for cold start scenarios
 * - Customizable message
 * - Consistent brand styling
 * 
 * @example
 * ```tsx
 * <LoadingOverlay 
 *   visible={isSearching} 
 *   progressiveMessages 
 * />
 * ```
 */
export const LoadingOverlay: React.FC<LoadingOverlayProps> = memo(({
  visible,
  message,
  progressiveMessages = true,
  onCancel,
}) => {
  // Animation value for fade
  const [fadeAnim] = useState(new Animated.Value(0));
  
  // Current message index for progressive messages
  const [messageIndex, setMessageIndex] = useState(0);
  
  // Track elapsed time for progressive messages
  const [startTime, setStartTime] = useState<number | null>(null);

  // Track visibility for conditional rendering
  const [shouldRender, setShouldRender] = useState(visible);

  // Handle visibility animation
  useEffect(() => {
    if (visible) {
      // Show immediately, reset state
      setShouldRender(true);
      setMessageIndex(0);
      setStartTime(Date.now());
      
      // Fade in
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    } else {
      // Fade out, then hide
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start(() => {
        setShouldRender(false);
      });
      
      // Reset state
      setStartTime(null);
      setMessageIndex(0);
    }
  }, [visible, fadeAnim]);

  // Progressive message timer
  useEffect(() => {
    if (!visible || !progressiveMessages || !startTime) return;

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      
      // Find the appropriate message based on elapsed time
      let newIndex = 0;
      for (let i = PROGRESSIVE_MESSAGES.length - 1; i >= 0; i--) {
        if (elapsed >= PROGRESSIVE_MESSAGES[i].delay) {
          newIndex = i;
          break;
        }
      }
      
      if (newIndex !== messageIndex) {
        setMessageIndex(newIndex);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [visible, progressiveMessages, startTime, messageIndex]);

  // Don't render if not needed
  if (!shouldRender) {
    return null;
  }

  // Determine which message to show
  const displayMessage = message || 
    (progressiveMessages 
      ? PROGRESSIVE_MESSAGES[messageIndex].message 
      : 'Loading...');

  return (
    <Animated.View 
      style={[
        styles.container,
        { opacity: fadeAnim }
      ]}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      <View style={styles.content}>
        {/* Loading spinner */}
        <ActivityIndicator 
          size="large" 
          color="#E9AE16" 
          style={styles.spinner}
        />
        
        {/* Loading message */}
        <Text style={styles.message}>{displayMessage}</Text>
        
        {/* Subtitle for long waits */}
        {progressiveMessages && messageIndex >= 2 && (
          <Text style={styles.subtitle}>
            First request may take up to a minute
          </Text>
        )}
        
        {/* Para branding */}
        <View style={styles.brandContainer}>
          <Text style={styles.brandText}>Para</Text>
        </View>
      </View>
    </Animated.View>
  );
});

LoadingOverlay.displayName = 'LoadingOverlay';

// =============================================================================
// Styles
// =============================================================================

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  spinner: {
    marginBottom: 24,
    transform: [{ scale: 1.5 }],
  },
  message: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 8,
  },
  brandContainer: {
    marginTop: 40,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(233, 174, 22, 0.1)',
  },
  brandText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#E9AE16',
    letterSpacing: 2,
  },
});

// =============================================================================
// Console Log Verification (Development only)
// =============================================================================

if (__DEV__) {
  console.log('✅ [LoadingOverlay.tsx] Loading Overlay component loaded');
}
