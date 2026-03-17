/**
 * Para Mobile - App Entry Point
 * 
 * Main application component that handles:
 * - Custom font loading
 * - Splash screen management
 * - Theme provider configuration
 * - Navigation setup with auth state management
 * 
 * @module App
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { GluestackUIProvider } from './components/ui/gluestack-ui-provider';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import * as Font from 'expo-font';

import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Home, Search, Coins, User } from 'lucide-react-native';

// Screens
import { WelcomeScreen } from './src/screens/WelcomeScreen';
import { LoginScreen, CompleteDetailsScreen, SuccessScreen } from './src/screens/auth';
import { HomeScreen, MapScreen } from './src/screens';
import { ProfileScreen, StatisticsDetailScreen, SettingsScreen, FareCalculatorScreen, SavedTripsScreen, MapSearchScreen } from './src/screens/main';

// Auth Provider and Hook
import { AuthProvider, useAuth } from './src/context/AuthContext';

/**
 * Placeholder screens for bottom tabs - SearchScreen kept for reference
 */
const SearchScreen: React.FC = () => (
  <View style={styles.placeholderScreen}>
    <Search size={48} color={COLORS.grayMedium} />
  </View>
);

/**
 * Main Tab Navigator
 * Bottom tab navigation for authenticated users
 */
