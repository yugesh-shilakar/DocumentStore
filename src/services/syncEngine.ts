import { File } from 'expo-file-system';

import type { RemoteFile, SyncProgress, VaultFile } from '../types';
import { runWithConcurrency } from '../utils/async';
import { AppError } from '../utils/errors';
import { displayNameFromDriveName } from '../utils/format';
import { logger } from '../utils/logger';
import {
  deleteDriveFile,
  deleteVaultFolder,
  driveDownloadUrl,
  ensureVaultFolder,
  getAuthHeaders,
  getDriveFileMetadata,
  listVaultFiles,
  renameDriveFile,
  uploadVaultFile,
} from './googleDrive';
import { deleteLocalFile, downloadToLocal, localFileExists } from './localFileStore';
import { loadManifest, markDeletedInManifest, saveManifest } from './manifest';
import * as metadataDb from './metadataDb';

export interface SyncSummary {
  uploaded: number;
  pendingDownload: number;
  remoteCount: number;
  failed: number;
}

export interface DownloadSummary {
  downloaded: number;
  failed: number;
}

type ProgressHandler = (progress: SyncProgress) => void;

function report(handler: ProgressHandler | undefined, progress: SyncProgress): void {
  handler?.(progress);
}

function remoteDisplayName(remote: RemoteFile): string {
  return remote.appProperties?.originalName ?? displayNameFromDriveName(remote.name).name;
}

function remoteVaultId(remote: RemoteFile): string {
  return remote.appProperties?.vaultId ?? displayNameFromDriveName(remote.name).id ?? remote.id;
}

function remoteMimeType(remote: RemoteFile): string {
  const fromProps = remote.appProperties?.mimeType;
  if (fromProps) {
    return fromProps;
  }
  if (remote.mimeType && remote.mimeType !== 'application/octet-stream') {
    return remote.mimeType;
  }
  const name = remoteDisplayName(remote).toLowerCase();
  if (name.endsWith('.pdf')) {
    return 'application/pdf';
  }
  if (name.endsWith('.png')) {
    return 'image/png';
  }
  if (name.endsWith('.webp')) {
    return 'image/webp';
  }
  if (name.endsWith('.gif')) {
    return 'image/gif';
  }
  return 'image/jpeg';
}

export async function pushDeletions(): Promise<{ deleted: number; failed: number }> {
  const pending = await metadataDb.listDeletedFiles();
  if (pending.length === 0) {
    return { deleted: 0, failed: 0 };
  }

  let folderId: string | null = null;
  let deleted = 0;
  let failed = 0;

  for (const file of pending) {
    try {
      if (file.driveFileId) {
        folderId = folderId ?? (await ensureVaultFolder());
        await deleteDriveFile(file.driveFileId);
        await markDeletedInManifest(folderId, file);
      }
      await metadataDb.deleteFileRow(file.id);
      deleted += 1;
    } catch {
      failed += 1;
      logger.warn('Could not finish deleting a cloud file; will retry on next sync.');
    }
  }

  if (folderId) {
    await saveManifest(folderId, await metadataDb.listFiles());
  }

  return { deleted, failed };
}

export async function syncUploads(
  handler?: ProgressHandler,
): Promise<{ uploaded: number; failed: number }> {
  const pending = (await metadataDb.listFiles()).filter(
    (file) =>
      file.localPath && (file.syncState === 'local_only' || file.syncState === 'pending_upload'),
  );

  if (pending.length === 0) {
    return { uploaded: 0, failed: 0 };
  }

  const folderId = await ensureVaultFolder();
  let uploaded = 0;
  let failed = 0;

  for (let index = 0; index < pending.length; index += 1) {
    const file = pending[index];
    if (!file || !file.localPath) {
      continue;
    }
    report(handler, {
      phase: 'uploading',
      completed: index,
      total: pending.length,
      currentName: file.name,
    });
    try {
      if (!localFileExists(file.localPath)) {
        await metadataDb.setSyncState(file.id, 'local_only');
        continue;
      }
      const local = new File(file.localPath);
      const sha256 = file.sha256 || (await local.digest('SHA-256'));
      const size = local.size ?? file.size;
      const result = await uploadVaultFile(
        local,
        file.id,
        file.name,
        file.mimeType,
        sha256,
        folderId,
        file.driveFileId,
      );
      await metadataDb.markUploaded(file.id, result.id, sha256, result.size || size);
      uploaded += 1;
    } catch {
      failed += 1;
      logger.warn('Upload failed; will retry on next sync.');
      await metadataDb.setSyncState(file.id, 'pending_upload', {
        retryCount: file.retryCount + 1,
      });
    }
  }

  const files = await metadataDb.listFiles();
  await saveManifest(folderId, files);
  return { uploaded, failed };
}

