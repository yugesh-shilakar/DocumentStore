import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FilePreview } from './FilePreview';
import { radius, spacing, typography, type ThemeColors } from '../navigation/theme';
import { useStyles, useTheme } from '../theme/useTheme';
import type { SyncState, VaultFile } from '../types';
import { formatBytes, formatDate } from '../utils/format';

interface DocumentRowProps {
  file: VaultFile;
  starred: boolean;
  onPress: () => void;
}

const SYNC_LABELS: Record<SyncState, string> = {
  synced: 'Backed up',
  local_only: 'On device',
  pending_upload: 'Waiting to upload',
  pending_download: 'Cloud only',
  conflict: 'Conflict',
  deleted: 'Deleted',
};

export function DocumentRow({ file, starred, onPress }: DocumentRowProps) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  const statusColor =
    file.syncState === 'synced'
      ? colors.success
      : file.syncState === 'pending_download'
        ? colors.primary
        : file.syncState === 'pending_upload'
          ? colors.warning
          : file.syncState === 'conflict' || file.syncState === 'deleted'
            ? colors.danger
            : colors.muted;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${file.name}, ${SYNC_LABELS[file.syncState]}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <FilePreview file={file} compact style={styles.previewTile} />

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text numberOfLines={1} style={styles.name}>
            {file.name}
          </Text>
          {starred ? <Ionicons name="star" size={13} color={colors.warning} /> : null}
        </View>
        <Text numberOfLines={1} style={styles.meta}>
          {formatBytes(file.size)} · {formatDate(file.updatedAt)}
        </Text>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.status, { color: statusColor }]}>{SYNC_LABELS[file.syncState]}</Text>
        </View>
      </View>

      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: spacing.md,
    },
    pressed: {
      opacity: 0.85,
      transform: [{ scale: 0.99 }],
    },
    previewTile: {
      width: 48,
      height: 48,
    },
    body: {
      flex: 1,
      gap: 2,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    name: {
      flexShrink: 1,
      fontSize: typography.small,
      fontWeight: '700',
      color: colors.text,
    },
    meta: {
      fontSize: typography.tiny,
      color: colors.muted,
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      marginTop: 1,
    },
    statusDot: {
      width: 6,
      height: 6,
      borderRadius: radius.pill,
    },
    status: {
      fontSize: typography.tiny,
      fontWeight: '600',
    },
  });
