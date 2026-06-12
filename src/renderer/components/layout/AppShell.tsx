import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { TitleBar } from './TitleBar';
import { Sidebar } from './Sidebar';
import { useSettingsStore } from '../../stores/settings-store';

interface AppShellProps {
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ children }) => {
  const { settings, updateSettings } = useSettingsStore();
  const navigate = useNavigate();
  const location = useLocation();

  const getActiveItem = (): 'home' | 'workspaces' | 'apps' | 'insights' | 'settings' => {
    if (location.pathname === '/settings') return 'settings';
    if (location.pathname.startsWith('/workspaces')) return 'workspaces';
    if (location.pathname.startsWith('/apps')) return 'apps';
    if (location.pathname.startsWith('/insights')) return 'insights';
    return 'home';
  };

  const handleNavigate = (item: 'home' | 'workspaces' | 'apps' | 'insights' | 'settings') => {
    switch (item) {
      case 'home':
        navigate('/');
        break;
      case 'workspaces':
        navigate('/workspaces');
        break;
      case 'apps':
        navigate('/apps');
        break;
      case 'insights':
        navigate('/insights');
        break;
      case 'settings':
        navigate('/settings');
        break;
    }
  };

  return (
    <div className="h-screen flex flex-col bg-neutral-background-2">
      {}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 focus:px-4 focus:py-2 focus:bg-neutral-background-1 focus:text-neutral-foreground-1 focus:rounded focus:shadow-fluent-4 focus:outline-none focus:ring-2 focus:ring-accent-primary"
      >
        Skip to main content
      </a>

      {}
      <header role="banner">
        <TitleBar />
      </header>

      {}
      <div className="flex-1 flex overflow-hidden">
        {}
        <Sidebar
          collapsed={settings.sidebarCollapsed}
          onToggleCollapse={() =>
            updateSettings({ sidebarCollapsed: !settings.sidebarCollapsed })
          }
          activeItem={getActiveItem()}
          onNavigate={handleNavigate}
        />

        {}
        <main
          id="main-content"
          aria-label="Main content"
          tabIndex={-1}
          className="flex-1 overflow-auto bg-neutral-background-1 outline-none"
        >
          {children}
        </main>
      </div>

      {}
      <footer role="contentinfo" className="sr-only">
        Power BI Viewer
      </footer>
    </div>
  );
};

export default AppShell;
