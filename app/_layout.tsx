import '../global.css';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState, useRef } from 'react';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, Animated, StyleSheet, Easing, Image } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { COLORS } from '../constants/theme';
import { AchievementPopup } from '../components/AchievementPopup';

SplashScreen.preventAutoHideAsync();

function CustomSplash({ onFinish }: { onFinish: () => void }) {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  
  // The final pulse of the entire logo
  const logoScaleAnim = useRef(new Animated.Value(1)).current;
  
  // The whole screen fading out
  const screenOpacityAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.sequence([
      // 1. Entrance Animation
      Animated.parallel([
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 500,
          easing: Easing.out(Easing.back(1.5)),
          useNativeDriver: true,
        }),
      ]),
      // 2. Final Subtle Pulse
      Animated.sequence([
        Animated.timing(logoScaleAnim, {
          toValue: 1.05,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(logoScaleAnim, {
          toValue: 1.0,
          duration: 150,
          useNativeDriver: true,
        }),
      ]),
      // 3. Hold
      Animated.delay(800),
      // 4. Fade entire screen
      Animated.timing(screenOpacityAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onFinish();
    });
  }, []);

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFill,
        {
          backgroundColor: '#E8A020', // Golden yellow background
          zIndex: 9999,
          justifyContent: 'center',
          alignItems: 'center',
          opacity: screenOpacityAnim,
        },
      ]}
    >
      <Animated.View
        style={{
          opacity: opacityAnim,
          transform: [
            { scale: scaleAnim },
            { scale: logoScaleAnim }
          ],
        }}
      >
        <Image 
          source={require('../assets/logo/appicon02.png')} 
          style={{ width: 320, height: 320 }} 
          resizeMode="contain" 
        />
      </Animated.View>
    </Animated.View>
  );
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    'Cubao': require('../assets/fonts/CubaoFree2-Regular.ttf'),
    'Quiapo': require('../assets/fonts/QuiapoFree2-Regular.ttf'),
    'Inter': require('../assets/fonts/Inter-VariableFont_opsz,wght.ttf'),
    'Inter-Italic': require('../assets/fonts/Inter-Italic-VariableFont_opsz,wght.ttf'),
  });

  const [showAnimatedSplash, setShowAnimatedSplash] = useState(true);

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  if (!loaded && !error) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: COLORS.background }}>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: COLORS.background } }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="login" />
          <Stack.Screen name="register" />
          <Stack.Screen name="reset-password" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="journey" />
          <Stack.Screen name="journey-summary" />
        </Stack>

        {/* Custom Animated Splash Screen Overlay */}
        {showAnimatedSplash && (
          <CustomSplash onFinish={() => setShowAnimatedSplash(false)} />
        )}

        {/* Global Achievement Popup Overlay */}
        <AchievementPopup />
      </View>
    </SafeAreaProvider>
  );
}