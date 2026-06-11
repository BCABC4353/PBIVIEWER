import { create } from 'zustand';
import type { UserInfo } from '../../shared/types';

interface AuthState {
  user: UserInfo | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

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
      const authResponse = await window.electronAPI.auth.isAuthenticated();

      if (authResponse.success && authResponse.data) {
        const validateResponse = await window.electronAPI.auth.validateToken();

        if (validateResponse.success && validateResponse.data) {
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
        return;
      } else {
        const errorMessage = !response.success
          ? (response.error.userMessage ?? response.error.message)
          : (!response.data.success ? response.data.error : 'Login failed');
        set({
          isLoading: false,
          error: errorMessage,
        });
      }
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

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
        return;
      } else {
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
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      });
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
