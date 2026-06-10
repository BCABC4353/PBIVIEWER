/**
 * TokenManager — the pure, unit-testable heart of mobile auth.
 *
 * NO React Native / Expo imports here (vitest runs this on Node). The Expo
 * wrapper (msal-auth.ts) injects the platform pieces: SecureStore-backed
 * storage, an expo-auth-session refresh function, and the system clock.
 *
 * Responsibilities:
 *  - hold the current token set (access token in memory; refresh token + user
 *    persisted via the injected storage),
 *  - serve getAccessToken() with auto-refresh when expired/near-expiry,
 *  - SINGLE-FLIGHT the refresh: concurrent callers all await the same
 *    in-flight acquisition (mirrors desktop auth-service.ts
 *    `tokenAcquisitionInFlight` — two parallel refresh_token grants would
 *    race, and AAD rotates refresh tokens, so the loser would persist a
 *    dead token),
 *  - drop dead credentials on AAD's `invalid_grant` (refresh token revoked /
 *    expired) so the app falls back to a clean signed-out state.
 */

export interface UserInfo {
  /** preferred_username / email / upn from the id_token. */
  username: string;
  /** Display name, when the id_token carries one. */
  name?: string;
  /** AAD tenant id (tid claim). */
  tenantId?: string;
  /** AAD object id (oid claim). */
  objectId?: string;
}

export interface TokenSet {
  accessToken: string;
  /** Epoch milliseconds when the access token expires. */
  expiresAt: number;
  refreshToken?: string;
  user?: UserInfo;
}

/** Minimal async key-less storage seam (the Expo wrapper backs it with
 *  expo-secure-store; tests use an in-memory fake). */
export interface TokenStorage {
  get(): Promise<string | null>;
  set(value: string): Promise<void>;
  remove(): Promise<void>;
}

/** Performs the OAuth refresh_token grant. Must throw on failure; an
 *  `invalid_grant` failure should include that string in the error message
 *  (expo-auth-session's TokenError does). */
export type RefreshFn = (refreshToken: string) => Promise<TokenSet>;

export interface TokenManagerDeps {
  storage: TokenStorage;
  refresh: RefreshFn;
  /** Injected clock (epoch ms). Defaults to Date.now. */
  now?: () => number;
  /** Refresh this many ms before actual expiry. Default 5 minutes. */
  expiryMarginMs?: number;
  /**
   * Persist the access token alongside the refresh token. Default FALSE:
   * Power BI access tokens are multi-KB JWTs and expo-secure-store warns
   * above ~2048 bytes on Android — the refresh token alone is enough,
   * because launch does a silent refresh anyway (desktop model).
   */
  persistAccessToken?: boolean;
}

/** Shape written to storage (a subset of TokenSet, JSON-encoded). */
interface PersistedTokens {
  accessToken?: string;
  expiresAt?: number;
  refreshToken?: string;
  user?: UserInfo;
}

export class TokenManager {
  private readonly storage: TokenStorage;
  private readonly refresh: RefreshFn;
  private readonly now: () => number;
  private readonly expiryMarginMs: number;
  private readonly persistAccessToken: boolean;

  /** In-memory token set (authoritative once loaded). */
  private tokens: TokenSet | null = null;
  /** Storage hydrated at most once (re-armed by clear()). */
  private loaded = false;
  /** Single-flight hydration — concurrent first readers share one storage read. */
  private hydration: Promise<TokenSet | null> | null = null;
  /** Bumped by clear() so an in-flight hydration can't resurrect credentials. */
  private epoch = 0;
  /** Single-flight lock — all concurrent getAccessToken callers share it. */
  private acquisitionInFlight: Promise<string> | null = null;

  constructor(deps: TokenManagerDeps) {
    this.storage = deps.storage;
    this.refresh = deps.refresh;
    this.now = deps.now ?? Date.now;
    this.expiryMarginMs = deps.expiryMarginMs ?? 5 * 60 * 1000;
    this.persistAccessToken = deps.persistAccessToken ?? false;
  }

  /** True when we hold credentials (a refresh token or a live access token). */
  async isSignedIn(): Promise<boolean> {
    const t = await this.load();
    return t !== null && (!!t.refreshToken || this.isFresh(t));
  }

  async getCurrentUser(): Promise<UserInfo | null> {
    const t = await this.load();
    return t?.user ?? null;
  }

  /** Store a freshly acquired token set (interactive sign-in or refresh). */
  async setTokens(tokens: TokenSet): Promise<void> {
    this.tokens = tokens;
    this.loaded = true;
    const persisted: PersistedTokens = {
      refreshToken: tokens.refreshToken,
      user: tokens.user,
      ...(this.persistAccessToken
        ? { accessToken: tokens.accessToken, expiresAt: tokens.expiresAt }
        : {}),
    };
    await this.storage.set(JSON.stringify(persisted));
  }

