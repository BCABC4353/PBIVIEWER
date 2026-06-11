import { decodeIdToken, type TokenSet } from './token-manager';

export interface DeviceCodeConfig {
  clientId: string;
  tenantId: string;
  scopes: string[];
}

export interface DeviceCodeChallenge {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresInSec: number;
  intervalSec: number;
  message?: string;
}

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
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export interface DeviceCodePollHooks {
  onStatus?: (status: 'waiting' | 'slow_down') => void;
  cancelled?: () => boolean;
}

export class DeviceCodeCancelledError extends Error {
  constructor() {
    super('Device code sign-in cancelled');
    this.name = 'DeviceCodeCancelledError';
  }
}

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
      intervalSec += 5;
      hooks.onStatus?.('slow_down');
      continue;
    }
    if (error === 'expired_token') {
      throw new Error('The sign-in code expired before you finished — start again for a fresh code.');
    }
    if (error === 'access_denied' || error === 'authorization_declined') {
      throw new Error('Sign-in was declined on the Microsoft page.');
    }
    if (error === 'bad_verification_code') {
      throw new Error(
        'Microsoft did not recognize the sign-in code — check it was typed exactly, or start again for a fresh code.',
      );
    }
    throw errorFrom(body, `Sign-in failed (HTTP ${res.status})`);
  }
}
