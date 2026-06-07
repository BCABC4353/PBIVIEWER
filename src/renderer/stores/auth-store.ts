import { create } from 'zustand';
import type { UserInfo } from '../../shared/types';
import { useContentStore } from './content-store';
import { useSearchStore } from './search-store';

interface AuthState {
  user: UserInfo | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  checkAuth: () => Promise<void>;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,

  checkAuth: async () => {
    set({ isLoading: true, error: null });
    try {
      // First check if accounts exist
      const authResponse = await window.electronAPI.auth.isAuthenticated();

      if (authResponse.success && authResponse.data) {
        // Accounts exist - now validate we can actually get a token
        // This catches cases where scopes have changed and re-consent is needed
        const validateResponse = await window.electronAPI.auth.validateToken();

        if (validateResponse.success && validateResponse.data) {
          // Token is valid, get user info
          const userResponse = await window.electronAPI.auth.getUser();

          if (userResponse.success && userResponse.data != null) {
            set({
              user: userResponse.data,
              isAuthenticated: true,
              isLoading: false,
            });
          } else {
            set({
              user: null,
              isAuthenticated: false,
              isLoading: false,
            });
          }
        } else {
          // Account existed but token validation failed - the session expired
          // or is invalid. Surface a friendly message instead of silently
          // bouncing to the login screen with no explanation.
          set({
            user: null,
            isAuthenticated: false,
            isLoading: false,
            error: 'Your session expired. Please sign in again.',
          });
        }
      } else {
        set({
          user: null,
          isAuthenticated: false,
          isLoading: false,
        });
      }
    } catch (error) {
      // BEH-S7: unwrap Error messages for cleaner user surfacing.
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  login: async () => {
    set({ isLoading: true, error: null });

    // BEH-S6: Race the real IPC call against a 130-second timeout so
    // isLoading never stays true indefinitely (e.g. the Azure auth popup is
    // closed without completing, or the main process hangs).
    const LOGIN_TIMEOUT_MS = 130_000;
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Login timed out. Please try again.')), LOGIN_TIMEOUT_MS),
    );

    try {
      const response = await Promise.race([
        window.electronAPI.auth.login(),
        timeoutPromise,
      ]);

      if (response.success && response.data.success) {
        set({
          user: response.data.user,
          isAuthenticated: true,
          isLoading: false,
        });
      } else if (!response.success && response.error.code === 'LOGIN_IN_PROGRESS') {
        // A previous click is still mid-flight. Not a real error — just
        // ignore this duplicate invocation and let the in-flight login
        // continue to drive isLoading/user/error state.
        return;
      } else {
        // BEH-S7: prefer the friendly userMessage over the raw message.
        const errorMessage = !response.success
          ? (response.error.userMessage ?? response.error.message)
          : (!response.data.success ? response.data.error : 'Login failed');
        set({
          isLoading: false,
          error: errorMessage,
        });
      }
    } catch (error) {
      // Catches both the timeout rejection and unexpected IPC errors.
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  logout: async () => {
    set({ isLoading: true });
    try {
      await window.electronAPI.auth.logout();
      // Wipe content & search caches so a different account does not see prior data.
      useContentStore.getState().reset();
      useSearchStore.getState().invalidateAll();
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      });
      // Navigate to login page after successful logout
      window.location.hash = '#/login';
    } catch (error) {
      set({
        isLoading: false,
        error: String(error),
      });
    }
  },

  clearError: () => {
    set({ error: null });
  },
}));
