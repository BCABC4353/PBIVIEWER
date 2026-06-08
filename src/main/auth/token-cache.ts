import Store from 'electron-store';

interface TokenCacheSchema {
  msalCache?: string;
  userInfo?: string;
  // NEW-AUTH-1: the active account's homeAccountId, persisted so the chosen
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
// ACL-protected profile (%APPDATA%\powerbi-viewer) and holds a delegated,
// read-only Power BI token — the same posture as the MSAL-node default (plain
// JSON) and most Electron + MSAL apps. A future hardening can re-layer
// safeStorage ONLY where it is first verified to round-trip, so it can never
// again silently break the one feature this app exists to provide.
// ============================================================================
const ENCRYPTION_KEY = 'pbiv-auth-cache-v2-2026-at-rest-obfuscation';

const store = new Store<TokenCacheSchema>({
  name: 'powerbi-viewer-auth',
  encryptionKey: ENCRYPTION_KEY,
  // If the on-disk file can't be read (e.g. it was written by the older
  // safeStorage build, or got truncated by a crash/AV), reset it instead of
  // throwing at main-process load. The user re-signs-in once; from then on the
  // keyed cache persists across restarts.
  clearInvalidConfig: true,
});

export interface CachedUserInfo {
  homeAccountId: string;
  displayName: string;
  email: string;
}

// Retained for API compatibility with auth-service (PersistentCachePort).
// The old per-value safeStorage decrypt-corruption path is gone (encryptionKey +
// clearInvalidConfig handle a bad file by resetting it), so this never fires now
// — but the registration seam stays so callers (auth-service constructor) are
// unchanged.
type CorruptionListener = () => void;
const corruptionListeners = new Set<CorruptionListener>();

export const tokenCache = {
  /**
   * BEH-B2: register a corruption hook. Retained for API compatibility; with the
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
    // NEW-AUTH-1: the chosen active account is meaningless without a cache to
    // back it; clear it in lockstep so a restart after logout starts clean.
    store.delete('activeHomeAccountId');
  },

  /**
   * NEW-AUTH-1: persist the active account's homeAccountId. Passing null clears it.
   */
  async saveActiveAccountId(homeAccountId: string | null): Promise<void> {
    if (homeAccountId === null) {
      store.delete('activeHomeAccountId');
      return;
    }
    store.set('activeHomeAccountId', homeAccountId);
  },

  /**
   * NEW-AUTH-1: load the persisted active account id, or null if unset.
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
