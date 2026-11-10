import * as Crypto from 'expo-crypto';
import { create } from 'zustand';

import {
  capturePhoto,
  pickDocuments,
  pickPhotos,
  type PickedAssets,
} from '../features/importAssets';
import * as auth from '../services/auth';
import { getStorageUsageBytes, importAsset } from '../services/localFileStore';
import * as metadataDb from '../services/metadataDb';
import {
  deleteCloudVault,
  deleteVaultFile,
  downloadAllMissing,
  downloadFileById,
  renameVaultFile,
  syncNow as runSyncNow,
} from '../services/syncEngine';
import type { ThemeMode } from '../navigation/theme';
import type { SelectedAsset, StoredSession, SyncProgress, VaultFile } from '../types';
import { toUserMessage } from '../utils/errors';

interface VaultState {
  ready: boolean;
  session: StoredSession | null;
  files: VaultFile[];
  loading: boolean;
  syncing: boolean;
  progress: SyncProgress | null;
  error: string | null;
  notice: string | null;
  autoSync: boolean;
  storageBytes: number;
  themeMode: ThemeMode;
  starredIds: string[];

  initialize: () => Promise<void>;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  loadFiles: () => Promise<void>;
  refresh: () => Promise<void>;
  importDocuments: () => Promise<void>;
  importPhotos: () => Promise<void>;
  capturePhoto: () => Promise<void>;
  syncNow: () => Promise<void>;
  downloadAll: () => Promise<void>;
  downloadFile: (id: string) => Promise<void>;
  removeFile: (id: string) => Promise<void>;
  renameFile: (id: string, name: string) => Promise<void>;
  setAutoSync: (enabled: boolean) => Promise<void>;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  toggleStar: (id: string) => Promise<void>;
  deleteCloud: () => Promise<void>;
  clearError: () => void;
  clearNotice: () => void;
}

let initialized = false;

function parseThemeMode(value: string | null): ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
}

