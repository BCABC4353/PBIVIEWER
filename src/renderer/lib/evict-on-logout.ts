/**
 * ARCH-B3 / PROD-B1: evict-on-identity-change — inverted dependency wiring.
 *
 * auth-store must NOT import content-store or search-store (circular /
 * inverted coupling). Instead, this module owns the glue: it subscribes to
 * auth-store and evicts the caches of all downstream stores (content, search)
 * whenever the signed-in identity stops being valid for the current view.
 *
 * Eviction fires on EITHER of two edges:
 *   1. logout         — authenticated true → false.
 *   2. account switch — the active user identity changes from one non-null
 *                       value to a DIFFERENT non-null value (id A → id B),
 *                       both while authenticated. The identity is the user's
 *                       homeAccountId, which equals user.id per the Stage-2
 *                       contract.
 *
 * It does NOT evict on login (null → id) or on no-op / unrelated updates.
 *
 * Call `initEvictOnLogout()` exactly once at application startup (e.g. inside
 * the top-level App component's mount effect). The returned cleanup function
 * unsubscribes when the caller unmounts — safe for StrictMode double-invoke.
 */

import { useAuthStore } from '../stores/auth-store';
import { useContentStore } from '../stores/content-store';
import { useSearchStore } from '../stores/search-store';

/**
 * Subscribe to auth-store and evict content + search caches whenever the
 * signed-in identity stops being valid for the current view — i.e. on logout
 * (authenticated true → false) OR on an account switch (user id A → id B).
 *
 * @returns A cleanup function that cancels the subscription. Call it on unmount.
 */
export function initEvictOnLogout(): () => void {
  // Track the previous authenticated value AND the previous identity (the
  // user's homeAccountId === user.id) so we can detect both edges without
  // firing on login (null → id) or on unrelated no-op updates.
  const initial = useAuthStore.getState();
  let prevAuthenticated = initial.isAuthenticated;
  let prevUserId = initial.user?.id ?? null;

  const unsubscribe = useAuthStore.subscribe((state) => {
    const nowAuthenticated = state.isAuthenticated;
    const nowUserId = state.user?.id ?? null;

    // Edge 1: logout (true → false).
    const loggedOut = prevAuthenticated && !nowAuthenticated;

    // Edge 2: account switch — both states authenticated, both identities
    // non-null, and the identity actually changed (A → B). Login (null → id)
    // is excluded because prevUserId is null; logout is handled by edge 1.
    const identitySwitched =
      prevAuthenticated &&
      nowAuthenticated &&
      prevUserId !== null &&
      nowUserId !== null &&
      prevUserId !== nowUserId;

    if (loggedOut || identitySwitched) {
      // The active identity changed — wipe downstream caches so the new
      // (or absent) user never sees the previous user's content/search data.
      useContentStore.getState().reset();
      useSearchStore.getState().invalidateAll();
    }

    prevAuthenticated = nowAuthenticated;
    prevUserId = nowUserId;
  });

  return unsubscribe;
}
