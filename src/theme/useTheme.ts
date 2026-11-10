import { useMemo } from 'react';
import { useColorScheme } from 'react-native';

import {
  paletteFor,
  type ColorScheme,
  type ThemeColors,
  type ThemeMode,
} from '../navigation/theme';
import { useVaultStore } from '../store/useVaultStore';

export function useTheme() {
  const systemScheme = useColorScheme();
  const mode = useVaultStore((state) => state.themeMode);
  const setMode = useVaultStore((state) => state.setThemeMode);
  const fallback: ColorScheme = systemScheme === 'dark' ? 'dark' : 'light';
  const scheme: ColorScheme = mode === 'system' ? fallback : mode;
  const colors = useMemo(() => paletteFor(scheme), [scheme]);

  return { mode, scheme, colors, setMode };
}

export function useStyles<T>(factory: (colors: ThemeColors) => T): T {
  const { colors } = useTheme();
  return useMemo(() => factory(colors), [colors, factory]);
}

export function toggleTargetMode(scheme: ColorScheme): ThemeMode {
  return scheme === 'dark' ? 'light' : 'dark';
}
