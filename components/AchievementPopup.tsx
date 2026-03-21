import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Animated, Image, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BADGES } from '../constants/badges';
import { BADGE_IMAGES } from '../constants/badgeImages';
import { useStore } from '../store/useStore';

export function AchievementPopup() {
  const [slideAnim] = useState(new Animated.Value(-150));
  const insets = useSafeAreaInsets();
  
  const badgeId = useStore(state => state.unlockedBadgeToShow);
  const clearBadge = useStore(state => state.clearUnlockedBadge);

  const handleClose = () => {
    Animated.timing(slideAnim, {
      toValue: -150,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      clearBadge();
    });
  };

  useEffect(() => {
    if (badgeId) {
      Animated.spring(slideAnim, {
        toValue: Math.max(insets.top + 10, 40),
        useNativeDriver: true,
        bounciness: 12,
      }).start();

      const timer = setTimeout(() => {
        handleClose();
      }, 4000);

      return () => clearTimeout(timer);
    }
  }, [badgeId, insets.top]);

  if (!badgeId) return null;

  const badge = BADGES.find(b => b.id === badgeId);
  if (!badge) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          {BADGE_IMAGES[badge.id] ? (
            <Image 
              source={BADGE_IMAGES[badge.id]} 
              style={styles.badgeImage} 
              resizeMode="contain" 
            />
          ) : (
            <Text style={styles.iconTxt}>{badge.icon}</Text>
          )}
        </View>
        <View style={styles.textContainer}>
          <Text style={styles.title}>ACHIEVEMENT UNLOCKED!</Text>
          <Text style={styles.name}>{badge.name}</Text>
          <Text style={styles.desc}>{badge.description}</Text>
        </View>
        <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
          <Ionicons name="close" size={20} color="#6B7280" />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 16,
    right: 16,
    zIndex: 99999,
  },
  content: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#E8A020', // yellow gold border like the screenshot
  },
  iconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#d5a944',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  iconTxt: {
    fontSize: 28,
  },
  badgeImage: {
    width: 40,
    height: 40,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    color: '#E8A020', 
    fontSize: 10,
    fontFamily: 'Inter',
    fontWeight: '800',
    textTransform: 'uppercase',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  name: {
    color: '#1A1A2E',
    fontSize: 16,
    fontFamily: 'Inter',
    fontWeight: '700',
    marginBottom: 3,
  },
  desc: {
    color: '#6B7280',
    fontFamily: 'Inter',
    fontSize: 12,
  },
  closeBtn: {
    padding: 8,
  }
});
