/**
 * AAD auth for the mobile app — expo-auth-session (authorization-code + PKCE)
 * against the same Entra public-client registration the desktop uses.
 *
 * Model mirrors the desktop (src/main/auth/auth-service.ts): sign in ONCE with
 * Microsoft, request `offline_access` so AAD returns a refresh token, persist
 * it in OS secure storage (expo-secure-store = Keychain / Keystore — the
 * mobile equivalent of desktop's DPAPI safeStorage), and silently refresh
 * thereafter. All token logic (expiry, single-flight refresh lock,
 * invalid_grant handling) lives in the PURE TokenManager (token-manager.ts);
 * this file is only the thin Expo/AAD wiring around it.
 *
 * ── Redirect URI ──────────────────────────────────────────────────────────
 * `makeRedirectUri()` resolves per environment:
 *  - Expo Go (development): the `exp://<host>:<port>` scheme of the dev
 *    server. NOTE: the old auth.expo.io AuthSession proxy was REMOVED in
 *    SDK 48+ — there is no `useProxy` any more. For Expo Go testing the
 *    exp:// URI must be added to the Entra app registration under
 *    "Mobile and desktop applications" (it changes with the dev host/port,
 *    so a development build is the saner path).
 *  - Standalone / development build: the app scheme. Register
 *    `msauth.{bundleId}://auth` in Entra (iOS) and the scheme +
 *    signature-hash redirect (Android), and set `scheme` in app.json so
 *    makeRedirectUri() produces it. See docs/PHONE-OPS-CONSOLE-PLAN.md §5.
 */
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

// On web, completes a pending auth session when AAD redirects back into the
// app. No-op on native. Must run at module load (before any render).
WebBrowser.maybeCompleteAuthSession();

export { azureConfigValid };
export type { UserInfo };

/**
 * EXACTLY the desktop scope list (src/main/auth/msal-config.ts loginRequest):
 * explicit delegated Power BI scopes — NOT `.default` — plus offline_access
 * (refresh token), openid/profile/email (id_token identity). The admin tier
 * (Tenant.Read.All) stays out, same as desktop: incremental consent later.
 */
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

// AAD v2 endpoints for the tenant — fixed shape, so no network discovery
// round-trip needed (matches what useAutoDiscovery would fetch from
// /.well-known/openid-configuration).
const discovery: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: `https://login.microsoftonline.com/${AZURE_CONFIG.tenantId}/oauth2/v2.0/authorize`,
  tokenEndpoint: `https://login.microsoftonline.com/${AZURE_CONFIG.tenantId}/oauth2/v2.0/token`,
  endSessionEndpoint: `https://login.microsoftonline.com/${AZURE_CONFIG.tenantId}/oauth2/v2.0/logout`,
};

const redirectUri = AuthSession.makeRedirectUri({ path: 'auth' });

/**
 * In Expo Go the redirect URI is the dev server's `exp://<host>:<port>` —
 * effectively never registered in Entra (it changes per host/port). When
 * that's what makeRedirectUri() produced, the AuthSession browser flow is a
 * guaranteed dead end and the caller should use the DEVICE CODE flow instead
 * (device-code-auth.ts), which involves no redirect URI at all.
 */
export const authSessionRedirectConfigured: boolean = !redirectUri.startsWith('exp://');

const STORE_KEY = 'pbiviewer.auth.tokens';

const secureStorage: TokenStorage = {
  get: () => safeStore.getItem(STORE_KEY),
  set: (value) => safeStore.setItem(STORE_KEY, value),
  remove: () => safeStore.removeItem(STORE_KEY),
};

/** expo-auth-session TokenResponse → our pure TokenSet. */
function toTokenSet(res: AuthSession.TokenResponse, previousUser?: UserInfo | null): TokenSet {
  return {
    accessToken: res.accessToken,
    // issuedAt/expiresIn are seconds (RFC 6749); default 1h when omitted.
    expiresAt: (res.issuedAt + (res.expiresIn ?? 3600)) * 1000,
    refreshToken: res.refreshToken,
    user: (res.idToken ? decodeIdToken(res.idToken) : null) ?? previousUser ?? undefined,
  };
}

const manager = new TokenManager({
  storage: secureStorage,
  // refresh_token grant via expo-auth-session. AAD v2 wants the scopes
  // repeated on refresh; PKCE public client = no client secret.
  refresh: async (refreshToken) => {
    const res = await AuthSession.refreshAsync(
      { clientId: AZURE_CONFIG.clientId, refreshToken, scopes: SCOPES },
      discovery,
    );
    return toTokenSet(res);
  },
});

/**
 * Interactive sign-in: system browser → AAD PKCE consent → code exchange.
 * Resolves with the signed-in identity, or null when the user dismissed the
 * browser / denied. Throws on configuration or token-exchange errors.
 */
export async function signIn(): Promise<UserInfo | null> {
  if (!azureConfigValid) {
    // Same guard as desktop's azureConfigValid: placeholder credentials would
    // produce a blank/hanging AAD page — fail loud and early instead.
    throw new Error(
      'Live mode is not configured in this build (missing Azure clientId/tenantId in src/auth/azure-config.ts).',
    );
  }
  const request = new AuthSession.AuthRequest({
    clientId: AZURE_CONFIG.clientId,
    scopes: SCOPES,
    redirectUri,
    responseType: AuthSession.ResponseType.Code,
    usePKCE: true, // S256 challenge — expo-auth-session generates the verifier
    prompt: AuthSession.Prompt.SelectAccount,
  });
  const result = await request.promptAsync(discovery);
  if (result.type !== 'success' || !result.params['code']) {
    return null; // dismissed / cancelled / denied — not an error
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

/**
 * Adopt a token set acquired OUTSIDE the AuthSession flow (the device code
 * flow in device-code-auth.ts). From here on it is indistinguishable from a
 * browser sign-in: same TokenManager, same SecureStore persistence, same
 * silent single-flight refresh on expiry.
 */
export async function adoptTokenSet(set: TokenSet): Promise<UserInfo | null> {
  await manager.setTokens(set);
  return set.user ?? null;
}

/** Sign out: drop the local credentials (memory + SecureStore). We do not
 *  drive the AAD end-session endpoint — the system browser's AAD cookie is
 *  outside the app's jurisdiction, same posture as desktop logout. */
export async function signOut(): Promise<void> {
  await manager.clear();
}

/**
 * Live access token for api.powerbi.com — auto-refreshes via the persisted
 * refresh token (silent, single-flight). Call this at launch to restore the
 * session with no UI: it either resolves silently or throws "Not signed in".
 */
export function getAccessToken(): Promise<string> {
  return manager.getAccessToken();
}

/** Identity persisted from the last sign-in (null when signed out). */
export function getCurrentUser(): Promise<UserInfo | null> {
  return manager.getCurrentUser();
}

/** True when credentials exist (refresh token or live access token). */
export function isSignedIn(): Promise<boolean> {
  return manager.isSignedIn();
}
