import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Constants from 'expo-constants';
import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Banner } from '../components/Feedback';
import { isGoogleConfigured } from '../config';
import { radius, spacing, typography, type ThemeColors, type ThemeMode } from '../navigation/theme';
import type { RootStackParamList } from '../navigation/types';
import { useVaultStore } from '../store/useVaultStore';
import { useStyles, useTheme } from '../theme/useTheme';
import { formatBytes } from '../utils/format';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;
type IoniconName = keyof typeof Ionicons.glyphMap;

const THEME_OPTIONS: { key: ThemeMode; label: string; icon: IoniconName }[] = [
  { key: 'system', label: 'System', icon: 'phone-portrait-outline' },
  { key: 'light', label: 'Light', icon: 'sunny-outline' },
  { key: 'dark', label: 'Dark', icon: 'moon-outline' },
];

export function SettingsScreen({ navigation }: Props) {
  const session = useVaultStore((state) => state.session);
  const files = useVaultStore((state) => state.files);
  const storageBytes = useVaultStore((state) => state.storageBytes);
  const autoSync = useVaultStore((state) => state.autoSync);
  const error = useVaultStore((state) => state.error);
  const notice = useVaultStore((state) => state.notice);
  const setAutoSync = useVaultStore((state) => state.setAutoSync);
  const signOut = useVaultStore((state) => state.signOut);
  const deleteCloud = useVaultStore((state) => state.deleteCloud);
  const clearError = useVaultStore((state) => state.clearError);
  const clearNotice = useVaultStore((state) => state.clearNotice);

  const { colors, mode, setMode } = useTheme();
  const styles = useStyles(createStyles);

  const handleSignOut = () => {
    Alert.alert(
      'Sign out',
      'Your files stay on this device and in Google Drive. Automatic backup stops until you sign in again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: () => void signOut(),
        },
      ],
    );
  };

  const handleDeleteCloud = () => {
    Alert.alert(
      'Delete cloud backup',
      'This permanently deletes the PDF Vault folder and every backed-up file in your Google Drive. The copies on this device stay where they are.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete from Drive',
          style: 'destructive',
          onPress: () => void deleteCloud(),
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => navigation.goBack()}
          hitSlop={10}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={22} color={colors.primary} />
        </Pressable>
        <Text style={styles.title}>Settings</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {error ? <Banner tone="error" message={error} onDismiss={clearError} /> : null}
        {notice ? <Banner tone="success" message={notice} onDismiss={clearNotice} /> : null}

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Account</Text>
          <View style={styles.accountRow}>
            <View style={styles.accountAvatar}>
              <Ionicons name="person" size={20} color={colors.onPrimary} />
            </View>
            <View style={styles.accountText}>
              <Text style={styles.primaryValue} numberOfLines={1}>
                {session?.user.email || 'Not signed in'}
              </Text>
              {session?.user.name ? (
                <Text style={styles.secondaryValue}>{session.user.name}</Text>
              ) : null}
            </View>
          </View>
          <Text style={styles.secondaryValue}>
            Backup uses the drive.file scope, so this app can only manage files it created.
          </Text>
          <Pressable accessibilityRole="button" onPress={handleSignOut} style={styles.linkRow}>
            <Text style={styles.dangerLink}>Sign out</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Appearance</Text>
          <View style={styles.segment}>
            {THEME_OPTIONS.map((option) => {
              const active = mode === option.key;
              return (
                <Pressable
                  key={option.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => void setMode(option.key)}
                  style={[styles.segmentItem, active && styles.segmentItemActive]}
                >
                  <Ionicons
                    name={option.icon}
                    size={16}
                    color={active ? colors.onPrimary : colors.muted}
                  />
                  <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.secondaryValue}>
            System follows your device appearance. Choose Light or Dark to override it.
          </Text>
        </View>

        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.primaryValue}>Automatic sync</Text>
              <Text style={styles.secondaryValue}>
                Check Google Drive when the app opens or returns to the foreground.
              </Text>
            </View>
            <Switch
              value={autoSync}
              onValueChange={(next) => void setAutoSync(next)}
              trackColor={{ false: colors.surfaceMuted, true: colors.primary }}
              thumbColor={colors.surface}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => navigation.navigate('Sync')}
            style={styles.navRow}
          >
            <View style={styles.navRowIcon}>
              <Ionicons name="cloud-upload-outline" size={20} color={colors.primary} />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.primaryValue}>Backup &amp; restore</Text>
              <Text style={styles.secondaryValue}>Open the sync center</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Storage</Text>
          <View style={styles.row}>
            <Text style={styles.primaryValue}>On this device</Text>
            <Text style={styles.secondaryValue}>{formatBytes(storageBytes)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.primaryValue}>Files in vault</Text>
            <Text style={styles.secondaryValue}>{files.length}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Cloud backup</Text>
          <Text style={styles.secondaryValue}>
            Deleting the cloud backup removes the “PDF Vault” folder from your Google Drive and
            turns off automatic sync so it is not recreated right away. Your local copies stay on
            this device, and you can back up again at any time.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={handleDeleteCloud}
            style={styles.dangerOutline}
          >
            <Ionicons name="trash-outline" size={16} color={colors.danger} />
            <Text style={styles.dangerLink}>Delete cloud backup</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>About</Text>
          <View style={styles.row}>
            <Text style={styles.primaryValue}>Version</Text>
            <Text style={styles.secondaryValue}>{Constants.expoConfig?.version ?? '1.0.0'}</Text>
          </View>
          <Text style={styles.secondaryValue}>
            Stack keeps your documents available offline and backs them up to a private Google Drive
            folder. Your files are never sent to any other server.
          </Text>
          {!isGoogleConfigured() ? (
            <Text style={[styles.secondaryValue, styles.warning]}>
              Google sign-in is not configured for this build. Set EXPO_PUBLIC_GOOGLE_CLIENT_ID and
              the platform client IDs before shipping.
            </Text>
          ) : null}
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
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    backButton: {
      width: 38,
      height: 38,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceAlt,
    },
    title: {
      flex: 1,
      fontSize: typography.heading,
      fontWeight: '700',
      color: colors.text,
      textAlign: 'center',
    },
    headerSpacer: {
      width: 38,
    },
    content: {
      padding: spacing.lg,
      paddingBottom: spacing.xxl,
      gap: spacing.lg,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: spacing.lg,
      gap: spacing.sm,
    },
    sectionLabel: {
      fontSize: typography.tiny,
      fontWeight: '700',
      color: colors.muted,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    accountRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      marginVertical: spacing.xs,
    },
    accountAvatar: {
      width: 42,
      height: 42,
      borderRadius: radius.pill,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    accountText: {
      flex: 1,
      gap: 2,
    },
    primaryValue: {
      fontSize: typography.body,
      fontWeight: '700',
      color: colors.text,
    },
    secondaryValue: {
      fontSize: typography.small,
      color: colors.muted,
      lineHeight: 20,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    rowText: {
      flex: 1,
      gap: 4,
    },
    segment: {
      flexDirection: 'row',
      gap: spacing.xs,
      backgroundColor: colors.surfaceAlt,
      borderRadius: radius.pill,
      padding: 4,
      marginVertical: spacing.xs,
    },
    segmentItem: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      paddingVertical: 8,
      borderRadius: radius.pill,
    },
    segmentItemActive: {
      backgroundColor: colors.primary,
    },
    segmentText: {
      fontSize: typography.small,
      fontWeight: '600',
      color: colors.muted,
    },
    segmentTextActive: {
      color: colors.onPrimary,
      fontWeight: '700',
    },
    navRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingTop: spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      marginTop: spacing.xs,
    },
    navRowIcon: {
      width: 38,
      height: 38,
      borderRadius: radius.md,
      backgroundColor: colors.accentBlueBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    linkRow: {
      paddingTop: spacing.sm,
    },
    dangerLink: {
      fontSize: typography.small,
      fontWeight: '700',
      color: colors.danger,
    },
    dangerOutline: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.danger,
      backgroundColor: colors.dangerBg,
      borderRadius: radius.pill,
      paddingVertical: spacing.md,
      marginTop: spacing.xs,
    },
    warning: {
      color: colors.warning,
    },
  });
