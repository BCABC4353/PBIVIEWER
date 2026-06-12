import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AppViewer } from './AppViewer';
import { useAuthStore } from '../../stores/auth-store';
import type { Report } from '../../../shared/types';

const APP_ID = '11111111-1111-1111-1111-111111111111';

function makeReport(id: string, datasetId: string): Report {
  return {
    id,
    name: `Report ${id}`,
    workspaceId: 'ws-1',
    embedUrl: '',
    datasetId,
    reportType: 'PowerBIReport',
  };
}

async function renderAppViewer() {
  let view!: ReturnType<typeof render>;
  await act(async () => {
    view = render(
      <MemoryRouter initialEntries={[`/app/${APP_ID}`]}>
        <Routes>
          <Route path="/app/:appId" element={<AppViewer />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  return view;
}

describe('AppViewer smoke', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: { id: 'account-1', displayName: 'Test User', email: 'test@example.com' },
      isAuthenticated: true,
      isLoading: false,
      error: null,
    });
    vi.mocked(window.electronAPI.content.getApp).mockResolvedValue({
      success: true,
      data: {
        id: APP_ID,
        name: 'Fleet Operations',
        publishedBy: 'BC-ABC',
        lastUpdate: '2026-06-01T00:00:00Z',
      },
    });
    vi.mocked(window.electronAPI.app.getAppWebviewConfig).mockResolvedValue({
      partition: 'persist:powerbi-apps',
      userAgent: 'test-agent',
    });
    vi.mocked(window.electronAPI.content.getAppReports).mockResolvedValue({
      success: true,
      data: [],
    });
    vi.mocked(window.electronAPI.content.getDataFreshness).mockResolvedValue({
      success: true,
      data: {
        datasetRefreshTime: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        dataflowRefreshTime: null,
        datasetCount: 1,
      },
    });
  });

  it('renders without crashing and shows the toolbar with the app name', async () => {
    const { container } = await renderAppViewer();

    await waitFor(() => {
      const toolbar = container.querySelector('[data-viewer-toolbar]');
      expect(toolbar).not.toBeNull();
      expect(toolbar?.textContent).toContain('Fleet Operations');
    });
  });

  it('renders the webview with the configured partition after the config resolves', async () => {
    const { container } = await renderAppViewer();

    await waitFor(() => {
      expect(container.querySelector('webview')).not.toBeNull();
    });
    const webview = container.querySelector('webview')!;
    expect(webview.getAttribute('partition')).toBe('persist:powerbi-apps');
    expect(webview.getAttribute('useragent')).toBe('test-agent');
    expect(webview.getAttribute('src')).toBe(
      `https://app.powerbi.com/groups/me/apps/${APP_ID}`,
    );
  });

  it('presents the freshness chip as "Updated" for a single-dataset app', async () => {
    vi.mocked(window.electronAPI.content.getAppReports).mockResolvedValue({
      success: true,
      data: [makeReport('r-1', 'ds-1')],
    });

    const { container } = await renderAppViewer();

    await waitFor(() => {
      const chip = container.querySelector('[data-freshness-chip]');
      expect(chip?.textContent).toMatch(/Updated \d+ min ago/);
      expect(chip?.getAttribute('title')).toMatch(/Data refreshed: .*2026/);
    });
    expect(screen.queryByText(/Oldest data/)).toBeNull();
  });

  it('presents the freshness chip as "Oldest data" when the aggregate spans multiple datasets', async () => {
    vi.mocked(window.electronAPI.content.getAppReports).mockResolvedValue({
      success: true,
      data: [makeReport('r-1', 'ds-1'), makeReport('r-2', 'ds-2')],
    });

    const { container } = await renderAppViewer();

    await waitFor(() => {
      const chip = container.querySelector('[data-freshness-chip]');
      expect(chip?.textContent).toMatch(/Oldest data \d+ min ago/);
      expect(chip?.getAttribute('title')).toMatch(/Oldest data: .*2026/);
    });
    expect(window.electronAPI.content.getDataFreshness).toHaveBeenCalledWith('ws-1', [
      { datasetId: 'ds-1', workspaceId: 'ws-1' },
      { datasetId: 'ds-2', workspaceId: 'ws-1' },
    ]);
  });
});
