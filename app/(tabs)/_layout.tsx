import { useTheme } from "../../src/theme/ThemeContext";
import { Tabs } from 'expo-router';
import { StyleSheet, View, Text, Animated, Dimensions, Platform, TouchableWithoutFeedback, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/theme';
import { useEffect, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useStore } from '../../store/useStore';

const { width } = Dimensions.get('window');

function TabBarBackground({ theme }: { theme: any }) {
  const insets = useSafeAreaInsets();
  const bottomSpace = insets.bottom > 0 ? insets.bottom * 0.6 : 24;
  const height = 48 + bottomSpace;
  const cx = width / 2;

  // A smooth continuous notch for the button to sit in
  const path = `
    M 0,0 
    L ${cx - 52},0
    C ${cx - 36},0 ${cx - 38},44 ${cx},44
    C ${cx + 38},44 ${cx + 36},0 ${cx + 52},0
    L ${width},0
    L ${width},${height}
    L 0,${height}
    Z
  `;

  return (
    <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height, backgroundColor: 'transparent', elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.1, shadowRadius: 4 }}>
      <Svg width={width} height={height}>
        <Path d={path} fill={theme.cardBackground} />
      </Svg>
    </View>
  );
}

function LiquidGlassHomeButton({ focused, onPress }: { focused: boolean, onPress: () => void }) {
  const idleAnim = useRef(new Animated.Value(0)).current;
  const pressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(idleAnim, {
        toValue: 1,
        duration: 3000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, [idleAnim]);

  const handlePressIn = () => {
    Animated.spring(pressAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 40,
      friction: 5,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(pressAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 40,
      friction: 5,
    }).start();
    onPress();
  };

  const scaleIdle1 = idleAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.3]
  });
  const opacityIdle1 = idleAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.6, 0.2, 0]
  });

  const scaleIdle2 = idleAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.8, 1.6]
  });
  const opacityIdle2 = idleAnim.interpolate({
    inputRange: [0, 0.3, 0.7, 1],
    outputRange: [0, 0.5, 0.1, 0]
  });

  const buttonScale = pressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.9]
  });

  return (
    <TouchableWithoutFeedback onPressIn={handlePressIn} onPressOut={handlePressOut}>
      <Animated.View style={[styles.homeButtonContainer, { transform: [{ scale: buttonScale }] }]}>
        <View style={styles.homeButtonBase}>
          <Ionicons name={focused ? 'home' : 'home-outline'} size={28} color="#FFFFFF" />
        </View>
      </Animated.View>
    </TouchableWithoutFeedback>
  );
}

function CustomTabBar({ state, descriptors, navigation }: any) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomInset = insets.bottom;
  const user = useStore((state) => state.user);
  
  const bottomSpace = insets.bottom > 0 ? insets.bottom * 0.6 : 24;

  return (
    <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
      {/* Cutout Background */}
      <TabBarBackground theme={theme} />
      
      <View style={[styles.customTabBarContainer, { height: 48, paddingBottom: 0, marginBottom: bottomSpace }]}>
        {state.routes.map((route: any, index: number) => {
          const { options } = descriptors[route.key];
            if (options.href === null) return null;
          const label =
            options.tabBarLabel !== undefined
              ? options.tabBarLabel
              : options.title !== undefined
              ? options.title
              : route.name;

          const isFocused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          if (route.name === 'index') {
            return (
              <View key={route.key} style={styles.centerTabWrapper}>
                <View style={[styles.homeButtonWrapper, { bottom: 12 }]}>
                   <LiquidGlassHomeButton focused={isFocused} onPress={onPress} />
                </View>
              </View>
            );
          }

          if (route.name === 'routes') {
            const isHistoryFocused = isFocused;
            return (
              <TouchableWithoutFeedback key={route.key} onPress={onPress}>
                <View style={styles.tabItem}>
                  <Ionicons name={isHistoryFocused ? 'map' : 'map-outline'} size={24} color={isHistoryFocused ? '#E8A020' : 'rgba(0,0,0,0.35)'} style={{ marginBottom: 2 }} />
                  <Text style={[styles.tabLabel, { color: isHistoryFocused ? '#E8A020' : 'rgba(0,0,0,0.35)' }]}>
                    {label as string}
                  </Text>
                </View>
              </TouchableWithoutFeedback>
            );
          }

          let iconName = '';
          if (route.name === 'saved') iconName = isFocused ? 'bookmark' : 'bookmark-outline';

          return (
            <TouchableWithoutFeedback key={route.key} onPress={onPress}>
              <View style={styles.tabItem}>
                <Ionicons name={iconName as any} size={24} color={isFocused ? '#E8A020' : 'rgba(0,0,0,0.35)'} style={{ marginBottom: 2 }} />
                <Text style={[styles.tabLabel, { color: isFocused ? '#E8A020' : 'rgba(0,0,0,0.35)' }]}>
                  {label as string}
                </Text>
              </View>
            </TouchableWithoutFeedback>
          );
        })}
      </View>
    </View>
  );
}

export default function TabLayout() {
  const { theme, isDark } = useTheme();
  const sessionMode = useStore((state) => state.sessionMode);
  const user = useStore((state) => state.user);
  const syncWithSupabase = useStore((state) => state.syncWithSupabase);

  useEffect(() => {
    if (sessionMode === 'auth') {
      syncWithSupabase();
    }
  }, [sessionMode]);

  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="saved"
        options={{
          title: 'Saved',
          href: sessionMode === 'guest' ? null : undefined,
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
        }}
      />
      <Tabs.Screen
        name="routes"
        options={{
          title: 'Routes',
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  customTabBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    backgroundColor: 'transparent',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  centerTabWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  homeButtonWrapper: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeButtonContainer: {
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeButtonBase: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#E8A020',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#E8A020',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
    overflow: 'hidden',
  },
  tabLabel: {
    fontFamily: 'Inter',
    fontSize: 9,
    fontWeight: '600',
  },
  avatarIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  avatarFocused: {
    backgroundColor: '#E8A020',
  },
  avatarInitials: {
    fontFamily: 'Inter',
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(0,0,0,0.5)',
  },
  avatarInitialsFocused: {
    color: '#FFFFFF',
  },
});
