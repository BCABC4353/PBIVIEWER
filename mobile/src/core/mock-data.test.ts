import { describe, expect, it } from 'vitest';
import { MOCK_STAGE_DELAYS_MS, MockDataSource } from './mock-data';

function fakeSleep() {
  const slept: number[] = [];
  const sleep = (ms: number) => {
    slept.push(ms);
    return Promise.resolve();
  };
  return { sleep, slept };
}

describe('MockDataSource staged loader', () => {
  it('without onProgress: single-resolve with the old 600 ms beat (live-shaped behavior)', async () => {
    const { sleep, slept } = fakeSleep();
    const snap = await new MockDataSource({ sleep }).getFleetSnapshot();
    expect(slept).toEqual([600]);
    expect(snap.refreshables).toHaveLength(6);
  });

  it('with onProgress: one increment per sample item, items counting 1..N', async () => {
    const { sleep } = fakeSleep();
    const events: Array<{ progress: number; items: number }> = [];
    const snap = await new MockDataSource({ sleep }).getFleetSnapshot(false, (progress, items) =>
      events.push({ progress, items }),
    );
    expect(events).toHaveLength(snap.refreshables.length);
    expect(events.map((e) => e.items)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('progress climbs strictly to exactly 1 on the final item', async () => {
    const { sleep } = fakeSleep();
    const progress: number[] = [];
    await new MockDataSource({ sleep }).getFleetSnapshot(false, (p) => progress.push(p));
    for (let i = 1; i < progress.length; i++) {
      expect(progress[i]!).toBeGreaterThan(progress[i - 1]!);
    }
    expect(progress[0]).toBeGreaterThan(0);
    expect(progress[progress.length - 1]).toBe(1);
  });

  it('staging sums to ~2.2 s with a longer first beat (the key turn)', async () => {
    const { sleep, slept } = fakeSleep();
    await new MockDataSource({ sleep }).getFleetSnapshot(false, () => {});
    expect(slept).toEqual([...MOCK_STAGE_DELAYS_MS]);
    const total = slept.reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThanOrEqual(2000);
    expect(total).toBeLessThanOrEqual(2500);
    expect(slept[0]!).toBeGreaterThan(slept[1]!);
  });

  it('each increment lands only after its stage delay (sleep precedes onProgress)', async () => {
    const order: string[] = [];
    const sleep = (ms: number) => {
      order.push(`sleep:${ms}`);
      return Promise.resolve();
    };
    await new MockDataSource({ sleep }).getFleetSnapshot(false, (_p, items) =>
      order.push(`tick:${items}`),
    );
    expect(order.slice(0, 4)).toEqual([
      `sleep:${MOCK_STAGE_DELAYS_MS[0]}`,
      'tick:1',
      `sleep:${MOCK_STAGE_DELAYS_MS[1]}`,
      'tick:2',
    ]);
  });

  it('still contains the failed sample item so the sweep CATCH path stays demonstrable', async () => {
    const { sleep } = fakeSleep();
    const snap = await new MockDataSource({ sleep }).getFleetSnapshot(false, () => {});
    expect(snap.refreshables.some((r) => r.lastStatus === 'Failed')).toBe(true);
    expect(snap.refreshables.some((r) => r.scheduleOverdue)).toBe(true);
  });
});
