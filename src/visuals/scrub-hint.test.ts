import { describe, expect, it, vi } from 'vitest';
import { createScrubHintGate } from './scrub-hint';

describe('createScrubHintGate', () => {
  it('only the first claimant per session shows the hint', () => {
    const gate = createScrubHintGate();
    expect(gate.claim()).toBe(true);
    expect(gate.claim()).toBe(false);
    expect(gate.claim()).toBe(false);
  });

  it('dismiss notifies listeners exactly once', () => {
    const gate = createScrubHintGate();
    const listener = vi.fn();
    gate.onDismiss(listener);
    gate.dismiss();
    gate.dismiss();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(gate.dismissed()).toBe(true);
  });

  it('a scrub before any chart claimed suppresses the hint for the session', () => {
    const gate = createScrubHintGate();
    gate.dismiss();
    expect(gate.claim()).toBe(false);
  });

  it('unsubscribed listeners are not called', () => {
    const gate = createScrubHintGate();
    const listener = vi.fn();
    const off = gate.onDismiss(listener);
    off();
    gate.dismiss();
    expect(listener).not.toHaveBeenCalled();
  });

  it('starts undismissed', () => {
    expect(createScrubHintGate().dismissed()).toBe(false);
  });
});
