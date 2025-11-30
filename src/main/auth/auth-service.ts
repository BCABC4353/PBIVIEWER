import {
  PublicClientApplication,
  AccountInfo,
  InteractionRequiredAuthError,
  CryptoProvider,
} from '@azure/msal-node';
import { shell, BrowserWindow } from 'electron';
import { msalConfig, loginRequest, silentRequest } from './msal-config';
import { tokenCache, CachedUserInfo } from './token-cache';
import { UserInfo, AuthResult, IPCResponse } from '../../shared/types';

class AuthService {
  private pca: PublicClientApplication;
  private account: AccountInfo | null = null;
  private cryptoProvider: CryptoProvider;
  private pendingAuthState: string | null = null; // For CSRF validation

  constructor() {
    this.pca = new PublicClientApplication(msalConfig);
    this.cryptoProvider = new CryptoProvider();
  }

  /**
   * Generate a cryptographically random state value for CSRF protection
   */
  private generateState(): string {
    const array = new Uint8Array(32);
    require('crypto').randomFillSync(array);
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
          this.account = accounts[0];
        }
      }
    } catch {
      // Cache initialization failure is non-critical, will start fresh
    }
  }

  private async persistCache(): Promise<void> {
    try {
      const cache = this.pca.getTokenCache().serialize();
      await tokenCache.saveCache(cache);
    } catch {
      // Cache persistence failure is non-critical
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
      const tokenResult = await this.getAccessToken();

      if (tokenResult.success && tokenResult.data) {
        return { success: true, data: true };
      } else {
        // If we can't get a token, clear the cache so user is prompted to login
        if (tokenResult.error?.code === 'INTERACTION_REQUIRED' || tokenResult.error?.code === 'NO_ACCOUNT') {
          await this.logout();
        }
        return { success: true, data: false };
      }
    } catch {
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
      };

      const authCodeUrl = await this.pca.getAuthCodeUrl(authCodeUrlParams);

      // Open interactive login window
      const authResult = await this.openAuthWindow(authCodeUrl, state);

      if (!authResult) {
        this.pendingAuthState = null;
        return {
          success: false,
          error: { code: 'LOGIN_CANCELLED', message: 'Login was cancelled by user' },
        };
      }

      // Validate state to prevent CSRF
      if (authResult.state !== this.pendingAuthState) {
        this.pendingAuthState = null;
        return {
          success: false,
          error: { code: 'CSRF_VALIDATION_FAILED', message: 'State mismatch - possible CSRF attack' },
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

  private async openAuthWindow(authUrl: string, expectedState: string): Promise<{ code: string; state: string } | null> {
    return new Promise((resolve) => {
      const authWindow = new BrowserWindow({
        width: 500,
        height: 700,
        show: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
      });

      const handleRedirect = (url: string) => {
        const urlObj = new URL(url);
        if (urlObj.hostname === 'localhost') {
          const code = urlObj.searchParams.get('code');
          const state = urlObj.searchParams.get('state');
          authWindow.close();
          if (code && state) {
            resolve({ code, state });
          } else {
            resolve(null);
          }
        }
      };

      authWindow.webContents.on('will-redirect', (event, url) => {
        handleRedirect(url);
      });

      authWindow.webContents.on('will-navigate', (event, url) => {
        handleRedirect(url);
      });

      authWindow.on('closed', () => {
        resolve(null);
      });

      authWindow.loadURL(authUrl);
    });
  }

  async getAccessToken(): Promise<IPCResponse<string>> {
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
        this.account = accounts[0];
      }

      // Try silent token acquisition first
      try {
        const result = await this.pca.acquireTokenSilent({
          ...silentRequest,
          account: this.account,
        });

        await this.persistCache();
        return { success: true, data: result.accessToken };
      } catch (error) {
        if (error instanceof InteractionRequiredAuthError) {
          // Token expired or scopes changed, need interactive login
          // Clear the cache and trigger re-login
          await this.logout();
          return {
            success: false,
            error: { code: 'INTERACTION_REQUIRED', message: 'Session expired. Please log in again.' },
          };
        }
        throw error;
      }
    } catch (error) {
      return {
        success: false,
        error: { code: 'TOKEN_FAILED', message: String(error) },
      };
    }
  }

  async logout(): Promise<IPCResponse<void>> {
    try {
      await tokenCache.clearCache();
      this.account = null;

      // Clear MSAL cache
      const accounts = await this.pca.getTokenCache().getAllAccounts();
      for (const account of accounts) {
        await this.pca.getTokenCache().removeAccount(account);
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: { code: 'LOGOUT_FAILED', message: String(error) },
      };
    }
  }
}

export const authService = new AuthService();
