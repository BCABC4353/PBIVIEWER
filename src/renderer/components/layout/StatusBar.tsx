import React from 'react';
import { Text } from '@fluentui/react-components';
import { useAuthStore } from '../../stores/auth-store';

export const StatusBar: React.FC = () => {
  const { user } = useAuthStore();

  return (
    <div className="h-6 bg-neutral-background-3 border-t border-neutral-stroke-2 flex items-center px-4 text-xs">
      {/* Left: spacer */}
      <div className="flex-1" />

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
