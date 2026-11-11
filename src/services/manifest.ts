import { MANIFEST_FILE_NAME, MANIFEST_SCHEMA_VERSION } from '../config';
import type { ManifestEntry, VaultFile, VaultManifest } from '../types';
import { AppError } from '../utils/errors';
import { findFileIdByName, downloadJsonFile, uploadJsonFile } from './googleDrive';

interface StoredManifestFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  sha256: string;
  updatedAt: number;
  deleted: boolean;
}

export async function loadManifest(folderId: string): Promise<VaultManifest | null> {
  const fileId = await findFileIdByName(folderId, MANIFEST_FILE_NAME);
  if (!fileId) {
    return null;
  }
  const raw = await downloadJsonFile<Partial<VaultManifest>>(fileId);
  if (!raw || !Array.isArray(raw.files)) {
    throw new AppError('manifest_invalid', 'The cloud vault manifest is unreadable.');
  }
  return {
    schemaVersion: raw.schemaVersion ?? MANIFEST_SCHEMA_VERSION,
    updatedAt: raw.updatedAt ?? Date.now(),
    files: raw.files.map((entry) => ({
      id: entry.id,
      name: entry.name,
      mimeType: entry.mimeType,
      size: entry.size ?? 0,
      sha256: entry.sha256 ?? '',
      updatedAt: entry.updatedAt ?? 0,
      deleted: Boolean(entry.deleted),
    })),
  };
}

export function manifestEntryFromFile(file: VaultFile): ManifestEntry {
  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    size: file.size,
    sha256: file.sha256,
    updatedAt: file.updatedAt,
    deleted: file.deleted,
  };
}

export async function markDeletedInManifest(folderId: string, file: VaultFile): Promise<void> {
  const existing = await loadManifest(folderId);
  const entries = new Map<string, StoredManifestFile>();
  for (const entry of existing?.files ?? []) {
    entries.set(entry.id, entry);
  }
  entries.set(file.id, { ...manifestEntryFromFile(file), deleted: true });
  const manifest: VaultManifest = {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    updatedAt: Date.now(),
    files: Array.from(entries.values()),
  };
  const existingFileId = await findFileIdByName(folderId, MANIFEST_FILE_NAME);
  await uploadJsonFile(
    MANIFEST_FILE_NAME,
    JSON.stringify(manifest, null, 2),
    folderId,
    existingFileId,
  );
}

export async function saveManifest(
  folderId: string,
  files: VaultFile[],
  tombstoneFiles: VaultFile[] = [],
): Promise<void> {
  const existing = await loadManifest(folderId);
  const entries = new Map<string, StoredManifestFile>();

  for (const entry of existing?.files ?? []) {
    entries.set(entry.id, entry);
  }
  for (const file of files) {
    entries.set(file.id, manifestEntryFromFile(file));
  }
  for (const file of tombstoneFiles) {
    entries.set(file.id, { ...manifestEntryFromFile(file), deleted: true });
  }

  const manifest: VaultManifest = {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    updatedAt: Date.now(),
    files: Array.from(entries.values()),
  };

  const existingFileId = await findFileIdByName(folderId, MANIFEST_FILE_NAME);
  await uploadJsonFile(
    MANIFEST_FILE_NAME,
    JSON.stringify(manifest, null, 2),
    folderId,
    existingFileId,
  );
}
