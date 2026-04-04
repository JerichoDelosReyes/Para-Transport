import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { useColorScheme, Animated, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { lightColors, darkColors, ThemeColors } from './colors';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: ThemeColors;
  isDark: boolean;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const systemColorScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');
  const [isInitialized, setIsInitialized] = useState(false);
  
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const previousIsDark = useRef<boolean | null>(null);

  useEffect(() => {
    const loadTheme = async () => {
      try {
        const savedTheme = await AsyncStorage.getItem('para_theme_override');
        if (savedTheme === 'light' || savedTheme === 'dark') {
          setThemeModeState(savedTheme as ThemeMode);
        }
      } catch (e) {
        console.error('Failed to load theme preferences', e);
      } finally {
        setIsInitialized(true);
      }
    };
    loadTheme();
  }, []);

  const isDark = themeMode === 'system' ? systemColorScheme === 'dark' : themeMode === 'dark';
  const theme = isDark ? darkColors : lightColors;

  useEffect(() => {
    if (isInitialized) {
      if (previousIsDark.current !== null && previousIsDark.current !== isDark) {
        fadeAnim.setValue(0.85);
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }).start();
      }
      previousIsDark.current = isDark;
    }
  }, [isDark, fadeAnim, isInitialized]);

  const setThemeMode = async (mode: ThemeMode) => {
    setThemeModeState(mode);
    try {
      if (mode === 'system') {
        await AsyncStorage.removeItem('para_theme_override');
      } else {
        await AsyncStorage.setItem('para_theme_override', mode);
      }
    } catch (e) {
      console.error('Failed to save theme preferences', e);
    }
  };

  if (!isInitialized) return null; // You might want to return a splash screen here

  return (
    <ThemeContext.Provider value={{ theme, isDark, themeMode, setThemeMode }}>
      <Animated.View style={{ flex: 1, opacity: fadeAnim, backgroundColor: theme.background }}>
        {children}
      </Animated.View>
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