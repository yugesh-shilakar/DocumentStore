import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { radius, spacing, typography, type ThemeColors } from '../navigation/theme';
import { useStyles, useTheme } from '../theme/useTheme';

interface BannerProps {
  message: string;
  tone: 'error' | 'info' | 'success';
  onDismiss?: () => void;
}

export function Banner({ message, tone, onDismiss }: BannerProps) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  const palette =
    tone === 'error'
      ? { background: colors.dangerBg, text: colors.danger, icon: 'alert-circle' as const }
      : tone === 'success'
        ? { background: colors.successBg, text: colors.success, icon: 'checkmark-circle' as const }
        : { background: colors.infoBg, text: colors.infoText, icon: 'information-circle' as const };

  return (
    <View style={[styles.banner, { backgroundColor: palette.background }]}>
      <Ionicons name={palette.icon} size={18} color={palette.text} />
      <Text style={[styles.bannerText, { color: palette.text }]}>{message}</Text>
      {onDismiss ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          onPress={onDismiss}
          hitSlop={8}
        >
          <Ionicons name="close" size={18} color={palette.text} />
        </Pressable>
      ) : null}
    </View>
  );
}

interface ProgressBarProps {
  progress: number;
  label?: string;
}

export function ProgressBar({ progress, label }: ProgressBarProps) {
  const styles = useStyles(createStyles);
  const clamped = Math.min(Math.max(progress, 0), 1);
  return (
    <View style={styles.progressContainer}>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${clamped * 100}%` }]} />
      </View>
      {label ? <Text style={styles.progressLabel}>{label}</Text> : null}
    </View>
  );
}

interface EmptyStateProps {
  title: string;
  message: string;
}

export function EmptyState({ title, message }: EmptyStateProps) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  return (
    <View style={styles.empty}>
      <View style={styles.emptyBadge}>
        <Ionicons name="folder-open" size={30} color={colors.muted} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyMessage}>{message}</Text>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    banner: {
      borderRadius: radius.md,
      padding: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    bannerText: {
      flex: 1,
      fontSize: typography.small,
      lineHeight: 19,
      fontWeight: '500',
    },
    progressContainer: {
      gap: spacing.xs,
    },
    progressTrack: {
      height: 6,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceMuted,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      borderRadius: radius.pill,
      backgroundColor: colors.primary,
    },
    progressLabel: {
      fontSize: typography.tiny,
      color: colors.muted,
    },
    empty: {
      alignItems: 'center',
      paddingVertical: spacing.xxl,
      paddingHorizontal: spacing.xl,
      gap: spacing.sm,
    },
    emptyBadge: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: colors.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.sm,
    },
    emptyTitle: {
      fontSize: typography.heading,
      fontWeight: '700',
      color: colors.text,
      textAlign: 'center',
    },
    emptyMessage: {
      fontSize: typography.body,
      color: colors.muted,
      textAlign: 'center',
      lineHeight: 22,
    },
  });
