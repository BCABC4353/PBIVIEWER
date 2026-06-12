
import React, { useState } from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { useSignOutConfirm, SignOutConfirmDialog } from './useSignOutConfirm';
import { useAuthStore } from '../stores/auth-store';

const Harness: React.FC = () => {
  const { triggerSignOut, triggerSwitchAccount, dialogProps } = useSignOutConfirm();
  const [, setBump] = useState(0);
  return (
    <div>
      <button onClick={triggerSignOut}>open-sign-out</button>
      <button onClick={triggerSwitchAccount}>open-switch</button>
      <button onClick={() => setBump((n) => n + 1)}>bump</button>
      <SignOutConfirmDialog {...dialogProps} />
    </div>
  );
};

describe('useSignOutConfirm — UX-1 unified session-end confirmation', () => {
  beforeEach(() => {
    cleanup();
    useAuthStore.setState({
      user: { id: 'u-1', displayName: 'Test User', email: 'test@example.com' },
      isAuthenticated: true,
      isLoading: false,
      error: null,
    });
  });

  it('triggerSignOut opens the sign-out confirmation; Cancel closes without signing out', () => {
    render(<Harness />);

    fireEvent.click(screen.getByText('open-sign-out'));
    expect(screen.getByText('Sign out?')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(window.electronAPI.auth.logout).not.toHaveBeenCalled();
    expect(window.electronAPI.auth.switchAccount).not.toHaveBeenCalled();
  });

  it('confirming sign-out calls auth.logout', async () => {
    render(<Harness />);

    fireEvent.click(screen.getByText('open-sign-out'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    });

    expect(window.electronAPI.auth.logout).toHaveBeenCalledTimes(1);
    expect(window.electronAPI.auth.switchAccount).not.toHaveBeenCalled();
  });

  it('triggerSwitchAccount shows its own copy warning that open content closes', () => {
    render(<Harness />);

    fireEvent.click(screen.getByText('open-switch'));
    expect(screen.getByText('Switch account?')).not.toBeNull();
    expect(
      screen.getByText(/closes any open reports and dashboards/i),
    ).not.toBeNull();
  });

  it('confirming switch account calls auth.switchAccount, not logout', async () => {
    render(<Harness />);

    fireEvent.click(screen.getByText('open-switch'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Switch account' }));
    });

    expect(window.electronAPI.auth.switchAccount).toHaveBeenCalledTimes(1);
    expect(window.electronAPI.auth.logout).not.toHaveBeenCalled();
  });

  it('the open dialog survives unrelated parent re-renders without remounting', () => {
    render(<Harness />);

    fireEvent.click(screen.getByText('open-sign-out'));
    const surfaceBefore = screen.getByRole('dialog');

    fireEvent.click(screen.getByText('bump'));
    const surfaceAfter = screen.getByRole('dialog');

    expect(surfaceAfter).toBe(surfaceBefore);
  });
});
