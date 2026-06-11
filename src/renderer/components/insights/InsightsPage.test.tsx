/**
 * InsightsPage (Luce board) rendering cases.
 *
 * Drives the page through its main states with a mocked getInsights bridge:
 * clickable summary-tile filters, the per-workspace TILE grid (damage-first
 * triage, items folded behind each tile), the blast-radius SHEET a tile
 * expands into (chipless rows with kind dots + status text in the meta
 * column, dormant detection, down-for labels, run-history dot strips with
 * failure tooltips, access folded in, click-anywhere-to-close), the lineage
 * process diagram (red fails / amber stale path / green happy path / ash
 * dormant, +N-more capping), the solo-client hero tile, the per-workspace
 * USAGE group inside the sheet (open-count bar graph + never-opened
 * footnote — owner: usage lives in the same window as its tile), the sticky
 * section nav, the partial-failure banner, the error + retry path, and the
 * owner-gated admin tier (staged loading text + client-side cancel).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Spy on navigation from the sheet's usage bars (the rest of the router is real).
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
    reports: [],
    partialFailure: false,
    failedWorkspaces: [],
    ...overrides,
  };
}

function mockGetInsights(resp: unknown) {
  (window.electronAPI.content.getInsights as ReturnType<typeof vi.fn>).mockResolvedValue(resp);
}

/** Open a workspace's blast-radius sheet from its tile and return the dialog. */
async function openSheet(workspaceName: string): Promise<HTMLElement> {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: `Open ${workspaceName} details` }));
  });
  return screen.getByRole('dialog', { name: `${workspaceName} details` });
}

/** Contract the sheet (Esc — same path as backdrop / second header click). */
async function closeSheet(): Promise<void> {
  await act(async () => {
    fireEvent.keyDown(window, { key: 'Escape' });
  });
}

