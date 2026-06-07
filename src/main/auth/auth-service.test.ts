import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InteractionRequiredAuthError, type AccountInfo } from '@azure/msal-node';

// ARCH-B4: msal-config pulls in electron-log/main at module load. Stub the
// electron surface so importing auth-service under jsdom never touches real
// electron internals. The DI factory (createAuthService) means the SERVICE
// itself needs none of this — but the module-level `import` of msal-config
// (for loginRequest/silentRequest scopes) transitively loads electron-log.
vi.mock('electron', () => ({
  BrowserWindow: class {},
  session: {
    defaultSession: { clearStorageData: vi.fn().mockResolvedValue(undefined) },
    fromPartition: vi.fn(() => ({ clearStorageData: vi.fn().mockResolvedValue(undefined) })),
  },
  shell: { openExternal: vi.fn().mockResolvedValue(undefined) },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(s, 'utf-8'),
    decryptString: (b: Buffer) => b.toString('utf-8'),
  },
  app: { getPath: () => '/tmp', getVersion: () => '0.0.0-test' },
}));

import {
  createAuthService,
  type AuthServiceDeps,
  type MsalClientPort,
  type TokenCachePort,
  type PersistentCachePort,
  type CookieJarPort,
} from './auth-service';
import type { CachedUserInfo } from './token-cache';

// ---------------------------------------------------------------------------
// Test harness: a fully in-memory dependency set with knobs for each test.
// ---------------------------------------------------------------------------

function makeAccount(homeAccountId: string, username = 'user@example.com'): AccountInfo {
  return {
    homeAccountId,
    environment: 'login.microsoftonline.com',
    tenantId: 'tenant',
    username,
    localAccountId: homeAccountId,
    name: 'Test User',
  } as AccountInfo;
}

interface Harness {
  deps: AuthServiceDeps;
  accounts: AccountInfo[];
  corruptionListeners: Array<() => void>;
  cookieClearCalls: Array<{ jar: 'a' | 'b' }>;
  clearedUsageAccounts: string[];
  // mutable knobs
  setSilentResult: (r: { accessToken: string; expiresOn: Date | null } | Error) => void;
  setUsagePolicy: (p: 'always' | 'never' | 'on-shared-machine') => void;
  setJarBFails: (fails: boolean) => void;
  persisted: { cache: string | null; userInfo: CachedUserInfo | null };
  openAuthResult: { value: { code: string; state: string } | null; aadError?: string };
}

