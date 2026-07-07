import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockNavigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});
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
    reports: [],
    partialFailure: false,
    failedWorkspaces: [],
    ...overrides,
  };
}

function mockGetInsights(resp: unknown) {
  (window.electronAPI.content.getInsights as ReturnType<typeof vi.fn>).mockResolvedValue(resp);
}

async function openSheet(workspaceName: string): Promise<HTMLElement> {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: `Open ${workspaceName} details` }));
  });
  return screen.getByRole('dialog', { name: `${workspaceName} details` });
}

async function closeSheet(): Promise<void> {
  await act(async () => {
    fireEvent.keyDown(window, { key: 'Escape' });
  });
}

function signInAsOwner() {
  useAuthStore.setState({
    user: { id: 'account-0', displayName: 'Brendan', email: 'brendan@bc-abc.com' },
    isAuthenticated: true,
    isLoading: false,
    error: null,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.setItem(IGNITION_FLAG, '1');
  useAuthStore.setState({
    user: { id: 'account-1', displayName: 'Test User', email: 'test@example.com' },
    isAuthenticated: true,
    isLoading: false,
    error: null,
  });
});

describe('InsightsPage — Luce board', () => {
  it('groups by workspace: one tile per client, damage first, items folded behind the tile (Matt #7)', async () => {
    mockGetInsights({ success: true, data: snapshot() });
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });

    expect(screen.queryAllByRole('row')).toHaveLength(0);
    expect(screen.queryByText('Healthy Model')).not.toBeInTheDocument();
    expect(screen.queryByText('Staging Flow')).not.toBeInTheDocument();

    const tiles = screen.getAllByRole('button', { name: /^Open .+ details$/ });
    expect(tiles.map((t) => t.getAttribute('aria-label'))).toEqual([
      'Open Sales details',
      'Open Ops details',
    ]);
    expect(within(tiles[0]!).getByText(/^1 broken/)).toBeInTheDocument();
    expect(within(tiles[0]!).getByText('%')).toBeInTheDocument();

    const sales = await openSheet('Sales');
    expect(within(sales).getAllByText('Broken Model').length).toBeGreaterThan(0);
    expect(within(sales).getAllByText('Healthy Model').length).toBeGreaterThan(0);
    expect(within(sales).getByText(/^FAILED · down \d+[mhd]$/)).toBeInTheDocument();
    const rows = within(sales).getAllByRole('row').map((r) => r.textContent ?? '');
    const failedIdx = rows.findIndex((t) => t.includes('Broken Model'));
    const okIdx = rows.findIndex((t) => t.includes('Healthy Model'));
    expect(failedIdx).toBeGreaterThanOrEqual(0);
    expect(failedIdx).toBeLessThan(okIdx);

    await closeSheet();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('row')).toHaveLength(0);
    const ops = await openSheet('Ops');
    expect(within(ops).getAllByText('Staging Flow').length).toBeGreaterThan(0);
    expect(within(ops).getByText('NEVER RUN')).toBeInTheDocument();
    expect(within(ops).getByText('LIVE')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(ops).getByRole('button', { name: 'Close details' }));
    });
    expect(screen.queryAllByText('Staging Flow')).toHaveLength(0);
  });

  it('marks dormant items with gray DORMANT meta text and down-for label (Matt #4 / owner v3 #6)', async () => {
    mockGetInsights({ success: true, data: snapshot() });
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });

    const ops = await openSheet('Ops');
    expect(within(ops).getByText(/^DORMANT · down \d+d$/)).toBeInTheDocument();
    expect(within(ops).getAllByText(/DORMANT · down/).length).toBeGreaterThan(0);
  });

  it('shows the down-for label, failure-rate caption, dot strip, trigger, and error code — owner email never shown (owner v8)', async () => {
    mockGetInsights({ success: true, data: snapshot() });
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });
    const sales = await openSheet('Sales');

    expect(within(sales).getByText(/^FAILED · down \d+[mhd]$/)).toBeInTheDocument();
    expect(within(sales).getByText('3 of last 12 runs failed')).toBeInTheDocument();
    expect(within(sales).getAllByTestId('run-dot-strip').length).toBeGreaterThanOrEqual(2);
    expect(within(sales).getByText(/· Power Automate \/ API$/)).toBeInTheDocument();
    expect(within(sales).queryByText('owner@bc-abc.com')).not.toBeInTheDocument();
    expect(within(sales).getByText('ModelRefreshFailed_CredentialsNotSpecified')).toBeInTheDocument();
  });

  it('failed dataset dots carry short Failed · time · errorCode tooltips — the REASON lives on the row (owner v6)', async () => {
    mockGetInsights({ success: true, data: snapshot() });
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });
    await openSheet('Sales');

    const failTitles = screen.getAllByTitle(
      /^Failed · .+ · ModelRefreshFailed_CredentialsNotSpecified$/,
    );
    expect(failTitles.length).toBe(3);
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
    await openSheet('Ops');
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
    await openSheet('Sales');
    const strip = screen.getByTestId('run-dot-strip');
    const dots = Array.from(strip.querySelectorAll('span.rounded-full'));
    expect(dots).toHaveLength(12);
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
    expect(within(nav).getByRole('button', { name: 'Health' })).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(nav).getByRole('button', { name: 'Health' }));
    });
    expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    expect(document.getElementById('insights-health')).not.toBeNull();
    expect(within(nav).queryByRole('button', { name: 'Usage' })).not.toBeInTheDocument();
    expect(document.getElementById('insights-usage')).toBeNull();
    expect(within(nav).queryByRole('button', { name: 'Access' })).not.toBeInTheDocument();
    expect(within(nav).queryByRole('button', { name: 'Admin' })).not.toBeInTheDocument();
  });

  it('drops the kind dots and the kind-key legend — the section titles carry the type (owner)', async () => {
    mockGetInsights({ success: true, data: snapshot() });
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });
    const ops = await openSheet('Ops');
    expect(within(ops).queryAllByTestId('kind-dot')).toHaveLength(0);
    expect(within(ops).queryByTestId('kind-key')).toBeNull();
    expect(within(ops).getByText(/Dataflows — upstream/)).toBeInTheDocument();
    expect(within(ops).getByText(/Datasets \(2\)/)).toBeInTheDocument();
  });

  it('folds the access roster into the sheet and labels not-visible lists', async () => {
    mockGetInsights({ success: true, data: snapshot() });
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });

    const sales = await openSheet('Sales');
    expect(within(sales).getByText('People with access')).toBeInTheDocument();
    expect(within(sales).getByText('Brendan')).toBeInTheDocument();
    expect(within(sales).getByText('Client A')).toBeInTheDocument();
    expect(within(sales).getByTitle('brendan@bc-abc.com · Admin')).toBeInTheDocument();
    expect(within(sales).getByTitle('a@client.com · Viewer')).toBeInTheDocument();
    await closeSheet();

    const ops = await openSheet('Ops');
    expect(
      within(ops).getByText(/The member list is not visible to your account/),
    ).toBeInTheDocument();
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

  it('surfaces a non-blocking banner when a refresh fails but stale data remains (E-H3)', async () => {
    mockGetInsights({ success: true, data: snapshot() });
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });
    expect(screen.getByRole('button', { name: 'Open Sales details' })).toBeInTheDocument();

    mockGetInsights({
      success: false,
      error: { code: 'INSIGHTS_FETCH_FAILED', message: 'raw', userMessage: 'Could not reach Power BI.' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    });

    expect(screen.getByRole('button', { name: 'Open Sales details' })).toBeInTheDocument();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Refresh failed — showing the last loaded data.');
    expect(alert).toHaveTextContent('Could not reach Power BI.');
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

    mockGetInsights({ success: true, data: snapshot() });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    });
    expect(screen.getByRole('button', { name: 'Open Sales details' })).toBeInTheDocument();
    const sales = await openSheet('Sales');
    expect(within(sales).getAllByText('Healthy Model').length).toBeGreaterThan(0);
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

