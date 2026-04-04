import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { Animated, View, StyleSheet, Dimensions, Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'nativewind';
import { lightColors, darkColors, ThemeColors } from './colors';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: ThemeColors;
  isDark: boolean;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);
const { width, height } = Dimensions.get('window');

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { colorScheme, setColorScheme } = useColorScheme();

  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');
  const [isInitialized, setIsInitialized] = useState(false);
  
  // NativeWind's useColorScheme hook will sync with the OS globally
  const currentIsDark = colorScheme === 'dark';
  
  // Animation state
  const [renderedIsDark, setRenderedIsDark] = useState(currentIsDark);
  const fadeOverlayAnim = useRef(new Animated.Value(0)).current;
  const [overlayColor, setOverlayColor] = useState<string>('transparent');

  useEffect(() => {
    if (isInitialized && currentIsDark !== renderedIsDark) {
      const targetIsDark = currentIsDark;
      const targetBg = targetIsDark ? darkColors.background : lightColors.background;
      
      setOverlayColor(targetBg);
      // Wait for it to set via React before animating
      setTimeout(() => {
        Animated.timing(fadeOverlayAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }).start(() => {
          setRenderedIsDark(targetIsDark);
          setTimeout(() => {
            Animated.timing(fadeOverlayAnim, {
              toValue: 0,
              duration: 350,
              useNativeDriver: true,
            }).start(() => {
              setOverlayColor('transparent');
            });
          }, 50);
        });
      }, 0);
    }
  }, [currentIsDark, isInitialized, renderedIsDark, fadeOverlayAnim]);

  useEffect(() => {
    const loadTheme = async () => {
      try {
        const savedTheme = await AsyncStorage.getItem('para_theme_override');
        const finalMode = (savedTheme === 'light' || savedTheme === 'dark') ? (savedTheme as ThemeMode) : 'system';
        
        setThemeModeState(finalMode);
        // Sync NativeWind with the saved theme (this fixes the inconsistency)
        setColorScheme(finalMode);
        
        // Manually update the starting theme directly without an animation flash
        const isActuallyDark = finalMode === 'dark' || (finalMode === 'system' && Appearance.getColorScheme() === 'dark');
        setRenderedIsDark(isActuallyDark);
      } catch (e) {
        console.error('Failed to load theme preferences', e);
        setRenderedIsDark(Appearance.getColorScheme() === 'dark');
      } finally {
        setIsInitialized(true);
      }
    };
    loadTheme();
  }, []);

  const theme = renderedIsDark ? darkColors : lightColors;

  const setThemeMode = async (mode: ThemeMode) => {
    setThemeModeState(mode);
    setColorScheme(mode);
    try {
      if (mode === 'system') {
        await AsyncStorage.removeItem('para_theme_override');
      } else {
        await AsyncStorage.setItem('para_theme_override', mode);
      }
    } catch (e) {}
  };

  if (!isInitialized) return null;

  return (
    <ThemeContext.Provider value={{ theme, isDark: renderedIsDark, themeMode, setThemeMode }}>
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        {children}
      </View>
      {overlayColor !== 'transparent' && (
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: overlayColor,
              opacity: fadeOverlayAnim,
              zIndex: 999999,
            }
          ]}
        />
      )}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};