import { Ionicons } from '@expo/vector-icons';
import { useNetInfo } from '@react-native-community/netinfo';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { DocumentRow } from '../components/DocumentRow';
import { Banner, EmptyState, ProgressBar } from '../components/Feedback';
import { FilePreview } from '../components/FilePreview';
import { radius, spacing, typography, type ThemeColors } from '../navigation/theme';
import type { RootStackParamList } from '../navigation/types';
import { useVaultStore } from '../store/useVaultStore';
import { useStyles, useTheme } from '../theme/useTheme';
import type { SyncState, VaultFile } from '../types';
import { formatBytes, formatDate, kindFromMime } from '../utils/format';

type Props = NativeStackScreenProps<RootStackParamList, 'Vault'>;
type TabKey = 'stacks' | 'recent' | 'starred';
type StackKey = 'all' | 'pdfs' | 'photos' | 'starred' | 'cloud' | 'backed' | 'device';
type FilterKey = StackKey;
type IoniconName = keyof typeof Ionicons.glyphMap;

interface StackDefinition {
  key: StackKey;
  title: string;
  icon: IoniconName;
  background: keyof ThemeColors;
  foreground: keyof ThemeColors;
  matches: (file: VaultFile, starredIds: string[]) => boolean;
}

const STACKS: StackDefinition[] = [
  {
    key: 'all',
    title: 'All documents',
    icon: 'folder-open-outline',
    background: 'infoBg',
    foreground: 'infoText',
    matches: () => true,
  },
  {
    key: 'pdfs',
    title: 'PDFs',
    icon: 'document-text',
    background: 'accentTealBg',
    foreground: 'accentTealText',
    matches: (file) => kindFromMime(file.mimeType) === 'pdf',
  },
  {
    key: 'photos',
    title: 'Photos',
    icon: 'image',
    background: 'accentAmberBg',
    foreground: 'accentAmberText',
    matches: (file) => kindFromMime(file.mimeType) === 'image',
  },
  {
    key: 'starred',
    title: 'Starred',
    icon: 'star',
    background: 'accentBlueBg',
    foreground: 'accentBlueText',
    matches: (file, starredIds) => starredIds.includes(file.id),
  },
  {
    key: 'cloud',
    title: 'Cloud only',
    icon: 'cloud-download',
    background: 'accentCoralBg',
    foreground: 'accentCoralText',
    matches: (file) => file.syncState === 'pending_download',
  },
  {
    key: 'backed',
    title: 'Backed up',
    icon: 'cloud-done',
    background: 'accentPurpleBg',
    foreground: 'accentPurpleText',
    matches: (file) => file.syncState === 'synced',
  },
  {
    key: 'device',
    title: 'On device',
    icon: 'phone-portrait',
    background: 'accentPinkBg',
    foreground: 'accentPinkText',
    matches: (file) => file.syncState === 'local_only' || file.syncState === 'pending_upload',
  },
];

const SYNC_LABELS: Record<SyncState, string> = {
  synced: 'Backed up',
  local_only: 'On device',
  pending_upload: 'Waiting to upload',
  pending_download: 'Cloud only',
  conflict: 'Conflict',
  deleted: 'Deleted',
};

function initialsFor(name?: string, email?: string): string {
  const source = name?.trim() || email || 'U';
  const parts = source.split(/[\s._@-]+/).filter(Boolean);
  const first = parts[0]?.[0] ?? 'U';
  const second = parts.length > 1 ? (parts[1][0] ?? '') : '';
  return `${first}${second}`.toUpperCase();
}

