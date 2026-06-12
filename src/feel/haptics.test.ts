import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('expo-haptics', () => ({
  selectionAsync: vi.fn().mockResolvedValue(undefined),
  notificationAsync: vi.fn().mockResolvedValue(undefined),
  impactAsync: vi.fn().mockResolvedValue(undefined),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Rigid: 'rigid', Heavy: 'heavy', Soft: 'soft' },
}));

import * as Haptics from 'expo-haptics';
import {
  setHapticsEnabled,
  hapticsEnabled,
  tap,
  confirm,
  warn,
  fault,
  thunk,
  latch,
  detent,
  pushThrough,
  resurface,
  probeHaptics,
  type HapticProbeResult,
} from './haptics';

beforeEach(() => {
  setHapticsEnabled(true);
  vi.mocked(Haptics.selectionAsync).mockClear();
  vi.mocked(Haptics.notificationAsync).mockClear();
  vi.mocked(Haptics.impactAsync).mockClear();
});

describe('setHapticsEnabled / hapticsEnabled', () => {
  it('defaults to enabled', () => {
    expect(hapticsEnabled()).toBe(true);
  });

  it('round-trips false', () => {
    setHapticsEnabled(false);
    expect(hapticsEnabled()).toBe(false);
  });

  it('round-trips true after false', () => {
    setHapticsEnabled(false);
    setHapticsEnabled(true);
    expect(hapticsEnabled()).toBe(true);
  });
});

describe('verbs when disabled', () => {
  beforeEach(() => setHapticsEnabled(false));

  it('tap does not throw', () => { expect(() => tap()).not.toThrow(); });
  it('confirm does not throw', () => { expect(() => confirm()).not.toThrow(); });
  it('warn does not throw', () => { expect(() => warn()).not.toThrow(); });
  it('fault does not throw', () => { expect(() => fault()).not.toThrow(); });
  it('thunk does not throw', () => { expect(() => thunk()).not.toThrow(); });
  it('latch does not throw', () => { expect(() => latch()).not.toThrow(); });
  it('detent does not throw', () => { expect(() => detent()).not.toThrow(); });

  it('tap does not fire haptics', () => {
    tap();
    expect(vi.mocked(Haptics.selectionAsync)).not.toHaveBeenCalled();
  });

  it('confirm does not fire haptics', () => {
    confirm();
    expect(vi.mocked(Haptics.notificationAsync)).not.toHaveBeenCalled();
  });
});

describe('pushThrough / resurface', () => {
  it('pushThrough does not throw when enabled', () => {
    expect(() => pushThrough()).not.toThrow();
  });

  it('resurface does not throw when enabled', () => {
    expect(() => resurface()).not.toThrow();
  });

  it('pushThrough does not throw when disabled', () => {
    setHapticsEnabled(false);
    expect(() => pushThrough()).not.toThrow();
  });

  it('resurface does not throw when disabled', () => {
    setHapticsEnabled(false);
    expect(() => resurface()).not.toThrow();
  });
});

describe('probeHaptics', () => {
  const noPause = () => Promise.resolve();

  it('returns one result per verb', async () => {
    const results = await probeHaptics(undefined, noPause);
    expect(results).toHaveLength(7);
  });

  it('each result has a verb string and ok:true on success', async () => {
    const results = await probeHaptics(undefined, noPause);
    for (const r of results) {
      expect(typeof r.verb).toBe('string');
      expect(r.ok).toBe(true);
    }
  });

  it('calls onResult for each verb', async () => {
    const seen: HapticProbeResult[] = [];
    await probeHaptics((r) => seen.push(r), noPause);
    expect(seen).toHaveLength(7);
  });

  it('marks verb as failed when the native call throws', async () => {
    vi.mocked(Haptics.selectionAsync).mockRejectedValueOnce(new Error('no bridge'));
    const results = await probeHaptics(undefined, noPause);
    expect(results[0]?.ok).toBe(false);
    expect(results[0]?.detail).toBe('no bridge');
  });

  it('continues probing after a failure', async () => {
    vi.mocked(Haptics.selectionAsync).mockRejectedValue(new Error('no bridge'));
    const results = await probeHaptics(undefined, noPause);
    const failures = results.filter((r) => !r.ok);
    expect(failures.length).toBeGreaterThan(0);
    expect(results).toHaveLength(7);
  });
});
