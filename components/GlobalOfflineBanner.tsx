import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useNetInfo } from '@react-native-community/netinfo';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../constants/theme';

export function GlobalOfflineBanner() {
  const netInfo = useNetInfo();
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(150)).current; // Slide up from bottom
  // Ignore null states. Show offline mostly if 'isConnected' explicitly false.
  // We use strict false check on isConnected to avoid 'null' startup flashes.
  const isOffline = netInfo.isConnected === false && (netInfo.isInternetReachable === false || netInfo.isInternetReachable === null);

  useEffect(() => {
    if (isOffline) {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 150,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [isOffline, slideAnim]);

  if (netInfo.isConnected === null) {
    return null; // Initial state don't show anything
  }

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY: slideAnim }],
          bottom: Math.max(insets.bottom, 20) + 90, // Places it cleanly at the same level as the transit button
        },
      ]}
      pointerEvents="none"
    >
      <View style={styles.content}>
        <Ionicons name="cloud-offline" size={20} color="#FFF" style={styles.icon} />
        <Text style={styles.text}>No internet connection</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 50, // Starts off-screen, handled by animation & insets
    alignSelf: 'center',
    backgroundColor: 'rgba(220, 38, 38, 0.9)', // Deep red, slightly translucent
    zIndex: 99998,
    borderRadius: 30,
    paddingHorizontal: 16,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  icon: {
    marginRight: 0,
  },
  text: {
    fontFamily: 'Inter',
    fontWeight: '700',
    fontSize: 13,
    color: '#FFF',
  },
});
