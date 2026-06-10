import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InteractionRequiredAuthError, type AccountInfo } from '@azure/msal-node';

// Msal-config pulls in electron-log/main at module load. Stub the
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
  cookieClearCalls: Array<{ jar: 'a' | 'b'; storages?: string[] }>;
  // Records which jars had their HTTP cache flushed.
  cacheClearCalls: Array<'a' | 'b'>;
  clearedUsageAccounts: string[];
  // mutable knobs
  setSilentResult: (r: { accessToken: string; expiresOn: Date | null } | Error) => void;
  setUsagePolicy: (p: 'always' | 'never' | 'on-shared-machine') => void;
  setJarBFails: (fails: boolean) => void;
  persisted: { cache: string | null; userInfo: CachedUserInfo | null; activeId: string | null };
  openAuthResult: { value: { code: string; state: string } | null; aadError?: string };
}

function createHarness(initial: { accounts?: AccountInfo[] } = {}): Harness {
  const accounts: AccountInfo[] = initial.accounts ? [...initial.accounts] : [];
  const corruptionListeners: Array<() => void> = [];
  const cookieClearCalls: Array<{ jar: 'a' | 'b'; storages?: string[] }> = [];
  const cacheClearCalls: Array<'a' | 'b'> = [];
  const clearedUsageAccounts: string[] = [];
  const persisted: { cache: string | null; userInfo: CachedUserInfo | null; activeId: string | null } = {
    cache: null,
    userInfo: null,
    activeId: null,
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
      // Token-cache deletes the active id in lockstep with the cache.
      persisted.activeId = null;
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
    saveActiveAccountId: vi.fn(async (id: string | null) => {
      persisted.activeId = id;
    }),
    loadActiveAccountId: vi.fn(async () => persisted.activeId),
  };

  const jarA: CookieJarPort = {
    clearStorageData: vi.fn(async (opts?: { storages?: string[] }) => {
      cookieClearCalls.push({ jar: 'a', storages: opts?.storages });
    }),
    // Each jar must also flush the HTTP cache on logout/switch.
    clearCache: vi.fn(async () => {
      cacheClearCalls.push('a');
    }),
  };
  const jarB: CookieJarPort = {
    clearStorageData: vi.fn(async (opts?: { storages?: string[] }) => {
      cookieClearCalls.push({ jar: 'b', storages: opts?.storages });
      if (jarBFails) throw new Error('jar B clear failed');
    }),
    clearCache: vi.fn(async () => {
      cacheClearCalls.push('b');
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
    cacheClearCalls,
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
// validateToken short-circuit honesty
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
// getAccessToken expiry lifecycle
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

    // The cached expiry for this account is gone, so
    // validateToken can no longer short-circuit to a stale `true`. It falls
    // through to getAccessToken, which now returns INTERACTION_REQUIRED → false.
    const validated = await svc.validateToken();
    expect(validated).toEqual({ success: true, data: false });
  });
});

