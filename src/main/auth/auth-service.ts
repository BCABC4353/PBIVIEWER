import {
  PublicClientApplication,
  AccountInfo,
  InteractionRequiredAuthError,
  CryptoProvider,
  AuthorizationCodeRequest,
} from '@azure/msal-node';
import { BrowserWindow, session, shell } from 'electron';
import { randomFillSync } from 'crypto';
import { msalConfig, loginRequest, silentRequest, azureConfigValid } from './msal-config';
import { tokenCache as realTokenCache, CachedUserInfo } from './token-cache';
import { settingsService } from '../services/settings-service';
import { usageTrackingService } from '../services/usage-tracking-service';
import { UserInfo, AuthResult, IPCResponse, TokenResult } from '../../shared/types';
import { PARTITION_NAME, TOKEN } from '../../shared/constants';

// Dependency-injection seam: every external collaborator (MSAL, electron
// singletons) is an injectable dependency so the service is unit-testable under
// jsdom. `createAuthService(deps)` builds a service from fakes in tests;
// `getAuthService()` builds the real one lazily in production.

/** Minimal slice of the MSAL token cache the service depends on. */
export interface TokenCachePort {
  getAllAccounts(): Promise<AccountInfo[]>;
  removeAccount(account: AccountInfo): Promise<void>;
  serialize(): string;
  deserialize(cache: string): void;
}

/** Minimal slice of MSAL's PublicClientApplication the service depends on. */
export interface MsalClientPort {
  getTokenCache(): TokenCachePort;
  getAuthCodeUrl(request: Record<string, unknown>): Promise<string>;
  acquireTokenByCode(
    request: AuthorizationCodeRequest,
  ): Promise<{ accessToken: string; expiresOn: Date | null; account: AccountInfo | null } | null>;
  acquireTokenSilent(request: {
    scopes: string[];
    account: AccountInfo;
  }): Promise<{ accessToken: string; expiresOn: Date | null }>;
}

/** Persistent (on-disk) token/user cache. Satisfied by token-cache.ts. */
export interface PersistentCachePort {
  saveCache(cache: string): Promise<void>;
  loadCache(): Promise<string | null>;
  clearCache(): Promise<void>;
  saveUserInfo(userInfo: CachedUserInfo): Promise<void>;
  loadUserInfo(): Promise<CachedUserInfo | null>;
  onCorruption(listener: () => void): () => void;
  // Persist/restore which cached account is "active" so the choice
  // survives restart. saveActiveAccountId(null) clears it (logout / corruption).
  saveActiveAccountId(homeAccountId: string | null): Promise<void>;
  loadActiveAccountId(): Promise<string | null>;
}

/** A single cookie jar we can clear on logout. Matches electron's Session. */
export interface CookieJarPort {
  clearStorageData(options?: {
    storages?: Array<
      'cookies' | 'localstorage' | 'indexdb' | 'serviceworkers' | 'cachestorage'
    >;
  }): Promise<void>;
  // Flush the HTTP cache too. clearStorageData
  // does NOT touch Electron's HTTP cache, so cached api.powerbi.com responses
  // could survive a logout/account-switch and bleed across tenants. The real
  // Electron Session exposes clearCache(); we wire it in production.
  clearCache(): Promise<void>;
}

/** Opens the interactive auth window and resolves the redirect result. */
export type AuthWindowOpener = (
  authUrl: string,
  expectedState: string,
  onAadError: (description: string) => void,
) => Promise<{ code: string; state: string } | null>;

export interface AuthServiceDeps {
  msalClient: MsalClientPort;
  cryptoProvider: Pick<CryptoProvider, 'generatePkceCodes'>;
  persistentCache: PersistentCachePort;
  /** Lazily resolve the cookie jars to clear on logout (sequential, fail-loud). */
  getCookieJars: () => CookieJarPort[];
  openAuthWindow: AuthWindowOpener;
  /** Reads usageClearOnLogout so the logout path can honor the retention policy. */
  getUsageClearOnLogout: () => 'always' | 'never' | 'on-shared-machine';
  /** Wipes per-account usage history. */
  clearUsageForAccount: (homeAccountId: string) => void;
  logger: Pick<typeof console, 'warn' | 'error'>;
}

