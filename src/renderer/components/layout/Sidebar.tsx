import React from 'react';
import {
  Button,
  Tooltip,
} from '@fluentui/react-components';
import {
  HomeRegular,
  HomeFilled,
  FolderRegular,
  FolderFilled,
  AppsRegular,
  AppsFilled,
  SettingsRegular,
  SettingsFilled,
  NavigationRegular,
} from '@fluentui/react-icons';

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  activeItem: 'home' | 'workspaces' | 'apps' | 'settings';
  onNavigate: (item: 'home' | 'workspaces' | 'apps' | 'settings') => void;
}

interface NavItemProps {
  icon: React.ReactElement;
  activeIcon: React.ReactElement;
  label: string;
  active: boolean;
  collapsed: boolean;
  onClick: () => void;
}

const NavItem: React.FC<NavItemProps> = ({
  icon,
  activeIcon,
  label,
  active,
  collapsed,
  onClick,
}) => {
  const button = (
    <Button
      appearance="subtle"
      className={`w-full justify-start ${
        active
          ? 'bg-neutral-background-4 text-accent-primary'
          : 'text-neutral-foreground-1 hover:bg-neutral-background-3'
      }`}
      icon={active ? activeIcon : icon}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
    >
      {collapsed ? null : <span className="ml-2">{label}</span>}
    </Button>
  );

  if (collapsed) {
    return (
      <Tooltip content={label} relationship="label" positioning="after">
        {button}
      </Tooltip>
    );
  }

  return button;
};

export const Sidebar: React.FC<SidebarProps> = ({
  collapsed,
  onToggleCollapse,
  activeItem,
  onNavigate,
}) => {
  return (
    <nav
      aria-label="Main navigation"
      className={`h-full bg-neutral-background-2 border-r border-neutral-stroke-2 flex flex-col transition-all duration-200 ${
        collapsed ? 'w-12' : 'w-60'
      }`}
    >
      {/* Toggle button */}
      <div className="p-2">
        <Tooltip
          content={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          relationship="label"
          positioning="after"
        >
          <Button
            appearance="subtle"
            icon={<NavigationRegular />}
            onClick={onToggleCollapse}
            className="w-full justify-start"
          />
        </Tooltip>
      </div>

      {/* Navigation items */}
      <div className="flex-1 p-2 space-y-1">
        <NavItem
          icon={<HomeRegular />}
          activeIcon={<HomeFilled />}
          label="Home"
          active={activeItem === 'home'}
          collapsed={collapsed}
          onClick={() => onNavigate('home')}
        />
        <NavItem
          icon={<FolderRegular />}
          activeIcon={<FolderFilled />}
          label="Workspaces"
          active={activeItem === 'workspaces'}
          collapsed={collapsed}
          onClick={() => onNavigate('workspaces')}
        />
        <NavItem
          icon={<AppsRegular />}
          activeIcon={<AppsFilled />}
          label="Apps"
          active={activeItem === 'apps'}
          collapsed={collapsed}
          onClick={() => onNavigate('apps')}
        />
      </div>

      {/* Bottom section */}
      <div className="p-2 border-t border-neutral-stroke-2">
        <NavItem
          icon={<SettingsRegular />}
          activeIcon={<SettingsFilled />}
          label="Settings"
          active={activeItem === 'settings'}
          collapsed={collapsed}
          onClick={() => onNavigate('settings')}
        />
      </div>
    </nav>
  );
};

export default Sidebar;