describe('InsightsPage — blast radius (DESIGN-CONTRACT stories 2/4/5)', () => {
  function cascadeSnapshot(overrides: Partial<InsightsSnapshot> = {}): InsightsSnapshot {
    return snapshot({
      workspaceCount: 1,
      refreshables: [
        {
          kind: 'dataflow',
          id: 'df-root',
          name: 'Root Flow',
          workspaceId: 'ws-1',
          workspaceName: 'Sales',
          lastStatus: 'Failed',
          lastAttemptTime: '2026-06-10T02:00:00.000Z',
          lastSuccessTime: '2026-06-08T02:00:00.000Z',
          recentRuns: [{ ok: false, endTime: '2026-06-10T02:00:00.000Z' }],
        },
        {
          kind: 'dataset',
          id: 'ds-sus',
          name: 'Suspect Model',
          workspaceId: 'ws-1',
          workspaceName: 'Sales',
          lastStatus: 'Completed',
          lastAttemptTime: '2026-06-10T03:00:00.000Z',
          lastSuccessTime: '2026-06-10T03:00:00.000Z',
          upstreamDataflowIds: ['df-root'],
          recentRuns: [{ ok: true, endTime: '2026-06-10T03:00:00.000Z' }],
        },
        {
          kind: 'dataset',
          id: 'ds-clean',
          name: 'Clean Model',
          workspaceId: 'ws-1',
          workspaceName: 'Sales',
          lastStatus: 'Completed',
          lastAttemptTime: '2026-06-10T03:00:00.000Z',
          lastSuccessTime: '2026-06-10T03:00:00.000Z',
          recentRuns: [{ ok: true, endTime: '2026-06-10T03:00:00.000Z' }],
        },
      ],
      reports: [
        { id: 'r-1', name: 'Exec Daily', workspaceId: 'ws-1', datasetId: 'ds-sus' },
        { id: 'r-2', name: 'Quiet Report', workspaceId: 'ws-1', datasetId: 'ds-clean' },
      ],
      ...overrides,
    });
  }

  it('draws the lineage diagram as the sheet\'s primary visual: red fail, red poisoned path (owner v7: downstream of failure IS broken), green happy path (owner v3 #3)', async () => {
    mockGetInsights({ success: true, data: cascadeSnapshot() });
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });
    const sheet = await openSheet('Sales');

    const diagram = within(sheet).getByTestId('lineage-diagram');
    expect(within(sheet).queryByTestId('damage-cascade')).not.toBeInTheDocument();

    const node = (id: string) => diagram.querySelector(`[data-node-id="${id}"]`)!;
    expect(node('df-root').getAttribute('data-column')).toBe('dataflow');
    expect(node('df-root').getAttribute('data-health')).toBe('failed');
    expect(node('ds-sus').getAttribute('data-column')).toBe('dataset');
    expect(node('ds-sus').getAttribute('data-health')).toBe('stale');
    expect(node('ds-clean').getAttribute('data-health')).toBe('healthy');
    expect(node('r-1').getAttribute('data-column')).toBe('report');
    expect(node('r-1').getAttribute('data-health')).toBe('stale');
    expect(node('r-2').getAttribute('data-health')).toBe('healthy');
    expect(within(diagram).getByLabelText('Exec Daily')).toBeInTheDocument();
    expect(within(diagram).getByLabelText('Quiet Report')).toBeInTheDocument();

    const edge = (from: string, to: string) =>
      diagram.querySelector(`[data-testid="lineage-edge"][data-from="${from}"][data-to="${to}"]`)!;
    expect(edge('df-root', 'ds-sus').getAttribute('data-health')).toBe('failed');
    expect(edge('ds-sus', 'r-1').getAttribute('data-health')).toBe('failed');
    expect(edge('ds-clean', 'r-2').getAttribute('data-health')).toBe('healthy');

    expect(within(sheet).queryByText('STALE DATA')).not.toBeInTheDocument();
    const rows = within(sheet).getAllByRole('row');
    const suspectRow = rows.find((r) => r.textContent?.includes('Suspect Model'))!;
    const staleWord = within(suspectRow).getByText('FAILED · upstream');
    expect(staleWord).toBeInTheDocument();
    expect((staleWord as HTMLElement).style.color).toBe('rgb(229, 72, 77)');
    expect(within(suspectRow).queryByText('OK')).not.toBeInTheDocument();
    const cleanRow = rows.find((r) => r.textContent?.includes('Clean Model'))!;
    expect(within(cleanRow).queryByText('stale')).not.toBeInTheDocument();
    expect(within(cleanRow).queryByText('OK')).not.toBeInTheDocument();
  });

  it('renders an empty REPORTS column honestly when no reports are bound', async () => {
    mockGetInsights({ success: true, data: cascadeSnapshot({ reports: [] }) });
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });
    const sheet = await openSheet('Sales');
    const diagram = within(sheet).getByTestId('lineage-diagram');
    expect(diagram.querySelectorAll('[data-testid="lineage-node"][data-column="report"]')).toHaveLength(0);
    expect(diagram.querySelector('[data-node-id="df-root"]')?.getAttribute('data-health')).toBe('failed');
    expect(diagram.querySelector('[data-node-id="ds-sus"]')?.getAttribute('data-health')).toBe('stale');
  });

  it('renders EVERY dataset node at real scale — the diagram never elides the data (owner v4)', async () => {
    const old = '2024-01-01T00:00:00.000Z';
    const dormants = Array.from({ length: 20 }, (_, i) => ({
      kind: 'dataset' as const,
      id: `ds-d${i}`,
      name: `Dusty ${i}`,
      workspaceId: 'ws-1',
      workspaceName: 'Sales',
      lastStatus: 'Completed' as const,
      lastAttemptTime: old,
      lastSuccessTime: old,
    }));
    const suspects = Array.from({ length: 2 }, (_, i) => ({
      kind: 'dataset' as const,
      id: `ds-s${i}`,
      name: `Suspect ${i}`,
      workspaceId: 'ws-1',
      workspaceName: 'Sales',
      lastStatus: 'Completed' as const,
      lastSuccessTime: '2026-06-10T03:00:00.000Z',
      upstreamDataflowIds: ['df-root'],
    }));
    mockGetInsights({
      success: true,
      data: cascadeSnapshot({
        refreshables: [
          {
            kind: 'dataflow',
            id: 'df-root',
            name: 'Root Flow',
            workspaceId: 'ws-1',
            workspaceName: 'Sales',
            lastStatus: 'Failed',
          },
          ...suspects,
          ...dormants,
        ],
        reports: [],
      }),
    });
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });
    const sheet = await openSheet('Sales');
    const diagram = within(sheet).getByTestId('lineage-diagram');
    const datasetNodes = diagram.querySelectorAll('[data-testid="lineage-node"][data-column="dataset"]');
    expect(datasetNodes).toHaveLength(22);
    expect(diagram.querySelector('[data-node-id="ds-s0"]')).not.toBeNull();
    expect(diagram.querySelector('[data-node-id="ds-d19"]')).not.toBeNull();
    expect(within(sheet).queryByText(/\+\d+ more/)).not.toBeInTheDocument();
  });

  it('sorts damaged workspaces first in the tile grid: broken, then suspects-only, then quiet (§B)', async () => {
    mockGetInsights({
      success: true,
      data: snapshot({
        workspaceCount: 3,
        refreshables: [
          {
            kind: 'dataset',
            id: 'a-ok',
            name: 'Alpha Model',
            workspaceId: 'ws-a',
            workspaceName: 'Alpha',
            lastStatus: 'Completed',
            lastSuccessTime: '2026-06-10T03:00:00.000Z',
          },
          {
            kind: 'dataset',
            id: 'b-bad',
            name: 'Bravo Model',
            workspaceId: 'ws-b',
            workspaceName: 'Bravo',
            lastStatus: 'Failed',
            lastSuccessTime: '2026-06-08T03:00:00.000Z',
          },
          {
            kind: 'dataflow',
            id: 'c-flow',
            name: 'Charlie Flow',
            workspaceId: 'ws-c',
            workspaceName: 'Charlie',
            lastStatus: 'Completed',
            lastSuccessTime: '2026-06-01T00:00:00.000Z',
          },
          {
            kind: 'dataset',
            id: 'c-sus',
            name: 'Charlie Model',
            workspaceId: 'ws-c',
            workspaceName: 'Charlie',
            lastStatus: 'Completed',
            lastSuccessTime: '2026-06-05T00:00:00.000Z',
            upstreamDataflowIds: ['c-flow'],
          },
        ],
        reports: [],
      }),
    });
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });
    const tiles = screen.getAllByRole('button', { name: /^Open .+ details$/ });
    expect(tiles.map((t) => t.getAttribute('aria-label'))).toEqual([
      'Open Bravo details',
      'Open Alpha details',
      'Open Charlie details',
    ]);
    expect(screen.queryByText('STALE DATA')).not.toBeInTheDocument();
  });

  it('renders the solo-client HERO tile with ASSETS/MEMBERS/FRESHNESS and the amber blast line (§A)', async () => {
    mockGetInsights({ success: true, data: cascadeSnapshot() });
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });

    const hero = screen.getByTestId('luce-hero-tile');
    expect(within(hero).getByText('Assets')).toBeInTheDocument();
    expect(within(hero).getByText('Members')).toBeInTheDocument();
    expect(within(hero).getByText('Freshness')).toBeInTheDocument();
    expect(within(hero).getByText('Root Flow')).toBeInTheDocument();
    expect(within(hero).getByText('Suspect Model')).toBeInTheDocument();
    expect(within(hero).getByText('2')).toBeInTheDocument();
    expect(within(hero).getByText('Brendan')).toBeInTheDocument();
    expect(within(hero).getByText('Oldest success:')).toBeInTheDocument();
    expect(within(hero).getByText('Next scheduled:')).toBeInTheDocument();
    expect(
      within(hero).getByText('1 report may be reading stale data — open to trace'),
    ).toBeInTheDocument();
  });

  it('names a hard failure on the HERO asset face — "FAILED · down …", not just red dots (Matt)', async () => {
    mockGetInsights({ success: true, data: cascadeSnapshot() });
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });
    const hero = screen.getByTestId('luce-hero-tile');
    expect(within(hero).getByText(/FAILED · down/)).toBeInTheDocument();
  });

  it('shows the failure-rate caption on the HERO asset pulse strips (Matt)', async () => {
    mockGetInsights({ success: true, data: cascadeSnapshot() });
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });
    const hero = screen.getByTestId('luce-hero-tile');
    expect(within(hero).getByText('1 of last 1 runs failed')).toBeInTheDocument();
  });

  it('puts the affected-report COUNT on the n=20 tile, not only the solo hero (Matt)', async () => {
    mockGetInsights({
      success: true,
      data: snapshot({
        workspaceCount: 2,
        refreshables: [
          {
            kind: 'dataflow',
            id: 'df-a',
            name: 'A Flow',
            workspaceId: 'ws-a',
            workspaceName: 'Alpha',
            lastStatus: 'Failed',
            lastAttemptTime: '2026-06-10T02:00:00.000Z',
            lastSuccessTime: '2026-06-08T02:00:00.000Z',
            recentRuns: [{ ok: false, endTime: '2026-06-10T02:00:00.000Z' }],
          },
          {
            kind: 'dataset',
            id: 'ds-a',
            name: 'A Model',
            workspaceId: 'ws-a',
            workspaceName: 'Alpha',
            lastStatus: 'Completed',
            lastAttemptTime: '2026-06-10T03:00:00.000Z',
            lastSuccessTime: '2026-06-10T03:00:00.000Z',
            upstreamDataflowIds: ['df-a'],
            recentRuns: [{ ok: true, endTime: '2026-06-10T03:00:00.000Z' }],
          },
          {
            kind: 'dataset',
            id: 'ds-b',
            name: 'B Model',
            workspaceId: 'ws-b',
            workspaceName: 'Beta',
            lastStatus: 'Completed',
            lastSuccessTime: '2026-06-10T03:00:00.000Z',
            recentRuns: [{ ok: true, endTime: '2026-06-10T03:00:00.000Z' }],
          },
        ],
        reports: [{ id: 'r-a', name: 'Alpha Daily', workspaceId: 'ws-a', datasetId: 'ds-a' }],
      }),
    });
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });
    expect(screen.queryByTestId('luce-hero-tile')).not.toBeInTheDocument();
    const stat = screen.getByText(/1 stale rpt/);
    expect(stat).toBeInTheDocument();
    expect(stat).toBeInTheDocument();
    expect(screen.queryByText('1 report may be reading stale data')).not.toBeInTheDocument();
  });

  it('keeps the hero quiet when healthy: no blast line, no green substitute; hides hidden member lists honestly', async () => {
    mockGetInsights({
      success: true,
      data: snapshot({
        workspaceCount: 1,
        refreshables: [
          {
            kind: 'dataset',
            id: 'ds-ok',
            name: 'Healthy Model',
            workspaceId: 'ws-2',
            workspaceName: 'Ops',
            lastStatus: 'Completed',
            lastSuccessTime: '2026-06-10T03:00:00.000Z',
          },
        ],
      }),
    });
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });
    const hero = screen.getByTestId('luce-hero-tile');
    expect(within(hero).queryByText(/may be reading stale data/)).not.toBeInTheDocument();
    expect(within(hero).queryByText(/all good/i)).not.toBeInTheDocument();
    expect(within(hero).getByText('not visible to your account')).toBeInTheDocument();
  });

  it('uses the n=20 tile grid (no hero) the moment a second workspace exists', async () => {
    mockGetInsights({ success: true, data: snapshot() });
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });
    expect(screen.queryByTestId('luce-hero-tile')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Open .+ details$/ })).toHaveLength(2);
  });
});

