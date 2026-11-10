import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { radius, spacing, typography, type ThemeColors } from '../navigation/theme';
import { localFileExists } from '../services/localFileStore';
import { getPdfThumbnail } from '../services/pdfThumbnail';
import { useStyles, useTheme } from '../theme/useTheme';
import type { FileKind, VaultFile } from '../types';
import { kindFromMime } from '../utils/format';

interface FilePreviewProps {
  file: VaultFile;
  style?: StyleProp<ViewStyle>;
  fit?: 'cover' | 'contain';
  compact?: boolean;
}

function Placeholder({ kind, compact }: { kind: FileKind; compact: boolean }) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  const isPdf = kind === 'pdf';

  return (
    <View style={[styles.placeholder, { backgroundColor: isPdf ? colors.pdfBg : colors.imageBg }]}>
      <Ionicons
        name={isPdf ? 'document-text' : 'image'}
        size={compact ? 18 : 30}
        color={isPdf ? colors.pdf : colors.image}
      />
      {compact ? null : (
        <Text style={[styles.placeholderText, { color: isPdf ? colors.pdf : colors.image }]}>
          {isPdf ? 'PDF document' : 'Photo'}
        </Text>
      )}
    </View>
  );
}

function PdfPreview({ file, fit }: { file: VaultFile; fit: 'cover' | 'contain' }) {
  const cacheKey = `${file.id}-${file.updatedAt}`;
  const [result, setResult] = useState<{ key: string; uri: string | null } | null>(null);
  const thumbnail = result?.key === cacheKey ? result.uri : null;

  useEffect(() => {
    let active = true;
    if (!file.localPath) {
      return () => {
        active = false;
      };
    }
    getPdfThumbnail(file.localPath, file.id, file.updatedAt)
      .then((uri) => {
        if (active) {
          setResult({ key: cacheKey, uri });
        }
      })
      .catch(() => {
        if (active) {
          setResult({ key: cacheKey, uri: null });
        }
      });
    return () => {
      active = false;
    };
  }, [file.localPath, file.id, file.updatedAt, cacheKey]);

  if (!thumbnail) {
    return <Placeholder kind="pdf" compact={false} />;
  }

  return (
    <Image
      source={{ uri: thumbnail }}
      style={StyleSheet.absoluteFill}
      contentFit={fit}
      cachePolicy="memory-disk"
      transition={150}
      accessibilityLabel={`${file.name} preview`}
    />
  );
}

export function FilePreview({ file, style, fit = 'cover', compact = false }: FilePreviewProps) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  const kind = kindFromMime(file.mimeType);
  const available = localFileExists(file.localPath);
  const uri = available ? (file.localPath as string) : null;

  return (
    <View style={[styles.root, { backgroundColor: colors.surfaceAlt }, style]}>
      {kind === 'image' && uri ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit={fit}
          cachePolicy="memory-disk"
          transition={150}
          accessibilityLabel={file.name}
        />
      ) : null}
      {kind === 'pdf' && uri ? <PdfPreview file={file} fit={fit} /> : null}
      {!uri ? <Placeholder kind={kind} compact={compact} /> : null}
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    root: {
      overflow: 'hidden',
      borderRadius: radius.md,
    },
    placeholder: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
    },
    placeholderText: {
      fontSize: typography.tiny,
      fontWeight: '700',
      letterSpacing: 0.3,
    },
  });
