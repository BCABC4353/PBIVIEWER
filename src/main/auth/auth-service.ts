import {
  PublicClientApplication,
  AccountInfo,
  InteractionRequiredAuthError,
  CryptoProvider,
  AuthorizationCodeRequest,
} from '@azure/msal-node';
import { BrowserWindow, session, shell } from 'electron';
import { randomFillSync } from 'crypto';
import { msalConfig, loginRequest, silentRequest, adminScopes, azureConfigValid } from './msal-config';
import { tokenCache as realTokenCache, CachedUserInfo } from './token-cache';
import { settingsService } from '../services/settings-service';
import { usageTrackingService } from '../services/usage-tracking-service';
import { UserInfo, AuthResult, IPCResponse, TokenResult } from '../../shared/types';
import { PARTITION_NAME, TOKEN } from '../../shared/constants';


export interface TokenCachePort {
  getAllAccounts(): Promise<AccountInfo[]>;
  removeAccount(account: AccountInfo): Promise<void>;
  serialize(): string;
  deserialize(cache: string): void;
}

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

export interface PersistentCachePort {
  saveCache(cache: string): Promise<void>;
  loadCache(): Promise<string | null>;
  clearCache(): Promise<void>;
  saveUserInfo(userInfo: CachedUserInfo): Promise<void>;
  loadUserInfo(): Promise<CachedUserInfo | null>;
  onCorruption(listener: () => void): () => void;
  saveActiveAccountId(homeAccountId: string | null): Promise<void>;
  loadActiveAccountId(): Promise<string | null>;
}

export interface CookieJarPort {
  clearStorageData(options?: {
    storages?: Array<
      'cookies' | 'localstorage' | 'indexdb' | 'serviceworkers' | 'cachestorage'
    >;
  }): Promise<void>;
  clearCache(): Promise<void>;
}

export type AuthWindowOpener = (
  authUrl: string,
  expectedState: string,
  onAadError: (description: string) => void,
) => Promise<{ code: string; state: string } | null>;

export interface AuthServiceDeps {
  msalClient: MsalClientPort;
  cryptoProvider: Pick<CryptoProvider, 'generatePkceCodes'>;
  persistentCache: PersistentCachePort;
  getCookieJars: () => CookieJarPort[];
  openAuthWindow: AuthWindowOpener;
  getUsageClearOnLogout: () => 'always' | 'never' | 'on-shared-machine';
  clearUsageForAccount: (homeAccountId: string) => void;
  logger: Pick<typeof console, 'warn' | 'error'>;
}

class AuthService {
  private readonly deps: AuthServiceDeps;
  private account: AccountInfo | null = null;
  private pendingAuthState: string | null = null;
  private interactiveAuthInFlight = false;
  private cacheInitialized = false;
  private lastKnownExpiryByAccount = new Map<string, number>();
  private activeHomeAccountId: string | null = null;
  private activeIdLoaded = false;
  private lastAuthError: string | null = null;
  private tokenAcquisitionInFlight: Promise<IPCResponse<TokenResult>> | null = null;
  private tokenPersistMutex: Promise<void> = Promise.resolve();

  constructor(deps: AuthServiceDeps) {
    this.deps = deps;
    this.deps.persistentCache.onCorruption(() => this.invalidateCache());
  }

