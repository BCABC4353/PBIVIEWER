/**
 * PROD-B3: CTA-after-nav vitest cases.
 *
 * Verifies that the "Browse Workspaces" primary CTA is always rendered on the
 * HomePage — both on fresh mount and after a simulated navigate-back cycle.
 * Also verifies the substantive empty state shows the signed-in email and the
 * Sign out button when there is no usage history.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HomePage } from './HomePage';
import { useAuthStore } from '../../stores/auth-store';
import { useContentStore } from '../../stores/content-store';

// ---------------------------------------------------------------------------
// Store reset helpers
// ---------------------------------------------------------------------------
// Zustand stores are module-level singletons; reset between tests to avoid
// state leaking across cases.
function resetStores() {
  useAuthStore.setState({
    user: { id: 'account-1', displayName: 'Test User', email: 'test@example.com' },
    isAuthenticated: true,
    isLoading: false,
    error: null,
  });
  useContentStore.setState({
    workspaces: [],
    reports: new Map(),
    dashboards: new Map(),
    apps: [],
    recentItems: [],
    frequentItems: [],
    isLoading: false,
    error: null,
  });
}

// Minimal wrapper: HomePage needs a router for useNavigate().
const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <MemoryRouter>{children}</MemoryRouter>
);

describe('HomePage — PROD-B3 Browse Workspaces CTA', () => {
  beforeEach(() => {
    resetStores();
    // Default mock: empty recent/frequent so we exercise the empty-state path.
    vi.mocked(window.electronAPI.usage.getRecent).mockResolvedValue({
      success: true,
      data: [],
    });
    vi.mocked(window.electronAPI.usage.getFrequent).mockResolvedValue({
      success: true,
      data: [],
    });
    vi.mocked(window.electronAPI.content.getWorkspaces).mockResolvedValue({
      success: true,
      data: [],
    });
  });

  it('CTA button is present on initial render (before data load completes)', () => {
    render(<HomePage />, { wrapper: Wrapper });
    // The CTA must be present regardless of loading state.
    expect(
      screen.getByTestId('browse-workspaces-cta'),
    ).toBeDefined();
  });

  it('CTA button is present after data load resolves (empty history)', async () => {
    await act(async () => {
      render(<HomePage />, { wrapper: Wrapper });
    });
    expect(screen.getByTestId('browse-workspaces-cta')).toBeDefined();
  });

  it('CTA visible after a navigate cycle — remount simulates returning to home', async () => {
    // First mount — load data, then unmount (navigate away)
    const { unmount } = render(<HomePage />, { wrapper: Wrapper });
    await act(async () => {
      // Allow all async effects to settle (loadRecentItems, loadFrequentItems, loadWorkspaces)
      await Promise.resolve();
    });
    unmount();

    // Second mount — simulates navigating back to Home
    await act(async () => {
      render(<HomePage />, { wrapper: Wrapper });
    });

    // CTA must still be rendered after the remount cycle
    expect(screen.getByTestId('browse-workspaces-cta')).toBeDefined();
  });

  it('empty state shows signed-in email', async () => {
    await act(async () => {
      render(<HomePage />, { wrapper: Wrapper });
    });
    // The email should appear in the substantive empty state
    expect(screen.getByText(/test@example\.com/i)).toBeDefined();
  });

  it('empty state shows a Sign out button', async () => {
    await act(async () => {
      render(<HomePage />, { wrapper: Wrapper });
    });
    expect(screen.getByRole('button', { name: /sign out/i })).toBeDefined();
  });
});
