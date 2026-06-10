import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// In-memory electron-store stub. token-cache.ts relies on electron-store's
// built-in encryptionKey (no Electron safeStorage), so only electron-store needs
// mocking — the stub ignores the constructor options (name/encryptionKey/
// clearInvalidConfig) and just backs get/set/delete with a Map.
// ---------------------------------------------------------------------------
const backing = new Map<string, string>();

vi.mock('electron-store', () => {
  return {
    default: class {
      get(key: string): string | undefined {
        return backing.get(key);
      }
      set(key: string, value: string): void {
        backing.set(key, value);
      }
      delete(key: string): void {
        backing.delete(key);
      }
    },
  };
});

import { tokenCache } from './token-cache';

beforeEach(() => {
  backing.clear();
  vi.clearAllMocks();
});

describe('token-cache persistence (encryptionKey-backed, DPAPI-independent)', () => {
  it('round-trips the serialized MSAL cache across save/load', async () => {
    await tokenCache.saveCache('serialized-msal-cache');
    expect(await tokenCache.loadCache()).toBe('serialized-msal-cache');
  });

  it('returns null when no cache has been stored', async () => {
    expect(await tokenCache.loadCache()).toBeNull();
  });

  it('round-trips user info and tolerates corrupt JSON', async () => {
    await tokenCache.saveUserInfo({ homeAccountId: 'acct-1', displayName: 'Tester', email: 'e@x.com' });
    expect(await tokenCache.loadUserInfo()).toEqual({
      homeAccountId: 'acct-1',
      displayName: 'Tester',
      email: 'e@x.com',
    });
    // A truncated/garbage value must not throw — it resolves to null.
    backing.set('userInfo', '{ not valid json');
    expect(await tokenCache.loadUserInfo()).toBeNull();
  });

  it('round-trips the active account id and clears it on null', async () => {
    await tokenCache.saveActiveAccountId('acct-1');
    expect(await tokenCache.loadActiveAccountId()).toBe('acct-1');
    await tokenCache.saveActiveAccountId(null);
    expect(await tokenCache.loadActiveAccountId()).toBeNull();
    expect(backing.has('activeHomeAccountId')).toBe(false);
  });

  it('clearCache removes the MSAL cache, user info, and active account id together', async () => {
    await tokenCache.saveCache('cache');
    await tokenCache.saveUserInfo({ homeAccountId: 'a', displayName: 'd', email: 'e' });
    await tokenCache.saveActiveAccountId('a');
    expect(backing.size).toBe(3);

    await tokenCache.clearCache();

    expect(backing.has('msalCache')).toBe(false);
    expect(backing.has('userInfo')).toBe(false);
    expect(backing.has('activeHomeAccountId')).toBe(false);
  });

  it('onCorruption registers and unsubscribes without throwing (compat shim)', () => {
    const listener = vi.fn();
    const unsub = tokenCache.onCorruption(listener);
    expect(typeof unsub).toBe('function');
    expect(() => unsub()).not.toThrow();
  });
});
