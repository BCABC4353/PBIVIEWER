import Store from 'electron-store';

interface TokenCacheSchema {
  msalCache?: string;
  userInfo?: string;
  // The active account's homeAccountId, persisted so the chosen
  // account survives restart.
  activeHomeAccountId?: string;
}

// ============================================================================
// PERSISTENCE FIX (the app's primary function: "sign in once, never again")
// ----------------------------------------------------------------------------
// This cache previously encrypted entries with Electron `safeStorage` (Windows
// DPAPI). DPAPI is bound to the OS user + machine session, so on ROAMING
// PROFILES / FSLogix / VDI / non-persistent corporate desktops — common in
// managed M365 orgs — the blob written in one session could NOT be decrypted in
// the next. The old decrypt() then treated that as corruption and WIPED the
// cache, forcing the user to sign in again on EVERY launch. safeStorage also
// hard-fails outright wherever isEncryptionAvailable() is false, with the same
// result. Either way the refresh token never survived a restart.
//
// electron-store's built-in `encryptionKey` (AES-256) round-trips on ANY machine
// regardless of profile/DPAPI state, so persistence now actually holds.
//
// SECURITY NOTE: the key below is embedded in the app, so this is OBFUSCATION at
// rest, not OS-level encryption. The cache file lives in the user's own
// ACL-protected profile (%APPDATA%\powerbi-viewer) and holds the MSAL token
// cache — including a delegated Power BI REFRESH token (offline_access is
// requested for the "sign in once" UX), not merely a short-lived access token —
// the same posture as the MSAL-node default (plain JSON) and most Electron +
// MSAL apps. A future hardening can re-layer safeStorage ONLY where it is first
// verified to round-trip, so it can never again silently break the one feature
// this app exists to provide.
// ============================================================================
const ENCRYPTION_KEY = 'pbiv-auth-cache-v2-2026-at-rest-obfuscation';

// Narrow store interface — only the get/set/delete this module uses. Both the
// real electron-store and the in-memory fallback satisfy it.
interface TokenStoreLike {
  get(key: keyof TokenCacheSchema): string | undefined;
  set(key: keyof TokenCacheSchema, value: string): void;
  delete(key: keyof TokenCacheSchema): void;
}

// In-memory fallback used ONLY if the on-disk store cannot even be constructed
// (e.g. a locked file / EPERM on a roaming or VDI profile during a transient
// profile-mount race). Degrades to "re-sign-in this session" instead of letting
// the constructor throw escape module load and leave the app with no window.
function createMemoryTokenStore(): TokenStoreLike {
  const mem = new Map<string, string>();
  return {
    get: (key) => mem.get(key),
    set: (key, value) => void mem.set(key, value),
    delete: (key) => void mem.delete(key),
  };
}

function createTokenStore(): TokenStoreLike {
  try {
    const s = new Store<TokenCacheSchema>({
      name: 'powerbi-viewer-auth',
      encryptionKey: ENCRYPTION_KEY,
      // clearInvalidConfig resets the file ONLY when conf can't parse it as JSON
      // (truncation / corruption). It does NOT cover a file written by the OLDER
      // safeStorage build: that file is valid JSON whose values are base64 blobs,
      // so conf reads it fine and MSAL's deserialize throws on the non-MSAL
      // string — auth-service.initializeCache catches that and purges the stale
      // cache once (the user re-signs in). The keyed cache then persists.
      clearInvalidConfig: true,
    });
    return {
      get: (key) => s.get(key),
      set: (key, value) => s.set(key, value),
      delete: (key) => s.delete(key),
    };
  } catch (error) {
    // Construction itself can throw (locked / unreadable file). Fall back to an
    // in-memory store rather than crashing startup with no recoverable path.
    console.warn('[TokenCache] Failed to open auth store; using in-memory fallback (re-sign-in this session):', error);
    return createMemoryTokenStore();
  }
}

const store: TokenStoreLike = createTokenStore();

export interface CachedUserInfo {
  homeAccountId: string;
  displayName: string;
  email: string;
}

// Retained for API compatibility with auth-service (PersistentCachePort).
// The old per-value safeStorage decrypt-corruption path is gone; a bad file is
// either reset by clearInvalidConfig (unparseable JSON) or handled by
// auth-service.initializeCache (a legacy / again-unreadable cache is purged
// once), so this hook never fires now — but the registration seam stays so
// callers (the auth-service constructor) are unchanged.
type CorruptionListener = () => void;
const corruptionListeners = new Set<CorruptionListener>();

export const tokenCache = {
  /**
   * Register a corruption hook. Retained for API compatibility; with the
   * encryptionKey-backed store a bad file is reset (not surfaced per-entry), so
   * this is effectively a no-op now. Returns an unsubscribe function.
   */
  onCorruption(listener: CorruptionListener): () => void {
    corruptionListeners.add(listener);
    return () => corruptionListeners.delete(listener);
  },

  async saveCache(cache: string): Promise<void> {
    store.set('msalCache', cache);
  },

  async loadCache(): Promise<string | null> {
    return store.get('msalCache') ?? null;
  },

  async clearCache(): Promise<void> {
    store.delete('msalCache');
    store.delete('userInfo');
    // The chosen active account is meaningless without a cache to
    // back it; clear it in lockstep so a restart after logout starts clean.
    store.delete('activeHomeAccountId');
  },

  /**
   * Persist the active account's homeAccountId. Passing null clears it.
   */
  async saveActiveAccountId(homeAccountId: string | null): Promise<void> {
    if (homeAccountId === null) {
      store.delete('activeHomeAccountId');
      return;
    }
    store.set('activeHomeAccountId', homeAccountId);
  },

  /**
   * Load the persisted active account id, or null if unset.
   */
  async loadActiveAccountId(): Promise<string | null> {
    return store.get('activeHomeAccountId') ?? null;
  },

  async saveUserInfo(userInfo: CachedUserInfo): Promise<void> {
    store.set('userInfo', JSON.stringify(userInfo));
  },

  async loadUserInfo(): Promise<CachedUserInfo | null> {
    const raw = store.get('userInfo');
    if (!raw) return null;
    try {
      return JSON.parse(raw) as CachedUserInfo;
    } catch (error) {
      console.warn('[TokenCache] Failed to parse user info:', error);
      return null;
    }
  },
};
