import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { RootNavigator } from './src/navigation/RootNavigator';
import { radius, spacing, typography, type ThemeColors } from './src/navigation/theme';
import { useVaultStore } from './src/store/useVaultStore';
import { useStyles, useTheme } from './src/theme/useTheme';

function Splash() {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);

  return (
    <View style={styles.splash}>
      <Image
        source={require('./assets/icon.png')}
        style={styles.logo}
        contentFit="cover"
        accessibilityLabel="Stack"
      />
      <Text style={styles.title}>Stack</Text>
      <Text style={styles.subtitle}>Your documents, everywhere.</Text>
      <ActivityIndicator color={colors.primary} style={styles.spinner} />
    </View>
  );
}

export default function App() {
  const ready = useVaultStore((state) => state.ready);
  const initialize = useVaultStore((state) => state.initialize);
  const { scheme, colors } = useTheme();
  const styles = useStyles(createStyles);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  return (
    <GestureHandlerRootView style={[styles.root, { backgroundColor: colors.background }]}>
      <SafeAreaProvider>
        {ready ? <RootNavigator /> : <Splash />}
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    root: {
      flex: 1,
    },
    splash: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
      gap: spacing.sm,
    },
    logo: {
      width: 76,
      height: 76,
      borderRadius: radius.lg,
      marginBottom: spacing.md,
      shadowColor: colors.shadow,
      shadowOpacity: 0.16,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 4,
    },
    title: {
      fontSize: typography.title,
      fontWeight: '800',
      color: colors.text,
    },
    subtitle: {
      fontSize: typography.body,
      color: colors.muted,
    },
    spinner: {
      marginTop: spacing.lg,
    },
  });