class AuthService {
  private readonly deps: AuthServiceDeps;
  private account: AccountInfo | null = null;
  private pendingAuthState: string | null = null; // For CSRF validation
  // Guard so initializeCache() runs its deserialize+hydrate
  // at most once. Repeated reads (isAuthenticated, getAccessToken) must not keep
  // re-deserializing and clobbering this.account on every call.
  private cacheInitialized = false;
  // Keyed by homeAccountId so the 5-minute validateToken short-circuit can
  // never trust an expiry that belongs to a DIFFERENT account.
  // Cleared wholesale on logout / corruption.
  private lastKnownExpiryByAccount = new Map<string, number>();
  // The ACTIVE account's homeAccountId — the single source of truth for which
  // cached MSAL account token/user/expiry operations target. Persisted via the
  // token cache so the choice survives restart; mirrored here so hot reads
  // don't hit disk.
  private activeHomeAccountId: string | null = null;
  // Load the persisted active id from disk AT MOST ONCE (mirrors cacheInitialized).
  // Re-armed alongside cacheInitialized on logout/corruption so a later read
  // re-hydrates from the (now-cleared) persistent store.
  private activeIdLoaded = false;
  // Captures AAD-returned error_description so login() can surface the real
  // reason (consent_required, access_denied, etc.) instead of generic
  // LOGIN_FAILED. Cleared after consumption.
  private lastAuthError: string | null = null;
  // Single-flight lock for getAccessToken(): concurrent IPC calls would race
  // two acquireTokenSilent + persistCache cycles against each other, which can
  // corrupt the MSAL cache. All callers await the same in-flight promise.
  private tokenAcquisitionInFlight: Promise<IPCResponse<TokenResult>> | null = null;

  constructor(deps: AuthServiceDeps) {
    this.deps = deps;
    // Register the corruption hook up front. When the persistent cache
    // detects an undecryptable entry it purges itself AND calls this, so we drop
    // our in-memory account + expiries and stop returning a stale `true`.
    this.deps.persistentCache.onCorruption(() => this.invalidateCache());
  }

  /**
   * Generate a cryptographically random state value for CSRF protection
   */
  private generateState(): string {
    const array = new Uint8Array(32);
    randomFillSync(array);
    return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Drop all in-memory auth state after a cache corruption. Nulls the
   * account and clears every cached expiry so validateToken() cannot
   * short-circuit to a stale `true` against a cache that no longer exists.
   */
  invalidateCache(): void {
    this.account = null;
    this.lastKnownExpiryByAccount.clear();
    // Drop the active-account selection too. The persistent cache has
    // already purged itself (token-cache's decrypt corruption path clears
    // activeHomeAccountId in lockstep with msalCache), so we only clear in memory
    // and re-arm the loader; the next getActiveAccount() re-adopts from scratch.
    this.activeHomeAccountId = null;
    this.activeIdLoaded = false;
    // Force the next read to re-hydrate from the (now-purged) persistent cache.
    this.cacheInitialized = false;
  }

  async initialize(): Promise<void> {
    await this.initializeCache();
  }

  /**
   * Idempotent. Deserializes the persisted MSAL cache and hydrates
   * `this.account` AT MOST ONCE — re-running on every probe would overwrite
   * this.account from accounts[0] and could silently switch the active account
   * out from under a caller.
   */
  private async initializeCache(): Promise<void> {
    if (this.cacheInitialized) return;
    this.cacheInitialized = true;
    try {
      const cachedData = await this.deps.persistentCache.loadCache();
      if (cachedData) {
        try {
          this.deps.msalClient.getTokenCache().deserialize(cachedData);
        } catch (deserializeError) {
          // The persisted string isn't a valid MSAL cache — most commonly a blob
          // written by the OLD safeStorage build (it is valid JSON, so the store's
          // clearInvalidConfig never reset it), or otherwise unreadable. Purge it
          // ONCE so we stop re-reading garbage on every probe, and KEEP
          // cacheInitialized=true (the user simply re-signs in, which overwrites
          // the file). Do NOT re-arm: the data is bad in-hand, not transient.
          this.deps.logger.warn('[Auth] Discarding unreadable persisted cache:', deserializeError);
          await this.deps.persistentCache.clearCache();
          return;
        }

        // Hydrate the active account only if we don't already have one.
        // getActiveAccount() resolves by the persisted activeHomeAccountId
        // (adopting accounts[0] on first run).
        if (this.account === null) {
          this.account = await this.getActiveAccount();
        }
      }
    } catch (error) {
      // Re-arm so a genuinely transient failure (e.g. a disk read error inside
      // loadCache) can re-hydrate on a later probe. A bad-cache deserialize is
      // handled above and deliberately does NOT reach here.
      this.cacheInitialized = false;
      this.deps.logger.warn('[Auth] Cache initialization failed, starting fresh:', error);
    }
  }

  private async persistCache(): Promise<void> {
    try {
      const cache = this.deps.msalClient.getTokenCache().serialize();
      await this.deps.persistentCache.saveCache(cache);
    } catch (error) {
      this.deps.logger.warn('[Auth] Cache persistence failed:', error);
    }
  }

  /**
   * Lazily hydrate activeHomeAccountId from the persistent store
   * AT MOST ONCE per cache generation. Mirrors initializeCache's idempotence so
   * hot reads (getActiveAccount on every token acquisition) don't hit disk. The
   * loaded flag is re-armed on logout/corruption so a later read re-hydrates.
   */
  private async loadActiveIdOnce(): Promise<void> {
    if (this.activeIdLoaded) return;
    this.activeIdLoaded = true;
    try {
      this.activeHomeAccountId = await this.deps.persistentCache.loadActiveAccountId();
    } catch (error) {
      // Re-arm so a transient failure can re-load later. Leave activeHomeAccountId
      // as-is; getActiveAccount will fall back to accounts[0] + adopt.
      this.activeIdLoaded = false;
      this.deps.logger.warn('[Auth] Active account id load failed:', error);
    }
  }

  /**
   * The ACTIVE-account source of truth. Returns the cached MSAL
   * account whose homeAccountId === activeHomeAccountId. If the active id is unset
   * (first run) or no longer present in the cache (e.g. that account was removed),
   * fall back to accounts[0] AND adopt it — set+persist activeHomeAccountId — so
   * first-login behaviour is unchanged and the single fallback lives in ONE place.
   * Returns null only when the cache holds no accounts at all.
   */
  async getActiveAccount(): Promise<AccountInfo | null> {
    await this.loadActiveIdOnce();
    const accounts = await this.deps.msalClient.getTokenCache().getAllAccounts();
    if (accounts.length === 0) return null;

    if (this.activeHomeAccountId !== null) {
      const match = accounts.find((a) => a.homeAccountId === this.activeHomeAccountId);
      if (match) return match;
      // The persisted active id is stale (its account is gone). Fall through to
      // adopt accounts[0] so callers never key off a vanished account.
    }

    // Unset or stale: adopt the first account as the active one and persist it.
    const adopted = accounts[0];
    if (!adopted) return null;
    await this.setActiveAccountInternal(adopted.homeAccountId);
    return adopted;
  }

  /**
   * The seam the account switcher calls after a
   * login(prompt=select_account). Validates the id exists in the cache, then
   * sets+persists it as the active account and re-points this.account. Returns a
   * structured response so the caller can surface an unknown-account error.
   */
  async setActiveAccount(homeAccountId: string): Promise<IPCResponse<void>> {
    try {
      const accounts = await this.deps.msalClient.getTokenCache().getAllAccounts();
      const match = accounts.find((a) => a.homeAccountId === homeAccountId);
      if (!match) {
        return {
          success: false,
          error: { code: 'ACCOUNT_NOT_FOUND', message: 'No cached account with that id' },
        };
      }
      await this.setActiveAccountInternal(homeAccountId);
      // Re-point the live account so the very next token/user read targets it.
      this.account = match;
      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        error: { code: 'SET_ACTIVE_ACCOUNT_FAILED', message: String(error) },
      };
    }
  }

