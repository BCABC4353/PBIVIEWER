import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { FluentProvider, webLightTheme, webDarkTheme } from '@fluentui/react-components';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles/globals.css';
import { useSettingsStore } from './stores/settings-store';
import type { ElectronAPI } from '../shared/ipc-types';

// Type declaration for the preload-injected API — references the shared typed interface.
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

// Global unhandled rejection handler for the renderer process
window.addEventListener('unhandledrejection', (event) => {
  console.error('[Renderer] Unhandled promise rejection:', event.reason);
});

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

  // Toggle dark class on root element for Tailwind dark: classes
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

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
    <ErrorBoundary>
      <ThemedApp />
    </ErrorBoundary>
  </React.StrictMode>
);
