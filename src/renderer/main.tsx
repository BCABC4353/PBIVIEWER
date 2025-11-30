import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { FluentProvider, webLightTheme, webDarkTheme } from '@fluentui/react-components';
import App from './App';
import './styles/globals.css';
import { useSettingsStore } from './stores/settings-store';
import type { AppSettings, IPCResponse } from '../shared/types';

// Type declaration for electron API
declare global {
  interface Window {
    electronAPI: {
      auth: {
        login: () => Promise<unknown>;
        logout: () => Promise<unknown>;
        getUser: () => Promise<unknown>;
        getAccessToken: () => Promise<unknown>;
        isAuthenticated: () => Promise<unknown>;
      };
      content: {
        getWorkspaces: () => Promise<unknown>;
        getReports: (workspaceId: string) => Promise<unknown>;
        getDashboards: (workspaceId: string) => Promise<unknown>;
        getApps: () => Promise<unknown>;
        getApp: (appId: string) => Promise<unknown>;
        getAppReports: (appId: string) => Promise<unknown>;
        getAppDashboards: (appId: string) => Promise<unknown>;
        getEmbedToken: (reportId: string, workspaceId: string) => Promise<unknown>;
        getDatasetRefreshInfo: (datasetId: string) => Promise<unknown>;
        getRecent: () => Promise<unknown>;
      };
      cache: {
        getThumbnail: (itemId: string) => Promise<unknown>;
        getOfflineContent: () => Promise<unknown>;
        saveOfflineContent: (items: unknown[]) => Promise<unknown>;
        clearCache: () => Promise<unknown>;
      };
      window: {
        minimize: () => Promise<void>;
        maximize: () => Promise<void>;
        close: () => Promise<void>;
        isMaximized: () => Promise<boolean>;
        setTitleBarOverlay: (options: { color: string; symbolColor: string }) => Promise<void>;
      };
      settings: {
        get: () => Promise<IPCResponse<AppSettings>>;
        update: (updates: Partial<AppSettings>) => Promise<IPCResponse<AppSettings>>;
        reset: () => Promise<IPCResponse<AppSettings>>;
      };
      usage: {
        recordOpen: (item: {
          id: string;
          name: string;
          type: 'report' | 'dashboard';
          workspaceId: string;
          workspaceName: string;
        }) => Promise<unknown>;
        getRecent: () => Promise<unknown>;
        getFrequent: () => Promise<unknown>;
        clear: () => Promise<unknown>;
      };
      app: {
        getPartitionName: () => Promise<string | null>;
        getVersion: () => Promise<string>;
      };
    };
  }
}

// Theme provider component that responds to settings changes
const ThemedApp: React.FC = () => {
  const { settings, loadSettings } = useSettingsStore();
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    // Load initial settings from the store
    loadSettings();

    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemDark(mediaQuery.matches);

    const handleChange = (e: MediaQueryListEvent) => {
      setSystemDark(e.matches);
    };
    mediaQuery.addEventListener('change', handleChange);

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, [loadSettings]);

  const theme = settings.theme;
  const isDark = theme === 'dark' || (theme === 'system' && systemDark);
  const fluentTheme = isDark ? webDarkTheme : webLightTheme;

  // Update title bar overlay colors when theme changes
  useEffect(() => {
    const updateTitleBarOverlay = async () => {
      try {
        await window.electronAPI.window.setTitleBarOverlay({
          color: isDark ? '#1f1f1f' : '#f5f5f5',
          symbolColor: isDark ? '#ffffff' : '#242424',
        });
      } catch (error) {
        // Ignore errors (e.g., on non-Windows platforms)
      }
    };
    updateTitleBarOverlay();
  }, [isDark]);

  return (
    <FluentProvider theme={fluentTheme}>
      <App />
    </FluentProvider>
  );
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ThemedApp />
  </React.StrictMode>
);
