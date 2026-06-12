import * as AuthSession from 'expo-auth-session';
import * as safeStore from '../core/safe-store';
import * as WebBrowser from 'expo-web-browser';
import { AZURE_CONFIG, azureConfigValid } from './azure-config';
import {
  TokenManager,
  decodeIdToken,
  type TokenSet,
  type TokenStorage,
  type UserInfo,
} from './token-manager';

WebBrowser.maybeCompleteAuthSession();

export { azureConfigValid };
export type { UserInfo };

export const SCOPES = [
  'https://analysis.windows.net/powerbi/api/Report.Read.All',
  'https://analysis.windows.net/powerbi/api/Dashboard.Read.All',
  'https://analysis.windows.net/powerbi/api/Workspace.Read.All',
  'https://analysis.windows.net/powerbi/api/App.Read.All',
  'https://analysis.windows.net/powerbi/api/Dataset.Read.All',
  'https://analysis.windows.net/powerbi/api/Dataflow.Read.All',
  'offline_access',
  'openid',
  'profile',
  'email',
];

const discovery: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: `https://login.microsoftonline.com/${AZURE_CONFIG.tenantId}/oauth2/v2.0/authorize`,
  tokenEndpoint: `https://login.microsoftonline.com/${AZURE_CONFIG.tenantId}/oauth2/v2.0/token`,
  endSessionEndpoint: `https://login.microsoftonline.com/${AZURE_CONFIG.tenantId}/oauth2/v2.0/logout`,
};

const redirectUri = AuthSession.makeRedirectUri({ path: 'auth' });

export const authSessionRedirectConfigured: boolean = !redirectUri.startsWith('exp://');

const STORE_KEY = 'pbiviewer.auth.tokens';

const secureStorage: TokenStorage = {
  get: () => safeStore.getItem(STORE_KEY),
  set: (value) => safeStore.setItem(STORE_KEY, value),
  remove: () => safeStore.removeItem(STORE_KEY),
};

function toTokenSet(res: AuthSession.TokenResponse, previousUser?: UserInfo | null): TokenSet {
  return {
    accessToken: res.accessToken,
    expiresAt: (res.issuedAt + (res.expiresIn ?? 3600)) * 1000,
    refreshToken: res.refreshToken,
    user: (res.idToken ? decodeIdToken(res.idToken) : null) ?? previousUser ?? undefined,
  };
}

const manager = new TokenManager({
  storage: secureStorage,
  refresh: async (refreshToken) => {
    const res = await AuthSession.refreshAsync(
      { clientId: AZURE_CONFIG.clientId, refreshToken, scopes: SCOPES },
      discovery,
    );
    return toTokenSet(res);
  },
});

export async function signIn(): Promise<UserInfo | null> {
  if (!azureConfigValid) {
    throw new Error(
      'Live mode is not configured in this build (missing Azure clientId/tenantId in src/auth/azure-config.ts).',
    );
  }
  const request = new AuthSession.AuthRequest({
    clientId: AZURE_CONFIG.clientId,
    scopes: SCOPES,
    redirectUri,
    responseType: AuthSession.ResponseType.Code,
    usePKCE: true,
    prompt: AuthSession.Prompt.SelectAccount,
  });
  const result = await request.promptAsync(discovery);
  if (result.type !== 'success' || !result.params['code']) {
    return null;
  }
  const tokens = await AuthSession.exchangeCodeAsync(
    {
      clientId: AZURE_CONFIG.clientId,
      code: result.params['code'] as string,
      redirectUri,
      extraParams: { code_verifier: request.codeVerifier ?? '' },
    },
    discovery,
  );
  const set = toTokenSet(tokens);
  await manager.setTokens(set);
  return set.user ?? null;
}

export async function adoptTokenSet(set: TokenSet): Promise<UserInfo | null> {
  await manager.setTokens(set);
  return set.user ?? null;
}

export async function signOut(): Promise<void> {
  await manager.clear();
}

export function getAccessToken(): Promise<string> {
  return manager.getAccessToken();
}

export function getCurrentUser(): Promise<UserInfo | null> {
  return manager.getCurrentUser();
}

export function isSignedIn(): Promise<boolean> {
  return manager.isSignedIn();
}
