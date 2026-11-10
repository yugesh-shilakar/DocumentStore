import { Directory, File, Paths } from 'expo-file-system';

import { MAX_FILE_SIZE_BYTES } from '../config';
import type { SelectedAsset } from '../types';
import { AppError } from '../utils/errors';
import { extensionFor, formatBytes } from '../utils/format';
import { logger } from '../utils/logger';

const VAULT_DIRECTORY = 'vault';
const FILES_DIRECTORY = 'files';

function filesDirectory(): Directory {
  return new Directory(Paths.document, VAULT_DIRECTORY, FILES_DIRECTORY);
}

export async function ensureVaultDirectories(): Promise<void> {
  const directory = filesDirectory();
  if (!directory.exists) {
    directory.create({ intermediates: true, idempotent: true });
  }
}

export function localPathFor(id: string, name: string, mimeType: string): string {
  return new File(filesDirectory(), `${id}${extensionFor(name, mimeType)}`).uri;
}

export async function importAsset(
  id: string,
  asset: SelectedAsset,
): Promise<{ localPath: string; size: number; sha256: string }> {
  await ensureVaultDirectories();
  const destination = new File(
    filesDirectory(),
    `${id}${extensionFor(asset.name, asset.mimeType)}`,
  );
  const source = new File(asset.uri);
  const bytes = await source.bytes();
  if (destination.exists) {
    destination.delete();
  }
  await destination.write(bytes);
  const size = destination.size ?? bytes.byteLength;
  if (size > MAX_FILE_SIZE_BYTES) {
    destination.delete();
    throw new AppError(
      'file_too_large',
      `This file is larger than ${formatBytes(MAX_FILE_SIZE_BYTES)}.`,
    );
  }
  const sha256 = await destination.digest('SHA-256');
  return {
    localPath: destination.uri,
    size,
    sha256,
  };
}

export async function downloadToLocal(
  url: string,
  id: string,
  name: string,
  mimeType: string,
  headers: Record<string, string>,
  onProgress?: (bytesWritten: number, totalBytes: number) => void,
): Promise<{ localPath: string; size: number; sha256: string }> {
  await ensureVaultDirectories();
  const destination = new File(filesDirectory(), `${id}${extensionFor(name, mimeType)}`);
  const file = await File.downloadFileAsync(url, destination, {
    headers,
    idempotent: true,
    onProgress: onProgress
      ? ({ bytesWritten, totalBytes }) => onProgress(bytesWritten, totalBytes)
      : undefined,
  });
  const sha256 = await file.digest('SHA-256');
  return {
    localPath: file.uri,
    size: file.size ?? 0,
    sha256,
  };
}

export function deleteLocalFile(path: string | null): void {
  if (!path) {
    return;
  }
  try {
    const file = new File(path);
    if (file.exists) {
      file.delete();
    }
  } catch {
    logger.warn('Could not delete local file.');
  }
}

export function localFileExists(path: string | null): boolean {
  if (!path) {
    return false;
  }
  try {
    return new File(path).exists;
  } catch {
    return false;
  }
}

export function getLocalSize(path: string | null): number {
  if (!path) {
    return 0;
  }
  try {
    return new File(path).size ?? 0;
  } catch {
    return 0;
  }
}

export function getStorageUsageBytes(): number {
  try {
    const directory = filesDirectory();
    return directory.exists ? (directory.size ?? 0) : 0;
  } catch {
    return 0;
  }
}

export async function writeTemporaryTextFile(name: string, content: string): Promise<File> {
  const file = new File(Paths.cache, name);
  if (file.exists) {
    file.delete();
  }
  file.create({ overwrite: true });
  await file.write(content);
  return file;
}

export async function readTextFile(path: string): Promise<string> {
  return new File(path).text();
}