  private generateState(): string {
    const array = new Uint8Array(32);
    randomFillSync(array);
    return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  invalidateCache(): void {
    this.account = null;
    this.lastKnownExpiryByAccount.clear();
    this.activeHomeAccountId = null;
    this.activeIdLoaded = false;
    this.cacheInitialized = false;
  }

  async initialize(): Promise<void> {
    await this.initializeCache();
  }

  private async initializeCache(): Promise<void> {
    if (this.cacheInitialized) return;
    this.cacheInitialized = true;
    try {
      const cachedData = await this.deps.persistentCache.loadCache();
      if (cachedData) {
        try {
          this.deps.msalClient.getTokenCache().deserialize(cachedData);
        } catch (deserializeError) {
          this.deps.logger.warn('[Auth] Discarding unreadable persisted cache:', deserializeError);
          await this.deps.persistentCache.clearCache();
          return;
        }

        if (this.account === null) {
          this.account = await this.getActiveAccount();
        }
      }
    } catch (error) {
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

  private runSerializedTokenAcquisition<T>(work: () => Promise<T>): Promise<T> {
    const result = this.tokenPersistMutex.then(work);
    this.tokenPersistMutex = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async loadActiveIdOnce(): Promise<void> {
    if (this.activeIdLoaded) return;
    this.activeIdLoaded = true;
    try {
      this.activeHomeAccountId = await this.deps.persistentCache.loadActiveAccountId();
    } catch (error) {
      this.activeIdLoaded = false;
      this.deps.logger.warn('[Auth] Active account id load failed:', error);
    }
  }

  async getActiveAccount(): Promise<AccountInfo | null> {
    await this.loadActiveIdOnce();
    const accounts = await this.deps.msalClient.getTokenCache().getAllAccounts();
    if (accounts.length === 0) return null;

    if (this.activeHomeAccountId !== null) {
      const match = accounts.find((a) => a.homeAccountId === this.activeHomeAccountId);
      if (match) return match;
    }

    const adopted = accounts[0];
    if (!adopted) return null;
    await this.setActiveAccountInternal(adopted.homeAccountId);
    return adopted;
  }

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
      this.account = match;
      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        error: { code: 'SET_ACTIVE_ACCOUNT_FAILED', message: String(error) },
      };
    }
  }

  private async setActiveAccountInternal(homeAccountId: string): Promise<void> {
    this.activeHomeAccountId = homeAccountId;
    this.activeIdLoaded = true;
    await this.deps.persistentCache.saveActiveAccountId(homeAccountId);
  }

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

  async validateToken(): Promise<IPCResponse<boolean>> {
    try {
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
      if (!this.account) {
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

  async login(options?: { prompt?: string }): Promise<IPCResponse<AuthResult>> {
    const prompt = options?.prompt;
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

    if (this.interactiveAuthInFlight) {
      return {
        success: false,
        error: { code: 'LOGIN_IN_PROGRESS', message: 'A sign-in is already in progress' },
      };
    }

    this.interactiveAuthInFlight = true;
    try {
      await this.ensurePreLoginCookieSweep();

      this.lastAuthError = null;

      const previousAccountId =
        this.account?.homeAccountId ??
        (await this.deps.persistentCache.loadUserInfo())?.homeAccountId ??
        null;

      const { verifier, challenge } = await this.deps.cryptoProvider.generatePkceCodes();

      const state = this.generateState();
      this.pendingAuthState = state;

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

      const authResult = await this.deps.openAuthWindow(authCodeUrl, state, (description) => {
        this.lastAuthError = description;
      });

      if (!authResult) {
        this.pendingAuthState = null;
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

      if (authResult.state !== this.pendingAuthState) {
        this.pendingAuthState = null;
        return {
          success: false,
          error: { code: 'CSRF_VALIDATION_FAILED', message: 'Sign-in could not be verified. Please try again.' },
        };
      }

      this.pendingAuthState = null;
      const authCode = authResult.code;

      const tokenResponse = await this.deps.msalClient.acquireTokenByCode({
        code: authCode,
        scopes: loginRequest.scopes,
        redirectUri: 'http://localhost',
        codeVerifier: verifier,
      });

      if (tokenResponse && tokenResponse.account) {
        this.account = tokenResponse.account;
        this.cacheInitialized = true;
        await this.setActiveAccountInternal(tokenResponse.account.homeAccountId);
        await this.persistCache();

        const userInfo: CachedUserInfo = {
          homeAccountId: tokenResponse.account.homeAccountId,
          displayName: tokenResponse.account.name || tokenResponse.account.username,
          email: tokenResponse.account.username,
        };
        await this.deps.persistentCache.saveUserInfo(userInfo);

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
      this.pendingAuthState = null;
      return {
        success: false,
        error: { code: 'LOGIN_FAILED', message: String(error) },
      };
    } finally {
      this.pendingAuthState = null;
      this.interactiveAuthInFlight = false;
    }
  }

  private async ensurePreLoginCookieSweep(): Promise<void> {
    if (this.account !== null || this.pendingAuthState !== null) return;
    const accounts = await this.deps.msalClient.getTokenCache().getAllAccounts();
    if (accounts.length > 0) return;
    await this.clearCookieJarsSequential();
  }

  private async clearCookieJarsSequential(): Promise<void> {
    const jars = this.deps.getCookieJars();
    for (const jar of jars) {
      await jar.clearStorageData({
        storages: ['cookies', 'localstorage', 'indexdb', 'serviceworkers', 'cachestorage'],
      });
      await jar.clearCache();
    }
  }

  async getAccessToken(): Promise<IPCResponse<TokenResult>> {
    if (this.tokenAcquisitionInFlight !== null) {
      return await this.tokenAcquisitionInFlight;
    }

    const work = (async (): Promise<IPCResponse<TokenResult>> => {
      try {
        if (!this.account) {
          await this.initializeCache();
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

        try {
          const result = await this.runSerializedTokenAcquisition(async () => {
            const acquired = await this.deps.msalClient.acquireTokenSilent({
              ...silentRequest,
              account,
            });
            await this.persistCache();
            return acquired;
          });
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
            this.lastKnownExpiryByAccount.delete(account.homeAccountId);
            return {
              success: false,
              error: { code: 'INTERACTION_REQUIRED', message: 'Session expired. Please sign in again.' },
            };
          }
          throw error;
        }
      } catch (error) {
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
      this.tokenAcquisitionInFlight = null;
    }
  }

  async getAdminAccessToken(): Promise<IPCResponse<TokenResult>> {
    try {
      await this.initializeCache();
      const account = this.account ?? (await this.getActiveAccount());
      if (!account) {
        return {
          success: false,
          error: { code: 'NO_ACCOUNT', message: 'No authenticated account' },
        };
      }
      this.account = account;

      try {
        const result = await this.runSerializedTokenAcquisition(async () => {
          const acquired = await this.deps.msalClient.acquireTokenSilent({
            scopes: adminScopes,
            account,
          });
          await this.persistCache();
          return acquired;
        });
        return {
          success: true,
          data: {
            accessToken: result.accessToken,
            expiresOn: result.expiresOn ? result.expiresOn.toISOString() : null,
          },
        };
      } catch (err) {
        if (!(err instanceof InteractionRequiredAuthError)) throw err;
      }

      if (this.interactiveAuthInFlight) {
        return {
          success: false,
          error: { code: 'LOGIN_IN_PROGRESS', message: 'A sign-in is already in progress' },
        };
      }

      this.interactiveAuthInFlight = true;
      try {
        this.lastAuthError = null;
        const { verifier, challenge } = await this.deps.cryptoProvider.generatePkceCodes();
        const state = this.generateState();
        this.pendingAuthState = state;
        const authCodeUrl = await this.deps.msalClient.getAuthCodeUrl({
          scopes: [...loginRequest.scopes, ...adminScopes],
          redirectUri: 'http://localhost',
          codeChallenge: challenge,
          codeChallengeMethod: 'S256',
          state,
        });
        const authResult = await this.deps.openAuthWindow(authCodeUrl, state, (description) => {
          this.lastAuthError = description;
        });
        if (!authResult) {
          const message = this.lastAuthError;
          this.lastAuthError = null;
          return {
            success: false,
            error: message
              ? { code: 'AAD_AUTH_ERROR', message }
              : { code: 'ADMIN_CONSENT_CANCELLED', message: 'The consent window was closed' },
          };
        }
        if (authResult.state !== state) {
          return {
            success: false,
            error: {
              code: 'CSRF_VALIDATION_FAILED',
              message: 'Sign-in could not be verified. Please try again.',
            },
          };
        }
        const tokenResponse = await this.deps.msalClient.acquireTokenByCode({
          code: authResult.code,
          scopes: [...loginRequest.scopes, ...adminScopes],
          redirectUri: 'http://localhost',
          codeVerifier: verifier,
        });
        if (tokenResponse && tokenResponse.account) {
          if (tokenResponse.account.homeAccountId !== account.homeAccountId) {
            return {
              success: false,
              error: {
                code: 'ADMIN_ACCOUNT_MISMATCH',
                message:
                  'The account you approved is different from the one you are signed in with. ' +
                  'Approve admin access with your current account, or switch accounts first.',
              },
            };
          }
          this.account = tokenResponse.account;
          await this.persistCache();
          return {
            success: true,
            data: {
              accessToken: tokenResponse.accessToken,
              expiresOn: tokenResponse.expiresOn ? tokenResponse.expiresOn.toISOString() : null,
            },
          };
        }
        return {
          success: false,
          error: { code: 'ADMIN_TOKEN_FAILED', message: 'No result from consent' },
        };
      } finally {
        this.pendingAuthState = null;
        this.interactiveAuthInFlight = false;
      }
    } catch (error) {
      return {
        success: false,
        error: { code: 'ADMIN_TOKEN_FAILED', message: String(error) },
      };
    }
  }

  async logout(): Promise<IPCResponse<void>> {
    try {
      const loggedOutAccountId =
        this.account?.homeAccountId ??
        (await this.deps.persistentCache.loadUserInfo())?.homeAccountId ??
        null;

      await this.deps.persistentCache.clearCache();
      this.account = null;
      this.lastKnownExpiryByAccount.clear();
      this.activeHomeAccountId = null;
      this.activeIdLoaded = false;
      await this.deps.persistentCache.saveActiveAccountId(null);
      this.cacheInitialized = false;

      const accounts = await this.deps.msalClient.getTokenCache().getAllAccounts();
      for (const account of accounts) {
        await this.deps.msalClient.getTokenCache().removeAccount(account);
      }

      await this.clearCookieJarsSequential();

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


export type { AuthService };

export function createAuthService(deps: AuthServiceDeps): AuthService {
  return new AuthService(deps);
}

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
          sandbox: true,
          partition: PARTITION_NAME,
        },
      });

      const ALLOWED_AUTH_HOSTS = ['login.microsoftonline.com', 'login.live.com', 'aadcdn.msftauth.net', 'aadcdn.msauth.net', 'localhost'];

      let settled = false;
      const settle = (value: { code: string; state: string } | null) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        resolve(value);
      };
      const timer = setTimeout(() => {
        if (!settled) {
          try { authWindow.close(); } catch { }
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
          const aadError = urlObj.searchParams.get('error');
          const aadErrorDescription = urlObj.searchParams.get('error_description');
          if (aadError) {
            onAadError(aadErrorDescription || aadError);
            settle(null);
          } else if (code && state) {
            settle({ code, state });
          } else {
            settle(null);
          }
          try { authWindow.close(); } catch { }
        }
      };

      authWindow.webContents.setWindowOpenHandler(({ url }) => {
        try {
          const parsed = new URL(url);
          if (parsed.protocol === 'https:') {
            if (isAllowedAuthHost(url)) {
              shell.openExternal(url).catch(() => { });
            }
          }
        } catch {
        }
        return { action: 'deny' };
      });

      authWindow.webContents.on('will-redirect', (event, url) => {
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

      authWindow.loadURL(authUrl).catch((err) => {
        console.warn('[Auth] Auth window loadURL failed:', err);
        settle(null);
      });
    });
}

function buildProductionDeps(): AuthServiceDeps {
  const pca = new PublicClientApplication(msalConfig);
  const cryptoProvider = new CryptoProvider();
  return {
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

import { getAuthService } from './singleton';

export { buildProductionDeps };

export const authService: AuthService = new Proxy({} as AuthService, {
  get(_target, prop, receiver) {
    const svc = getAuthService();
    const value = Reflect.get(svc as object, prop, receiver);
    return typeof value === 'function' ? value.bind(svc) : value;
  },
});
