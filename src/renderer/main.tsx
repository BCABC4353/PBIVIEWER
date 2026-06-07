import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { FluentProvider } from '@fluentui/react-components';
import { brandLightTheme, brandDarkTheme } from './theme/brandRamp';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles/globals.css';
import { useSettingsStore } from './stores/settings-store';
import { TITLE_BAR_COLORS } from '../shared/constants';
import type { ElectronAPI } from '../shared/ipc-types';

// Type declaration for the preload-injected API — references the shared typed interface.
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

// Global unhandled rejection handler for the renderer process
window.addEventListener('unhandledrejection', (e) => {
  console.error('[renderer:unhandledRejection]', e.reason);
});
window.addEventListener('error', (e) => {
  console.error('[renderer:error]', e.message, e.error?.stack);
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
  const fluentTheme = isDark ? brandDarkTheme : brandLightTheme;

  // Toggle dark class on root element for Tailwind dark: classes
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  // UX-B1: Update title bar overlay colors when theme changes.
  // Uses optional chaining so this compiles before the preload method is added by Group 6.
  useEffect(() => {
    const colors = TITLE_BAR_COLORS[isDark ? 'dark' : 'light'];
    window.electronAPI?.window?.setTitleBarOverlay?.({
      color: colors.background,
      symbolColor: colors.symbol,
    });
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
