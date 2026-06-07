/**
 * ARCH-S2: Error-surfacing strategy.
 *
 * Replaces the bare `surfacePostLoadErrors` boolean with a small strategy
 * object. The built-in 'error' handler asks the policy whether a given event
 * should paint the error UI. Pre-load errors always surface; the policy only
 * governs what happens once the embed has loaded.
 *
 * Token-expiry errors are routed to the token-refresh path BEFORE the policy
 * is consulted, so the policy never sees them.
 */
export interface ErrorSurfaceContext {
  /** True when the embed has not yet fired its 'loaded' event. */
  preLoad: boolean;
}

export interface ErrorPolicy {
  /** Returns true if this error event should surface to the error UI. */
  shouldSurface: (ctx: ErrorSurfaceContext) => boolean;
}

/**
 * Default ReportViewer-style policy: pre-load errors surface, post-load
 * errors are silent.
 */
export const silentPostLoadErrorPolicy: ErrorPolicy = {
  shouldSurface: ({ preLoad }) => preLoad,
};

/**
 * PresentationMode / DashboardViewer-style policy: every error surfaces,
 * including post-load failures.
 */
export const surfaceAllErrorPolicy: ErrorPolicy = {
  shouldSurface: () => true,
};

/**
 * Derives the active policy from the legacy `surfacePostLoadErrors` boolean.
 * Preserves the original semantics exactly:
 *   - surfacePostLoadErrors=false -> pre-load only (default)
 *   - surfacePostLoadErrors=true  -> all errors surface
 */
export function resolveErrorPolicy(
  surfacePostLoadErrors: boolean,
  explicit?: ErrorPolicy
): ErrorPolicy {
  if (explicit) return explicit;
  return surfacePostLoadErrors ? surfaceAllErrorPolicy : silentPostLoadErrorPolicy;
}