export async function refreshRemoteMetadata(
  handler?: ProgressHandler,
): Promise<{ remoteCount: number; pendingDownload: number }> {
  report(handler, { phase: 'listing', completed: 0, total: 0 });
  const folderId = await ensureVaultFolder();
  const manifest = await loadManifest(folderId).catch(() => null);
  const tombstones = new Set(
    (manifest?.files ?? []).filter((entry) => entry.deleted).map((entry) => entry.id),
  );
  const remotes = await listVaultFiles(folderId);

  for (const id of tombstones) {
    const existing = await metadataDb.getFile(id);
    if (existing) {
      deleteLocalFile(existing.localPath);
      await metadataDb.deleteFileRow(id);
    }
  }

  let pendingDownload = 0;
  for (const remote of remotes) {
    const vaultId = remoteVaultId(remote);
    if (tombstones.has(vaultId)) {
      continue;
    }
    const name = remoteDisplayName(remote);
    const mimeType = remoteMimeType(remote);
    const sha256 = remote.appProperties?.sha256 ?? '';
    const existing = await metadataDb.getFile(vaultId);

    if (existing) {
      await metadataDb.upsertRemoteFile(
        { ...remote, name, mimeType },
        vaultId,
        sha256 || existing.sha256,
      );
      const changed = Boolean(sha256 && existing.sha256 && sha256 !== existing.sha256);
      const missingLocal = !localFileExists(existing.localPath);
      if (existing.syncState === 'synced' && (changed || missingLocal)) {
        await metadataDb.setSyncState(vaultId, 'pending_download');
        pendingDownload += 1;
      } else if (existing.syncState === 'pending_download') {
        pendingDownload += 1;
      }
    } else {
      await metadataDb.upsertRemoteFile({ ...remote, name, mimeType }, vaultId, sha256);
      pendingDownload += 1;
    }
  }

  const remoteIds = new Set(remotes.map((remote) => remote.id));
  const files = await metadataDb.listFiles();
  const removedRemotely: VaultFile[] = [];
  for (const file of files) {
    if (!file.driveFileId || remoteIds.has(file.driveFileId)) {
      continue;
    }
    let remoteInfo: { trashed: boolean } | null;
    try {
      remoteInfo = await getDriveFileMetadata(file.driveFileId);
    } catch {
      logger.warn('Could not verify a cloud file; it will be checked again on the next sync.');
      continue;
    }
    if (!remoteInfo || remoteInfo.trashed) {
      deleteLocalFile(file.localPath);
      await metadataDb.deleteFileRow(file.id);
      removedRemotely.push(file);
    }
  }

  await saveManifest(folderId, await metadataDb.listFiles(), removedRemotely);
  return { remoteCount: remotes.length, pendingDownload };
}

export async function downloadFileById(
  id: string,
  onBytes?: (bytesWritten: number, totalBytes: number) => void,
): Promise<VaultFile> {
  const file = await metadataDb.getFile(id);
  if (!file) {
    throw new AppError('not_found', 'This file is no longer in your vault.');
  }
  if (!file.driveFileId) {
    throw new AppError('not_synced', 'This file has not been uploaded yet.');
  }
  const headers = await getAuthHeaders();
  const downloaded = await downloadToLocal(
    driveDownloadUrl(file.driveFileId),
    file.id,
    file.name,
    file.mimeType,
    headers,
    onBytes,
  );
  await metadataDb.markDownloaded(
    file.id,
    downloaded.localPath,
    downloaded.sha256,
    downloaded.size,
  );
  return (await metadataDb.getFile(id)) as VaultFile;
}

