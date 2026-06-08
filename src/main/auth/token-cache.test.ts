import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// In-memory electron-store + safeStorage stubs.
// token-cache.ts constructs a Store at module load and encrypts via safeStorage,
// so both must be mocked before the module is imported. `decryptString` is made
// to throw on demand to exercise the corruption path (FIX-4 / G3 residual).
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

let decryptShouldThrow = false;

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(s, 'utf-8'),
    decryptString: (b: Buffer) => {
      if (decryptShouldThrow) throw new Error('corrupt');
      return b.toString('utf-8');
    },
  },
}));

import { tokenCache } from './token-cache';

beforeEach(() => {
  backing.clear();
  decryptShouldThrow = false;
  vi.clearAllMocks();
});

describe('token-cache decrypt() corruption cleanup (FIX-4 / G3 residual)', () => {
  it('deletes activeHomeAccountId (not just msalCache/userInfo) on corruption', async () => {
    // Seed all three persisted entries as if a real session had been stored.
    await tokenCache.saveCache('serialized');
    await tokenCache.saveUserInfo({ homeAccountId: 'acct-1', displayName: 'T', email: 'e' });
    await tokenCache.saveActiveAccountId('acct-1');
    expect(backing.has('msalCache')).toBe(true);
    expect(backing.has('userInfo')).toBe(true);
    expect(backing.has('activeHomeAccountId')).toBe(true);

    // Now decryption starts failing — the next load triggers the corruption path.
    decryptShouldThrow = true;
    const loaded = await tokenCache.loadCache();
    expect(loaded).toBe('');

    // FIX-4: the corrupt active id is purged in lockstep, so it cannot re-fire
    // the corruption path on every subsequent startup.
    expect(backing.has('msalCache')).toBe(false);
    expect(backing.has('userInfo')).toBe(false);
    expect(backing.has('activeHomeAccountId')).toBe(false);
  });

  it('fires corruption listeners when decrypt fails', async () => {
    await tokenCache.saveCache('serialized');
    const listener = vi.fn();
    const unsub = tokenCache.onCorruption(listener);
    decryptShouldThrow = true;
    await tokenCache.loadCache();
    expect(listener).toHaveBeenCalledTimes(1);
    unsub();
  });

  it('does not delete the active id on a successful decrypt', async () => {
    await tokenCache.saveActiveAccountId('acct-1');
    const id = await tokenCache.loadActiveAccountId();
    expect(id).toBe('acct-1');
    expect(backing.has('activeHomeAccountId')).toBe(true);
  });
});
