import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { HomePage } from './HomePage';
import { useAuthStore } from '../../stores/auth-store';
import { useContentStore } from '../../stores/content-store';

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

const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <MemoryRouter>{children}</MemoryRouter>
);

describe('HomePage — PROD-B3 Browse Workspaces CTA', () => {
  beforeEach(() => {
    resetStores();
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
    const { unmount } = render(<HomePage />, { wrapper: Wrapper });
    await act(async () => {
      await Promise.resolve();
    });
    unmount();

    await act(async () => {
      render(<HomePage />, { wrapper: Wrapper });
    });

    expect(screen.getByTestId('browse-workspaces-cta')).toBeDefined();
  });

  it('empty state shows signed-in email', async () => {
    await act(async () => {
      render(<HomePage />, { wrapper: Wrapper });
    });
    expect(screen.getByText(/test@example\.com/i)).toBeDefined();
  });

  it('empty state shows a Sign out button', async () => {
    await act(async () => {
      render(<HomePage />, { wrapper: Wrapper });
    });
    expect(screen.getByRole('button', { name: /sign out/i })).toBeDefined();
  });

  it('empty state renders its three text blocks as separate block elements', async () => {
    await act(async () => {
      render(<HomePage />, { wrapper: Wrapper });
    });

    const welcome = screen.getByText('Welcome to Power BI Viewer');
    const instructions = screen.getByText(/Browse your workspaces to start viewing/);
    const signedIn = screen.getByText(/Signed in as test@example\.com/);

    const blocks = [welcome, instructions, signedIn];
    expect(new Set(blocks).size).toBe(3);
    for (const el of blocks) {
      expect(el.tagName).toBe('P');
    }
  });
});

const WorkspacesProbe: React.FC = () => {
  const location = useLocation();
  return <div data-testid="workspaces-probe">{location.search}</div>;
};

describe('HomePage — featured workspace tiles', () => {
  beforeEach(() => {
    resetStores();
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
      data: [
        { id: 'ws-1', name: 'Fleet', isReadOnly: false, type: 'Workspace' },
        { id: 'ws-2', name: 'Finance', isReadOnly: false, type: 'Workspace' },
      ],
    });
  });

  it('a featured tile navigates to the workspaces page with ITS workspace preselected', async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/workspaces" element={<WorkspacesProbe />} />
          </Routes>
        </MemoryRouter>,
      );
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Open workspace Finance' }));
    });

    expect(screen.getByTestId('workspaces-probe').textContent).toBe('?expand=ws-2');
  });
});
