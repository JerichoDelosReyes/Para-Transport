import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useNetInfo } from '@react-native-community/netinfo';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function GlobalOfflineBanner() {
  const netInfo = useNetInfo();
  const insets = useSafeAreaInsets();

  // If we don't know the state yet, don't show the component
  if (netInfo.isConnected === null) {
    return null;
  }

  // Show if clearly offline
  const isOffline = netInfo.isConnected === false; // Usually sufficient to ensure no false positives without over-filtering 'none'

  if (!isOffline) {
    return null;
  }

  return (
    <View style={[styles.container, { top: Math.max(insets.top, 50) + 75 }]}>
      <View style={styles.popup}>
        <Ionicons name="cloud-offline-outline" size={24} color="#DC2626" style={styles.icon} />
        <View style={styles.textContainer}>
          <Text style={styles.title}>No Internet Connection</Text>
          <Text style={styles.message}>Please check your network settings.</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 99998,
    width: '90%',
  },
  popup: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.2)', // Slight red tint to border
  },
  icon: {
    marginRight: 16,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontFamily: 'Inter',
    fontWeight: '700',
    fontSize: 15,
    color: '#1F2937',
    marginBottom: 4,
  },
  message: {
    fontFamily: 'Inter',
    fontWeight: '400',
    fontSize: 13,
    color: '#4B5563',
  },
});
