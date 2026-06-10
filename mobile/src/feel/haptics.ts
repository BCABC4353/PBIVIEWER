/**
 * haptics — the haptic taxonomy from IOS-CRAFT-SPEC.md §4.2, exposed as
 * SEMANTIC VERBS. Call sites say what HAPPENED (`confirm()`, `fault()`),
 * never which generator fires — the material language lives here, once.
 *
 * Discipline (per spec): notification haptics (confirm/warn/fault) are
 * precious — flow COMPLETION only, never in-flight micro-interactions.
 * A haptic must confirm a real event; never decorative, never per-frame.
 *
 * Every verb is fire-and-forget and swallow-safe: on simulators, web, or
 * devices with haptics disabled, expo-haptics rejects/throws and we no-op.
 */
import * as Haptics from 'expo-haptics';
import { createRateLimiter } from './motionCore';

let enabled = true;

/**
 * Master switch — wire this to the user's "Haptics" setting (and flip it off
 * under Low Power Mode if the app ever observes it). Defaults ON.
 */
export function setHapticsEnabled(on: boolean): void {
  enabled = on;
}

/** Current state of the master switch (for the settings UI). */
export function hapticsEnabled(): boolean {
  return enabled;
}

function fire(trigger: () => Promise<void>): void {
  if (!enabled) return;
  try {
    trigger().catch(() => {
      /* no haptic hardware / web — silently still */
    });
  } catch {
    /* never let feel crash function */
  }
}

/**
 * Selection tick — light. Row press, tab change, toggle, picker.
 * The default answer of any touched control.
 */
export function tap(): void {
  fire(() => Haptics.selectionAsync());
}

/**
 * Flow succeeded — refresh completed, alert acknowledged, action committed.
 * Success notification: earned, satisfying, rare.
 */
export function confirm(): void {
  fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

/**
 * Warning arrives — distinct from failure, still demands a look.
 */
export function warn(): void {
  fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
}

/**
 * Failure arrival — refresh failed, dataset broke. The heaviest signal in the
 * language; fire ONCE per batch of arrivals (don't machine-gun the engine).
 */
export function fault(): void {
  fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
}

/**
 * The rigid "thunk" — pull-to-refresh passes its threshold, a card snaps
 * into place, a drop commits. Crisp physical landing: "committed".
 */
export function thunk(): void {
  fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid));
}

/**
 * Detent tick while scrubbing across data points — feels like machined
 * detents under the finger. Internally rate-limited to ≤30/s so fast scrubs
 * read as a purr of clicks, never a buzz-saw.
 */
const detentGate = createRateLimiter(30);
export function detent(): void {
  if (!detentGate()) return;
  fire(() => Haptics.selectionAsync());
}

// ---------------------------------------------------------------------------
// Diagnostics — the LOUD path the fail-silent verbs deliberately lack
// ---------------------------------------------------------------------------

export interface HapticProbeResult {
  verb: string;
  ok: boolean;
  /** The caught error message, when the underlying call rejected/threw. */
  detail?: string;
}

/** The raw generator behind each verb, exposed for the probe only. */
const PROBE_VERBS: ReadonlyArray<[string, () => Promise<void>]> = [
  ['tap', () => Haptics.selectionAsync()],
  ['confirm', () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)],
  ['warn', () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)],
  ['fault', () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)],
  ['thunk', () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid)],
  ['detent', () => Haptics.selectionAsync()],
];

/**
 * Fire every verb in sequence and REPORT what happened — the production
 * wrappers swallow all errors by design (feel must never crash function), so
 * when a device feels dead-silent this is the one place that says WHY.
 * Bypasses the master switch and the detent rate limiter on purpose: it is a
 * diagnostic, not a feel moment. `onResult` streams each verdict as it lands
 * so the UI can render the sequence live. Note: a `✓` means the OS accepted
 * the call — if it still felt like nothing, check iPhone Settings → Sounds &
 * Haptics → System Haptics.
 */
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
    await pause(450); // space the pulses so each one is distinguishable
  }
  return results;
}
