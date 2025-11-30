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

  constructor() {
    this.pca = new PublicClientApplication(msalConfig);
    this.cryptoProvider = new CryptoProvider();
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
    } catch (error) {
      console.error('[AuthService] Failed to initialize cache:', error);
    }
  }

  private async persistCache(): Promise<void> {
    try {
      const cache = this.pca.getTokenCache().serialize();
      await tokenCache.saveCache(cache);
    } catch (error) {
      console.error('[AuthService] Failed to persist cache:', error);
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

      // Get authorization URL
      const authCodeUrlParams = {
        scopes: loginRequest.scopes,
        redirectUri: 'http://localhost',
        codeChallenge: challenge,
        codeChallengeMethod: 'S256',
      };

      const authCodeUrl = await this.pca.getAuthCodeUrl(authCodeUrlParams);

      // Open interactive login window
      const authCode = await this.openAuthWindow(authCodeUrl);

      if (!authCode) {
        return {
          success: false,
          error: { code: 'LOGIN_CANCELLED', message: 'Login was cancelled by user' },
        };
      }

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
      console.error('[AuthService] Login error:', error);
      return {
        success: false,
        error: { code: 'LOGIN_FAILED', message: String(error) },
      };
    }
  }

  private async openAuthWindow(authUrl: string): Promise<string | null> {
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

      authWindow.webContents.on('will-redirect', (event, url) => {
        const urlObj = new URL(url);
        if (urlObj.hostname === 'localhost') {
          const code = urlObj.searchParams.get('code');
          authWindow.close();
          resolve(code);
        }
      });

      authWindow.webContents.on('will-navigate', (event, url) => {
        const urlObj = new URL(url);
        if (urlObj.hostname === 'localhost') {
          const code = urlObj.searchParams.get('code');
          authWindow.close();
          resolve(code);
        }
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
          // Token expired, need interactive login
          return {
            success: false,
            error: { code: 'INTERACTION_REQUIRED', message: 'Please log in again' },
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
