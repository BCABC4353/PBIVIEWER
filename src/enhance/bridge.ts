import { ok, insufficient, type Result } from './types';

export type WaterfallKind = 'new' | 'dropped' | 'changed';

export interface WaterfallStep {
  key: string;
  from: number;
  to: number;
  delta: number;
  kind: WaterfallKind;
}

export interface BridgeResult {
  steps: WaterfallStep[];
}

export function varianceBridge(
  before: Map<string, number> | Record<string, number>,
  after: Map<string, number> | Record<string, number>,
): Result<BridgeResult> {
  const beforeMap: Map<string, number> =
    before instanceof Map ? before : new Map(Object.entries(before));
  const afterMap: Map<string, number> =
    after instanceof Map ? after : new Map(Object.entries(after));

  if (beforeMap.size === 0 && afterMap.size === 0) {
    return insufficient('both series are empty');
  }

  for (const [, v] of beforeMap) {
    if (!Number.isFinite(v)) return insufficient('before contains non-finite values');
  }
  for (const [, v] of afterMap) {
    if (!Number.isFinite(v)) return insufficient('after contains non-finite values');
  }

  const allKeys = new Set<string>([...beforeMap.keys(), ...afterMap.keys()]);
  const steps: WaterfallStep[] = [];

  for (const key of allKeys) {
    const hasBefore = beforeMap.has(key);
    const hasAfter = afterMap.has(key);
    const from = hasBefore ? beforeMap.get(key)! : 0;
    const to = hasAfter ? afterMap.get(key)! : 0;
    const delta = to - from;
    let kind: WaterfallKind;
    if (!hasBefore) kind = 'new';
    else if (!hasAfter) kind = 'dropped';
    else kind = 'changed';
    steps.push({ key, from, to, delta, kind });
  }

  steps.sort((a, b) => {
    const kindOrder: Record<WaterfallKind, number> = { changed: 0, new: 1, dropped: 2 };
    const ko = kindOrder[a.kind] - kindOrder[b.kind];
    if (ko !== 0) return ko;
    return a.key.localeCompare(b.key);
  });

  return ok({ steps });
}
