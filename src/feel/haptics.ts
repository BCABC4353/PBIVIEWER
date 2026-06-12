import * as Haptics from 'expo-haptics';
import { createRateLimiter } from './motion-core';
import { buildLadder } from './haptics-ladder';

let enabled = true;

export function setHapticsEnabled(on: boolean): void {
  enabled = on;
}

export function hapticsEnabled(): boolean {
  return enabled;
}

function fire(trigger: () => Promise<void>): void {
  if (!enabled) return;
  try {
    trigger().catch(() => {
    });
  } catch {
  }
}

export function tap(): void {
  fire(() => Haptics.selectionAsync());
}

export function confirm(): void {
  fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

export function warn(): void {
  fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
}

export function fault(): void {
  fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
}

export function thunk(): void {
  fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid));
}

export function latch(): void {
  fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

const detentGate = createRateLimiter(30);
export function detent(): void {
  if (!detentGate()) return;
  fire(() => Haptics.selectionAsync());
}

const ladder = buildLadder({ getEnabled: () => enabled });

export function pushThrough(): void {
  ladder.pushThrough();
}

export function resurface(): void {
  ladder.resurface();
}

export interface HapticProbeResult {
  verb: string;
  ok: boolean;
  detail?: string;
}

const PROBE_VERBS: ReadonlyArray<[string, () => Promise<void>]> = [
  ['tap', () => Haptics.selectionAsync()],
  ['confirm', () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)],
  ['warn', () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)],
  ['fault', () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)],
  ['thunk', () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid)],
  ['latch', () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)],
  ['detent', () => Haptics.selectionAsync()],
];

export async function probeHaptics(
  onResult?: (result: HapticProbeResult) => void,
  pause: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<HapticProbeResult[]> {
  const results: HapticProbeResult[] = [];
  for (const [verb, trigger] of PROBE_VERBS) {
    let result: HapticProbeResult;
    try {
      await trigger();
      result = { verb, ok: true };
    } catch (e) {
      result = { verb, ok: false, detail: e instanceof Error ? e.message : String(e) };
    }
    results.push(result);
    onResult?.(result);
    await pause(450);
  }
  return results;
}
