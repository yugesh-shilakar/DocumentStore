import { Directory, File, Paths } from 'expo-file-system';
import PdfThumbnail from 'react-native-pdf-thumbnail';

import { logger } from '../utils/logger';

const THUMBNAIL_DIRECTORY = 'pdf-thumbnails';
const MAX_CONCURRENT = 2;
const THUMBNAIL_OPTIONS = { maxWidth: 640, maxHeight: 900, quality: 72 } as const;

const pending = new Map<string, Promise<string | null>>();
const waiters: (() => void)[] = [];
let active = 0;

function thumbnailDirectory(): Directory {
  return new Directory(Paths.cache, THUMBNAIL_DIRECTORY);
}

function ensureThumbnailDirectory(): Directory {
  const directory = thumbnailDirectory();
  if (!directory.exists) {
    directory.create({ intermediates: true, idempotent: true });
  }
  return directory;
}

function acquireSlot(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    waiters.push(() => {
      active += 1;
      resolve();
    });
  });
}

function releaseSlot(): void {
  active -= 1;
  const next = waiters.shift();
  if (next) {
    next();
  }
}

function safeCacheKey(id: string, updatedAt: number): string {
  return `${id}-${updatedAt}`.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function removeFile(uri: string | null): void {
  if (!uri) {
    return;
  }
  try {
    const file = new File(uri);
    if (file.exists) {
      file.delete();
    }
  } catch {
    logger.warn('Could not remove temporary thumbnail.');
  }
}

async function generate(localPath: string, cacheKey: string): Promise<string | null> {
  let sourceFile: File;
  try {
    sourceFile = new File(localPath);
  } catch {
    return null;
  }
  if (!sourceFile.exists) {
    return null;
  }

  const target = new File(ensureThumbnailDirectory(), `${cacheKey}.jpg`);
  if (target.exists) {
    return target.uri;
  }

  await acquireSlot();
  let temporary: string | null = null;
  try {
    const result = await PdfThumbnail.generate(localPath, 0, THUMBNAIL_OPTIONS);
    temporary = result.uri;
    const source = new File(result.uri);
    if (!source.exists) {
      return null;
    }
    await source.copy(target, { overwrite: true });
    return target.exists ? target.uri : null;
  } finally {
    removeFile(temporary);
    releaseSlot();
  }
}

async function run(localPath: string, cacheKey: string): Promise<string | null> {
  try {
    return await generate(localPath, cacheKey);
  } catch (error) {
    logger.warn('Could not generate PDF thumbnail.', {
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export function getPdfThumbnail(
  localPath: string | null,
  id: string,
  updatedAt: number,
): Promise<string | null> {
  if (!localPath) {
    return Promise.resolve(null);
  }

  const cacheKey = safeCacheKey(id, updatedAt);
  try {
    const cached = new File(thumbnailDirectory(), `${cacheKey}.jpg`);
    if (cached.exists) {
      return Promise.resolve(cached.uri);
    }
  } catch {
    return Promise.resolve(null);
  }

  const existing = pending.get(cacheKey);
  if (existing) {
    return existing;
  }

  const task = run(localPath, cacheKey);
  pending.set(cacheKey, task);
  void task.then(
    () => pending.delete(cacheKey),
    () => pending.delete(cacheKey),
  );
  return task;
}
