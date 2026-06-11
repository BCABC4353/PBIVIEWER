/**
 * AAD OAuth 2.0 DEVICE AUTHORIZATION GRANT (RFC 8628) — the zero-Entra-changes
 * path to live data. No redirect URI is involved at all, so nothing needs to
 * be added to the app registration's platform list: the phone shows a short
 * code, the owner types it at https://microsoft.com/devicelogin on ANY signed-
 * in browser, and the phone polls the token endpoint until AAD says yes.
 *
 * ONE Entra precondition (a toggle, not a platform/redirect change): the app
 * registration must have Authentication → "Allow public client flows" = Yes.
 * Without it the token endpoint answers `invalid_client` (AADSTS7000218) —
 * mapped below to guidance instead of OAuth jargon.
 *
 * PURE LOGIC, like token-manager.ts: no React Native / Expo imports, fetch,
 * sleep and clock are injected, so the whole state machine (pending →
 * slow_down → expired/denied/success) runs under vitest on Node. The Expo
 * wiring (msal-auth.ts adoptTokenSet + SettingsScreen UI) stays thin.
 */
import { decodeIdToken, type TokenSet } from './token-manager';

export interface DeviceCodeConfig {
  clientId: string;
  tenantId: string;
  scopes: string[];
}

/** What AAD's /devicecode endpoint hands back (camelCased). */
export interface DeviceCodeChallenge {
  /** The opaque code the CLIENT polls with (never shown to the user). */
  deviceCode: string;
  /** The short code the USER types at the verification URI — show this BIG. */
  userCode: string;
  /** Where the user goes (canonically https://microsoft.com/devicelogin). */
  verificationUri: string;
  /** Lifetime of the codes, seconds. */
  expiresInSec: number;
  /** Minimum seconds between polls (AAD default 5). */
  intervalSec: number;
  /** AAD's ready-made human sentence, when present. */
  message?: string;
}

/** Minimal injected-fetch seam (global fetch satisfies it). */
export interface DeviceCodeHttpResponse {
  status: number;
  json(): Promise<unknown>;
}
export type DeviceCodeFetch = (
  url: string,
  init: { method: 'POST'; headers: Record<string, string>; body: string },
) => Promise<DeviceCodeHttpResponse>;

export interface DeviceCodeDeps {
  fetch: DeviceCodeFetch;
  /** Injected for tests; defaults to real timers / Date.now. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export interface DeviceCodePollHooks {
  /** Streamed once per poll round so the UI can show a live status line. */
  onStatus?: (status: 'waiting' | 'slow_down') => void;
  /** Return true to abort the poll loop (user cancelled, screen unmounted). */
  cancelled?: () => boolean;
}

/** Thrown when `cancelled()` flips — callers treat it as a quiet no-op. */
export class DeviceCodeCancelledError extends Error {
  constructor() {
    super('Device code sign-in cancelled');
    this.name = 'DeviceCodeCancelledError';
  }
}

/**
 * The friendly mapping for AAD's confidential-client rejection: this app's
 * registration was set up for the desktop's http://localhost native flow,
 * and the "Allow public client flows" toggle may well still be No — device
 * code flow is the one grant that REQUIRES it (AADSTS7000218).
 */
export const PUBLIC_CLIENT_FLAG_GUIDANCE =
  'Microsoft rejected the sign-in because the app registration does not allow ' +
  'public client flows. One-time fix (no new redirect URIs needed): Entra portal → ' +
  'App registrations → this app → Authentication → set "Allow public client flows" ' +
  'to Yes, then Save and try again.';

const FORM_HEADERS = { 'Content-Type': 'application/x-www-form-urlencoded' };

