import { Platform } from 'react-native';

export const APP_SCHEME = 'pdfvault';
export const ANDROID_PACKAGE = 'com.pdfvault.app';
export const DB_NAME = 'pdfvault.db';
export const SESSION_STORAGE_KEY = 'pdfvault.google.session';
export const DRIVE_FOLDER_NAME = 'PDF Vault';
export const MANIFEST_FILE_NAME = 'vault-manifest.json';
export const MANIFEST_SCHEMA_VERSION = 1;
export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

export const GOOGLE_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/drive.file',
];

const ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? '';
const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '';
const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';

export function getGoogleClientId(): string {
  if (Platform.OS === 'android') {
    return ANDROID_CLIENT_ID || WEB_CLIENT_ID;
  }
  if (Platform.OS === 'ios') {
    return IOS_CLIENT_ID || WEB_CLIENT_ID;
  }
  return WEB_CLIENT_ID || ANDROID_CLIENT_ID;
}

export function isGoogleConfigured(): boolean {
  return getGoogleClientId().length > 0;
}

export function getGoogleRedirectScheme(): string | null {
  const clientId = getGoogleClientId();
  if (!clientId.endsWith('.apps.googleusercontent.com')) {
    return null;
  }
  return clientId.split('.').reverse().join('.');
}