export async function downloadAllMissing(
  handler?: ProgressHandler,
  onFileBytes?: (fileId: string, bytesWritten: number, totalBytes: number) => void,
): Promise<DownloadSummary> {
  await pushDeletions();
  await refreshRemoteMetadata(handler);
  await syncUploads(handler);

  const files = await metadataDb.listFiles();
  const missing = files.filter((file) => file.driveFileId && !localFileExists(file.localPath));

  let downloaded = 0;
  let failed = 0;
  let completed = 0;
  const total = missing.length;

  report(handler, { phase: 'downloading', completed: 0, total });

  await runWithConcurrency(missing, 3, async (file) => {
    try {
      const headers = await getAuthHeaders();
      report(handler, {
        phase: 'downloading',
        completed,
        total,
        currentName: file.name,
      });
      const result = await downloadToLocal(
        driveDownloadUrl(file.driveFileId as string),
        file.id,
        file.name,
        file.mimeType,
        headers,
        onFileBytes
          ? (written, totalBytes) => onFileBytes(file.id, written, totalBytes)
          : undefined,
      );
      await metadataDb.markDownloaded(file.id, result.localPath, result.sha256, result.size);
      downloaded += 1;
    } catch {
      failed += 1;
      logger.warn('Download failed; file will be retried later.');
      await metadataDb.setSyncState(file.id, 'pending_download', {
        retryCount: file.retryCount + 1,
      });
    } finally {
      completed += 1;
      report(handler, { phase: 'downloading', completed, total });
    }
  });

  const folderId = await ensureVaultFolder();
  await saveManifest(folderId, await metadataDb.listFiles());
  report(handler, { phase: 'done', completed, total });
  return { downloaded, failed };
}

export async function syncNow(handler?: ProgressHandler): Promise<SyncSummary> {
  await pushDeletions();
  const meta = await refreshRemoteMetadata(handler);
  const upload = await syncUploads(handler);
  return {
    uploaded: upload.uploaded,
    pendingDownload: meta.pendingDownload,
    remoteCount: meta.remoteCount,
    failed: upload.failed,
  };
}

export async function deleteVaultFile(id: string): Promise<void> {
  const file = await metadataDb.getFile(id);
  if (!file) {
    return;
  }

  deleteLocalFile(file.localPath);

  if (!file.driveFileId) {
    await metadataDb.deleteFileRow(id);
    return;
  }

  await metadataDb.markDeleted(id);
  await pushDeletions();
}

export async function renameVaultFile(id: string, name: string): Promise<VaultFile> {
  const file = await metadataDb.getFile(id);
  if (!file) {
    throw new AppError('not_found', 'This file is no longer in your vault.');
  }
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new AppError('invalid_name', 'Please enter a name for this file.');
  }
  const updated: VaultFile = {
    ...file,
    name: trimmed,
    updatedAt: Date.now(),
    syncState: file.driveFileId ? 'synced' : 'pending_upload',
  };
  await metadataDb.upsertFile(updated);

  if (file.driveFileId) {
    try {
      await renameDriveFile(file.driveFileId, `${file.id}__${trimmed}`, {
        vaultId: file.id,
        originalName: trimmed,
        mimeType: file.mimeType,
        sha256: file.sha256,
        appVersion: '0.1.0',
      });
    } catch {
      await metadataDb.setSyncState(file.id, 'pending_upload');
      logger.warn('Remote rename failed; the new name will sync later.');
    }
  }

  const folderId = await ensureVaultFolder();
  await saveManifest(folderId, await metadataDb.listFiles());
  return (await metadataDb.getFile(id)) as VaultFile;
}

export async function deleteCloudVault(): Promise<void> {
  const files = await metadataDb.listFiles();
  await deleteVaultFolder();

  for (const file of files) {
    if (localFileExists(file.localPath)) {
      await metadataDb.upsertFile({
        ...file,
        driveFileId: null,
        syncState: 'local_only',
        lastSyncedAt: null,
        retryCount: 0,
        deleted: false,
      });
    } else {
      await metadataDb.deleteFileRow(file.id);
    }
  }
}
