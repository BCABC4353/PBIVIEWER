import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Text, Badge } from '@fluentui/react-components';
import {
  AppsRegular,
  PersonRegular,
  CalendarRegular,
} from '@fluentui/react-icons';
import type { App } from '../../../shared/types';

interface AppsListProps {
  apps: App[];
}

export const AppsList: React.FC<AppsListProps> = ({ apps }) => {
  const navigate = useNavigate();

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateString;
    }
  };

  const handleAppClick = (app: App) => {
    // Open the app directly in the app viewer
    navigate(`/app/${app.id}`);
  };

  if (apps.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-neutral-foreground-3">
        No apps to display
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {apps.map((app) => (
        <Card
          key={app.id}
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => handleAppClick(app)}
        >
          <div className="p-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-brand-primary to-brand-secondary rounded-lg flex items-center justify-center flex-shrink-0">
                <AppsRegular className="text-xl text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <Text weight="semibold" className="text-neutral-foreground-1 block truncate">
                  {app.name}
                </Text>
                {app.description && (
                  <Text size={200} className="text-neutral-foreground-3 block truncate mt-1">
                    {app.description}
                  </Text>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between mt-4 pt-3 border-t border-neutral-stroke-2">
              <div className="flex items-center gap-2 text-neutral-foreground-3">
                <PersonRegular className="text-sm" />
                <Text size={200}>{app.publishedBy}</Text>
              </div>
              <div className="flex items-center gap-2 text-neutral-foreground-3">
                <CalendarRegular className="text-sm" />
                <Text size={200}>{formatDate(app.lastUpdate)}</Text>
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
};

export default AppsList;
