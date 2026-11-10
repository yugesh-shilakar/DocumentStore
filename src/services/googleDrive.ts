import {
  File,
  Paths,
  UploadType,
  type UploadOptions,
  type UploadResult,
} from 'expo-file-system';

import { DRIVE_FOLDER_NAME } from '../config';
import type { RemoteFile } from '../types';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';
import { forceRefreshAccessToken, getValidAccessToken } from './auth';
import { getSetting, setSetting } from './metadataDb';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const FOLDER_SETTING_KEY = 'drive_folder_id';

interface DriveListResponse {
  files?: DriveApiFile[];
  nextPageToken?: string;
}

interface DriveApiFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime: string;
  md5Checksum?: string;
  appProperties?: Record<string, string>;
}

interface DriveErrorBody {
  error?: {
    code?: number;
    message?: string;
    errors?: { reason?: string }[];
  };
}

function escapeQueryValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function queryString(params: Record<string, string | undefined>): string {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value as string)}`)
    .join('&');
}

export async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await getValidAccessToken();
  return { Authorization: `Bearer ${token}` };
}

function uploadErrorDetail(status: number, body: string): { message: string; retryable: boolean } {
  let message = `HTTP ${status}`;
  let retryable = status === 429 || status >= 500;
  try {
    const parsed = JSON.parse(body) as DriveErrorBody;
    if (parsed.error?.message) {
      message = `${parsed.error.message} (HTTP ${status})`;
    }
    const reason = parsed.error?.errors?.[0]?.reason;
    if (reason === 'rateLimitExceeded' || reason === 'userRateLimitExceeded') {
      retryable = true;
    }
  } catch {
    logger.warn('Drive upload error response was not JSON.');
  }
  return { message, retryable };
}

async function uploadWithAuth(
  file: File,
  url: string,
  options: UploadOptions,
): Promise<UploadResult> {
  let auth = await getAuthHeaders();
  let result = await file.upload(url, {
    ...options,
    headers: { ...options.headers, ...auth },
  });
  if (result.status === 401) {
    await forceRefreshAccessToken();
    auth = await getAuthHeaders();
    result = await file.upload(url, {
      ...options,
      headers: { ...options.headers, ...auth },
    });
  }
  return result;
}

async function driveRequest(url: string, init: RequestInit = {}, retry = true): Promise<Response> {
  let headers = await getAuthHeaders();
  let response = await fetch(url, {
    ...init,
    headers: {
      ...headers,
      ...(init.headers as Record<string, string> | undefined),
    },
  });

  if (response.status === 401 && retry) {
    await forceRefreshAccessToken();
    headers = await getAuthHeaders();
    response = await fetch(url, {
      ...init,
      headers: {
        ...headers,
        ...(init.headers as Record<string, string> | undefined),
      },
    });
  }

  if (!response.ok) {
    throw await buildDriveError(response);
  }

  return response;
}

async function buildDriveError(response: Response): Promise<AppError> {
  let reason: string | undefined;
  let message = `Google Drive request failed (${response.status}).`;
  try {
    const body = (await response.json()) as DriveErrorBody;
    reason = body.error?.errors?.[0]?.reason;
    if (body.error?.message) {
      message = `Google Drive: ${body.error.message}`;
    }
  } catch {
    logger.warn('Drive error response was not JSON.');
  }

  if (response.status === 401) {
    return new AppError('reauth_required', 'Your Google session expired. Please sign in again.');
  }
  if (response.status === 404) {
    return new AppError('not_found', 'This file no longer exists in Google Drive.');
  }
  if (
    response.status === 429 ||
    reason === 'rateLimitExceeded' ||
    reason === 'userRateLimitExceeded'
  ) {
    return new AppError('rate_limited', 'Google Drive is busy. Please try again in a moment.', {
      retryable: true,
    });
  }

  return new AppError('drive_error', message, {
    retryable: response.status >= 500,
  });
}

async function driveJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await driveRequest(url, init);
  if (response.status === 204) {
    return {} as T;
  }
  return (await response.json()) as T;
}

async function findFolderId(): Promise<string | null> {
  const params = queryString({
    q: `name = '${escapeQueryValue(DRIVE_FOLDER_NAME)}' and mimeType = '${FOLDER_MIME}' and trashed = false and 'root' in parents`,
    fields: 'files(id,name)',
    spaces: 'drive',
    pageSize: '10',
  });
  const result = await driveJson<DriveListResponse>(`${DRIVE_API}/files?${params}`);
  return result.files?.[0]?.id ?? null;
}

async function createFolder(): Promise<string> {
  const result = await driveJson<{ id: string }>(`${DRIVE_API}/files?fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: DRIVE_FOLDER_NAME,
      mimeType: FOLDER_MIME,
      parents: ['root'],
    }),
  });
  return result.id;
}

export async function ensureVaultFolder(): Promise<string> {
  const cached = await getSetting(FOLDER_SETTING_KEY);
  if (cached) {
    return cached;
  }
  const existing = await findFolderId();
  const folderId = existing ?? (await createFolder());
  await setSetting(FOLDER_SETTING_KEY, folderId);
  logger.info('Google Drive vault folder ready.');
  return folderId;
}

export async function forgetVaultFolder(): Promise<void> {
  await setSetting(FOLDER_SETTING_KEY, '');
}

