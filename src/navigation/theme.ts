import { DarkTheme, DefaultTheme, type Theme } from '@react-navigation/native';

export type ThemeMode = 'system' | 'light' | 'dark';
export type ColorScheme = 'light' | 'dark';

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceAlt: string;
  surfaceMuted: string;
  primary: string;
  primaryHover: string;
  onPrimary: string;
  onDanger: string;
  text: string;
  muted: string;
  border: string;
  danger: string;
  dangerBg: string;
  success: string;
  successBg: string;
  warning: string;
  warningBg: string;
  infoBg: string;
  infoText: string;
  overlay: string;
  scrim: string;
  shadow: string;
  chip: string;
  chipText: string;
  chipActive: string;
  chipActiveText: string;
  pdf: string;
  pdfBg: string;
  image: string;
  imageBg: string;
  accentTealBg: string;
  accentTealText: string;
  accentAmberBg: string;
  accentAmberText: string;
  accentBlueBg: string;
  accentBlueText: string;
  accentCoralBg: string;
  accentCoralText: string;
  accentPurpleBg: string;
  accentPurpleText: string;
  accentPinkBg: string;
  accentPinkText: string;
}

export const lightColors: ThemeColors = {
  background: '#F8F9FA',
  surface: '#FFFFFF',
  surfaceAlt: '#F1F3F4',
  surfaceMuted: '#E8EAED',
  primary: '#1A73E8',
  primaryHover: '#1557B0',
  onPrimary: '#FFFFFF',
  onDanger: '#FFFFFF',
  text: '#202124',
  muted: '#5F6368',
  border: '#E0E0E0',
  danger: '#C5221F',
  dangerBg: '#FCE8E6',
  success: '#137333',
  successBg: '#E6F4EA',
  warning: '#B06000',
  warningBg: '#FEF7E0',
  infoBg: '#E8F0FE',
  infoText: '#174EA6',
  overlay: 'rgba(32, 33, 36, 0.45)',
  scrim: 'rgba(32, 33, 36, 0.6)',
  shadow: '#0F172A',
  chip: '#F1F3F4',
  chipText: '#5F6368',
  chipActive: '#1A73E8',
  chipActiveText: '#FFFFFF',
  pdf: '#C5221F',
  pdfBg: '#FCE8E6',
  image: '#8430CE',
  imageBg: '#F3E8FD',
  accentTealBg: '#E6F4EA',
  accentTealText: '#137333',
  accentAmberBg: '#FEF7E0',
  accentAmberText: '#B06000',
  accentBlueBg: '#E8F0FE',
  accentBlueText: '#1A73E8',
  accentCoralBg: '#FCE8E6',
  accentCoralText: '#C5221F',
  accentPurpleBg: '#F3E8FD',
  accentPurpleText: '#8430CE',
  accentPinkBg: '#FCE4EC',
  accentPinkText: '#C2185B',
};

export const darkColors: ThemeColors = {
  background: '#131418',
  surface: '#1E1F22',
  surfaceAlt: '#282A2E',
  surfaceMuted: '#303236',
  primary: '#8AB4F8',
  primaryHover: '#AECBFA',
  onPrimary: '#10213B',
  onDanger: '#3B0A08',
  text: '#E8EAED',
  muted: '#9AA0A6',
  border: '#3C4043',
  danger: '#F28B82',
  dangerBg: '#3B1D1B',
  success: '#81C995',
  successBg: '#173B27',
  warning: '#FDD663',
  warningBg: '#3B2F14',
  infoBg: '#1B2C45',
  infoText: '#8AB4F8',
  overlay: 'rgba(0, 0, 0, 0.6)',
  scrim: 'rgba(0, 0, 0, 0.72)',
  shadow: '#000000',
  chip: '#2A2B2F',
  chipText: '#BDC1C6',
  chipActive: '#8AB4F8',
  chipActiveText: '#202124',
  pdf: '#F28B82',
  pdfBg: '#3B1D1B',
  image: '#D7AEFB',
  imageBg: '#2E2140',
  accentTealBg: '#173B27',
  accentTealText: '#81C995',
  accentAmberBg: '#3B2F14',
  accentAmberText: '#FDD663',
  accentBlueBg: '#1B2C45',
  accentBlueText: '#8AB4F8',
  accentCoralBg: '#3B1D1B',
  accentCoralText: '#F28B82',
  accentPurpleBg: '#2E2140',
  accentPurpleText: '#D7AEFB',
  accentPinkBg: '#3A1D2A',
  accentPinkText: '#FF8BCB',
};

export function paletteFor(scheme: ColorScheme): ThemeColors {
  return scheme === 'dark' ? darkColors : lightColors;
}

export function buildNavigationTheme(scheme: ColorScheme): Theme {
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const palette = paletteFor(scheme);
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: palette.primary,
      background: palette.background,
      card: palette.surface,
      text: palette.text,
      border: palette.border,
      notification: palette.danger,
    },
  };
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  xl: 24,
  sheet: 28,
  pill: 999,
};

export const typography = {
  display: 28,
  title: 24,
  heading: 18,
  body: 15,
  small: 13,
  tiny: 11,
};
