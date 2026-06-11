
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { act } from 'react';

import { useEmbedTokenRefresh } from './useEmbedTokenRefresh';
import { TOKEN_REFRESH_LEAD_MS } from './embed-types';
import type { EmbedContext } from './embed-types';

interface FakeEmbed {
  setAccessToken: ReturnType<typeof vi.fn>;
  refresh: ReturnType<typeof vi.fn>;
}

function makeFakeEmbed(): FakeEmbed {
  return {
    setAccessToken: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn().mockResolvedValue(undefined),
  };
}

function makeCtx(embed: FakeEmbed | null, loaded: boolean) {
  const setError = vi.fn();
  const setIsLoading = vi.fn();
  const ctx: EmbedContext = {
    embedRef: { current: embed as unknown as EmbedContext['embedRef']['current'] },
    generationRef: { current: 1 },
    hasLoadedRef: { current: loaded },
    tokenExpirationRef: { current: null },
    tokenRefreshInProgressRef: { current: false },
    registeredEventsRef: { current: [] },
    setError,
    setIsLoading,
  };
  return { ctx, setError, setIsLoading };
}

const OPTS = { workspaceId: 'ws-1', itemId: 'item-1' };

function tokenResolves(token: string, expiration: string) {
  vi.mocked(window.electronAPI.content.getEmbedToken).mockResolvedValue({
    success: true,
    data: { token, tokenId: 'tid', expiration },
  });
}

