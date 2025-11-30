import React, { useEffect, useState } from 'react';
import { Text } from '@fluentui/react-components';
import { CloudCheckmarkRegular, CloudDismissRegular } from '@fluentui/react-icons';
import { useAuthStore } from '../../stores/auth-store';
import type { IPCResponse } from '../../../shared/types';

interface StatusBarProps {
  isOnline?: boolean;
  lastSyncTime?: Date;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  isOnline: propIsOnline,
  lastSyncTime: propLastSyncTime,
}) => {
  const { user } = useAuthStore();
  const [isOnline, setIsOnline] = useState(propIsOnline ?? navigator.onLine);
  const [lastSyncTime, setLastSyncTime] = useState<Date | undefined>(propLastSyncTime);

  // Listen for online/offline events
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Fetch last sync time from cache
  useEffect(() => {
    const fetchLastSync = async () => {
      try {
        const response = await window.electronAPI.cache.getLastSync() as IPCResponse<number>;
        if (response.success && response.data && response.data > 0) {
          setLastSyncTime(new Date(response.data));
        }
      } catch {
        // Ignore errors
      }
    };

    fetchLastSync();

    // Refresh every minute
    const interval = setInterval(fetchLastSync, 60000);
    return () => clearInterval(interval);
  }, []);

  const formatSyncTime = (date: Date | undefined) => {
    if (!date) return 'Never synced';

    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

    return date.toLocaleDateString();
  };

  return (
    <div className="h-6 bg-neutral-background-3 border-t border-neutral-stroke-2 flex items-center px-4 text-xs">
      {/* Left: Connection status */}
      <div className="flex items-center gap-2">
        {isOnline ? (
          <>
            <CloudCheckmarkRegular className="text-status-success" />
            <Text size={100} className="text-neutral-foreground-2">
              Connected
            </Text>
          </>
        ) : (
          <>
            <CloudDismissRegular className="text-status-warning" />
            <Text size={100} className="text-neutral-foreground-2">
              Offline
            </Text>
          </>
        )}
      </div>

      {/* Center: Sync status */}
      <div className="flex-1 flex justify-center">
        <Text size={100} className="text-neutral-foreground-3">
          Synced {formatSyncTime(lastSyncTime)}
        </Text>
      </div>

      {/* Right: User info */}
      <div className="flex items-center gap-2">
        {user && (
          <Text size={100} className="text-neutral-foreground-2">
            {user.email}
          </Text>
        )}
      </div>
    </div>
  );
};

export default StatusBar;