function form(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

function str(o: Record<string, unknown>, key: string): string | undefined {
  return typeof o[key] === 'string' ? (o[key] as string) : undefined;
}
function num(o: Record<string, unknown>, key: string): number | undefined {
  return typeof o[key] === 'number' && Number.isFinite(o[key] as number)
    ? (o[key] as number)
    : undefined;
}

async function bodyOf(res: DeviceCodeHttpResponse): Promise<Record<string, unknown>> {
  try {
    const parsed = await res.json();
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** True for the AAD error codes meaning "this registration is confidential". */
function isPublicClientRejection(error: string | undefined, description: string | undefined): boolean {
  return (
    error === 'invalid_client' ||
    error === 'unauthorized_client' ||
    /AADSTS7000218/i.test(description ?? '')
  );
}

function errorFrom(body: Record<string, unknown>, fallback: string): Error {
  const error = str(body, 'error');
  const description = str(body, 'error_description');
  if (isPublicClientRejection(error, description)) {
    return new Error(PUBLIC_CLIENT_FLAG_GUIDANCE);
  }
  return new Error(description ?? error ?? fallback);
}

/**
 * Step 1 — ask AAD for a user code. POST
 * /{tenant}/oauth2/v2.0/devicecode with client_id + scope.
 */
export async function requestDeviceCode(
  config: DeviceCodeConfig,
  deps: DeviceCodeDeps,
): Promise<DeviceCodeChallenge> {
  const res = await deps.fetch(
    `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/devicecode`,
    {
      method: 'POST',
      headers: FORM_HEADERS,
      body: form({ client_id: config.clientId, scope: config.scopes.join(' ') }),
    },
  );
  const body = await bodyOf(res);
  const deviceCode = str(body, 'device_code');
  const userCode = str(body, 'user_code');
  if (res.status < 200 || res.status >= 300 || !deviceCode || !userCode) {
    throw errorFrom(body, `Device code request failed (HTTP ${res.status})`);
  }
  return {
    deviceCode,
    userCode,
    verificationUri: str(body, 'verification_uri') ?? 'https://microsoft.com/devicelogin',
    expiresInSec: num(body, 'expires_in') ?? 900,
    intervalSec: num(body, 'interval') ?? 5,
    message: str(body, 'message'),
  };
}

/**
 * Step 2 — poll the token endpoint until the user finishes (or the code
 * dies). Implements the RFC 8628 / AAD state machine:
 *   authorization_pending → keep polling at `interval`
 *   slow_down             → add 5 s to the interval, keep polling
 *   expired_token         → the code died unredeemed — friendly throw
 *   access_denied / authorization_declined → the user said no — friendly throw
 *   bad_verification_code → AAD didn't recognize the typed code — friendly throw
 *   invalid_client / unauthorized_client → "Allow public client flows" guidance
 *   access_token present  → TokenSet (refresh token + identity included)
 */
export async function pollDeviceCode(
  config: DeviceCodeConfig,
  challenge: DeviceCodeChallenge,
  deps: DeviceCodeDeps,
  hooks: DeviceCodePollHooks = {},
): Promise<TokenSet> {
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const deadline = now() + challenge.expiresInSec * 1000;
  let intervalSec = Math.max(1, challenge.intervalSec);

  for (;;) {
    if (hooks.cancelled?.()) throw new DeviceCodeCancelledError();
    if (now() >= deadline) {
      throw new Error('The sign-in code expired before you finished — start again for a fresh code.');
    }
    await sleep(intervalSec * 1000);
    if (hooks.cancelled?.()) throw new DeviceCodeCancelledError();

    const res = await deps.fetch(
      `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: FORM_HEADERS,
        body: form({
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          device_code: challenge.deviceCode,
          client_id: config.clientId,
        }),
      },
    );
    const body = await bodyOf(res);

    const accessToken = str(body, 'access_token');
    if (accessToken) {
      const idToken = str(body, 'id_token');
      return {
        accessToken,
        expiresAt: now() + (num(body, 'expires_in') ?? 3600) * 1000,
        refreshToken: str(body, 'refresh_token'),
        user: (idToken ? decodeIdToken(idToken) : null) ?? undefined,
      };
    }

    const error = str(body, 'error');
    if (error === 'authorization_pending') {
      hooks.onStatus?.('waiting');
      continue;
    }
    if (error === 'slow_down') {
      intervalSec += 5; // RFC 8628 §3.5: back off by 5 s and keep going
      hooks.onStatus?.('slow_down');
      continue;
    }
    if (error === 'expired_token') {
      throw new Error('The sign-in code expired before you finished — start again for a fresh code.');
    }
    // RFC 8628 names the refusal `access_denied`; the Microsoft identity
    // platform actually answers `authorization_declined`. Same meaning.
    if (error === 'access_denied' || error === 'authorization_declined') {
      throw new Error('Sign-in was declined on the Microsoft page.');
    }
    // AAD-specific: the code entered on the Microsoft page was wrong or stale.
    if (error === 'bad_verification_code') {
      throw new Error(
        'Microsoft did not recognize the sign-in code — check it was typed exactly, or start again for a fresh code.',
      );
    }
    throw errorFrom(body, `Sign-in failed (HTTP ${res.status})`);
  }
}