  /**
   * Set+persist the active id without re-validating (callers that
   * already hold a known-good account: login success, getActiveAccount adoption,
   * setActiveAccount after its own validation). Marks the id as loaded so a later
   * loadActiveIdOnce() doesn't clobber the in-memory value from disk.
   */
  private async setActiveAccountInternal(homeAccountId: string): Promise<void> {
    this.activeHomeAccountId = homeAccountId;
    this.activeIdLoaded = true;
    await this.deps.persistentCache.saveActiveAccountId(homeAccountId);
  }

  /**
   * NON-mutating. Reports whether any account exists WITHOUT overwriting
   * this.account — an authentication probe must never re-set the active account.
   */
  async isAuthenticated(): Promise<IPCResponse<boolean>> {
    try {
      await this.initializeCache();
      const accounts = await this.deps.msalClient.getTokenCache().getAllAccounts();
      return { success: true, data: accounts.length > 0 };
    } catch (error) {
      return {
        success: false,
        error: { code: 'AUTH_CHECK_FAILED', message: String(error) },
      };
    }
  }

  /**
   * Validates that we can actually get a token (not just that accounts exist).
   * This catches cases where scopes have changed and re-consent is needed.
   */
  async validateToken(): Promise<IPCResponse<boolean>> {
    try {
      // Short-circuit when we know the cached token is comfortably valid.
      // The expiry MUST belong to the CURRENT account — look it up by
      // homeAccountId, never trust a global "last expiry". Defense-in-depth: also
      // require a live account, so a corruption that nulled the account cannot let
      // a leftover expiry return a stale `true`.
      if (this.account !== null) {
        const expiry = this.lastKnownExpiryByAccount.get(this.account.homeAccountId);
        if (expiry !== undefined && expiry - Date.now() > TOKEN.VALIDATE_SHORT_CIRCUIT_MS) {
          return { success: true, data: true };
        }
      }
      const tokenResult = await this.getAccessToken();
      return { success: true, data: tokenResult.success };
    } catch (error) {
      this.deps.logger.warn('[Auth] Token validation failed:', error);
      return { success: true, data: false };
    }
  }

