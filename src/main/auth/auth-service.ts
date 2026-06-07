import {
  PublicClientApplication,
  AccountInfo,
  InteractionRequiredAuthError,
  CryptoProvider,
} from '@azure/msal-node';
import { BrowserWindow, session } from 'electron';
import { randomFillSync } from 'crypto';
import { msalConfig, loginRequest, silentRequest } from './msal-config';
import { tokenCache, CachedUserInfo } from './token-cache';
import { UserInfo, AuthResult, IPCResponse, TokenResult } from '../../shared/types';
import { PARTITION_NAME } from '../../shared/constants';

class AuthService {
  private pca: PublicClientApplication;
  private account: AccountInfo | null = null;
  private cryptoProvider: CryptoProvider;
  private pendingAuthState: string | null = null; // For CSRF validation
  // Cached "this token is good through N" — every protected-route check used to
  // call acquireTokenSilent (which hits MSAL's persistence layer and AAD if the
  // refresh window is close). We short-circuit when we already know the cached
  // token is far from expiry.
  private lastKnownExpiry: number | null = null;
  // Captures AAD-returned error_description so login() can surface the real
  // reason (consent_required, access_denied, etc.) instead of generic
  // LOGIN_FAILED. Cleared after consumption.
  private lastAuthError: string | null = null;
  // Single-flight lock for getAccessToken(): concurrent IPC calls used to race
  // two acquireTokenSilent + persistCache cycles against each other, which can
  // corrupt the MSAL cache. All callers now await the same in-flight promise.
  private tokenAcquisitionInFlight: Promise<IPCResponse<TokenResult>> | null = null;

  constructor() {
    this.pca = new PublicClientApplication(msalConfig);
    this.cryptoProvider = new CryptoProvider();
  }

