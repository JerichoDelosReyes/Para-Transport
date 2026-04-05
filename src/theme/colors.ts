export const lightColors = {
  background: '#F5F0E8',
  surface: '#FFFFFF',
  surfaceSecondary: '#F0EBE0',
  headerBackground: '#E8A020',
  text: '#0A1628',
  textSecondary: '#5A6478',
  accent: '#E8A020',
  navBackground: '#FFFFFF',
  navBorder: 'rgba(0,0,0,0.08)',
  cardBackground: '#FFFFFF',
  cardBorder: 'rgba(0,0,0,0.06)',
  mapStyle: 'streets',
  inputBackground: 'rgba(0,0,0,0.05)',
  statusBar: 'dark-content' as const,
};

export const darkColors = {
  background: '#0A1628',
  surface: '#111C2E',
  surfaceSecondary: '#1A2A42',
  headerBackground: '#111C2E',
  text: '#FFFFFF',
  textSecondary: 'rgba(255,255,255,0.6)',
  accent: '#E8A020',
  navBackground: '#111C2E',
  navBorder: 'rgba(255,255,255,0.08)',
  cardBackground: '#111C2E',
  cardBorder: 'rgba(255,255,255,0.08)',
  mapStyle: 'dataviz-dark',
  inputBackground: 'rgba(255,255,255,0.08)',
  statusBar: 'light-content' as const,
};

export type ThemeColors = typeof lightColors | typeof darkColors;
