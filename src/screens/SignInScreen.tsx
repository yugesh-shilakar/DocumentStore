import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '../components/Buttons';
import { Banner } from '../components/Feedback';
import { isGoogleConfigured } from '../config';
import { radius, spacing, typography, type ThemeColors } from '../navigation/theme';
import { useVaultStore } from '../store/useVaultStore';
import { useStyles, useTheme } from '../theme/useTheme';

export function SignInScreen() {
  const signIn = useVaultStore((state) => state.signIn);
  const error = useVaultStore((state) => state.error);
  const clearError = useVaultStore((state) => state.clearError);
  const [loading, setLoading] = useState(false);
  const configured = isGoogleConfigured();
  const { colors } = useTheme();
  const styles = useStyles(createStyles);

  const handleSignIn = async () => {
    setLoading(true);
    try {
      await signIn();
    } catch {
      // The store surfaces a user-facing error.
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} bounces={false}>
        <View style={styles.brand}>
          <View style={styles.logoFrame}>
            <Image
              source={require('../../assets/icon.png')}
              style={styles.logo}
              contentFit="cover"
              accessibilityLabel="Stack"
            />
          </View>
          <Text style={styles.title}>Stack</Text>
          <Text style={styles.subtitle}>
            Your PDFs and photos, organized in stacks and backed up safely to Google Drive.
          </Text>

          <View style={styles.features}>
            <View style={styles.feature}>
              <Ionicons name="cloud-done-outline" size={16} color={colors.primary} />
              <Text style={styles.featureText}>Private Drive backup</Text>
            </View>
            <View style={styles.feature}>
              <Ionicons name="phone-portrait-outline" size={16} color={colors.primary} />
              <Text style={styles.featureText}>Works offline</Text>
            </View>
          </View>
        </View>

        <View style={styles.actions}>
          {error ? <Banner tone="error" message={error} onDismiss={clearError} /> : null}

          {!configured ? (
            <Banner
              tone="info"
              message="Google Sign-In is not configured yet. Add your OAuth client IDs to .env and rebuild the app. See .env.example."
            />
          ) : null}

          <PrimaryButton
            label="Continue with Google"
            onPress={handleSignIn}
            loading={loading}
            disabled={!configured}
            style={styles.button}
          />
          <Text style={styles.footnote}>
            Sign in to sync your vault. Your files stay in your own Google account.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      flexGrow: 1,
      justifyContent: 'center',
      padding: spacing.xl,
      gap: spacing.xxl,
    },
    brand: {
      alignItems: 'center',
      gap: spacing.sm,
    },
    logoFrame: {
      padding: spacing.xs,
      borderRadius: radius.xl,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      shadowColor: colors.shadow,
      shadowOpacity: 0.12,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 5,
      marginBottom: spacing.sm,
    },
    logo: {
      width: 96,
      height: 96,
      borderRadius: radius.lg,
    },
    title: {
      fontSize: typography.display,
      fontWeight: '800',
      color: colors.text,
      letterSpacing: -0.6,
    },
    subtitle: {
      maxWidth: 320,
      fontSize: typography.body,
      color: colors.muted,
      textAlign: 'center',
      lineHeight: 22,
    },
    features: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
    feature: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
      paddingVertical: 6,
      borderRadius: radius.pill,
    },
    featureText: {
      fontSize: typography.tiny,
      fontWeight: '600',
      color: colors.text,
    },
    actions: {
      gap: spacing.md,
    },
    button: {
      minHeight: 54,
      borderRadius: radius.pill,
    },
    footnote: {
      fontSize: typography.tiny,
      color: colors.muted,
      textAlign: 'center',
      lineHeight: 17,
    },
  });