describe('InsightsPage — usage lives in the workspace sheet (owner spec)', () => {
  type Freq = {
    id: string;
    name: string;
    type: 'report' | 'dashboard';
    workspaceId: string;
    workspaceName: string;
    openCount: number;
  };

  function mockUsage(frequent: Freq[], reports: Array<{ id: string; name: string; workspaceId: string }>) {
    (window.electronAPI.usage.getFrequent as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: frequent,
    });
    (window.electronAPI.content.getAllItems as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: {
        workspaces: [
          { id: 'ws-1', name: 'Sales' },
          { id: 'ws-2', name: 'Ops' },
        ],
        reports,
        dashboards: [],
        partialFailure: false,
        failedWorkspaces: [],
      },
    });
  }

  it('renders the USAGE group in the sheet as a bar graph: this workspace only, sorted by opens desc, widths ∝ openCount/max, counts right-aligned, metric defined in the caption', async () => {
    mockGetInsights({ success: true, data: snapshot() });
    mockUsage(
      [
        { id: 'r-weekly', name: 'Sales Weekly', type: 'report', workspaceId: 'ws-1', workspaceName: 'Sales', openCount: 6 },
        { id: 'r-daily', name: 'Sales Daily', type: 'report', workspaceId: 'ws-1', workspaceName: 'Sales', openCount: 12 },
        { id: 'r-ops', name: 'Ops Daily', type: 'report', workspaceId: 'ws-2', workspaceName: 'Ops', openCount: 9 },
      ],
      [
        { id: 'r-daily', name: 'Sales Daily', workspaceId: 'ws-1' },
        { id: 'r-weekly', name: 'Sales Weekly', workspaceId: 'ws-1' },
      ],
    );
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });
    const sales = await openSheet('Sales');

    const usage = within(sales).getByTestId('sheet-usage');
    expect(within(usage).getByText('Usage')).toBeInTheDocument();
    expect(
      within(usage).getByText('opens recorded by this app on this computer'),
    ).toBeInTheDocument();
    const sheetHtml = sales.innerHTML;
    expect(sheetHtml.indexOf('People with access')).toBeLessThan(sheetHtml.indexOf('opens recorded by this app'));

    const rows = within(usage).getAllByTestId('usage-bar-row');
    expect(rows).toHaveLength(2);
    expect(within(usage).queryByText('Ops Daily')).not.toBeInTheDocument();
    expect(rows[0]).toHaveTextContent('Sales Daily');
    expect(rows[0]).toHaveTextContent('12 opens');
    expect(rows[1]).toHaveTextContent('Sales Weekly');
    expect(rows[1]).toHaveTextContent('6 opens');
    expect(rows[0]).toHaveAttribute('title', 'Sales Daily');

    const bars = within(usage).getAllByTestId('usage-bar');
    expect((bars[0] as HTMLElement).style.width).toBe('100%');
    expect((bars[1] as HTMLElement).style.width).toBe('50%');
    expect((bars[0] as HTMLElement).style.height).toBe('6px');

    expect(within(usage).queryByTestId('usage-never-opened')).not.toBeInTheDocument();
    expect(within(usage).queryByText(/^Never opened:/)).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(rows[0]!);
    });
    expect(mockNavigate).toHaveBeenCalledWith('/report/ws-1/r-daily');
  });

  it('compresses never-opened items into one footnote line capped at 5 names (+N more)', async () => {
    mockGetInsights({ success: true, data: snapshot() });
    const never = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf'].map((name, i) => ({
      id: `r-n${i}`,
      name,
      workspaceId: 'ws-1',
    }));
    mockUsage(
      [{ id: 'r-open', name: 'Opened One', type: 'report', workspaceId: 'ws-1', workspaceName: 'Sales', openCount: 3 }],
      [{ id: 'r-open', name: 'Opened One', workspaceId: 'ws-1' }, ...never],
    );
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });
    const sales = await openSheet('Sales');
    const usage = within(sales).getByTestId('sheet-usage');
    const line = within(usage).getByTestId('usage-never-opened');
    expect(line).toHaveTextContent('Never opened: Alpha, Bravo, Charlie, Delta, Echo +2 more');
    expect(line).not.toHaveTextContent('Foxtrot');
    expect(line).not.toHaveTextContent('Golf');
    expect(within(usage).getByTestId('usage-bar-row')).toHaveTextContent('Opened One');
    expect((within(usage).getByTestId('usage-bar') as HTMLElement).style.width).toBe('100%');
  });

  it('shows the empty state when nothing was opened in this workspace: one faint line, no bars', async () => {
    mockGetInsights({ success: true, data: snapshot() });
    mockUsage(
      [{ id: 'r-ops', name: 'Ops Daily', type: 'report', workspaceId: 'ws-2', workspaceName: 'Ops', openCount: 9 }],
      [{ id: 'r-never', name: 'Sales Daily', workspaceId: 'ws-1' }],
    );
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });
    const sales = await openSheet('Sales');
    const usage = within(sales).getByTestId('sheet-usage');
    expect(within(usage).getByText('No opens recorded yet for this client.')).toBeInTheDocument();
    expect(within(usage).queryAllByTestId('usage-bar-row')).toHaveLength(0);
    expect(within(usage).getByTestId('usage-never-opened')).toHaveTextContent(
      'Never opened: Sales Daily',
    );
  });

  it('removes the page-level "Your usage" section entirely — the sheet is its only home', async () => {
    mockGetInsights({ success: true, data: snapshot() });
    mockUsage(
      [{ id: 'r-daily', name: 'Sales Daily', type: 'report', workspaceId: 'ws-1', workspaceName: 'Sales', openCount: 12 }],
      [{ id: 'r-daily', name: 'Sales Daily', workspaceId: 'ws-1' }],
    );
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });
    expect(document.getElementById('insights-usage')).toBeNull();
    expect(screen.queryByText('Your usage')).not.toBeInTheDocument();
    expect(screen.queryByText('You open most')).not.toBeInTheDocument();
    expect(screen.queryByText('Never opened by you')).not.toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Page sections' });
    expect(within(nav).queryByRole('button', { name: 'Usage' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('sheet-usage')).not.toBeInTheDocument();
    const sales = await openSheet('Sales');
    expect(within(sales).getByTestId('sheet-usage')).toBeInTheDocument();
  });
});