function createHarness(initial: { accounts?: AccountInfo[] } = {}): Harness {
  const accounts: AccountInfo[] = initial.accounts ? [...initial.accounts] : [];
  const corruptionListeners: Array<() => void> = [];
  const cookieClearCalls: Array<{ jar: 'a' | 'b' }> = [];
  const clearedUsageAccounts: string[] = [];
  const persisted: { cache: string | null; userInfo: CachedUserInfo | null } = {
    cache: null,
    userInfo: null,
  };

  let silentResult: { accessToken: string; expiresOn: Date | null } | Error = new Error('not configured');
  let usagePolicy: 'always' | 'never' | 'on-shared-machine' = 'never';
  let jarBFails = false;
  const openAuthResult: Harness['openAuthResult'] = { value: null };

  const tokenCache: TokenCachePort = {
    getAllAccounts: vi.fn(async () => [...accounts]),
    removeAccount: vi.fn(async (acct: AccountInfo) => {
      const i = accounts.findIndex((a) => a.homeAccountId === acct.homeAccountId);
      if (i >= 0) accounts.splice(i, 1);
    }),
    serialize: vi.fn(() => 'serialized-cache'),
    deserialize: vi.fn(),
  };

  const msalClient: MsalClientPort = {
    getTokenCache: () => tokenCache,
    getAuthCodeUrl: vi.fn(async () => 'https://login.microsoftonline.com/authorize'),
    acquireTokenByCode: vi.fn(async () => {
      const acct = makeAccount('acct-1');
      // Simulate MSAL adding the account to the cache on a successful code exchange.
      if (!accounts.find((a) => a.homeAccountId === acct.homeAccountId)) accounts.push(acct);
      return { accessToken: 'at', expiresOn: new Date(Date.now() + 3_600_000), account: acct };
    }),
    acquireTokenSilent: vi.fn(async () => {
      if (silentResult instanceof Error) throw silentResult;
      return silentResult;
    }),
  };

  const persistentCache: PersistentCachePort = {
    saveCache: vi.fn(async (c: string) => {
      persisted.cache = c;
    }),
    loadCache: vi.fn(async () => persisted.cache),
    clearCache: vi.fn(async () => {
      persisted.cache = null;
      persisted.userInfo = null;
    }),
    saveUserInfo: vi.fn(async (u: CachedUserInfo) => {
      persisted.userInfo = u;
    }),
    loadUserInfo: vi.fn(async () => persisted.userInfo),
    onCorruption: vi.fn((listener: () => void) => {
      corruptionListeners.push(listener);
      return () => {
        const i = corruptionListeners.indexOf(listener);
        if (i >= 0) corruptionListeners.splice(i, 1);
      };
    }),
  };

  const jarA: CookieJarPort = {
    clearStorageData: vi.fn(async () => {
      cookieClearCalls.push({ jar: 'a' });
    }),
  };
  const jarB: CookieJarPort = {
    clearStorageData: vi.fn(async () => {
      cookieClearCalls.push({ jar: 'b' });
      if (jarBFails) throw new Error('jar B clear failed');
    }),
  };

  const deps: AuthServiceDeps = {
    msalClient,
    cryptoProvider: {
      generatePkceCodes: vi.fn(async () => ({ verifier: 'v', challenge: 'c' })),
    },
    persistentCache,
    getCookieJars: () => [jarA, jarB],
    openAuthWindow: vi.fn(async (_url, state, onAadError) => {
      if (openAuthResult.aadError) {
        onAadError(openAuthResult.aadError);
        return null;
      }
      // Default: echo the expected state so CSRF passes.
      if (openAuthResult.value === null) return { code: 'authcode', state };
      return openAuthResult.value;
    }),
    getUsageClearOnLogout: () => usagePolicy,
    clearUsageForAccount: (id) => clearedUsageAccounts.push(id),
    logger: { warn: vi.fn(), error: vi.fn() },
  };

  return {
    deps,
    accounts,
    corruptionListeners,
    cookieClearCalls,
    clearedUsageAccounts,
    setSilentResult: (r) => {
      silentResult = r;
    },
    setUsagePolicy: (p) => {
      usagePolicy = p;
    },
    setJarBFails: (f) => {
      jarBFails = f;
    },
    persisted,
    openAuthResult,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// validateToken short-circuit honesty (existing intent, now actually running)
// ---------------------------------------------------------------------------
describe('authService.validateToken (cache short-circuit)', () => {
  it('returns { success: true, data: false } on a fresh service with no account', async () => {
    const h = createHarness();
    const svc = createAuthService(h.deps);
    const result = await svc.validateToken();
    expect(result).toEqual({ success: true, data: false });
  });

  it('does not throw on repeat invocation', async () => {
    const h = createHarness();
    const svc = createAuthService(h.deps);
    await expect(svc.validateToken()).resolves.toBeTruthy();
    await expect(svc.validateToken()).resolves.toBeTruthy();
  });

  it('short-circuits to true only for the CURRENT account expiry (NEW-AUTH-3)', async () => {
    const h = createHarness({ accounts: [makeAccount('acct-1')] });
    const svc = createAuthService(h.deps);
    // Prime lastKnownExpiry for acct-1 via a successful getAccessToken.
    h.setSilentResult({ accessToken: 'at', expiresOn: new Date(Date.now() + 30 * 60 * 1000) });
    const first = await svc.getAccessToken();
    expect(first.success).toBe(true);
    // Now validateToken should short-circuit (account === acct-1, expiry far off).
    const validated = await svc.validateToken();
    expect(validated).toEqual({ success: true, data: true });
    // acquireTokenSilent must NOT be called a second time (short-circuit hit).
    expect(h.deps.msalClient.acquireTokenSilent).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// SEC-S4 + getAccessToken expiry lifecycle (now ACTIVE with a real msal fake)
// ---------------------------------------------------------------------------
describe('authService.getAccessToken (SEC-S4: InteractionRequired drops expiry)', () => {
  it('returns NO_ACCOUNT and leaves no cached expiry on a fresh service', async () => {
    const h = createHarness();
    const svc = createAuthService(h.deps);
    const result = await svc.getAccessToken();
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('NO_ACCOUNT');
    // validateToken must still report false (no stale expiry leaked through).
    await expect(svc.validateToken()).resolves.toEqual({ success: true, data: false });
  });

  it('drops the account expiry when InteractionRequired is thrown (SEC-S4 assertion)', async () => {
    const h = createHarness({ accounts: [makeAccount('acct-1')] });
    const svc = createAuthService(h.deps);

    // First, a good acquisition primes lastKnownExpiry far in the future.
    h.setSilentResult({ accessToken: 'at', expiresOn: new Date(Date.now() + 60 * 60 * 1000) });
    await svc.getAccessToken();
    // Sanity: short-circuit now active.
    await expect(svc.validateToken()).resolves.toEqual({ success: true, data: true });

    // Now silent acquisition starts failing with InteractionRequired.
    h.setSilentResult(new InteractionRequiredAuthError('interaction_required'));
    const r = await svc.getAccessToken();
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.code).toBe('INTERACTION_REQUIRED');

    // SEC-S4 live assertion: the cached expiry for this account is gone, so
    // validateToken can no longer short-circuit to a stale `true`. It falls
    // through to getAccessToken, which now returns INTERACTION_REQUIRED → false.
    const validated = await svc.validateToken();
    expect(validated).toEqual({ success: true, data: false });
  });
});

// ---------------------------------------------------------------------------
// BEH-B2: token-cache corruption honesty
// ---------------------------------------------------------------------------
describe('BEH-B2: corruption invalidates in-memory auth state', () => {
  it('registers a corruption hook on construction', () => {
    const h = createHarness();
    createAuthService(h.deps);
    expect(h.deps.persistentCache.onCorruption).toHaveBeenCalledTimes(1);
    expect(h.corruptionListeners).toHaveLength(1);
  });

  it('validateToken returns false after a forced corruption (was short-circuiting true)', async () => {
    const h = createHarness({ accounts: [makeAccount('acct-1')] });
    const svc = createAuthService(h.deps);
    h.setSilentResult({ accessToken: 'at', expiresOn: new Date(Date.now() + 60 * 60 * 1000) });
    await svc.getAccessToken();
    await expect(svc.validateToken()).resolves.toEqual({ success: true, data: true });

    // Simulate the persistent cache detecting corruption and purging itself.
    h.accounts.length = 0; // cache is gone
    h.persisted.cache = null;
    h.corruptionListeners.forEach((fn) => fn());

    // After corruption, the account + expiry are nulled, so validateToken must
    // NOT lie — it falls through to getAccessToken which now finds NO_ACCOUNT.
    const validated = await svc.validateToken();
    expect(validated).toEqual({ success: true, data: false });
  });

  it('invalidateCache() nulls account so getCurrentUser falls back to persisted info', async () => {
    const h = createHarness({ accounts: [makeAccount('acct-1')] });
    const svc = createAuthService(h.deps);
    h.setSilentResult({ accessToken: 'at', expiresOn: new Date(Date.now() + 60 * 60 * 1000) });
    await svc.getAccessToken(); // hydrates this.account

    svc.invalidateCache();
    // No persisted userInfo → getCurrentUser returns null (account was nulled).
    await expect(svc.getCurrentUser()).resolves.toEqual({ success: true, data: null });
  });
});

// ---------------------------------------------------------------------------
// NEW-AUTH-2: isAuthenticated non-mutating + initializeCache idempotent
// ---------------------------------------------------------------------------
describe('NEW-AUTH-2: non-mutating reads, idempotent cache init', () => {
  it('initializeCache() deserializes at most once across many reads', async () => {
    const h = createHarness({ accounts: [makeAccount('acct-1')] });
    h.persisted.cache = 'serialized-cache';
    const svc = createAuthService(h.deps);

    await svc.isAuthenticated();
    await svc.isAuthenticated();
    await svc.getAccessToken();

    // deserialize is the side-effecting step in initializeCache; it must run once.
    expect(h.deps.msalClient.getTokenCache().deserialize).toHaveBeenCalledTimes(1);
  });

  it('isAuthenticated reflects account existence without throwing', async () => {
    const h = createHarness({ accounts: [makeAccount('acct-1')] });
    const svc = createAuthService(h.deps);
    await expect(svc.isAuthenticated()).resolves.toEqual({ success: true, data: true });

    const empty = createAuthService(createHarness().deps);
    await expect(empty.isAuthenticated()).resolves.toEqual({ success: true, data: false });
  });
});

// ---------------------------------------------------------------------------
// BEH-B1: logout cookie symmetry + reusedPreviousAccount + proactive sweep
// ---------------------------------------------------------------------------
describe('BEH-B1: logout cookie clearing is sequential and fail-loud', () => {
  it('clears cookie jars sequentially (jar a then jar b), not via allSettled', async () => {
    const h = createHarness({ accounts: [makeAccount('acct-1')] });
    const svc = createAuthService(h.deps);
    const result = await svc.logout();
    expect(result.success).toBe(true);
    expect(h.cookieClearCalls).toEqual([{ jar: 'a' }, { jar: 'b' }]);
  });

  it('fails loud (LOGOUT_FAILED) when a cookie jar clear throws', async () => {
    const h = createHarness({ accounts: [makeAccount('acct-1')] });
    h.setJarBFails(true);
    const svc = createAuthService(h.deps);
    const result = await svc.logout();
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('LOGOUT_FAILED');
  });

  it('honors usageClearOnLogout=always by wiping the account usage', async () => {
    const h = createHarness({ accounts: [makeAccount('acct-1')] });
    h.persisted.userInfo = { homeAccountId: 'acct-1', displayName: 'T', email: 'e' };
    h.setUsagePolicy('always');
    const svc = createAuthService(h.deps);
    await svc.logout();
    expect(h.clearedUsageAccounts).toEqual(['acct-1']);
  });

  it('keeps usage when usageClearOnLogout=never', async () => {
    const h = createHarness({ accounts: [makeAccount('acct-1')] });
    h.persisted.userInfo = { homeAccountId: 'acct-1', displayName: 'T', email: 'e' };
    h.setUsagePolicy('never');
    const svc = createAuthService(h.deps);
    await svc.logout();
    expect(h.clearedUsageAccounts).toEqual([]);
  });
});

describe('BEH-B1: proactive pre-login sweep + reusedPreviousAccount', () => {
  it('sweeps partition cookies before opening the auth window when signed out', async () => {
    const h = createHarness(); // no accounts, no pending state
    const svc = createAuthService(h.deps);
    await svc.login();
    // The proactive sweep ran (both jars cleared) BEFORE the auth-code exchange.
    expect(h.cookieClearCalls).toEqual([{ jar: 'a' }, { jar: 'b' }]);
  });

  it('does NOT sweep when an account already exists', async () => {
    const h = createHarness({ accounts: [makeAccount('acct-1')] });
    const svc = createAuthService(h.deps);
    // Force hydration of this.account first.
    h.setSilentResult({ accessToken: 'at', expiresOn: new Date(Date.now() + 60 * 60 * 1000) });
    await svc.getAccessToken();
    h.cookieClearCalls.length = 0;
    await svc.login();
    expect(h.cookieClearCalls).toEqual([]);
  });

  it('reports reusedPreviousAccount=false on a first-ever login', async () => {
    const h = createHarness();
    const svc = createAuthService(h.deps);
    const result = await svc.login();
    // Narrow to the success-data variant; fails loudly if login regressed.
    expect(result.success && result.data.success).toBe(true);
    if (result.success && result.data.success) {
      expect(result.data.reusedPreviousAccount).toBe(false);
    }
  });

  it('reports reusedPreviousAccount=true when the same account signs back in', async () => {
    const h = createHarness();
    // Persisted user info from a prior session for the SAME account acquireTokenByCode returns.
    h.persisted.userInfo = { homeAccountId: 'acct-1', displayName: 'T', email: 'e' };
    const svc = createAuthService(h.deps);
    const result = await svc.login();
    expect(result.success && result.data.success).toBe(true);
    if (result.success && result.data.success) {
      expect(result.data.reusedPreviousAccount).toBe(true);
    }
  });

  it('reports reusedPreviousAccount=false when a DIFFERENT account signs in', async () => {
    const h = createHarness();
    h.persisted.userInfo = { homeAccountId: 'other-account', displayName: 'O', email: 'o' };
    const svc = createAuthService(h.deps);
    const result = await svc.login(); // acquireTokenByCode returns acct-1
    expect(result.success && result.data.success).toBe(true);
    if (result.success && result.data.success) {
      expect(result.data.reusedPreviousAccount).toBe(false);
    }
  });
});