  async getCurrentUser(): Promise<IPCResponse<UserInfo | null>> {
    try {
      // this.account is ALWAYS the ACTIVE account — it is set from
      // the active-account source of truth on every path that assigns it (login
      // adopts the new account, getAccessToken resolves via getActiveAccount,
      // setActiveAccount re-points it). So reading this.account here reflects the
      // active selection without a fresh cache probe. When it is null (cold start
      // before any token call, or post-corruption) we fall back to the persisted
      // userInfo snapshot, deliberately NOT re-adopting from the cache — a nulled
      // account after corruption must not silently resurrect from accounts[0].
      if (!this.account) {
        // Only trust the persisted userInfo snapshot if the MSAL cache still has
        // a backing account. After a corruption/clear that nulled this.account but
        // left userInfo behind, returning it would resurface a signed-out user's
        // name/email for a session that has no account — so require a live account.
        const accounts = await this.deps.msalClient.getTokenCache().getAllAccounts();
        const userInfo = accounts.length > 0 ? await this.deps.persistentCache.loadUserInfo() : null;
        if (userInfo) {
          return {
            success: true,
            data: {
              id: userInfo.homeAccountId,
              displayName: userInfo.displayName,
              email: userInfo.email,
            },
          };
        }
        return { success: true, data: null };
      }

      return {
        success: true,
        data: {
          id: this.account.homeAccountId,
          displayName: this.account.name || this.account.username,
          email: this.account.username,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: { code: 'GET_USER_FAILED', message: String(error) },
      };
    }
  }

  /**
   * Optional knobs for an interactive login.
   *
   * `prompt` is forwarded to MSAL's authorization request ONLY when supplied.
   * A NORMAL login (no args) passes NO `prompt`, so AAD can silently continue
   * an existing session and only show UI when it genuinely must (no session,
   * MFA, consent). Do NOT default a prompt here: forcing the account picker on
   * every interactive login breaks unattended wall-display restarts. The
   * explicit account switch forces the picker by passing
   * { prompt: 'select_account' } at its call site (switchAccount()), so that
   * intent stays explicit.
   */
  async login(options?: { prompt?: string }): Promise<IPCResponse<AuthResult>> {
    const prompt = options?.prompt;
    try {
      // Fail loud, not blank: a build whose Azure credentials weren't injected
      // (or are the .env.example placeholders) would otherwise open a Microsoft
      // sign-in window that renders blank — the "credentials completely broken,
      // can't even see the login" outage. Surface a specific, actionable error
      // so the operator knows it's a bad build, not a user/network problem.
      if (!azureConfigValid) {
        return {
          success: false,
          error: {
            code: 'MISCONFIGURED_CREDENTIALS',
            message:
              'This build is missing its Microsoft sign-in credentials and cannot sign in. ' +
              'Reinstall the previous working version, or rebuild with AZURE_CLIENT_ID and ' +
              'AZURE_TENANT_ID set.',
          },
        };
      }

      // A fast double-click on the Sign-in button would overwrite
      // pendingAuthState mid-flight, which then trips the CSRF check on the
      // first window's redirect. Treat the second click as a no-op so the
      // in-flight login can complete; the renderer ignores LOGIN_IN_PROGRESS.
      if (this.pendingAuthState !== null) {
        return {
          success: false,
          error: { code: 'LOGIN_IN_PROGRESS', message: 'A sign-in is already in progress' },
        };
      }

      // PROACTIVE pre-login sweep. When there is no in-flight login AND
      // no signed-in account, wipe the partition cookies BEFORE we open the auth
      // window. Sign-out and sign-in must be symmetric: a prior crash or an
      // out-of-band cookie can otherwise leave a half-authenticated jar that
      // silently signs the user into the WRONG account (no select_account
      // prompt). Sweeping first guarantees the prompt is honored.
      await this.ensurePreLoginCookieSweep();

      // Clear any stale AAD error captured by a previous failed attempt so a
      // subsequent cancel doesn't surface yesterday's consent_required message.
      this.lastAuthError = null;

      // Remember who was signed in (if anyone) so we can report whether
      // this login reused the same account. After the proactive sweep the live
      // account is normally null, so we also consult the persisted user info.
      const previousAccountId =
        this.account?.homeAccountId ??
        (await this.deps.persistentCache.loadUserInfo())?.homeAccountId ??
        null;

      // Generate PKCE codes
      const { verifier, challenge } = await this.deps.cryptoProvider.generatePkceCodes();

      // Generate state for CSRF protection
      const state = this.generateState();
      this.pendingAuthState = state;

      // Get authorization URL with state parameter. Only include
      // `prompt` when a caller explicitly asked for one (switchAccount →
      // 'select_account'). Omitting it lets AAD silently continue an existing
      // session instead of always forcing the account picker.
      const authCodeUrlParams: Record<string, unknown> = {
        scopes: loginRequest.scopes,
        redirectUri: 'http://localhost',
        codeChallenge: challenge,
        codeChallengeMethod: 'S256',
        state: state,
      };
      if (prompt !== undefined) {
        authCodeUrlParams.prompt = prompt;
      }

      const authCodeUrl = await this.deps.msalClient.getAuthCodeUrl(authCodeUrlParams);

      // Open interactive login window
      const authResult = await this.deps.openAuthWindow(authCodeUrl, state, (description) => {
        this.lastAuthError = description;
      });

      if (!authResult) {
        this.pendingAuthState = null;
        // If openAuthWindow captured an AAD error_description (consent_required,
        // access_denied, etc.), surface it instead of the generic cancel path.
        if (this.lastAuthError !== null) {
          const message = this.lastAuthError;
          this.lastAuthError = null;
          return {
            success: false,
            error: { code: 'AAD_AUTH_ERROR', message },
          };
        }
        return {
          success: false,
          error: { code: 'LOGIN_CANCELLED', message: 'Login was cancelled by user' },
        };
      }

      // Validate state to prevent CSRF. Softened user-facing message — the most
      // common cause in practice is a self-inflicted race, not an attack.
      if (authResult.state !== this.pendingAuthState) {
        this.pendingAuthState = null;
        return {
          success: false,
          error: { code: 'CSRF_VALIDATION_FAILED', message: 'Sign-in could not be verified. Please try again.' },
        };
      }

      this.pendingAuthState = null;
      const authCode = authResult.code;

      // Exchange auth code for tokens
      const tokenResponse = await this.deps.msalClient.acquireTokenByCode({
        code: authCode,
        scopes: loginRequest.scopes,
        redirectUri: 'http://localhost',
        codeVerifier: verifier,
      });

      if (tokenResponse && tokenResponse.account) {
        this.account = tokenResponse.account;
        this.cacheInitialized = true; // we now hold an authoritative account
        // The just-signed-in account becomes the active one. Set+persist
        // it so token/user/expiry reads target it now and after a restart. This also
        // overwrites any stale active id from a previous account (account switch).
        await this.setActiveAccountInternal(tokenResponse.account.homeAccountId);
        await this.persistCache();

        const userInfo: CachedUserInfo = {
          homeAccountId: tokenResponse.account.homeAccountId,
          displayName: tokenResponse.account.name || tokenResponse.account.username,
          email: tokenResponse.account.username,
        };
        await this.deps.persistentCache.saveUserInfo(userInfo);

        // True only when we resolved to the SAME account that was signed
        // in before this login. Lets the renderer/main preserve per-account state
        // on a re-login and reset it on an account switch.
        const reusedPreviousAccount =
          previousAccountId !== null && previousAccountId === tokenResponse.account.homeAccountId;

        return {
          success: true,
          data: {
            success: true,
            user: {
              id: tokenResponse.account.homeAccountId,
              displayName: tokenResponse.account.name || tokenResponse.account.username,
              email: tokenResponse.account.username,
            },
            reusedPreviousAccount,
          },
        };
      }

      return {
        success: false,
        error: { code: 'LOGIN_FAILED', message: 'No result from authentication' },
      };
    } catch (error) {
      // Reset the in-flight guard on ANY throw after it was armed (e.g.
      // getAuthCodeUrl / acquireTokenByCode rejecting). Otherwise pendingAuthState
      // stays set and every later login returns LOGIN_IN_PROGRESS — a permanent
      // sign-in lockout until the app is restarted.
      this.pendingAuthState = null;
      return {
        success: false,
        error: { code: 'LOGIN_FAILED', message: String(error) },
      };
    }
  }

  /**
   * Proactive pre-login cookie sweep. Only runs when there is genuinely
   * no session in flight and no account — i.e. a clean "signed out" state — so we
   * never disturb a re-auth that is mid-handshake. Sequential + fail-loud, mirror
   * of logout(): a sweep that silently fails would re-introduce the stale-cookie
   * bug we are sweeping to prevent.
   */
  private async ensurePreLoginCookieSweep(): Promise<void> {
    if (this.account !== null || this.pendingAuthState !== null) return;
    const accounts = await this.deps.msalClient.getTokenCache().getAllAccounts();
    if (accounts.length > 0) return;
    await this.clearCookieJarsSequential();
  }

  /**
   * Clear every cookie jar ONE AT A TIME and fail loud (not Promise.allSettled,
   * which swallows per-jar errors). If any jar fails to clear we throw so the
   * caller surfaces it instead of pretending the session was fully cleared.
   *
   * Clears the FULL per-account web-storage set on the partition session, not
   * just cookies. Power BI's embedded content caches workspace/report data in
   * localStorage, IndexedDB, service workers, and the cache storage; clearing
   * only cookies on logout/account-switch would leave that data behind, letting
   * a second account surface the first account's cached content. These are the
   * valid Electron `clearStorageData` storage keys (verified for Electron 42).
   */
  private async clearCookieJarsSequential(): Promise<void> {
    const jars = this.deps.getCookieJars();
    for (const jar of jars) {
      await jar.clearStorageData({
        storages: ['cookies', 'localstorage', 'indexdb', 'serviceworkers', 'cachestorage'],
      });
      // clearStorageData leaves Electron's HTTP cache intact, so a stale
      // api.powerbi.com response could bleed across tenants after a logout /
      // account switch. Flush the HTTP cache on each jar too. Same sequential +
      // fail-loud contract: a swallowed failure would re-introduce the leak.
      await jar.clearCache();
    }
  }

  async getAccessToken(): Promise<IPCResponse<TokenResult>> {
    // Single-flight: parallel IPC callers (e.g. workspace expansion firing many
    // getEmbedToken requests at once) would race two acquireTokenSilent +
    // persistCache cycles, which can corrupt the MSAL cache. Coalesce them.
    if (this.tokenAcquisitionInFlight !== null) {
      return await this.tokenAcquisitionInFlight;
    }

    const work = (async (): Promise<IPCResponse<TokenResult>> => {
      try {
        if (!this.account) {
          await this.initializeCache();
          // Resolve the ACTIVE account (by persisted homeAccountId,
          // adopting accounts[0] on first run) instead of a bare accounts[0] read.
          const active = await this.getActiveAccount();
          if (!active) {
            return {
              success: false,
              error: { code: 'NO_ACCOUNT', message: 'No authenticated account' },
            };
          }
          this.account = active;
        }

        const account = this.account;

        // Try silent token acquisition first
        try {
          const result = await this.deps.msalClient.acquireTokenSilent({
            ...silentRequest,
            account,
          });

          await this.persistCache();
          // Record expiry keyed by THIS account's homeAccountId so the
          // validateToken short-circuit can only ever trust this account's token.
          if (result.expiresOn) {
            this.lastKnownExpiryByAccount.set(account.homeAccountId, result.expiresOn.getTime());
          } else {
            this.lastKnownExpiryByAccount.delete(account.homeAccountId);
          }
          return {
            success: true,
            data: {
              accessToken: result.accessToken,
              expiresOn: result.expiresOn ? result.expiresOn.toISOString() : null,
            },
          };
        } catch (error) {
          if (error instanceof InteractionRequiredAuthError) {
            // Drop THIS account's expiry so the validateToken short-circuit
            // cannot return success:true for a session that requires interaction.
            this.lastKnownExpiryByAccount.delete(account.homeAccountId);
            // Token expired or scopes changed. Do NOT clear the cache — just report that
            // interactive sign-in is needed; the renderer routes to the login screen.
            return {
              success: false,
              error: { code: 'INTERACTION_REQUIRED', message: 'Session expired. Please sign in again.' },
            };
          }
          throw error;
        }
      } catch (error) {
        // Invalidate the validateToken short-circuit cache so a stale expiry
        // can't keep returning success:true while the underlying acquisition
        // is broken. Drop only the active account's expiry (others untouched).
        if (this.account) {
          this.lastKnownExpiryByAccount.delete(this.account.homeAccountId);
        }
        return {
          success: false,
          error: { code: 'TOKEN_FAILED', message: String(error) },
        };
      }
    })();

    this.tokenAcquisitionInFlight = work;
    try {
      return await work;
    } finally {
      // Always release the lock — success OR throw — so a failed acquisition
      // does not permanently wedge every future caller.
      this.tokenAcquisitionInFlight = null;
    }
  }

  async logout(): Promise<IPCResponse<void>> {
    try {
      // Capture who is signing out BEFORE we wipe state, so we can honor
      // usageClearOnLogout and wipe that account's usage history if configured.
      const loggedOutAccountId =
        this.account?.homeAccountId ??
        (await this.deps.persistentCache.loadUserInfo())?.homeAccountId ??
        null;

      await this.deps.persistentCache.clearCache();
      this.account = null;
      this.lastKnownExpiryByAccount.clear();
      // Clear the active-account selection. clearCache() already
      // deleted the persisted id; null the in-memory copy and re-arm the loader so
      // a subsequent read re-hydrates from the (now-empty) store rather than the
      // stale value. Belt-and-braces persist(null) in case clearCache is partial.
      this.activeHomeAccountId = null;
      this.activeIdLoaded = false;
      await this.deps.persistentCache.saveActiveAccountId(null);
      // The persistent cache is gone; the next read must re-hydrate from empty.
      this.cacheInitialized = false;

      // Clear MSAL cache
      const accounts = await this.deps.msalClient.getTokenCache().getAllAccounts();
      for (const account of accounts) {
        await this.deps.msalClient.getTokenCache().removeAccount(account);
      }

      // Clear cookies from BOTH sessions SEQUENTIALLY and FAIL LOUD.
      // - partition session (PARTITION_NAME): hosts the AAD auth window AND the
      //   embedded AppViewer <webview> that loads app.powerbi.com — this is where
      //   the active AAD SSO cookies live. Clearing it ends the single-sign-on
      //   session that lets app-opens skip credential prompts.
      // - defaultSession: legacy / belt-and-braces for pre-bridge installs.
      // Promise.allSettled would swallow per-jar failures and let logout report
      // success while cookies survived (the user stays silently signed in); a
      // clear error fails the whole logout so the renderer can warn instead of
      // lying.
      await this.clearCookieJarsSequential();

      // Honor the usage-history retention policy. 'always' wipes this
      // account's records; 'on-shared-machine' is treated as a wipe on logout
      // (the machine is, by configuration, shared). 'never' keeps history.
      if (loggedOutAccountId) {
        const policy = this.deps.getUsageClearOnLogout();
        if (policy === 'always' || policy === 'on-shared-machine') {
          this.deps.clearUsageForAccount(loggedOutAccountId);
        }
      }

      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        error: { code: 'LOGOUT_FAILED', message: String(error) },
      };
    }
  }