export async function listVaultFiles(folderId: string): Promise<RemoteFile[]> {
  const files: RemoteFile[] = [];
  let pageToken: string | undefined;

  do {
    const params = queryString({
      q: `'${escapeQueryValue(folderId)}' in parents and trashed = false and mimeType != '${FOLDER_MIME}' and name != 'vault-manifest.json'`,
      fields: 'nextPageToken, files(id,name,mimeType,size,modifiedTime,md5Checksum,appProperties)',
      pageSize: '1000',
      pageToken,
      spaces: 'drive',
    });
    const page = await driveJson<DriveListResponse>(`${DRIVE_API}/files?${params}`);
    for (const file of page.files ?? []) {
      files.push({
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        size: Number(file.size ?? 0),
        modifiedTime: file.modifiedTime,
        md5Checksum: file.md5Checksum,
        appProperties: file.appProperties,
      });
    }
    pageToken = page.nextPageToken;
  } while (pageToken);

  return files;
}

export async function findFileIdByName(folderId: string, name: string): Promise<string | null> {
  const params = queryString({
    q: `name = '${escapeQueryValue(name)}' and '${escapeQueryValue(folderId)}' in parents and trashed = false`,
    fields: 'files(id,name)',
    pageSize: '10',
  });
  const result = await driveJson<DriveListResponse>(`${DRIVE_API}/files?${params}`);
  return result.files?.[0]?.id ?? null;
}

export async function downloadJsonFile<T>(fileId: string): Promise<T> {
  const response = await driveRequest(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`);
  return (await response.json()) as T;
}

export async function uploadJsonFile(
  name: string,
  content: string,
  folderId: string,
  existingFileId?: string | null,
): Promise<string> {
  const temp = new File(Paths.cache, name);
  if (temp.exists) {
    temp.delete();
  }
  temp.create({ overwrite: true });
  await temp.write(content);

  const uploadUrl = existingFileId
    ? `${UPLOAD_API}/files/${encodeURIComponent(existingFileId)}?uploadType=media&fields=id`
    : `${UPLOAD_API}/files?uploadType=media&fields=id`;

  const result = await uploadWithAuth(temp, uploadUrl, {
    httpMethod: existingFileId ? 'PATCH' : 'POST',
    uploadType: UploadType.BINARY_CONTENT,
    headers: { 'Content-Type': 'application/json' },
    mimeType: 'application/json',
  });

  if (result.status < 200 || result.status >= 300) {
    const detail = uploadErrorDetail(result.status, result.body);
    throw new AppError(
      'drive_upload_failed',
      `Could not update the remote manifest: ${detail.message}`,
      { retryable: detail.retryable },
    );
  }

  const uploaded = JSON.parse(result.body) as { id: string };

  if (!existingFileId) {
    const params = queryString({ addParents: folderId, removeParents: 'root', fields: 'id' });
    await driveJson(`${DRIVE_API}/files/${uploaded.id}?${params}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
  }

  temp.delete();
  return uploaded.id;
}

export interface RemoteUploadResult {
  id: string;
  size: number;
}

export async function uploadVaultFile(
  file: File,
  vaultId: string,
  name: string,
  mimeType: string,
  sha256: string,
  folderId: string,
  existingDriveFileId?: string | null,
  onProgress?: (bytesSent: number, totalBytes: number) => void,
): Promise<RemoteUploadResult> {
  const uploadUrl = existingDriveFileId
    ? `${UPLOAD_API}/files/${encodeURIComponent(existingDriveFileId)}?uploadType=media&fields=id,size`
    : `${UPLOAD_API}/files?uploadType=media&fields=id,size`;

  const result = await uploadWithAuth(file, uploadUrl, {
    httpMethod: existingDriveFileId ? 'PATCH' : 'POST',
    uploadType: UploadType.BINARY_CONTENT,
    headers: { 'Content-Type': mimeType },
    mimeType,
    onProgress: onProgress
      ? ({ bytesSent, totalBytes }) => onProgress(bytesSent, totalBytes)
      : undefined,
  });

  if (result.status < 200 || result.status >= 300) {
    const detail = uploadErrorDetail(result.status, result.body);
    throw new AppError(
      'drive_upload_failed',
      `Could not upload this file to Google Drive: ${detail.message}`,
      { retryable: detail.retryable },
    );
  }

  const uploaded = JSON.parse(result.body) as { id: string; size?: string };

  const params = existingDriveFileId
    ? queryString({ fields: 'id' })
    : queryString({ addParents: folderId, removeParents: 'root', fields: 'id' });
  await driveJson(`${DRIVE_API}/files/${uploaded.id}?${params}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: `${vaultId}__${name}`,
      appProperties: {
        vaultId,
        originalName: name,
        mimeType,
        sha256,
        appVersion: '0.1.0',
      },
    }),
  });

  return {
    id: uploaded.id,
    size: Number(uploaded.size ?? file.size ?? 0),
  };
}

export function driveDownloadUrl(fileId: string): string {
  return `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`;
}

export async function renameDriveFile(
  fileId: string,
  name: string,
  appProperties?: Record<string, string>,
): Promise<void> {
  await driveJson(`${DRIVE_API}/files/${encodeURIComponent(fileId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, ...(appProperties ? { appProperties } : {}) }),
  });
}

export async function deleteDriveFile(fileId: string): Promise<void> {
  try {
    await driveRequest(`${DRIVE_API}/files/${encodeURIComponent(fileId)}`, { method: 'DELETE' });
  } catch (error) {
    if (error instanceof AppError && error.code === 'not_found') {
      return;
    }
    throw error;
  }
}

export async function deleteVaultFolder(): Promise<void> {
  const folderId = await getSetting(FOLDER_SETTING_KEY);
  if (!folderId) {
    return;
  }
  try {
    await driveRequest(`${DRIVE_API}/files/${encodeURIComponent(folderId)}`, { method: 'DELETE' });
  } catch (error) {
    if (!(error instanceof AppError && error.code === 'not_found')) {
      throw error;
    }
  } finally {
    await setSetting(FOLDER_SETTING_KEY, '');
  }
}
