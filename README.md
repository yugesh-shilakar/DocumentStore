# PDF & Photo Vault — Android App Plan

An offline-first Android app (React Native) to import, preview, and store PDFs and photos locally, backed up to a visible **"PDF Vault" folder in the user's Google Drive**. Sign in with Google to sync; after uninstall/reinstall, sign in and restore everything with one "Download all" tap.

> **Scope note:** login is **Google Sign-In** instead of user id + password. Drive access requires a Google account, and adding email/password would mean running a custom auth backend. This keeps the app serverless.

## 0. Current implementation

Implemented: local import (documents, photos, camera), SQLite index, PDF/image preview, rename/delete, Google OAuth PKCE with secure session storage, Drive folder + manifest sync, upload/download with retry queue, "Download all" restore, foreground/network auto-sync, and the Vault/Sync/Settings screens. Unit tests cover formatting and Drive file naming; `tsc`, ESLint, Jest, `expo-doctor`, and an Android production bundle all pass.

Not implemented yet: background-fetch worker, rolling manifest backups, resumable uploads for very large files, Maestro E2E, and Play Store assets/signing.

### Run locally

```powershell
npm install
Copy-Item .env.example .env
# Fill EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID in .env
npx expo prebuild --platform android --clean
npx expo run:android   # requires JDK 17 + Android SDK
```

Run `prebuild --clean` again after changing the Google client ID. On Windows, if the native build fails with `Filename longer than 260 characters`, install Android SDK CMake 3.31.6, set `android.cmakeVersion=3.31.6` in `%USERPROFILE%\.gradle\gradle.properties`, enable Windows long paths, then delete `android/app/.cxx` and rebuild.

For Google Cloud: enable the Drive API, configure the OAuth consent screen, create an **Android** OAuth client for `com.pdfvault.app`, and register the SHA-1 of the keystore used for the build. The Google reverse-client-ID redirect scheme is added automatically from `.env` by `app.config.js`.

## 1. Goals & Scope

| Requirement | How it's met |
|---|---|
| Import documents & photos | SAF document picker, gallery picker, camera capture |
| Preview | Paginated PDF viewer + pinch-zoom image viewer, fully offline |
| Store in device storage | App-private directory, indexed in local SQLite |
| Login with Google account | Google OAuth 2.0 + PKCE (`openid email profile` + `drive.file`) |
| Cloud sync of docs & photos | Upload/download to/from a visible "PDF Vault" Drive folder |
| Survive uninstall/reinstall | Drive folder is source of truth; sign in → list → restore |
| One-click offline restore | "Download all" with progress, resume, per-file retry |
| Auto + manual sync | Poll on launch/foreground/network + Sync button |

Out of scope (v1): Office docs, iOS, web, in-app editing, sharing/permissions management, importing arbitrary pre-existing Drive files (see Phase 2), Google Photos integration.

## 2. Tech Stack

- **App:** React Native + TypeScript on Expo (dev client / prebuild).
- **Navigation:** React Navigation (native stack).
- **State/data:** Zustand (UI) + Expo SQLite (local metadata + sync queue).
- **Auth:** `expo-auth-session` — Google OAuth 2.0 Authorization Code + **PKCE**, refresh token in `expo-secure-store`. No backend.
- **Cloud storage:** Google Drive REST API v3 with `drive.file` scope (non-sensitive → no Google verification needed).
- **Files:** `expo-file-system` (upload/download, resumable for large files), `expo-document-picker`, `expo-image-picker`, `expo-camera`, optional `expo-media-library` for export.
- **Preview:** `react-native-pdf` (PDF), `expo-image` + gesture-handler (images).
- **Connectivity/background:** `@react-native-community/netinfo`, `expo-background-fetch` + `expo-task-manager`.
- **Quality:** ESLint, Prettier, Jest, React Native Testing Library, Maestro (E2E).

## 3. Architecture

