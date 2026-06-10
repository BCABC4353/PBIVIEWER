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
  PanelLeftContractRegular,
  PanelLeftExpandRegular,
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
    /* Brand-orange 3px left border indicator for active item.
       The relative + before: pseudo-element approach keeps layout stable
       while painting the indicator outside the button's padding box. */
    <div className="relative">
      {active && (
        <span
          aria-hidden="true"
          className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r bg-accent-primary"
        />
      )}
      <Button
        appearance="subtle"
        /* aria-label on icon-only (collapsed) buttons */
        aria-label={collapsed ? label : undefined}
        className={`w-full justify-start pl-3 ${
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
    </div>
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
  /* Different icon when expanded vs collapsed */
  const toggleIcon = collapsed ? <PanelLeftExpandRegular /> : <PanelLeftContractRegular />;
  const toggleLabel = collapsed ? 'Expand sidebar' : 'Collapse sidebar';

  return (
    <nav
      aria-label="Main navigation"
      className={`h-full bg-neutral-background-2 border-r border-neutral-stroke-2 flex flex-col transition-all duration-200 ${
        collapsed ? 'w-12' : 'w-60'
      }`}
    >
      {/* Toggle button — explicit aria-label */}
      <div className="p-2">
        <Tooltip
          content={toggleLabel}
          relationship="label"
          positioning="after"
        >
          <Button
            appearance="subtle"
            aria-label={toggleLabel}
            icon={toggleIcon}
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
