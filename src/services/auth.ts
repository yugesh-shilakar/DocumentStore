import {
  AuthRequest,
  ResponseType,
  exchangeCodeAsync,
  fetchUserInfoAsync,
  makeRedirectUri,
  refreshAsync,
  revokeAsync,
} from 'expo-auth-session';
import { discovery as googleDiscovery } from 'expo-auth-session/providers/google';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import {
  ANDROID_PACKAGE,
  APP_SCHEME,
  GOOGLE_SCOPES,
  SESSION_STORAGE_KEY,
  getGoogleClientId,
  getGoogleRedirectScheme,
  isGoogleConfigured,
} from '../config';
import type { AuthUser, StoredSession } from '../types';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

const EXPIRY_MARGIN_MS = 120_000;
const DEFAULT_TOKEN_LIFETIME_SECONDS = 3600;

let cachedSession: StoredSession | null = null;

function redirectUri(): string {
  if (Platform.OS === 'web') {
    return makeRedirectUri({ scheme: APP_SCHEME });
  }
  const redirectScheme = getGoogleRedirectScheme() ?? ANDROID_PACKAGE;
  return makeRedirectUri({
    native: `${redirectScheme}:/oauthredirect`,
    scheme: APP_SCHEME,
  });
}

function sessionFromToken(
  token: {
    accessToken: string;
    refreshToken?: string;
    expiresIn?: number;
    scope?: string;
    idToken?: string;
  },
  user: AuthUser,
  previousRefreshToken?: string,
): StoredSession {
  const lifetime = token.expiresIn ?? DEFAULT_TOKEN_LIFETIME_SECONDS;
  return {
    accessToken: token.accessToken,
    refreshToken: token.refreshToken ?? previousRefreshToken,
    expiresAt: Date.now() + lifetime * 1000,
    scope: token.scope,
    user,
  };
}

function decodeIdToken(idToken?: string): AuthUser | null {
  if (!idToken) {
    return null;
  }
  try {
    const payloadPart = idToken.split('.')[1];
    if (!payloadPart) {
      return null;
    }
    const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const json = decodeURIComponent(
      Array.from(atob(padded))
        .map((char) => `%${`00${char.charCodeAt(0).toString(16)}`.slice(-2)}`)
        .join(''),
    );
    const payload = JSON.parse(json) as Record<string, string>;
    return {
      id: payload.sub ?? payload.email ?? 'google-user',
      email: payload.email ?? '',
      name: payload.name,
      picture: payload.picture,
    };
  } catch {
    return null;
  }
}

async function fetchProfile(accessToken: string, idToken?: string): Promise<AuthUser> {
  try {
    const info = await fetchUserInfoAsync({ accessToken }, googleDiscovery);
    return {
      id: String(info.sub ?? info.email ?? 'google-user'),
      email: String(info.email ?? ''),
      name: info.name ? String(info.name) : undefined,
      picture: info.picture ? String(info.picture) : undefined,
    };
  } catch {
    logger.warn('Could not load Google profile, falling back to id token.');
    return (
      decodeIdToken(idToken) ?? {
        id: 'google-user',
        email: '',
      }
    );
  }
}

export async function restoreSession(): Promise<StoredSession | null> {
  if (cachedSession) {
    return cachedSession;
  }
  const raw = await SecureStore.getItemAsync(SESSION_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed.accessToken) {
      return null;
    }
    cachedSession = parsed;
    return parsed;
  } catch {
    await SecureStore.deleteItemAsync(SESSION_STORAGE_KEY);
    return null;
  }
}

async function persistSession(session: StoredSession): Promise<void> {
  cachedSession = session;
  await SecureStore.setItemAsync(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export async function signInWithGoogle(): Promise<StoredSession> {
  if (!isGoogleConfigured()) {
    throw new AppError(
      'not_configured',
      'Google Sign-In is not configured. Add EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID to your environment and rebuild the app.',
    );
  }

  const clientId = getGoogleClientId();
  const uri = redirectUri();
  const request = new AuthRequest({
    clientId,
    scopes: GOOGLE_SCOPES,
    redirectUri: uri,
    responseType: ResponseType.Code,
    usePKCE: true,
    extraParams: {
      access_type: 'offline',
      prompt: 'consent',
    },
  });

  const result = await request.promptAsync(googleDiscovery);

  if (result.type === 'cancel' || result.type === 'dismiss' || result.type === 'opened') {
    throw new AppError('cancelled', 'Sign-in was cancelled.');
  }
  if (result.type !== 'success') {
    throw new AppError('auth_failed', 'Google sign-in failed. Please try again.');
  }

  const code = result.params.code;
  if (!code) {
    throw new AppError('auth_failed', 'Google did not return an authorization code.');
  }

  const token = await exchangeCodeAsync(
    {
      clientId,
      code,
      redirectUri: uri,
      extraParams: { code_verifier: request.codeVerifier ?? '' },
    },
    googleDiscovery,
  );

  const user = await fetchProfile(token.accessToken, token.idToken);
  const session = sessionFromToken(token, user);
  await persistSession(session);
  logger.info('Google sign-in completed.');
  return session;
}

export async function getValidAccessToken(): Promise<string> {
  const session = await restoreSession();
  if (!session) {
    throw new AppError('not_signed_in', 'Please sign in with Google to sync your vault.');
  }
  if (session.expiresAt - EXPIRY_MARGIN_MS > Date.now()) {
    return session.accessToken;
  }
  return (await refreshSession(session)).accessToken;
}

export async function forceRefreshAccessToken(): Promise<string> {
  const session = await restoreSession();
  if (!session) {
    throw new AppError('not_signed_in', 'Please sign in with Google to sync your vault.');
  }
  return (await refreshSession(session)).accessToken;
}

async function refreshSession(session: StoredSession): Promise<StoredSession> {
  if (!session.refreshToken) {
    throw new AppError('reauth_required', 'Your Google session expired. Please sign in again.');
  }
  try {
    const token = await refreshAsync(
      {
        clientId: getGoogleClientId(),
        refreshToken: session.refreshToken,
      },
      googleDiscovery,
    );
    const next = sessionFromToken(token, session.user, session.refreshToken);
    await persistSession(next);
    return next;
  } catch (error) {
    logger.warn('Google token refresh failed.');
    throw new AppError('reauth_required', 'Your Google session expired. Please sign in again.', {
      cause: error,
    });
  }
}

export async function signOut(): Promise<void> {
  const session = await restoreSession();
  cachedSession = null;
  await SecureStore.deleteItemAsync(SESSION_STORAGE_KEY);
  if (session) {
    try {
      await revokeAsync(
        { clientId: getGoogleClientId(), token: session.refreshToken ?? session.accessToken },
        googleDiscovery,
      );
    } catch {
      logger.warn('Token revocation failed; local session was cleared.');
    }
  }
}
