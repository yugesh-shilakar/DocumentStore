export type SyncState =
  'local_only' | 'pending_upload' | 'synced' | 'pending_download' | 'conflict' | 'deleted';

export type FileKind = 'pdf' | 'image';

export interface VaultFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  sha256: string;
  localPath: string | null;
  driveFileId: string | null;
  syncState: SyncState;
  createdAt: number;
  updatedAt: number;
  lastSyncedAt: number | null;
  retryCount: number;
  deleted: boolean;
}

export interface RemoteFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  modifiedTime: string;
  md5Checksum?: string;
  appProperties?: Record<string, string>;
}

export interface ManifestEntry {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  sha256: string;
  updatedAt: number;
  deleted: boolean;
}

export interface VaultManifest {
  schemaVersion: number;
  updatedAt: number;
  files: ManifestEntry[];
}

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  picture?: string;
}

export interface StoredSession {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  scope?: string;
  user: AuthUser;
}

export interface SelectedAsset {
  uri: string;
  name: string;
  mimeType: string;
  size: number;
}

export interface SyncProgress {
  phase: 'idle' | 'listing' | 'uploading' | 'downloading' | 'manifest' | 'done';
  completed: number;
  total: number;
  currentName?: string;
  message?: string;
}
