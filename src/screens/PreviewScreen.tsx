import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import * as Sharing from 'expo-sharing';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Pdf from 'react-native-pdf';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '../components/Buttons';
import { Banner } from '../components/Feedback';
import { radius, spacing, typography, type ThemeColors } from '../navigation/theme';
import type { RootStackParamList } from '../navigation/types';
import { localFileExists } from '../services/localFileStore';
import { useVaultStore } from '../store/useVaultStore';
import { useStyles, useTheme } from '../theme/useTheme';
import { kindFromMime } from '../utils/format';

type Props = NativeStackScreenProps<RootStackParamList, 'Preview'>;

export function PreviewScreen({ navigation, route }: Props) {
  const fileId = route.params.fileId;
  const file = useVaultStore((state) => state.files.find((item) => item.id === fileId));
  const renameFile = useVaultStore((state) => state.renameFile);
  const removeFile = useVaultStore((state) => state.removeFile);
  const downloadFile = useVaultStore((state) => state.downloadFile);

  const { colors } = useTheme();
  const styles = useStyles(createStyles);

  const [renameOpen, setRenameOpen] = useState(false);
  const [draftName, setDraftName] = useState(file?.name ?? '');
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  if (!file) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Text style={styles.missing}>This file is no longer in your vault.</Text>
          <PrimaryButton label="Go back" onPress={() => navigation.goBack()} />
        </View>
      </SafeAreaView>
    );
  }

  const available = localFileExists(file.localPath);
  const kind = kindFromMime(file.mimeType);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadFile(file.id);
    } finally {
      setDownloading(false);
    }
  };

  const handleShare = async () => {
    if (!file.localPath) {
      return;
    }
    if (!(await Sharing.isAvailableAsync())) {
      Alert.alert('Sharing unavailable', 'This device cannot share files right now.');
      return;
    }
    await Sharing.shareAsync(file.localPath, {
      mimeType: file.mimeType,
      dialogTitle: file.name,
    });
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete file',
      `Remove "${file.name}" from this device and Google Drive? If you are offline, the cloud copy is removed on the next sync.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await removeFile(file.id);
            navigation.goBack();
          },
        },
      ],
    );
  };

  const handleRename = async () => {
    setRenameOpen(false);
    const nextName = draftName.trim();
    if (!nextName || nextName === file.name) {
      return;
    }
    await renameFile(file.id, nextName);
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
        <Text numberOfLines={1} style={styles.headerTitle}>
          {file.name}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setDraftName(file.name);
            setRenameOpen(true);
          }}
          hitSlop={8}
          style={styles.headerActionButton}
        >
          <Ionicons name="create-outline" size={20} color={colors.primary} />
        </Pressable>
      </View>

      {viewerError ? (
        <View style={styles.padded}>
          <Banner tone="error" message={viewerError} onDismiss={() => setViewerError(null)} />
        </View>
      ) : null}

      <View style={styles.viewer}>
        {!available ? (
          <View style={styles.centered}>
            <View style={styles.cloudBadge}>
              <Ionicons name="cloud-download-outline" size={26} color={colors.primary} />
            </View>
            <Text style={styles.cloudTitle}>Available in the cloud</Text>
            <Text style={styles.cloudBody}>
              Download this file to preview it offline. It will stay in your vault.
            </Text>
            {file.driveFileId ? (
              <PrimaryButton
                label="Download"
                onPress={() => void handleDownload()}
                loading={downloading}
                style={styles.downloadButton}
              />
            ) : (
              <Text style={styles.cloudBody}>This file has not been uploaded yet.</Text>
            )}
          </View>
        ) : kind === 'pdf' ? (
          <Pdf
            source={{ uri: file.localPath as string }}
            style={styles.pdf}
            onError={() =>
              setViewerError('This PDF could not be rendered. Try sharing it to another viewer.')
            }
          />
        ) : (
          <Image
            source={{ uri: file.localPath as string }}
            style={styles.image}
            contentFit="contain"
            accessibilityLabel={file.name}
          />
        )}
        {downloading ? (
          <View style={styles.downloadOverlay}>
            <ActivityIndicator color={colors.onPrimary} size="large" />
            <Text style={styles.downloadText}>Downloading…</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          onPress={() => void handleShare()}
          disabled={!available}
          style={({ pressed }) => [
            styles.footerButton,
            pressed && styles.pressed,
            !available && styles.disabled,
          ]}
        >
          <Ionicons name="share-outline" size={18} color={colors.text} />
          <Text style={styles.footerText}>Share</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={handleDelete}
          style={({ pressed }) => [
            styles.footerButton,
            styles.dangerButton,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="trash-outline" size={18} color={colors.danger} />
          <Text style={[styles.footerText, styles.dangerText]}>Delete</Text>
        </Pressable>
      </View>

      <Modal
        visible={renameOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setRenameOpen(false)}
      >
        <KeyboardAvoidingView behavior="padding" style={styles.backdrop}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>Rename file</Text>
            <TextInput
              value={draftName}
              onChangeText={setDraftName}
              style={styles.input}
              autoFocus
              selectTextOnFocus
              placeholder="File name"
              placeholderTextColor={colors.muted}
            />
            <View style={styles.dialogActions}>
              <Pressable onPress={() => setRenameOpen(false)} style={styles.dialogButton}>
                <Text style={styles.dialogCancel}>Cancel</Text>
              </Pressable>
              <Pressable onPress={() => void handleRename()} style={styles.dialogButton}>
                <Text style={styles.dialogSave}>Save</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
    },
    backButton: {
      width: 38,
      height: 38,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceAlt,
    },
    headerTitle: {
      flex: 1,
      fontSize: typography.body,
      fontWeight: '700',
      color: colors.text,
    },
    headerActionButton: {
      width: 38,
      height: 38,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceAlt,
    },
    padded: {
      paddingHorizontal: spacing.lg,
    },
    viewer: {
      flex: 1,
      margin: spacing.lg,
      borderRadius: radius.lg,
      backgroundColor: colors.surfaceAlt,
      overflow: 'hidden',
      justifyContent: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    pdf: {
      flex: 1,
      width: '100%',
      backgroundColor: colors.surfaceAlt,
    },
    image: {
      flex: 1,
      width: '100%',
    },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.xl,
      gap: spacing.md,
    },
    missing: {
      fontSize: typography.body,
      color: colors.muted,
      textAlign: 'center',
    },
    cloudBadge: {
      width: 60,
      height: 60,
      borderRadius: radius.pill,
      backgroundColor: colors.accentBlueBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cloudTitle: {
      fontSize: typography.heading,
      fontWeight: '700',
      color: colors.text,
      textAlign: 'center',
    },
    cloudBody: {
      fontSize: typography.body,
      color: colors.muted,
      textAlign: 'center',
      lineHeight: 22,
    },
    downloadButton: {
      marginTop: spacing.md,
      minWidth: 180,
    },
    downloadOverlay: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      backgroundColor: colors.scrim,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
    },
    downloadText: {
      color: '#FFFFFF',
      fontSize: typography.small,
    },
    footer: {
      flexDirection: 'row',
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.lg,
    },
    footerButton: {
      flex: 1,
      minHeight: 48,
      flexDirection: 'row',
      gap: spacing.sm,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    footerText: {
      fontSize: typography.body,
      fontWeight: '600',
      color: colors.text,
    },
    dangerButton: {
      borderColor: colors.danger,
      backgroundColor: colors.dangerBg,
    },
    dangerText: {
      color: colors.danger,
    },
    pressed: {
      opacity: 0.85,
    },
    disabled: {
      opacity: 0.5,
    },
    backdrop: {
      flex: 1,
      backgroundColor: colors.scrim,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.xl,
    },
    dialog: {
      width: '100%',
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.lg,
      gap: spacing.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    dialogTitle: {
      fontSize: typography.heading,
      fontWeight: '700',
      color: colors.text,
    },
    input: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.surfaceAlt,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
      fontSize: typography.body,
      color: colors.text,
    },
    dialogActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: spacing.lg,
    },
    dialogButton: {
      paddingVertical: spacing.sm,
    },
    dialogCancel: {
      color: colors.muted,
      fontWeight: '600',
    },
    dialogSave: {
      color: colors.primary,
      fontWeight: '700',
    },
  });
