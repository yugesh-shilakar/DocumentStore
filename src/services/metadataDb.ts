import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import { DB_NAME } from '../config';
import type { RemoteFile, SyncState, VaultFile } from '../types';

interface FileRow {
  id: string;
  name: string;
  mime_type: string;
  size: number;
  sha256: string;
  local_path: string | null;
  drive_file_id: string | null;
  sync_state: SyncState;
  created_at: number;
  updated_at: number;
  last_synced_at: number | null;
  retry_count: number;
  deleted: number;
}

const SCHEMA = `
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  sha256 TEXT NOT NULL DEFAULT '',
  local_path TEXT,
  drive_file_id TEXT,
  sync_state TEXT NOT NULL DEFAULT 'local_only',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_synced_at INTEGER,
  retry_count INTEGER NOT NULL DEFAULT 0,
  deleted INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_files_sync_state ON files(sync_state);
CREATE INDEX IF NOT EXISTS idx_files_drive_file_id ON files(drive_file_id);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sync_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at INTEGER NOT NULL
);
`;

let dbPromise: Promise<SQLiteDatabase> | null = null;

export function getDatabase(): Promise<SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = openDatabaseAsync(DB_NAME).then(async (db) => {
      await db.execAsync(SCHEMA);
      return db;
    });
  }
  return dbPromise;
}

function mapRow(row: FileRow): VaultFile {
  return {
    id: row.id,
    name: row.name,
    mimeType: row.mime_type,
    size: row.size,
    sha256: row.sha256,
    localPath: row.local_path,
    driveFileId: row.drive_file_id,
    syncState: row.sync_state,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSyncedAt: row.last_synced_at,
    retryCount: row.retry_count,
    deleted: row.deleted === 1,
  };
}

export async function listFiles(): Promise<VaultFile[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<FileRow>(
    'SELECT * FROM files WHERE deleted = 0 ORDER BY updated_at DESC, name ASC',
  );
  return rows.map(mapRow);
}

export async function getFile(id: string): Promise<VaultFile | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<FileRow>('SELECT * FROM files WHERE id = ?', id);
  return row ? mapRow(row) : null;
}

export async function upsertFile(file: VaultFile): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO files (id, name, mime_type, size, sha256, local_path, drive_file_id, sync_state,
      created_at, updated_at, last_synced_at, retry_count, deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       mime_type = excluded.mime_type,
       size = excluded.size,
       sha256 = excluded.sha256,
       local_path = excluded.local_path,
       drive_file_id = excluded.drive_file_id,
       sync_state = excluded.sync_state,
       updated_at = excluded.updated_at,
       last_synced_at = excluded.last_synced_at,
       retry_count = excluded.retry_count,
       deleted = excluded.deleted`,
    file.id,
    file.name,
    file.mimeType,
    file.size,
    file.sha256,
    file.localPath,
    file.driveFileId,
    file.syncState,
    file.createdAt,
    file.updatedAt,
    file.lastSyncedAt,
    file.retryCount,
    file.deleted ? 1 : 0,
  );
}

export async function setSyncState(
  id: string,
  state: SyncState,
  options?: { retryCount?: number; updatedAt?: number },
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE files SET sync_state = ?, retry_count = COALESCE(?, retry_count), updated_at = COALESCE(?, updated_at) WHERE id = ?',
    state,
    options?.retryCount ?? null,
    options?.updatedAt ?? null,
    id,
  );
}

export async function markUploaded(
  id: string,
  driveFileId: string,
  sha256: string,
  size: number,
): Promise<void> {
  const db = await getDatabase();
  const now = Date.now();
  await db.runAsync(
    `UPDATE files SET drive_file_id = ?, sha256 = ?, size = ?, sync_state = 'synced',
       last_synced_at = ?, updated_at = ?, retry_count = 0 WHERE id = ?`,
    driveFileId,
    sha256,
    size,
    now,
    now,
    id,
  );
}

export async function markDownloaded(
  id: string,
  localPath: string,
  sha256: string,
  size: number,
): Promise<void> {
  const db = await getDatabase();
  const now = Date.now();
  await db.runAsync(
    `UPDATE files SET local_path = ?, sha256 = ?, size = ?, sync_state = 'synced',
       last_synced_at = ?, updated_at = ?, retry_count = 0 WHERE id = ?`,
    localPath,
    sha256,
    size,
    now,
    now,
    id,
  );
}

export async function upsertRemoteFile(
  remote: RemoteFile,
  vaultId: string,
  sha256: string,
): Promise<void> {
  const existing = await getFile(vaultId);
  const now = Date.now();
  if (existing) {
    const db = await getDatabase();
    await db.runAsync(
      `UPDATE files SET name = ?, mime_type = ?, size = ?, drive_file_id = ?, sha256 = ?,
         updated_at = ?, deleted = 0 WHERE id = ?`,
      remote.name,
      remote.mimeType,
      remote.size,
      remote.id,
      sha256,
      now,
      vaultId,
    );
    return;
  }
  await upsertFile({
    id: vaultId,
    name: remote.name,
    mimeType: remote.mimeType,
    size: remote.size,
    sha256,
    localPath: null,
    driveFileId: remote.id,
    syncState: 'pending_download',
    createdAt: parseDriveTime(remote.modifiedTime),
    updatedAt: parseDriveTime(remote.modifiedTime),
    lastSyncedAt: null,
    retryCount: 0,
    deleted: false,
  });
}

export function parseDriveTime(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

export async function deleteFileRow(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM files WHERE id = ?', id);
}

export async function listDeletedFiles(): Promise<VaultFile[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<FileRow>(
    'SELECT * FROM files WHERE deleted = 1 ORDER BY updated_at ASC',
  );
  return rows.map(mapRow);
}

export async function markDeleted(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "UPDATE files SET deleted = 1, local_path = NULL, sync_state = 'deleted', updated_at = ? WHERE id = ?",
    Date.now(),
    id,
  );
}

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    key,
  );
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    key,
    value,
  );
}

export async function clearAllFiles(): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM files');
  await db.runAsync('DELETE FROM sync_queue');
}
