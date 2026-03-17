// gluestack-ui.config.ts
import { config as defaultConfig } from '@gluestack-ui/config';

export const config = {
  ...defaultConfig,
  tokens: {
    ...defaultConfig.tokens,
    colors: {
      ...defaultConfig.tokens.colors, // Keep existing colors (red, blue, green, etc.)
      
      // CUSTOM BRAND IDENTITY
      paraBrand: '#E9AE16',       // Primary Brand Color (Yellow)
      paraBrand2: '#284395',      // Blue - for "every" text
      paraBrand3: '#EF2836',      // Red - for "Filipino" text

      // SECONDARY
      paraSecondary1: '#99e92f',
      paraSecondary2: '#ffff04',

      // TEXT COLORS
      textDark900: '#181818',     // Primary dark text
      textDark500: '#525250',     // Secondary/muted text
      textLight: '#EDEDED',       // Light text on dark backgrounds

      // BUTTON TEXT
      buttonTextDark: '#20350B',  // Dark text on yellow buttons
    },

    fonts: {
      heading: 'CubaoFree2-ExtraExpanded',   // Used by <Heading> components
      body: 'Inter',                          // Used by <Text> components
      mono: 'Inter',
      // Custom fonts for Welcome Screen
      cubaoExpanded: 'CubaoFree2-ExtraExpanded',
      cubaoSemiExpanded: 'CubaoFree2-SemiExpanded',
      quiapo: 'QuiapoFree2-Regular',
    }
  },
};