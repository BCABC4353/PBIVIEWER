/**
 * InsightsPage (Luce board) rendering cases.
 *
 * Drives the page through its main states with a mocked getInsights bridge:
 * clickable summary-tile filters, workspace grouping (broken first, ALL
 * groups collapsed until opened), dormant detection, down-for labels,
 * run-history dot strips with failure tooltips, the sticky section nav,
 * the partial-failure banner, access lists, the error + retry path, and
 * the admin unlock UX (staged loading text + client-side cancel).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { InsightsPage } from './InsightsPage';
import { IGNITION_FLAG } from './luce-motion';
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
          ...(i % 4 === 3
            ? { errorCode: 'ModelRefreshFailed_CredentialsNotSpecified', errorDetail: 'Credentials expired' }
            : {}),
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
      {
        // Dormant: finished fine, but nobody has touched it in years (Matt #4).
        kind: 'dataset',
        id: 'ds-dusty',
        name: 'Dusty Model',
        workspaceId: 'ws-2',
        workspaceName: 'Ops',
        lastStatus: 'Completed',
        lastAttemptTime: '2024-01-01T00:00:00.000Z',
        lastSuccessTime: '2024-01-01T00:00:00.000Z',
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
  // Behavioral tests run with the ignition ceremony already consumed (it is
  // once-per-session by design — see the dedicated D6 tests below, which
  // clear this flag to exercise the ceremony itself).
  window.sessionStorage.setItem(IGNITION_FLAG, '1');
  useAuthStore.setState({
    user: { id: 'account-1', displayName: 'Test User', email: 'test@example.com' },
    isAuthenticated: true,
    isLoading: false,
    error: null,
  });
});

describe('InsightsPage — Luce board', () => {
  it('renders the summary tiles row, including the Dormant tile', async () => {
    mockGetInsights({ success: true, data: snapshot() });
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });

    expect(screen.getByText('Broken')).toBeInTheDocument();
    expect(screen.getAllByText('Overdue').length).toBeGreaterThan(0);
    expect(screen.getByText('Running')).toBeInTheDocument();
    expect(screen.getByText('Healthy')).toBeInTheDocument();
    expect(screen.getByText('Dormant')).toBeInTheDocument();
    expect(screen.getByText('Workspaces')).toBeInTheDocument();
    // The Dormant tile counts the abandoned Dusty Model.
    expect(screen.getByRole('button', { name: '1 Dormant' })).toBeInTheDocument();
  });

  it('groups by workspace: broken section first, but EVERY section starts collapsed (Matt #7)', async () => {
    mockGetInsights({ success: true, data: snapshot() });
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });

    // Nothing is expanded — even the broken Sales section.
    expect(screen.queryByText('Broken Model')).not.toBeInTheDocument();
    expect(screen.queryByText('Staging Flow')).not.toBeInTheDocument();
    const salesHeader = screen.getByRole('button', { name: /Sales.*broken/ });
    expect(salesHeader).toHaveAttribute('aria-expanded', 'false');

    // The header still carries the wayfinding: item count + damage summary.
    expect(salesHeader).toHaveTextContent('2 items');
    expect(screen.getByText(/1 broken/)).toBeInTheDocument();

    // Opening Sales reveals its rows, worst first.
    await act(async () => {
      fireEvent.click(salesHeader);
    });
    expect(salesHeader).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Broken Model')).toBeInTheDocument();
    expect(screen.getByText('Healthy Model')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('OK')).toBeInTheDocument();
    const rows = screen.getAllByRole('row').map((r) => r.textContent ?? '');
    const failedIdx = rows.findIndex((t) => t.includes('Broken Model'));
    const okIdx = rows.findIndex((t) => t.includes('Healthy Model'));
    expect(failedIdx).toBeGreaterThanOrEqual(0);
    expect(failedIdx).toBeLessThan(okIdx);

    // Ops opens (and closes) independently.
    const opsHeader = screen.getByRole('button', { name: /Ops.*OK/ });
    await act(async () => {
      fireEvent.click(opsHeader);
    });
    expect(screen.getByText('Staging Flow')).toBeInTheDocument();
    expect(screen.getByText('Never run')).toBeInTheDocument();
    expect(screen.getByText('Live')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(opsHeader);
    });
    expect(screen.queryByText('Staging Flow')).not.toBeInTheDocument();

    // Section order: the troubled Sales section renders before Ops.
    const sections = screen.getAllByRole('button', { name: /broken|OK/ });
    const salesIdx = sections.findIndex((b) => /Sales/.test(b.textContent ?? ''));
    const opsIdx = sections.findIndex((b) => /Ops/.test(b.textContent ?? ''));
    expect(salesIdx).toBeGreaterThanOrEqual(0);
    expect(salesIdx).toBeLessThan(opsIdx);
  });

  it('summary tiles filter the board: matches auto-expand, clear chip removes the filter (Matt #2)', async () => {
    mockGetInsights({ success: true, data: snapshot() });
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });

    // Activate the Broken filter.
    const brokenTile = screen.getByRole('button', { name: '1 Broken' });
    await act(async () => {
      fireEvent.click(brokenTile);
    });
    expect(brokenTile).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/Showing: Broken/)).toBeInTheDocument();
    // Matching group auto-expands; only the broken row shows.
    expect(screen.getByText('Broken Model')).toBeInTheDocument();
    expect(screen.queryByText('Healthy Model')).not.toBeInTheDocument();
    // Ops has no broken items, so the whole group disappears from the board.
    expect(screen.queryByRole('button', { name: /Ops.*OK/ })).not.toBeInTheDocument();

    // The visible "Showing: Broken ✕" chip clears the filter.
    await act(async () => {
      fireEvent.click(screen.getByText(/Showing: Broken/));
    });
    expect(screen.queryByText(/Showing: Broken/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ops.*OK/ })).toBeInTheDocument();
    expect(screen.queryByText('Broken Model')).not.toBeInTheDocument(); // collapsed again

    // Clicking an active tile also clears (toggle).
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '1 Dormant' }));
    });
    expect(screen.getByText(/Showing: Dormant/)).toBeInTheDocument();
    expect(screen.getByText('Dusty Model')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '1 Dormant' }));
    });
    expect(screen.queryByText(/Showing: Dormant/)).not.toBeInTheDocument();
    expect(screen.queryByText('Dusty Model')).not.toBeInTheDocument();
  });

  it('marks dormant items with the gray DORMANT chip and down-for label (Matt #4)', async () => {
    mockGetInsights({ success: true, data: snapshot() });
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Ops.*OK/ }));
    });
    // Chip reads "Dormant · down NNNd" off the 2024-01-01 last success.
    expect(screen.getByText(/^Dormant · down \d+d$/)).toBeInTheDocument();
    expect(screen.getByText(/1 dormant/)).toBeInTheDocument();
  });

  it('shows the down-for label, failure-rate caption, dot strip, trigger, owner, and error code', async () => {
    mockGetInsights({ success: true, data: snapshot() });
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Sales.*broken/ }));
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

  it('failed dataset dots carry "Failed · time · errorCode: detail" tooltips (Matt #5)', async () => {
    mockGetInsights({ success: true, data: snapshot() });
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Sales.*broken/ }));
    });

    const failTitles = screen.getAllByTitle(
      /^Failed · .+ · ModelRefreshFailed_CredentialsNotSpecified: Credentials expired$/,
    );
    expect(failTitles.length).toBe(3); // the 3 failed runs in the mocked strip
    // Healthy dots still explain themselves with time only.
    expect(screen.getAllByTitle(/^OK · /).length).toBeGreaterThan(0);
  });

  it('failed dataflow dots state that Power BI provides no detail (Matt #5)', async () => {
    mockGetInsights({
      success: true,
      data: snapshot({
        refreshables: [
          {
            kind: 'dataflow',
            id: 'df-bad',
            name: 'Broken Flow',
            workspaceId: 'ws-2',
            workspaceName: 'Ops',
            lastStatus: 'Failed',
            lastAttemptTime: '2026-06-10T02:00:00.000Z',
            recentRuns: [{ ok: false, endTime: '2026-06-10T02:00:00.000Z' }],
          },
        ],
      }),
    });
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Ops.*broken/ }));
    });
    expect(
      screen.getByTitle(/^Failed · .+ \(no detail provided by Power BI for dataflows\)$/),
    ).toBeInTheDocument();
  });

  it('renders dot strips left-aligned: a partial history pads hollow dots on the RIGHT (Matt #6)', async () => {
    mockGetInsights({
      success: true,
      data: snapshot({
        refreshables: [
          {
            kind: 'dataset',
            id: 'ds-short',
            name: 'Short History',
            workspaceId: 'ws-1',
            workspaceName: 'Sales',
            lastStatus: 'Completed',
            lastAttemptTime: '2026-06-10T03:00:00.000Z',
            lastSuccessTime: '2026-06-10T03:00:00.000Z',
            recentRuns: [
              { ok: true, endTime: '2026-06-09T03:00:00.000Z' },
              { ok: true, endTime: '2026-06-10T03:00:00.000Z' },
            ],
          },
        ],
      }),
    });
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Sales.*OK/ }));
    });
    const strip = screen.getByTestId('run-dot-strip');
    const dots = Array.from(strip.querySelectorAll('span.rounded-full'));
    expect(dots).toHaveLength(12);
    // First two dots are the real (filled) runs; the rest are hollow pads.
    expect(dots[0]?.getAttribute('title')).toMatch(/^OK · /);
    expect(dots[1]?.getAttribute('title')).toMatch(/^OK · /);
    expect(dots[2]?.getAttribute('title')).toBeNull();
    expect(dots[11]?.getAttribute('title')).toBeNull();
  });

  it('offers a sticky section nav that smooth-scrolls to each anchor (Matt #7)', async () => {
    mockGetInsights({ success: true, data: snapshot() });
    const scrollSpy = vi.fn();
    Element.prototype.scrollIntoView = scrollSpy;
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });

    const nav = screen.getByRole('navigation', { name: 'Page sections' });
    for (const label of ['Health', 'Access', 'Usage', 'Admin']) {
      expect(within(nav).getByRole('button', { name: label })).toBeInTheDocument();
    }
    await act(async () => {
      fireEvent.click(within(nav).getByRole('button', { name: 'Access' }));
    });
    expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    expect(document.getElementById('insights-access')).not.toBeNull();
    expect(document.getElementById('insights-health')).not.toBeNull();
    expect(document.getElementById('insights-usage')).not.toBeNull();
    expect(document.getElementById('insights-admin')).not.toBeNull();
  });

  it('keeps DATASET and DATAFLOW kind chips on the same quiet grayscale tier (D12)', async () => {
    mockGetInsights({ success: true, data: snapshot() });
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Sales.*broken/ }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Ops.*OK/ }));
    });
    const datasetChips = screen.getAllByText('dataset');
    const dataflowChips = screen.getAllByText('dataflow');
    expect(datasetChips.length).toBeGreaterThan(0);
    expect(dataflowChips.length).toBeGreaterThan(0);
    const dsColor = (datasetChips[0] as HTMLElement).style.color;
    const dfColor = (dataflowChips[0] as HTMLElement).style.color;
    expect(dsColor).not.toBe('');
    // D12: identity is the WORD on the chip; hue restating it is decoration.
    // Both kinds share one quiet tier — and it is never the amber accent.
    expect(dsColor).toBe(dfColor);
    expect(dsColor).not.toBe('rgb(232, 163, 61)');
    for (const chip of datasetChips) expect((chip as HTMLElement).style.color).toBe(dsColor);
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

    // Retry path: next call succeeds and the page renders (groups collapsed).
    mockGetInsights({ success: true, data: snapshot() });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    });
    expect(screen.getByRole('button', { name: /Sales.*broken/ })).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Sales.*broken/ }));
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

describe('InsightsPage — Luce motion + material layer (D1–D12)', () => {
  /** jsdom has no rAF-driven paint loop worth running; park the ticker. */
  function stubRaf() {
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  }

  function stubReducedMotion(matches: boolean) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('prefers-reduced-motion') ? matches : false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  }

  it('renders ONE hero number — overall data health, dominant and white (D11)', async () => {
    mockGetInsights({ success: true, data: snapshot() });
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });
    const hero = screen.getByTestId('luce-hero');
    expect(within(hero).getByText('Data health')).toBeInTheDocument();
    // 4 of the 5 mocked refreshables are neither broken nor overdue → 80%.
    expect(within(hero).getByLabelText('Data health 80 percent')).toBeInTheDocument();
    expect(within(hero).getByText('80')).toBeInTheDocument();
    // The full gauge sandwich (D1): backlight deck below, lens above.
    expect(hero.querySelector('.luce-backlight')).not.toBeNull();
    expect(hero.querySelector('.luce-lens')).not.toBeNull();
  });

  it('keeps exactly three idle movers: live-dot, needle, backlight deck (D7)', async () => {
    mockGetInsights({ success: true, data: snapshot() });
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });
    const movers = document.querySelectorAll('.luce-live-dot, .luce-needle, .luce-backlight--live');
    expect(movers).toHaveLength(3);
  });

  it('plays the ignition ceremony once per session, never gating the content (D6)', async () => {
    stubRaf();
    window.sessionStorage.removeItem(IGNITION_FLAG);
    mockGetInsights({ success: true, data: snapshot() });
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });

    // Ceremony is on — and the content is fully present beneath it.
    expect(document.querySelector('.luce-board.luce-ignite')).not.toBeNull();
    expect(screen.getByText('Broken')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sales.*broken/ })).toBeInTheDocument();
    // The session is marked immediately so it can never replay.
    expect(window.sessionStorage.getItem(IGNITION_FLAG)).toBe('1');

    // Any input skips the ceremony at once.
    await act(async () => {
      fireEvent.pointerDown(window);
    });
    expect(document.querySelector('.luce-ignite')).toBeNull();
  });

  it('does not replay the ceremony later in the same session (D6)', async () => {
    stubRaf();
    window.sessionStorage.setItem(IGNITION_FLAG, '1');
    mockGetInsights({ success: true, data: snapshot() });
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });
    expect(document.querySelector('.luce-board')).not.toBeNull();
    expect(document.querySelector('.luce-ignite')).toBeNull();
  });

  it('skips the ceremony entirely under prefers-reduced-motion; the hero is instant (D6/§reduced)', async () => {
    stubReducedMotion(true);
    window.sessionStorage.removeItem(IGNITION_FLAG);
    mockGetInsights({ success: true, data: snapshot() });
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });
    expect(document.querySelector('.luce-ignite')).toBeNull();
    // No count-up: the hero shows its real value on the first frame.
    expect(within(screen.getByTestId('luce-hero')).getByText('80')).toBeInTheDocument();
  });

  it('pauses the idle movers while the window is hidden (D7)', async () => {
    mockGetInsights({ success: true, data: snapshot() });
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });
    expect(document.querySelector('.luce-asleep')).toBeNull();

    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    await act(async () => {
      fireEvent(document, new Event('visibilitychange'));
    });
    expect(document.querySelector('.luce-board.luce-asleep')).not.toBeNull();

    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    await act(async () => {
      fireEvent(document, new Event('visibilitychange'));
    });
    expect(document.querySelector('.luce-asleep')).toBeNull();
  });

  it('shows the em-dash hero (no false 100%) when there is nothing to measure', async () => {
    mockGetInsights({ success: true, data: snapshot({ refreshables: [] }) });
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });
    const hero = screen.getByTestId('luce-hero');
    expect(within(hero).getByText('—')).toBeInTheDocument();
    expect(within(hero).getByLabelText('Data health unknown')).toBeInTheDocument();
  });
});
