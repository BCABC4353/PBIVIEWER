import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useAuthStore } from './auth-store';
import type { AuthResult, IPCResponse } from '../../shared/types';

const INITIAL_STATE = {
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
};

beforeEach(() => {
  useAuthStore.setState(INITIAL_STATE);
});

describe('useAuthStore — switchAccount timeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves isLoading=false with an error when the IPC hangs past the timeout', async () => {
    vi.mocked(window.electronAPI.auth.switchAccount).mockImplementation(
      () => new Promise<IPCResponse<AuthResult>>(() => {}),
    );

    const pending = useAuthStore.getState().switchAccount();
    expect(useAuthStore.getState().isLoading).toBe(true);

    await vi.advanceTimersByTimeAsync(129_000);
    expect(useAuthStore.getState().isLoading).toBe(true);

    await vi.advanceTimersByTimeAsync(1_000);
    await pending;

    const state = useAuthStore.getState();
    expect(state.isLoading).toBe(false);
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
    expect(state.error).toMatch(/timed out/i);
  });

  it('a normal switch still works and is unaffected by the timeout', async () => {
    vi.mocked(window.electronAPI.auth.switchAccount).mockResolvedValue({
      success: true,
      data: {
        success: true,
        user: { id: 'acct-2', displayName: 'B', email: 'b@x.com' },
        reusedPreviousAccount: false,
      },
    });

    await useAuthStore.getState().switchAccount();

    const state = useAuthStore.getState();
    expect(state.isLoading).toBe(false);
    expect(state.isAuthenticated).toBe(true);
    expect(state.user).toEqual({ id: 'acct-2', displayName: 'B', email: 'b@x.com' });
    expect(state.error).toBeNull();
  });
});
