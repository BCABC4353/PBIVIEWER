/**
 * #7 Embed core behavioral coverage — lifecycle / orchestrator.
 *
 * Drives the full usePowerBIEmbed composition (lifecycle + token refresh +
 * watchdog) against a controllable fake Power BI service + fake embed, with the
 * getEmbedToken IPC mocked. Asserts REAL behavior, not tautologies:
 *   - mount fetches a token, builds the config, and embeds it
 *   - the built-in 'loaded' handler clears loading + runs the caller's loaded
 *   - the built-in 'error' handler (pre-load) surfaces the error to UI
 *   - a token-expiry error routes to refresh (setAccessToken), not the error UI
 *   - a not-found error reaches the caller's handler (eviction path) w/o throwing
 *   - a failed token IPC surfaces the friendly error
 *   - the watchdog fires when 'loaded' never arrives
 *   - teardownNow detaches handlers + resets the container; remount re-embeds
 *     exactly once (no double-embed)
 *   - unmount detaches handlers and resets the container
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import * as pbi from 'powerbi-client';

import { isNotFoundError } from '../../shared/powerbi-errors';

// ---------------------------------------------------------------------------
// Controllable fake embed + Power BI service. usePowerBIService is the single
// seam: every embed goes through powerbiService.embed()/reset().
// ---------------------------------------------------------------------------
const h = vi.hoisted(() => {
  type Handler = (event: unknown) => void;

  class FakeEmbed {
    handlers = new Map<string, Handler[]>();
    setAccessToken = vi.fn().mockResolvedValue(undefined);
    refresh = vi.fn().mockResolvedValue(undefined);

    on(event: string, handler: Handler) {
      const list = this.handlers.get(event) ?? [];
      list.push(handler);
      this.handlers.set(event, list);
    }

    off(event: string) {
      this.handlers.delete(event);
    }

    fire(event: string, detail?: unknown) {
      for (const handler of this.handlers.get(event) ?? []) {
        handler({ detail });
      }
    }

    handlerCount() {
      let n = 0;
      for (const list of this.handlers.values()) n += list.length;
      return n;
    }
  }

  const service = {
    embeds: [] as FakeEmbed[],
    embed: vi.fn((_container: HTMLElement, _config: unknown) => {
      const e = new FakeEmbed();
      service.embeds.push(e);
      return e;
    }),
    reset: vi.fn(),
  };

  return { FakeEmbed, service };
});

vi.mock('./usePowerBIService', () => ({
  usePowerBIService: () => h.service,
  default: () => h.service,
}));

import { usePowerBIEmbed } from './usePowerBIEmbed';
import type { UsePowerBIEmbedOptions } from './usePowerBIEmbed';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeContainerRef(): React.RefObject<HTMLDivElement | null> {
  return { current: document.createElement('div') };
}

function tokenResolves(token = 'tok', expiration?: string) {
  vi.mocked(window.electronAPI.content.getEmbedToken).mockResolvedValue({
    success: true,
    data: {
      token,
      tokenId: 'tid',
      expiration: expiration ?? new Date(Date.now() + 3600_000).toISOString(),
    },
  });
}

function baseOptions(
  over: Partial<UsePowerBIEmbedOptions> = {},
): UsePowerBIEmbedOptions {
  return {
    workspaceId: 'ws-1',
    itemId: 'item-1',
    containerRef: makeContainerRef(),
    buildConfig: (token: string) =>
      ({ type: 'report', accessToken: token }) as pbi.IReportEmbedConfiguration,
    autoRefreshEnabled: false,
    watchdogMs: 45000,
    ...over,
  };
}

/** The most recently created fake embed. */
function lastEmbed() {
  return h.service.embeds.at(-1)!;
}

