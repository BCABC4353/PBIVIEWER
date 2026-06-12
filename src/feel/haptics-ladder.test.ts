import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('expo-haptics', () => ({
  selectionAsync: vi.fn().mockResolvedValue(undefined),
  notificationAsync: vi.fn().mockResolvedValue(undefined),
  impactAsync: vi.fn().mockResolvedValue(undefined),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Rigid: 'rigid', Heavy: 'heavy', Soft: 'soft' },
}));

import * as Haptics from 'expo-haptics';
import { type HapticDriver } from './haptics-driver';
import { selectTier, buildLadder } from './haptics-ladder';

function makeRecordingDriver(opts: { supportsDesigned?: boolean; supportsComposed?: boolean } = {}) {
  const calls: string[] = [];
  return {
    driver: {
      supportsDesigned: opts.supportsDesigned ?? false,
      supportsComposed: opts.supportsComposed ?? false,
      playDesignedEngage: async () => { calls.push('designedEngage'); },
      playDesignedGive: async () => { calls.push('designedGive'); },
      playDesignedResurface: async () => { calls.push('designedResurface'); },
      playComposedEngage: async () => { calls.push('composedEngage'); },
      playComposedGive: async () => { calls.push('composedGive'); },
      playComposedResurface: async () => { calls.push('composedResurface'); },
    } satisfies HapticDriver,
    calls,
  };
}

function flush(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

describe('selectTier', () => {
  it('returns designed when supportsDesigned is true', () => {
    expect(selectTier({ supportsDesigned: true, supportsComposed: true })).toBe('designed');
  });

  it('returns designed when supportsDesigned true and supportsComposed false', () => {
    expect(selectTier({ supportsDesigned: true, supportsComposed: false })).toBe('designed');
  });

  it('returns composed when only supportsComposed is true', () => {
    expect(selectTier({ supportsDesigned: false, supportsComposed: true })).toBe('composed');
  });

  it('returns preset when neither is supported', () => {
    expect(selectTier({ supportsDesigned: false, supportsComposed: false })).toBe('preset');
  });
});

describe('buildLadder / pushThrough', () => {
  beforeEach(() => {
    vi.mocked(Haptics.impactAsync).mockClear();
  });

  it('calls playDesignedEngage then playDesignedGive in order when supportsDesigned', async () => {
    const { driver, calls } = makeRecordingDriver({ supportsDesigned: true });
    const ladder = buildLadder({ driver, getEnabled: () => true });
    ladder.pushThrough();
    await flush();
    expect(calls).toEqual(['designedEngage', 'designedGive']);
  });

  it('calls playComposedEngage then playComposedGive when only composed', async () => {
    const { driver, calls } = makeRecordingDriver({ supportsComposed: true });
    const ladder = buildLadder({ driver, getEnabled: () => true });
    ladder.pushThrough();
    await flush();
    expect(calls).toEqual(['composedEngage', 'composedGive']);
  });

  it('calls impactAsync Medium then Light for preset tier', async () => {
    const ladder = buildLadder({ getEnabled: () => true });
    ladder.pushThrough();
    await flush();
    expect(vi.mocked(Haptics.impactAsync)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(Haptics.impactAsync)).toHaveBeenNthCalledWith(1, Haptics.ImpactFeedbackStyle.Medium);
    expect(vi.mocked(Haptics.impactAsync)).toHaveBeenNthCalledWith(2, Haptics.ImpactFeedbackStyle.Light);
  });

  it('does nothing when disabled', async () => {
    const { driver, calls } = makeRecordingDriver({ supportsDesigned: true });
    const ladder = buildLadder({ driver, getEnabled: () => false });
    ladder.pushThrough();
    await flush();
    expect(calls).toEqual([]);
    expect(vi.mocked(Haptics.impactAsync)).not.toHaveBeenCalled();
  });
});

describe('buildLadder / resurface', () => {
  beforeEach(() => {
    vi.mocked(Haptics.impactAsync).mockClear();
  });

  it('calls playDesignedResurface when designed', async () => {
    const { driver, calls } = makeRecordingDriver({ supportsDesigned: true });
    const ladder = buildLadder({ driver, getEnabled: () => true });
    ladder.resurface();
    await flush();
    expect(calls).toEqual(['designedResurface']);
  });

  it('calls playComposedResurface when composed', async () => {
    const { driver, calls } = makeRecordingDriver({ supportsComposed: true });
    const ladder = buildLadder({ driver, getEnabled: () => true });
    ladder.resurface();
    await flush();
    expect(calls).toEqual(['composedResurface']);
  });

  it('calls impactAsync Light for preset tier', async () => {
    const ladder = buildLadder({ getEnabled: () => true });
    ladder.resurface();
    await flush();
    expect(vi.mocked(Haptics.impactAsync)).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
  });

  it('does nothing when disabled', async () => {
    const { driver, calls } = makeRecordingDriver({ supportsDesigned: true });
    const ladder = buildLadder({ driver, getEnabled: () => false });
    ladder.resurface();
    await flush();
    expect(calls).toEqual([]);
    expect(vi.mocked(Haptics.impactAsync)).not.toHaveBeenCalled();
  });
});

describe('buildLadder / detent rate limiting', () => {
  beforeEach(() => {
    vi.mocked(Haptics.selectionAsync).mockClear();
  });

  it('fires on the first call', () => {
    let t = 0;
    const ladder = buildLadder({ getEnabled: () => true, now: () => t });
    ladder.detent();
    expect(vi.mocked(Haptics.selectionAsync)).toHaveBeenCalledTimes(1);
  });

  it('silences a second call inside the rate window', () => {
    let t = 0;
    const ladder = buildLadder({ getEnabled: () => true, now: () => t });
    ladder.detent();
    t += 10;
    ladder.detent();
    expect(vi.mocked(Haptics.selectionAsync)).toHaveBeenCalledTimes(1);
  });

  it('allows a second call after the window elapses', () => {
    let t = 0;
    const ladder = buildLadder({ getEnabled: () => true, now: () => t });
    ladder.detent();
    t += 40;
    ladder.detent();
    expect(vi.mocked(Haptics.selectionAsync)).toHaveBeenCalledTimes(2);
  });
});
