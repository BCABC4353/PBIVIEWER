/**
 * Fire-and-forget helper to report a user-visible failure to the issue beacon.
 * Safe to call from anywhere in the renderer; never throws, never blocks the UI.
 * The main process decides whether the beacon is enabled.
 */
export function reportIssue(event: {
  code: string;
  httpStatus?: number;
  itemName?: string;
  context?: string;
}): void {
  try {
    void window.electronAPI?.beacon?.report(event).catch(() => {
      /* beacon is best-effort */
    });
  } catch {
    /* electronAPI not present (e.g. unit env) — ignore */
  }
}
