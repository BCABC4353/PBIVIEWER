import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { TitleBar } from './TitleBar';
import { Sidebar } from './Sidebar';
import { StatusBar } from './StatusBar';
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
      {/* Title bar */}
      <TitleBar />

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <Sidebar
          collapsed={settings.sidebarCollapsed}
          onToggleCollapse={() => updateSettings({ sidebarCollapsed: !settings.sidebarCollapsed })}
          activeItem={getActiveItem()}
          onNavigate={handleNavigate}
        />

        {/* Content */}
        <main className="flex-1 overflow-auto bg-neutral-background-1">
          {children}
        </main>
      </div>

      {/* Status bar */}
      <StatusBar />
    </div>
  );
};

export default AppShell;
