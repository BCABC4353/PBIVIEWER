import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ARCH-B4: powerbi-api.ts imports auth/singleton.ts, which (lazily) reaches for
// the electron/MSAL-backed auth service. The DI factory means the SERVICE needs
// none of that, but the module's top-level imports still transitively load
// electron via the auth module graph. Stub electron so the import is clean.
vi.mock('electron', () => ({
  BrowserWindow: class {},
  session: {
    defaultSession: { clearStorageData: vi.fn().mockResolvedValue(undefined) },
    fromPartition: vi.fn(() => ({ clearStorageData: vi.fn().mockResolvedValue(undefined) })),
  },
  shell: { openExternal: vi.fn().mockResolvedValue(undefined) },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(s, 'utf-8'),
    decryptString: (b: Buffer) => b.toString('utf-8'),
  },
  app: { getPath: () => '/tmp', getVersion: () => '0.0.0-test' },
}));

import {
  createPowerBIApiService,
  buildProductionApiDeps,
  type ApiAuthPort,
  type PowerBIApiDeps,
} from './powerbi-api';
import type { IPCResponse, TokenResult } from '../../shared/types';

function tokenOk(): IPCResponse<TokenResult> {
  return { success: true, data: { accessToken: 'test-access-token', expiresOn: null } };
}

function makeDeps(auth: ApiAuthPort): PowerBIApiDeps {
  return { auth };
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('powerbi-api module (ARCH-B4: DI factory)', () => {
  it('exposes the createPowerBIApiService factory and production deps builder', () => {
    expect(createPowerBIApiService).toBeTypeOf('function');
    expect(buildProductionApiDeps).toBeTypeOf('function');
    const svc = createPowerBIApiService(buildProductionApiDeps());
    expect(svc).toBeDefined();
    expect(svc.getWorkspaces).toBeTypeOf('function');
  });

  it('uses the injected auth port to authorize requests', async () => {
    const getAccessToken = vi.fn().mockResolvedValue(tokenOk());
    const svc = createPowerBIApiService(makeDeps({ getAccessToken }));

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ value: [] }), { status: 200 }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await svc.getWorkspaces();
    expect(result.success).toBe(true);
    expect(getAccessToken).toHaveBeenCalled();

    // Bearer header carries the injected token.
    const [, init] = fetchMock.mock.calls[0]!;
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-access-token');
  });

  it('fails the call when the auth port cannot supply a token', async () => {
    const getAccessToken = vi.fn().mockResolvedValue({
      success: false,
      error: { code: 'NO_ACCOUNT', message: 'No authenticated account' },
    } satisfies IPCResponse<TokenResult>);
    const svc = createPowerBIApiService(makeDeps({ getAccessToken }));

    // fetch should never be reached; make it explode if it is.
    globalThis.fetch = vi.fn(() => {
      throw new Error('fetch should not be called when token acquisition fails');
    }) as unknown as typeof fetch;

    const result = await svc.getWorkspaces();
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('WORKSPACES_FETCH_FAILED');
  });

  it('getEmbedToken returns the injected access token as the embed token', async () => {
    const getAccessToken = vi.fn().mockResolvedValue({
      success: true,
      data: { accessToken: 'embed-tok', expiresOn: '2030-01-01T00:00:00.000Z' },
    } satisfies IPCResponse<TokenResult>);
    const svc = createPowerBIApiService(makeDeps({ getAccessToken }));

    const result = await svc.getEmbedToken(
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.token).toBe('embed-tok');
      expect(result.data.expiration).toBe('2030-01-01T00:00:00.000Z');
    }
  });
});
