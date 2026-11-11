import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import { DB_NAME } from '../config';

export const LOCAL_ACCOUNT_KEY = 'local';

const META_DB_NAME = 'pdfvault-meta.db';
const STORAGE_SCHEMA_SETTING = 'storage_schema';
const STORAGE_SCHEMA_VERSION = '2';

interface FileTableRow {
  id: string;
  name: string;
  mime_type: string;
  size: number;
  sha256: string;
  local_path: string | null;
  drive_file_id: string | null;
  sync_state: string;
  created_at: number;
  updated_at: number;
  last_synced_at: number | null;
  retry_count: number;
  deleted: number;
}

const ACCOUNT_SCHEMA = `
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

const META_SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
`;

const databases = new Map<string, Promise<SQLiteDatabase>>();
let metaPromise: Promise<SQLiteDatabase> | null = null;
let activeKey: string | null = null;

function accountDbName(key: string): string {
  return `pdfvault-${key}.db`;
}

function fallbackHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `u${hash.toString(16)}`;
}

export function accountKeyFor(userId: string | null | undefined): string {
  if (!userId) {
    return LOCAL_ACCOUNT_KEY;
  }
  const sanitized = userId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 48);
  return sanitized.length > 0 ? sanitized : fallbackHash(userId);
}

export function getActiveAccountKey(): string {
  return activeKey ?? LOCAL_ACCOUNT_KEY;
}

function openCached(name: string, schema: string): Promise<SQLiteDatabase> {
  const existing = databases.get(name);
  if (existing) {
    return existing;
  }
  const promise = openDatabaseAsync(name).then(async (db) => {
    await db.execAsync(schema);
    return db;
  });
  databases.set(name, promise);
  promise.catch(() => {
    if (databases.get(name) === promise) {
      databases.delete(name);
    }
  });
  return promise;
}

export async function getActiveDatabase(): Promise<SQLiteDatabase> {
  return openCached(accountDbName(getActiveAccountKey()), ACCOUNT_SCHEMA);
}

export async function setActiveAccount(key: string): Promise<void> {
  const nextName = accountDbName(key);
  const previousName = activeKey ? accountDbName(activeKey) : null;
  activeKey = key;
  if (previousName === nextName) {
    return;
  }
  if (previousName) {
    const previous = databases.get(previousName);
    if (previous) {
      databases.delete(previousName);
      await previous
        .then((db) => db.closeAsync())
        .catch(() => undefined);
    }
  }
}

export async function getMetaDatabase(): Promise<SQLiteDatabase> {
  if (!metaPromise) {
    metaPromise = openDatabaseAsync(META_DB_NAME).then(async (db) => {
      await db.execAsync(META_SCHEMA);
      return db;
    });
    metaPromise.catch(() => {
      metaPromise = null;
    });
  }
  return metaPromise;
}

export async function getMetaSetting(key: string): Promise<string | null> {
  const db = await getMetaDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    key,
  );
  return row?.value ?? null;
}

export async function setMetaSetting(key: string, value: string): Promise<void> {
  const db = await getMetaDatabase();
  await db.runAsync(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    key,
    value,
  );
}

async function readSetting(db: SQLiteDatabase, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    key,
  );
  return row?.value ?? null;
}

async function writeSetting(db: SQLiteDatabase, key: string, value: string): Promise<void> {
  await db.runAsync(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    key,
    value,
  );
}

async function insertFileRow(db: SQLiteDatabase, row: FileTableRow): Promise<void> {
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
    row.id,
    row.name,
    row.mime_type,
    row.size,
    row.sha256,
    row.local_path,
    row.drive_file_id,
    row.sync_state,
    row.created_at,
    row.updated_at,
    row.last_synced_at,
    row.retry_count,
    row.deleted,
  );
}

async function migrateLegacyIfNeeded(): Promise<void> {
  if ((await getMetaSetting(STORAGE_SCHEMA_SETTING)) === STORAGE_SCHEMA_VERSION) {
    return;
  }
  const legacy = await openDatabaseAsync(DB_NAME);
  await legacy.execAsync(ACCOUNT_SCHEMA);
  const lastUserId = await readSetting(legacy, 'last_user_id');
  const themeMode = await readSetting(legacy, 'theme_mode');
  if (themeMode) {
    await setMetaSetting('theme_mode', themeMode);
  }
  const ownerKey = accountKeyFor(lastUserId);
  if (lastUserId) {
    await setMetaSetting('last_user_id', lastUserId);
  }
  const owner = await openCached(accountDbName(ownerKey), ACCOUNT_SCHEMA);
  const rows = await legacy.getAllAsync<FileTableRow>('SELECT * FROM files');
  for (const row of rows) {
    await insertFileRow(owner, row);
  }
  const settings = await legacy.getAllAsync<{ key: string; value: string }>(
    'SELECT key, value FROM settings',
  );
  for (const setting of settings) {
    if (setting.key === 'last_user_id' || setting.key === 'theme_mode') {
      continue;
    }
    await writeSetting(owner, setting.key, setting.value);
  }
  await legacy.closeAsync();
  await setMetaSetting(STORAGE_SCHEMA_SETTING, STORAGE_SCHEMA_VERSION);
}

export async function initializeAccountStorage(signedInUserId: string | null): Promise<void> {
  await getMetaDatabase();
  await migrateLegacyIfNeeded();
  const lastUserId = signedInUserId ?? (await getMetaSetting('last_user_id'));
  if (signedInUserId && signedInUserId !== lastUserId) {
    await setMetaSetting('last_user_id', signedInUserId);
  }
  await setActiveAccount(accountKeyFor(lastUserId));
}

export async function adoptLocalVaultInto(key: string): Promise<number> {
  if (key === LOCAL_ACCOUNT_KEY) {
    return 0;
  }
  const local = await openCached(accountDbName(LOCAL_ACCOUNT_KEY), ACCOUNT_SCHEMA);
  const account = await openCached(accountDbName(key), ACCOUNT_SCHEMA);
  const rows = await local.getAllAsync<FileTableRow>('SELECT * FROM files');
  if (rows.length === 0) {
    return 0;
  }
  for (const row of rows) {
    await insertFileRow(account, row);
  }
  const localStarred = await readSetting(local, 'starred_ids');
  const accountStarred = await readSetting(account, 'starred_ids');
  if (localStarred && !accountStarred) {
    await writeSetting(account, 'starred_ids', localStarred);
  }
  await local.runAsync('DELETE FROM files');
  await local.runAsync('DELETE FROM sync_queue');
  return rows.length;
}