function parseStarredIds(value: string | null): string[] {
  if (!value) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

function selectedFromAsset(id: string, asset: SelectedAsset): VaultFile {
  return {
    id,
    name: asset.name,
    mimeType: asset.mimeType,
    size: asset.size,
    sha256: '',
    localPath: null,
    driveFileId: null,
    syncState: 'local_only',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastSyncedAt: null,
    retryCount: 0,
    deleted: false,
  };
}

export const useVaultStore = create<VaultState>((set, get) => {
  const ingest = async (picked: PickedAssets) => {
    const rejected = [...picked.rejected];
    if (picked.assets.length === 0) {
      set({ notice: rejected.length > 0 ? rejected.join('\n') : null });
      return;
    }
    set({ loading: true, error: null });
    try {
      let importedCount = 0;
      for (const asset of picked.assets) {
        try {
          const id = Crypto.randomUUID();
          const local = await importAsset(id, asset);
          const record = selectedFromAsset(id, asset);
          await metadataDb.upsertFile({
            ...record,
            localPath: local.localPath,
            sha256: local.sha256,
            size: local.size,
          });
          importedCount += 1;
        } catch (error) {
          rejected.push(`${asset.name}: ${toUserMessage(error)}`);
        }
      }
      await get().loadFiles();
      if (rejected.length > 0) {
        set({ notice: rejected.join('\n') });
      }
      if (get().session && importedCount > 0) {
        await get().syncNow();
      }
    } catch (error) {
      set({ error: toUserMessage(error) });
    } finally {
      set({ loading: false });
    }
  };

  return {
    ready: false,
    session: null,
    files: [],
    loading: false,
    syncing: false,
    progress: null,
    error: null,
    notice: null,
    autoSync: true,
    storageBytes: 0,
    themeMode: 'system',
    starredIds: [],

    initialize: async () => {
      if (initialized) {
        return;
      }
      initialized = true;
      try {
        await metadataDb.getDatabase();
        const [session, autoSyncSetting, themeSetting, starredSetting] = await Promise.all([
          auth.restoreSession(),
          metadataDb.getSetting('auto_sync'),
          metadataDb.getSetting('theme_mode'),
          metadataDb.getSetting('starred_ids'),
        ]);
        const files = await metadataDb.listFiles();
        set({
          session,
          files,
          autoSync: autoSyncSetting !== 'false',
          storageBytes: getStorageUsageBytes(),
          themeMode: parseThemeMode(themeSetting),
          starredIds: parseStarredIds(starredSetting),
          ready: true,
        });
        if (session && autoSyncSetting !== 'false') {
          get()
            .refresh()
            .catch(() => undefined);
        }
      } catch (error) {
        set({ ready: true, error: toUserMessage(error) });
      }
    },

    signIn: async () => {
      set({ error: null });
      try {
        const session = await auth.signInWithGoogle();
        const previousUser = await metadataDb.getSetting('last_user_id');
        if (previousUser && previousUser !== session.user.id) {
          await metadataDb.setSetting('drive_folder_id', '');
          const files = await metadataDb.listFiles();
          for (const file of files) {
            if (!file.localPath) {
              await metadataDb.deleteFileRow(file.id);
              continue;
            }
            await metadataDb.upsertFile({
              ...file,
              driveFileId: null,
              syncState: 'local_only',
              lastSyncedAt: null,
              retryCount: 0,
              deleted: false,
            });
          }
        }
        await metadataDb.setSetting('last_user_id', session.user.id);
        set({ session });
        await get().refresh();
      } catch (error) {
        set({ error: toUserMessage(error) });
        throw error;
      }
    },

    signOut: async () => {
      set({ syncing: false, progress: null });
      await auth.signOut();
      set({ session: null, files: await metadataDb.listFiles() });
    },

    loadFiles: async () => {
      const files = await metadataDb.listFiles();
      set({ files, storageBytes: getStorageUsageBytes() });
    },

    refresh: async () => {
      set({ loading: true, error: null });
      try {
        if (get().session) {
          await get().syncNow();
        } else {
          await get().loadFiles();
        }
      } finally {
        set({ loading: false });
      }
    },

    importDocuments: async () => {
      const picked = await pickDocuments();
      await ingest(picked);
    },

    importPhotos: async () => {
      const picked = await pickPhotos();
      await ingest(picked);
    },

    capturePhoto: async () => {
      const picked = await capturePhoto();
      await ingest(picked);
    },

    syncNow: async () => {
      if (!get().session) {
        set({ error: 'Sign in with Google to sync your vault.' });
        return;
      }
      if (get().syncing) {
        return;
      }
      set({ syncing: true, error: null, progress: { phase: 'listing', completed: 0, total: 0 } });
      try {
        const summary = await runSyncNow((progress) => set({ progress }));
        await get().loadFiles();
        set({
          notice:
            summary.pendingDownload > 0
              ? `${summary.pendingDownload} file(s) can be downloaded. Use "Download all" to make them available offline.`
              : null,
        });
      } catch (error) {
        set({ error: toUserMessage(error) });
      } finally {
        set({ syncing: false, progress: null });
      }
    },

    downloadAll: async () => {
      if (!get().session) {
        set({ error: 'Sign in with Google to restore your vault.' });
        return;
      }
      if (get().syncing) {
        return;
      }
      set({ syncing: true, error: null, progress: { phase: 'listing', completed: 0, total: 0 } });
      try {
        const summary = await downloadAllMissing((progress) => set({ progress }));
        await get().loadFiles();
        set({
          notice:
            summary.downloaded > 0
              ? `Restored ${summary.downloaded} file(s) for offline use.`
              : 'Everything is already available offline.',
        });
        if (summary.failed > 0) {
          set({ error: `${summary.failed} file(s) could not be downloaded. Try again later.` });
        }
      } catch (error) {
        set({ error: toUserMessage(error) });
      } finally {
        set({ syncing: false, progress: null });
      }
    },

    downloadFile: async (id: string) => {
      if (!get().session) {
        set({ error: 'Sign in with Google to download this file.' });
        return;
      }
      if (get().syncing) {
        return;
      }
      set({ syncing: true, error: null });
      try {
        await downloadFileById(id);
        await get().loadFiles();
      } catch (error) {
        set({ error: toUserMessage(error) });
      } finally {
        set({ syncing: false });
      }
    },

    removeFile: async (id: string) => {
      try {
        await deleteVaultFile(id);
        const starredIds = get().starredIds.filter((starredId) => starredId !== id);
        if (starredIds.length !== get().starredIds.length) {
          set({ starredIds });
          await metadataDb.setSetting('starred_ids', JSON.stringify(starredIds));
        }
        await get().loadFiles();
      } catch (error) {
        set({ error: toUserMessage(error) });
      }
    },

    renameFile: async (id: string, name: string) => {
      try {
        await renameVaultFile(id, name);
        await get().loadFiles();
      } catch (error) {
        set({ error: toUserMessage(error) });
      }
    },

    setAutoSync: async (enabled: boolean) => {
      await metadataDb.setSetting('auto_sync', enabled ? 'true' : 'false');
      set({ autoSync: enabled });
    },

    setThemeMode: async (mode: ThemeMode) => {
      set({ themeMode: mode });
      try {
        await metadataDb.setSetting('theme_mode', mode);
      } catch {
        // The theme still applies for this session if persistence fails.
      }
    },

    toggleStar: async (id: string) => {
      const current = get().starredIds;
      const starredIds = current.includes(id)
        ? current.filter((starredId) => starredId !== id)
        : [...current, id];
      set({ starredIds });
      try {
        await metadataDb.setSetting('starred_ids', JSON.stringify(starredIds));
      } catch {
        // Starring remains available for this session if persistence fails.
      }
    },

    deleteCloud: async () => {
      try {
        await deleteCloudVault();
        await metadataDb.setSetting('auto_sync', 'false');
        await get().loadFiles();
        set({
          autoSync: false,
          notice:
            'Cloud backup deleted and local files kept. Automatic sync was turned off so the backup is not recreated immediately.',
        });
      } catch (error) {
        set({ error: toUserMessage(error) });
      }
    },

    clearError: () => set({ error: null }),
    clearNotice: () => set({ notice: null }),
  };
});
