export interface TestClock {
  now: () => number;
  schedule: (cb: () => void) => number;
  cancel: (id: number) => void;
  tick: (ms: number) => void;
  hasPending: () => boolean;
}

export function makeScheduler(): TestClock {
  let time = 0;
  let nextId = 1;
  const pending = new Map<number, () => void>();
  return {
    now: () => time,
    schedule(cb: () => void): number {
      const id = nextId++;
      pending.set(id, cb);
      return id;
    },
    cancel(id: number): void {
      pending.delete(id);
    },
    tick(ms: number): void {
      time += ms;
      const callbacks = [...pending.values()];
      pending.clear();
      for (const cb of callbacks) cb();
    },
    hasPending: () => pending.size > 0,
  };
}