  /** Sign out: wipe memory + storage. */
  async clear(): Promise<void> {
    this.epoch += 1; // invalidate any hydration still in flight
    this.hydration = null;
    this.tokens = null;
    this.loaded = false; // re-arm hydration so a later read sees the cleared store
    await this.storage.remove();
  }

  /**
   * Get a live access token, silently refreshing when expired or inside the
   * expiry margin. Concurrent callers coalesce onto ONE acquisition
   * (single-flight), exactly like desktop's tokenAcquisitionInFlight.
   * Throws when not signed in or the refresh fails.
   */
  async getAccessToken(): Promise<string> {
    if (this.acquisitionInFlight !== null) {
      return await this.acquisitionInFlight;
    }
    const work = this.acquire();
    this.acquisitionInFlight = work;
    try {
      return await work;
    } finally {
      // Always release — success OR throw — so a failed refresh does not
      // permanently wedge every future caller.
      this.acquisitionInFlight = null;
    }
  }

  private async acquire(): Promise<string> {
    const t = await this.load();
    if (!t) throw new Error('Not signed in');
    if (this.isFresh(t)) return t.accessToken;
    if (!t.refreshToken) {
      throw new Error('Session expired — sign in again');
    }
    let next: TokenSet;
    try {
      next = await this.refresh(t.refreshToken);
    } catch (e) {
      // AAD invalid_grant = the refresh token itself is dead (revoked,
      // expired, password change…). Keeping it would loop forever; drop the
      // credentials so the UI falls back to a clean "Sign in" state.
      if (e instanceof Error && /invalid_grant/i.test(e.message)) {
        await this.clear();
      }
      throw e;
    }
    const merged: TokenSet = {
      ...next,
      // AAD rotates refresh tokens, but RFC 6749 allows omitting the new one —
      // in that case the old refresh token remains valid; keep it.
      refreshToken: next.refreshToken ?? t.refreshToken,
      user: next.user ?? t.user,
    };
    await this.setTokens(merged);
    return merged.accessToken;
  }

  private isFresh(t: TokenSet): boolean {
    return !!t.accessToken && t.expiresAt - this.expiryMarginMs > this.now();
  }

  /** Hydrate from storage at most once (until clear() re-arms it).
   *  SINGLE-FLIGHT: concurrent first readers (e.g. isSignedIn() and
   *  getAccessToken() racing at launch) share one storage read — otherwise
   *  the second caller would observe `loaded = true, tokens = null` while the
   *  first is still awaiting storage.get() and wrongly report signed-out. */
  private load(): Promise<TokenSet | null> {
    if (this.loaded) return Promise.resolve(this.tokens);
    this.hydration ??= this.hydrate();
    return this.hydration;
  }

  private async hydrate(): Promise<TokenSet | null> {
    const epoch = this.epoch;
    let raw: string | null = null;
    try {
      raw = await this.storage.get();
    } catch {
      raw = null; // unreadable store (keychain invalidation…) = signed out
    }
    let parsed: TokenSet | null = null;
    if (raw) {
      try {
        const p = JSON.parse(raw) as PersistedTokens;
        parsed = {
          accessToken: p.accessToken ?? '',
          expiresAt: p.expiresAt ?? 0,
          refreshToken: p.refreshToken,
          user: p.user,
        };
      } catch {
        parsed = null; // corrupted JSON = signed out
      }
    }
    // Commit only if nothing changed underneath us: clear() bumps the epoch,
    // and setTokens() flips `loaded` — in either case the in-memory state is
    // newer than what we just read.
    if (epoch === this.epoch && !this.loaded) {
      this.tokens = parsed;
      this.loaded = true;
      this.hydration = null;
    }
    return this.tokens;
  }
}

// ---------------------------------------------------------------------------
// id_token decoding — pure (no atob/Buffer, so it runs identically on Hermes
// and on Node under vitest).
// ---------------------------------------------------------------------------

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** base64url → UTF-8 string. Returns null on malformed input. */
export function base64UrlDecode(input: string): string | null {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of b64) {
    if (ch === '=') break;
    const v = B64_ALPHABET.indexOf(ch);
    if (v < 0) return null;
    buffer = (buffer << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  try {
    // Percent-encoding trick = a correct UTF-8 decoder using only JS builtins.
    return decodeURIComponent(bytes.map((b) => `%${b.toString(16).padStart(2, '0')}`).join(''));
  } catch {
    return null;
  }
}

/** Extract display identity from an AAD id_token (JWT). Null when unparsable. */
export function decodeIdToken(idToken: string): UserInfo | null {
  const parts = idToken.split('.');
  if (parts.length < 2) return null;
  const json = base64UrlDecode(parts[1] as string);
  if (json === null) return null;
  let claims: Record<string, unknown>;
  try {
    claims = JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
  const str = (k: string): string | undefined =>
    typeof claims[k] === 'string' ? (claims[k] as string) : undefined;
  const username = str('preferred_username') ?? str('email') ?? str('upn') ?? str('sub');
  if (!username) return null;
  return {
    username,
    name: str('name'),
    tenantId: str('tid'),
    objectId: str('oid'),
  };
}