describe('InsightsPage — admin tier (owner-only)', () => {
  it('hides the Admin nav and section entirely from non-owners', async () => {
    mockGetInsights({ success: true, data: snapshot() });
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });
    const nav = screen.getByRole('navigation', { name: 'Page sections' });
    expect(within(nav).queryByRole('button', { name: 'Admin' })).not.toBeInTheDocument();
    expect(document.getElementById('insights-admin')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Unlock admin view' })).not.toBeInTheDocument();
  });

  it('shows the Admin nav and unlock section to the owner alone', async () => {
    signInAsOwner();
    mockGetInsights({ success: true, data: snapshot() });
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });
    const nav = screen.getByRole('navigation', { name: 'Page sections' });
    expect(within(nav).getByRole('button', { name: 'Admin' })).toBeInTheDocument();
    expect(document.getElementById('insights-admin')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Unlock admin view' })).toBeInTheDocument();
  });

  it('requests a 2-day window and surfaces ADMIN_REQUIRED as a friendly message', async () => {
    signInAsOwner();
    mockGetInsights({ success: true, data: snapshot() });
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
    signInAsOwner();
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

    expect(screen.getByText('Opening Microsoft consent…')).toBeInTheDocument();
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    await act(async () => {
      fireEvent.click(cancel);
    });

    expect(screen.queryByText('Opening Microsoft consent…')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unlock admin view' })).toBeInTheDocument();

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
    signInAsOwner();
    mockGetInsights({ success: true, data: snapshot() });
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });
    expect(screen.getByText(/can open BEHIND this window/)).toBeInTheDocument();
  });

  it('renders activity and App audiences after a successful unlock', async () => {
    signInAsOwner();
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

    const audience = screen.getByRole('button', { name: /BC Suite/ });
    await act(async () => {
      fireEvent.click(audience);
    });
    expect(screen.getByText('Client A')).toBeInTheDocument();
    expect(within(audience.parentElement as HTMLElement).getByText('Viewer')).toBeInTheDocument();
  });
});