describe('#7 useEmbedTokenRefresh', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('preemptively refreshes the token before expiry and updates the embed', async () => {
    const embed = makeFakeEmbed();
    const { ctx } = makeCtx(embed, true);
    const expiration = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    ctx.tokenExpirationRef.current = expiration;
    tokenResolves('fresh-token', new Date(Date.now() + 70 * 60 * 1000).toISOString());

    const { result } = renderHook(() => useEmbedTokenRefresh(ctx, OPTS));

    act(() => result.current.scheduleProactiveRefresh());

    const fireAt = 10 * 60 * 1000 - TOKEN_REFRESH_LEAD_MS;
    act(() => vi.advanceTimersByTime(fireAt - 1000));
    expect(window.electronAPI.content.getEmbedToken).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(window.electronAPI.content.getEmbedToken).toHaveBeenCalledWith(
      'item-1',
      'ws-1',
    );
    expect(embed.setAccessToken).toHaveBeenCalledWith('fresh-token');
    expect(embed.refresh).toHaveBeenCalledTimes(1);
  });

  it('fires immediately when the token is already inside the lead window', async () => {
    const embed = makeFakeEmbed();
    const { ctx } = makeCtx(embed, true);
    ctx.tokenExpirationRef.current = new Date(Date.now() + 60 * 1000).toISOString();
    tokenResolves('fresh-token', new Date(Date.now() + 70 * 60 * 1000).toISOString());

    const { result } = renderHook(() => useEmbedTokenRefresh(ctx, OPTS));
    act(() => result.current.scheduleProactiveRefresh());

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(embed.setAccessToken).toHaveBeenCalledWith('fresh-token');
  });

  it('surfaces an error when the token IPC fails, without throwing', async () => {
    const embed = makeFakeEmbed();
    const { ctx, setError } = makeCtx(embed, true);
    vi.mocked(window.electronAPI.content.getEmbedToken).mockResolvedValue({
      success: false,
      error: { code: 'TOKEN_FAILED', message: 'boom', userMessage: 'Session expired. Please log in again.' },
    });

    const { result } = renderHook(() => useEmbedTokenRefresh(ctx, OPTS));

    await act(async () => {
      await result.current.refreshEmbedToken();
    });

    expect(setError).toHaveBeenCalledWith('Session expired. Please log in again.');
    expect(embed.setAccessToken).not.toHaveBeenCalled();
  });

  it('is a no-op when the embed has not loaded yet', async () => {
    const embed = makeFakeEmbed();
    const { ctx, setError } = makeCtx(embed, false);
    tokenResolves('fresh-token', new Date(Date.now() + 70 * 60 * 1000).toISOString());

    const { result } = renderHook(() => useEmbedTokenRefresh(ctx, OPTS));

    await act(async () => {
      await result.current.refreshEmbedToken();
    });

    expect(window.electronAPI.content.getEmbedToken).not.toHaveBeenCalled();
    expect(embed.setAccessToken).not.toHaveBeenCalled();
    expect(setError).not.toHaveBeenCalled();
  });

  it('discards a refresh whose generation moved during the IPC (stale switch)', async () => {
    const embed = makeFakeEmbed();
    const { ctx, setError } = makeCtx(embed, true);
    let resolveToken!: (v: unknown) => void;
    vi.mocked(window.electronAPI.content.getEmbedToken).mockReturnValue(
      new Promise((res) => {
        resolveToken = res as (v: unknown) => void;
      }) as ReturnType<typeof window.electronAPI.content.getEmbedToken>,
    );

    const { result } = renderHook(() => useEmbedTokenRefresh(ctx, OPTS));

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.refreshEmbedToken();
    });

    ctx.generationRef.current += 1;

    await act(async () => {
      resolveToken({
        success: true,
        data: { token: 'late-token', tokenId: 'tid', expiration: new Date(Date.now() + 3600000).toISOString() },
      });
      await pending;
    });

    expect(embed.setAccessToken).not.toHaveBeenCalled();
    expect(setError).not.toHaveBeenCalled();
  });

  it("a stale generation's finally does not clear a newer refresh's in-flight flag", async () => {
    const embed = makeFakeEmbed();
    const { ctx } = makeCtx(embed, true);
    const resolvers: Array<(v: unknown) => void> = [];
    vi.mocked(window.electronAPI.content.getEmbedToken).mockImplementation(
      () =>
        new Promise((res) => {
          resolvers.push(res as (v: unknown) => void);
        }) as ReturnType<typeof window.electronAPI.content.getEmbedToken>,
    );

    const { result } = renderHook(() => useEmbedTokenRefresh(ctx, OPTS));

    let stale!: Promise<void>;
    act(() => {
      stale = result.current.refreshEmbedToken();
    });
    expect(ctx.tokenRefreshInProgressRef.current).toBe(true);

    ctx.generationRef.current += 1;
    ctx.tokenRefreshInProgressRef.current = false;

    let fresh!: Promise<void>;
    act(() => {
      fresh = result.current.refreshEmbedToken();
    });
    expect(window.electronAPI.content.getEmbedToken).toHaveBeenCalledTimes(2);
    expect(ctx.tokenRefreshInProgressRef.current).toBe(true);

    await act(async () => {
      resolvers[0]!({
        success: true,
        data: {
          token: 'stale-token',
          tokenId: 'tid',
          expiration: new Date(Date.now() + 3600000).toISOString(),
        },
      });
      await stale;
    });

    expect(ctx.tokenRefreshInProgressRef.current).toBe(true);

    await act(async () => {
      await result.current.refreshEmbedToken();
    });
    expect(window.electronAPI.content.getEmbedToken).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolvers[1]!({
        success: true,
        data: {
          token: 'fresh-token',
          tokenId: 'tid',
          expiration: new Date(Date.now() + 3600000).toISOString(),
        },
      });
      await fresh;
    });

    expect(embed.setAccessToken).toHaveBeenCalledTimes(1);
    expect(embed.setAccessToken).toHaveBeenCalledWith('fresh-token');
    expect(ctx.tokenRefreshInProgressRef.current).toBe(false);
  });

  it('refreshes on visibilitychange when the token is expiring soon', async () => {
    const embed = makeFakeEmbed();
    const { ctx } = makeCtx(embed, true);
    ctx.tokenExpirationRef.current = new Date(Date.now() + 60 * 1000).toISOString();
    tokenResolves('fresh-token', new Date(Date.now() + 70 * 60 * 1000).toISOString());

    renderHook(() => useEmbedTokenRefresh(ctx, OPTS));

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });

    expect(embed.setAccessToken).toHaveBeenCalledWith('fresh-token');
  });
});
