import { Tabs } from 'expo-router';
import { StyleSheet, View, Text, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/theme';
import { useEffect, useRef } from 'react';

function FloatingHomeButton({ focused }: { focused: boolean }) {
  const scaleAnim = useRef(new Animated.Value(focused ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: focused ? 1 : 0,
      useNativeDriver: false,
      tension: 50,
      friction: 7,
    }).start();
  }, [focused, scaleAnim]);

  const translateY = scaleAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -24] // move up when active
  });

  const bgInterpolate = scaleAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#E8A020', '#E8A020']
  });

  const iconColorInterpolate = scaleAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(0,0,0,0.35)', COLORS.navy]
  });

  const buttonSize = scaleAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [32, 56]
  });

  const innerRadius = scaleAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [16, 28]
  });

  const wrapSize = scaleAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [32, 68]
  });

  const wrapRadius = scaleAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [16, 34]
  });

  const wrapBgInterpolate = scaleAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['transparent', '#FFFFFF']
  });

  return (
    <Animated.View style={[styles.tabContentContainer, { transform: [{ translateY }] }]}>
      <Animated.View style={[styles.floatingButtonWrap, { backgroundColor: wrapBgInterpolate, width: wrapSize, height: wrapSize, borderRadius: wrapRadius }]}>
        <Animated.View style={[
          styles.floatingButton,
          { 
            backgroundColor: bgInterpolate,
            width: buttonSize,
            height: buttonSize,
            borderRadius: innerRadius,
            elevation: focused ? 5 : 0,
            shadowOpacity: focused ? 0.15 : 0,
          }
        ]}>
          <Animated.View>
            {/* React Native Animated doesn't directly interpolate color for vector icons out of the box cleanly, 
                so we use focused state for color generally, but the bounce animation looks great */}
            <Ionicons name={focused ? 'home' : 'home-outline'} size={focused ? 28 : 24} color={focused ? COLORS.navy : '#FFFFFF'} />
          </Animated.View>
        </Animated.View>
      </Animated.View>
      <Animated.Text style={[
        styles.homeLabel, 
        { 
          color: focused ? '#E8A020' : 'rgba(0,0,0,0.35)',
          opacity: 1, // Keep text shown based on image requirement
          transform: [
            {
              translateY: scaleAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [4, 18] // push text further down when icon floats up so it sits properly beneath it
              })
            }
          ]
        }
      ]}>
        Home
      </Animated.Text>
    </Animated.View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarShowLabel: true,
        tabBarActiveTintColor: '#E8A020',
        tabBarInactiveTintColor: 'rgba(0,0,0,0.35)',
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      <Tabs.Screen
        name="saved"
        options={{
          title: 'Saved',
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'bookmark' : 'bookmark-outline'} size={24} color={color} />,
        }}
      />
      
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarLabel: () => null,
          tabBarIcon: ({ focused }) => <FloatingHomeButton focused={focused} />,
        }}
      />
      
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'person' : 'person-outline'} size={24} color={color} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#FFFFFF',
    borderTopColor: 'rgba(0,0,0,0.08)',
    borderTopWidth: 1,
    elevation: 0,
    shadowOpacity: 0,
    height: 84,
    paddingBottom: 18,
    paddingTop: 8,
  },
  tabLabel: {
    fontFamily: 'Inter',
    fontSize: 11,
    fontWeight: '600',
  },
  homeLabel: {
    fontFamily: 'Inter',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 0,
    textAlign: 'center',
    position: 'absolute',
    bottom: -6, // anchor bottom relative to floating wrapper
  },
  tabContentContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 70, // gives enough room to bounce up and down
  },
  floatingButtonWrap: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  floatingButton: {
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
  },
});