  /**
   * In-app account switch. Fully tears down the current session
   * (logout: clears the persistent + MSAL caches, the lastKnownExpiry map, the
   * active-account selection, AND both cookie jars incl. the partition jar) and
   * then re-runs an interactive login with prompt=select_account so AAD shows
   * the account picker. The hard logout-first is deliberate: it guarantees the
   * picker is honored (no stale SSO cookie silently re-signing the same account)
   * and that no per-account state from the outgoing account leaks into the new
   * one.
   *
   * Returns the SAME shape as login() so the renderer can replicate its
   * login-success handling. If logout fails we surface that failure rather than
   * opening a login window on top of a half-torn-down session. A LOGIN_CANCELLED
   * (or any login failure) is returned as-is; the user is already signed out, so
   * the renderer falls back to the login screen.
   */
  async switchAccount(): Promise<IPCResponse<AuthResult>> {
    const logoutResult = await this.logout();
    if (!logoutResult.success) {
      return {
        success: false,
        error: logoutResult.error,
      };
    }
    return await this.login({ prompt: 'select_account' });
  }
}

// ---------------------------------------------------------------------------
// Factory + production wiring
// ---------------------------------------------------------------------------

export type { AuthService };

/**
 * Construct an AuthService from explicit dependencies. Tests pass fakes;
 * production passes the electron/MSAL-backed deps built by buildProductionDeps().
 */
