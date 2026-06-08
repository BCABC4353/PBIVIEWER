import '@testing-library/jest-dom/vitest';
import { beforeEach, vi } from 'vitest';

import type { ElectronAPI } from '../shared/ipc-types';
import type { AppSettings, AuthResult, TokenResult, UserInfo } from '../shared/types';

// ---------------------------------------------------------------------------
// Default ElectronAPI mock
// ---------------------------------------------------------------------------
// Every method on the ElectronAPI surface is stubbed with vi.fn() so that
// component tests never accidentally hit `undefined` on `window.electronAPI`.
// Tests can override individual methods via:
//   vi.mocked(window.electronAPI.auth.getUser).mockResolvedValueOnce(...)
//
// Anything returning IPCResponse<T> resolves to { success: true, data: <empty> }
// by default — sensible for "happy path" rendering. Per-test overrides handle
// failure paths.

const defaultUser: UserInfo | null = null;

const defaultAuthResult: AuthResult = {
  success: true,
  user: { id: '', displayName: '', email: '' },
  reusedPreviousAccount: false,
};

const defaultToken: TokenResult = {
  accessToken: '',
  expiresOn: null,
};

const defaultSettings: AppSettings = {
  theme: 'system',
  sidebarCollapsed: false,
  slideshowInterval: 30,
  slideshowMode: 'pages',
  autoStartSlideshow: false,
  autoRefreshEnabled: false,
  autoRefreshInterval: 15,
  autoStartMode: 'off',
  usageClearOnLogout: 'never',
};

function createElectronAPIMock(): ElectronAPI {
  return {
    auth: {
      login: vi.fn().mockResolvedValue({ success: true, data: defaultAuthResult }),
      logout: vi.fn().mockResolvedValue({ success: true, data: undefined }),
      getUser: vi.fn().mockResolvedValue({ success: true, data: defaultUser }),
      getAccessToken: vi.fn().mockResolvedValue({ success: true, data: defaultToken }),
      isAuthenticated: vi.fn().mockResolvedValue({ success: true, data: false }),
      validateToken: vi.fn().mockResolvedValue({ success: true, data: false }),
      // PROD-B1: account switcher — same return shape as login().
      switchAccount: vi.fn().mockResolvedValue({ success: true, data: defaultAuthResult }),
    },

    content: {
      getWorkspaces: vi.fn().mockResolvedValue({ success: true, data: [] }),
      getReports: vi.fn().mockResolvedValue({ success: true, data: [] }),
      getDashboards: vi.fn().mockResolvedValue({ success: true, data: [] }),
      getDashboard: vi.fn().mockResolvedValue({
        success: true,
        data: { id: '', name: '', workspaceId: '', embedUrl: '', isReadOnly: false },
      }),
      getApps: vi.fn().mockResolvedValue({ success: true, data: [] }),
      getApp: vi.fn().mockResolvedValue({
        success: true,
        data: { id: '', name: '', publishedBy: '', lastUpdate: '' },
      }),
      getAppReports: vi.fn().mockResolvedValue({ success: true, data: [] }),
      getAppDashboards: vi.fn().mockResolvedValue({ success: true, data: [] }),
      getEmbedToken: vi.fn().mockResolvedValue({
        success: true,
        data: { token: '', tokenId: '', expiration: '' },
      }),
      exportReportToPdf: vi.fn().mockResolvedValue({ success: true, data: { path: '' } }),
      getDatasetRefreshInfo: vi.fn().mockResolvedValue({
        success: true,
        data: {},
      }),
      getDashboardDataFreshness: vi.fn().mockResolvedValue({
        success: true,
        data: {},
      }),
      getAllItems: vi.fn().mockResolvedValue({
        success: true,
        data: {
          workspaces: [],
          reports: [],
          dashboards: [],
          partialFailure: false,
          failedWorkspaces: [],
        },
      }),
    },

    window: {
      minimize: vi.fn().mockResolvedValue(undefined),
      maximize: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      isMaximized: vi.fn().mockResolvedValue(false),
      setTitleBarOverlay: vi.fn().mockResolvedValue(undefined),
    },

    settings: {
      get: vi.fn().mockResolvedValue({ success: true, data: defaultSettings }),
      update: vi.fn().mockResolvedValue({ success: true, data: defaultSettings }),
      reset: vi.fn().mockResolvedValue({ success: true, data: defaultSettings }),
    },

    usage: {
      recordOpen: vi.fn().mockResolvedValue({ success: true, data: undefined }),
      getRecent: vi.fn().mockResolvedValue({ success: true, data: [] }),
      getFrequent: vi.fn().mockResolvedValue({ success: true, data: [] }),
      clear: vi.fn().mockResolvedValue({ success: true, data: undefined }),
      remove: vi.fn().mockResolvedValue({ success: true, data: undefined }),
    },

    export: {
      choosePdfPath: vi.fn().mockResolvedValue({ success: true, data: { path: '' } }),
      currentViewToPdf: vi.fn().mockResolvedValue({ success: true, data: { path: '' } }),
    },

    app: {
      getAppWebviewConfig: vi.fn().mockResolvedValue({ partition: null, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36' }),
      getVersion: vi.fn().mockResolvedValue('0.0.0-test'),
      checkForUpdates: vi
        .fn()
        .mockResolvedValue({ success: true, data: { currentVersion: '0.0.0-test', releasesUrl: null } }),
    },

    log: {
      openFolder: vi.fn().mockResolvedValue({ success: true, data: undefined }),
    },

    // PROD-S1: kiosk power-management mock.
    kiosk: {
      preventDisplaySleep: vi.fn().mockResolvedValue({ success: true, data: true }),
      allowDisplaySleep: vi.fn().mockResolvedValue({ success: true, data: false }),
    },
  } as ElectronAPI;
}

// ---------------------------------------------------------------------------
// window.matchMedia stub
// ---------------------------------------------------------------------------
// jsdom does not implement matchMedia. Some Fluent UI components query it on
// mount (e.g. theme detection), so install a minimal stub.
function installMatchMediaStub(): void {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(), // deprecated, kept for compatibility
      removeListener: vi.fn(), // deprecated, kept for compatibility
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

// ---------------------------------------------------------------------------
// Global setup — runs before every test
// ---------------------------------------------------------------------------
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  installMatchMediaStub();
  Object.defineProperty(window, 'electronAPI', {
    writable: true,
    configurable: true,
    value: createElectronAPIMock(),
  });
});