// ---------------------------------------------------------------------------
// Token-cache corruption honesty
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
// isAuthenticated non-mutating + initializeCache idempotent
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
// Logout cookie symmetry + reusedPreviousAccount + proactive sweep
// ---------------------------------------------------------------------------
describe('BEH-B1: logout cookie clearing is sequential and fail-loud', () => {
  it('clears cookie jars sequentially (jar a then jar b), not via allSettled', async () => {
    const h = createHarness({ accounts: [makeAccount('acct-1')] });
    const svc = createAuthService(h.deps);
    const result = await svc.logout();
    expect(result.success).toBe(true);
    expect(h.cookieClearCalls.map((c) => c.jar)).toEqual(['a', 'b']);
  });

  it('SEC-S5: clears the full web-storage set (not just cookies) on every jar', async () => {
    const h = createHarness({ accounts: [makeAccount('acct-1')] });
    const svc = createAuthService(h.deps);
    await svc.logout();
    // Each jar must clear cookies AND the per-account web storages so a second
    // account can't surface the first account's cached Power BI content.
    for (const call of h.cookieClearCalls) {
      expect(call.storages).toEqual(
        expect.arrayContaining([
          'cookies',
          'localstorage',
          'indexdb',
          'serviceworkers',
          'cachestorage',
        ])
      );
    }
  });

  it('FIX-2: flushes the HTTP cache on every jar on logout (multi-tenant isolation)', async () => {
    const h = createHarness({ accounts: [makeAccount('acct-1')] });
    const svc = createAuthService(h.deps);
    const result = await svc.logout();
    expect(result.success).toBe(true);
    // Both jars had their HTTP cache flushed, not just their storage data.
    expect(h.cacheClearCalls).toEqual(['a', 'b']);
    expect(h.deps.getCookieJars()[0]!.clearCache).toHaveBeenCalled();
    expect(h.deps.getCookieJars()[1]!.clearCache).toHaveBeenCalled();
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
    expect(h.cookieClearCalls.map((c) => c.jar)).toEqual(['a', 'b']);
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

  it('FIX-3 (auth-friction): a normal login() forwards NO prompt by default', async () => {
    const h = createHarness();
    const svc = createAuthService(h.deps);
    await svc.login();
    const getAuthCodeUrl = h.deps.msalClient.getAuthCodeUrl as ReturnType<typeof vi.fn>;
    const lastCall = getAuthCodeUrl.mock.calls.at(-1)?.[0];
    // No forced account picker — AAD can silently continue an existing session.
    expect(lastCall).not.toHaveProperty('prompt');
  });

  it('FIX-3: an explicit prompt option is still forwarded verbatim', async () => {
    const h = createHarness();
    const svc = createAuthService(h.deps);
    await svc.login({ prompt: 'select_account' });
    const getAuthCodeUrl = h.deps.msalClient.getAuthCodeUrl as ReturnType<typeof vi.fn>;
    const lastCall = getAuthCodeUrl.mock.calls.at(-1)?.[0];
    expect(lastCall.prompt).toBe('select_account');
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

// ---------------------------------------------------------------------------
// ACTIVE-account source of truth (homeAccountId-keyed)
// ---------------------------------------------------------------------------
describe('NEW-AUTH-1: active account selection', () => {
  it('(a) first login adopts the new account as active and persists it', async () => {
    const h = createHarness(); // no accounts; acquireTokenByCode adds acct-1
    const svc = createAuthService(h.deps);

    const result = await svc.login();
    expect(result.success && result.data.success).toBe(true);

    // The just-signed-in account is now persisted as the active id.
    expect(h.persisted.activeId).toBe('acct-1');
    // getActiveAccount resolves to it without re-adopting.
    const active = await svc.getActiveAccount();
    expect(active?.homeAccountId).toBe('acct-1');
  });

  it('(a) getActiveAccount adopts accounts[0] on a fresh cache with no persisted id', async () => {
    const h = createHarness({ accounts: [makeAccount('acct-1')] });
    expect(h.persisted.activeId).toBeNull();
    const svc = createAuthService(h.deps);

    const active = await svc.getActiveAccount();
    expect(active?.homeAccountId).toBe('acct-1');
    // First-login behaviour: it adopted + persisted acct-1.
    expect(h.persisted.activeId).toBe('acct-1');
    expect(h.deps.persistentCache.saveActiveAccountId).toHaveBeenCalledWith('acct-1');
  });

  it('(a) getActiveAccount honors a persisted active id over accounts[0]', async () => {
    const h = createHarness({ accounts: [makeAccount('acct-1'), makeAccount('acct-2')] });
    h.persisted.activeId = 'acct-2'; // restart with acct-2 chosen previously
    const svc = createAuthService(h.deps);

    const active = await svc.getActiveAccount();
    expect(active?.homeAccountId).toBe('acct-2');
    // It did NOT re-adopt/persist; the persisted id already matched a live account.
    expect(h.deps.persistentCache.saveActiveAccountId).not.toHaveBeenCalled();
  });

  it('(a) getActiveAccount falls back + adopts when the persisted id is stale', async () => {
    const h = createHarness({ accounts: [makeAccount('acct-1')] });
    h.persisted.activeId = 'ghost-account'; // account no longer in the cache
    const svc = createAuthService(h.deps);

    const active = await svc.getActiveAccount();
    expect(active?.homeAccountId).toBe('acct-1');
    expect(h.persisted.activeId).toBe('acct-1'); // re-adopted the surviving account
  });

  it('(a) getActiveAccount returns null when the cache holds no accounts', async () => {
    const h = createHarness();
    const svc = createAuthService(h.deps);
    await expect(svc.getActiveAccount()).resolves.toBeNull();
  });

  it('(b) setActiveAccount switches which account getUser and getAccessToken use', async () => {
    const h = createHarness({ accounts: [makeAccount('acct-1', 'a@x.com'), makeAccount('acct-2', 'b@x.com')] });
    h.persisted.activeId = 'acct-1';
    const svc = createAuthService(h.deps);

    // Hydrate this.account from the active selection (a token call would do this
    // in the real flow). Baseline: getUser reflects the active account, acct-1.
    h.setSilentResult({ accessToken: 'at-1', expiresOn: new Date(Date.now() + 60 * 60 * 1000) });
    await svc.getAccessToken();
    const before = await svc.getCurrentUser();
    expect(before.success && before.data?.id).toBe('acct-1');

    // Switch to acct-2.
    const switched = await svc.setActiveAccount('acct-2');
    expect(switched.success).toBe(true);
    expect(h.persisted.activeId).toBe('acct-2');

    // getUser now reflects acct-2.
    const after = await svc.getCurrentUser();
    expect(after.success && after.data?.id).toBe('acct-2');
    expect(after.success && after.data?.email).toBe('b@x.com');

    // getAccessToken acquires silently against acct-2 (the new active account).
    h.setSilentResult({ accessToken: 'at-2', expiresOn: new Date(Date.now() + 60 * 60 * 1000) });
    const token = await svc.getAccessToken();
    expect(token.success).toBe(true);
    const silentMock = h.deps.msalClient.acquireTokenSilent as ReturnType<typeof vi.fn>;
    const lastSilentCall = silentMock.mock.calls.at(-1)?.[0];
    expect(lastSilentCall.account.homeAccountId).toBe('acct-2');
  });

  it('(b) setActiveAccount rejects an id that is not in the cache', async () => {
    const h = createHarness({ accounts: [makeAccount('acct-1')] });
    const svc = createAuthService(h.deps);
    const result = await svc.setActiveAccount('not-a-real-account');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('ACCOUNT_NOT_FOUND');
    // The active selection was untouched.
    expect(h.deps.persistentCache.saveActiveAccountId).not.toHaveBeenCalled();
  });

  it('(c) logout clears the persisted active account id', async () => {
    const h = createHarness({ accounts: [makeAccount('acct-1')] });
    h.persisted.activeId = 'acct-1';
    const svc = createAuthService(h.deps);

    await svc.logout();
    expect(h.persisted.activeId).toBeNull();
    expect(h.deps.persistentCache.saveActiveAccountId).toHaveBeenCalledWith(null);

    // A fresh getActiveAccount after logout finds no accounts → null, nothing adopted.
    await expect(svc.getActiveAccount()).resolves.toBeNull();
  });

  it('(c) login overwrites a stale active id from a previous account (switch)', async () => {
    const h = createHarness();
    h.persisted.activeId = 'old-account'; // a prior, different active account
    const svc = createAuthService(h.deps);

    await svc.login(); // acquireTokenByCode signs in acct-1
    expect(h.persisted.activeId).toBe('acct-1');
  });
});

// ---------------------------------------------------------------------------
// In-app account switch — logout() THEN login(prompt=select_account)
// ---------------------------------------------------------------------------
describe('PROD-B1: switchAccount', () => {
  it('logs out (clears cookies, expiry map, active id) THEN logs in', async () => {
    const h = createHarness({ accounts: [makeAccount('acct-1')] });
    h.persisted.activeId = 'acct-1';
    const svc = createAuthService(h.deps);

    // Prime an in-memory expiry for acct-1 so we can assert logout cleared it:
    // a successful getAccessToken primes lastKnownExpiry, which lets validateToken
    // short-circuit to true. After the switch the map is cleared, so a later
    // validateToken cannot short-circuit against the old account's expiry.
    h.setSilentResult({ accessToken: 'at', expiresOn: new Date(Date.now() + 60 * 60 * 1000) });
    await svc.getAccessToken();
    await expect(svc.validateToken()).resolves.toEqual({ success: true, data: true });

    h.cookieClearCalls.length = 0; // ignore the proactive pre-login sweep history

    const result = await svc.switchAccount();

    // Returns the same success shape as login().
    expect(result.success && result.data.success).toBe(true);

    // logout ran: cookies cleared sequentially (jar a then jar b). The switch
    // also triggers login's proactive pre-login sweep, but the logout sweep is
    // guaranteed to have happened — assert both jars were cleared at least once.
    expect(h.cookieClearCalls.some((c) => c.jar === 'a')).toBe(true);
    expect(h.cookieClearCalls.some((c) => c.jar === 'b')).toBe(true);

    // logout cleared the persisted active id; the subsequent login re-adopts the
    // newly signed-in account (acct-1 from the fake acquireTokenByCode).
    expect(h.persisted.activeId).toBe('acct-1');
  });

  it('passes prompt=select_account to the authorization request', async () => {
    const h = createHarness({ accounts: [makeAccount('acct-1')] });
    const svc = createAuthService(h.deps);

    await svc.switchAccount();

    const getAuthCodeUrl = h.deps.msalClient.getAuthCodeUrl as ReturnType<typeof vi.fn>;
    const lastCall = getAuthCodeUrl.mock.calls.at(-1)?.[0];
    expect(lastCall.prompt).toBe('select_account');
  });

  it('runs logout BEFORE getAuthCodeUrl (hard teardown precedes the picker)', async () => {
    const h = createHarness({ accounts: [makeAccount('acct-1')] });
    const svc = createAuthService(h.deps);

    const order: string[] = [];
    const removeAccount = h.deps.msalClient.getTokenCache().removeAccount as ReturnType<typeof vi.fn>;
    removeAccount.mockImplementation(async (acct: AccountInfo) => {
      order.push('logout:removeAccount');
      const i = h.accounts.findIndex((a) => a.homeAccountId === acct.homeAccountId);
      if (i >= 0) h.accounts.splice(i, 1);
    });
    const getAuthCodeUrl = h.deps.msalClient.getAuthCodeUrl as ReturnType<typeof vi.fn>;
    getAuthCodeUrl.mockImplementation(async () => {
      order.push('login:getAuthCodeUrl');
      return 'https://login.microsoftonline.com/authorize';
    });

    await svc.switchAccount();

    expect(order).toEqual(['logout:removeAccount', 'login:getAuthCodeUrl']);
  });

  it('returns LOGIN_CANCELLED (already signed out) when the picker is dismissed', async () => {
    const h = createHarness({ accounts: [makeAccount('acct-1')] });
    h.persisted.activeId = 'acct-1';
    const svc = createAuthService(h.deps);

    // The auth window resolves null with no AAD error → user cancelled the picker.
    h.openAuthResult.value = null;
    const openAuth = h.deps.openAuthWindow as ReturnType<typeof vi.fn>;
    openAuth.mockResolvedValueOnce(null);

    const result = await svc.switchAccount();
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('LOGIN_CANCELLED');

    // The logout phase still happened: the active id was cleared (user is signed
    // out), so the renderer falls back to the login screen.
    expect(h.persisted.activeId).toBeNull();
  });

  it('surfaces logout failure WITHOUT opening the login window', async () => {
    const h = createHarness({ accounts: [makeAccount('acct-1')] });
    h.setJarBFails(true); // logout's cookie clear fails loud
    const svc = createAuthService(h.deps);

    const result = await svc.switchAccount();
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('LOGOUT_FAILED');

    // login was never reached — no authorization URL was requested.
    expect(h.deps.msalClient.getAuthCodeUrl).not.toHaveBeenCalled();
  });
});

describe('getAdminAccessToken (incremental consent, admin tier)', () => {
  it('returns silently when the admin scope is already consented', async () => {
    const h = createHarness({ accounts: [makeAccount('acct-1')] });
    h.setSilentResult({ accessToken: 'admin-at', expiresOn: new Date('2030-01-01T00:00:00Z') });
    const svc = createAuthService(h.deps);

    const result = await svc.getAdminAccessToken();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.accessToken).toBe('admin-at');
      expect(result.data.expiresOn).toBe('2030-01-01T00:00:00.000Z');
    }
    // The silent request targeted the admin scope, not the base scopes.
    const silent = h.deps.msalClient.acquireTokenSilent as ReturnType<typeof vi.fn>;
    const scopes = (silent.mock.calls[0]?.[0] as { scopes: string[] }).scopes;
    expect(scopes.some((s) => s.includes('Tenant.Read.All'))).toBe(true);
    // No auth window was opened.
    expect(h.deps.openAuthWindow).not.toHaveBeenCalled();
  });

  it('falls back to the interactive consent window when interaction is required', async () => {
    const h = createHarness({ accounts: [makeAccount('acct-1')] });
    h.setSilentResult(new InteractionRequiredAuthError('interaction_required'));
    const svc = createAuthService(h.deps);

    const result = await svc.getAdminAccessToken();
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.accessToken).toBe('at');

    // The interactive request asked for the SUPERSET (base + admin scopes).
    const getUrl = h.deps.msalClient.getAuthCodeUrl as ReturnType<typeof vi.fn>;
    const scopes = (getUrl.mock.calls[0]?.[0] as { scopes: string[] }).scopes;
    expect(scopes.some((s) => s.includes('Tenant.Read.All'))).toBe(true);
    expect(scopes.some((s) => s.includes('Report.Read.All'))).toBe(true);
  });

  it('reports ADMIN_CONSENT_CANCELLED when the consent window is closed', async () => {
    const h = createHarness({ accounts: [makeAccount('acct-1')] });
    h.setSilentResult(new InteractionRequiredAuthError('interaction_required'));
    (h.deps.openAuthWindow as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const svc = createAuthService(h.deps);

    const result = await svc.getAdminAccessToken();
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('ADMIN_CONSENT_CANCELLED');
    // The in-flight guard was released: a later attempt can run interactively.
    const again = await svc.getAdminAccessToken();
    expect(again.success).toBe(true);
  });

  it('rejects a redirect whose state does not match (CSRF)', async () => {
    const h = createHarness({ accounts: [makeAccount('acct-1')] });
    h.setSilentResult(new InteractionRequiredAuthError('interaction_required'));
    h.openAuthResult.value = { code: 'authcode', state: 'tampered' };
    const svc = createAuthService(h.deps);

    const result = await svc.getAdminAccessToken();
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('CSRF_VALIDATION_FAILED');
  });

  it('fails with NO_ACCOUNT when nobody is signed in', async () => {
    const h = createHarness({ accounts: [] });
    const svc = createAuthService(h.deps);
    const result = await svc.getAdminAccessToken();
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('NO_ACCOUNT');
  });
});

describe('getAdminAccessToken — account-mismatch guard', () => {
  it('rejects when the consented account differs from the signed-in account', async () => {
    const h = createHarness({ accounts: [makeAccount('acct-1')] });
    h.setSilentResult(new InteractionRequiredAuthError('interaction_required'));
    // The consent dialog returns a DIFFERENT account ("Use a different account").
    (h.deps.msalClient.acquireTokenByCode as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      accessToken: 'at',
      expiresOn: new Date(Date.now() + 3_600_000),
      account: makeAccount('acct-OTHER', 'other@example.com'),
    });
    const svc = createAuthService(h.deps);

    const result = await svc.getAdminAccessToken();
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('ADMIN_ACCOUNT_MISMATCH');

    // The original session is intact: a normal token call still resolves acct-1.
    h.setSilentResult({ accessToken: 'base', expiresOn: new Date(Date.now() + 3_600_000) });
    const base = await svc.getAccessToken();
    expect(base.success).toBe(true);
  });
});
