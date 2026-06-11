import { create } from 'zustand';
import type { UserInfo } from '../../shared/types';

interface AuthState {
  user: UserInfo | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  checkAuth: () => Promise<void>;
  login: () => Promise<void>;
  switchAccount: () => Promise<void>;
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
      // Unwrap Error messages for cleaner user surfacing.
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

    // Race the real IPC call against a 130-second timeout so
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
        // Prefer the friendly userMessage over the raw message.
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

  // In-app account switch. The main process logs out (clearing caches
  // + partition cookies) and then re-runs an interactive login with the account
  // picker. On success we replicate login's success state (the new identity is
  // set; evict-on-logout.ts observes the identity change and wipes content +
  // search caches). On failure — including LOGIN_CANCELLED — we set
  // isAuthenticated:false: the user is already signed out from the logout phase,
  // so the app falls back to the LoginScreen.
  switchAccount: async () => {
    set({ isLoading: true, error: null });

    const SWITCH_TIMEOUT_MS = 130_000;
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error('Account switch timed out. Please try again.')),
        SWITCH_TIMEOUT_MS,
      ),
    );

    try {
      const response = await Promise.race([
        window.electronAPI.auth.switchAccount(),
        timeoutPromise,
      ]);

      if (response.success && response.data.success) {
        set({
          user: response.data.user,
          isAuthenticated: true,
          isLoading: false,
        });
      } else if (!response.success && response.error.code === 'LOGIN_IN_PROGRESS') {
        // A previous switch/login is still mid-flight
        // (e.g. a double-click). Ignore this duplicate invocation and let the
        // in-flight operation drive state. Falling through to the else branch
        // here would clobber user/isAuthenticated to null AFTER the first
        // switch already succeeded — wrongly signing the user out.
        return;
      } else {
        // Logout already happened in the main process, so we are signed out.
        // LOGIN_CANCELLED is an expected, non-error outcome (user dismissed the
        // picker) — fall back to the login screen without a scary message. Any
        // other failure surfaces its message for the user.
        const cancelled =
          !response.success && response.error.code === 'LOGIN_CANCELLED';
        const errorMessage = cancelled
          ? null
          : !response.success
            ? (response.error.userMessage ?? response.error.message)
            : (!response.data.success ? response.data.error : 'Account switch failed');
        set({
          user: null,
          isAuthenticated: false,
          isLoading: false,
          error: errorMessage,
        });
      }
    } catch (error) {
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  logout: async () => {
    set({ isLoading: true });
    try {
      await window.electronAPI.auth.logout();
      // Cache eviction (content + search) is handled by evict-on-logout.ts
      // which subscribes to this store's isAuthenticated transition.
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
