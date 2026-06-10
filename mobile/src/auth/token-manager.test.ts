/**
 * TokenManager tests — pure TS with injected fakes (no react-native / expo
 * imports). Covers the single-flight refresh lock (desktop's
 * tokenAcquisitionInFlight pattern), expiry margin, persistence shape,
 * refresh-token rotation, and invalid_grant credential drop.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  TokenManager,
  base64UrlDecode,
  decodeIdToken,
  type TokenSet,
  type TokenStorage,
} from './token-manager';

/** In-memory TokenStorage fake. */
function memoryStorage(initial: string | null = null) {
  let value = initial;
  return {
    storage: {
      get: async () => value,
      set: async (v: string) => {
        value = v;
      },
      remove: async () => {
        value = null;
      },
    } satisfies TokenStorage,
    read: () => value,
  };
}

const NOW = Date.parse('2026-06-10T12:00:00Z');

function freshSet(overrides: Partial<TokenSet> = {}): TokenSet {
  return {
    accessToken: 'AT-fresh',
    expiresAt: NOW + 60 * 60 * 1000, // +1h
    refreshToken: 'RT-1',
    user: { username: 'brendan@bc-abc.com', name: 'Brendan' },
    ...overrides,
  };
}

function manager(opts: {
  stored?: TokenSet | null;
  refresh?: (rt: string) => Promise<TokenSet>;
  now?: () => number;
  persistAccessToken?: boolean;
}) {
  const { storage, read } = memoryStorage();
  const refresh = vi.fn(opts.refresh ?? (async () => freshSet()));
  const m = new TokenManager({
    storage,
    refresh,
    now: opts.now ?? (() => NOW),
    persistAccessToken: opts.persistAccessToken,
  });
  return { m, refresh, read, seed: (t: TokenSet) => m.setTokens(t) };
}

