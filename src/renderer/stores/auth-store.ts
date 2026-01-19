import { create } from 'zustand';
import type { UserInfo, IPCResponse, AuthResult } from '../../shared/types';

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
      const authResponse = await window.electronAPI.auth.isAuthenticated() as IPCResponse<boolean>;

      if (authResponse.success && authResponse.data) {
        // Accounts exist - now validate we can actually get a token
        // This catches cases where scopes have changed and re-consent is needed
        const validateResponse = await window.electronAPI.auth.validateToken() as IPCResponse<boolean>;

        if (validateResponse.success && validateResponse.data) {
          // Token is valid, get user info
          const userResponse = await window.electronAPI.auth.getUser() as IPCResponse<UserInfo | null>;

          if (userResponse.success && userResponse.data) {
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
          // Token validation failed - need to re-login
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
        });
      }
    } catch (error) {
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: String(error),
      });
    }
  },

  login: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await window.electronAPI.auth.login() as IPCResponse<AuthResult>;

      if (response.success && response.data?.success && response.data.user) {
        set({
          user: response.data.user,
          isAuthenticated: true,
          isLoading: false,
        });
      } else {
        const errorMessage = response.error?.message || response.data?.error || 'Login failed';
        set({
          isLoading: false,
          error: errorMessage,
        });
      }
    } catch (error) {
      set({
        isLoading: false,
        error: String(error),
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