```
UI (screens/components)
      │
State (Zustand: auth, files, sync)
      │
Repositories
 ├── LocalFileStore   → expo-file-system (app-private dir)
 ├── LocalMetadataDB   → expo-sqlite (files table + sync queue)
 ├── AuthRepo          → Google OAuth (expo-auth-session), token refresh
 └── DriveRepo         → Drive REST v3 (folder, list, upload, download, delete)
      │
Sync Engine (diff, queue, retry/backoff, conflicts)
      │
Background worker (NetInfo + background-fetch)
```

**Local-first rule:** all reads come from local SQLite; sync mutates local state and reconciles with Drive asynchronously. The app is fully usable offline for files already on the device.

### Drive layout (visible under the user's Drive)

```
PDF Vault/                     ← created by app, discovered by name
  vault-manifest.json          ← index + rolling backups
  vault-manifest.backup.json
  <fileId>__<name>.pdf         ← documents
  <fileId>__<name>.jpg         ← photos
```

- Each binary carries `appProperties`: `vaultId`, `sha256`, `originalName`, `appVersion`.
- Drive's `md5Checksum` + `modifiedTime` drive diffing.
- Manifest is the tie-breaker for deletes/renames and stores schema version.

### Local SQLite `files` row

`fileId, name, mimeType, size, sha256, localPath, driveFileId, syncState, updatedAt, lastSyncedAt, retryCount`

where `syncState ∈ {local_only, pending_upload, synced, pending_download, conflict, deleted}`.

### Scope note

`drive.file` lets the app see only files/folders **it created** — exactly what the vault needs — and avoids Google's restricted-scope verification. (Phase 2: open pre-existing Drive files via Google Picker.)

## 4. Sync Engine

- **Upload:** import/local change → enqueue `pending_upload` → resumable `files.create`/`files.update` with `appProperties` → update manifest → mark `synced`.
- **Download:** launch/sign-in/manual → get folder id → `files.list` (paginated, `fields` limited) → diff by `vaultId` + `sha256` → enqueue missing/changed → download `alt=media` → verify sha256 → persist.
- **Delete:** local tombstone → remove from Drive (or trash) → update manifest; other devices honor manifest tombstones.
- **Conflict:** compare `updatedAt` + `sha256`; last-write-wins, keeping the losing version as a `__conflict` copy for 7 days.
- **Download all:** compute missing set from manifest + listing → concurrent batch (3–4) → live progress (x/y, bytes) → per-file retry → summary. Idempotent; skips present files.
- **Polling:** Drive has no push for this use case; sync on launch, app foreground, network regain, and periodic background fetch; respect "Auto-sync" toggle and Drive rate limits.
- **Rate limiting:** exponential backoff on 401/403/429, batch `fields`, cache folder id, avoid redundant listings.

## 5. Screens / UX

1. **Sign in** — "Continue with Google", consent handling, inline errors, token-expiry re-auth.
2. **Vault (Home)** — list/grid, search, sort (name/date/size), filter (PDF/Photos), sync badges, import FAB; empty state.
3. **Import** — document picker, photo picker, camera; validate type/size; per-file progress.
4. **Preview** — paginated PDF, pinch/pan images; actions: share, rename, delete, keep offline.
5. **Sync Center** — per-file status, pending/failed queue, "Sync now", "Download all", storage used, Drive quota hint.
6. **Settings** — account, auto-sync toggle, cache size, "Disconnect Google", "Delete cloud vault".

Every screen covers loading, empty, success, error, and offline states with an offline banner.

## 6. Security & Privacy

- OAuth 2.0 with **PKCE**; refresh token only in SecureStore; never log tokens, file contents, paths, or URLs.
- Least-privilege scope: `drive.file` + basic profile. No full-Drive scope.
- Files live in the user's own Drive under their permissions; app holds no server secrets.
- Validate by MIME + size + magic bytes (PDF `%PDF`, image signatures); size cap 25 MB (configurable).
- App-private storage → no broad media permissions; pickers use SAF.
- "Disconnect Google" revokes tokens; "Delete cloud vault" removes folder + manifest.
- Play Store: data-safety declaration + privacy policy covering Drive access.
- Optional v2: at-rest encryption for local files (SQLCipher + encrypted blobs).

