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

  const getActiveItem = (): 'home' | 'workspaces' | 'apps' | 'settings' => {
    if (location.pathname === '/settings') return 'settings';
    if (location.pathname.startsWith('/workspaces')) return 'workspaces';
    if (location.pathname.startsWith('/apps')) return 'apps';
    return 'home';
  };

  const handleNavigate = (item: 'home' | 'workspaces' | 'apps' | 'settings') => {
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
      case 'settings':
        navigate('/settings');
        break;
    }
  };

  return (
    <div className="h-screen flex flex-col bg-neutral-background-2">
      {/* Skip link — visually hidden until focused */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 focus:px-4 focus:py-2 focus:bg-neutral-background-1 focus:text-neutral-foreground-1 focus:rounded focus:shadow-fluent-4 focus:outline-none focus:ring-2 focus:ring-accent-primary"
      >
        Skip to main content
      </a>

      {/* Banner landmark wraps the application chrome at the top */}
      <header role="banner">
        <TitleBar />
      </header>

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Navigation landmark wraps the sidebar */}
        <nav aria-label="Application navigation">
          <Sidebar
            collapsed={settings.sidebarCollapsed}
            onToggleCollapse={() =>
              updateSettings({ sidebarCollapsed: !settings.sidebarCollapsed })
            }
            activeItem={getActiveItem()}
            onNavigate={handleNavigate}
          />
        </nav>

        {/* Named main landmark — id used by skip link */}
        <main
          id="main-content"
          aria-label="Main content"
          tabIndex={-1}
          className="flex-1 overflow-auto bg-neutral-background-1 outline-none"
        >
          {children}
        </main>
      </div>

      {/* Contentinfo landmark — application footer / status area */}
      <footer role="contentinfo" className="sr-only">
        Power BI Viewer
      </footer>
    </div>
  );
};

export default AppShell;
