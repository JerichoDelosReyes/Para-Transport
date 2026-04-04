import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { useColorScheme, Animated, View, StyleSheet, Dimensions } from 'react-native';
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
const { width, height } = Dimensions.get('window');

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const systemColorScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');
  const [isInitialized, setIsInitialized] = useState(false);
  
  // Base configuration
  const currentIsDark = themeMode === 'system' ? systemColorScheme === 'dark' : themeMode === 'dark';
  
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

  // Update initial rendered mode immediately upon loading preferences
  useEffect(() => {
    if (isInitialized) {
      setRenderedIsDark(themeMode === 'system' ? systemColorScheme === 'dark' : themeMode === 'dark');
    }
  }, [isInitialized]);

  const theme = renderedIsDark ? darkColors : lightColors;

  const setThemeMode = async (mode: ThemeMode) => {
    setThemeModeState(mode);
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