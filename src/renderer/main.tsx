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

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

window.addEventListener('unhandledrejection', (e) => {
  console.error('[renderer:unhandledRejection]', e.reason);
});
window.addEventListener('error', (e) => {
  console.error('[renderer:error]', e.message, e.error?.stack);
});

const ThemedApp: React.FC = () => {
  const { settings, loadSettings } = useSettingsStore();
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    void loadSettings().then(() => {
      useSettingsStore.setState((s) => ({
        settings: { ...s.settings, sidebarCollapsed: true },
      }));
    });

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

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

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
