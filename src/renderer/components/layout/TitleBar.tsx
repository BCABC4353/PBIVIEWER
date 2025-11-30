import React, { useEffect } from 'react';
import {
  Avatar,
  Menu,
  MenuTrigger,
  MenuPopover,
  MenuList,
  MenuItem,
  MenuDivider,
  Text,
  Button,
} from '@fluentui/react-components';
import {
  SearchRegular,
  SignOutRegular,
  PersonRegular,
} from '@fluentui/react-icons';
import { useAuthStore } from '../../stores/auth-store';
import { useSearchStore } from '../../stores/search-store';
import logoIcon from '../../assets/logo.png';

export const TitleBar: React.FC = () => {
  const { user, logout } = useAuthStore();
  const { openSearch } = useSearchStore();

  const handleLogout = async () => {
    await logout();
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // Handle Ctrl+K keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        openSearch();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [openSearch]);

  return (
    <div className="h-10 bg-neutral-background-3 flex items-center px-4 border-b border-neutral-stroke-2 select-none" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      {/* App title - draggable */}
      <div className="flex items-center gap-2 mr-4">
        <img
          src={logoIcon}
          alt="Logo"
          className="w-6 h-6 object-contain"
        />
        <Text weight="semibold" className="text-neutral-foreground-1">
          Power BI Viewer
        </Text>
      </div>

      {/* Search bar - only the button itself is no-drag */}
      <div className="flex-1 flex justify-center">
        <button
          onClick={openSearch}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          className="w-full max-w-md flex items-center gap-2 px-3 py-1.5 bg-neutral-background-1 border border-neutral-stroke-2 rounded-md text-neutral-foreground-3 text-sm hover:bg-neutral-background-2 transition-colors"
        >
          <SearchRegular />
          <span className="flex-1 text-left">Search reports and dashboards...</span>
          <kbd className="px-1.5 py-0.5 bg-neutral-background-3 border border-neutral-stroke-2 rounded text-xs">
            Ctrl+K
          </kbd>
        </button>
      </div>

      {/* Right side actions - only the button itself is no-drag */}
      <div className="flex items-center gap-2 ml-4">
        {/* User menu */}
        {user && (
          <Menu>
            <MenuTrigger disableButtonEnhancement>
              <Button appearance="subtle" className="p-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
                <Avatar
                  name={user.displayName}
                  initials={getInitials(user.displayName)}
                  size={28}
                  color="brand"
                />
              </Button>
            </MenuTrigger>
            <MenuPopover>
              <MenuList>
                <MenuItem icon={<PersonRegular />}>
                  <div className="flex flex-col">
                    <Text weight="semibold">{user.displayName}</Text>
                    <Text size={200} className="text-neutral-foreground-2">
                      {user.email}
                    </Text>
                  </div>
                </MenuItem>
                <MenuDivider />
                <MenuItem icon={<SignOutRegular />} onClick={handleLogout}>
                  Sign out
                </MenuItem>
              </MenuList>
            </MenuPopover>
          </Menu>
        )}
      </div>
    </div>
  );
};

export default TitleBar;