export function createAuthService(deps: AuthServiceDeps): AuthService {
  return new AuthService(deps);
}

/**
 * Builds the interactive auth-window opener bound to the real BrowserWindow /
 * shell. Kept out of createAuthService so the service core stays electron-free.
 */
function createElectronAuthWindowOpener(): AuthWindowOpener {
  return (authUrl, _expectedState, onAadError) =>
    new Promise<{ code: string; state: string } | null>((resolve) => {
      const authWindow = new BrowserWindow({
        width: 500,
        height: 700,
        show: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          // Auth window only loads Microsoft origins (enforced by the
          // will-navigate allowlist); sandbox is appropriate and defends
          // against renderer compromise reaching Node APIs.
          sandbox: true,
          // CRITICAL — match the AppViewer webview's partition so AAD SSO
          // cookies (ESTSAUTH/ESTSAUTHPERSISTENT) deposited here during
          // sign-in are immediately available when the user opens a Power BI
          // App. Without this, the user signs in to MSAL but the embedded
          // app.powerbi.com webview sees an empty cookie jar and prompts the
          // user for credentials AGAIN. This was the original reason this
          // app exists: one sign-in, no re-prompts.
          partition: PARTITION_NAME,
        },
      });

      const ALLOWED_AUTH_HOSTS = ['login.microsoftonline.com', 'login.live.com', 'aadcdn.msftauth.net', 'aadcdn.msauth.net', 'localhost'];

      // settled-guard: the 120s timer, the redirect handler, and the
      // window-closed event can all race. settle() ensures only the first
      // one resolves and the timer is always cleared.
      let settled = false;
      const settle = (value: { code: string; state: string } | null) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        resolve(value);
      };
      const timer = setTimeout(() => {
        if (!settled) {
          try { authWindow.close(); } catch { /* already gone */ }
          settle(null);
        }
      }, 120000);

      const isAllowedAuthHost = (url: string): boolean => {
        try {
          const hostname = new URL(url).hostname;
          return ALLOWED_AUTH_HOSTS.some((d) => hostname === d || hostname.endsWith('.' + d));
        } catch {
          return false;
        }
      };

      const handleRedirect = (url: string) => {
        const urlObj = new URL(url);
        if (urlObj.hostname === 'localhost') {
          const code = urlObj.searchParams.get('code');
          const state = urlObj.searchParams.get('state');
          // AAD reports user-facing failures (consent_required, access_denied,
          // interaction_required, etc.) by redirecting to the redirect_uri with
          // error + error_description query params instead of a code. Capture
          // the description so login() can surface it as AAD_AUTH_ERROR.
          const aadError = urlObj.searchParams.get('error');
          const aadErrorDescription = urlObj.searchParams.get('error_description');
          // Record the outcome BEFORE closing the window: close() can emit 'closed'
          // synchronously on some Electron builds, whose handler settles null — and
          // the settled-guard keeps the FIRST settle. Settling here first guarantees
          // a successful {code,state} is preserved instead of a spurious "cancelled".
          if (aadError) {
            onAadError(aadErrorDescription || aadError);
            settle(null);
          } else if (code && state) {
            settle({ code, state });
          } else {
            settle(null);
          }
          try { authWindow.close(); } catch { /* already gone */ }
        }
      };

      // Deny any attempt by the auth page to open a child window.
      // Vetted https links are forwarded to the system browser instead.
      authWindow.webContents.setWindowOpenHandler(({ url }) => {
        try {
          const parsed = new URL(url);
          if (parsed.protocol === 'https:') {
            // Only allow known auth CDN/AAD hosts to pop out; everything else
            // is silently denied to prevent phishing overlays.
            if (isAllowedAuthHost(url)) {
              shell.openExternal(url).catch(() => { /* non-fatal */ });
            }
          }
        } catch {
          // ignore invalid URL
        }
        return { action: 'deny' };
      });

      authWindow.webContents.on('will-redirect', (event, url) => {
        // Mirror the will-navigate allowlist: AAD/CDN hosts pass through,
        // anything else (a redirect bug or a spoofed redirect) is blocked
        // before it can load arbitrary content into our auth window.
        if (!isAllowedAuthHost(url)) {
          event.preventDefault();
          return;
        }
        handleRedirect(url);
      });

      authWindow.webContents.on('will-navigate', (event, url) => {
        if (!isAllowedAuthHost(url)) {
          event.preventDefault();
          return;
        }
        handleRedirect(url);
      });

      authWindow.on('closed', () => {
        settle(null);
      });

      // NOTE: a CDP / DevTools-protocol WebAuthn-passkey
      // suppression used to live here (attach the debugger, then inject a
      // document-start script that neutered window.PublicKeyCredential). It was
      // REMOVED: attaching the debugger + injecting into Microsoft's sign-in page
      // broke that page's rendering in the PACKAGED build — the credentials window
      // came up BLANK and users could not sign in at all. A reappearing passkey
      // prompt is an annoyance; a blank login window is a hard outage. Loading the
      // AAD page plainly restores a working sign-in. Passkey suppression can be
      // re-introduced later via a safer mechanism (e.g. a preload that only cancels
      // the conditional-mediation request) once verified NOT to break the page.
      //
      // Catch loadURL rejections (offline, DNS failure, force-close mid-nav) so we
      // settle null -> login screen instead of leaking an unhandledRejection.
      authWindow.loadURL(authUrl).catch((err) => {
        console.warn('[Auth] Auth window loadURL failed:', err);
        settle(null);
      });
    });
}

