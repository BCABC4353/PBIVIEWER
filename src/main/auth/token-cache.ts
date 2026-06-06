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
    return '';
  }
}

export const tokenCache = {
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