export function VaultScreen({ navigation }: Props) {
  const files = useVaultStore((state) => state.files);
  const loading = useVaultStore((state) => state.loading);
  const syncing = useVaultStore((state) => state.syncing);
  const progress = useVaultStore((state) => state.progress);
  const error = useVaultStore((state) => state.error);
  const notice = useVaultStore((state) => state.notice);
  const session = useVaultStore((state) => state.session);
  const autoSync = useVaultStore((state) => state.autoSync);
  const starredIds = useVaultStore((state) => state.starredIds);
  const refresh = useVaultStore((state) => state.refresh);
  const syncNow = useVaultStore((state) => state.syncNow);
  const importDocuments = useVaultStore((state) => state.importDocuments);
  const importPhotos = useVaultStore((state) => state.importPhotos);
  const capturePhoto = useVaultStore((state) => state.capturePhoto);
  const downloadFile = useVaultStore((state) => state.downloadFile);
  const renameFile = useVaultStore((state) => state.renameFile);
  const removeFile = useVaultStore((state) => state.removeFile);
  const toggleStar = useVaultStore((state) => state.toggleStar);
  const clearError = useVaultStore((state) => state.clearError);
  const clearNotice = useVaultStore((state) => state.clearNotice);

  const { colors, scheme, setMode } = useTheme();
  const styles = useStyles(createStyles);
  const insets = useSafeAreaInsets();
  const netInfo = useNetInfo();
  const { width } = useWindowDimensions();

  const columns = width >= 700 ? 3 : 2;
  const stackWidth = Math.floor((width - spacing.lg * 2 - spacing.md * (columns - 1)) / columns);

  const previousConnected = useRef<boolean | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [tab, setTab] = useState<TabKey>('stacks');
  const [filter, setFilter] = useState<FilterKey | null>(null);
  const [search, setSearch] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const starredSet = useMemo(() => new Set(starredIds), [starredIds]);
  const selectedStack = filter ? (STACKS.find((item) => item.key === filter) ?? null) : null;

  const showToast = useCallback((message: string) => {
    if (toastTimer.current) {
      clearTimeout(toastTimer.current);
    }
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }, []);

  useEffect(
    () => () => {
      if (toastTimer.current) {
        clearTimeout(toastTimer.current);
      }
    },
    [],
  );

  useEffect(() => {
    const connected = netInfo.isConnected;
    if (previousConnected.current === false && connected === true && session && autoSync) {
      if (!useVaultStore.getState().syncing) {
        void syncNow();
      }
    }
    if (connected !== null) {
      previousConnected.current = connected;
    }
  }, [netInfo.isConnected, session, autoSync, syncNow]);

  useEffect(() => {
    if (!session || !autoSync) {
      return;
    }
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !useVaultStore.getState().syncing) {
        void refresh();
      }
    });
    return () => subscription.remove();
  }, [session, autoSync, refresh]);

  const term = search.trim().toLowerCase();
  const homeMode = tab === 'stacks' && filter === null && term.length === 0;

  const filteredFiles = useMemo(() => {
    return files.filter((file) => {
      if (term.length > 0 && !file.name.toLowerCase().includes(term)) {
        return false;
      }
      if (tab === 'starred' && !starredSet.has(file.id)) {
        return false;
      }
      if (selectedStack && !selectedStack.matches(file, starredIds)) {
        return false;
      }
      return true;
    });
  }, [files, term, tab, starredSet, selectedStack, starredIds]);

  const visibleFiles = homeMode ? filteredFiles.slice(0, 5) : filteredFiles;
  const detailFile = detailId ? (files.find((file) => file.id === detailId) ?? null) : null;
  const offline = netInfo.isConnected === false;

  const progressLabel = progress
    ? progress.phase === 'uploading'
      ? `Uploading ${progress.completed}/${progress.total}${
          progress.currentName ? ` · ${progress.currentName}` : ''
        }`
      : progress.phase === 'downloading'
        ? `Downloading ${progress.completed}/${progress.total}${
            progress.currentName ? ` · ${progress.currentName}` : ''
          }`
        : progress.phase === 'listing'
          ? 'Checking Google Drive…'
          : 'Finishing up…'
    : undefined;

  const progressValue =
    progress && progress.total > 0 ? progress.completed / progress.total : progress ? 0.1 : 0;

  const sectionTitle = term
    ? 'Search results'
    : selectedStack
      ? selectedStack.title
      : tab === 'recent'
        ? 'Recent'
        : tab === 'starred'
          ? 'Starred'
          : 'Recent documents';

  const openDetail = (file: VaultFile) => {
    setDraftName(file.name);
    setDetailId(file.id);
  };

  const handleImport = (action: () => Promise<void>) => {
    setImportOpen(false);
    void action();
  };

  const handleSaveRename = async () => {
    if (!detailFile) {
      return;
    }
    const nextName = draftName.trim();
    setDetailId(null);
    if (!nextName || nextName === detailFile.name) {
      return;
    }
    await renameFile(detailFile.id, nextName);
    showToast('File renamed');
  };

  const handleDelete = () => {
    if (!detailFile) {
      return;
    }
    const target = detailFile;
    Alert.alert(
      'Delete file',
      `Remove "${target.name}" from this device and Google Drive? If you are offline, the cloud copy is removed on the next sync.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setDetailId(null);
            void removeFile(target.id).then(() => showToast('File deleted'));
          },
        },
      ],
    );
  };

  const handleToggleStar = async () => {
    if (!detailFile) {
      return;
    }
    const wasStarred = starredSet.has(detailFile.id);
    await toggleStar(detailFile.id);
    showToast(wasStarred ? 'Removed from starred' : 'Added to starred');
  };

  const handleDownload = async () => {
    if (!detailFile) {
      return;
    }
    await downloadFile(detailFile.id);
    showToast('Saved for offline use');
  };

  const handleOpenPreview = () => {
    if (!detailFile) {
      return;
    }
    const id = detailFile.id;
    setDetailId(null);
    navigation.navigate('Preview', { fileId: id });
  };

  const renderStackCard = (stack: StackDefinition) => {
    const count = files.filter((file) => stack.matches(file, starredIds)).length;
    return (
      <Pressable
        key={stack.key}
        accessibilityRole="button"
        accessibilityLabel={`${stack.title}, ${count} files`}
        onPress={() => setFilter(stack.key)}
        style={({ pressed }) => [
          styles.stackCard,
          { width: stackWidth },
          pressed && styles.pressed,
        ]}
      >
        <View style={styles.stackTop}>
          <View style={[styles.stackIcon, { backgroundColor: colors[stack.background] }]}>
            <Ionicons name={stack.icon} size={18} color={colors[stack.foreground]} />
          </View>
          <View style={[styles.stackCount, { backgroundColor: colors[stack.background] }]}>
            <Text style={[styles.stackCountText, { color: colors[stack.foreground] }]}>
              {count}
            </Text>
          </View>
        </View>
        <View style={styles.stackBottom}>
          <Text style={styles.stackTitle}>{stack.title}</Text>
          <Text style={styles.stackSubtitle}>
            {count === 0 ? 'Empty' : `${count} ${count === 1 ? 'file' : 'files'}`}
          </Text>
        </View>
      </Pressable>
    );
  };

  const listHeader = (
    <View>
      {homeMode ? <View style={styles.stackGrid}>{STACKS.map(renderStackCard)}</View> : null}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{sectionTitle}</Text>
        {homeMode && files.length > 5 ? (
          <Pressable accessibilityRole="button" onPress={() => setFilter('all')} hitSlop={8}>
            <Text style={styles.sectionAction}>View all</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  const emptyTitle =
    files.length === 0
      ? 'Your vault is empty'
      : tab === 'starred'
        ? 'Nothing starred yet'
        : 'No matching files';
  const emptyMessage =
    files.length === 0
      ? 'Tap the camera button to scan or import your first document.'
      : tab === 'starred'
        ? 'Open a file and tap the star to keep it close.'
        : 'Try a different search or filter.';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.topBar}>
        <View style={styles.brand}>
          <View style={styles.brandIcon}>
            <Ionicons name="layers" size={18} color={colors.onPrimary} />
          </View>
          <Text style={styles.brandText}>Stack</Text>
        </View>
        <View style={styles.topActions}>
          <IconButton
            icon="camera-outline"
            label="Scan document"
            onPress={() => setImportOpen(true)}
          />
          <IconButton
            icon="cloud-upload-outline"
            label="Sync now"
            busy={syncing}
            onPress={() => void syncNow()}
          />
          <IconButton
            icon={scheme === 'dark' ? 'sunny-outline' : 'moon-outline'}
            label={`Switch to ${scheme === 'dark' ? 'light' : 'dark'} theme`}
            onPress={() => void setMode(scheme === 'dark' ? 'light' : 'dark')}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open settings"
            onPress={() => navigation.navigate('Settings')}
            style={styles.avatar}
          >
            <Text style={styles.avatarText}>
              {initialsFor(session?.user.name, session?.user.email)}
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.searchWrapper}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search files, scans, receipts…"
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
            autoCorrect={false}
            returnKeyType="search"
          />
          {search.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              onPress={() => setSearch('')}
              hitSlop={8}
            >
              <Ionicons name="close-circle" size={18} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {offline || error || notice || syncing ? (
        <View style={styles.banners}>
          {offline ? (
            <Banner tone="info" message="You are offline. Local files are still available." />
          ) : null}
          {error ? <Banner tone="error" message={error} onDismiss={clearError} /> : null}
          {notice ? <Banner tone="success" message={notice} onDismiss={clearNotice} /> : null}
          {syncing ? (
            <View style={styles.progressCard}>
              <ProgressBar progress={progressValue} label={progressLabel} />
            </View>
          ) : null}
        </View>
      ) : null}

      <FlatList
        data={visibleFiles}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 170 }]}
        ItemSeparatorComponent={() => <View style={styles.listSeparator} />}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={<EmptyState title={emptyTitle} message={emptyMessage} />}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => void refresh()}
            tintColor={colors.primary}
            colors={[colors.primary]}
            progressBackgroundColor={colors.surface}
          />
        }
        renderItem={({ item }) => (
          <DocumentRow
            file={item}
            starred={starredSet.has(item.id)}
            onPress={() => openDetail(item)}
          />
        )}
        showsVerticalScrollIndicator={false}
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add to your vault"
        onPress={() => setImportOpen(true)}
        style={({ pressed }) => [
          styles.fab,
          { bottom: insets.bottom + 82 },
          pressed && styles.fabPressed,
        ]}
      >
        <Ionicons name="camera" size={26} color={colors.onPrimary} />
      </Pressable>

      <View style={[styles.bottomNav, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
        <NavButton
          label="Stacks"
          icon="layers-outline"
          activeIcon="layers"
          active={tab === 'stacks'}
          onPress={() => {
            setTab('stacks');
            setFilter(null);
          }}
        />
        <NavButton
          label="Recent"
          icon="time-outline"
          activeIcon="time"
          active={tab === 'recent'}
          onPress={() => {
            setTab('recent');
            setFilter(null);
          }}
        />
        <NavButton
          label="Starred"
          icon="star-outline"
          activeIcon="star"
          active={tab === 'starred'}
          onPress={() => {
            setTab('starred');
            setFilter(null);
          }}
        />
        <NavButton
          label="Settings"
          icon="settings-outline"
          activeIcon="settings"
          active={false}
          onPress={() => navigation.navigate('Settings')}
        />
      </View>

      {toast ? (
        <View style={[styles.toast, { bottom: insets.bottom + 92 }]} pointerEvents="none">
          <Ionicons name="checkmark-circle" size={16} color={colors.success} />
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}

      <Modal
        visible={importOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setImportOpen(false)}
      >
        <View style={styles.sheetBackdrop}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={StyleSheet.absoluteFill}
            onPress={() => setImportOpen(false)}
          />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Add to your vault</Text>
            <SheetOption
              icon="document-attach-outline"
              title="Choose files"
              body="PDFs and images from this device"
              onPress={() => handleImport(importDocuments)}
            />
            <SheetOption
              icon="images-outline"
              title="Choose photos"
              body="Pick from your photo library"
              onPress={() => handleImport(importPhotos)}
            />
            <SheetOption
              icon="camera-outline"
              title="Take a photo"
              body="Scan a document with the camera"
              onPress={() => handleImport(capturePhoto)}
            />
            <Pressable
              accessibilityRole="button"
              onPress={() => setImportOpen(false)}
              style={styles.cancelButton}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={detailFile !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setDetailId(null)}
      >
        <View style={styles.sheetBackdrop}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={StyleSheet.absoluteFill}
            onPress={() => setDetailId(null)}
          />
          {detailFile ? (
            <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
              <View style={styles.sheetHandle} />
              <View style={styles.detailHeader}>
                <Text numberOfLines={1} style={styles.detailTitle}>
                  {detailFile.name}
                </Text>
                <View style={styles.detailHeaderActions}>
                  <IconButton
                    icon={starredSet.has(detailFile.id) ? 'star' : 'star-outline'}
                    label={starredSet.has(detailFile.id) ? 'Remove star' : 'Star file'}
                    tint={starredSet.has(detailFile.id) ? colors.warning : colors.muted}
                    onPress={() => void handleToggleStar()}
                  />
                  <IconButton icon="close" label="Close" onPress={() => setDetailId(null)} />
                </View>
              </View>

              <ScrollView
                style={styles.detailScroll}
                contentContainerStyle={styles.detailContent}
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.previewCard}>
                  <FilePreview file={detailFile} style={styles.detailPreview} fit="contain" />
                </View>

                <View style={styles.infoCard}>
                  <DetailRow
                    icon="document-text-outline"
                    label="Type"
                    value={kindFromMime(detailFile.mimeType) === 'pdf' ? 'PDF document' : 'Image'}
                  />
                  <DetailRow
                    icon="cube-outline"
                    label="Size"
                    value={formatBytes(detailFile.size)}
                  />
                  <DetailRow
                    icon="calendar-outline"
                    label="Added"
                    value={formatDate(detailFile.createdAt)}
                  />
                  <DetailRow
                    icon="cloud-outline"
                    label="Status"
                    value={SYNC_LABELS[detailFile.syncState]}
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>File name</Text>
                  <TextInput
                    value={draftName}
                    onChangeText={setDraftName}
                    placeholder="File name"
                    placeholderTextColor={colors.muted}
                    style={styles.input}
                  />
                </View>
              </ScrollView>

              <View style={styles.detailFooter}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Delete file"
                  onPress={handleDelete}
                  style={styles.deleteButton}
                >
                  <Ionicons name="trash-outline" size={20} color={colors.danger} />
                </Pressable>
                {detailFile.syncState === 'pending_download' ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Download for offline use"
                    onPress={() => void handleDownload()}
                    style={styles.iconOutline}
                  >
                    <Ionicons name="download-outline" size={20} color={colors.primary} />
                  </Pressable>
                ) : null}
                <View style={styles.footerSpacer} />
                <Pressable
                  accessibilityRole="button"
                  onPress={handleOpenPreview}
                  style={styles.secondaryButton}
                >
                  <Text style={styles.secondaryButtonText}>Open</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void handleSaveRename()}
                  style={styles.primaryButton}
                >
                  <Text style={styles.primaryButtonText}>Save</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

interface NavButtonProps {
  label: string;
  icon: IoniconName;
  activeIcon: IoniconName;
  active: boolean;
  onPress: () => void;
}

function NavButton({ label, icon, activeIcon, active, onPress }: NavButtonProps) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);

  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.navButton}>
      <View style={[styles.navPill, active && styles.navPillActive]}>
        <Ionicons
          name={active ? activeIcon : icon}
          size={20}
          color={active ? colors.primary : colors.muted}
        />
      </View>
      <Text style={[styles.navLabel, active && styles.navLabelActive]}>{label}</Text>
    </Pressable>
  );
}

interface IconButtonProps {
  icon: IoniconName;
  label: string;
  onPress: () => void;
  busy?: boolean;
  tint?: string;
}

function IconButton({ icon, label, onPress, busy, tint }: IconButtonProps) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <Ionicons name={icon} size={21} color={tint ?? colors.muted} />
      )}
    </Pressable>
  );
}

interface SheetOptionProps {
  icon: IoniconName;
  title: string;
  body: string;
  onPress: () => void;
}

function SheetOption({ icon, title, body, onPress }: SheetOptionProps) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.sheetOption, pressed && styles.pressed]}
    >
      <View style={styles.sheetOptionIcon}>
        <Ionicons name={icon} size={20} color={colors.primary} />
      </View>
      <View style={styles.sheetOptionText}>
        <Text style={styles.sheetOptionTitle}>{title}</Text>
        <Text style={styles.sheetOptionBody}>{body}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

interface DetailRowProps {
  icon: IoniconName;
  label: string;
  value: string;
}

function DetailRow({ icon, label, value }: DetailRowProps) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);

  return (
    <View style={styles.detailRow}>
      <Ionicons name={icon} size={16} color={colors.muted} />
      <Text style={styles.detailRowLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.detailRowValue}>
        {value}
      </Text>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.background,
    },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.sm,
      gap: spacing.sm,
    },
    brand: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    brandIcon: {
      width: 32,
      height: 32,
      borderRadius: radius.md,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    brandText: {
      fontSize: typography.heading,
      fontWeight: '800',
      letterSpacing: -0.3,
      color: colors.text,
    },
    topActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
    },
    iconButton: {
      width: 38,
      height: 38,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatar: {
      width: 34,
      height: 34,
      borderRadius: radius.pill,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: spacing.xs,
    },
    avatarText: {
      color: colors.onPrimary,
      fontSize: typography.tiny,
      fontWeight: '800',
    },
    searchWrapper: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.xs,
    },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.surfaceAlt,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      minHeight: 42,
    },
    searchInput: {
      flex: 1,
      fontSize: typography.small,
      color: colors.text,
      paddingVertical: 8,
    },
    banners: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
    },
    progressCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: spacing.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      marginBottom: spacing.sm,
    },
    listContent: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      flexGrow: 1,
    },
    listSeparator: {
      height: spacing.sm,
    },
    stackGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.md,
      paddingTop: spacing.xs,
    },
    stackCard: {
      minHeight: 128,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: spacing.md,
      justifyContent: 'space-between',
    },
    stackTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    stackIcon: {
      width: 34,
      height: 34,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stackCount: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radius.pill,
    },
    stackCountText: {
      fontSize: typography.tiny,
      fontWeight: '800',
    },
    stackBottom: {
      gap: 2,
    },
    stackTitle: {
      fontSize: typography.body,
      fontWeight: '700',
      color: colors.text,
    },
    stackSubtitle: {
      fontSize: typography.tiny,
      color: colors.muted,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: spacing.lg,
      paddingBottom: spacing.sm,
    },
    sectionTitle: {
      fontSize: typography.body,
      fontWeight: '700',
      color: colors.text,
    },
    sectionAction: {
      fontSize: typography.small,
      fontWeight: '700',
      color: colors.primary,
    },
    fab: {
      position: 'absolute',
      right: spacing.xl,
      width: 58,
      height: 58,
      borderRadius: 29,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: colors.shadow,
      shadowOpacity: 0.3,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 5 },
      elevation: 8,
      zIndex: 20,
    },
    fabPressed: {
      transform: [{ scale: 0.95 }],
    },
    bottomNav: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-around',
      paddingTop: spacing.sm,
      paddingHorizontal: spacing.sm,
      backgroundColor: colors.surface,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    navButton: {
      flex: 1,
      alignItems: 'center',
      gap: 2,
    },
    navPill: {
      paddingHorizontal: spacing.lg,
      paddingVertical: 4,
      borderRadius: radius.pill,
    },
    navPillActive: {
      backgroundColor: colors.accentBlueBg,
    },
    navLabel: {
      fontSize: 10,
      fontWeight: '600',
      color: colors.muted,
    },
    navLabelActive: {
      color: colors.primary,
      fontWeight: '800',
    },
    toast: {
      position: 'absolute',
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.text,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: radius.pill,
      zIndex: 40,
      shadowColor: colors.shadow,
      shadowOpacity: 0.25,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
    },
    toastText: {
      fontSize: typography.small,
      fontWeight: '600',
      color: colors.background,
    },
    sheetBackdrop: {
      flex: 1,
      backgroundColor: colors.scrim,
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radius.sheet,
      borderTopRightRadius: radius.sheet,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      maxHeight: '90%',
    },
    sheetHandle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceMuted,
      marginBottom: spacing.md,
    },
    sheetTitle: {
      fontSize: typography.heading,
      fontWeight: '700',
      color: colors.text,
      marginBottom: spacing.sm,
    },
    sheetOption: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    sheetOptionIcon: {
      width: 38,
      height: 38,
      borderRadius: radius.md,
      backgroundColor: colors.accentBlueBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sheetOptionText: {
      flex: 1,
      gap: 2,
    },
    sheetOptionTitle: {
      fontSize: typography.body,
      fontWeight: '600',
      color: colors.text,
    },
    sheetOptionBody: {
      fontSize: typography.small,
      color: colors.muted,
    },
    cancelButton: {
      alignItems: 'center',
      paddingVertical: spacing.md,
      marginTop: spacing.xs,
    },
    cancelText: {
      fontSize: typography.body,
      fontWeight: '700',
      color: colors.muted,
    },
    detailHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.sm,
    },
    detailTitle: {
      flex: 1,
      fontSize: typography.heading,
      fontWeight: '700',
      color: colors.text,
    },
    detailHeaderActions: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    detailScroll: {
      flexShrink: 1,
    },
    detailContent: {
      gap: spacing.md,
      paddingBottom: spacing.md,
    },
    previewCard: {
      backgroundColor: colors.surfaceAlt,
      borderRadius: radius.lg,
      padding: spacing.sm,
    },
    detailPreview: {
      width: '100%',
      height: 180,
      borderRadius: radius.md,
    },
    infoCard: {
      backgroundColor: colors.accentBlueBg,
      borderRadius: radius.lg,
      padding: spacing.md,
      gap: spacing.sm,
    },
    detailRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    detailRowLabel: {
      width: 58,
      fontSize: typography.tiny,
      fontWeight: '700',
      color: colors.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    detailRowValue: {
      flex: 1,
      fontSize: typography.small,
      fontWeight: '600',
      color: colors.text,
    },
    fieldGroup: {
      gap: spacing.xs,
    },
    fieldLabel: {
      fontSize: typography.tiny,
      fontWeight: '700',
      color: colors.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
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
    detailFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingTop: spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    deleteButton: {
      width: 44,
      height: 44,
      borderRadius: radius.pill,
      backgroundColor: colors.dangerBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconOutline: {
      width: 44,
      height: 44,
      borderRadius: radius.pill,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    footerSpacer: {
      flex: 1,
    },
    secondaryButton: {
      minHeight: 44,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.pill,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryButtonText: {
      fontSize: typography.small,
      fontWeight: '700',
      color: colors.text,
    },
    primaryButton: {
      minHeight: 44,
      paddingHorizontal: spacing.xl,
      borderRadius: radius.pill,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryButtonText: {
      fontSize: typography.small,
      fontWeight: '700',
      color: colors.onPrimary,
    },
    pressed: {
      opacity: 0.85,
    },
  });