/** The admin tier is the owner's alone (owner directive). */
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

  it('groups by workspace: one tile per client, damage first, items folded behind the tile (Matt #7)', async () => {
    mockGetInsights({ success: true, data: snapshot() });
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });

    // Nothing is expanded — no item ROWS on the board face. (§B puts the
    // worst asset's NAME on the tile face; the rows stay behind the click.)
    expect(screen.queryAllByRole('row')).toHaveLength(0);
    expect(screen.queryByText('Healthy Model')).not.toBeInTheDocument();
    expect(screen.queryByText('Staging Flow')).not.toBeInTheDocument();

    // One tile per workspace; the broken Sales tile triages FIRST (§B).
    const tiles = screen.getAllByRole('button', { name: /^Open .+ details$/ });
    expect(tiles.map((t) => t.getAttribute('aria-label'))).toEqual([
      'Open Sales details',
      'Open Ops details',
    ]);
    // The tile face still carries the wayfinding — broken/OK are now stats,
    // stacked and sized like every other metric (owner v4).
    // Tile v3 (owner v8): dial grammar — health % + a red damage line.
    expect(within(tiles[0]!).getByText(/^1 broken/)).toBeInTheDocument();
    expect(within(tiles[0]!).getByText('%')).toBeInTheDocument();

    // Opening Sales reveals its rows in the sheet, worst first. Status reads
    // as colored TEXT in the meta column now (owner v3 #6) — no chips. Names
    // appear in the rows AND as lineage-diagram nodes, hence getAllByText.
    const sales = await openSheet('Sales');
    expect(within(sales).getAllByText('Broken Model').length).toBeGreaterThan(0);
    expect(within(sales).getAllByText('Healthy Model').length).toBeGreaterThan(0);
    expect(within(sales).getByText(/^FAILED · down \d+[mhd]$/)).toBeInTheDocument();
    const rows = within(sales).getAllByRole('row').map((r) => r.textContent ?? '');
    const failedIdx = rows.findIndex((t) => t.includes('Broken Model'));
    const okIdx = rows.findIndex((t) => t.includes('Healthy Model'));
    expect(failedIdx).toBeGreaterThanOrEqual(0);
    expect(failedIdx).toBeLessThan(okIdx);

    // The sheet closes (Esc) and Ops opens independently.
    await closeSheet();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('row')).toHaveLength(0);
    const ops = await openSheet('Ops');
    expect(within(ops).getAllByText('Staging Flow').length).toBeGreaterThan(0);
    expect(within(ops).getByText('NEVER RUN')).toBeInTheDocument();
    expect(within(ops).getByText('LIVE')).toBeInTheDocument();
    // The × Close control contracts it too.
    await act(async () => {
      fireEvent.click(within(ops).getByRole('button', { name: 'Close details' }));
    });
    expect(screen.queryAllByText('Staging Flow')).toHaveLength(0);
  });

  it('summary tiles filter the board: only matching workspaces remain, clear chip removes the filter (Matt #2)', async () => {
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
    // Ops has no broken items, so its whole tile disappears from the board.
    expect(screen.queryByRole('button', { name: 'Open Ops details' })).not.toBeInTheDocument();
    // Opening the remaining Sales tile shows the FULL workspace — the filter
    // selects which tiles show, it never elides data or recomputes stats
    // (owner: filtering to Broken showed "0% everywhere").
    const sales = await openSheet('Sales');
    expect(within(sales).getAllByText('Broken Model').length).toBeGreaterThan(0);
    expect(within(sales).getAllByText('Healthy Model').length).toBeGreaterThan(0);
    await closeSheet();

    // The visible "Showing: Broken ✕" chip clears the filter.
    await act(async () => {
      fireEvent.click(screen.getByText(/Showing: Broken/));
    });
    expect(screen.queryByText(/Showing: Broken/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Ops details' })).toBeInTheDocument();
    expect(screen.queryAllByRole('row')).toHaveLength(0); // folded again

    // Clicking an active tile also clears (toggle).
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '1 Dormant' }));
    });
    expect(screen.getByText(/Showing: Dormant/)).toBeInTheDocument();
    const ops = await openSheet('Ops');
    expect(within(ops).getAllByText('Dusty Model').length).toBeGreaterThan(0);
    await closeSheet();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '1 Dormant' }));
    });
    expect(screen.queryByText(/Showing: Dormant/)).not.toBeInTheDocument();
    expect(screen.queryAllByText('Dusty Model')).toHaveLength(0);
  });

  it('marks dormant items with gray DORMANT meta text and down-for label (Matt #4 / owner v3 #6)', async () => {
    mockGetInsights({ success: true, data: snapshot() });
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });

    const ops = await openSheet('Ops');
    // The meta column reads "DORMANT · down NNNd" off the 2024-01-01 success
    // — plain colored text in the row meta, no chip on the name line.
    expect(within(ops).getByText(/^DORMANT · down \d+d$/)).toBeInTheDocument();
    // The sheet header summary counts it.
    expect(within(ops).getAllByText(/DORMANT · down/).length).toBeGreaterThan(0);
  });

  it('shows the down-for label, failure-rate caption, dot strip, trigger, and error code — owner email never shown (owner v8)', async () => {
    mockGetInsights({ success: true, data: snapshot() });
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });
    const sales = await openSheet('Sales');

    // Down since the last success, folded into the meta status line
    // (clock-relative — assert shape, not value).
    expect(within(sales).getByText(/^FAILED · down \d+[mhd]$/)).toBeInTheDocument();
    // 3 of the 12 mocked runs failed — the caption lives UNDER the dots (§C).
    expect(within(sales).getByText('3 of last 12 runs failed')).toBeInTheDocument();
    // Dot strips render for both sheet rows.
    expect(within(sales).getAllByTestId('run-dot-strip').length).toBeGreaterThanOrEqual(2);
    // Trigger (now on the meta line with the relative time), owner, and error
    // code survive the redesign.
    expect(within(sales).getByText(/· Power Automate \/ API$/)).toBeInTheDocument();
    expect(within(sales).queryByText('owner@bc-abc.com')).not.toBeInTheDocument(); // identity isn't insight (owner v8)
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
    expect(within(nav).getByRole('button', { name: 'Health' })).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(nav).getByRole('button', { name: 'Health' }));
    });
    expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    expect(document.getElementById('insights-health')).not.toBeNull();
    // Usage moved INTO each tile's sheet (owner) — no page section, no nav entry.
    expect(within(nav).queryByRole('button', { name: 'Usage' })).not.toBeInTheDocument();
    expect(document.getElementById('insights-usage')).toBeNull();
    // Access folded into each tile's sheet; Admin is owner-only (see below).
    expect(within(nav).queryByRole('button', { name: 'Access' })).not.toBeInTheDocument();
    expect(within(nav).queryByRole('button', { name: 'Admin' })).not.toBeInTheDocument();
  });

  it('color-codes rows with kind DOTS (violet dataflow / slate dataset) and a one-line key — no kind chips (owner v3 #5)', async () => {
    mockGetInsights({ success: true, data: snapshot() });
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });
    // Ops carries both kinds: a dataflow and two datasets.
    const ops = await openSheet('Ops');
    const dots = within(ops).getAllByTestId('kind-dot');
    expect(dots.length).toBe(3);
    const dfDots = dots.filter((d) => d.getAttribute('aria-label') === 'dataflow');
    const dsDots = dots.filter((d) => d.getAttribute('aria-label') === 'dataset');
    expect(dfDots.length).toBe(1);
    expect(dsDots.length).toBe(2);
    // Identity tints: violet #A78BDB / slate #7E9CC9 — never red/amber/green.
    expect((dfDots[0] as HTMLElement).style.background).toBe('rgb(167, 139, 219)');
    expect((dsDots[0] as HTMLElement).style.background).toBe('rgb(126, 156, 201)');
    for (const dot of dots) {
      expect(['rgb(229, 72, 77)', 'rgb(229, 72, 77)', 'rgb(63, 182, 139)']).not.toContain(
        (dot as HTMLElement).style.background,
      );
    }
    // The one-line key sits at the top of the list, in the legend style.
    const key = within(ops).getByTestId('kind-key');
    expect(key).toHaveTextContent('dataflow');
    expect(key).toHaveTextContent('dataset');
    // The grouping survives: DATAFLOWS section, then DATASETS.
    const labels = within(ops).getByText(/Dataflows — upstream/);
    expect(labels).toBeInTheDocument();
    expect(within(ops).getByText(/Datasets \(2\)/)).toBeInTheDocument();
    // And the old uppercase kind CHIPS are gone from rows.
    expect(within(ops).queryByText('DATASET')).not.toBeInTheDocument();
    expect(within(ops).queryByText('DATAFLOW')).not.toBeInTheDocument();
  });

  it('folds the access roster into the sheet and labels not-visible lists', async () => {
    mockGetInsights({ success: true, data: snapshot() });
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });

    // Sales: the roster renders inside the sheet (names; email/role on title).
    const sales = await openSheet('Sales');
    expect(within(sales).getByText('People with access')).toBeInTheDocument();
    expect(within(sales).getByText('Brendan')).toBeInTheDocument();
    expect(within(sales).getByText('Client A')).toBeInTheDocument();
    expect(within(sales).getByTitle('brendan@bc-abc.com · Admin')).toBeInTheDocument();
    expect(within(sales).getByTitle('a@client.com · Viewer')).toBeInTheDocument();
    await closeSheet();

    // Ops: the API hides the list → honest notice, not an empty roster.
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

  it('dead-ends into an error state with a working Try again', async () => {
    mockGetInsights({
      success: false,
      error: { code: 'INSIGHTS_FETCH_FAILED', message: 'raw', userMessage: 'Could not reach Power BI.' },
    });
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Could not reach Power BI.');

    // Retry path: next call succeeds and the page renders (items folded).
    mockGetInsights({ success: true, data: snapshot() });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    });
    expect(screen.getByRole('button', { name: 'Open Sales details' })).toBeInTheDocument();
    const sales = await openSheet('Sales');
    expect(within(sales).getAllByText('Healthy Model').length).toBeGreaterThan(0);
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

