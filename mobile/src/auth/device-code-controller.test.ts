import { describe, expect, it } from 'vitest';
import {
  DeviceCodeCancelledError,
  type DeviceCodeChallenge,
  type DeviceCodePollHooks,
} from './device-code-auth';
import { DeviceCodeController, type DeviceCodeFlowState } from './device-code-controller';
import type { TokenSet, UserInfo } from './token-manager';

const CHALLENGE: DeviceCodeChallenge = {
  deviceCode: 'dev-code-opaque',
  userCode: 'BXQ4-HT7P',
  verificationUri: 'https://microsoft.com/devicelogin',
  expiresInSec: 900,
  intervalSec: 5,
};

function tokensFor(tag: string): TokenSet {
  return {
    accessToken: `at-${tag}`,
    expiresAt: 9_999_999,
    refreshToken: `rt-${tag}`,
    user: { username: `${tag}@bc-abc.com` },
  };
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

function harness() {
  const polls: Array<{ hooks: DeviceCodePollHooks; result: Deferred<TokenSet> }> = [];
  const adopted: TokenSet[] = [];
  let persistCount = 0;
  const states: DeviceCodeFlowState[] = [];
  const signedIn: Array<UserInfo | null> = [];
  const controller = new DeviceCodeController({
    requestCode: () => Promise.resolve(CHALLENGE),
    poll: (_challenge, hooks) => {
      const result = deferred<TokenSet>();
      polls.push({ hooks, result });
      return result.promise;
    },
    adoptTokens: (set) => {
      adopted.push(set);
      return Promise.resolve(set.user ?? null);
    },
    persistLiveMode: () => {
      persistCount += 1;
      return Promise.resolve();
    },
  });
  const unsubscribeState = controller.subscribe((s) => states.push(s));
  const unsubscribeSignIn = controller.onSignedIn((u) => signedIn.push(u));
  return {
    controller,
    polls,
    adopted,
    states,
    signedIn,
    persists: () => persistCount,
    unsubscribeState,
    unsubscribeSignIn,
  };
}

describe('DeviceCodeController generations', () => {
  it('walks requesting → polling with the challenge code, and slow_down updates the poll status', async () => {
    const h = harness();
    const startP = h.controller.start();
    await tick();
    expect(h.states[0]).toEqual({ phase: 'requesting' });
    expect(h.controller.getState()).toEqual({
      phase: 'polling',
      userCode: 'BXQ4-HT7P',
      pollStatus: 'waiting',
    });
    h.polls[0]!.hooks.onStatus?.('slow_down');
    expect(h.controller.getState()).toEqual({
      phase: 'polling',
      userCode: 'BXQ4-HT7P',
      pollStatus: 'slow_down',
    });
    h.polls[0]!.result.resolve(tokensFor('a'));
    const user = await startP;
    expect(user).toEqual({ username: 'a@bc-abc.com' });
    expect(h.controller.getState()).toEqual({ phase: 'idle' });
  });

  it('a new start invalidates the previous attempt — the old completion is ignored, the new one wins', async () => {
    const h = harness();
    const firstP = h.controller.start();
    await tick();
    const secondP = h.controller.start();
    await tick();
    expect(h.polls).toHaveLength(2);
    expect(h.polls[0]!.hooks.cancelled?.()).toBe(true);
    expect(h.polls[1]!.hooks.cancelled?.()).toBe(false);

    h.polls[0]!.result.resolve(tokensFor('stale'));
    expect(await firstP).toBeNull();
    expect(h.adopted).toHaveLength(0);
    expect(h.signedIn).toHaveLength(0);
    expect(h.controller.getState()).toEqual({
      phase: 'polling',
      userCode: 'BXQ4-HT7P',
      pollStatus: 'waiting',
    });

    h.polls[1]!.result.resolve(tokensFor('fresh'));
    expect(await secondP).toEqual({ username: 'fresh@bc-abc.com' });
    expect(h.adopted.map((t) => t.accessToken)).toEqual(['at-fresh']);
    expect(h.signedIn).toEqual([{ username: 'fresh@bc-abc.com' }]);
  });

  it('cancel → reconnect never revives the cancelled loop', async () => {
    const h = harness();
    const firstP = h.controller.start();
    await tick();
    h.controller.cancel();
    expect(h.controller.getState()).toEqual({ phase: 'idle' });
    expect(h.polls[0]!.hooks.cancelled?.()).toBe(true);

    const secondP = h.controller.start();
    await tick();
    expect(h.polls[0]!.hooks.cancelled?.()).toBe(true);
    expect(h.polls[1]!.hooks.cancelled?.()).toBe(false);

    h.polls[0]!.result.reject(new DeviceCodeCancelledError());
    expect(await firstP).toBeNull();
    expect(h.controller.getState()).toEqual({
      phase: 'polling',
      userCode: 'BXQ4-HT7P',
      pollStatus: 'waiting',
    });

    h.polls[1]!.result.resolve(tokensFor('b'));
    expect(await secondP).toEqual({ username: 'b@bc-abc.com' });
    expect(h.adopted.map((t) => t.accessToken)).toEqual(['at-b']);
  });

  it('polling survives a subscriber unsubscribing — unsubscribe is not cancellation', async () => {
    const h = harness();
    const startP = h.controller.start();
    await tick();
    h.unsubscribeState();
    expect(h.polls[0]!.hooks.cancelled?.()).toBe(false);

    h.polls[0]!.result.resolve(tokensFor('c'));
    expect(await startP).toEqual({ username: 'c@bc-abc.com' });
    expect(h.adopted).toHaveLength(1);
    expect(h.controller.getState()).toEqual({ phase: 'idle' });
  });

  it('completion after the screen unmounts still adopts tokens, persists live mode, and notifies', async () => {
    const h = harness();
    const startP = h.controller.start();
    await tick();
    h.unsubscribeState();

    h.polls[0]!.result.resolve(tokensFor('d'));
    await startP;
    expect(h.adopted.map((t) => t.accessToken)).toEqual(['at-d']);
    expect(h.persists()).toBe(1);
    expect(h.signedIn).toEqual([{ username: 'd@bc-abc.com' }]);
  });

  it('a poll failure surfaces as an error state, and clearError returns to idle', async () => {
    const h = harness();
    const startP = h.controller.start();
    await tick();
    h.polls[0]!.result.reject(new Error('Sign-in was declined on the Microsoft page.'));
    expect(await startP).toBeNull();
    expect(h.controller.getState()).toEqual({
      phase: 'error',
      message: 'Sign-in was declined on the Microsoft page.',
    });
    expect(h.signedIn).toHaveLength(0);
    h.controller.clearError();
    expect(h.controller.getState()).toEqual({ phase: 'idle' });
  });

  it('a stale attempt failing never clobbers the active attempt with an error state', async () => {
    const h = harness();
    const firstP = h.controller.start();
    await tick();
    const secondP = h.controller.start();
    await tick();

    h.polls[0]!.result.reject(new Error('boom from the abandoned attempt'));
    expect(await firstP).toBeNull();
    expect(h.controller.getState()).toEqual({
      phase: 'polling',
      userCode: 'BXQ4-HT7P',
      pollStatus: 'waiting',
    });

    h.polls[1]!.result.resolve(tokensFor('e'));
    await secondP;
    expect(h.controller.getState()).toEqual({ phase: 'idle' });
  });

  it('a stale attempt status callback cannot mutate the active attempt state', async () => {
    const h = harness();
    void h.controller.start();
    await tick();
    void h.controller.start();
    await tick();

    h.polls[0]!.hooks.onStatus?.('slow_down');
    expect(h.controller.getState()).toEqual({
      phase: 'polling',
      userCode: 'BXQ4-HT7P',
      pollStatus: 'waiting',
    });
  });
});