beforeEach(() => {
  vi.useFakeTimers();
  h.service.embeds = [];
  h.service.embed.mockClear();
  h.service.reset.mockClear();
  tokenResolves();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Render the hook and flush the async load (token IPC + embed). */
async function renderEmbed(options: UsePowerBIEmbedOptions) {
  const view = renderHook((props: UsePowerBIEmbedOptions) => usePowerBIEmbed(props), {
    initialProps: options,
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return view;
}

describe('#7 usePowerBIEmbed lifecycle', () => {
  it('fetches a token, builds config, and embeds on mount', async () => {
    const buildConfig = vi.fn(
      (token: string) =>
        ({ type: 'report', accessToken: token }) as pbi.IReportEmbedConfiguration,
    );
    await renderEmbed(baseOptions({ buildConfig }));

    expect(window.electronAPI.content.getEmbedToken).toHaveBeenCalledWith(
      'item-1',
      'ws-1',
    );
    expect(buildConfig).toHaveBeenCalledWith('tok');
    expect(h.service.embed).toHaveBeenCalledTimes(1);
    expect(lastEmbed().handlers.has('loaded')).toBe(true);
    expect(lastEmbed().handlers.has('error')).toBe(true);
  });

  it("the 'loaded' event clears loading and runs the caller's loaded handler", async () => {
    const onLoaded = vi.fn();
    const view = await renderEmbed(baseOptions({ events: { loaded: onLoaded } }));

    expect(view.result.current.isLoading).toBe(true);

    act(() => lastEmbed().fire('loaded'));

    expect(view.result.current.isLoading).toBe(false);
    expect(view.result.current.error).toBeNull();
    expect(onLoaded).toHaveBeenCalledTimes(1);
  });

  it("a pre-load 'error' event surfaces the error to the UI", async () => {
    const view = await renderEmbed(baseOptions());

    act(() =>
      lastEmbed().fire('error', { message: 'Something exploded' }),
    );

    expect(view.result.current.error).toBe('Something exploded');
    expect(view.result.current.isLoading).toBe(false);
  });

  it('a token-expiry error routes to refresh (setAccessToken), not the error UI', async () => {
    // Expiry far in the future so the proactive timer cannot fire and mask the
    // error-driven refresh — the only path that can call setAccessToken here is
    // the 'error' handler routing TokenExpired to refreshEmbedToken().
    const farExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    tokenResolves('tok', farExpiry);
    const view = await renderEmbed(baseOptions());
    // Mark as loaded so refreshEmbedToken's loaded-guard passes.
    act(() => lastEmbed().fire('loaded'));
    const embed = lastEmbed();
    embed.setAccessToken.mockClear();
    tokenResolves('refreshed-token', farExpiry);

    // Drive only microtasks — no timers — so a token-expiry refresh is the sole
    // possible cause of setAccessToken.
    await act(async () => {
      embed.fire('error', { message: 'TokenExpired' });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(embed.setAccessToken).toHaveBeenCalledWith('refreshed-token');
    // Token-expiry must NOT paint the error UI.
    expect(view.result.current.error).toBeNull();
  });

  it('routes a not-found error to the caller handler (eviction path) without throwing', async () => {
    const onError = vi.fn();
    const view = await renderEmbed(
      baseOptions({ events: { error: onError }, surfacePostLoadErrors: true }),
    );

    act(() =>
      lastEmbed().fire('error', { message: 'PowerBIEntityNotFound' }),
    );

    expect(onError).toHaveBeenCalledTimes(1);
    // The caller inspects the event detail to decide eviction.
    const event = onError.mock.calls[0]?.[0] as { detail: unknown };
    expect(isNotFoundError(event.detail)).toBe(true);
    expect(view.result.current.error).toBe('PowerBIEntityNotFound');
  });

  it('surfaces the friendly error when the token IPC fails', async () => {
    vi.mocked(window.electronAPI.content.getEmbedToken).mockResolvedValue({
      success: false,
      error: { code: 'FAIL', message: 'raw', userMessage: 'Please sign in again.' },
    });

    const view = await renderEmbed(baseOptions());

    expect(view.result.current.error).toBe('Please sign in again.');
    expect(view.result.current.isLoading).toBe(false);
    expect(h.service.embed).not.toHaveBeenCalled();
  });

  it('fires the watchdog when the embed never reports loaded', async () => {
    const view = await renderEmbed(baseOptions({ watchdogMs: 45000 }));
    expect(view.result.current.error).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(45000);
    });

    expect(view.result.current.error).toContain('taking too long');
    expect(view.result.current.isLoading).toBe(false);
  });

  it('teardownNow detaches handlers and resets the container', async () => {
    const view = await renderEmbed(baseOptions());
    act(() => lastEmbed().fire('loaded'));
    const embed = lastEmbed();
    expect(embed.handlerCount()).toBeGreaterThan(0);
    h.service.reset.mockClear();

    act(() => view.result.current.teardownNow());

    expect(embed.handlerCount()).toBe(0);
    expect(h.service.reset).toHaveBeenCalled();
    expect(view.result.current.embedRef.current).toBeNull();
  });

  it('reload re-embeds exactly once (no double-embed)', async () => {
    const view = await renderEmbed(baseOptions());
    act(() => lastEmbed().fire('loaded'));
    expect(h.service.embed).toHaveBeenCalledTimes(1);

    await act(async () => {
      view.result.current.reload();
      await Promise.resolve();
      await Promise.resolve();
    });

    // One additional embed — the prior one was torn down, not duplicated.
    expect(h.service.embed).toHaveBeenCalledTimes(2);
    expect(h.service.embeds).toHaveLength(2);
  });

  it('unmount detaches handlers and resets the container', async () => {
    const view = await renderEmbed(baseOptions());
    act(() => lastEmbed().fire('loaded'));
    const embed = lastEmbed();
    h.service.reset.mockClear();

    act(() => view.unmount());

    expect(embed.handlerCount()).toBe(0);
    expect(h.service.reset).toHaveBeenCalled();
  });

  it('sets an error for invalid embed params (missing workspace/item)', async () => {
    const view = await renderEmbed(
      baseOptions({ workspaceId: undefined, itemId: undefined }),
    );
    expect(view.result.current.error).toBe('Invalid embed parameters');
    expect(view.result.current.isLoading).toBe(false);
    expect(h.service.embed).not.toHaveBeenCalled();
  });
});