describe('getAccessToken — expiry + refresh', () => {
  it('returns the cached token without refreshing while fresh', async () => {
    const { m, refresh, seed } = manager({});
    await seed(freshSet());
    expect(await m.getAccessToken()).toBe('AT-fresh');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('refreshes when expired and persists the new tokens', async () => {
    const { m, refresh, seed, read } = manager({
      refresh: async () => freshSet({ accessToken: 'AT-2', refreshToken: 'RT-2' }),
    });
    await seed(freshSet({ accessToken: 'AT-old', expiresAt: NOW - 1000 }));
    expect(await m.getAccessToken()).toBe('AT-2');
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith('RT-1');
    expect(JSON.parse(read()!).refreshToken).toBe('RT-2'); // rotation persisted
  });

  it('refreshes INSIDE the expiry margin (token not yet expired but close)', async () => {
    const { m, refresh, seed } = manager({
      refresh: async () => freshSet({ accessToken: 'AT-2' }),
    });
    await seed(freshSet({ expiresAt: NOW + 2 * 60 * 1000 })); // 2 min left < 5 min margin
    expect(await m.getAccessToken()).toBe('AT-2');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('keeps the OLD refresh token when the provider omits a new one (RFC 6749 §6)', async () => {
    const { m, seed, read } = manager({
      refresh: async () => freshSet({ accessToken: 'AT-2', refreshToken: undefined }),
    });
    await seed(freshSet({ expiresAt: 0 }));
    await m.getAccessToken();
    expect(JSON.parse(read()!).refreshToken).toBe('RT-1');
  });

  it('throws "Not signed in" with no stored credentials', async () => {
    const { m, refresh } = manager({});
    await expect(m.getAccessToken()).rejects.toThrow('Not signed in');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('throws when expired with no refresh token (session over)', async () => {
    const { m, seed } = manager({});
    await seed(freshSet({ expiresAt: 0, refreshToken: undefined }));
    await expect(m.getAccessToken()).rejects.toThrow(/sign in again/i);
  });
});

describe('single-flight refresh lock (tokenAcquisitionInFlight pattern)', () => {
  it('concurrent callers share ONE refresh', async () => {
    let release!: (t: TokenSet) => void;
    const gate = new Promise<TokenSet>((r) => (release = r));
    const { m, refresh, seed } = manager({ refresh: () => gate });
    await seed(freshSet({ expiresAt: 0 }));

    const calls = [m.getAccessToken(), m.getAccessToken(), m.getAccessToken()];
    release(freshSet({ accessToken: 'AT-shared' }));
    expect(await Promise.all(calls)).toEqual(['AT-shared', 'AT-shared', 'AT-shared']);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('a failed refresh rejects ALL waiters and releases the lock for a retry', async () => {
    let attempt = 0;
    const { m, refresh, seed } = manager({
      refresh: async () => {
        attempt += 1;
        if (attempt === 1) throw new Error('network down');
        return freshSet({ accessToken: 'AT-retry' });
      },
    });
    await seed(freshSet({ expiresAt: 0 }));

    const first = m.getAccessToken();
    const second = m.getAccessToken(); // coalesced onto the same attempt
    await expect(first).rejects.toThrow('network down');
    await expect(second).rejects.toThrow('network down');
    // Lock released — the next call retries instead of being wedged.
    expect(await m.getAccessToken()).toBe('AT-retry');
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('a caller arriving while a refresh is ALREADY in flight joins it', async () => {
    let release: ((t: TokenSet) => void) | null = null;
    const { m, refresh, seed } = manager({
      refresh: () => new Promise<TokenSet>((r) => (release = r)),
    });
    await seed(freshSet({ expiresAt: 0 }));
    const a = m.getAccessToken();
    await Promise.resolve(); // let the first caller reach the refresh fn
    expect(release).not.toBeNull(); // refresh genuinely in flight
    const b = m.getAccessToken(); // late joiner
    release!(freshSet({ accessToken: 'AT-one' }));
    expect(await Promise.all([a, b])).toEqual(['AT-one', 'AT-one']);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe('invalid_grant handling', () => {
  it('clears stored credentials so the app falls back to signed-out', async () => {
    const { m, seed, read } = manager({
      refresh: async () => {
        throw new Error('Token refresh failed: invalid_grant (AADSTS70008 expired)');
      },
    });
    await seed(freshSet({ expiresAt: 0 }));
    await expect(m.getAccessToken()).rejects.toThrow(/invalid_grant/);
    expect(read()).toBeNull();
    expect(await m.isSignedIn()).toBe(false);
    expect(await m.getCurrentUser()).toBeNull();
  });

  it('does NOT clear credentials on transient failures', async () => {
    const { m, seed, read } = manager({
      refresh: async () => {
        throw new Error('fetch failed: offline');
      },
    });
    await seed(freshSet({ expiresAt: 0 }));
    await expect(m.getAccessToken()).rejects.toThrow('offline');
    expect(read()).not.toBeNull(); // refresh token survives for a later retry
  });
});

describe('persistence shape', () => {
  it('by default the multi-KB access token is NOT written to storage', async () => {
    const { m, seed, read } = manager({});
    await seed(freshSet());
    const persisted = JSON.parse(read()!);
    expect(persisted.accessToken).toBeUndefined();
    expect(persisted.refreshToken).toBe('RT-1');
    expect(persisted.user.username).toBe('brendan@bc-abc.com');
    // …but the in-memory copy still serves reads while fresh.
    expect(await m.getAccessToken()).toBe('AT-fresh');
  });

  it('persistAccessToken: true writes token + expiry too', async () => {
    const { m, seed, read } = manager({ persistAccessToken: true });
    await seed(freshSet());
    const persisted = JSON.parse(read()!);
    expect(persisted.accessToken).toBe('AT-fresh');
    expect(persisted.expiresAt).toBe(NOW + 60 * 60 * 1000);
  });

  it('hydrates from storage on a cold start and silently refreshes', async () => {
    const { storage } = memoryStorage(
      JSON.stringify({ refreshToken: 'RT-cold', user: { username: 'brendan@bc-abc.com' } }),
    );
    const refresh = vi.fn(async () => freshSet({ accessToken: 'AT-cold' }));
    const m = new TokenManager({ storage, refresh, now: () => NOW });
    expect(await m.isSignedIn()).toBe(true);
    expect((await m.getCurrentUser())?.username).toBe('brendan@bc-abc.com');
    expect(await m.getAccessToken()).toBe('AT-cold'); // launch = silent refresh
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith('RT-cold');
  });

  it('treats corrupted storage as signed out instead of crashing', async () => {
    const { storage } = memoryStorage('}{not json');
    const m = new TokenManager({ storage, refresh: vi.fn(), now: () => NOW });
    expect(await m.isSignedIn()).toBe(false);
    await expect(m.getAccessToken()).rejects.toThrow('Not signed in');
  });

  it('clear() wipes memory + storage and re-arms hydration', async () => {
    const { m, seed, read } = manager({});
    await seed(freshSet());
    await m.clear();
    expect(read()).toBeNull();
    expect(await m.isSignedIn()).toBe(false);
  });
});

describe('concurrent hydration (cold-start race)', () => {
  it('isSignedIn() and getAccessToken() racing at launch share ONE storage read', async () => {
    let reads = 0;
    const storage: TokenStorage = {
      get: async () => {
        reads += 1;
        await new Promise((r) => setTimeout(r, 0)); // storage read takes a tick
        return JSON.stringify({ refreshToken: 'RT-race', user: { username: 'brendan@bc-abc.com' } });
      },
      set: async () => {},
      remove: async () => {},
    };
    const refresh = vi.fn(async () => freshSet({ accessToken: 'AT-race' }));
    const m = new TokenManager({ storage, refresh, now: () => NOW });
    // Pre-fix: the second caller saw `loaded = true, tokens = null` while the
    // first was still awaiting storage.get() → false / "Not signed in".
    const [signedIn, token] = await Promise.all([m.isSignedIn(), m.getAccessToken()]);
    expect(signedIn).toBe(true);
    expect(token).toBe('AT-race');
    expect(reads).toBe(1);
  });

  it('clear() during a slow hydration does not resurrect credentials', async () => {
    let releaseGet!: () => void;
    const gate = new Promise<void>((r) => (releaseGet = r));
    let value: string | null = JSON.stringify({ refreshToken: 'RT-zombie' });
    const storage: TokenStorage = {
      get: async () => {
        const snapshot = value; // read the pre-clear value…
        await gate; // …but deliver it only after clear() has run
        return snapshot;
      },
      set: async (v) => {
        value = v;
      },
      remove: async () => {
        value = null;
      },
    };
    const m = new TokenManager({ storage, refresh: vi.fn(), now: () => NOW });
    const pending = m.isSignedIn(); // hydration starts, suspended on get()
    await m.clear(); // sign out while hydration is in flight
    releaseGet();
    expect(await pending).toBe(false); // stale read must not commit
    expect(await m.isSignedIn()).toBe(false); // and a re-read sees the wipe
  });
});

describe('id_token decoding (pure base64url, no atob/Buffer)', () => {
  const payload = (claims: object) => {
    // Node Buffer is fine IN THE TEST as the encoder; the decoder under test
    // must not need it.
    const b64 = Buffer.from(JSON.stringify(claims), 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    return `eyJhbGciOiJSUzI1NiJ9.${b64}.signature`;
  };

  it('extracts username, name, tenant and object ids', () => {
    const u = decodeIdToken(
      payload({
        preferred_username: 'brendan@bc-abc.com',
        name: 'Brendan C',
        tid: 'tenant-1',
        oid: 'object-1',
      }),
    );
    expect(u).toEqual({
      username: 'brendan@bc-abc.com',
      name: 'Brendan C',
      tenantId: 'tenant-1',
      objectId: 'object-1',
    });
  });

  it('falls back preferred_username → email → upn → sub', () => {
    expect(decodeIdToken(payload({ email: 'e@x.com' }))?.username).toBe('e@x.com');
    expect(decodeIdToken(payload({ upn: 'u@x.com' }))?.username).toBe('u@x.com');
    expect(decodeIdToken(payload({ sub: 'abc123' }))?.username).toBe('abc123');
    expect(decodeIdToken(payload({}))).toBeNull();
  });

  it('decodes non-ASCII names (UTF-8)', () => {
    const u = decodeIdToken(payload({ preferred_username: 'x@y.com', name: 'Brendán Ó Cárthaigh' }));
    expect(u?.name).toBe('Brendán Ó Cárthaigh');
  });

  it('rejects malformed tokens without throwing', () => {
    expect(decodeIdToken('not-a-jwt')).toBeNull();
    expect(decodeIdToken('a.!!!.c')).toBeNull();
    expect(decodeIdToken(`a.${'9'.repeat(8)}.c`)).toBeNull(); // valid b64, not JSON
  });

  it('base64UrlDecode round-trips url-safe input', () => {
    expect(base64UrlDecode('aGVsbG8')).toBe('hello');
    expect(base64UrlDecode('aGVsbG8=')).toBe('hello');
    expect(base64UrlDecode('!bad')).toBeNull();
  });
});