describe('InsightsPage — blast radius (DESIGN-CONTRACT stories 2/4/5)', () => {
  /** ws-1 only: a failed root flow feeding one suspect + one clean dataset. */
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

    // The diagram replaces the old DamageCascade text block entirely.
    const diagram = within(sheet).getByTestId('lineage-diagram');
    expect(within(sheet).queryByTestId('damage-cascade')).not.toBeInTheDocument();

    // Nodes land in their columns with the right health colors.
    const node = (id: string) => diagram.querySelector(`[data-node-id="${id}"]`)!;
    expect(node('df-root').getAttribute('data-column')).toBe('dataflow');
    expect(node('df-root').getAttribute('data-health')).toBe('failed');
    expect(node('ds-sus').getAttribute('data-column')).toBe('dataset');
    expect(node('ds-sus').getAttribute('data-health')).toBe('stale');
    expect(node('ds-clean').getAttribute('data-health')).toBe('healthy');
    // ALL bound reports of the workspace's datasets appear — including the
    // healthy-bound one, on the green happy path.
    expect(node('r-1').getAttribute('data-column')).toBe('report');
    expect(node('r-1').getAttribute('data-health')).toBe('stale');
    expect(node('r-2').getAttribute('data-health')).toBe('healthy');
    expect(within(diagram).getByLabelText('Exec Daily')).toBeInTheDocument();
    expect(within(diagram).getByLabelText('Quiet Report')).toBeInTheDocument();

    // Edges: red leaves the failed flow; amber carries the suspect into its
    // report; the clean dataset→report edge stays green.
    const edge = (from: string, to: string) =>
      diagram.querySelector(`[data-testid="lineage-edge"][data-from="${from}"][data-to="${to}"]`)!;
    expect(edge('df-root', 'ds-sus').getAttribute('data-health')).toBe('failed');
    expect(edge('ds-sus', 'r-1').getAttribute('data-health')).toBe('failed'); // contiguous damage
    expect(edge('ds-clean', 'r-2').getAttribute('data-health')).toBe('healthy');

    // Owner v3 #4: the STALE DATA chip is dead. The suspect row carries the
    // plain lowercase amber word in its meta column instead, and never OK.
    expect(within(sheet).queryByText('STALE DATA')).not.toBeInTheDocument();
    const rows = within(sheet).getAllByRole('row');
    const suspectRow = rows.find((r) => r.textContent?.includes('Suspect Model'))!;
    const staleWord = within(suspectRow).getByText('FAILED · upstream') /* one vocabulary (owner v8) */;
    expect(staleWord).toBeInTheDocument();
    expect((staleWord as HTMLElement).style.color).toBe('rgb(229, 72, 77)');
    expect(within(suspectRow).queryByText('OK')).not.toBeInTheDocument();
    // The clean row says nothing — silence is health, no green substitute.
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
    // No report nodes appear — the chain never invents bound reports.
    expect(diagram.querySelectorAll('[data-testid="lineage-node"][data-column="report"]')).toHaveLength(0);
    // The flow and its suspect still draw, red into amber.
    expect(diagram.querySelector('[data-node-id="df-root"]')?.getAttribute('data-health')).toBe('failed');
    expect(diagram.querySelector('[data-node-id="ds-sus"]')?.getAttribute('data-health')).toBe('stale');
  });

  it('renders EVERY dataset node at real scale — the diagram never elides the data (owner v4)', async () => {
    // FALLON-shaped: 20 dormant datasets + 2 suspects behind a failed flow.
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
    expect(datasetNodes).toHaveLength(22); // 2 suspects + 20 dormant — all of them
    expect(diagram.querySelector('[data-node-id="ds-s0"]')).not.toBeNull();
    expect(diagram.querySelector('[data-node-id="ds-d19"]')).not.toBeNull(); // even the dustiest
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
            // Charlie has NO broken flow — but its dataset refreshed BEFORE
            // its upstream flow delivered, so it is a suspect (stale timing).
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
      'Open Bravo details', // broken
      'Open Alpha details', // owner v6: timing never implicates — Charlie is quiet, A-Z
      'Open Charlie details', // quiet
    ]);
    // Owner v3 #4: the STALE DATA chip is dead everywhere — tile faces keep
    // only the amber "N reports may be reading stale data" line (and Charlie
    // has no bound reports here, so its face stays quiet).
    expect(screen.queryByText('STALE DATA')).not.toBeInTheDocument();
  });

  it('renders the solo-client HERO tile with ASSETS/MEMBERS/FRESHNESS and the amber blast line (§A)', async () => {
    mockGetInsights({ success: true, data: cascadeSnapshot() });
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });

    const hero = screen.getByTestId('luce-hero-tile');
    // The three columns.
    expect(within(hero).getByText('Assets')).toBeInTheDocument();
    expect(within(hero).getByText('Members')).toBeInTheDocument();
    expect(within(hero).getByText('Freshness')).toBeInTheDocument();
    // Assets are NAMED on the hero (vs counts on the n=20 tile).
    expect(within(hero).getByText('Root Flow')).toBeInTheDocument();
    expect(within(hero).getByText('Suspect Model')).toBeInTheDocument();
    // Members fold in: count + names.
    expect(within(hero).getByText('2')).toBeInTheDocument();
    expect(within(hero).getByText('Brendan')).toBeInTheDocument();
    // Freshness lines.
    expect(within(hero).getByText('Oldest success:')).toBeInTheDocument();
    expect(within(hero).getByText('Next scheduled:')).toBeInTheDocument();
    // The blast line — only because suspects exist.
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
    // Root Flow is Failed with a prior success → the asset face says the word.
    expect(within(hero).getByText(/FAILED · down/)).toBeInTheDocument();
  });

  it('shows the failure-rate caption on the HERO asset pulse strips (Matt)', async () => {
    mockGetInsights({ success: true, data: cascadeSnapshot() });
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });
    const hero = screen.getByTestId('luce-hero-tile');
    // The quiet hero strips still surface the pattern, not just the dots.
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
    // Two workspaces → n=20 grid (no hero). Alpha's tile carries the count.
    expect(screen.queryByTestId('luce-hero-tile')).not.toBeInTheDocument();
    // Tile-face synopsis (owner revision): the count is a stat among stats —
    // an amber number over an engraved 'stale rpt' label, never a sentence.
    const stat = screen.getByText(/1 stale rpt/); // tile v3 damage line
    expect(stat).toBeInTheDocument();
    expect(stat).toBeInTheDocument();
    // The sentence form is dead on tiles.
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
    // ws-2's member list is null → the honest single-line notice.
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

    // The group sits inside the sheet, after PEOPLE WITH ACCESS, with the
    // metric defined in a faint caption under the label.
    const usage = within(sales).getByTestId('sheet-usage');
    expect(within(usage).getByText('Usage')).toBeInTheDocument();
    expect(
      within(usage).getByText('opens recorded by this app on this computer'),
    ).toBeInTheDocument();
    const sheetHtml = sales.innerHTML;
    expect(sheetHtml.indexOf('People with access')).toBeLessThan(sheetHtml.indexOf('opens recorded by this app'));

    // One flow — only THIS workspace's opens, sorted by openCount desc.
    const rows = within(usage).getAllByTestId('usage-bar-row');
    expect(rows).toHaveLength(2); // the ws-2 record never leaks into Sales
    expect(within(usage).queryByText('Ops Daily')).not.toBeInTheDocument();
    expect(rows[0]).toHaveTextContent('Sales Daily');
    expect(rows[0]).toHaveTextContent('12 opens');
    expect(rows[1]).toHaveTextContent('Sales Weekly');
    expect(rows[1]).toHaveTextContent('6 opens');
    // Name carries the full text as a tooltip (truncation-safe).
    expect(rows[0]).toHaveAttribute('title', 'Sales Daily');

    // Bar math: width ∝ openCount relative to the workspace max (12).
    const bars = within(usage).getAllByTestId('usage-bar');
    expect((bars[0] as HTMLElement).style.width).toBe('100%'); // 12/12
    expect((bars[1] as HTMLElement).style.width).toBe('50%'); // 6/12
    expect((bars[0] as HTMLElement).style.height).toBe('6px');

    // Everything in the catalog was opened → the never-opened line is omitted.
    expect(within(usage).queryByTestId('usage-never-opened')).not.toBeInTheDocument();
    expect(within(usage).queryByText(/^Never opened:/)).not.toBeInTheDocument();

    // Rows stay clickable — they navigate like the old list did.
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
    // 7 never-opened → 5 names + "+2 more"; a single wrapped faint line, not a column.
    const line = within(usage).getByTestId('usage-never-opened');
    expect(line).toHaveTextContent('Never opened: Alpha, Bravo, Charlie, Delta, Echo +2 more');
    expect(line).not.toHaveTextContent('Foxtrot');
    expect(line).not.toHaveTextContent('Golf');
    // The opened item still draws its bar (max = its own count → full width).
    expect(within(usage).getByTestId('usage-bar-row')).toHaveTextContent('Opened One');
    expect((within(usage).getByTestId('usage-bar') as HTMLElement).style.width).toBe('100%');
  });

  it('shows the empty state when nothing was opened in this workspace: one faint line, no bars', async () => {
    mockGetInsights({ success: true, data: snapshot() });
    // Opens exist — but only in ws-2, so the Sales sheet has none.
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
    // The catalog item it has never opened still shows in the footnote.
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
    // No page section, no anchor, no two-column panels, no nav entry.
    expect(document.getElementById('insights-usage')).toBeNull();
    expect(screen.queryByText('Your usage')).not.toBeInTheDocument();
    expect(screen.queryByText('You open most')).not.toBeInTheDocument();
    expect(screen.queryByText('Never opened by you')).not.toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Page sections' });
    expect(within(nav).queryByRole('button', { name: 'Usage' })).not.toBeInTheDocument();
    // The board face shows no usage either — it renders only inside the sheet.
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
    // beforeEach signs in test@example.com — not the owner.
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
    expect(within(hero).getByLabelText(/Data health \d+ percent|Data health unknown/)).toBeInTheDocument(); // caption dead (owner v7)
    // 4 of the 5 mocked refreshables are neither broken nor overdue → 80%.
    expect(within(hero).getByLabelText('Data health 80 percent')).toBeInTheDocument();
    expect(within(hero).getByText('80')).toBeInTheDocument();
    // The full gauge sandwich (D1): backlight deck below, lens above.
    expect(hero.querySelector('.luce-backlight')).not.toBeNull();
    expect(hero.querySelector('.luce-lens')).not.toBeNull();
  });

  it('keeps exactly TWO idle movers: needle + backlight deck — the live-dot died with the dial caption (owner v11)', async () => {
    mockGetInsights({ success: true, data: snapshot() });
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });
    const movers = document.querySelectorAll('.luce-live-dot, .luce-needle, .luce-backlight--live');
    expect(movers).toHaveLength(2);
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
    expect(screen.getByRole('button', { name: 'Open Sales details' })).toBeInTheDocument();
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

  it('closes the sheet with a click anywhere that is not interactive (owner v3 #1)', async () => {
    mockGetInsights({ success: true, data: snapshot() });
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });
    const sales = await openSheet('Sales');
    // A click on plain sheet body (a row's name text) contracts it.
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
    // The error-code block is selectable text — clicking it must not close.
    await act(async () => {
      fireEvent.click(within(sales).getByText('ModelRefreshFailed_CredentialsNotSpecified'));
    });
    expect(screen.getByRole('dialog', { name: 'Sales details' })).toBeInTheDocument();
    // A live text selection parks the click-to-close entirely.
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
    // The ✕ close control still contracts (and Esc/backdrop are covered above).
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
    // The view-transition morph owns the screen during flight; the tile
    // itself stays mounted and fully visible — no manual ghosting, so a
    // grid hole is impossible by construction.
    expect(tile).toBeInTheDocument();
    expect(tile.style.opacity).not.toBe('0');
    await closeSheet();
    expect(tile).toBeInTheDocument();
    expect(tile.style.opacity).not.toBe('0');
  });

  it('falls back to a plain state change when the View Transition engine is missing (jsdom path)', async () => {
    // jsdom has no document.startViewTransition — opening and closing the
    // sheet must work without any transition plumbing.
    expect('startViewTransition' in document).toBe(false);
    mockGetInsights({ success: true, data: snapshot() });
    await act(async () => {
      render(<InsightsPage />, { wrapper: Wrapper });
    });
    const sales = await openSheet('Sales');
    expect(sales).toBeInTheDocument();
    // No morph ran → the glass applies immediately (no deferred settle).
    expect(sales.querySelector('.luce-sheet--settled')).not.toBeNull();
    await closeSheet();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
