import { describe, expect, it } from 'vitest';
import { createQueryClient, type QueryTransport, type TokenProvider } from './query-client';

function makeTransport(
  handler: (url: string, body: unknown) => { status: number; json: unknown },
): QueryTransport {
  return {
    post: async (url, body, _token) => handler(url, body),
  };
}

const okTransport = (json: unknown): QueryTransport =>
  makeTransport(() => ({ status: 200, json }));

const statusTransport = (status: number, json: unknown = {}): QueryTransport =>
  makeTransport(() => ({ status, json }));

const throwingTransport: QueryTransport = {
  post: async () => {
    throw new Error('network failure');
  },
};

const goodTokens: TokenProvider = { getAccessToken: async () => 'FAKE_TOKEN' };

const throwingTokens: TokenProvider = {
  getAccessToken: async () => {
    throw new Error('token expired locally');
  },
};

const successPayload = {
  results: [{ tables: [{ rows: [{ 'T[REGION]': 'ALPHA', '[Val_0]': 42 }] }] }],
};

describe('createQueryClient — URL construction', () => {
  it('uses group URL when groupId is provided', async () => {
    let capturedUrl = '';
    const transport: QueryTransport = {
      post: async (url) => {
        capturedUrl = url;
        return { status: 200, json: successPayload };
      },
    };
    const client = createQueryClient({ transport, tokenProvider: goodTokens });
    await client.executeForDataset({ groupId: 'GRP1', datasetId: 'DS1', dax: 'EVALUATE T' });
    expect(capturedUrl).toBe(
      'https://api.powerbi.com/v1.0/myorg/groups/GRP1/datasets/DS1/executeQueries',
    );
  });

  it('uses no-group URL when groupId is absent', async () => {
    let capturedUrl = '';
    const transport: QueryTransport = {
      post: async (url) => {
        capturedUrl = url;
        return { status: 200, json: successPayload };
      },
    };
    const client = createQueryClient({ transport, tokenProvider: goodTokens });
    await client.executeForDataset({ datasetId: 'DS2', dax: 'EVALUATE T' });
    expect(capturedUrl).toBe(
      'https://api.powerbi.com/v1.0/myorg/datasets/DS2/executeQueries',
    );
  });

  it('passes the access token to the transport', async () => {
    let capturedToken = '';
    const transport: QueryTransport = {
      post: async (_url, _body, token) => {
        capturedToken = token;
        return { status: 200, json: successPayload };
      },
    };
    const client = createQueryClient({ transport, tokenProvider: goodTokens });
    await client.executeForDataset({ datasetId: 'DS3', dax: 'EVALUATE T' });
    expect(capturedToken).toBe('FAKE_TOKEN');
  });

  it('sends the correct body shape', async () => {
    let capturedBody: unknown = null;
    const transport: QueryTransport = {
      post: async (_url, body) => {
        capturedBody = body;
        return { status: 200, json: successPayload };
      },
    };
    const client = createQueryClient({ transport, tokenProvider: goodTokens });
    await client.executeForDataset({ datasetId: 'DS4', dax: 'EVALUATE ROW("X", 1)' });
    expect(capturedBody).toEqual({
      queries: [{ query: 'EVALUATE ROW("X", 1)' }],
      serializerSettings: { includeNulls: true },
    });
  });
});

describe('createQueryClient — success result', () => {
  it('returns ok:true with parsed result on 200', async () => {
    const client = createQueryClient({ transport: okTransport(successPayload), tokenProvider: goodTokens });
    const r = await client.executeForDataset({ datasetId: 'DS1', dax: 'EVALUATE T' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.columns).toContain('REGION');
      expect(r.result.columns).toContain('Val_0');
      expect(r.result.rows[0]!['REGION']).toBe('ALPHA');
      expect(r.result.rows[0]!['Val_0']).toBe(42);
    }
  });

  it('includes diagnostics array even on a clean response', async () => {
    const client = createQueryClient({ transport: okTransport(successPayload), tokenProvider: goodTokens });
    const r = await client.executeForDataset({ datasetId: 'DS1', dax: 'EVALUATE T' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(Array.isArray(r.result.diagnostics)).toBe(true);
    }
  });
});

describe('createQueryClient — error taxonomy', () => {
  it('returns TOKEN_EXPIRED for 401', async () => {
    const client = createQueryClient({ transport: statusTransport(401), tokenProvider: goodTokens });
    const r = await client.executeForDataset({ datasetId: 'DS1', dax: 'EVALUATE T' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('TOKEN_EXPIRED');
  });

  it('returns FORBIDDEN for 403', async () => {
    const client = createQueryClient({ transport: statusTransport(403), tokenProvider: goodTokens });
    const r = await client.executeForDataset({ datasetId: 'DS1', dax: 'EVALUATE T' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('FORBIDDEN');
  });

  it('returns NOT_FOUND for 404', async () => {
    const client = createQueryClient({ transport: statusTransport(404), tokenProvider: goodTokens });
    const r = await client.executeForDataset({ datasetId: 'DS1', dax: 'EVALUATE T' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('NOT_FOUND');
  });

  it('returns THROTTLED for 429 with no retry-after', async () => {
    const client = createQueryClient({ transport: statusTransport(429, {}), tokenProvider: goodTokens });
    const r = await client.executeForDataset({ datasetId: 'DS1', dax: 'EVALUATE T' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe('THROTTLED');
      if (r.error.kind === 'THROTTLED') expect(r.error.retryAfterSeconds).toBeNull();
    }
  });

  it('returns THROTTLED for 429 and carries numeric retry-after', async () => {
    const client = createQueryClient({
      transport: statusTransport(429, { retryAfter: 30 }),
      tokenProvider: goodTokens,
    });
    const r = await client.executeForDataset({ datasetId: 'DS1', dax: 'EVALUATE T' });
    expect(r.ok).toBe(false);
    if (!r.ok && r.error.kind === 'THROTTLED') {
      expect(r.error.retryAfterSeconds).toBe(30);
    }
  });

  it('returns BAD_DAX for 400', async () => {
    const client = createQueryClient({
      transport: statusTransport(400, { error: { code: 'DAXQueryException', message: 'bad syntax' } }),
      tokenProvider: goodTokens,
    });
    const r = await client.executeForDataset({ datasetId: 'DS1', dax: 'EVALUATE BAD' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe('BAD_DAX');
      if (r.error.kind === 'BAD_DAX') expect(r.error.detail).toContain('DAXQueryException');
    }
  });

  it('returns TRANSPORT for unexpected status codes', async () => {
    const client = createQueryClient({ transport: statusTransport(500), tokenProvider: goodTokens });
    const r = await client.executeForDataset({ datasetId: 'DS1', dax: 'EVALUATE T' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('TRANSPORT');
  });

  it('returns TRANSPORT when the network throws', async () => {
    const client = createQueryClient({ transport: throwingTransport, tokenProvider: goodTokens });
    const r = await client.executeForDataset({ datasetId: 'DS1', dax: 'EVALUATE T' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe('TRANSPORT');
      if (r.error.kind === 'TRANSPORT') expect(r.error.message).toContain('network failure');
    }
  });

  it('returns TRANSPORT when the token provider throws', async () => {
    const client = createQueryClient({ transport: okTransport({}), tokenProvider: throwingTokens });
    const r = await client.executeForDataset({ datasetId: 'DS1', dax: 'EVALUATE T' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe('TRANSPORT');
    }
  });
});
