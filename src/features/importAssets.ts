import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

import { MAX_FILE_SIZE_BYTES } from '../config';
import type { SelectedAsset } from '../types';
import { formatBytes, isSupportedMime, sanitizeFileName } from '../utils/format';

export interface PickedAssets {
  assets: SelectedAsset[];
  rejected: string[];
}

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  bmp: 'image/bmp',
};

function inferMimeType(name: string, provided?: string | null): string {
  if (provided && provided !== 'application/octet-stream') {
    return provided;
  }
  const extension = name.split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXTENSION[extension] ?? provided ?? '';
}

function validate(asset: SelectedAsset): string | null {
  if (!isSupportedMime(asset.mimeType)) {
    return `${asset.name}: only PDFs and images are supported.`;
  }
  if (asset.size > MAX_FILE_SIZE_BYTES) {
    return `${asset.name}: larger than ${formatBytes(MAX_FILE_SIZE_BYTES)}.`;
  }
  return null;
}

function toSelected(uri: string, name: string, mimeType: string, size: number): SelectedAsset {
  return {
    uri,
    name: sanitizeFileName(name),
    mimeType,
    size,
  };
}

export async function pickDocuments(): Promise<PickedAssets> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/pdf', 'image/*'],
    multiple: true,
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets) {
    return { assets: [], rejected: [] };
  }

  return collect(
    result.assets.map((asset) =>
      toSelected(asset.uri, asset.name, inferMimeType(asset.name, asset.mimeType), asset.size ?? 0),
    ),
  );
}

export async function pickPhotos(): Promise<PickedAssets> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    return { assets: [], rejected: ['Photo library permission was not granted.'] };
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    quality: 1,
  });

  if (result.canceled || !result.assets) {
    return { assets: [], rejected: [] };
  }

  return collect(
    result.assets.map((asset) => {
      const name = asset.fileName ?? `photo-${Date.now()}.jpg`;
      return toSelected(asset.uri, name, inferMimeType(name, asset.mimeType), asset.fileSize ?? 0);
    }),
  );
}

export async function capturePhoto(): Promise<PickedAssets> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    return { assets: [], rejected: ['Camera permission was not granted.'] };
  }

  const result = await ImagePicker.launchCameraAsync({ quality: 1 });
  if (result.canceled || !result.assets) {
    return { assets: [], rejected: [] };
  }

  return collect(
    result.assets.map((asset) => {
      const name = asset.fileName ?? `scan-${Date.now()}.jpg`;
      return toSelected(asset.uri, name, inferMimeType(name, asset.mimeType), asset.fileSize ?? 0);
    }),
  );
}

function collect(candidates: SelectedAsset[]): PickedAssets {
  const assets: SelectedAsset[] = [];
  const rejected: string[] = [];
  for (const asset of candidates) {
    const problem = validate(asset);
    if (problem) {
      rejected.push(problem);
    } else {
      assets.push(asset);
    }
  }
  return { assets, rejected };
}