/** Build the production dependency set (electron + MSAL backed). */
function buildProductionDeps(): AuthServiceDeps {
  const pca = new PublicClientApplication(msalConfig);
  const cryptoProvider = new CryptoProvider();
  return {
    // MSAL's PublicClientApplication structurally satisfies MsalClientPort.
    msalClient: pca as unknown as MsalClientPort,
    cryptoProvider,
    persistentCache: realTokenCache,
    getCookieJars: () => [
      session.defaultSession,
      session.fromPartition(PARTITION_NAME),
    ],
    openAuthWindow: createElectronAuthWindowOpener(),
    getUsageClearOnLogout: () => {
      const result = settingsService.getSettings();
      return result.success ? result.data.usageClearOnLogout : 'never';
    },
    clearUsageForAccount: (homeAccountId) =>
      usageTrackingService.clearUsageDataForAccount(homeAccountId),
    logger: console,
  };
}

// Lazy production singleton — see singleton.ts for the accessor. The exported
// `authService` is a thin proxy so existing `import { authService }` call sites
// (index.ts, ipc/auth.ts, powerbi-api.ts) keep working while construction is
// deferred until first use (no electron/MSAL touched at import time).
import { getAuthService } from './singleton';

export { buildProductionDeps };

export const authService: AuthService = new Proxy({} as AuthService, {
  get(_target, prop, receiver) {
    const svc = getAuthService();
    const value = Reflect.get(svc as object, prop, receiver);
    return typeof value === 'function' ? value.bind(svc) : value;
  },
});
