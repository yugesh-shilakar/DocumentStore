import {
  displayNameFromDriveName,
  driveSafeName,
  extensionFor,
  formatBytes,
  isSupportedMime,
  kindFromMime,
  sanitizeFileName,
} from '../src/utils/format';

describe('formatBytes', () => {
  it('handles empty and invalid values', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(-5)).toBe('0 B');
    expect(formatBytes(Number.NaN)).toBe('0 B');
  });

  it('formats common sizes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatBytes(25 * 1024 * 1024)).toBe('25 MB');
  });
});

describe('mime helpers', () => {
  it('classifies PDFs and images', () => {
    expect(kindFromMime('application/pdf')).toBe('pdf');
    expect(kindFromMime('image/jpeg')).toBe('image');
    expect(isSupportedMime('application/pdf')).toBe(true);
    expect(isSupportedMime('image/png')).toBe(true);
    expect(isSupportedMime('text/plain')).toBe(false);
  });
});

describe('extensionFor', () => {
  it('prefers the existing extension', () => {
    expect(extensionFor('Report.PDF', 'application/pdf')).toBe('.pdf');
    expect(extensionFor('scan.webp', 'image/jpeg')).toBe('.webp');
  });

  it('falls back to the mime type', () => {
    expect(extensionFor('Report', 'application/pdf')).toBe('.pdf');
    expect(extensionFor('Photo', 'image/jpeg')).toBe('.jpg');
    expect(extensionFor('Photo', 'image/png')).toBe('.png');
    expect(extensionFor('File', 'application/octet-stream')).toBe('.octet-stream');
  });
});

describe('file naming', () => {
  it('sanitizes characters that are unsafe on disk or Drive', () => {
    expect(sanitizeFileName('a/b\\c?d%e*f:g|h"i<j>k')).toBe('a-b-c-d-e-f-g-h-i-j-k');
    expect(sanitizeFileName('   ')).toBe('Untitled');
    expect(sanitizeFileName('x'.repeat(200))).toHaveLength(160);
  });

  it('round-trips the vault id through the Drive name', () => {
    const id = '9f8e7d6c-1234-5678-9abc-def012345678';
    const driveName = driveSafeName(id, 'Tax return 2025.pdf');
    expect(driveName).toBe(`${id}__Tax return 2025.pdf`);
    expect(displayNameFromDriveName(driveName)).toEqual({
      id,
      name: 'Tax return 2025.pdf',
    });
  });

  it('leaves legacy names without a vault id untouched', () => {
    expect(displayNameFromDriveName('legacy.pdf')).toEqual({ name: 'legacy.pdf' });
  });
});
