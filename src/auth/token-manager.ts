
export interface UserInfo {
  username: string;
  name?: string;
  tenantId?: string;
  objectId?: string;
}

export interface TokenSet {
  accessToken: string;
  expiresAt: number;
  refreshToken?: string;
  user?: UserInfo;
}

export interface TokenStorage {
  get(): Promise<string | null>;
  set(value: string): Promise<void>;
  remove(): Promise<void>;
}

export type RefreshFn = (refreshToken: string) => Promise<TokenSet>;

export interface TokenManagerDeps {
  storage: TokenStorage;
  refresh: RefreshFn;
  now?: () => number;
  expiryMarginMs?: number;
  persistAccessToken?: boolean;
}

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

  private tokens: TokenSet | null = null;
  private loaded = false;
  private hydration: Promise<TokenSet | null> | null = null;
  private epoch = 0;
  private clearing: Promise<void> | null = null;
  private acquisitionInFlight: Promise<string> | null = null;

  constructor(deps: TokenManagerDeps) {
    this.storage = deps.storage;
    this.refresh = deps.refresh;
    this.now = deps.now ?? Date.now;
    this.expiryMarginMs = deps.expiryMarginMs ?? 5 * 60 * 1000;
    this.persistAccessToken = deps.persistAccessToken ?? false;
  }

  async isSignedIn(): Promise<boolean> {
    const t = await this.load();
    return t !== null && (!!t.refreshToken || this.isFresh(t));
  }

  async getCurrentUser(): Promise<UserInfo | null> {
    const t = await this.load();
    return t?.user ?? null;
  }

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

  async clear(): Promise<void> {
    this.epoch += 1;
    const clearing = (async () => {
      try {
        await this.storage.remove();
      } finally {
        this.hydration = null;
        this.tokens = null;
        this.loaded = false;
      }
    })();
    this.clearing = clearing;
    try {
      await clearing;
    } finally {
      if (this.clearing === clearing) this.clearing = null;
    }
  }

  async getAccessToken(): Promise<string> {
    if (this.acquisitionInFlight !== null) {
      return await this.acquisitionInFlight;
    }
    const work = this.acquire();
    this.acquisitionInFlight = work;
    try {
      return await work;
    } finally {
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
      if (
        e instanceof Error &&
        ((e as { code?: unknown }).code === 'invalid_grant' || /invalid_grant/i.test(e.message))
      ) {
        await this.clear();
      }
      throw e;
    }
    const merged: TokenSet = {
      ...next,
      refreshToken: next.refreshToken ?? t.refreshToken,
      user: next.user ?? t.user,
    };
    await this.setTokens(merged);
    return merged.accessToken;
  }

  private isFresh(t: TokenSet): boolean {
    return !!t.accessToken && t.expiresAt - this.expiryMarginMs > this.now();
  }

  private async load(): Promise<TokenSet | null> {
    while (this.clearing) await this.clearing.catch(() => {});
    if (this.loaded) return this.tokens;
    this.hydration ??= this.hydrate();
    return this.hydration;
  }

  private async hydrate(): Promise<TokenSet | null> {
    const epoch = this.epoch;
    let raw: string | null = null;
    try {
      raw = await this.storage.get();
    } catch {
      raw = null;
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
        parsed = null;
      }
    }
    if (epoch === this.epoch && !this.loaded) {
      this.tokens = parsed;
      this.loaded = true;
      this.hydration = null;
    }
    return this.tokens;
  }
}


const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

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
    return decodeURIComponent(bytes.map((b) => `%${b.toString(16).padStart(2, '0')}`).join(''));
  } catch {
    return null;
  }
}

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
