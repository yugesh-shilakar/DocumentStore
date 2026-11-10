import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, ViewStyle } from 'react-native';

import { radius, spacing, typography, type ThemeColors } from '../navigation/theme';
import { useStyles, useTheme } from '../theme/useTheme';

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  tone?: 'primary' | 'secondary' | 'danger';
  style?: ViewStyle;
}

export function PrimaryButton({
  label,
  onPress,
  loading,
  disabled,
  tone = 'primary',
  style,
}: PrimaryButtonProps) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  const backgroundColor =
    tone === 'primary' ? colors.primary : tone === 'danger' ? colors.danger : colors.surface;
  const textColor =
    tone === 'secondary' ? colors.primary : tone === 'danger' ? colors.onDanger : colors.onPrimary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled || loading) }}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
          borderWidth: tone === 'secondary' ? 1 : 0,
          borderColor: colors.primary,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text style={[styles.label, { color: textColor }]}>{label}</Text>
      )}
    </Pressable>
  );
}

interface TextButtonProps {
  label: string;
  onPress: () => void;
}

export function TextButton({ label, onPress }: TextButtonProps) {
  const styles = useStyles(createStyles);

  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8}>
      <Text style={styles.textButton}>{label}</Text>
    </Pressable>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    button: {
      minHeight: 48,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.lg,
    },
    label: {
      fontSize: typography.body,
      fontWeight: '700',
    },
    textButton: {
      color: colors.primary,
      fontSize: typography.body,
      fontWeight: '600',
    },
  });
