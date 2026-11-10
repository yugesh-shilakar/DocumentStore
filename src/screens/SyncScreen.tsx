import { Ionicons } from '@expo/vector-icons';
import { useNetInfo } from '@react-native-community/netinfo';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '../components/Buttons';
import { Banner, ProgressBar } from '../components/Feedback';
import { radius, spacing, typography, type ThemeColors } from '../navigation/theme';
import type { RootStackParamList } from '../navigation/types';
import { useVaultStore } from '../store/useVaultStore';
import { useStyles, useTheme } from '../theme/useTheme';
import { formatBytes } from '../utils/format';

type Props = NativeStackScreenProps<RootStackParamList, 'Sync'>;

function phaseLabel(phase: string): string {
  switch (phase) {
    case 'listing':
      return 'Checking Google Drive';
    case 'uploading':
      return 'Uploading files';
    case 'downloading':
      return 'Downloading files';
    case 'manifest':
      return 'Updating manifest';
    case 'done':
      return 'Finishing up';
    default:
      return 'Preparing';
  }
}

export function SyncScreen({ navigation }: Props) {
  const files = useVaultStore((state) => state.files);
  const syncing = useVaultStore((state) => state.syncing);
  const progress = useVaultStore((state) => state.progress);
  const error = useVaultStore((state) => state.error);
  const notice = useVaultStore((state) => state.notice);
  const autoSync = useVaultStore((state) => state.autoSync);
  const syncNow = useVaultStore((state) => state.syncNow);
  const downloadAll = useVaultStore((state) => state.downloadAll);
  const clearError = useVaultStore((state) => state.clearError);
  const clearNotice = useVaultStore((state) => state.clearNotice);
  const netInfo = useNetInfo();

  const { colors } = useTheme();
  const styles = useStyles(createStyles);

  const pendingUploads = files.filter(
    (file) => file.syncState === 'local_only' || file.syncState === 'pending_upload',
  ).length;
  const pendingDownloads = files.filter((file) => file.syncState === 'pending_download').length;
  const synced = files.filter((file) => file.syncState === 'synced').length;
  const offline = netInfo.isConnected === false;
  const progressValue =
    progress && progress.total > 0 ? progress.completed / progress.total : progress ? 0.1 : 0;

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
        <Text style={styles.title}>Backup &amp; restore</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {offline ? (
          <Banner
            tone="info"
            message="You are offline. Sync will resume when your connection returns."
          />
        ) : null}
        {error ? <Banner tone="error" message={error} onDismiss={clearError} /> : null}
        {notice ? <Banner tone="success" message={notice} onDismiss={clearNotice} /> : null}

        <View style={styles.heroCard}>
          <View style={styles.heroIcon}>
            <Ionicons name="cloud-done" size={26} color={colors.accentBlueText} />
          </View>
          <Text style={styles.heroTitle}>Google Drive backup</Text>
          <Text style={styles.heroBody}>
            Files are stored in the “PDF Vault” folder in your Google Drive. Only this app can see
            the folder, and not the rest of your Drive.
          </Text>
        </View>

        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: colors.success }]}>{synced}</Text>
            <Text style={styles.statLabel}>Backed up</Text>
          </View>
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: colors.warning }]}>{pendingUploads}</Text>
            <Text style={styles.statLabel}>To upload</Text>
          </View>
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: colors.primary }]}>{pendingDownloads}</Text>
            <Text style={styles.statLabel}>To download</Text>
          </View>
        </View>

        {syncing && progress ? (
          <View style={styles.card}>
            <ProgressBar
              progress={progressValue}
              label={`${phaseLabel(progress.phase)}${
                progress.total > 0 ? ` · ${progress.completed}/${progress.total}` : ''
              }${progress.currentName ? ` · ${progress.currentName}` : ''}`}
            />
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sync your vault</Text>
          <PrimaryButton
            label="Sync now"
            onPress={() => void syncNow()}
            loading={syncing}
            disabled={offline}
          />
          <PrimaryButton
            label="Download all missing"
            onPress={() => void downloadAll()}
            loading={syncing}
            disabled={offline}
            tone="secondary"
          />
          <Text style={styles.helper}>
            {autoSync
              ? 'Automatic sync is on. The app checks Drive when it opens and comes back to the foreground.'
              : 'Automatic sync is off. Use the buttons above to sync manually.'}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>How restore works</Text>
          <Text style={styles.cardBody}>
            Install the app on a new device, sign in with the same Google account, and tap “Download
            all missing”. Your PDFs and photos will be restored to this device.
          </Text>
          <View style={styles.metaRow}>
            <Ionicons name="save-outline" size={15} color={colors.muted} />
            <Text style={styles.meta}>
              Device storage used:{' '}
              {formatBytes(files.reduce((total, file) => total + file.size, 0))}
            </Text>
          </View>
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
      gap: spacing.lg,
      paddingBottom: spacing.xxl,
    },
    heroCard: {
      backgroundColor: colors.accentBlueBg,
      borderRadius: radius.lg,
      padding: spacing.lg,
      gap: spacing.sm,
    },
    heroIcon: {
      width: 46,
      height: 46,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.xs,
    },
    heroTitle: {
      fontSize: typography.heading,
      fontWeight: '700',
      color: colors.text,
    },
    heroBody: {
      fontSize: typography.small,
      color: colors.muted,
      lineHeight: 20,
    },
    stats: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    stat: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      paddingVertical: spacing.md,
      alignItems: 'center',
      gap: 2,
    },
    statValue: {
      fontSize: 22,
      fontWeight: '800',
    },
    statLabel: {
      fontSize: typography.tiny,
      color: colors.muted,
      textAlign: 'center',
      fontWeight: '600',
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: spacing.lg,
      gap: spacing.md,
    },
    cardTitle: {
      fontSize: typography.body,
      fontWeight: '700',
      color: colors.text,
    },
    cardBody: {
      fontSize: typography.small,
      color: colors.muted,
      lineHeight: 20,
    },
    helper: {
      fontSize: typography.tiny,
      color: colors.muted,
      lineHeight: 17,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    meta: {
      fontSize: typography.tiny,
      color: colors.muted,
    },
  });
