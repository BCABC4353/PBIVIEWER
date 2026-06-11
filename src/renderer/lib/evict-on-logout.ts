
import { useAuthStore } from '../stores/auth-store';
import { useContentStore } from '../stores/content-store';
import { useSearchStore } from '../stores/search-store';

export function initEvictOnLogout(): () => void {
  const initial = useAuthStore.getState();
  let prevAuthenticated = initial.isAuthenticated;
  let prevUserId = initial.user?.id ?? null;

  const unsubscribe = useAuthStore.subscribe((state) => {
    const nowAuthenticated = state.isAuthenticated;
    const nowUserId = state.user?.id ?? null;

    const loggedOut = prevAuthenticated && !nowAuthenticated;

    const identitySwitched =
      prevAuthenticated &&
      nowAuthenticated &&
      prevUserId !== null &&
      nowUserId !== null &&
      prevUserId !== nowUserId;

    if (loggedOut || identitySwitched) {
      useContentStore.getState().reset();
      useSearchStore.getState().invalidateAll();
    }

    prevAuthenticated = nowAuthenticated;
    prevUserId = nowUserId;
  });

  return unsubscribe;
}