  /**
   * Generate a cryptographically random state value for CSRF protection
   */
  private generateState(): string {
    const array = new Uint8Array(32);
    randomFillSync(array);
    return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  async initialize(): Promise<void> {
    await this.initializeCache();
  }

  private async initializeCache(): Promise<void> {
    try {
      const cachedData = await tokenCache.loadCache();
      if (cachedData) {
        this.pca.getTokenCache().deserialize(cachedData);

        // Try to get cached account
        const accounts = await this.pca.getTokenCache().getAllAccounts();
        if (accounts.length > 0) {
          this.account = accounts[0] ?? null;
        }
      }
    } catch (error) {
      console.warn('[Auth] Cache initialization failed, starting fresh:', error);
    }
  }

  private async persistCache(): Promise<void> {
    try {
      const cache = this.pca.getTokenCache().serialize();
      await tokenCache.saveCache(cache);
    } catch (error) {
      console.warn('[Auth] Cache persistence failed:', error);
    }
  }

  async isAuthenticated(): Promise<IPCResponse<boolean>> {
    try {
      await this.initializeCache();
      const accounts = await this.pca.getTokenCache().getAllAccounts();
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
      // The 5-minute buffer keeps proactive refresh in the embed layer from
      // racing us, and a stale cache simply falls through to the full check.
      // Defense-in-depth: also require a live account — if logout nulled the
      // account but a future refactor left lastKnownExpiry behind, the
      // short-circuit must still refuse to lie.
      if (
        this.account !== null &&
        this.lastKnownExpiry !== null &&
        this.lastKnownExpiry - Date.now() > 5 * 60 * 1000
      ) {
        return { success: true, data: true };
      }
      const tokenResult = await this.getAccessToken();
      return { success: true, data: tokenResult.success };
    } catch (error) {
      console.warn('[Auth] Token validation failed:', error);
      return { success: true, data: false };
    }
  }

  async getCurrentUser(): Promise<IPCResponse<UserInfo | null>> {
    try {
      if (!this.account) {
        const userInfo = await tokenCache.loadUserInfo();
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

  async login(): Promise<IPCResponse<AuthResult>> {
    try {
      // A fast double-click on the Sign-in button used to overwrite
      // pendingAuthState mid-flight, which then tripped the CSRF check on the
      // first window's redirect. Treat the second click as a no-op so the
      // in-flight login can complete; the renderer ignores LOGIN_IN_PROGRESS.
      if (this.pendingAuthState !== null) {
        return {
          success: false,
          error: { code: 'LOGIN_IN_PROGRESS', message: 'A sign-in is already in progress' },
        };
      }

      // Clear any stale AAD error captured by a previous failed attempt so a
      // subsequent cancel doesn't surface yesterday's consent_required message.
      this.lastAuthError = null;

      // Generate PKCE codes
      const { verifier, challenge } = await this.cryptoProvider.generatePkceCodes();

      // Generate state for CSRF protection
      const state = this.generateState();
      this.pendingAuthState = state;

      // Get authorization URL with state parameter
      const authCodeUrlParams = {
        scopes: loginRequest.scopes,
        redirectUri: 'http://localhost',
        codeChallenge: challenge,
        codeChallengeMethod: 'S256',
        state: state,
        prompt: 'select_account',
      };

      const authCodeUrl = await this.pca.getAuthCodeUrl(authCodeUrlParams);

      // Open interactive login window
      const authResult = await this.openAuthWindow(authCodeUrl, state);

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
      const tokenResponse = await this.pca.acquireTokenByCode({
        code: authCode,
        scopes: loginRequest.scopes,
        redirectUri: 'http://localhost',
        codeVerifier: verifier,
      });

      if (tokenResponse && tokenResponse.account) {
        this.account = tokenResponse.account;
        await this.persistCache();

        const userInfo: CachedUserInfo = {
          homeAccountId: tokenResponse.account.homeAccountId,
          displayName: tokenResponse.account.name || tokenResponse.account.username,
          email: tokenResponse.account.username,
        };
        await tokenCache.saveUserInfo(userInfo);

        return {
          success: true,
          data: {
            success: true,
            user: {
              id: tokenResponse.account.homeAccountId,
              displayName: tokenResponse.account.name || tokenResponse.account.username,
              email: tokenResponse.account.username,
            },
          },
        };
      }

      return {
        success: false,
        error: { code: 'LOGIN_FAILED', message: 'No result from authentication' },
      };
    } catch (error) {
      return {
        success: false,
        error: { code: 'LOGIN_FAILED', message: String(error) },
      };
    }
  }

  private async openAuthWindow(authUrl: string, _expectedState: string): Promise<{ code: string; state: string } | null> {
    return new Promise((resolve) => {
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
          try { authWindow.close(); } catch { /* already gone */ }
          if (aadError) {
            this.lastAuthError = aadErrorDescription || aadError;
            settle(null);
            return;
          }
          if (code && state) {
            settle({ code, state });
          } else {
            settle(null);
          }
        }
      };

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

      // Catch loadURL rejections — if the URL fails to load (offline, DNS
      // failure, force-close during navigation) we end up with an
      // unhandledRejection without this catch. Settling null routes the
      // user back to the login screen cleanly.
      authWindow.loadURL(authUrl).catch((err) => {
        console.warn('[Auth] Auth window loadURL failed:', err);
        settle(null);
      });
    });
  }

  async getAccessToken(): Promise<IPCResponse<TokenResult>> {
    // Single-flight: parallel IPC callers (e.g. workspace expansion firing many
    // getEmbedToken requests at once) used to race two acquireTokenSilent +
    // persistCache cycles, which can corrupt the MSAL cache. Coalesce them.
    if (this.tokenAcquisitionInFlight !== null) {
      return await this.tokenAcquisitionInFlight;
    }

    const work = (async (): Promise<IPCResponse<TokenResult>> => {
      try {
        if (!this.account) {
          await this.initializeCache();
          const accounts = await this.pca.getTokenCache().getAllAccounts();
          if (accounts.length === 0) {
            return {
              success: false,
              error: { code: 'NO_ACCOUNT', message: 'No authenticated account' },
            };
          }
          const firstAccount = accounts[0];
          if (!firstAccount) {
            return {
              success: false,
              error: { code: 'NO_ACCOUNT', message: 'No authenticated account' },
            };
          }
          this.account = firstAccount;
        }

        // Try silent token acquisition first
        try {
          const result = await this.pca.acquireTokenSilent({
            ...silentRequest,
            account: this.account,
          });

          await this.persistCache();
          // Record expiry so the next validateToken() can short-circuit.
          this.lastKnownExpiry = result.expiresOn ? result.expiresOn.getTime() : null;
          return {
            success: true,
            data: {
              accessToken: result.accessToken,
              expiresOn: result.expiresOn ? result.expiresOn.toISOString() : null,
            },
          };
        } catch (error) {
          if (error instanceof InteractionRequiredAuthError) {
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
        // is broken.
        this.lastKnownExpiry = null;
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
      await tokenCache.clearCache();
      this.account = null;
      this.lastKnownExpiry = null;

      // Clear MSAL cache
      const accounts = await this.pca.getTokenCache().getAllAccounts();
      for (const account of accounts) {
        await this.pca.getTokenCache().removeAccount(account);
      }

      // Clear cookies from BOTH sessions:
      // - partition session (PARTITION_NAME): hosts the AAD auth window AND
      //   the embedded AppViewer <webview> that loads app.powerbi.com. This
      //   is where the active AAD SSO cookies live; clearing it ends the
      //   single-sign-on session that lets app-opens skip credential prompts.
      // - defaultSession: legacy / belt-and-braces; older builds put the auth
      //   window here, so we clear it too to wipe any leftover cookies from
      //   a pre-bridge install.
      try {
        await Promise.allSettled([
          session.defaultSession.clearStorageData({ storages: ['cookies'] }),
          session.fromPartition(PARTITION_NAME).clearStorageData({ storages: ['cookies'] }),
        ]);
      } catch (cookieErr) {
        console.warn('[Auth] Cookie clear on logout failed (non-fatal):', cookieErr);
      }

      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        error: { code: 'LOGOUT_FAILED', message: String(error) },
      };
    }
  }
}

export const authService = new AuthService();
