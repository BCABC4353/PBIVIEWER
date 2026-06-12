import { vi, describe, it, expect } from 'vitest';

vi.mock('expo-haptics', () => ({
  selectionAsync: vi.fn().mockResolvedValue(undefined),
  notificationAsync: vi.fn().mockResolvedValue(undefined),
  impactAsync: vi.fn().mockResolvedValue(undefined),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Rigid: 'rigid', Heavy: 'heavy', Soft: 'soft' },
}));

import { type HapticDriver } from '../feel/haptics-driver';
import { buildLadder } from '../feel/haptics-ladder';

function makeRecordingDriver(
  opts: { supportsDesigned?: boolean; supportsComposed?: boolean } = {},
) {
  const calls: string[] = [];
  const driver: HapticDriver = {
    supportsDesigned: opts.supportsDesigned ?? false,
    supportsComposed: opts.supportsComposed ?? false,
    playDesignedEngage: async () => { calls.push('designedEngage'); },
    playDesignedGive: async () => { calls.push('designedGive'); },
    playDesignedResurface: async () => { calls.push('designedResurface'); },
    playComposedEngage: async () => { calls.push('composedEngage'); },
    playComposedGive: async () => { calls.push('composedGive'); },
    playComposedResurface: async () => { calls.push('composedResurface'); },
  };
  return { driver, calls };
}

function flush(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

describe('drill engage fires pushThrough verbs in ORDER (engage then give)', () => {
  it('designed tier: engage then give on pushThrough (drill)', async () => {
    const { driver, calls } = makeRecordingDriver({ supportsDesigned: true });
    const ladder = buildLadder({ driver, getEnabled: () => true });
    ladder.pushThrough();
    await flush();
    expect(calls[0]).toBe('designedEngage');
    expect(calls[1]).toBe('designedGive');
    expect(calls.length).toBe(2);
  });

  it('composed tier: engage then give in order on pushThrough (drill)', async () => {
    const { driver, calls } = makeRecordingDriver({ supportsComposed: true });
    const ladder = buildLadder({ driver, getEnabled: () => true });
    ladder.pushThrough();
    await flush();
    expect(calls[0]).toBe('composedEngage');
    expect(calls[1]).toBe('composedGive');
    expect(calls.length).toBe(2);
  });
});

describe('return fires resurface verb', () => {
  it('designed tier: resurface fires on return (single verb)', async () => {
    const { driver, calls } = makeRecordingDriver({ supportsDesigned: true });
    const ladder = buildLadder({ driver, getEnabled: () => true });
    ladder.resurface();
    await flush();
    expect(calls[0]).toBe('designedResurface');
    expect(calls.length).toBe(1);
  });

  it('composed tier: resurface fires on return (single verb)', async () => {
    const { driver, calls } = makeRecordingDriver({ supportsComposed: true });
    const ladder = buildLadder({ driver, getEnabled: () => true });
    ladder.resurface();
    await flush();
    expect(calls[0]).toBe('composedResurface');
    expect(calls.length).toBe(1);
  });
});

describe('drill sequence: pushThrough then resurface — full verb order', () => {
  it('designed tier: full drill+return sequence emits engage, give, resurface in order', async () => {
    const { driver, calls } = makeRecordingDriver({ supportsDesigned: true });
    const ladder = buildLadder({ driver, getEnabled: () => true });
    ladder.pushThrough();
    await flush();
    ladder.resurface();
    await flush();
    expect(calls).toEqual(['designedEngage', 'designedGive', 'designedResurface']);
  });

  it('composed tier: full drill+return sequence emits engage, give, resurface in order', async () => {
    const { driver, calls } = makeRecordingDriver({ supportsComposed: true });
    const ladder = buildLadder({ driver, getEnabled: () => true });
    ladder.pushThrough();
    await flush();
    ladder.resurface();
    await flush();
    expect(calls).toEqual(['composedEngage', 'composedGive', 'composedResurface']);
  });

  it('no verbs fire when haptics disabled', async () => {
    const { driver, calls } = makeRecordingDriver({ supportsDesigned: true });
    const ladder = buildLadder({ driver, getEnabled: () => false });
    ladder.pushThrough();
    await flush();
    ladder.resurface();
    await flush();
    expect(calls).toEqual([]);
  });
});
