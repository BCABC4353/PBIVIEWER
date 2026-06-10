import { describe, expect, it } from 'vitest';
import {
  DeviceCodeCancelledError,
  PUBLIC_CLIENT_FLAG_GUIDANCE,
  pollDeviceCode,
  requestDeviceCode,
  type DeviceCodeChallenge,
  type DeviceCodeConfig,
  type DeviceCodeFetch,
  type DeviceCodeHttpResponse,
} from './device-code-auth';

const CONFIG: DeviceCodeConfig = {
  clientId: '11111111-2222-3333-4444-555555555555',
  tenantId: '99999999-8888-7777-6666-555555555555',
  scopes: ['https://analysis.windows.net/powerbi/api/Report.Read.All', 'offline_access', 'openid'],
};

function res(status: number, body: unknown): DeviceCodeHttpResponse {
  return { status, json: () => Promise.resolve(body) };
}

/** Scripted fetch: pops one response per call, records every request. */
function scriptedFetch(responses: DeviceCodeHttpResponse[]) {
  const calls: Array<{ url: string; body: string }> = [];
  const fetch: DeviceCodeFetch = (url, init) => {
    calls.push({ url, body: init.body });
    const next = responses.shift();
    if (!next) throw new Error('scripted fetch exhausted');
    return Promise.resolve(next);
  };
  return { fetch, calls };
}

/** Instant injected sleep that records requested durations. */
function fakeSleep() {
  const slept: number[] = [];
  const sleep = (ms: number) => {
    slept.push(ms);
    return Promise.resolve();
  };
  return { sleep, slept };
}

// A minimal unsigned JWT with the identity claims decodeIdToken reads.
function fakeIdToken(claims: Record<string, unknown>): string {
  const b64url = (s: string) =>
    Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64url(JSON.stringify({ alg: 'none' }))}.${b64url(JSON.stringify(claims))}.sig`;
}

const CHALLENGE_BODY = {
  device_code: 'dev-code-opaque',
  user_code: 'BXQ4-HT7P',
  verification_uri: 'https://microsoft.com/devicelogin',
  expires_in: 900,
  interval: 5,
  message: 'To sign in, use a web browser…',
};

function challenge(overrides: Partial<DeviceCodeChallenge> = {}): DeviceCodeChallenge {
  return {
    deviceCode: 'dev-code-opaque',
    userCode: 'BXQ4-HT7P',
    verificationUri: 'https://microsoft.com/devicelogin',
    expiresInSec: 900,
    intervalSec: 5,
    ...overrides,
  };
}

const TOKEN_SUCCESS = {
  token_type: 'Bearer',
  scope: 'Report.Read.All',
  expires_in: 3600,
  access_token: 'at-123',
  refresh_token: 'rt-456',
  id_token: fakeIdToken({ preferred_username: 'brendan@bc-abc.com', name: 'Brendan', tid: 'tid-1', oid: 'oid-1' }),
};

describe('requestDeviceCode', () => {
  it('POSTs client_id + joined scopes to the tenant devicecode endpoint and parses the challenge', async () => {
    const { fetch, calls } = scriptedFetch([res(200, CHALLENGE_BODY)]);
    const c = await requestDeviceCode(CONFIG, { fetch });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(
      `https://login.microsoftonline.com/${CONFIG.tenantId}/oauth2/v2.0/devicecode`,
    );
    expect(calls[0]!.body).toContain(`client_id=${CONFIG.clientId}`);
    expect(decodeURIComponent(calls[0]!.body)).toContain(CONFIG.scopes.join(' '));
    expect(c).toEqual({
      deviceCode: 'dev-code-opaque',
      userCode: 'BXQ4-HT7P',
      verificationUri: 'https://microsoft.com/devicelogin',
      expiresInSec: 900,
      intervalSec: 5,
      message: 'To sign in, use a web browser…',
    });
  });

  it('defaults verification_uri / expires_in / interval when AAD omits them', async () => {
    const { fetch } = scriptedFetch([
      res(200, { device_code: 'd', user_code: 'U' }),
    ]);
    const c = await requestDeviceCode(CONFIG, { fetch });
    expect(c.verificationUri).toBe('https://microsoft.com/devicelogin');
    expect(c.expiresInSec).toBe(900);
    expect(c.intervalSec).toBe(5);
  });

  it("maps invalid_client to the 'Allow public client flows' guidance", async () => {
    const { fetch } = scriptedFetch([
      res(401, { error: 'invalid_client', error_description: 'AADSTS7000218: client_assertion or client_secret' }),
    ]);
    await expect(requestDeviceCode(CONFIG, { fetch })).rejects.toThrow(
      PUBLIC_CLIENT_FLAG_GUIDANCE,
    );
  });

  it('surfaces AAD error_description for other failures', async () => {
    const { fetch } = scriptedFetch([
      res(400, { error: 'invalid_request', error_description: 'AADSTS90002: tenant not found' }),
    ]);
    await expect(requestDeviceCode(CONFIG, { fetch })).rejects.toThrow(/tenant not found/);
  });
});

