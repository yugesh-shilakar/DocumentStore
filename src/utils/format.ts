import type { FileKind } from '../types';

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  const decimals = exponent === 0 ? 0 : value >= 10 ? 0 : 1;
  return `${value.toFixed(decimals)} ${units[exponent]}`;
}

export function formatDate(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return 'Unknown date';
  }
  return new Date(timestamp).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function kindFromMime(mimeType: string): FileKind {
  return mimeType === 'application/pdf' ? 'pdf' : 'image';
}

export function isSupportedMime(mimeType: string): boolean {
  return mimeType === 'application/pdf' || mimeType.startsWith('image/');
}

export function extensionFor(name: string, mimeType: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(name);
  if (match) {
    return `.${match[1].toLowerCase()}`;
  }
  if (mimeType === 'application/pdf') {
    return '.pdf';
  }
  const subtype = mimeType.split('/')[1]?.split(';')[0]?.toLowerCase();
  if (subtype === 'jpeg') {
    return '.jpg';
  }
  return subtype ? `.${subtype}` : '.bin';
}

export function sanitizeFileName(name: string): string {
  const base = name.replace(/[/\\?%*:|"<>]/g, '-').trim();
  const safe = base.length > 0 ? base : 'Untitled';
  return safe.slice(0, 160);
}

export function driveSafeName(id: string, name: string): string {
  return `${id}__${sanitizeFileName(name)}`;
}

export function displayNameFromDriveName(name: string): { id?: string; name: string } {
  const separator = name.indexOf('__');
  if (separator > 0) {
    return { id: name.slice(0, separator), name: name.slice(separator + 2) };
  }
  return { name };
}