describe('InsightsPage — Luce motion + material layer (D1–D12)', () => {
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

  it('plays the ignition ceremony once per session, never gating the content (D6)', async () => {
    stubRaf();
    window.sessionStorage.removeItem(IGNITION_FLAG);
    mockGetInsights({ success: true, data: snapshot() });
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });

    expect(document.querySelector('.luce-board.luce-ignite')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Open Sales details' })).toBeInTheDocument();
    expect(window.sessionStorage.getItem(IGNITION_FLAG)).toBe('1');

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
    expect(screen.getByRole('button', { name: 'Open Sales details' })).toBeInTheDocument();
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

  it('closes the sheet with a click anywhere that is not interactive (owner v3 #1)', async () => {
    mockGetInsights({ success: true, data: snapshot() });
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });
    const sales = await openSheet('Sales');
    await act(async () => {
      fireEvent.click(within(sales).getAllByText('Healthy Model')[0]!);
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does NOT close on interactive elements or selectable technical details (owner v3 #1)', async () => {
    mockGetInsights({ success: true, data: snapshot() });
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });
    const sales = await openSheet('Sales');
    await act(async () => {
      fireEvent.click(within(sales).getByText('ModelRefreshFailed_CredentialsNotSpecified'));
    });
    expect(screen.getByRole('dialog', { name: 'Sales details' })).toBeInTheDocument();
    const original = window.getSelection;
    window.getSelection = () =>
      ({ isCollapsed: false } as unknown as Selection);
    try {
      await act(async () => {
        fireEvent.click(within(sales).getAllByText('Healthy Model')[0]!);
      });
      expect(screen.getByRole('dialog', { name: 'Sales details' })).toBeInTheDocument();
    } finally {
      window.getSelection = original;
    }
    await act(async () => {
      fireEvent.click(within(sales).getByRole('button', { name: 'Close details' }));
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('returns focus to the originating tile when the sheet contracts (§D)', async () => {
    mockGetInsights({ success: true, data: snapshot() });
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });
    const tile = screen.getByRole('button', { name: 'Open Sales details' });
    await openSheet('Sales');
    await closeSheet();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(tile);
  });

  it('keeps the REAL tile in the grid while its sheet is open — never hidden, the grid never reflows (§D)', async () => {
    mockGetInsights({ success: true, data: snapshot() });
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });
    const tile = screen.getByRole('button', { name: 'Open Sales details' });
    await openSheet('Sales');
    expect(tile).toBeInTheDocument();
    expect(tile.style.opacity).not.toBe('0');
    await closeSheet();
    expect(tile).toBeInTheDocument();
    expect(tile.style.opacity).not.toBe('0');
  });

  it('falls back to a plain state change when the View Transition engine is missing (jsdom path)', async () => {
    expect('startViewTransition' in document).toBe(false);
    mockGetInsights({ success: true, data: snapshot() });
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });
    const sales = await openSheet('Sales');
    expect(sales).toBeInTheDocument();
    expect(sales.querySelector('.luce-sheet--settled')).not.toBeNull();
    await closeSheet();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('tile sets aria-expanded=false before opening and aria-expanded=true while sheet is open (§ARIA-EXPANDED)', async () => {
    mockGetInsights({ success: true, data: snapshot() });
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });
    const tile = screen.getByRole('button', { name: 'Open Sales details' });
    expect(tile).toHaveAttribute('aria-expanded', 'false');
    await openSheet('Sales');
    expect(tile).toHaveAttribute('aria-expanded', 'true');
    await closeSheet();
    expect(tile).toHaveAttribute('aria-expanded', 'false');
  });

  it('focus returns to the opener tile after sheet unmounts — active element is the tile, not the body (§FOCUS-RETURN)', async () => {
    mockGetInsights({ success: true, data: snapshot() });
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });
    const tile = screen.getByRole('button', { name: 'Open Sales details' });
    tile.focus();
    await openSheet('Sales');
    await act(async () => {
      fireEvent.click(within(screen.getByRole('dialog', { name: 'Sales details' })).getByRole('button', { name: 'Close details' }));
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(tile);
    expect(document.activeElement).not.toBe(document.body);
  });
});
