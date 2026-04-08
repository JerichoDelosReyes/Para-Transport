import '../global.css';
import { ThemeProvider, useTheme } from '../src/theme/ThemeContext';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState, useRef } from 'react';

import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, Animated, StyleSheet, Easing, Image, LogBox, AppState, AppStateStatus } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { COLORS } from '../constants/theme';
import { AchievementPopup } from '../components/AchievementPopup';
import { GlobalBroadcast } from '../components/GlobalBroadcast';
import { GlobalOfflineBanner } from '../components/GlobalOfflineBanner';
import { GlobalBannedModal } from '../components/GlobalBannedModal';
import { supabase } from '../config/supabaseClient';
import { useStore } from '../store/useStore';

// Ignore MapLibre network errors as we have our own network connectivity indicator
LogBox.ignoreLogs([
  'MapLibre Native [ERROR] [-MLNNetworkCo',
  'MapLibre Native [ERROR]',
]);

SplashScreen.preventAutoHideAsync();

function CustomSplash({ onFinish }: { onFinish: () => void }) {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  
  // The final pulse of the entire logo
  const logoScaleAnim = useRef(new Animated.Value(1)).current;
  
  // The whole screen fading out
  const screenOpacityAnim = useRef(new Animated.Value(1)).current;

  const setBadgesData = useStore(state => state.setBadgesData);
  const setFareMatrices = useStore(state => state.setFareMatrices);

  useEffect(() => {
    const fetchAppConfig = async () => {
      const { data: badgesData } = await supabase.from('badges').select('*');
      if (badgesData && badgesData.length) {
        setBadgesData(badgesData);
      } else {
        const { BADGES } = require('../constants/badges');
        setBadgesData(BADGES.map((b: any) => ({ id: b.id, name: b.name, description: b.description, condition_value: b.goal, condition_type: b.type, icon_url: b.id })));
      }

      const { data: faresData } = await supabase.from('fare_matrices').select('*');
      if (faresData && faresData.length) {
        setFareMatrices(faresData);
      } else {
        setFareMatrices([
          { vehicle_type: 'jeepney', base_fare: 13.0, base_distance: 4.0, per_km_rate: 1.8 },
          { vehicle_type: 'bus', base_fare: 15.0, base_distance: 5.0, per_km_rate: 2.65 },
          { vehicle_type: 'tricycle', base_fare: 25.0, base_distance: 1.0, per_km_rate: 5.0 },
          { vehicle_type: 'uv_express', base_fare: 25.0, base_distance: 2.0, per_km_rate: 2.0 },
        ]);
      }
    };
    fetchAppConfig();
  }, []);

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
          zIndex: 9999999,
          elevation: 9999999,
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
  const setBadgesData = useStore(state => state.setBadgesData);
  const setFareMatrices = useStore(state => state.setFareMatrices);

  useEffect(() => {
    const fetchAppConfig = async () => {
      const { data: badgesData } = await supabase.from('badges').select('*');
      if (badgesData && badgesData.length) {
        setBadgesData(badgesData);
      } else {
        const { BADGES } = require('../constants/badges');
        setBadgesData(BADGES.map((b: any) => ({ id: b.id, name: b.name, description: b.description, condition_value: b.goal, condition_type: b.type, icon_url: b.id })));
      }

      const { data: faresData } = await supabase.from('fare_matrices').select('*');
      if (faresData && faresData.length) {
        setFareMatrices(faresData);
      } else {
        setFareMatrices([
          { vehicle_type: 'jeepney', base_fare: 13.0, base_distance: 4.0, per_km_rate: 1.8 },
          { vehicle_type: 'bus', base_fare: 15.0, base_distance: 5.0, per_km_rate: 2.65 },
          { vehicle_type: 'tricycle', base_fare: 25.0, base_distance: 1.0, per_km_rate: 5.0 },
          { vehicle_type: 'uv_express', base_fare: 25.0, base_distance: 2.0, per_km_rate: 2.0 },
        ]);
      }
    };
    fetchAppConfig();
  }, []);

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  if (!loaded && !error) {
    return null;
  }

  return (
    <ThemeProvider>
      <RootContent showAnimatedSplash={showAnimatedSplash} setShowAnimatedSplash={setShowAnimatedSplash} />
    </ThemeProvider>
  );
}

function RootContent({ showAnimatedSplash, setShowAnimatedSplash }: { showAnimatedSplash: boolean, setShowAnimatedSplash: (v: boolean) => void }) {
  const { theme } = useTheme();
  const sessionMode = useStore((state) => state.sessionMode);
  const clearSession = useStore((state) => state.clearSession);
  const syncWithSupabase = useStore((state) => state.syncWithSupabase);
  const router = useRouter();

  // Automatically enforce bans or deleted users from any screen (Global Check)
  useEffect(() => {
    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange((event, session) => {
      // If the session drops natively (like their token is revoked or they are forced out)
      if (event === 'SIGNED_OUT' || (event as string) === 'USER_DELETED' || !session) {
        if (sessionMode === 'auth') {
          clearSession();
          router.replace('/');
        }
      }
    });

    let banCheckInterval: NodeJS.Timeout | null = null;
    if (sessionMode === 'auth') {
      // Very strict polling to kill current connection immediately when marked banned mid-flight inside the app
      banCheckInterval = setInterval(async () => {
        const { data, error } = await supabase.auth.getUser();
        if (error) {
          const msg = error.message.toLowerCase();
          if (msg.includes('suspended') || msg.includes('banned') || msg.includes('user_banned') || msg.includes('invalid_grant')) {
            useStore.getState().setBannedPopupVisible(true);
            if (banCheckInterval) clearInterval(banCheckInterval);
          }
        }
      }, 15000); // 15 seconds real-time polling to boot users dynamically without waiting on foreground app switches
    }
    
    // Globally run background checks when app returns to foreground
    const appSub = AppState.addEventListener('change', (next) => {
      if (next === 'active' && sessionMode === 'auth') {
        syncWithSupabase();
      }
    });
    
    // Rigorously test sessionMode dropping organically
    if (sessionMode === null) {
      router.replace('/');
    }

    return () => {
      authSub.unsubscribe();
      appSub.remove();
      if (banCheckInterval) if (banCheckInterval) clearInterval(banCheckInterval);
    };
  }, [sessionMode]);

  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        <StatusBar style={theme.statusBar as any} />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.background } }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="login" />
          <Stack.Screen name="register" />
          <Stack.Screen name="reset-password" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="journey" />
          <Stack.Screen name="journey-summary" />
        </Stack>

        <View style={{ ...StyleSheet.absoluteFillObject, zIndex: 99999, elevation: 99999 }} pointerEvents="box-none">
          {/* Global Offline Info Banner Overlay */}
          <GlobalOfflineBanner />

          {/* Global Ban Enforcement Popup */}
          <GlobalBannedModal />

          {/* Global Broadcast Overlay */}
          <GlobalBroadcast />

          {/* Global Achievement Popup Overlay */}
          <AchievementPopup />

          {/* Custom Animated Splash Screen Overlay (Last = Top Z-Index) */}
          {showAnimatedSplash && (
            <CustomSplash onFinish={() => setShowAnimatedSplash(false)} />
          )}
        </View>
      </View>
    </SafeAreaProvider>
  );
}