## 7. Project Structure

```
src/
  app/                 # navigation, providers, theme
  screens/             # SignIn, Vault, Preview, Sync, Settings
  components/          # FileCard, ProgressBar, EmptyState, OfflineBanner...
  features/            # files, auth, sync (hooks + logic)
  services/
    auth.ts            # Google OAuth + token refresh
    googleDrive.ts     # Drive REST v3 wrapper
    manifest.ts        # read/write/merge vault-manifest
    localFileStore.ts
    metadataDb.ts
    syncEngine.ts
  store/               # zustand stores
  utils/               # validation, sha256, retry, errors
  types/
__tests__/             # unit + component (Drive API mocked via MSW)
e2e/                   # maestro flows
```

## 8. Milestones

| Phase | Deliverable | Exit criteria |
|---|---|---|
| M0 | Scaffold RN+TS+Expo, navigation, lint/test setup | App builds; lint/tests pass |
| M1 | Local-only: import, list, PDF/image preview, rename, delete | Fully usable offline |
| M2 | Google Sign-In (PKCE), token refresh, session persist | Sign-in/out + re-auth work |
| M3 | Drive folder + manifest + upload sync | Files appear in Drive; no duplicates on re-sync |
| M4 | Download / "Download all", hashes, tombstones, conflicts | Reinstall → sign in → full restore |
| M5 | Auto/background sync, retry queue, Sync Center | Reliable across network changes + rate limits |
| M6 | Hardening: API mocks, E2E, perf, a11y, quota handling | Test matrix green; release build |
| M7 | Play Store readiness (icons, privacy policy, signing, data safety) | Internal testing track |

## 9. Testing Strategy

- **Unit:** validation, sha256, conflict resolver, manifest merge, diff/queue.
- **Component:** screens' loading/empty/error states (RNTL).
- **Integration:** Drive REST mocked (MSW) — quota errors, pagination, partial failures.
- **E2E (Maestro):** sign in with test Google account → import → sync → clear app data (reinstall simulation) → sign in → download all → preview offline.
- **Manual:** real Drive account, large PDF, flaky network, token expiry.
- **Per change:** `tsc --noEmit`, ESLint, Jest; manual Android run.

## 10. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| OAuth consent/testing config friction | Document Google Cloud setup (project, Drive API, Android client, SHA-1, consent screen, test users) |
| Refresh-token/expiry edge cases | Store refresh token in SecureStore; silent refresh; re-auth prompt on 401 |
| Drive rate limits / quota | Backoff, limited `fields`, cached folder id, usage indicator, size cap |
| User moves/renames/deletes files in Drive | Detect via listing diff; manifest tombstones; conflict copies |
| Manifest corruption | Rolling backups + schema version + rebuild from file `appProperties` |
| Polling latency (no push) | Sync on foreground/network + periodic background + manual button |
| Uninstall wipes local files (expected) | Drive is source of truth; onboarding explains restore |
| Google policy/API changes | Isolate Drive calls behind `googleDrive.ts`; track deprecations |

## 11. Open Questions (decide during build)

1. Max file size / warning threshold (default 25 MB)?
2. Thumbnails: generate on-device vs defer to v2?
3. Auto "Download all" on first sign-in, or always manual?
4. Advanced: Google Picker import from existing Drive files (Phase 2)?

## 12. Acceptance Criteria

- [ ] Import PDFs and photos; preview both fully offline.
- [ ] Files persist in app storage across restarts.
- [ ] Sign in with Google; session persists; token refresh works.
- [ ] Files auto-sync and can be synced manually.
- [ ] Files appear in the user's visible "PDF Vault" Drive folder.
- [ ] After clearing app data/reinstall: sign in lists all cloud files.
- [ ] One tap downloads all missing files; previews work offline again.
- [ ] Deletes propagate; conflicts never silently lose data.
- [ ] Only `drive.file` scope requested; no tokens/paths/contents logged.
