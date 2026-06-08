/**
 * PROD-S1: tests for the kiosk recovery-backoff constants + resolver.
 */

import { describe, it, expect } from 'vitest';
import {
  KIOSK,
  KIOSK_RECOVERY_BACKOFF_MS,
  kioskRecoveryDelayMs,
} from './constants';

describe('PROD-S1 kiosk constants', () => {
  it('exposes the 5s → 30s → 60s backoff schedule', () => {
    expect(KIOSK_RECOVERY_BACKOFF_MS).toEqual([5000, 30000, 60000]);
    // Top-level export mirrors the grouped constant.
    expect(KIOSK_RECOVERY_BACKOFF_MS).toBe(KIOSK.RECOVERY_BACKOFF_MS);
  });

  it('defines cursor-hide and escape-hold timings', () => {
    expect(KIOSK.CURSOR_HIDE_MS).toBeGreaterThan(0);
    expect(KIOSK.ESCAPE_HOLD_MS).toBe(3000);
  });
});

describe('PROD-S1 kioskRecoveryDelayMs', () => {
  it('returns the scheduled delay for each in-range attempt', () => {
    expect(kioskRecoveryDelayMs(0)).toBe(5000);
    expect(kioskRecoveryDelayMs(1)).toBe(30000);
    expect(kioskRecoveryDelayMs(2)).toBe(60000);
  });

  it('clamps past the last step to the final (60s) delay', () => {
    expect(kioskRecoveryDelayMs(3)).toBe(60000);
    expect(kioskRecoveryDelayMs(99)).toBe(60000);
  });

  it('clamps negative indices to the first delay', () => {
    expect(kioskRecoveryDelayMs(-1)).toBe(5000);
  });
});
