import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spinner, Text, Button, Card } from '@fluentui/react-components';
import {
  AppsRegular,
  ArrowSyncRegular,
  PersonRegular,
  CalendarRegular,
  OpenRegular,
} from '@fluentui/react-icons';
import type { App, IPCResponse } from '../../../shared/types';

export const AppsPage: React.FC = () => {
  const navigate = useNavigate();
  const [apps, setApps] = useState<App[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadApps();
  }, []);

  const loadApps = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await window.electronAPI.content.getApps() as IPCResponse<App[]>;

      if (!response.success || !response.data) {
        throw new Error(response.error?.message || 'Failed to load apps');
      }

      setApps(response.data);
    } catch (err) {
      setError(String(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenApp = (app: App) => {
    // Navigate to the app viewer which will display the full app experience
    navigate(`/app/${app.id}`);
  };

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

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Spinner size="large" />
          <Text className="mt-4 text-neutral-foreground-2 block">
            Loading apps...
          </Text>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-status-error/10 border border-status-error rounded-lg p-4">
          <Text className="text-status-error">{error}</Text>
          <Button appearance="subtle" size="small" onClick={loadApps} className="mt-2">
            Try again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold text-neutral-foreground-1">
            Apps
          </h1>
          <Button
            appearance="subtle"
            icon={<ArrowSyncRegular />}
            onClick={loadApps}
          >
            Refresh
          </Button>
        </div>

        {apps.length === 0 ? (
          <div className="bg-neutral-background-2 rounded-lg p-8 text-center">
            <AppsRegular className="text-4xl text-neutral-foreground-3 mx-auto mb-4" />
            <Text className="text-neutral-foreground-3 block">
              No apps found. Apps published to you will appear here.
            </Text>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {apps.map((app) => (
              <Card
                key={app.id}
                className="cursor-pointer hover:shadow-lg transition-shadow"
                onClick={() => handleOpenApp(app)}
              >
                <div className="p-4">
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 bg-gradient-to-br from-brand-primary to-brand-secondary rounded-xl flex items-center justify-center flex-shrink-0">
                      <AppsRegular className="text-2xl text-white" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <Text weight="semibold" size={400} className="text-neutral-foreground-1 block truncate">
                        {app.name}
                      </Text>
                      {app.description && (
                        <Text size={200} className="text-neutral-foreground-3 block mt-1 line-clamp-2">
                          {app.description}
                        </Text>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-neutral-stroke-2">
                    <div className="flex flex-col gap-1 text-neutral-foreground-3">
                      <div className="flex items-center gap-2">
                        <PersonRegular className="text-sm" />
                        <Text size={200}>{app.publishedBy}</Text>
                      </div>
                      <div className="flex items-center gap-2">
                        <CalendarRegular className="text-sm" />
                        <Text size={200}>{formatDate(app.lastUpdate)}</Text>
                      </div>
                    </div>

                    <Button
                      appearance="primary"
                      icon={<OpenRegular />}
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenApp(app);
                      }}
                    >
                      Open
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AppsPage;