describe('pollDeviceCode state machine', () => {
  it('authorization_pending → keeps polling at the interval, then succeeds with a full TokenSet', async () => {
    const { fetch, calls } = scriptedFetch([
      res(400, { error: 'authorization_pending' }),
      res(400, { error: 'authorization_pending' }),
      res(200, TOKEN_SUCCESS),
    ]);
    const { sleep, slept } = fakeSleep();
    const statuses: string[] = [];
    const t0 = 1_000_000;
    const set = await pollDeviceCode(CONFIG, challenge(), { fetch, sleep, now: () => t0 }, {
      onStatus: (s) => statuses.push(s),
    });
    expect(calls).toHaveLength(3);
    expect(calls[0]!.url).toBe(
      `https://login.microsoftonline.com/${CONFIG.tenantId}/oauth2/v2.0/token`,
    );
    expect(calls[0]!.body).toContain('grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Adevice_code');
    expect(calls[0]!.body).toContain('device_code=dev-code-opaque');
    expect(slept).toEqual([5000, 5000, 5000]); // one wait BEFORE each poll
    expect(statuses).toEqual(['waiting', 'waiting']);
    expect(set.accessToken).toBe('at-123');
    expect(set.refreshToken).toBe('rt-456');
    expect(set.expiresAt).toBe(t0 + 3600 * 1000);
    expect(set.user).toEqual({
      username: 'brendan@bc-abc.com',
      name: 'Brendan',
      tenantId: 'tid-1',
      objectId: 'oid-1',
    });
  });

  it('slow_down → adds 5 s to the interval and keeps polling', async () => {
    const { fetch } = scriptedFetch([
      res(400, { error: 'slow_down' }),
      res(400, { error: 'authorization_pending' }),
      res(200, TOKEN_SUCCESS),
    ]);
    const { sleep, slept } = fakeSleep();
    const statuses: string[] = [];
    await pollDeviceCode(CONFIG, challenge(), { fetch, sleep, now: () => 0 }, {
      onStatus: (s) => statuses.push(s),
    });
    expect(slept).toEqual([5000, 10000, 10000]); // bumped after slow_down, stays bumped
    expect(statuses).toEqual(['slow_down', 'waiting']);
  });

  it('expired_token from AAD → friendly expiry error', async () => {
    const { fetch } = scriptedFetch([res(400, { error: 'expired_token' })]);
    const { sleep } = fakeSleep();
    await expect(
      pollDeviceCode(CONFIG, challenge(), { fetch, sleep, now: () => 0 }),
    ).rejects.toThrow(/code expired/i);
  });

  it('stops polling once the local deadline passes (injected clock)', async () => {
    const { fetch, calls } = scriptedFetch([
      res(400, { error: 'authorization_pending' }),
      res(400, { error: 'authorization_pending' }),
    ]);
    const { sleep } = fakeSleep();
    let t = 0;
    // Each now() call advances 400 s; expires_in 900 s → a couple of polls then expiry.
    const now = () => {
      const v = t;
      t += 400_000;
      return v;
    };
    await expect(
      pollDeviceCode(CONFIG, challenge({ expiresInSec: 900 }), { fetch, sleep, now }),
    ).rejects.toThrow(/code expired/i);
    expect(calls.length).toBeLessThanOrEqual(2);
  });

  it('access_denied → friendly declined error', async () => {
    const { fetch } = scriptedFetch([res(400, { error: 'access_denied' })]);
    const { sleep } = fakeSleep();
    await expect(
      pollDeviceCode(CONFIG, challenge(), { fetch, sleep, now: () => 0 }),
    ).rejects.toThrow(/declined/i);
  });

  it("invalid_client mid-poll → 'Allow public client flows' guidance", async () => {
    const { fetch } = scriptedFetch([
      res(401, { error: 'invalid_client', error_description: 'AADSTS7000218' }),
    ]);
    const { sleep } = fakeSleep();
    await expect(
      pollDeviceCode(CONFIG, challenge(), { fetch, sleep, now: () => 0 }),
    ).rejects.toThrow(PUBLIC_CLIENT_FLAG_GUIDANCE);
  });

  it("unauthorized_client mid-poll → same guidance", async () => {
    const { fetch } = scriptedFetch([res(400, { error: 'unauthorized_client' })]);
    const { sleep } = fakeSleep();
    await expect(
      pollDeviceCode(CONFIG, challenge(), { fetch, sleep, now: () => 0 }),
    ).rejects.toThrow(PUBLIC_CLIENT_FLAG_GUIDANCE);
  });

  it('cancellation flag aborts the loop with DeviceCodeCancelledError (no further fetches)', async () => {
    const { fetch, calls } = scriptedFetch([res(400, { error: 'authorization_pending' })]);
    const { sleep } = fakeSleep();
    let polls = 0;
    const cancelled = () => polls > 0;
    await expect(
      pollDeviceCode(CONFIG, challenge(), { fetch, sleep, now: () => 0 }, {
        onStatus: () => {
          polls += 1;
        },
        cancelled,
      }),
    ).rejects.toBeInstanceOf(DeviceCodeCancelledError);
    expect(calls).toHaveLength(1);
  });

  it('keeps the old refresh-token semantics: missing refresh_token/id_token still yields a usable set', async () => {
    const { fetch } = scriptedFetch([
      res(200, { access_token: 'at-only', expires_in: 1800 }),
    ]);
    const { sleep } = fakeSleep();
    const set = await pollDeviceCode(CONFIG, challenge(), { fetch, sleep, now: () => 10_000 });
    expect(set.accessToken).toBe('at-only');
    expect(set.refreshToken).toBeUndefined();
    expect(set.user).toBeUndefined();
    expect(set.expiresAt).toBe(10_000 + 1800 * 1000);
  });

  it('clamps a degenerate interval up to 1 s so a hostile challenge cannot hot-loop', async () => {
    const { fetch } = scriptedFetch([res(200, TOKEN_SUCCESS)]);
    const { sleep, slept } = fakeSleep();
    await pollDeviceCode(CONFIG, challenge({ intervalSec: 0 }), { fetch, sleep, now: () => 0 });
    expect(slept).toEqual([1000]);
  });
});