const MainTabNavigator: React.FC = () => {
  return (
    <Tab.Navigator
      id="MainTabs"
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: COLORS.white,
          borderTopWidth: 1,
          borderTopColor: COLORS.border,
          paddingTop: 8,
          // Let the tab bar handle safe area automatically
        },
        tabBarActiveTintColor: COLORS.black,
        tabBarInactiveTintColor: COLORS.grayMedium,
        tabBarLabelStyle: {
          fontFamily: 'Inter',
          fontSize: 11,
          fontWeight: '600',
          letterSpacing: 0.2,
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Home size={24} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Map"
        component={MapScreen}
        options={{
          title: 'Map',
          tabBarIcon: ({ color, size }) => (
            <Search size={24} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Fare"
        component={FareCalculatorScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Coins size={24} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <User size={24} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
};

// Define navigation types
export type RootStackParamList = {
  Welcome: undefined;
  Login: undefined;
  Register: undefined;
  Success: undefined;
  MainTabs: undefined;
  Settings: undefined;
  SavedTrips: undefined;
  MapSearch: {
    inputType?: 'origin' | 'destination';
    returnScreen?: string;
  } | undefined;
  StatisticsDetail: {
    type: string;
    title: string;
    value: string;
  };
};

export type MainTabParamList = {
  Home: undefined;
  Map: { focusSearch?: boolean } | undefined;
  Fare: undefined;
  Profile: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

// Brand colors
const COLORS = {
  black: '#1C1B1F',
  grayMedium: '#A09CAB',
  white: '#FFFFFF',
  border: '#333333',
};

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

/**
 * Custom fonts to load
 * Maps font family names to their file paths
 */
const customFonts = {
  // Cubao Free 2 - Display font for headlines
  'CubaoFree2-Regular': require('./assets/fonts/CubaoFree2-Regular.ttf'),
  'CubaoFree2-Condensed': require('./assets/fonts/CubaoFree2-Condensed.ttf'),
  'CubaoFree2-SemiCondensed': require('./assets/fonts/CubaoFree2-SemiCondensed.ttf'),
  'CubaoFree2-SemiExpanded': require('./assets/fonts/CubaoFree2-SemiExpanded.ttf'),
  'CubaoFree2-Expanded': require('./assets/fonts/CubaoFree2-Expanded.ttf'),
  'CubaoFree2-ExtraExpanded': require('./assets/fonts/CubaoFree2-ExtraExpanded.ttf'),
  'CubaoFree2-ExtraCondensed': require('./assets/fonts/CubaoFree2-ExtraCondensed.ttf'),
  'CubaoFree2-UltraCondensed': require('./assets/fonts/CubaoFree2-UltraCondensed.ttf'),
  'CubaoFree2-UltraExpanded': require('./assets/fonts/CubaoFree2-UltraExpanded.ttf'),
  
  // Quiapo Free 2 - Italic/decorative font for taglines
  'QuiapoFree2-Regular': require('./assets/fonts/QuiapoFree2-Regular.ttf'),
  'QuiapoFree2-Light': require('./assets/fonts/QuiapoFree2-Light.ttf'),
  
  // Inter - Body text and UI font
  'Inter': require('./assets/fonts/Inter-VariableFont_opsz,wght.ttf'),
  'Inter-Italic': require('./assets/fonts/Inter-Italic-VariableFont_opsz,wght.ttf'),
};

/**
 * Auth-aware Navigator Component
 * 
 * Handles navigation based on authentication state:
 * - Not authenticated: Show Welcome/Login screens
 * - Authenticated but no profile OR hasn't filled details: Show CompleteDetails screen
 * - Authenticated with profile, filled details, but not completed onboarding: Show Success screen
 * - Authenticated with profile and completed onboarding: Show Home screen
 */
const AppNavigator: React.FC = () => {
  const { user, userProfile, isLoading } = useAuth();

  // Show loading indicator while checking auth state
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#E9AE16" />
      </View>
    );
  }

  // Determine navigation state
  const hasFilledDetails = userProfile?.hasFilledDetails ?? false;
  const hasCompletedOnboarding = userProfile?.hasCompletedOnboarding ?? false;

  // Debug logging
  console.log('[AppNavigator] Navigation state:', {
    user: !!user,
    userProfile: !!userProfile,
    hasFilledDetails,
    hasCompletedOnboarding,
  });

  return (
    <Stack.Navigator
      id="RootStack"
      screenOptions={{
        headerShown: false,
      }}
    >
      {!user ? (
        // Not authenticated - show auth flow
        <>
          <Stack.Screen name="Welcome" component={WelcomeScreen} />
          <Stack.Screen name="Login" component={LoginScreen} />
        </>
      ) : !userProfile || !hasFilledDetails ? (
        // Authenticated but no profile OR hasn't filled details - show CompleteDetails
        <>
          <Stack.Screen name="Register" component={CompleteDetailsScreen} />
          <Stack.Screen name="Success" component={SuccessScreen} />
          <Stack.Screen name="MainTabs" component={MainTabNavigator} />
        </>
      ) : !hasCompletedOnboarding ? (
        // Has filled details but hasn't completed onboarding - show Success screen
        <>
          <Stack.Screen name="Success" component={SuccessScreen} />
          <Stack.Screen name="MainTabs" component={MainTabNavigator} />
        </>
      ) : (
        // Fully authenticated with profile - show main app with bottom tabs
        <>
          <Stack.Screen name="MainTabs" component={MainTabNavigator} />
          <Stack.Screen name="Success" component={SuccessScreen} />
          <Stack.Screen name="Settings" component={SettingsScreen} />
          <Stack.Screen name="SavedTrips" component={SavedTripsScreen} />
          <Stack.Screen name="MapSearch" component={MapSearchScreen} />
          <Stack.Screen name="StatisticsDetail" component={StatisticsDetailScreen} />
        </>
      )}
    </Stack.Navigator>
  );
};

/**
 * Main App Component
 */
export default function App() {
  const [appIsReady, setAppIsReady] = useState(false);

  useEffect(() => {
    async function prepare() {
      try {
        // Load custom fonts
        await Font.loadAsync(customFonts);
        
        // Artificially delay for a smoother experience (optional)
        // await new Promise(resolve => setTimeout(resolve, 500));
      } catch (e) {
        console.warn('Error loading fonts:', e);
      } finally {
        // Tell the application to render
        setAppIsReady(true);
      }
    }

    prepare();
  }, []);

  const onLayoutRootView = useCallback(async () => {
    if (appIsReady) {
      // This tells the splash screen to hide immediately
      await SplashScreen.hideAsync();
    }
  }, [appIsReady]);

  if (!appIsReady) {
    return null;
  }

  return (
    <GestureHandlerRootView style={styles.container}>
      <GluestackUIProvider mode="light">
        <SafeAreaProvider>
          <AuthProvider>
            <View style={styles.container} onLayout={onLayoutRootView}>
              <NavigationContainer>
                <AppNavigator />
              </NavigationContainer>
            </View>
          </AuthProvider>
        </SafeAreaProvider>
      </GluestackUIProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  placeholderScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
});
