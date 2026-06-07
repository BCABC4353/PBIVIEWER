/**
 * ARCH-B3: evict-on-logout — inverted dependency wiring.
 *
 * auth-store must NOT import content-store or search-store (circular /
 * inverted coupling). Instead, this module owns the glue: it subscribes to
 * auth-store and, when the user transitions to signed-out, evicts the caches
 * of all downstream stores (content, search).
 *
 * Call `initEvictOnLogout()` exactly once at application startup (e.g. inside
 * the top-level App component's mount effect). The returned cleanup function
 * unsubscribes when the caller unmounts — safe for StrictMode double-invoke.
 */

import { useAuthStore } from '../stores/auth-store';
import { useContentStore } from '../stores/content-store';
import { useSearchStore } from '../stores/search-store';

/**
 * Subscribe to auth-store and evict content + search caches whenever the user
 * transitions from authenticated to signed-out.
 *
 * @returns A cleanup function that cancels the subscription. Call it on unmount.
 */
export function initEvictOnLogout(): () => void {
  // Track the previous authenticated value so we only fire on a
  // true → false transition, not on every unrelated state update.
  let prevAuthenticated = useAuthStore.getState().isAuthenticated;

  const unsubscribe = useAuthStore.subscribe((state) => {
    const nowAuthenticated = state.isAuthenticated;

    if (prevAuthenticated && !nowAuthenticated) {
      // User just transitioned to signed-out — wipe downstream caches.
      useContentStore.getState().reset();
      useSearchStore.getState().invalidateAll();
    }

    prevAuthenticated = nowAuthenticated;
  });

  return unsubscribe;
}
