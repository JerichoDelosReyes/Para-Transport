import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';

export function GlassCard({ children, onPress, className = "" }: any) {
  const CardContainer = onPress ? Pressable : View;

  return (
    <CardContainer
      onPress={onPress}
      style={[styles.glassCard]}
      className={`rounded-3xl p-5 mb-4 ${className}`}
    >
      {children}
    </CardContainer>
  );
}

const styles = StyleSheet.create({
  glassCard: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 32,
    elevation: 10,
    // Note: React Native Blur requires expo-blur, but for normal styling we simulate or use regular styling if expo-blur isn't wrapped perfectly.
  },
});
