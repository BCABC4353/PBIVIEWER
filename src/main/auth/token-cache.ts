import Store from 'electron-store';
import { safeStorage } from 'electron';

interface TokenCacheSchema {
  msalCache: string;
  userInfo: string;
}

// Note: We don't use electron-store's encryptionKey because the actual sensitive
// data (tokens, user info) is encrypted via Electron's safeStorage API before
// being stored. This provides OS-level encryption that's unique per machine.
const store = new Store<TokenCacheSchema>({
  name: 'powerbi-viewer-auth',
});

export interface CachedUserInfo {
  homeAccountId: string;
  displayName: string;
  email: string;
}

// BEH-B2: corruption hooks. When decrypt() detects an undecryptable (corrupt or
// key-rotated) entry it purges the store AND notifies every registered listener
// so higher layers (auth-service) can null their in-memory account/expiry rather
// than continuing to trust a now-empty cache. Honesty over silent recovery: a
// corrupted cache must not leave validateToken() returning a stale `true`.
type CorruptionListener = () => void;
const corruptionListeners = new Set<CorruptionListener>();

function notifyCorruption(): void {
  for (const listener of corruptionListeners) {
    try {
      listener();
    } catch (err) {
      console.error('[TokenCache] Corruption listener threw:', err);
    }
  }
}

function encrypt(value: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS-level encryption unavailable — refusing to store tokens in plaintext');
  }
  const encrypted = safeStorage.encryptString(value);
  return encrypted.toString('base64');
}

function decrypt(value: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS-level encryption unavailable');
  }
  try {
    const buffer = Buffer.from(value, 'base64');
    return safeStorage.decryptString(buffer);
  } catch (error) {
    console.error('[TokenCache] Failed to decrypt, clearing corrupted entry:', error);
    store.delete('msalCache');
    store.delete('userInfo');
    // BEH-B2: tell listeners the cache is gone so they don't keep trusting an
    // in-memory account/expiry that the (now-purged) cache can no longer back.
    notifyCorruption();
    return '';
  }
}

export const tokenCache = {
  /**
   * BEH-B2: register a corruption hook. Fired after decrypt() purges an
   * undecryptable entry. Returns an unsubscribe function. Idempotent —
   * registering the same listener twice is a no-op (Set semantics).
   */
  onCorruption(listener: CorruptionListener): () => void {
    corruptionListeners.add(listener);
    return () => corruptionListeners.delete(listener);
  },

  async saveCache(cache: string): Promise<void> {
    const encrypted = encrypt(cache);
    store.set('msalCache', encrypted);
  },

  async loadCache(): Promise<string | null> {
    const encrypted = store.get('msalCache');
    if (!encrypted) return null;
    return decrypt(encrypted);
  },

  async clearCache(): Promise<void> {
    store.delete('msalCache');
    store.delete('userInfo');
  },

  async saveUserInfo(userInfo: CachedUserInfo): Promise<void> {
    const encrypted = encrypt(JSON.stringify(userInfo));
    store.set('userInfo', encrypted);
  },

  async loadUserInfo(): Promise<CachedUserInfo | null> {
    const encrypted = store.get('userInfo');
    if (!encrypted) return null;
    try {
      const decrypted = decrypt(encrypted);
      return JSON.parse(decrypted);
    } catch (error) {
      console.warn('[TokenCache] Failed to load user info:', error);
      return null;
    }
  },
};
