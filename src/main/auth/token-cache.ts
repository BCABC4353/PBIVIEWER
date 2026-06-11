import Store from 'electron-store';

interface TokenCacheSchema {
  msalCache?: string;
  userInfo?: string;
  activeHomeAccountId?: string;
}

const ENCRYPTION_KEY = 'pbiv-auth-cache-v2-2026-at-rest-obfuscation';

interface TokenStoreLike {
  get(key: keyof TokenCacheSchema): string | undefined;
  set(key: keyof TokenCacheSchema, value: string): void;
  delete(key: keyof TokenCacheSchema): void;
}

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
      clearInvalidConfig: true,
    });
    return {
      get: (key) => s.get(key),
      set: (key, value) => s.set(key, value),
      delete: (key) => s.delete(key),
    };
  } catch (error) {
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

type CorruptionListener = () => void;
const corruptionListeners = new Set<CorruptionListener>();

export const tokenCache = {
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
    store.delete('activeHomeAccountId');
  },

  async saveActiveAccountId(homeAccountId: string | null): Promise<void> {
    if (homeAccountId === null) {
      store.delete('activeHomeAccountId');
      return;
    }
    store.set('activeHomeAccountId', homeAccountId);
  },

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
