import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { FluentProvider, webLightTheme, webDarkTheme } from '@fluentui/react-components';
import App from './App';
import './styles/globals.css';
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
        getRecent: () => Promise<unknown>;
        getFavorites: () => Promise<unknown>;
        addFavorite: (itemId: string, itemType: string) => Promise<unknown>;
        removeFavorite: (itemId: string) => Promise<unknown>;
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
    };
  }
}

// Theme provider component that responds to settings changes
const ThemedApp: React.FC = () => {
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('light');
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    // Load initial settings
    const loadSettings = async () => {
      try {
        const response = await window.electronAPI.settings.get();
        if (response.success && response.data) {
          setTheme(response.data.theme);
        }
      } catch (error) {
        console.error('Failed to load settings:', error);
      }
    };
    loadSettings();

    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemDark(mediaQuery.matches);

    const handleChange = (e: MediaQueryListEvent) => {
      setSystemDark(e.matches);
    };
    mediaQuery.addEventListener('change', handleChange);

    // Poll for settings changes (simple approach for theme updates)
    const interval = setInterval(async () => {
      try {
        const response = await window.electronAPI.settings.get();
        if (response.success && response.data) {
          setTheme(response.data.theme);
        }
      } catch {
        // Ignore errors during polling
      }
    }, 1000);

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
      clearInterval(interval);
    };
  }, []);

  const isDark = theme === 'dark' || (theme === 'system' && systemDark);
  const fluentTheme = isDark ? webDarkTheme : webLightTheme;

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
