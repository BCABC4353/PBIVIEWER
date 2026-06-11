import { describe, it, expect, vi } from 'vitest';
import { HttpError, RetriableHttpError, throwForStatus, withRetry } from './http';

async function classify(status: number, headers?: Record<string, string>): Promise<Error> {
  try {
    await throwForStatus(new Response('upstream error', { status, headers }), 'test');
  } catch (err) {
    return err as Error;
  }
  throw new Error('throwForStatus did not throw');
}

describe('throwForStatus — retriable status classification', () => {
  it.each([500, 502, 503, 504])('maps %i to RetriableHttpError', async (status) => {
    const err = await classify(status);
    expect(err).toBeInstanceOf(RetriableHttpError);
    expect((err as RetriableHttpError).status).toBe(status);
  });

  it('maps 429 to RetriableHttpError carrying the Retry-After delay', async () => {
    const err = await classify(429, { 'Retry-After': '2' });
    expect(err).toBeInstanceOf(RetriableHttpError);
    expect((err as RetriableHttpError).retryAfterMs).toBe(2000);
  });

  it.each([400, 401, 403, 404])('maps %i to a non-retriable HttpError', async (status) => {
    const err = await classify(status);
    expect(err).toBeInstanceOf(HttpError);
    expect(err).not.toBeInstanceOf(RetriableHttpError);
    expect((err as HttpError).status).toBe(status);
  });
});

describe('withRetry', () => {
  it('retries a 502 Bad Gateway (corporate proxy blip) and succeeds on the next attempt', async () => {
    const responses = [
      new Response('bad gateway', { status: 502 }),
      new Response(JSON.stringify({ value: [] }), { status: 200 }),
    ];
    const fn = vi.fn(async () => {
      const response = responses.shift()!;
      if (!response.ok) await throwForStatus(response, 'test');
      return response.json();
    });

    const result = await withRetry(fn, { baseDelayMs: 0 });
    expect(result).toEqual({ value: [] });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries RetriableHttpError up to maxAttempts then rethrows', async () => {
    const fn = vi.fn(async () => {
      throw new RetriableHttpError(502, 'still bad');
    });
    await expect(withRetry(fn, { maxAttempts: 3, baseDelayMs: 0 })).rejects.toMatchObject({
      name: 'RetriableHttpError',
      status: 502,
    });
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry a non-retriable HttpError', async () => {
    const fn = vi.fn(async () => {
      throw new HttpError(404, 'gone');
    });
    await expect(withRetry(fn, { baseDelayMs: 0 })).rejects.toMatchObject({
      name: 'HttpError',
      status: 404,
    });
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
