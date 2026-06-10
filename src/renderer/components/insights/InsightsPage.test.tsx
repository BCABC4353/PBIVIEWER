/**
 * InsightsPage (Luce board) rendering cases.
 *
 * Drives the page through its main states with a mocked getInsights bridge:
 * summary tiles, workspace grouping (broken expanded + first, healthy
 * collapsed), down-for labels, run-history dot strips, the partial-failure
 * banner, access lists, the error + retry path, and the admin unlock UX
 * (staged loading text + client-side cancel).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { InsightsPage } from './InsightsPage';
import { useAuthStore } from '../../stores/auth-store';
import type { InsightsSnapshot } from '../../../shared/types';

const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <MemoryRouter>{children}</MemoryRouter>
);

function snapshot(overrides: Partial<InsightsSnapshot> = {}): InsightsSnapshot {
  return {
    generatedAt: '2026-06-10T04:00:00.000Z',
    fromCache: false,
    workspaceCount: 2,
    reportCount: 5,
    dashboardCount: 1,
    refreshables: [
      {
        kind: 'dataset',
        id: 'ds-ok',
        name: 'Healthy Model',
        workspaceId: 'ws-1',
        workspaceName: 'Sales',
        configuredBy: 'owner@bc-abc.com',
        lastStatus: 'Completed',
        lastAttemptTime: '2026-06-10T03:00:00.000Z',
        lastSuccessTime: '2026-06-10T03:00:00.000Z',
        recentRuns: Array.from({ length: 12 }, () => ({ ok: true, endTime: '2026-06-10T03:00:00.000Z' })),
      },
      {
        kind: 'dataset',
        id: 'ds-bad',
        name: 'Broken Model',
        workspaceId: 'ws-1',
        workspaceName: 'Sales',
        lastStatus: 'Failed',
        lastAttemptTime: '2026-06-10T02:00:00.000Z',
        lastSuccessTime: '2026-06-08T02:00:00.000Z',
        errorCode: 'ModelRefreshFailed_CredentialsNotSpecified',
        lastRefreshType: 'ViaApi',
        scheduleSummary: 'Daily at 06:00',
        scheduleOverdue: true,
        recentRuns: Array.from({ length: 12 }, (_, i) => ({
          ok: i % 4 !== 3,
          endTime: '2026-06-09T02:00:00.000Z',
        })),
      },
      {
        kind: 'dataflow',
        id: 'df-1',
        name: 'Staging Flow',
        workspaceId: 'ws-2',
        workspaceName: 'Ops',
        lastStatus: 'Never',
      },
      {
        kind: 'dataset',
        id: 'ds-live',
        name: 'Live Connection',
        workspaceId: 'ws-2',
        workspaceName: 'Ops',
        lastStatus: 'Disabled',
      },
    ],
    access: [
      {
        workspaceId: 'ws-1',
        workspaceName: 'Sales',
        users: [
          { name: 'Brendan', email: 'brendan@bc-abc.com', role: 'Admin', type: 'User' },
          { name: 'Client A', email: 'a@client.com', role: 'Viewer', type: 'User' },
        ],
      },
      { workspaceId: 'ws-2', workspaceName: 'Ops', users: null },
    ],
    partialFailure: false,
    failedWorkspaces: [],
    ...overrides,
  };
}

function mockGetInsights(resp: unknown) {
  (window.electronAPI.content.getInsights as ReturnType<typeof vi.fn>).mockResolvedValue(resp);
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({
    user: { id: 'account-1', displayName: 'Test User', email: 'test@example.com' },
    isAuthenticated: true,
    isLoading: false,
    error: null,
  });
});

describe('InsightsPage — Luce board', () => {
  it('renders the summary tiles row', async () => {
    mockGetInsights({ success: true, data: snapshot() });
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });

    expect(screen.getByText('Broken')).toBeInTheDocument();
    expect(screen.getAllByText('Overdue').length).toBeGreaterThan(0);
    expect(screen.getByText('Running')).toBeInTheDocument();
    expect(screen.getByText('Healthy')).toBeInTheDocument();
    expect(screen.getByText('Workspaces')).toBeInTheDocument();
  });

  it('groups by workspace: broken section first and auto-expanded, quiet sections collapsed', async () => {
    mockGetInsights({ success: true, data: snapshot() });
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });

    // Sales (broken) is expanded by default → its rows are visible.
    expect(screen.getByText('Broken Model')).toBeInTheDocument();
    expect(screen.getByText('Healthy Model')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('OK')).toBeInTheDocument();

    // Ops (no broken/overdue) is collapsed → its items are hidden until toggled.
    expect(screen.queryByText('Staging Flow')).not.toBeInTheDocument();
    const opsHeader = screen.getByRole('button', { name: /Ops.*OK/ });
    expect(opsHeader).toHaveAttribute('aria-expanded', 'false');
    await act(async () => {
      fireEvent.click(opsHeader);
    });
    expect(screen.getByText('Staging Flow')).toBeInTheDocument();
    expect(screen.getByText('Never run')).toBeInTheDocument();
    expect(screen.getByText('Live')).toBeInTheDocument();

    // Section order: the troubled Sales section renders before Ops.
    const sections = screen.getAllByRole('button', { name: /broken|OK/ });
    const salesIdx = sections.findIndex((b) => /Sales/.test(b.textContent ?? ''));
    const opsIdx = sections.findIndex((b) => /Ops/.test(b.textContent ?? ''));
    expect(salesIdx).toBeGreaterThanOrEqual(0);
    expect(salesIdx).toBeLessThan(opsIdx);

    // Section header carries the mini health summary.
    expect(screen.getByText(/1 broken/)).toBeInTheDocument();

    // Inside Sales, the broken row sorts before the healthy one.
    const rows = screen.getAllByRole('row').map((r) => r.textContent ?? '');
    const failedIdx = rows.findIndex((t) => t.includes('Broken Model'));
    const okIdx = rows.findIndex((t) => t.includes('Healthy Model'));
    expect(failedIdx).toBeGreaterThanOrEqual(0);
    expect(failedIdx).toBeLessThan(okIdx);
  });

  it('shows the down-for label, failure-rate caption, dot strip, trigger, owner, and error code', async () => {
    mockGetInsights({ success: true, data: snapshot() });
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });

    // Down since the last success (clock-relative — assert shape, not value).
    expect(screen.getByText(/^down \d+[mhd]$/)).toBeInTheDocument();
    // 3 of the 12 mocked runs failed.
    expect(screen.getByText('3 of last 12 runs failed')).toBeInTheDocument();
    // Dot strips render for both expanded rows.
    expect(screen.getAllByTestId('run-dot-strip').length).toBeGreaterThanOrEqual(2);
    // Trigger, owner, and error code survive the redesign.
    expect(screen.getByText('Power Automate / API')).toBeInTheDocument();
    expect(screen.getByText('owner@bc-abc.com')).toBeInTheDocument();
    expect(screen.getByText('ModelRefreshFailed_CredentialsNotSpecified')).toBeInTheDocument();
  });

  it('expands a workspace access list and labels not-visible lists', async () => {
    mockGetInsights({ success: true, data: snapshot() });
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });

    expect(screen.getByText('access list not visible to you')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Sales.*member/ }));
    });
    expect(screen.getByText('brendan@bc-abc.com')).toBeInTheDocument();
    expect(screen.getByText('Viewer')).toBeInTheDocument();
  });

  it('shows the partial-failure banner when some workspaces could not be read', async () => {
    mockGetInsights({
      success: true,
      data: snapshot({
        partialFailure: true,
        failedWorkspaces: [{ id: 'ws-3', name: 'Finance', error: 'boom' }],
      }),
    });
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });
    expect(screen.getByText(/Some workspaces could not be fully read/)).toBeInTheDocument();
    expect(screen.getByText(/Finance/)).toBeInTheDocument();
  });

  it('dead-ends into an error state with a working Try again', async () => {
    mockGetInsights({
      success: false,
      error: { code: 'INSIGHTS_FETCH_FAILED', message: 'raw', userMessage: 'Could not reach Power BI.' },
    });
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Could not reach Power BI.');

    // Retry path: next call succeeds and the page renders.
    mockGetInsights({ success: true, data: snapshot() });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    });
    expect(screen.getByText('Healthy Model')).toBeInTheDocument();
    // Retry must force a rebuild (bypass the snapshot cache).
    const calls = (window.electronAPI.content.getInsights as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[calls.length - 1]?.[0]).toBe(true);
  });

  it('marks a cached snapshot as cached in the header', async () => {
    mockGetInsights({ success: true, data: snapshot({ fromCache: true }) });
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });
    expect(screen.getByText(/\(cached\)/)).toBeInTheDocument();
  });
});

describe('InsightsPage — admin tier', () => {
  it('requests a 2-day window and surfaces ADMIN_REQUIRED as a friendly message', async () => {
    mockGetInsights({ success: true, data: snapshot() });
    // setup.ts default getAdminInsights mock returns ADMIN_REQUIRED.
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Unlock admin view' }));
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/not a Fabric administrator/);
    const adminMock = window.electronAPI.content.getAdminInsights as ReturnType<typeof vi.fn>;
    expect(adminMock).toHaveBeenCalledWith(2, false);
  });

  it('shows staged honest loading text with a Cancel that discards the in-flight call', async () => {
    mockGetInsights({ success: true, data: snapshot() });
    let resolveAdmin: (v: unknown) => void = () => {};
    (window.electronAPI.content.getAdminInsights as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise((resolve) => {
        resolveAdmin = resolve;
      }),
    );
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Unlock admin view' }));
    });

    // Stage 1 copy + a Cancel control while loading.
    expect(screen.getByText('Opening Microsoft consent…')).toBeInTheDocument();
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    await act(async () => {
      fireEvent.click(cancel);
    });

    // Loading cleared client-side; the unlock button is back.
    expect(screen.queryByText('Opening Microsoft consent…')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unlock admin view' })).toBeInTheDocument();

    // The stale in-flight result resolving later must be DISCARDED (no admin
    // tables appear, no crash).
    await act(async () => {
      resolveAdmin({
        success: true,
        data: {
          generatedAt: '2026-06-10T04:00:00.000Z',
          fromCache: false,
          days: 2,
          activityByUser: [],
          activityByItem: [{ name: 'Stale Report', views: 1, uniqueUsers: 1, lastViewed: '' }],
          appAudiences: [],
          failedDays: 0,
        },
      });
    });
    expect(screen.queryByText('Stale Report')).not.toBeInTheDocument();
  });

  it('warns that the consent window may open behind the app', async () => {
    mockGetInsights({ success: true, data: snapshot() });
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });
    expect(screen.getByText(/can open BEHIND this window/)).toBeInTheDocument();
  });

  it('renders activity and App audiences after a successful unlock', async () => {
    mockGetInsights({ success: true, data: snapshot() });
    (window.electronAPI.content.getAdminInsights as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: {
        generatedAt: '2026-06-10T04:00:00.000Z',
        fromCache: false,
        days: 2,
        activityByUser: [{ user: 'a@client.com', views: 12, lastActive: '2026-06-10T03:00:00.000Z' }],
        activityByItem: [
          { name: 'Sales Daily', views: 12, uniqueUsers: 3, lastViewed: '2026-06-10T03:00:00.000Z' },
        ],
        appAudiences: [
          {
            appId: 'app-1',
            appName: 'BC Suite',
            users: [{ name: 'Client A', email: 'a@client.com', accessRight: 'Viewer', type: 'User' }],
          },
        ],
        failedDays: 1,
      },
    });
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Unlock admin view' }));
    });
    expect(screen.getByText('Sales Daily')).toBeInTheDocument();
    expect(screen.getByText('a@client.com')).toBeInTheDocument();
    expect(screen.getByText(/1 day\(s\) could not be read/)).toBeInTheDocument();

    // Expand the App audience accordion.
    const audience = screen.getByRole('button', { name: /BC Suite/ });
    await act(async () => {
      fireEvent.click(audience);
    });
    expect(screen.getByText('Client A')).toBeInTheDocument();
    expect(within(audience.parentElement as HTMLElement).getByText('Viewer')).toBeInTheDocument();
  });
});
